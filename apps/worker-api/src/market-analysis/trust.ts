import type {
  FreshnessLevel,
  TrustScoreFactors,
  VerificationStatus,
} from './types.ts';
import { freshnessLevel, DEFAULT_FRESHNESS } from './freshness.ts';
import type { FreshnessConfig } from './types.ts';

/**
 * Base reliability a source earns purely from what kind of publisher it is.
 * Tier is assigned when the source is configured, never derived from how
 * often a source agrees with itself -- a source that is consistently wrong
 * would score well under that rule.
 */
export const TRUST_TIER_SCORE: Record<number, number> = { 1: 100, 2: 85, 3: 70, 4: 55 };

/**
 * Weights for the confidence score. They sum to 1.
 *
 * What a source *is* and how *recent* its number is dominate, because those
 * are the two facts that decide whether a farmer should act. Agreement
 * between sources matters but cannot outweigh a single authoritative
 * publisher stating today's price. The remaining factors are tie-breakers
 * that stop an incomplete row from scoring like a complete one.
 */
export const CONFIDENCE_WEIGHTS = {
  sourceReliability: 0.30,
  recency: 0.25,
  crossSourceAgreement: 0.15,
  completeness: 0.10,
  parsingConfidence: 0.10,
  locationAvailability: 0.05,
  unitConsistency: 0.05,
} as const;

/**
 * Score for how old a price is. Stepped rather than linear: the drop that
 * matters is between "today's price" and "last week's price", not between
 * hour 3 and hour 4.
 */
export function recencyScore(ageHours: number | null): number {
  if (ageHours === null || !Number.isFinite(ageHours)) return 40;
  if (ageHours <= 1) return 100;
  if (ageHours <= 6) return 90;
  if (ageHours <= 24) return 75;
  if (ageHours <= 72) return 50;
  if (ageHours <= 168) return 25;
  return 5;
}

/** Fraction of the optional fields a reader would want that are actually present. */
export function completenessScore(fields: {
  marketName?: string | null;
  districtId?: string | null;
  division?: string | null;
  publishedAt?: string | null;
}): number {
  const present = [
    fields.marketName,
    fields.districtId,
    fields.division,
    fields.publishedAt,
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length;
  return Math.round((present / 4) * 100);
}

/**
 * How precisely a price can be placed.
 *
 * A district-level number is the one a farmer can compare with their own
 * market. A national average is still useful but not local, and a row with
 * no location at all can only ever be read as "somewhere".
 */
export function locationScore(row: {
  districtId?: string | null;
  division?: string | null;
  marketName?: string | null;
}): number {
  if (row.districtId) return 100;
  if (row.division) return 85;
  if (row.marketName) return 70;
  return 40;
}

/**
 * A unit the source published is worth full marks. A unit we inferred from
 * the catalog is worth 60: still usable, but it is our convention and not
 * the publisher's statement, and the difference is exactly what separates
 * a kilogram from a maund.
 */
export function unitScore(unitPublished: boolean): number {
  return unitPublished ? 100 : 60;
}

/**
 * How completely the parser read the row. Full marks when every field it
 * needed came from the payload; each substituted default costs a little.
 */
export function parsingScore(substitutedDefaults: number): number {
  return Math.max(0, 100 - substitutedDefaults * 20);
}

/**
 * Agreement between the sources that reported this commodity.
 *
 * A single source has nothing to agree with, so it gets a neutral 50 rather
 * than 100 (which would imply corroboration that does not exist) or 0 (which
 * would punish a lone authoritative publisher).
 *
 * With several sources, tight agreement raises the score above neutral and
 * wide disagreement pulls it down. Variation above 40% is treated as no
 * usable agreement at all: two numbers that far apart are not measuring the
 * same thing.
 */
export function agreementScore(variationPct: number | null, sourceCount: number): number {
  if (sourceCount < 2) return 50;
  if (variationPct === null || !Number.isFinite(variationPct)) return 50;
  if (variationPct >= 40) return 10;
  if (variationPct >= 25) return 30;
  if (variationPct >= 15) return 45;
  if (variationPct >= 8) return 65;
  if (variationPct >= 3) return 85;
  return 100;
}

/** Weighted sum of the factors, rounded to one decimal. Range 0-100. */
export function computeConfidence(factors: TrustScoreFactors): number {
  const total =
    factors.sourceReliability * CONFIDENCE_WEIGHTS.sourceReliability +
    factors.recency * CONFIDENCE_WEIGHTS.recency +
    factors.crossSourceAgreement * CONFIDENCE_WEIGHTS.crossSourceAgreement +
    factors.completeness * CONFIDENCE_WEIGHTS.completeness +
    factors.parsingConfidence * CONFIDENCE_WEIGHTS.parsingConfidence +
    factors.locationAvailability * CONFIDENCE_WEIGHTS.locationAvailability +
    factors.unitConsistency * CONFIDENCE_WEIGHTS.unitConsistency;
  return Math.round(Math.min(100, Math.max(0, total)) * 10) / 10;
}

/** Confidence below this is a claim nobody has checked. */
export const VERIFIED_CONFIDENCE = 70;

/**
 * Verification label for a record.
 *
 * `verified` is a high bar on purpose: the publisher has to be tier 1-2, the
 * unit has to come from the source rather than from us, and the confidence
 * score has to clear the bar. Everything else is `unverified`, which is not a
 * criticism of the data -- it says we have not established it.
 *
 * `disputed` is written only by aggregation, when a group of sources spreads
 * so wide that they cannot all be right. No single row can contradict itself,
 * so nothing here ever returns it.
 */
export function verificationFor(input: {
  confidence: number;
  trustTier: number;
  unitPublished: boolean;
}): VerificationStatus {
  if (input.confidence < VERIFIED_CONFIDENCE) return 'unverified';
  if (input.trustTier > 2) return 'unverified';
  if (!input.unitPublished) return 'unverified';
  return 'verified';
}

/**
 * A neutral confidence for a record that has not been compared with any
 * other source yet. Neutral rather than zero: cross-source agreement is
 * genuinely unknown at ingest, and scoring it 0 would make every
 * single-source figure look discredited.
 */
export const NEUTRAL_AGREEMENT = 50;

/**
 * Confidence for one row as it is written to `market_price_records`.
 *
 * `crossSourceAgreement` is fixed at neutral here because a row is stored
 * before anything else has been compared with it; the real agreement score
 * is applied when rows are grouped into an aggregate.
 */
export function recordConfidence(input: {
  trustTier: number;
  ageHours: number | null;
  completeness: number;
  parsing: number;
  location: number;
  unitPublished: boolean;
}): number {
  return computeConfidence({
    sourceReliability: TRUST_TIER_SCORE[input.trustTier] ?? TRUST_TIER_SCORE[4],
    recency: recencyScore(input.ageHours),
    crossSourceAgreement: NEUTRAL_AGREEMENT,
    completeness: input.completeness,
    parsingConfidence: input.parsing,
    locationAvailability: input.location,
    unitConsistency: unitScore(input.unitPublished),
  });
}

/** Freshness of an aggregate: the freshest row it is built from. */
export function aggregateFreshness(
  agesHours: Array<number | null>,
  cfg: FreshnessConfig = DEFAULT_FRESHNESS,
): FreshnessLevel {
  const known = agesHours.filter((age): age is number => age !== null && Number.isFinite(age));
  // Nothing carries an age: report the least fresh level rather than the best
  // one we cannot support.
  if (!known.length) return 'outdated';
  return freshnessLevel(Math.min(...known), cfg);
}
