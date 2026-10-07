import type {
  AggregatedPrice,
  AggregationGroup,
  FreshnessConfig,
  NormalizedPriceRecord,
} from './types.ts';
import { DEFAULT_FRESHNESS } from './freshness.ts';
import { aggregateFreshness, agreementScore, CONFIDENCE_WEIGHTS, NEUTRAL_AGREEMENT } from './trust.ts';

/**
 * Sources disagreeing by more than this percentage of the mean is called a
 * disagreement rather than a range. 25% is chosen so that a genuine spread
 * between a wholesale and a retail figure is still reported as variation
 * while two publishers that cannot both be right trip the flag.
 */
export const DISAGREEMENT_PCT = 25;

/** How long an aggregate is served before it is rebuilt from fresh rows. */
const DEFAULT_EXPIRY_HOURS = 6;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Stable key so the same good in the same place aggregates across runs. */
export function groupKey(record: {
  commodityId: string;
  unit: string;
  districtId?: string | null;
  division?: string | null;
}): string {
  return [record.commodityId, record.unit, record.districtId ?? '', record.division ?? ''].join('|');
}

/**
 * Bucket rows by the thing a price is actually about: the good, the unit it
 * is quoted in, and where it was quoted.
 *
 * Units never mix. A kilogram and a maund of the same rice are not two
 * observations of one price, they are two different quantities, and averaging
 * them would invent a number nobody quoted. The same holds for a district
 * figure and a national one.
 */
export function groupRecords(records: NormalizedPriceRecord[]): AggregationGroup[] {
  const buckets = new Map<string, NormalizedPriceRecord[]>();
  for (const record of records) {
    const key = groupKey(record);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(record);
    else buckets.set(key, [record]);
  }
  return [...buckets.entries()].map(([key, grouped]) => {
    const head = grouped[0];
    return {
      commodityId: head.commodityId,
      normalizedName: head.normalizedName,
      unit: head.unit,
      districtId: head.districtId ?? undefined,
      division: head.division ?? undefined,
      records: grouped,
    };
  });
}

export interface AggregateOptions {
  freshness?: FreshnessConfig;
  now?: number;
  /** Hours an aggregate stays servable. */
  expiryHours?: number;
  /** `update_frequency_hours` per contributing source id. */
  cadence?: Record<string, number>;
}

/**
 * Combine one group's rows into a single published figure.
 *
 * The average is confidence-weighted rather than a plain mean: a tier-1
 * government number should move a national average more than an
 * uncorroborated one, and a plain mean would treat them as equals.
 *
 * `priceMin`/`priceMax` stay as the widest bounds actually observed. Narrow
 * them to the average's neighbourhood and the range stops describing what
 * sources reported; the whole point of publishing a range is to show the
 * spread, including when the spread is embarrassing.
 */
export function aggregateGroup(group: AggregationGroup, options: AggregateOptions = {}): AggregatedPrice {
  const freshnessCfg = options.freshness ?? DEFAULT_FRESHNESS;
  const now = options.now ?? Date.now();

  const records = group.records;
  const sources = [...new Set(records.map((record) => record.sourceId))];

  const priceMin = Math.min(...records.map((record) => record.priceMin));
  const priceMax = Math.max(...records.map((record) => record.priceMax));

  const totalWeight = records.reduce((sum, record) => sum + Math.max(1, record.confidenceScore), 0);
  const weightedAvg = records.reduce(
    (sum, record) => sum + record.priceAvg * Math.max(1, record.confidenceScore),
    0,
  ) / (totalWeight || 1);
  const priceAvg = round(weightedAvg, 2);

  const priceVariationPct = priceAvg > 0 ? round(((priceMax - priceMin) / priceAvg) * 100, 1) : null;
  const hasDisagreement = sources.length >= 2
    && priceVariationPct !== null
    && priceVariationPct > DISAGREEMENT_PCT;

  // Rows are scored at ingest with a neutral cross-source agreement, because
  // at that moment nothing has been compared with anything. Here the
  // comparison exists, so the neutral term is swapped for the real one.
  //
  // Swapping rather than re-deriving every factor keeps the published score
  // anchored to the row confidences a caller can inspect, and changes exactly
  // one thing: what the sources said about each other. The coefficient is the
  // agreement weight itself, so this is arithmetically what recomputing the
  // full score would give if every other factor were held still.
  const meanRecordConfidence = records.reduce((sum, record) => sum + record.confidenceScore, 0)
    / (records.length || 1);
  const agreement = agreementScore(priceVariationPct, sources.length);
  const overallConfidence = round(
    Math.min(100, Math.max(0,
      meanRecordConfidence + CONFIDENCE_WEIGHTS.crossSourceAgreement * (agreement - NEUTRAL_AGREEMENT))),
    1,
  );

  const ages = records.map((record) => record.dataAgeHours ?? null);
  const overallFreshness = aggregateFreshness(ages, freshnessCfg);

  // Serve this aggregate only until its fastest source could plausibly have
  // published something new. A source that republishes hourly should not let
  // its number sit behind a "fresh" label for a day.
  const intervals = sources
    .map((sourceId) => options.cadence?.[sourceId])
    .filter((hours): hours is number => typeof hours === 'number' && Number.isFinite(hours) && hours > 0);
  const expiryHours = options.expiryHours ?? Math.min(...intervals, DEFAULT_EXPIRY_HOURS);

  return {
    id: `agg:${group.commodityId}:${group.districtId ?? 'national'}:${group.division ?? ''}:${group.unit}`,
    commodityId: group.commodityId,
    normalizedName: group.normalizedName,
    category: records[0]?.category ?? '',
    priceMin: round(priceMin, 2),
    priceMax: round(priceMax, 2),
    priceAvg,
    currency: records[0]?.currency ?? 'BDT',
    unit: group.unit,
    marketName: records.find((record) => record.marketName)?.marketName,
    districtId: group.districtId,
    division: group.division,
    sourceCount: sources.length,
    sources,
    priceVariationPct,
    hasDisagreement,
    overallConfidence,
    overallFreshness,
    aggregatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + expiryHours * 3_600_000).toISOString(),
  };
}
