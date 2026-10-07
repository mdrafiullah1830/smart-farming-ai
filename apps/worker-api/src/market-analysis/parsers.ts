import type { ParsedPriceData } from './types.ts';
import { parseNumber } from './normalize.ts';

/**
 * Parser configuration, read from `market_sources.parser_config_json`.
 *
 * The shape is deliberately plain data: adding a source must not require a
 * deploy. Each parser type reads only the keys it understands and ignores
 * the rest, so one source can carry a pattern and another a column map.
 */
export interface ParserConfig {
  /** `custom` only: regex whose capture groups map onto `groupNames`. */
  pattern?: string;
  /** `custom` only: field name for each capture group, in order. */
  groupNames?: string[];
  /** `html_table` only: 0-based index of the table holding the data. */
  tableIndex?: number;
  /**
   * `html_table` / `csv` / `json_api`: field -> header name or 0-based cell
   * index. Recognised fields are commodity, commodityBn, priceMin, priceMax,
   * priceRange, unit, market, district, division, publishedAt.
   */
  columns?: Record<string, string | number>;
  /** `json_api` only: dot path to the array of rows. Empty means root. */
  rowsPath?: string;
  /** `rss` only: field -> XML tag name inside each `<item>`. */
  fields?: Record<string, string>;
  /** Applied when the payload publishes no market of its own. */
  marketName?: string;
  /** Applied when the payload publishes no unit column. */
  defaultUnit?: string;
  district?: string;
  division?: string;
  publishedAt?: string;
  /** Rows whose commodity contains any of these are skipped. */
  exclude?: string[];
  /** Hard cap on rows produced by one payload. */
  maxMatches?: number;
}

/**
 * Publishers mark up the same table a dozen ways. Stripping to text first
 * keeps every table-shaped parser honest about what it can see, and the
 * entity decode stops a non-breaking space from breaking a numeric parse.
 */
export function stripMarkup(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rows of a table-shaped payload as plain text cells. */
export function htmlTableRows(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => stripMarkup(cell[1])))
    .filter((row) => row.some(Boolean));
}

/** RFC-4180-ish CSV. Quotes, doubled quotes and embedded commas all handled. */
export function csvRows(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!lines.length) return [];
  const split = (line: string): string[] => [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)]
    .map((m) => (m[1] ?? m[2] ?? '').replace(/""/g, '"').trim());
  const headers = split(lines.shift() ?? '');
  if (!headers.length) return [];
  return lines
    .filter((line) => line.trim())
    .map((line) => Object.fromEntries(headers.map((key, i) => [key, split(line)[i] ?? ''])));
}

function readPath(row: Record<string, unknown>, path: string): unknown {
  if (!path) return row;
  let current: unknown = row;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Split a single "35 - 42" style cell. Accepts the ASCII, en and em dashes a
 * publisher may use, plus the Bengali "থেকে". A cell with no separator is a
 * single figure and both bounds become that figure.
 */
export function splitPriceRange(value: string): { min: string | null; max: string | null } {
  const parts = value.split(/\s*(?:-|–|—|to|থেকে)\s*/i).filter((part) => part.trim() !== '');
  if (parts.length >= 2) return { min: parts[0].trim(), max: parts[1].trim() };
  if (parts.length === 1) return { min: parts[0].trim(), max: parts[0].trim() };
  return { min: null, max: null };
}

const KNOWN_FIELDS = [
  'commodity', 'commodityBn', 'priceMin', 'priceMax', 'priceRange',
  'unit', 'market', 'district', 'division', 'publishedAt',
] as const;
type KnownField = (typeof KNOWN_FIELDS)[number];

/**
 * Build one parsed row from a flat field map, counting how many optional
 * values had to come from config rather than from the payload.
 *
 * The count is what lets `trust.ts` lower parsing confidence: a source that
 * states its own market and unit earns more than one we filled in, and that
 * difference should be visible in the score rather than implied.
 */
function buildRecord(
  fields: Partial<Record<KnownField, unknown>>,
  config: ParserConfig,
): ParsedPriceData | null {
  const raw = String(fields.commodity ?? '').trim();
  if (!raw) return null;
  if (config.exclude?.some((needle) => raw.includes(needle))) return null;

  let priceMin = fields.priceMin;
  let priceMax = fields.priceMax;
  if (fields.priceRange !== undefined && fields.priceRange !== null && fields.priceRange !== '') {
    const range = splitPriceRange(String(fields.priceRange));
    priceMin = range.min;
    priceMax = range.max;
  }

  let substitutedDefaults = 0;
  const optional = (value: unknown, fallback: string | undefined): string | undefined => {
    const text = value === null || value === undefined ? '' : String(value).trim();
    if (text) return text;
    if (fallback === undefined || fallback === '') return undefined;
    substitutedDefaults += 1;
    return fallback;
  };

  // Captured before `optional` fills the gap: once a default is substituted
  // in, the row alone can no longer tell us whether anyone published it.
  const publishedUnit = fields.unit === null || fields.unit === undefined
    ? ''
    : String(fields.unit).trim();

  const unit = optional(fields.unit, config.defaultUnit) ?? null;
  const marketName = optional(fields.market, config.marketName);
  const district = optional(fields.district, config.district);
  const division = optional(fields.division, config.division);
  const publishedAt = optional(fields.publishedAt, config.publishedAt);

  return {
    commodityName: raw,
    commodityNameBn: fields.commodityBn === undefined || fields.commodityBn === null
      ? undefined
      : String(fields.commodityBn).trim() || undefined,
    priceMin: priceMin as number | string,
    priceMax: priceMax as number | string,
    unit,
    marketName,
    district,
    division,
    publishedAt,
    substitutedDefaults,
    unitIsAssumed: unit !== null && publishedUnit === '',
    rawData: { ...fields } as Record<string, unknown>,
  };
}

/** Guard against a pattern that would run away on a large payload. */
const MAX_PATTERN_LENGTH = 600;

function parseCustom(payload: string, config: ParserConfig): ParsedPriceData[] {
  const { pattern, groupNames } = config;
  if (!pattern || !groupNames?.length) throw new Error('custom parser needs pattern and groupNames');
  if (pattern.length > MAX_PATTERN_LENGTH) throw new Error('custom parser pattern too long');

  // Entity decode first so `&nbsp;` between a label and its price is
  // ordinary whitespace the pattern can cross.
  const text = payload.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ');
  const regex = new RegExp(pattern, 'gi');
  const limit = config.maxMatches ?? 500;
  const out: ParsedPriceData[] = [];
  let match: RegExpExecArray | null;
  let seen = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match[0] === '') { regex.lastIndex += 1; continue; }
    if (++seen > limit) break;
    const fields: Partial<Record<KnownField, unknown>> = {};
    groupNames.forEach((name, index) => {
      const value = match![index + 1];
      if (value !== undefined) fields[name as KnownField] = value;
    });
    const record = buildRecord(fields, config);
    if (record) out.push(record);
  }
  return out;
}

function parseTable(payload: string, config: ParserConfig): ParsedPriceData[] {
  const tables = [...payload.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  const table = tables[config.tableIndex ?? 0];
  if (table === undefined) return [];
  const rows = htmlTableRows(table);
  if (rows.length < 2) return [];

  // Columns may be given as cell positions or as header names. Header names
  // are resolved against the first row that contains them, so a title row
  // above the header does not shift every column by one.
  const columns = config.columns ?? {};
  const numeric = Object.values(columns).every((value) => typeof value === 'number');
  let header: string[] = [];
  let dataStart = 1;
  if (!numeric) {
    const headerIndex = rows.findIndex((row) =>
      Object.values(columns).some((value) => typeof value === 'string' && row.includes(value)));
    if (headerIndex >= 0) { header = rows[headerIndex]; dataStart = headerIndex + 1; }
  }

  const out: ParsedPriceData[] = [];
  for (let i = dataStart; i < rows.length; i += 1) {
    const row = rows[i];
    const fields: Partial<Record<KnownField, unknown>> = {};
    for (const [field, selector] of Object.entries(columns)) {
      const index = typeof selector === 'number'
        ? selector
        : header.findIndex((name) => name === selector);
      if (index >= 0) fields[field as KnownField] = row[index];
    }
    const record = buildRecord(fields, config);
    if (record) out.push(record);
  }
  return out;
}

function parseCsv(payload: string, config: ParserConfig): ParsedPriceData[] {
  const rows = csvRows(payload);
  const columns = config.columns ?? {};
  const out: ParsedPriceData[] = [];
  for (const row of rows) {
    const fields: Partial<Record<KnownField, unknown>> = {};
    for (const [field, selector] of Object.entries(columns)) {
      if (typeof selector === 'string') fields[field as KnownField] = row[selector];
    }
    const record = buildRecord(fields, config);
    if (record) out.push(record);
  }
  return out;
}

function parseJson(payload: string, config: ParserConfig): ParsedPriceData[] {
  const parsed = JSON.parse(payload) as unknown;
  const rows = readPath(parsed as Record<string, unknown>, config.rowsPath ?? '');
  if (!Array.isArray(rows)) throw new Error('json_api rowsPath did not resolve to an array');
  const columns = config.columns ?? {};
  const out: ParsedPriceData[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const fields: Partial<Record<KnownField, unknown>> = {};
    for (const [field, selector] of Object.entries(columns)) {
      if (typeof selector === 'string') fields[field as KnownField] = readPath(row as Record<string, unknown>, selector);
    }
    const record = buildRecord(fields, config);
    if (record) out.push(record);
  }
  return out;
}

function parseRss(payload: string, config: ParserConfig): ParsedPriceData[] {
  const fields = config.fields ?? {};
  const out: ParsedPriceData[] = [];
  for (const item of payload.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const values: Partial<Record<KnownField, unknown>> = {};
    for (const [field, tag] of Object.entries(fields)) {
      const found = item[1].match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (found) values[field as KnownField] = stripMarkup(found[1]);
    }
    const record = buildRecord(values, config);
    if (record) out.push(record);
  }
  return out;
}

/** A payload larger than this is truncated before parsing. */
const MAX_PAYLOAD_BYTES = 2_000_000;

/**
 * Parse a fetched payload into rows, chosen by the source's `parser_type`.
 *
 * A type with no configured rows (a table with no table, a pattern with no
 * pattern) returns an empty list rather than throwing, because "this source
 * currently publishes nothing recognisable" is a real and recoverable
 * outcome. Malformed JSON or an uncompilable pattern does throw: those are
 * configuration faults and the caller logs them as a failed fetch instead of
 * silently reporting a successful one with no rows.
 */
export function parsePayload(
  parserType: string,
  payload: string,
  config: ParserConfig = {},
): ParsedPriceData[] {
  const body = payload.length > MAX_PAYLOAD_BYTES ? payload.slice(0, MAX_PAYLOAD_BYTES) : payload;
  let rows: ParsedPriceData[];
  switch (parserType) {
    case 'custom': rows = parseCustom(body, config); break;
    case 'html_table': rows = parseTable(body, config); break;
    case 'csv': rows = parseCsv(body, config); break;
    case 'json_api': rows = parseJson(body, config); break;
    case 'rss': rows = parseRss(body, config); break;
    default: throw new Error(`unsupported parser type: ${parserType}`);
  }
  const limit = config.maxMatches ?? 500;
  return rows.slice(0, limit);
}

/**
 * Column maps the seeded sources and the fixtures in tests use. Exported so
 * a new source can be configured without rediscovering the field names.
 */
export const PRICE_FIELDS: KnownField[] = [...KNOWN_FIELDS];

/** Numeric validity shared by every parser's output. */
export function pricesAreSane(min: number | string, max: number | string): boolean {
  const lo = parseNumber(min);
  const hi = parseNumber(max);
  if (lo === null && hi === null) return false;
  const low = lo ?? (hi as number);
  const high = hi ?? low;
  return low >= 0 && high >= low;
}
