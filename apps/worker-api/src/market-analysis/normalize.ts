import type { Commodity, ParsedPriceData } from './types.ts';

/**
 * Digit and punctuation folding used before any comparison.
 *
 * Two things make Bangla text harder than lower-casing:
 *
 * 1. Publishers mix Bengali (৭২) and ASCII (72) digits, sometimes in the same
 *    table. Bengali digits are folded to ASCII so a price or an id compares.
 * 2. Labels are punctuated inconsistently -- "মাংসঃ– গরু" carries a visarga and
 *    an en dash where a writer may type "মাংস-গরু". Dashes, brackets and
 *    other punctuation become single spaces so the words line up.
 *
 * Mark characters ( Chandrabindu, visarga, vowel signs ) are kept. Folding
 * them away would turn "কাঁচা" into "ক চা", and two different words could
 * collide once their marks are gone.
 */
export function normalizeKey(value: string): string {
  return value
    .replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09E6))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a number that may be written in Bengali digits, with thousand
 * separators, or as a min/max pair. Returns null rather than NaN so a
 * malformed price is a dropped row, not a stored zero.
 */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09E6))
    .replace(/[,\s৳]/g, '')
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Canonical spellings of the units a Bangladeshi price list uses. Both the
 * Bangla word and the English one map to a single form so "কেজি" and "kg"
 * are the same unit rather than two that happen to look different.
 */
const UNIT_ALIASES: Record<string, string> = {
  'কেজি': 'kg', 'কিলোগ্রাম': 'kg', 'kg': 'kg', 'kgs': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'গ্রাম': 'g', 'g': 'g', 'gram': 'g', 'grams': 'g',
  'লিটার': 'litre', 'ltr': 'litre', 'l': 'litre', 'litre': 'litre', 'liter': 'litre', 'litres': 'litre',
  'মণ': 'maund', 'mon': 'maund', 'maund': 'maund',
  'ডজন': 'dozen', 'dozen': 'dozen', 'doz': 'dozen',
  'পিস': 'piece', 'টুকরো': 'piece', 'piece': 'piece', 'pieces': 'piece', 'pc': 'piece',
  'বান্ডল': 'bundle', 'bundle': 'bundle',
  'কেজি/বিঘা': 'kg_per_bigha',
};

export function canonicalUnit(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return UNIT_ALIASES[key] ?? UNIT_ALIASES[normalizeKey(value)] ?? null;
}

export type UnitResolution =
  | { unit: string; published: true }
  | { unit: string; published: false }
  | { unit: null; published: false; reason: 'missing' | 'unknown' | 'not_valid' };

/**
 * Decide the unit for a record.
 *
 * The source's own unit always wins. When the source publishes none we fall
 * back to the catalog's conventional unit and say so (`published: false`),
 * because the caller has to lower confidence for an inferred unit -- an
 * inferred unit presented as a published one is how a kilo becomes a maund.
 *
 * A unit the commodity does not accept is a rejection, not something to
 * round off: recording a maund price against a per-kilogram commodity would
 * be a 37x error that no amount of confidence scoring repairs.
 */
export function resolveUnit(
  sourceUnit: string | null | undefined,
  commodity: Pick<Commodity, 'defaultUnit' | 'validUnits'>,
): UnitResolution {
  const published = canonicalUnit(sourceUnit);
  if (published) {
    return commodity.validUnits.includes(published)
      ? { unit: published, published: true }
      : { unit: null, published: false, reason: 'not_valid' };
  }
  const fallback = canonicalUnit(commodity.defaultUnit);
  if (!fallback) return { unit: null, published: false, reason: 'missing' };
  if (!commodity.validUnits.includes(fallback)) {
    return { unit: null, published: false, reason: 'not_valid' };
  }
  return { unit: fallback, published: false };
}

export type CommodityMatch =
  | { commodity: Commodity; via: 'id' | 'name' | 'alias' | 'alias_prefix'; matchedAlias: string | null }
  | { commodity: null; via: null; matchedAlias: null };

/**
 * Resolve a published label to a catalog entry.
 *
 * Order matters and is not negotiable:
 *
 * 1. Exact id / English name / Bengali name / alias. This is the normal path
 *    because seeds carry the literal published label.
 * 2. An alias that the label *starts with*, used only when exactly one
 *    commodity claims it. A prefix rule that guesses between "আমন চাল - সরু"
 *    and "আমন চাল - মোটা" would attach the wrong grain to a price, and a
 *    wrong commodity is worse than no commodity.
 *
 * Anything unmatched returns a null commodity and is counted by the caller;
 * quietly attaching a label to the nearest-sounding crop is how a market
 * report starts lying.
 */
export function matchCommodity(label: string, commodities: Commodity[]): CommodityMatch {
  const key = normalizeKey(label);
  if (!key) return { commodity: null, via: null, matchedAlias: null };

  for (const commodity of commodities) {
    if (normalizeKey(commodity.id) === key) return { commodity, via: 'id', matchedAlias: null };
  }
  for (const commodity of commodities) {
    if (normalizeKey(commodity.nameEn) === key) return { commodity, via: 'name', matchedAlias: null };
  }
  for (const commodity of commodities) {
    if (normalizeKey(commodity.nameBn) === key) return { commodity, via: 'name', matchedAlias: null };
  }
  for (const commodity of commodities) {
    for (const alias of commodity.aliases) {
      if (normalizeKey(alias) === key) return { commodity, via: 'alias', matchedAlias: alias };
    }
  }

  const prefixes = commodities.filter((commodity) =>
    commodity.aliases.some((alias) => {
      const aliasKey = normalizeKey(alias);
      return aliasKey.length >= 4 && key.startsWith(aliasKey);
    }),
  );
  if (prefixes.length === 1) {
    const commodity = prefixes[0];
    const matched = commodity.aliases.find((alias) => {
      const aliasKey = normalizeKey(alias);
      return aliasKey.length >= 4 && key.startsWith(aliasKey);
    }) ?? null;
    return { commodity, via: 'alias_prefix', matchedAlias: matched };
  }

  return { commodity: null, via: null, matchedAlias: null };
}

/**
 * Turn a parsed row into the numbers the rest of the pipeline expects.
 *
 * A min/max pair is kept as published. When only one bound is given the
 * other is copied from it rather than left null: a single figure is a real
 * quote, and `price_min === price_max === 50` says exactly that while a
 * null bound would say we do not know.
 */
export function resolvePrices(
  parsed: Pick<ParsedPriceData, 'priceMin' | 'priceMax'>,
): { priceMin: number; priceMax: number; priceAvg: number } | null {
  const min = parseNumber(parsed.priceMin);
  const max = parseNumber(parsed.priceMax);
  if (min === null && max === null) return null;
  const lo = min ?? (max as number);
  const hi = max ?? lo;
  // Zero is not a price anyone quoted -- it is a cell we failed to read --
  // and letting it through would drag every average it touches toward zero.
  if (lo <= 0 || hi <= 0 || hi < lo) return null;
  return { priceMin: lo, priceMax: hi, priceAvg: Math.round(((lo + hi) / 2) * 100) / 100 };
}
