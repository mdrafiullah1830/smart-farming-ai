import type { FreshnessConfig, FreshnessLevel } from './types.ts';

/**
 * Thresholds used before `market_freshness_config` can be read. Mirrors the
 * defaults in migration 0011 so a binding without the migration behaves the
 * same as one with it.
 */
export const DEFAULT_FRESHNESS: FreshnessConfig = {
  veryFreshHours: 1,
  freshHours: 6,
  recentHours: 24,
  agedHours: 72,
  outdatedHours: 168,
};

/**
 * Hours between two instants, or null when either end is missing/unparseable.
 * Negative results are clamped to zero: clock skew between our fetch and the
 * publisher's timestamp should not read as "from the future".
 */
export function hoursBetween(from: string | null | undefined, to: number): number | null {
  if (!from) return null;
  const at = Date.parse(from);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (to - at) / 3_600_000);
}

/**
 * Age of a price record in hours.
 *
 * A publisher that stamps its own data (a `published_at`) is telling us when
 * the number was true, so that wins. A publisher that does not -- DAM's
 * national ticker has no date on it at all -- leaves us only knowing when *we*
 * pulled it, and that is what is reported. The difference matters: the second
 * is an upper bound on freshness, never a claim about the source's own
 * recency, and callers must not present it as the latter.
 */
export function recordAgeHours(
  publishedAt: string | null | undefined,
  fetchedAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  return hoursBetween(publishedAt, now) ?? hoursBetween(fetchedAt, now);
}

/**
 * Bucket an age into a freshness level.
 *
 * Boundaries are inclusive of the level's own ceiling (1h is very_fresh, not
 * fresh) so each level reads as "up to N hours old".
 *
 * An unknown age is reported as `outdated`. That is deliberate: refusing to
 * claim a level we cannot support is the right error, and `outdated` is the
 * only level that never over-states. Every record this feature writes carries
 * a `fetched_at`, so a null age reaching here means something upstream broke
 * and the response should look stale rather than fresh.
 */
export function freshnessLevel(
  ageHours: number | null | undefined,
  cfg: FreshnessConfig = DEFAULT_FRESHNESS,
): FreshnessLevel {
  if (ageHours === null || ageHours === undefined || !Number.isFinite(ageHours)) return 'outdated';
  if (ageHours < 0) return 'outdated';
  if (ageHours <= cfg.veryFreshHours) return 'very_fresh';
  if (ageHours <= cfg.freshHours) return 'fresh';
  if (ageHours <= cfg.recentHours) return 'recent';
  if (ageHours <= cfg.agedHours) return 'aged';
  return 'outdated';
}

/** Sort order for freshness levels, worst first. Used by query filtering. */
export const FRESHNESS_ORDER: FreshnessLevel[] = ['outdated', 'aged', 'recent', 'fresh', 'very_fresh'];

/**
 * True when a level is at least as fresh as the requested one, so
 * `?freshness=fresh` returns fresh and very_fresh but not recent.
 */
export function meetsFreshness(level: FreshnessLevel, requested: FreshnessLevel): boolean {
  return FRESHNESS_ORDER.indexOf(level) >= FRESHNESS_ORDER.indexOf(requested);
}
