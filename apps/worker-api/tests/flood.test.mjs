import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import worker from '../src/index.ts';
import { createToken } from '../src/auth.ts';
import { assessFloodRisk, currentSeason, rainfallPressure, toTaka } from '../src/routes/flood.ts';

const TEST_SECRET = 'unit-test-signing-key';

const ZONE_ROW = {
  id: 'z1', district_id: '1', name_en: 'Haor basin', name_bn: 'হাওর বেসিন',
  flood_depth_m: 1.8, flood_duration_days: 14, flood_seasons: 'aman,boro', note: null,
};

// `changes` models the row count the statement actually matched. The default
// is 1, but a DELETE that matches nothing must report 0 so the route can
// answer 404 -- otherwise an ownership check would be untestable, because the
// mock would claim a stranger's row was deleted.
function dbReturning(row, allRows = [], { changes = 1 } = {}) {
  const stmt = {
    bind: () => ({
      first: async () => row,
      all: async () => ({ results: allRows }),
      run: async () => ({ success: true, meta: { changes } }),
    }),
    first: async () => row,
    all: async () => ({ results: allRows }),
    run: async () => ({ success: true, meta: { changes } }),
  };
  return { prepare: () => stmt, batch: async () => [{ success: true }] };
}

function makeEnv(overrides = {}) {
  return {
    JWT_SECRET: TEST_SECRET,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    AI_SERVICE_URL: 'https://ai.example.com',
    AI_SERVICE_TOKEN: 'test-ai-token',
    DB: dbReturning(null, []),
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

const farmerToken = async () => createToken({ id: 'farmer-1', email: 'farmer@example.com' }, TEST_SECRET);
const otherToken = async () => createToken({ id: 'other-1', email: 'other@example.com' }, TEST_SECRET);

const validExposure = {
  zone_id: 'z1',
  crop_name_en: 'Rice',
  crop_name_bn: 'ধান',
  area_acres: 2.5,
  seasons: 'aman',
  crop_value_taka: 120000,
  drainage_class: 2,
};

describe('Flood risk engine', () => {
  it('a deep, long, poorly drained zone is severe even with no rain forecast', () => {
    const r = assessFloodRisk({
      floodDepthM: 2.0, floodDurationDays: 21, drainageClass: 1,
      cropsInSeason: true, rainfallPressure: 0, rainMm7d: 0, season: 'aman',
    });
    assert.equal(r.level, 'severe');
    // The static half alone must reach a decision, or the advice silently
    // depends on a forecast that is unavailable half the time.
    assert.ok(r.score >= 0.75, `expected >=0.75, got ${r.score}`);
  });

  it('a shallow, short, well-drained zone is low risk in the same drought', () => {
    const r = assessFloodRisk({
      floodDepthM: 0.1, floodDurationDays: 0, drainageClass: 3,
      cropsInSeason: true, rainfallPressure: 0, rainMm7d: 0, season: 'aman',
    });
    assert.equal(r.level, 'low');
    assert.equal(r.actionDays, null);
  });

  it('rain raises the risk when a crop is standing, and cannot when it is not', () => {
    const base = { floodDepthM: 1.0, floodDurationDays: 10, drainageClass: 2, rainfallPressure: 0.8, rainMm7d: 120, season: 'aman' };
    const standing = assessFloodRisk({ ...base, cropsInSeason: true });
    const bare = assessFloodRisk({ ...base, cropsInSeason: false });
    assert.ok(standing.score > bare.score, `${standing.score} should exceed ${bare.score}`);
    // A field with nothing standing in it is not at risk from today's rain.
    assert.ok(['low', 'moderate'].includes(bare.level));
  });

  it('a severe risk gets the tightest decision window, and it is bilingual', () => {
    const severe = assessFloodRisk({ floodDepthM: 2.5, floodDurationDays: 25, drainageClass: 1, cropsInSeason: true, rainfallPressure: 1, rainMm7d: 200, season: 'aman' });
    const low = assessFloodRisk({ floodDepthM: 0, floodDurationDays: 0, drainageClass: 3, cropsInSeason: false, rainfallPressure: 0, rainMm7d: 0, season: 'boro' });
    assert.equal(severe.actionDays, 2);
    assert.equal(low.actionDays, null);
    assert.match(severe.actionWindowBn, /২ দিন/);
    assert.match(severe.actionWindowEn, /2 days/);
  });

  it('reasons are given in both languages and name the depth and the rain', () => {
    const r = assessFloodRisk({ floodDepthM: 1.4, floodDurationDays: 12, drainageClass: 1, cropsInSeason: true, rainfallPressure: 0.6, rainMm7d: 90, season: 'aman' });
    assert.ok(r.reasons_bn.length > 0 && r.reasons_en.length > 0);
    assert.ok(r.reasons_en.some((x) => /depth/i.test(x)));
    assert.ok(r.reasons_en.some((x) => /rain/i.test(x)));
  });

  it('rainfall pressure weighs total volume and how concentrated it is', () => {
    const gentle = rainfallPressure({ daily: { precipitation_sum: [60, 60], precipitation_hours: [6, 6] } });
    const burst = rainfallPressure({ daily: { precipitation_sum: [60, 60], precipitation_hours: [24, 24] } });
    // Same total over different hours: the burst is the dangerous one.
    assert.ok(burst.pressure > gentle.pressure, `${burst.pressure} should exceed ${gentle.pressure}`);
    assert.equal(gentle.rainMm7d, 120);
  });

  it('an empty or hole-riddden forecast scores zero instead of NaN', () => {
    const empty = rainfallPressure({});
    assert.equal(empty.pressure, 0);
    assert.equal(empty.rainMm7d, 0);
    const holes = rainfallPressure({ daily: { precipitation_sum: [null, 12], precipitation_hours: [null, null] } });
    assert.equal(holes.rainMm7d, 12);
    assert.ok(Number.isFinite(holes.pressure));
  });

  it('the season comes from the Bengali crop calendar', () => {
    assert.equal(currentSeason(new Date('2026-07-15T00:00:00Z')), 'aman');
    assert.equal(currentSeason(new Date('2026-01-15T00:00:00Z')), 'boro');
    assert.equal(currentSeason(new Date('2026-11-05T00:00:00Z')), 'aus');
  });

  it('taka is always a whole number', () => {
    assert.equal(toTaka(1234.56), 1235);
    assert.ok(Number.isInteger(toTaka(0.4)));
  });
});
describe('Flood exposure routes', () => {
  it('creating an exposure requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/exposures', { method: 'POST', body: validExposure }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('the assessment requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/assessment'), makeEnv());
    assert.equal(res.status, 401);
  });

  it('creates an exposure for a known zone', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/exposures', {
      method: 'POST', token: await farmerToken(), body: validExposure,
    }), makeEnv({ DB: dbReturning(ZONE_ROW) }));
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.exposure.crop_name_en, 'Rice');
    assert.ok(data.exposure.id);
  });

  it('an unknown zone is a 400 naming the field, not an opaque 500', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/exposures', {
      method: 'POST', token: await farmerToken(), body: { ...validExposure, zone_id: 'no-such-zone' },
    }), makeEnv({ DB: dbReturning(null) }));
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /zone_id/);
    assert.match(data.error, /flood\/zones/);
  });

  it('rejects a non-positive area, a bad drainage class and a negative value', async () => {
    const env = makeEnv({ DB: dbReturning(ZONE_ROW) });
    const zero = await worker.fetch(await request('/api/v1/flood/exposures', {
      method: 'POST', token: await farmerToken(), body: { ...validExposure, area_acres: 0 },
    }), env);
    assert.equal(zero.status, 400);

    const drainage = await worker.fetch(await request('/api/v1/flood/exposures', {
      method: 'POST', token: await farmerToken(), body: { ...validExposure, drainage_class: 9 },
    }), env);
    assert.equal(drainage.status, 400);

    const negative = await worker.fetch(await request('/api/v1/flood/exposures', {
      method: 'POST', token: await farmerToken(), body: { ...validExposure, crop_value_taka: -5 },
    }), env);
    assert.equal(negative.status, 400);
  });

  it('another farmer cannot delete an exposure', async () => {
    // changes: 0 is what a DELETE reports when the id belongs to somebody else.
    const res = await worker.fetch(await request('/api/v1/flood/exposures/e1', {
      method: 'DELETE', token: await otherToken(),
    }), makeEnv({ DB: dbReturning(null, [], { changes: 0 }) }));
    assert.equal(res.status, 404);
  });

  it('the district view refuses an unknown id with a 400 and a pointer', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/districts/9999'), makeEnv({ DB: dbReturning(null, []) }));
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /district_id/);
    assert.match(data.error, /locations\/zillas/);
  });

  it('the public zone list needs no authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/zones'), makeEnv({ DB: dbReturning(null, [ZONE_ROW]) }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.zones.length, 1);
    assert.equal(data.zones[0].name_en, 'Haor basin');
  });

  it('recording an action against a stranger exposure is a 404', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/actions', {
      method: 'POST', token: await otherToken(), body: { exposure_id: 'e1', action: 'early' },
    }), makeEnv({ DB: dbReturning(null, []) }));
    assert.equal(res.status, 404);
  });

  it('rejects an action outside the allowed set', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/actions', {
      method: 'POST', token: await farmerToken(), body: { exposure_id: 'e1', action: 'sell' },
    }), makeEnv({ DB: dbReturning(ZONE_ROW) }));
    assert.equal(res.status, 400);
  });

  it('records an action and snapshots the risk level with it', async () => {
    const res = await worker.fetch(await request('/api/v1/flood/actions', {
      method: 'POST', token: await farmerToken(),
      body: { exposure_id: 'e1', action: 'early', loss_taka: 0 },
    }), makeEnv({ DB: dbReturning(ZONE_ROW) }));
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.action.action, 'early');
    // The zone is severe on its own facts, so the snapshot must reflect that
    // rather than defaulting to a level nobody would act on.
    assert.ok(['moderate', 'high', 'severe'].includes(data.action.risk_level_at_action), data.action.risk_level_at_action);
  });
});