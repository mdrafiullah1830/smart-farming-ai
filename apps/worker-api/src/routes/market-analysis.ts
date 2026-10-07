import type { Env } from '../types.ts';
import { error, isMissingRelation, json } from '../http.ts';
import { currentUser } from '../auth.ts';
import type {
  AggregatedPrice,
  FreshnessLevel,
  MarketSource,
  PublicMarketSource,
} from '../market-analysis/types.ts';
import {
  FRESHNESS_ORDER,
  meetsFreshness,
} from '../market-analysis/freshness.ts';
import { normalizeKey } from '../market-analysis/normalize.ts';
import {
  isExpired,
  loadCommodities,
  loadSources,
  refreshMarket,
} from '../market-analysis/ingest.ts';

const AGGREGATE_COLUMNS = `id, commodity_id, normalized_name, category, price_min, price_max,
  price_avg, currency, unit, market_name, district_id, division, source_count, sources_json,
  price_variation_pct, has_disagreement, overall_confidence, overall_freshness,
  aggregated_at, expires_at`;

const LOG_COLUMNS = `id, source_id, status, http_status, records_extracted, records_valid,
  error_message, duration_ms, fetched_at`;

/**
 * Carried on every analysis response. These figures are an aggregation of
 * what other people published, and a reader who treats them as a quote for
 * their own market will act on the wrong number.
 */
const DISCLAIMER_EN = 'Aggregated from published sources. Indicative figures for planning, not a quote for any specific market. Confirm locally before buying or selling.';
const DISCLAIMER_BN = 'প্রকাশিত উৎস থেকে সংগ্রহ করা তথ্য। পরিকল্পনার জন্য আনুমানিক দাম, কোনো নির্দিষ্ট বাজারের দর নয়। কেনাবেচার আগে স্থানীয় বাজারে নিশ্চিত করুন।';

/**
 * Connection details never leave the process. `headers` can carry a key and
 * a user agent identifies us to the publisher; neither is a farmer's
 * business, and both would be handed out by an unauthenticated endpoint.
 */
function publicSource(source: MarketSource): PublicMarketSource {
  const { headers: _headers, userAgent: _userAgent, ...safe } = source;
  return safe;
}

interface AggregateRow {
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
  source_count: number;
  sources_json: string;
  price_variation_pct: number | null;
  has_disagreement: number;
  overall_confidence: number;
  overall_freshness: FreshnessLevel;
  aggregated_at: string;
  expires_at: string;
}

function rowToAggregated(row: AggregateRow): AggregatedPrice {
  let sources: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.sources_json);
    if (Array.isArray(parsed)) sources = parsed.map((value) => String(value));
  } catch {
    // A corrupt sources array still leaves a usable price; it just cannot
    // name its contributors, and an empty list says exactly that.
  }
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
    sourceCount: row.source_count,
    sources,
    priceVariationPct: row.price_variation_pct,
    hasDisagreement: row.has_disagreement === 1,
    overallConfidence: row.overall_confidence,
    overallFreshness: row.overall_freshness,
    aggregatedAt: row.aggregated_at,
    expiresAt: row.expires_at,
  };
}

/** `%term%` with the LIKE wildcards in the term neutralised. */
function likeTerm(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

interface ListFilters {
  q?: string;
  category?: string;
  commodity?: string;
  districtId?: string;
  division?: string;
  freshness?: FreshnessLevel;
  minConfidence?: number;
  includeExpired?: boolean;
  limit: number;
  offset: number;
}

function readFilters(url: URL): ListFilters | { invalid: string } {
  const params = url.searchParams;
  const limitRaw = Number(params.get('limit') ?? 50);
  const offsetRaw = Number(params.get('offset') ?? 0);
  if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 200) {
    return { invalid: 'limit must be between 1 and 200' };
  }
  if (!Number.isFinite(offsetRaw) || offsetRaw < 0) {
    return { invalid: 'offset must be zero or more' };
  }
  const freshnessRaw = params.get('freshness');
  if (freshnessRaw && !FRESHNESS_ORDER.includes(freshnessRaw as FreshnessLevel)) {
    return { invalid: `freshness must be one of ${FRESHNESS_ORDER.join(', ')}` };
  }
  const minConfidenceRaw = params.get('min_confidence');
  let minConfidence: number | undefined;
  if (minConfidenceRaw !== null) {
    minConfidence = Number(minConfidenceRaw);
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 100) {
      return { invalid: 'min_confidence must be between 0 and 100' };
    }
  }
  return {
    q: params.get('q')?.trim() || undefined,
    category: params.get('category')?.trim() || undefined,
    commodity: params.get('commodity')?.trim() || undefined,
    districtId: params.get('district_id')?.trim() || undefined,
    division: params.get('division')?.trim() || undefined,
    freshness: (freshnessRaw as FreshnessLevel | null) ?? undefined,
    minConfidence,
    includeExpired: params.get('include_expired') === 'true',
    limit: Math.round(limitRaw),
    offset: Math.round(offsetRaw),
  };
}

function buildWhere(filters: ListFilters): { sql: string; bindings: Array<string | number> } {
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];
  if (filters.q) {
    conditions.push("(normalized_name LIKE ? ESCAPE '\\' OR commodity_id LIKE ? ESCAPE '\\')");
    bindings.push(likeTerm(filters.q), likeTerm(filters.q));
  }
  if (filters.category) { conditions.push('category = ?'); bindings.push(filters.category); }
  if (filters.commodity) { conditions.push('commodity_id = ?'); bindings.push(filters.commodity); }
  if (filters.districtId) { conditions.push('district_id = ?'); bindings.push(filters.districtId); }
  if (filters.division) { conditions.push('division = ?'); bindings.push(filters.division); }
  if (filters.minConfidence !== undefined) {
    conditions.push('overall_confidence >= ?');
    bindings.push(filters.minConfidence);
  }
  if (filters.freshness) {
    // "at least this fresh", not "exactly this level": a caller asking for
    // fresh prices wants fresh and very_fresh, not fresh alone.
    const allowed = FRESHNESS_ORDER.filter((level) => meetsFreshness(level, filters.freshness as FreshnessLevel));
    conditions.push(`overall_freshness IN (${allowed.map(() => '?').join(', ')})`);
    bindings.push(...allowed);
  }
  if (!filters.includeExpired) {
    conditions.push('expires_at > ?');
    bindings.push(new Date().toISOString());
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', bindings };
}

async function hasUnexpiredPrice(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      'SELECT id FROM market_aggregated_prices WHERE expires_at > ? LIMIT 1',
    ).bind(new Date().toISOString()).first<{ id: string }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

/**
 * Refresh when the cache is empty, at most once per lock window.
 *
 * Returning `locked` for the losers is deliberate: a second reader should get
 * whatever is stored rather than queue behind a network call, and an empty
 * answer served quickly beats a populated one served late on a page a farmer
 * is waiting for. The empty-cache trigger is what stops a warm endpoint from
 * ever making an outbound request at all.
 */
async function maybeRefresh(env: Env): Promise<'refreshed' | 'locked' | 'idle'> {
  if (await hasUnexpiredPrice(env)) return 'idle';
  if (!env.RATE_LIMIT_KV) return 'idle';
  const key = 'market:analysis:refresh-lock';
  const held = await env.RATE_LIMIT_KV.get(key);
  if (held) return 'locked';
  await env.RATE_LIMIT_KV.put(key, '1', { expirationTtl: 60 });
  try {
    await refreshMarket(env, { maxSources: 2 });
    return 'refreshed';
  } catch (cause) {
    console.warn('market_analysis_autorefresh_failed', cause);
    return 'idle';
  }
}

async function listAggregates(env: Env, filters: ListFilters): Promise<AggregatedPrice[]> {
  const { sql, bindings } = buildWhere(filters);
  const result = await env.DB.prepare(
    `SELECT ${AGGREGATE_COLUMNS} FROM market_aggregated_prices ${sql}
     ORDER BY has_disagreement DESC, category, normalized_name
     LIMIT ? OFFSET ?`,
  ).bind(...bindings, filters.limit, filters.offset).all<AggregateRow>();
  return result.results.map(rowToAggregated);
}

async function countAggregates(env: Env, filters: ListFilters): Promise<number> {
  const { sql, bindings } = buildWhere(filters);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM market_aggregated_prices ${sql}`,
  ).bind(...bindings).first<{ total: number }>();
  return row?.total ?? 0;
}

/**
 * Honest warnings about what the caller is being handed.
 *
 * Each one names a property of *this* response rather than the feature in
 * general, because a general caveat is the kind of thing readers stop seeing
 * after the first screen.
 */
async function buildWarnings(env: Env, prices: AggregatedPrice[]): Promise<string[]> {
  const warnings: string[] = [];
  const disagreeing = prices.filter((price) => price.hasDisagreement).length;
  if (disagreeing) {
    warnings.push(`sources_disagree:${disagreeing}`);
  }
  const stale = prices.filter((price) => isExpired(price.expiresAt)).length;
  if (stale) {
    warnings.push(`expired:${stale}`);
  }
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(DISTINCT commodity_id) AS n FROM market_price_records WHERE unit_published = 0',
    ).first<{ n: number }>();
    if ((row?.n ?? 0) > 0) warnings.push(`unit_assumed:${row?.n}`);
  } catch {
    // Warning is best-effort; its absence must not fail a successful read.
  }
  return warnings;
}

function respond(
  request: Request,
  env: Env,
  prices: AggregatedPrice[],
  sources: PublicMarketSource[],
  warnings: string[],
  extra: Record<string, unknown> = {},
): Response {
  const lastUpdated = prices.reduce(
    (latest, price) => (price.aggregatedAt > latest ? price.aggregatedAt : latest),
    '',
  );
  return json(request, env, {
    success: true,
    prices,
    total: prices.length,
    sources,
    warnings,
    disclaimer: DISCLAIMER_EN,
    disclaimerBn: DISCLAIMER_BN,
    lastUpdated: lastUpdated || new Date().toISOString(),
    ...extra,
  });
}

/**
 * GET /api/v1/market/analysis
 *
 * Public: price information is reference data, like /market/prices and the
 * irrigation requirement table. Nothing here is tied to an account.
 */
export async function marketAnalysisRoute(request: Request, env: Env): Promise<Response> {
  const filters = readFilters(new URL(request.url));
  if ('invalid' in filters) return error(request, env, 400, filters.invalid);

  try {
    const refresh = await maybeRefresh(env);
    const prices = await listAggregates(env, filters);
    const total = await countAggregates(env, filters);
    const allSources = await loadSources(env.DB);
    const contributing = new Set(prices.flatMap((price) => price.sources));
    const sources = allSources.filter((source) => contributing.has(source.id)).map(publicSource);
    const warnings = await buildWarnings(env, prices);
    if (refresh === 'locked') warnings.push('refresh_in_progress');
    if (refresh === 'refreshed' && !prices.length) warnings.push('no_data');
    if (!prices.length && refresh === 'idle') warnings.push('no_data');

    return json(request, env, {
      success: true,
      prices,
      total,
      sources,
      warnings,
      disclaimer: DISCLAIMER_EN,
      disclaimerBn: DISCLAIMER_BN,
      lastUpdated: prices[0]?.aggregatedAt ?? new Date().toISOString(),
      refreshed: refresh,
    });
  } catch (cause) {
    if (isMissingRelation(cause)) {
      // Migration 0011 is not applied to this binding yet.
      return json(request, env, {
        success: true,
        synced: false,
        prices: [],
        total: 0,
        sources: [],
        warnings: ['migration_pending'],
        disclaimer: DISCLAIMER_EN,
        disclaimerBn: DISCLAIMER_BN,
        lastUpdated: new Date().toISOString(),
      });
    }
    console.error('market_analysis_error', cause);
    return error(request, env, 500, 'Market analysis unavailable');
  }
}

/**
 * GET /api/v1/market/analysis/commodities
 *
 * The catalog a client needs before it can ask for anything else. Public for
 * the same reason /irrigation/requirements is: a picker cannot be built
 * without a list, and the list is not private.
 */
export async function marketCommoditiesRoute(request: Request, env: Env): Promise<Response> {
  const category = new URL(request.url).searchParams.get('category')?.trim();
  try {
    const commodities = await loadCommodities(env.DB);
    const rows = commodities
      .filter((commodity) => !category || commodity.category === category)
      .map((commodity) => ({
        id: commodity.id,
        name_en: commodity.nameEn,
        name_bn: commodity.nameBn,
        category: commodity.category,
        default_unit: commodity.defaultUnit,
        valid_units: commodity.validUnits,
        season: commodity.season ?? null,
        aliases: commodity.aliases,
      }));
    const categories = [...new Set(commodities.map((commodity) => commodity.category))].sort();
    return json(request, env, {
      success: true,
      commodities: rows,
      categories,
      total: rows.length,
      note: 'Aliases are the spellings publishers use; matching is exact on name or alias.',
    });
  } catch (cause) {
    if (isMissingRelation(cause)) {
      return json(request, env, { success: true, synced: false, commodities: [], categories: [], total: 0 });
    }
    console.error('market_commodities_error', cause);
    return error(request, env, 500, 'Commodity catalog unavailable');
  }
}

interface SourceLogRow {
  id: string;
  source_id: string;
  status: string;
  http_status: number | null;
  records_extracted: number;
  records_valid: number;
  error_message: string | null;
  duration_ms: number | null;
  fetched_at: string;
}

/**
 * GET /api/v1/market/analysis/sources
 *
 * Operational view: what we collect from, when it last ran, and whether it
 * worked. The fetch log is included because a price list with no way to check
 * where it came from is a price list nobody can audit.
 */
export async function marketSourcesRoute(request: Request, env: Env): Promise<Response> {
  try {
    const sources = await loadSources(env.DB, { enabledOnly: false });
    const logs = await env.DB.prepare(
      `SELECT ${LOG_COLUMNS} FROM market_source_logs ORDER BY fetched_at DESC LIMIT 50`,
    ).all<SourceLogRow>();
    const lastLog = new Map<string, SourceLogRow>();
    for (const row of logs.results) {
      if (!lastLog.has(row.source_id)) lastLog.set(row.source_id, row);
    }
    return json(request, env, {
      success: true,
      sources: sources.map((source) => ({
        ...publicSource(source),
        lastFetch: lastLog.get(source.id) ?? null,
      })),
      recentLogs: logs.results,
      total: sources.length,
    });
  } catch (cause) {
    if (isMissingRelation(cause)) {
      return json(request, env, { success: true, synced: false, sources: [], recentLogs: [], total: 0 });
    }
    console.error('market_sources_error', cause);
    return error(request, env, 500, 'Source status unavailable');
  }
}

/**
 * POST /api/v1/market/analysis/refresh
 *
 * Requires an account: this is the only route here that makes outbound
 * requests to government servers on demand, and an open endpoint would let
 * anyone spend our rate limit against theirs.
 *
 * `force: true` bypasses the freshness and spacing gates, but only for the
 * sources named in `source_ids`. Forcing "everything" would be the same open
 * door with the lock left off.
 */
export async function marketRefreshRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  let body: { source_ids?: unknown; force?: unknown; max_sources?: unknown } | null = null;
  try { body = await request.json(); } catch { body = null; }

  const sourceIds = Array.isArray(body?.source_ids)
    ? body.source_ids.map((value) => String(value)).filter(Boolean)
    : undefined;
  const force = body?.force === true;
  if (force && !sourceIds?.length) {
    return error(request, env, 400, 'force requires an explicit source_ids list');
  }
  const maxRaw = Number(body?.max_sources ?? 3);
  if (!Number.isFinite(maxRaw) || maxRaw < 1 || maxRaw > 10) {
    return error(request, env, 400, 'max_sources must be between 1 and 10');
  }

  try {
    const report = await refreshMarket(env, { sourceIds, force, maxSources: Math.round(maxRaw) });
    return json(request, env, { success: true, ...report });
  } catch (cause) {
    if (isMissingRelation(cause)) {
      return error(request, env, 503, 'Market analysis migration has not been applied yet');
    }
    console.error('market_refresh_error', cause);
    return error(request, env, 500, 'Refresh failed');
  }
}

/**
 * GET /api/v1/market/analysis/:district
 *
 * District prices when they exist. DAM's national ticker carries no place at
 * all, so district rows are usually absent -- and rather than passing a
 * national figure off as local, the response says which scope it is serving.
 */
export async function marketAnalysisDistrictRoute(
  request: Request,
  env: Env,
  districtParam: string,
): Promise<Response> {
  try {
    const district = await resolveDistrict(env, districtParam);
    if (!district) return error(request, env, 404, `District not found: ${districtParam}`);

    const filters = readFilters(new URL(request.url));
    if ('invalid' in filters) return error(request, env, 400, filters.invalid);

    let scope: 'district' | 'national' = 'district';
    let prices = await listAggregates(env, { ...filters, districtId: district.id });

    if (!prices.length) {
      scope = 'national';
      prices = await listAggregates(env, { ...filters, districtId: undefined });
    }

    const contributing = new Set(prices.flatMap((price) => price.sources));
    const sources = (await loadSources(env.DB))
      .filter((source) => contributing.has(source.id))
      .map(publicSource);
    const warnings = await buildWarnings(env, prices);
    if (scope === 'national') {
      warnings.push('national_fallback');
    }

    return respond(request, env, prices, sources, warnings, {
      district,
      scope,
      districtPricesAvailable: scope === 'district' || prices.some((price) => price.districtId),
    });
  } catch (cause) {
    if (isMissingRelation(cause)) {
      return json(request, env, {
        success: true,
        synced: false,
        prices: [],
        total: 0,
        sources: [],
        warnings: ['migration_pending'],
        disclaimer: DISCLAIMER_EN,
        disclaimerBn: DISCLAIMER_BN,
        lastUpdated: new Date().toISOString(),
      });
    }
    console.error('market_analysis_district_error', cause);
    return error(request, env, 500, 'Market analysis unavailable');
  }
}

/**
 * A district may be given as its code or as its name in either language --
 * the docs say `{district_id}` but a caller holding a Bangla label should not
 * have to look the code up first.
 */
async function resolveDistrict(
  env: Env,
  value: string,
): Promise<{ id: string; nameEn: string; nameBn: string; division: string } | null> {
  const result = await env.DB.prepare(
    'SELECT id, name_en, name_bn, division FROM districts WHERE id = ?',
  ).bind(value).first<{ id: string; name_en: string; name_bn: string; division: string }>();
  if (result) return { id: result.id, nameEn: result.name_en, nameBn: result.name_bn, division: result.division };

  const all = await env.DB.prepare('SELECT id, name_en, name_bn, division FROM districts').all<{
    id: string; name_en: string; name_bn: string; division: string;
  }>();
  const key = normalizeKey(value);
  const match = all.results.find((row) => normalizeKey(row.name_en) === key || normalizeKey(row.name_bn) === key);
  return match
    ? { id: match.id, nameEn: match.name_en, nameBn: match.name_bn, division: match.division }
    : null;
}
