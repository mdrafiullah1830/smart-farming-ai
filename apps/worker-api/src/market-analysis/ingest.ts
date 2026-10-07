import type { Env } from '../types.ts';
import type {
  AggregatedPrice,
  Commodity,
  FreshnessConfig,
  MarketSource,
  NormalizedPriceRecord,
  ParsedPriceData,
  ParserType,
  SourceLog,
  SourceType,
} from './types.ts';
import { DEFAULT_FRESHNESS, recordAgeHours } from './freshness.ts';
import { matchCommodity, normalizeKey, resolvePrices, resolveUnit } from './normalize.ts';
import { parsePayload, type ParserConfig } from './parsers.ts';
import {
  completenessScore,
  locationScore,
  parsingScore,
  recordConfidence,
  verificationFor,
} from './trust.ts';
import { aggregateGroup, groupRecords } from './aggregate.ts';

export const PARSER_VERSION = '1.0';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; SmartFarmingBD/1.0)';
/** Sources touched by a single refresh, so one request cannot fan out. */
export const MAX_SOURCES_PER_REFRESH = 3;
const MAX_UNMATCHED_REPORTED = 20;
/** Raw payload kept per row for debugging; larger rows are truncated. */
const MAX_RAW_JSON_BYTES = 2_000;

function jsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function jsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface CommodityRow {
  id: string;
  name_en: string;
  name_bn: string;
  aliases_json: string;
  category: string;
  default_unit: string;
  valid_units_json: string;
  season: string | null;
  is_active: number;
}

export function rowToCommodity(row: CommodityRow): Commodity {
  const validUnits = jsonArray(row.valid_units_json);
  return {
    id: row.id,
    nameEn: row.name_en,
    nameBn: row.name_bn,
    aliases: jsonArray(row.aliases_json),
    category: row.category,
    defaultUnit: row.default_unit,
    // A catalog row with no parseable unit list would accept any unit, which
    // is how a maund ends up filed as a kilogram. Fall back to the default
    // only, so the constraint still means something.
    validUnits: validUnits.length ? validUnits : [row.default_unit],
    season: row.season ?? undefined,
    isActive: row.is_active === 1,
  };
}

export async function loadCommodities(db: D1Database): Promise<Commodity[]> {
  const result = await db.prepare(
    `SELECT id, name_en, name_bn, aliases_json, category, default_unit,
            valid_units_json, season, is_active
     FROM market_commodities WHERE is_active = 1 ORDER BY id`,
  ).all<CommodityRow>();
  return result.results.map(rowToCommodity);
}

interface SourceRow {
  id: string;
  name_en: string;
  name_bn: string;
  source_type: string;
  base_url: string;
  parser_type: string;
  trust_tier: number;
  update_frequency_hours: number;
  enabled: number;
  region: string | null;
  supported_categories_json: string;
  parser_config_json: string;
  rate_limit_rps: number;
  timeout_ms: number;
  user_agent: string | null;
  headers_json: string;
}

export function rowToSource(row: SourceRow): MarketSource {
  const tiers = [1, 2, 3, 4];
  return {
    id: row.id,
    nameEn: row.name_en,
    nameBn: row.name_bn,
    sourceType: row.source_type as SourceType,
    baseUrl: row.base_url,
    parserType: row.parser_type as ParserType,
    // A row whose tier is missing or out of range is treated as the least
    // trustworthy kind rather than the most: an unclassifiable publisher must
    // not inherit tier 1 by default.
    trustTier: (tiers.includes(row.trust_tier) ? row.trust_tier : 4) as MarketSource['trustTier'],
    updateFrequencyHours: row.update_frequency_hours,
    enabled: row.enabled === 1,
    region: row.region ?? undefined,
    supportedCategories: jsonArray(row.supported_categories_json),
    parserConfig: jsonObject(row.parser_config_json),
    rateLimitRps: row.rate_limit_rps,
    timeoutMs: row.timeout_ms,
    userAgent: row.user_agent ?? undefined,
    headers: jsonObject(row.headers_json) as Record<string, string>,
  };
}

export interface LoadSourcesOptions {
  /** Restrict to these ids (a caller asking for a specific source). */
  ids?: string[];
  /** Drop sources disabled in configuration. Default true. */
  enabledOnly?: boolean;
}

export async function loadSources(db: D1Database, options: LoadSourcesOptions = {}): Promise<MarketSource[]> {
  const result = await db.prepare(
    `SELECT id, name_en, name_bn, source_type, base_url, parser_type, trust_tier,
            update_frequency_hours, enabled, region, supported_categories_json,
            parser_config_json, rate_limit_rps, timeout_ms, user_agent, headers_json
     FROM market_sources
     WHERE (${options.enabledOnly === false ? '1=1' : 'enabled = 1'})
     ORDER BY trust_tier, id`,
  ).all<SourceRow>();
  const wanted = options.ids?.length ? new Set(options.ids) : null;
  return result.results.map(rowToSource).filter((source) => !wanted || wanted.has(source.id));
}

export async function loadFreshness(db: D1Database): Promise<FreshnessConfig> {
  try {
    const row = await db.prepare(
      `SELECT very_fresh_hours, fresh_hours, recent_hours, aged_hours, outdated_hours
       FROM market_freshness_config WHERE id = 'default'`,
    ).first<Record<string, number>>();
    if (!row) return DEFAULT_FRESHNESS;
    const cfg: FreshnessConfig = {
      veryFreshHours: row.very_fresh_hours,
      freshHours: row.fresh_hours,
      recentHours: row.recent_hours,
      agedHours: row.aged_hours,
      outdatedHours: row.outdated_hours,
    };
    // A misconfigured table must not hand back NaN thresholds that make every
    // price read as outdated forever.
    const valid = Object.values(cfg).every((value) => Number.isFinite(value) && value > 0);
    return valid ? cfg : DEFAULT_FRESHNESS;
  } catch {
    return DEFAULT_FRESHNESS;
  }
}

export interface DistrictIndex {
  resolve(name: string | undefined): { id: string; division: string | null } | null;
}

/**
 * Resolve a district *name* ( as published by a source ) to its id.
 *
 * Sources that publish a place name rather than a code are the common case,
 * and an unresolved name still keeps the row: a national figure with a
 * market name is more useful than no row at all.
 */
export async function loadDistrictIndex(db: D1Database): Promise<DistrictIndex> {
  const map = new Map<string, { id: string; division: string | null }>();
  try {
    const result = await db.prepare(
      'SELECT id, name_en, name_bn, division FROM districts',
    ).all<{ id: string; name_en: string; name_bn: string; division: string }>();
    for (const row of result.results) {
      const value = { id: row.id, division: row.division ?? null };
      map.set(normalizeKey(row.name_en), value);
      map.set(normalizeKey(row.name_bn), value);
    }
  } catch {
    // No districts table yet: every district stays unresolved, which only
    // costs location confidence, not the row.
  }
  return {
    resolve(name) {
      if (!name) return null;
      return map.get(normalizeKey(name)) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Pull a source payload with the source's own timeout.
 *
 * The timeout comes from the row rather than a constant: a source that has
 * been slow in the past should fail fast, and one configured with a longer
 * budget gets it. An upstream that hangs is the failure mode that stalls a
 * whole refresh, so this never waits indefinitely.
 */
export async function fetchSourcePayload(source: MarketSource): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml,application/json,text/csv,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': source.userAgent ?? DEFAULT_USER_AGENT,
    ...source.headers,
  };
  const response = await fetch(source.baseUrl, {
    headers,
    signal: AbortSignal.timeout(Math.max(1_000, source.timeoutMs)),
  });
  if (!response.ok) throw new Error(`upstream ${response.status} for ${source.baseUrl}`);
  return response.text();
}

async function lastSuccessAt(db: D1Database, sourceId: string): Promise<string | null> {
  try {
    const row = await db.prepare(
      `SELECT fetched_at FROM market_source_logs
       WHERE source_id = ? AND status = 'success'
       ORDER BY fetched_at DESC LIMIT 1`,
    ).bind(sourceId).first<{ fetched_at: string }>();
    return row?.fetched_at ?? null;
  } catch {
    return null;
  }
}

/**
 * Per-source spacing so a refresh loop cannot hammer a publisher.
 *
 * Uses KV when available. With no KV the gate silently passes, which is the
 * right degradation for a local dev binding: the `update_frequency_hours`
 * check still applies, and that is the one that stops repeated refetches.
 */
async function withinRateLimit(env: Env, source: MarketSource): Promise<boolean> {
  if (!env.RATE_LIMIT_KV || !(source.rateLimitRps > 0)) return true;
  const key = `market:fetch:${source.id}`;
  const last = await env.RATE_LIMIT_KV.get(key);
  if (!last) return true;
  const lastAt = Number(last);
  if (!Number.isFinite(lastAt)) return true;
  return Date.now() - lastAt >= 1_000 / source.rateLimitRps;
}

async function markFetched(env: Env, source: MarketSource): Promise<void> {
  if (!env.RATE_LIMIT_KV) return;
  // TTL comfortably above the slowest cadence so a restart does not lose it.
  await env.RATE_LIMIT_KV.put(`market:fetch:${source.id}`, String(Date.now()), { expirationTtl: 86_400 });
}

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------

export interface NormalizationOutcome {
  records: NormalizedPriceRecord[];
  /** Labels the catalog could not resolve. Reported, never guessed. */
  unmatched: string[];
  rejected: Array<{ label: string; reason: string }>;
  /** How many optional fields had to come from parser defaults. */
  substitutedDefaults: number;
}

/**
 * Turn parsed rows into storable records.
 *
 * Three outcomes, all visible to the caller: a row becomes a record, a row
 * whose label names nothing in the catalog is counted as unmatched, or a row
 * that parsed but fails a price/unit check is rejected with a reason. None of
 * the failures are silent, because an ingest that quietly drops a third of a
 * payload looks exactly like one that succeeded.
 */
export function normalizeParsed(input: {
  source: MarketSource;
  rows: ParsedPriceData[];
  commodities: Commodity[];
  districts: DistrictIndex;
  fetchedAt: string;
  now: number;
}): NormalizationOutcome {
  const { source, rows, commodities, districts, fetchedAt, now } = input;
  const records: NormalizedPriceRecord[] = [];
  const unmatched: string[] = [];
  const rejected: Array<{ label: string; reason: string }> = [];
  let substitutedDefaults = 0;

  for (const row of rows) {
    substitutedDefaults += row.substitutedDefaults;

    let match = matchCommodity(row.commodityName, commodities);
    if (!match.commodity && row.commodityNameBn) {
      match = matchCommodity(row.commodityNameBn, commodities);
    }
    if (!match.commodity) {
      if (unmatched.length < MAX_UNMATCHED_REPORTED) unmatched.push(row.commodityName);
      continue;
    }
    const commodity = match.commodity;

    const prices = resolvePrices(row);
    if (!prices) {
      rejected.push({ label: row.commodityName, reason: 'unreadable_price' });
      continue;
    }

    const unit = resolveUnit(row.unit, commodity);
    if (unit.unit === null) {
      rejected.push({ label: row.commodityName, reason: `unit_${unit.reason}` });
      continue;
    }
    // A config default reaches `resolveUnit` looking exactly like a payload
    // value, so the parser's own note is what separates "they wrote kg" from
    // "we wrote kg for them". Only the first may claim the unit.
    const unitPublished = unit.published && !row.unitIsAssumed;

    const place = districts.resolve(row.district);
    const ageHours = recordAgeHours(row.publishedAt, fetchedAt, now);
    const confidence = recordConfidence({
      trustTier: source.trustTier,
      ageHours,
      completeness: completenessScore({
        marketName: row.marketName,
        districtId: place?.id ?? null,
        division: row.division ?? place?.division ?? null,
        publishedAt: row.publishedAt,
      }),
      parsing: parsingScore(row.substitutedDefaults),
      location: locationScore({
        districtId: place?.id ?? null,
        division: row.division ?? place?.division ?? null,
        marketName: row.marketName,
      }),
      unitPublished,
    });

    const districtId = place?.id ?? null;
    const division = row.division ?? place?.division ?? null;
    const raw = JSON.stringify(row.rawData);
    const districtKey = districtId ?? 'national';

    records.push({
      // One observation per source/good/place/unit. A price list is a
      // snapshot, not a ledger: re-reading it replaces yesterday's number
      // rather than adding a second, and keeping only the latest is what
      // stops the table growing on every refresh.
      id: `rec:${source.id}:${commodity.id}:${districtKey}:${unit.unit}`,
      commodityId: commodity.id,
      normalizedName: commodity.nameBn,
      category: commodity.category,
      priceMin: prices.priceMin,
      priceMax: prices.priceMax,
      priceAvg: prices.priceAvg,
      currency: 'BDT',
      unit: unit.unit,
      marketName: row.marketName,
      districtId: districtId ?? undefined,
      division: division ?? undefined,
      sourceId: source.id,
      sourceUrl: source.baseUrl,
      sourceType: source.sourceType,
      trustTier: source.trustTier,
      unitPublished,
      publishedAt: row.publishedAt,
      fetchedAt,
      dataAgeHours: ageHours === null ? undefined : Math.round(ageHours * 10) / 10,
      verificationStatus: verificationFor({
        confidence,
        trustTier: source.trustTier,
        unitPublished,
      }),
      confidenceScore: confidence,
      parserVersion: PARSER_VERSION,
      rawData: raw.length > MAX_RAW_JSON_BYTES ? { truncated: true } : row.rawData,
    });
  }

  return { records, unmatched, rejected, substitutedDefaults };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const RECORD_COLUMNS = `id, commodity_id, normalized_name, category, price_min, price_max,
  price_avg, currency, unit, market_name, district_id, division, source_id, source_url,
  source_type, trust_tier, unit_published, published_at, fetched_at, data_age_hours,
  verification_status, confidence_score, parser_version, raw_data_json`;

function recordStatement(db: D1Database, record: NormalizedPriceRecord) {
  return db.prepare(
    `INSERT INTO market_price_records (${RECORD_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       normalized_name = excluded.normalized_name,
       category = excluded.category,
       price_min = excluded.price_min,
       price_max = excluded.price_max,
       price_avg = excluded.price_avg,
       unit = excluded.unit,
       market_name = excluded.market_name,
       district_id = excluded.district_id,
       division = excluded.division,
       trust_tier = excluded.trust_tier,
       unit_published = excluded.unit_published,
       published_at = excluded.published_at,
       fetched_at = excluded.fetched_at,
       data_age_hours = excluded.data_age_hours,
       verification_status = excluded.verification_status,
       confidence_score = excluded.confidence_score,
       raw_data_json = excluded.raw_data_json`,
  ).bind(
    record.id, record.commodityId, record.normalizedName, record.category,
    record.priceMin, record.priceMax, record.priceAvg, record.currency, record.unit,
    record.marketName ?? null, record.districtId ?? null, record.division ?? null,
    record.sourceId, record.sourceUrl, record.sourceType,
    record.trustTier, record.unitPublished ? 1 : 0,
    record.publishedAt ?? null, record.fetchedAt, record.dataAgeHours ?? null,
    record.verificationStatus, record.confidenceScore, record.parserVersion,
    record.rawData ? JSON.stringify(record.rawData) : null,
  );
}

interface StoredRecordRow {
  id: string;
  commodity_id: string;
  normalized_name: string;
  category: string;
  price_min: number;
  price_max: number;
  price_avg: number;
  currency: string;
  unit: string;
  market_name: string | null;
  district_id: string | null;
  division: string | null;
  source_id: string;
  source_url: string;
  source_type: string;
  trust_tier: number;
  unit_published: number;
  published_at: string | null;
  fetched_at: string;
  data_age_hours: number | null;
  verification_status: NormalizedPriceRecord['verificationStatus'];
  confidence_score: number;
  parser_version: string;
}

function rowToRecord(row: StoredRecordRow): NormalizedPriceRecord {
  return {
    id: row.id,
    commodityId: row.commodity_id,
    normalizedName: row.normalized_name,
    category: row.category,
    priceMin: row.price_min,
    priceMax: row.price_max,
    priceAvg: row.price_avg,
    currency: row.currency,
    unit: row.unit,
    marketName: row.market_name ?? undefined,
    districtId: row.district_id ?? undefined,
    division: row.division ?? undefined,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    sourceType: row.source_type as SourceType,
    trustTier: row.trust_tier,
    unitPublished: row.unit_published === 1,
    publishedAt: row.published_at ?? undefined,
    fetchedAt: row.fetched_at,
    dataAgeHours: row.data_age_hours ?? undefined,
    verificationStatus: row.verification_status,
    confidenceScore: row.confidence_score,
    parserVersion: row.parser_version,
  };
}

async function writeLog(db: D1Database, log: SourceLog): Promise<void> {
  await db.prepare(
    `INSERT INTO market_source_logs
       (id, source_id, status, http_status, records_extracted, records_valid,
        error_message, duration_ms, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    log.id, log.sourceId, log.status, log.httpStatus ?? null,
    log.recordsExtracted, log.recordsValid, log.errorMessage ?? null,
    log.durationMs, log.fetchedAt,
  ).run();
}

/** Delete rows older than the freshness config says we would still serve. */
async function pruneRecords(db: D1Database, cfg: FreshnessConfig, now: number): Promise<number> {
  const cutoff = new Date(now - cfg.outdatedHours * 3_600_000).toISOString();
  try {
    const result = await db.prepare('DELETE FROM market_price_records WHERE fetched_at < ?')
      .bind(cutoff).run();
    return result.meta?.changes ?? 0;
  } catch {
    return 0;
  }
}

export interface ReaggregateResult {
  aggregatesWritten: number;
  aggregatesRemoved: number;
  recordsPruned: number;
  recordCount: number;
}

/**
 * Rebuild every aggregate from the stored rows.
 *
 * A full rebuild rather than an incremental one: the row table is a bounded
 * cache (pruned to `outdated_hours`), so recomputing all of it is cheaper
 * than tracking which groups a refresh touched -- and it cannot drift out of
 * sync with the rows the way a partial update would.
 *
 * Aggregates that no longer have any supporting row are deleted rather than
 * left behind as a figure nobody can trace to a source.
 */
export async function reaggregate(
  db: D1Database,
  options: { now?: number; freshness?: FreshnessConfig; cadence?: Record<string, number> } = {},
): Promise<ReaggregateResult> {
  const now = options.now ?? Date.now();
  const freshness = options.freshness ?? await loadFreshness(db);
  const recordsPruned = await pruneRecords(db, freshness, now);

  const stored = await db.prepare(
    `SELECT ${RECORD_COLUMNS} FROM market_price_records`,
  ).all<StoredRecordRow>();
  const records = stored.results.map(rowToRecord);

  const cadence = options.cadence ?? await loadCadence(db);
  const aggregateOptions = { freshness, now, cadence };

  const groups = groupRecords(records);
  const aggregates: AggregatedPrice[] = [];
  const disputedIds = new Set<string>();
  for (const group of groups) {
    const aggregate = aggregateGroup(group, aggregateOptions);
    aggregates.push(aggregate);
    // When sources spread this far apart none of them can be singled out as
    // the wrong one, so every row in the group is marked disputed rather
    // than picking a loser by distance from an average we do not trust.
    if (aggregate.hasDisagreement) {
      for (const record of group.records) disputedIds.add(record.id);
    }
  }

  if (aggregates.length) {
    await db.batch(aggregates.map((aggregate) => db.prepare(
      `INSERT INTO market_aggregated_prices
         (id, commodity_id, normalized_name, category, price_min, price_max, price_avg,
          currency, unit, market_name, district_id, division, source_count, sources_json,
          price_variation_pct, has_disagreement, overall_confidence, overall_freshness,
          aggregated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         normalized_name = excluded.normalized_name,
         category = excluded.category,
         price_min = excluded.price_min,
         price_max = excluded.price_max,
         price_avg = excluded.price_avg,
         unit = excluded.unit,
         market_name = excluded.market_name,
         district_id = excluded.district_id,
         division = excluded.division,
         source_count = excluded.source_count,
         sources_json = excluded.sources_json,
         price_variation_pct = excluded.price_variation_pct,
         has_disagreement = excluded.has_disagreement,
         overall_confidence = excluded.overall_confidence,
         overall_freshness = excluded.overall_freshness,
         aggregated_at = excluded.aggregated_at,
         expires_at = excluded.expires_at`,
    ).bind(
      aggregate.id, aggregate.commodityId, aggregate.normalizedName, aggregate.category,
      aggregate.priceMin, aggregate.priceMax, aggregate.priceAvg, aggregate.currency,
      aggregate.unit, aggregate.marketName ?? null, aggregate.districtId ?? null,
      aggregate.division ?? null, aggregate.sourceCount, JSON.stringify(aggregate.sources),
      aggregate.priceVariationPct, aggregate.hasDisagreement ? 1 : 0,
      aggregate.overallConfidence, aggregate.overallFreshness,
      aggregate.aggregatedAt, aggregate.expiresAt,
    )));
  }

  const existing = await db.prepare('SELECT id FROM market_aggregated_prices').all<{ id: string }>();
  const keep = new Set(aggregates.map((aggregate) => aggregate.id));
  const stale = existing.results.filter((row) => !keep.has(row.id));
  if (stale.length) {
    await db.batch(stale.map((row) => db.prepare('DELETE FROM market_aggregated_prices WHERE id = ?').bind(row.id)));
  }

  await syncVerificationStatus(db, records, disputedIds);

  return {
    aggregatesWritten: aggregates.length,
    aggregatesRemoved: stale.length,
    recordsPruned,
    recordCount: records.length,
  };
}

/**
 * Write each row's verification status, base or disputed.
 *
 * The base status is recomputed from the stored provenance rather than read
 * back, because a row that was disputed last run and sits in an agreeing
 * group this run has to become undisputed -- leaving it flagged would let a
 * resolved disagreement keep warning readers forever.
 */
async function syncVerificationStatus(
  db: D1Database,
  records: NormalizedPriceRecord[],
  disputedIds: Set<string>,
): Promise<void> {
  const updates = records.flatMap((record) => {
    const base = verificationFor({
      confidence: record.confidenceScore,
      trustTier: record.trustTier,
      unitPublished: record.unitPublished,
    });
    const target = disputedIds.has(record.id) ? 'disputed' as const : base;
    if (target === record.verificationStatus) return [];
    return [db.prepare('UPDATE market_price_records SET verification_status = ? WHERE id = ?')
      .bind(target, record.id)];
  });
  if (updates.length) await db.batch(updates);
}

async function loadCadence(db: D1Database): Promise<Record<string, number>> {
  try {
    const result = await db.prepare('SELECT id, update_frequency_hours FROM market_sources')
      .all<{ id: string; update_frequency_hours: number }>();
    return Object.fromEntries(result.results.map((row) => [row.id, row.update_frequency_hours]));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export type SourceRefreshStatus = 'success' | 'failed' | 'skipped';

export interface SourceRefreshResult {
  sourceId: string;
  status: SourceRefreshStatus;
  /** Why a source was not fetched, when `status` is `skipped`. */
  reason?: 'already_fresh' | 'rate_limited' | 'unknown_source';
  recordsExtracted: number;
  recordsValid: number;
  unmatched: string[];
  rejected: Array<{ label: string; reason: string }>;
  httpStatus?: number;
  error?: string;
  durationMs: number;
}

export interface RefreshReport {
  startedAt: string;
  durationMs: number;
  results: SourceRefreshResult[];
  aggregatesWritten: number;
  aggregatesRemoved: number;
  recordsPruned: number;
}

export interface RefreshOptions {
  /** Restrict to these source ids. */
  sourceIds?: string[];
  /** Ignore the freshness and rate gates for the requested sources. */
  force?: boolean;
  maxSources?: number;
  now?: number;
}

/**
 * Fetch, parse, store and re-aggregate.
 *
 * Each source is independent: one publisher being down records a failed log
 * and leaves the rest of the run intact. That matters because the sources
 * here are third parties -- a single unreachable government endpoint must not
 * take the whole price list down with it.
 *
 * The run is bounded (`maxSources`) so a request handler cannot be turned
 * into an open-ended crawler by asking for everything at once.
 */
export async function refreshMarket(env: Env, options: RefreshOptions = {}): Promise<RefreshReport> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const now = options.now ?? started;
  const maxSources = Math.min(options.maxSources ?? MAX_SOURCES_PER_REFRESH, MAX_SOURCES_PER_REFRESH);

  const sources = await loadSources(env.DB, { ids: options.sourceIds });
  const commodities = await loadCommodities(env.DB);
  const districts = await loadDistrictIndex(env.DB);

  const results: SourceRefreshResult[] = [];
  const touched: NormalizedPriceRecord[] = [];
  let attempted = 0;

  for (const source of sources) {
    if (attempted >= maxSources) break;
    const wanted = options.sourceIds?.includes(source.id);
    const gate = options.force && wanted;

    if (!gate) {
      const lastSuccess = await lastSuccessAt(env.DB, source.id);
      if (lastSuccess) {
        const ageMs = now - Date.parse(lastSuccess);
        if (Number.isFinite(ageMs) && ageMs < source.updateFrequencyHours * 3_600_000) {
          results.push({
            sourceId: source.id, status: 'skipped', reason: 'already_fresh',
            recordsExtracted: 0, recordsValid: 0, unmatched: [], rejected: [], durationMs: 0,
          });
          continue;
        }
      }
      if (!(await withinRateLimit(env, source))) {
        results.push({
          sourceId: source.id, status: 'skipped', reason: 'rate_limited',
          recordsExtracted: 0, recordsValid: 0, unmatched: [], rejected: [], durationMs: 0,
        });
        continue;
      }
    }

    attempted += 1;
    const fetchStarted = Date.now();
    try {
      const payload = await fetchSourcePayload(source);
      const rows = parsePayload(source.parserType, payload, source.parserConfig as ParserConfig);
      const outcome = normalizeParsed({
        source, rows, commodities, districts,
        fetchedAt: new Date(now).toISOString(), now,
      });

      if (outcome.records.length) {
        await env.DB.batch(outcome.records.map((record) => recordStatement(env.DB, record)));
      }

      const durationMs = Date.now() - fetchStarted;
      const log: SourceLog = {
        id: crypto.randomUUID(),
        sourceId: source.id,
        status: 'success',
        httpStatus: 200,
        recordsExtracted: rows.length,
        recordsValid: outcome.records.length,
        errorMessage: outcome.rejected.length
          ? `rejected: ${outcome.rejected.slice(0, 5).map((entry) => `${entry.label} (${entry.reason})`).join('; ')}`
            + (outcome.unmatched.length ? `; unmatched: ${outcome.unmatched.join(', ')}` : '')
          : (outcome.unmatched.length ? `unmatched: ${outcome.unmatched.join(', ')}` : undefined),
        durationMs,
        fetchedAt: new Date(now).toISOString(),
      };
      await writeLog(env.DB, log);
      await markFetched(env, source);
      touched.push(...outcome.records);

      results.push({
        sourceId: source.id,
        status: 'success',
        recordsExtracted: rows.length,
        recordsValid: outcome.records.length,
        unmatched: outcome.unmatched,
        rejected: outcome.rejected,
        httpStatus: 200,
        durationMs,
      });
    } catch (cause) {
      const durationMs = Date.now() - fetchStarted;
      const message = cause instanceof Error ? cause.message : String(cause);
      // A parse/config fault and a network fault both land here; the log
      // records whichever it was so a source that is silently returning
      // something unparseable is distinguishable from one that is offline.
      try {
        await writeLog(env.DB, {
          id: crypto.randomUUID(),
          sourceId: source.id,
          status: 'failed',
          recordsExtracted: 0,
          recordsValid: 0,
          errorMessage: message.slice(0, 500),
          durationMs,
          fetchedAt: new Date(now).toISOString(),
        });
      } catch {
        // Logging the failure must not itself fail the refresh.
      }
      await markFetched(env, source);
      results.push({ sourceId: source.id, status: 'failed', recordsExtracted: 0, recordsValid: 0, unmatched: [], rejected: [], error: message, durationMs });
    }
  }

  // Re-aggregate even when nothing new landed: a refresh that only expired
  // gates still owes the caller current aggregates from whatever is stored.
  const aggregation = await reaggregate(env.DB, { now });

  return {
    startedAt,
    durationMs: Date.now() - started,
    results,
    aggregatesWritten: aggregation.aggregatesWritten,
    aggregatesRemoved: aggregation.aggregatesRemoved,
    recordsPruned: aggregation.recordsPruned,
  };
}

/**
 * Whether a stored aggregate is still inside its own expiry window.
 *
 * Used to decide when a read is allowed to pay for a refresh. Answering from
 * `expires_at` rather than from the row's freshness label keeps the decision
 * in one place: whatever set the expiry also decides when it is stale.
 */
export function isExpired(expiresAt: string, now: number = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at <= now;
}
