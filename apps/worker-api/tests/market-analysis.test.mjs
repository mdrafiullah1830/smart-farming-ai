import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import worker from '../src/index.ts';
import { createToken } from '../src/auth.ts';
import {
  normalizeKey, parseNumber, resolveUnit, matchCommodity, resolvePrices,
} from '../src/market-analysis/normalize.ts';
import {
  freshnessLevel, recordAgeHours, meetsFreshness, DEFAULT_FRESHNESS,
} from '../src/market-analysis/freshness.ts';
import {
  agreementScore, computeConfidence, verificationFor, VERIFIED_CONFIDENCE,
} from '../src/market-analysis/trust.ts';
import { groupRecords, aggregateGroup, DISAGREEMENT_PCT } from '../src/market-analysis/aggregate.ts';
import { parsePayload, splitPriceRange } from '../src/market-analysis/parsers.ts';
import { normalizeParsed, rowToSource, reaggregate } from '../src/market-analysis/ingest.ts';

const TEST_SECRET = 'unit-test-signing-key';

/**
 * `rules` is a list of `{ test, row?, rows? }` matched against the SQL text.
 * Anything unmatched is empty, so a route that reaches a query the test did
 * not think about sees no rows rather than the wrong ones.
 */
function dbFor(rules = []) {
  const pick = (sql) => rules.find((rule) => rule.test(sql)) ?? {};
  const make = (rule) => ({
    first: async () => rule.row ?? null,
    all: async () => ({ results: rule.rows ?? [] }),
    run: async () => ({ success: true, meta: { changes: 1 } }),
  });
  return {
    prepare: (sql) => {
      const rule = pick(sql);
      return { bind: () => make(rule), ...make(rule) };
    },
    batch: async (stmts) => stmts.map(() => ({ success: true })),
  };
}

function makeEnv(overrides = {}) {
  return {
    JWT_SECRET: TEST_SECRET,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    AI_SERVICE_URL: 'https://ai.example.com',
    AI_SERVICE_TOKEN: 'test-ai-token',
    DB: dbFor(),
    UPLOADS: { put: async () => {} },
    RATE_LIMIT_KV: { get: async () => null, put: async () => {}, delete: async () => {} },
    ...overrides,
  };
}

async function request(path, { method = 'GET', token, body } = {}) {
  const bearer = token ? await token : null;
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const farmerToken = () => createToken({ id: 'farmer-1', email: 'farmer@example.com' }, TEST_SECRET);

const KG_ONLY = { defaultUnit: 'kg', validUnits: ['kg'] };

function record(overrides = {}) {
  return {
    id: 'rec:a:rice::kg',
    commodityId: 'rice',
    normalizedName: 'ধান',
    category: 'staple',
    priceMin: 100,
    priceMax: 110,
    priceAvg: 105,
    currency: 'BDT',
    unit: 'kg',
    sourceId: 'a',
    sourceUrl: 'https://a.example',
    sourceType: 'government',
    trustTier: 1,
    unitPublished: true,
    fetchedAt: new Date().toISOString(),
    dataAgeHours: 1,
    verificationStatus: 'verified',
    confidenceScore: 80,
    parserVersion: '1.0',
    ...overrides,
  };
}

// The published shape DAM serves on ?L=B, reduced to three items.
const DAM_HTML = `
<span class="stockbox"><a href="#1">ভাতের চাল (মিনিকেট)</a>: ৭২.০০ - ৭৫.০০ টাকা</span>
<span class="stockbox"><a href="#2">চাল (আটা)</a>: ৩৯.০০ - ৪১.০০ টাকা</span>
<span class="stockbox"><a href="#3">ডিম (মুরগি)</a>: ১৮০.০০ - ১৯০.০০ টাকা</span>`;

const DAM_CONFIG = JSON.parse(JSON.stringify({
  pattern: "<a\\b[^>]*href\\s*=\\s*['\"]#[^'\"]*['\"][^>]*>\\s*([^<]+?)\\s*</a>\\s*:?\\s*([\\d০-৯][\\d০-৯.,]*)\\s*(?:-|–|—)\\s*([\\d০-৯][\\d০-৯.,]*)",
  groupNames: ['commodity', 'priceMin', 'priceMax'],
  defaultUnit: 'kg',
  marketName: 'National retail average',
  maxMatches: 500,
}));

describe('Key normalization', () => {
  it('folds Bengali digits so a price compares with an ASCII one', () => {
    assert.equal(normalizeKey('৭২'), '72');
    assert.equal(parseNumber('৭২.০০'), 72);
    assert.equal(parseNumber('১,২৩৪'), 1234);
  });

  it('keeps combining marks, because dropping them merges different words', () => {
    // কাঁচা (raw mango) vs কচা are not the same word once the Chandrabindu goes.
    assert.notEqual(normalizeKey('কাঁচা আলু'), normalizeKey('কচা আলু'));
  });

  it('folds dashes and brackets but keeps the marks that carry meaning', () => {
    // The en dash is editorial; the visarga is not, so it survives.
    assert.equal(normalizeKey('ভাতের চাল – (মিনিকেট)'), normalizeKey('ভাতের চাল মিনিকেট'));
    assert.equal(normalizeKey('মাংসঃ– গরু'), normalizeKey('মাংসঃ গরু'));
    assert.notEqual(normalizeKey('মাংসঃ গরু'), normalizeKey('মাংস গরু'));
  });

  it('returns null rather than NaN for a price it cannot read', () => {
    assert.equal(parseNumber('আজ'), null);
    assert.equal(parseNumber(''), null);
  });
});

describe('Unit resolution', () => {
  it("takes the source's own unit when it is one the commodity accepts", () => {
    const resolved = resolveUnit('কেজি', KG_ONLY);
    assert.deepEqual(resolved, { unit: 'kg', published: true });
  });

  it('falls back to the catalog convention and says the unit is not published', () => {
    const resolved = resolveUnit(null, KG_ONLY);
    // The honest outcome: usable, but not something the publisher claimed.
    assert.equal(resolved.unit, 'kg');
    assert.equal(resolved.published, false);
  });

  it('rejects a unit the commodity does not accept instead of converting', () => {
    const resolved = resolveUnit('মণ', KG_ONLY);
    // A maund is ~37kg. Recording it against a per-kilo row is a 37x error.
    assert.equal(resolved.unit, null);
    assert.equal(resolved.reason, 'not_valid');
  });
});

describe('Commodity matching', () => {
  const commodities = [
    {
      id: 'cm-rice', nameEn: 'Rice', nameBn: 'ভাতের চাল', aliases: ['আমন চাল', 'মিনিকেট চাল'],
      category: 'staple', defaultUnit: 'kg', validUnits: ['kg'], isActive: true,
    },
    {
      id: 'cm-potato', nameEn: 'Potato', nameBn: 'আলু', aliases: ['আলু'],
      category: 'vegetable', defaultUnit: 'kg', validUnits: ['kg'], isActive: true,
    },
  ];

  it('matches the literal published label first', () => {
    assert.equal(matchCommodity('ভাতের চাল', commodities).commodity?.id, 'cm-rice');
    assert.equal(matchCommodity('Rice', commodities).via, 'name');
  });

  it('refuses a label it does not recognise rather than guessing a crop', () => {
    const match = matchCommodity('অজানা পণ্য', commodities);
    assert.equal(match.commodity, null);
    assert.equal(match.via, null);
  });

  it('leaves an ambiguous prefix alone', () => {
    // Two aliases could claim this label, and picking either would mislabel
    // a grain that nobody priced.
    assert.equal(matchCommodity('আলু কাঁচা', commodities).commodity, null);
  });
});

describe('Price resolution', () => {
  it('copies a single bound so a lone quote keeps its range', () => {
    assert.deepEqual(resolvePrices({ priceMin: 50, priceMax: null }), {
      priceMin: 50, priceMax: 50, priceAvg: 50,
    });
  });

  it('drops zero and inverted bounds', () => {
    assert.equal(resolvePrices({ priceMin: 0, priceMax: 0 }), null);
    assert.equal(resolvePrices({ priceMin: 90, priceMax: 80 }), null);
    assert.equal(resolvePrices({ priceMin: null, priceMax: null }), null);
  });
});

describe('Freshness', () => {
  it('buckets an age at inclusive boundaries', () => {
    assert.equal(freshnessLevel(1), 'very_fresh');
    assert.equal(freshnessLevel(6), 'fresh');
    assert.equal(freshnessLevel(24), 'recent');
    assert.equal(freshnessLevel(72), 'aged');
    assert.equal(freshnessLevel(168), 'outdated');
    assert.equal(freshnessLevel(169), 'outdated');
  });

  it('reports an unknown age as outdated rather than claiming a level', () => {
    assert.equal(freshnessLevel(null), 'outdated');
    assert.equal(freshnessLevel(undefined), 'outdated');
    assert.equal(freshnessLevel(Number.NaN), 'outdated');
    assert.equal(freshnessLevel(-1), 'outdated');
  });

  it("prefers the publisher's timestamp over ours", () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    const published = recordAgeHours('2026-10-07T10:00:00Z', '2026-10-07T11:30:00Z', now);
    assert.equal(published, 2);
    // Without a published_at we can only say when we fetched it.
    assert.equal(recordAgeHours(null, '2026-10-07T11:30:00Z', now), 0.5);
  });

  it('treats freshness as at-least, not exactly', () => {
    assert.equal(meetsFreshness('very_fresh', 'fresh'), true);
    assert.equal(meetsFreshness('fresh', 'fresh'), true);
    assert.equal(meetsFreshness('recent', 'fresh'), false);
  });
});

describe('Confidence and verification', () => {
  it('keeps the score inside 0-100 whatever the inputs', () => {
    assert.equal(computeConfidence({
      sourceReliability: 100, recency: 100, crossSourceAgreement: 100,
      completeness: 100, parsingConfidence: 100, locationAvailability: 100, unitConsistency: 100,
    }), 100);
    assert.equal(computeConfidence({
      sourceReliability: 0, recency: 0, crossSourceAgreement: 0,
      completeness: 0, parsingConfidence: 0, locationAvailability: 0, unitConsistency: 0,
    }), 0);
  });

  it('gives a lone source a neutral agreement score', () => {
    // 100 would imply corroboration that does not exist; 0 would punish a
    // single authoritative publisher for having no competitors.
    assert.equal(agreementScore(0, 1), 50);
    assert.equal(agreementScore(0, 0), 50);
    assert.ok(agreementScore(0, 3) > 50);
    assert.ok(agreementScore(45, 3) < 50);
  });

  it('requires confidence, a top-2 tier and a published unit to say verified', () => {
    const clean = { confidence: VERIFIED_CONFIDENCE, trustTier: 1, unitPublished: true };
    assert.equal(verificationFor(clean), 'verified');
    assert.equal(verificationFor({ ...clean, confidence: VERIFIED_CONFIDENCE - 0.1 }), 'unverified');
    assert.equal(verificationFor({ ...clean, trustTier: 3 }), 'unverified');
    // Our catalog convention is not the publisher's claim, however fresh.
    assert.equal(verificationFor({ ...clean, unitPublished: false }), 'unverified');
  });
});

describe('Aggregation', () => {
  it('never mixes units or places into one figure', () => {
    const groups = groupRecords([
      record({ id: 'r1', unit: 'kg', sourceId: 'a' }),
      record({ id: 'r2', unit: 'maund', sourceId: 'a' }),
      record({ id: 'r3', unit: 'kg', districtId: '52', sourceId: 'a' }),
      record({ id: 'r4', unit: 'kg', sourceId: 'b' }),
    ]);
    assert.equal(groups.length, 3);
  });

  it('flags a spread wider than the disagreement threshold', () => {
    const group = groupRecords([
      record({ id: 'a', sourceId: 'a', priceMin: 100, priceMax: 100, priceAvg: 100, confidenceScore: 90 }),
      record({ id: 'b', sourceId: 'b', priceMin: 150, priceMax: 150, priceAvg: 150, confidenceScore: 90 }),
    ])[0];
    const aggregate = aggregateGroup(group, { now: Date.now() });
    // (150-100)/125 = 40%, above DISAGREEMENT_PCT.
    assert.ok(aggregate.priceVariationPct > DISAGREEMENT_PCT);
    assert.equal(aggregate.hasDisagreement, true);
    assert.equal(aggregate.sourceCount, 2);
  });

  it('does not cry disagreement over ordinary variation', () => {
    const group = groupRecords([
      record({ id: 'a', sourceId: 'a', priceMin: 100, priceMax: 100, priceAvg: 100 }),
      record({ id: 'b', sourceId: 'b', priceMin: 104, priceMax: 104, priceAvg: 104 }),
    ])[0];
    const aggregate = aggregateGroup(group, { now: Date.now() });
    assert.equal(aggregate.hasDisagreement, false);
    assert.ok(aggregate.overallConfidence > 0);
  });

  it('cannot disagree with itself: one source is never disputed', () => {
    const aggregate = aggregateGroup(groupRecords([record()])[0], { now: Date.now() });
    assert.equal(aggregate.hasDisagreement, false);
    assert.equal(aggregate.sourceCount, 1);
  });

  it('serves an aggregate until its fastest source could have republished', () => {
    const now = Date.now();
    const aggregate = aggregateGroup(groupRecords([record()])[0], { now, cadence: { a: 6 } });
    assert.equal(Date.parse(aggregate.expiresAt), now + 6 * 3_600_000);
    // A missing cadence falls back to a bounded default rather than never expiring.
    const uncadenced = aggregateGroup(groupRecords([record()])[0], { now });
    assert.ok(Date.parse(uncadenced.expiresAt) > now);
  });

  it('reports outdated when no row knows its own age', () => {
    const aggregate = aggregateGroup(
      groupRecords([record({ dataAgeHours: undefined })])[0],
      { now: Date.now(), freshness: DEFAULT_FRESHNESS },
    );
    assert.equal(aggregate.overallFreshness, 'outdated');
  });
});

describe('Parsers', () => {
  it('reads the published DAM ticker shape, Bengali digits and all', () => {
    const rows = parsePayload('custom', DAM_HTML, DAM_CONFIG);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].commodityName, 'ভাতের চাল (মিনিকেট)');
    assert.equal(rows[0].priceMin, '৭২.০০');
    assert.equal(rows[0].priceMax, '৭৫.০০');
    // No unit column exists on the page, so it came from config.
    assert.equal(rows[0].unit, 'kg');
    assert.ok(rows[0].substitutedDefaults >= 1);
  });

  it('splits a price range written with an en dash', () => {
    assert.deepEqual(splitPriceRange('৭২.০০ – ৭৫.০০'), { min: '৭২.০০', max: '৭৫.০০' });
    assert.deepEqual(splitPriceRange('50'), { min: '50', max: '50' });
    assert.deepEqual(splitPriceRange(''), { min: null, max: null });
  });

  it('returns nothing for a payload with no recognisable rows', () => {
    assert.deepEqual(parsePayload('custom', '<html>nothing here</html>', DAM_CONFIG), []);
    assert.deepEqual(parsePayload('csv', 'no,data,here\nnothing,useful,today'), []);
  });

  it('refuses a parser type it does not have rather than guessing', () => {
    assert.throws(() => parsePayload('divination', DAM_HTML, DAM_CONFIG), /unsupported parser/);
  });

  it('refuses a custom parser with no pattern to run', () => {
    assert.throws(() => parsePayload('custom', DAM_HTML, {}), /pattern/);
  });
});

describe('Analysis routes', () => {
  it('serves the price list without an account', async () => {
    const res = await worker.fetch(await request('/api/v1/market/analysis'), makeEnv());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.prices));
    assert.ok(data.total >= 0);
    // Every price list carries the fact that it is an aggregation.
    assert.match(data.disclaimer, /not a quote/);
    assert.match(data.disclaimerBn, /নিশ্চিত করুন/);
  });

  it('rejects a nonsensical page size before touching the database', async () => {
    const res = await worker.fetch(await request('/api/v1/market/analysis?limit=0'), makeEnv());
    assert.equal(res.status, 400);
    const res2 = await worker.fetch(await request('/api/v1/market/analysis?freshness=stale'), makeEnv());
    assert.equal(res2.status, 400);
  });

  it('serves the commodity catalog as public reference data', async () => {
    const res = await worker.fetch(await request('/api/v1/market/analysis/commodities'), makeEnv());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.commodities));
  });

  it('serves source status without handing out connection details', async () => {
    const sourceRow = {
      id: 'dam_gov',
      name_en: 'Directorate of Agricultural Marketing',
      name_bn: 'কৃষি বিপণন অধিদপ্তর',
      source_type: 'government',
      base_url: 'https://market.dam.gov.bd',
      parser_type: 'custom',
      trust_tier: 1,
      update_frequency_hours: 6,
      enabled: 1,
      region: null,
      supported_categories_json: '["staple"]',
      parser_config_json: '{"pattern":"x","groupNames":["commodity"]}',
      rate_limit_rps: 0.2,
      timeout_ms: 10000,
      user_agent: 'smart-farming-bot/1.0',
      headers_json: '{"X-Api-Key":"secret"}',
    };
    const env = makeEnv({ DB: dbFor([
      { test: (sql) => sql.includes('FROM market_sources'), rows: [sourceRow] },
    ]) });
    const res = await worker.fetch(await request('/api/v1/market/analysis/sources'), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    const served = data.sources.find((source) => source.id === 'dam_gov');
    assert.ok(served);
    // How we authenticate to a publisher is our business, not a client's.
    assert.equal(served.headers, undefined);
    assert.equal(served.userAgent, undefined);
    assert.equal(served.trustTier, 1);
    assert.equal(served.baseUrl, 'https://market.dam.gov.bd');
  });

  it('reports a migration that has not been applied as degraded, not an error', async () => {
    const missing = () => { const err = new Error('no such table'); err.code = 'SQLITE_ERROR'; throw err; };
    const env = makeEnv({
      DB: {
        prepare: () => ({ bind: () => ({ first: missing, all: missing, run: missing }), first: missing, all: missing, run: missing }),
        batch: missing,
      },
    });
    const res = await worker.fetch(await request('/api/v1/market/analysis'), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.synced, false);
    assert.equal(data.total, 0);
  });

  it('requires an account to trigger a refresh', async () => {
    const res = await worker.fetch(
      await request('/api/v1/market/analysis/refresh', { method: 'POST', body: {} }),
      makeEnv(),
    );
    assert.equal(res.status, 401);
  });

  it('does not allow forcing a refresh without naming what to force', async () => {
    const res = await worker.fetch(
      await request('/api/v1/market/analysis/refresh', {
        method: 'POST', token: await farmerToken(), body: { force: true },
      }),
      makeEnv(),
    );
    // force:true with no source list is the open door again.
    assert.equal(res.status, 400);
  });

  it('rejects an unbounded refresh request', async () => {
    const res = await worker.fetch(
      await request('/api/v1/market/analysis/refresh', {
        method: 'POST', token: await farmerToken(), body: { max_sources: 500 },
      }),
      makeEnv(),
    );
    assert.equal(res.status, 400);
  });

  it('runs a bounded refresh for an authenticated caller', async () => {
    const res = await worker.fetch(
      await request('/api/v1/market/analysis/refresh', { method: 'POST', token: await farmerToken(), body: {} }),
      makeEnv(),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.results.length, 0);
  });

  it('serves national figures for a district that has no local prices, and says so', async () => {
    const env = makeEnv({ DB: dbFor([
      { test: (sql) => sql.includes('FROM districts WHERE id = ?'), row: { id: '52', name_en: 'Rangpur', name_bn: 'রংপুর', division: 'Rangpur' } },
      { test: (sql) => sql.includes('district_id = ?') && sql.includes('market_aggregated_prices'), rows: [] },
      { test: (sql) => sql.includes('market_aggregated_prices'), rows: [{
        id: 'agg:rice:::kg', commodity_id: 'rice', normalized_name: 'ভাতের চাল', category: 'staple',
        price_min: 72, price_max: 75, price_avg: 73.5, currency: 'BDT', unit: 'kg',
        market_name: 'National retail average', district_id: null, division: null,
        source_count: 1, sources_json: '["dam_gov"]', price_variation_pct: 0,
        has_disagreement: 0, overall_confidence: 61.5, overall_freshness: 'fresh',
        aggregated_at: '2026-10-07T06:00:00.000Z', expires_at: '2026-10-07T12:00:00.000Z',
      }] },
      { test: (sql) => sql.includes('unit_published = 0'), row: { n: 1 } },
    ]) });
    const res = await worker.fetch(await request('/api/v1/market/analysis/52'), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.scope, 'national');
    assert.equal(data.district.id, '52');
    assert.equal(data.prices.length, 1);
    // Passing a national average off as a local one is the failure this flags.
    assert.ok(data.warnings.includes('national_fallback'));
    assert.ok(data.warnings.some((warning) => warning.startsWith('unit_assumed')));
    assert.match(data.disclaimer, /not a quote/);
  });

  it('resolves a district by its Bangla name', async () => {
    const env = makeEnv({ DB: dbFor([
      { test: (sql) => sql.includes('FROM districts WHERE id = ?'), row: null },
      { test: (sql) => sql.includes('FROM districts'), rows: [
        { id: '52', name_en: 'Rangpur', name_bn: 'রংপুর', division: 'Rangpur' },
      ] },
      { test: (sql) => sql.includes('market_aggregated_prices'), rows: [] },
    ]) });
    const res = await worker.fetch(await request(`/api/v1/market/analysis/${encodeURIComponent('রংপুর')}`), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.district.id, '52');
    assert.equal(data.prices.length, 0);
  });

  it('404s an unknown district rather than returning everything', async () => {
    const res = await worker.fetch(await request('/api/v1/market/analysis/9999'), makeEnv());
    assert.equal(res.status, 404);
  });
});

describe('Unit provenance', () => {
  it('knows when the unit came from config rather than the page', () => {
    // DAM prints no unit at all, so every row's kg is ours, not theirs.
    const rows = parsePayload('custom', DAM_HTML, DAM_CONFIG);
    for (const row of rows) {
      assert.equal(row.unit, 'kg');
      assert.equal(row.unitIsAssumed, true);
    }
  });

  it('does not flag a unit the payload actually printed', () => {
    const csv = 'commodity,price,unit\nRice,10 - 12,kg\nPotato,20 - 22,';
    const rows = parsePayload('csv', csv, {
      columns: { commodity: 'commodity', priceRange: 'price', unit: 'unit' },
      defaultUnit: 'kg',
    });
    assert.equal(rows[0].unitIsAssumed, false);
    assert.equal(rows[1].unitIsAssumed, true);
  });
});

describe('Ingest', () => {
  const damSource = rowToSource({
    id: 'dam_gov', name_en: 'DAM', name_bn: 'কৃষি বিপণন', source_type: 'government',
    base_url: 'https://market.dam.gov.bd', parser_type: 'custom', trust_tier: 1,
    update_frequency_hours: 6, enabled: 1, region: null,
    supported_categories_json: '[]', parser_config_json: '{}',
    rate_limit_rps: 0.2, timeout_ms: 10000, user_agent: null, headers_json: '{}',
  });

  const catalog = [
    {
      id: 'cm-rice', nameEn: 'Rice (Miniket)', nameBn: 'ভাতের চাল (মিনিকেট)', aliases: ['মিনিকেট চাল'],
      category: 'staple', defaultUnit: 'kg', validUnits: ['kg'], isActive: true,
    },
    {
      id: 'cm-flour', nameEn: 'Flour', nameBn: 'চাল (আটা)', aliases: ['আটা'],
      category: 'staple', defaultUnit: 'kg', validUnits: ['kg'], isActive: true,
    },
    {
      id: 'cm-egg', nameEn: 'Egg', nameBn: 'ডিম (মুরগি)', aliases: ['ডিম'],
      category: 'protein', defaultUnit: 'kg', validUnits: ['kg'], isActive: true,
    },
  ];
  const noDistricts = { resolve: () => null };
  const now = Date.parse('2026-10-07T12:00:00Z');
  const fetchedAt = '2026-10-07T11:00:00Z';

  function normalize(payload = DAM_HTML) {
    const rows = parsePayload('custom', payload, DAM_CONFIG);
    return normalizeParsed({
      source: damSource, rows, commodities: catalog, districts: noDistricts, fetchedAt, now,
    });
  }

  it('turns every published label into a record and drops nothing quietly', () => {
    const outcome = normalize();
    assert.equal(outcome.records.length, 3);
    assert.deepEqual(outcome.unmatched, []);
    assert.deepEqual(outcome.rejected, []);
    // 2 substitutions per row: the unit and the market name.
    assert.equal(outcome.substitutedDefaults, 6);
  });

  it('refuses to call an assumed unit published, so the row stays unverified', () => {
    const outcome = normalize();
    for (const record of outcome.records) {
      assert.equal(record.unit, 'kg');
      assert.equal(record.unitPublished, false);
      // Fresh, tier-1, nationally-tickered -- and still unverified, because
      // the number carries a unit the publisher never wrote down.
      assert.equal(record.verificationStatus, 'unverified');
      assert.ok(record.confidenceScore > 0 && record.confidenceScore <= 100);
      assert.equal(record.trustTier, 1);
    }
  });

  it('gives one deterministic id per source, good, place and unit', () => {
    const outcome = normalize();
    const ids = outcome.records.map((record) => record.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids.sort(), [
      'rec:dam_gov:cm-egg:national:kg',
      'rec:dam_gov:cm-flour:national:kg',
      'rec:dam_gov:cm-rice:national:kg',
    ]);
    // Re-reading the same payload must replace, not duplicate.
    assert.deepEqual(normalize().records.map((record) => record.id).sort(), ids.sort());
  });

  it('reports a label the catalog does not recognise instead of guessing', () => {
    const outcome = normalize('<span><a href="#9">অজানা পণ্য</a>: ১০ - ১২</span>');
    assert.equal(outcome.records.length, 0);
    assert.deepEqual(outcome.unmatched, ['অজানা পণ্য']);
  });

  it('rejects an unreadable price with a reason rather than storing zero', () => {
    const outcome = normalize('<span><a href="#1">ভাতের চাল (মিনিকেট)</a>: 0 - 0</span>');
    assert.equal(outcome.records.length, 0);
    assert.equal(outcome.rejected[0].reason, 'unreadable_price');
  });
});

describe('Disputed verification status', () => {
  function recordRow(overrides = {}) {
    return {
      id: 'rec:a', commodity_id: 'cm-rice', normalized_name: 'ভাতের চাল', category: 'staple',
      price_min: 100, price_max: 110, price_avg: 105, currency: 'BDT', unit: 'kg',
      market_name: 'National retail average', district_id: null, division: null,
      source_id: 'a', source_url: 'https://a.example', source_type: 'government',
      trust_tier: 1, unit_published: 0, published_at: null,
      fetched_at: '2026-10-07T11:00:00.000Z', data_age_hours: 1,
      verification_status: 'unverified', confidence_score: 77.5, parser_version: '1.0',
      raw_data_json: null,
      ...overrides,
    };
  }

  function capturingDb(recordsRows) {
    const inserts = [];
    const updates = [];
    const db = {
      prepare(sql) {
        const statement = {
          sql,
          first: async () => null,
          all: async () => {
            if (sql.includes('FROM market_price_records')) return { results: recordsRows };
            if (sql.includes('SELECT id FROM market_aggregated_prices')) return { results: [] };
            return { results: [] };
          },
          run: async () => ({ success: true, meta: { changes: 1 } }),
        };
        // Bound and unbound calls answer the same way: `reaggregate` reads
        // the record table unbound and only writes through bound statements.
        return { ...statement, bind: (...args) => ({ ...statement, args }) };
      },
      batch: async (stmts) => {
        for (const stmt of stmts) {
          if (typeof stmt.sql !== 'string') continue;
          if (stmt.sql.includes('INSERT INTO market_aggregated_prices')) inserts.push(stmt.args);
          if (stmt.sql.includes('SET verification_status')) updates.push(stmt.args);
        }
        return stmts.map(() => ({ success: true }));
      },
    };
    return { db, inserts, updates };
  }

  const cadence = { a: 6, b: 6 };

  it('marks every row of a wide-spread group disputed', async () => {
    const { db, inserts, updates } = capturingDb([
      recordRow({ id: 'rec:a', source_id: 'a', price_min: 100, price_max: 100, price_avg: 100 }),
      recordRow({ id: 'rec:b', source_id: 'b', price_min: 150, price_max: 150, price_avg: 150 }),
    ]);
    const result = await reaggregate(db, { now: Date.now(), cadence });
    assert.equal(result.recordCount, 2);
    assert.equal(result.aggregatesWritten, 1);
    // The aggregate itself records that its sources disagree...
    assert.equal(inserts[0][15], 1);
    // ...and singling out one row as the wrong answer would invent a verdict
    // the average cannot support, so both are flagged.
    assert.deepEqual(updates.map((args) => [args[1], args[0]]).sort(), [
      ['rec:a', 'disputed'], ['rec:b', 'disputed'],
    ]);
  });

  it('clears a dispute that later sources resolve', async () => {
    const { db, updates } = capturingDb([
      recordRow({ id: 'rec:a', source_id: 'a', price_min: 100, price_max: 100, price_avg: 100, verification_status: 'disputed' }),
      recordRow({ id: 'rec:b', source_id: 'b', price_min: 104, price_max: 104, price_avg: 104, verification_status: 'disputed' }),
    ]);
    await reaggregate(db, { now: Date.now(), cadence });
    // Leaving it flagged would let a resolved disagreement warn forever.
    assert.deepEqual(updates.map((args) => [args[1], args[0]]).sort(), [
      ['rec:a', 'unverified'], ['rec:b', 'unverified'],
    ]);
  });

  it('writes nothing when every row already carries the right status', async () => {
    const { db, updates } = capturingDb([
      recordRow({ id: 'rec:a', source_id: 'a', price_min: 100, price_max: 100, price_avg: 100 }),
      recordRow({ id: 'rec:b', source_id: 'b', price_min: 104, price_max: 104, price_avg: 104 }),
    ]);
    const result = await reaggregate(db, { now: Date.now(), cadence });
    assert.equal(updates.length, 0);
    assert.equal(result.aggregatesWritten, 1);
  });
});
