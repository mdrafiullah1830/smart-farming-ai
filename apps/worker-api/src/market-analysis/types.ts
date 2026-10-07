import type { Env } from '../types.ts';

export interface MarketSource {
  id: string;
  nameEn: string;
  nameBn: string;
  sourceType: SourceType;
  baseUrl: string;
  parserType: ParserType;
  trustTier: TrustTier;
  updateFrequencyHours: number;
  enabled: boolean;
  region?: string;
  supportedCategories: string[];
  parserConfig: Record<string, unknown>;
  rateLimitRps: number;
  timeoutMs: number;
  userAgent?: string;
  headers: Record<string, string>;
}

export type SourceType = 'government' | 'news' | 'agricultural_authority' | 'other';
export type ParserType = 'html_table' | 'json_api' | 'csv' | 'rss' | 'custom';
export type TrustTier = 1 | 2 | 3 | 4;

export interface Commodity {
  id: string;
  nameEn: string;
  nameBn: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
  validUnits: string[];
  season?: string;
  isActive: boolean;
}

export interface NormalizedPriceRecord {
  id: string;
  commodityId: string;
  normalizedName: string;
  category: string;
  priceMin: number;
  priceMax: number;
  priceAvg: number;
  currency: string;
  unit: string;
  marketName?: string;
  districtId?: string;
  division?: string;
  sourceId: string;
  sourceUrl: string;
  sourceType: SourceType;
  /** Trust tier the source held when this row was written. */
  trustTier: number;
  /** False when the unit came from the catalog rather than the source. */
  unitPublished: boolean;
  publishedAt?: string;
  fetchedAt: string;
  dataAgeHours?: number;
  verificationStatus: VerificationStatus;
  confidenceScore: number;
  parserVersion: string;
  rawData?: Record<string, unknown>;
}

export type VerificationStatus = 'verified' | 'unverified' | 'disputed';

export interface AggregatedPrice {
  id: string;
  commodityId: string;
  normalizedName: string;
  category: string;
  priceMin: number;
  priceMax: number;
  priceAvg: number;
  currency: string;
  unit: string;
  marketName?: string;
  districtId?: string;
  division?: string;
  sourceCount: number;
  sources: string[];
  priceVariationPct: number | null;
  hasDisagreement: boolean;
  overallConfidence: number;
  overallFreshness: FreshnessLevel;
  aggregatedAt: string;
  expiresAt: string;
}

export type FreshnessLevel = 'very_fresh' | 'fresh' | 'recent' | 'aged' | 'outdated';

export interface SourceLog {
  id: string;
  sourceId: string;
  status: 'success' | 'failed' | 'partial';
  httpStatus?: number;
  recordsExtracted: number;
  recordsValid: number;
  errorMessage?: string;
  durationMs: number;
  fetchedAt: string;
}

export interface FreshnessConfig {
  veryFreshHours: number;
  freshHours: number;
  recentHours: number;
  agedHours: number;
  outdatedHours: number;
}

export interface MarketPriceQuery {
  q?: string;
  category?: string;
  location?: string;
  district?: string;
  division?: string;
  limit?: number;
  offset?: number;
  freshness?: FreshnessLevel;
  minConfidence?: number;
}

export interface MarketPriceResponse {
  success: boolean;
  prices: AggregatedPrice[];
  total: number;
  sources: PublicMarketSource[];
  warnings?: string[];
  disclaimer?: string;
  disclaimerBn?: string;
  lastUpdated: string;
}

/**
 * The source record as served to clients. `headers` and `userAgent` describe
 * how *we* talk to a publisher and are never returned.
 */
export type PublicMarketSource = Omit<MarketSource, 'headers' | 'userAgent'>;

export interface SourceFetchResult {
  source: MarketSource;
  records: NormalizedPriceRecord[];
  log: SourceLog;
}

export interface ParsedPriceData {
  commodityName: string;
  commodityNameBn?: string;
  /** Raw as extracted: publishers print Bengali digits and separators. */
  priceMin: number | string;
  priceMax: number | string;
  unit?: string | null;
  marketName?: string;
  district?: string;
  division?: string;
  publishedAt?: string;
  /** How many optional fields the parser had to fill from config defaults. */
  substitutedDefaults: number;
  /**
   * True when the payload carried no unit and this one came from config.
   *
   * Kept apart from `substitutedDefaults` because it is the one substitution
   * that changes what we are allowed to claim: a unit we chose is a unit the
   * publisher never published, and no confidence score may treat it as one.
   */
  unitIsAssumed: boolean;
  rawData: Record<string, unknown>;
}

export interface TrustScoreFactors {
  sourceReliability: number;      // 0-100 based on trust tier
  recency: number;                // 0-100 based on data age
  completeness: number;           // 0-100 based on field completeness
  crossSourceAgreement: number;   // 0-100 based on agreement with other sources
  parsingConfidence: number;      // 0-100 based on parser confidence
  locationAvailability: number;   // 0-100 based on location data presence
  unitConsistency: number;        // 0-100 based on unit standardization
}

export interface AggregationGroup {
  commodityId: string;
  normalizedName: string;
  unit: string;
  districtId?: string;
  division?: string;
  records: NormalizedPriceRecord[];
}