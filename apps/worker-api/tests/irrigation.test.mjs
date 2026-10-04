import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import worker from '../src/index.ts';
import { createToken } from '../src/auth.ts';
import {
  stageForDays, pickRequirement, adviseIrrigation,
  ADEQUATE_MOISTURE_PERCENT,
} from '../src/routes/irrigation.ts';

const TEST_SECRET = 'unit-test-signing-key';

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

// The boro panicle row from migration 0010b, and its Rangpur override.
const PANICLE = {
  id: 'wr-boro-panicle', district_id: null, crop_name_en: 'Rice', crop_name_bn: 'ধান',
  season: 'boro', stage: 'panicle', mm_per_day: 9.0, note: null,
};
const PANICLE_RANGPUR = { ...PANICLE, id: 'wr-rng-boro-panicle', district_id: '52', mm_per_day: 10.0 };

describe('Irrigation growth stage', () => {
  it('advances with days since sowing', () => {
    assert.equal(stageForDays(0), 'sowing');
    assert.equal(stageForDays(5), 'sowing');
    assert.equal(stageForDays(15), 'transplanted');
    assert.equal(stageForDays(40), 'tillering');
    assert.equal(stageForDays(65), 'panicle');
    assert.equal(stageForDays(120), 'maturity');
  });

  it('never goes backwards, and handles a negative day count', () => {
    assert.equal(stageForDays(-5), 'sowing');
    assert.equal(stageForDays(1000), 'maturity');
  });
});

describe('Water requirement selection', () => {
  it('prefers the district-specific figure over the national default', () => {
    const picked = pickRequirement([PANICLE, PANICLE_RANGPUR], 'Rice', 'boro', 'panicle', '52');
    // The north-west genuinely needs more water; averaging the two would be
    // wrong for both districts.
    assert.equal(picked.mm_per_day, 10.0);
  });

  it('falls back to the national default when the district has none', () => {
    const picked = pickRequirement([PANICLE, PANICLE_RANGPUR], 'Rice', 'boro', 'panicle', '45');
    assert.equal(picked.mm_per_day, 9.0);
  });

  it('returns null rather than a wrong crop for an unknown combination', () => {
    const picked = pickRequirement([PANICLE], 'Maize', 'boro', 'panicle', '52');
    // Guessing a requirement for a crop with no seeded data would produce
    // confident nonsense.
    assert.equal(picked, null);
  });
});

describe('Irrigation advice', () => {
  const base = { requirement: PANICLE, areaAcres: 2, stage: 'panicle' };

  it('says irrigate only when moisture is below the threshold', () => {
    const dry = adviseIrrigation({ ...base, latestMoisturePercent: 40 });
    assert.equal(dry.status, 'needs_water');
    // The headline is what the farmer acts on; the detail carries the numbers.
    assert.match(dry.headlineBn, /সেচ দরকার/);
    assert.match(dry.detailBn, /৭৩ লিটার/);
  });

  it('does not tell a farmer to irrigate a wet field', () => {
    // Over-watering costs pumped water and fuel, and in the coastal belt raises
    // salinity. Calling this "adequate" is the whole point of the threshold.
    const wet = adviseIrrigation({ ...base, latestMoisturePercent: 85 });
    assert.equal(wet.status, 'adequate');
    assert.match(wet.headlineEn, /No irrigation needed/);
  });

  it('treats the band just above the threshold as watch, not adequate', () => {
    const borderline = adviseIrrigation({
      ...base, latestMoisturePercent: ADEQUATE_MOISTURE_PERCENT + 5,
    });
    assert.equal(borderline.status, 'watch');
  });

  it('says it has no reading instead of guessing', () => {
    const none = adviseIrrigation({ ...base, latestMoisturePercent: null });
    assert.equal(none.status, 'no_reading');
    // The requirement is independent of the sensor, so the figure survives even
    // without a reading -- withholding it would waste the one useful number.
    assert.equal(none.mmPerDay, 9);
    assert.equal(none.litresPerDay, 73);
    // Inventing a status without a reading is the failure this guards.
    assert.notEqual(none.status, 'needs_water');
  });

  it('says it has no requirement rather than inventing a figure', () => {
    const none = adviseIrrigation({ ...base, requirement: null, latestMoisturePercent: 30 });
    // Distinct from no_reading: an unknown crop is not a missing sensor.
    assert.equal(none.status, 'no_requirement');
    assert.equal(none.mmPerDay, null);
    assert.equal(none.litresPerDay, null);
  });

  it('reports no requirement ahead of no reading when both are missing', () => {
    const none = adviseIrrigation({ ...base, requirement: null, latestMoisturePercent: null });
    assert.equal(none.status, 'no_requirement');
  });

  it('converts mm/day to whole litres for the area', () => {
    const advice = adviseIrrigation({ ...base, latestMoisturePercent: 40 });
    // 9 mm/day x 2 acres x 4.047 L = 72.8 -> 73, and always a whole number.
    assert.equal(advice.litresPerDay, 73);
    assert.ok(Number.isInteger(advice.litresPerDay));
  });

  it('still advises when the area is unknown, just without litres', () => {
    const advice = adviseIrrigation({ ...base, areaAcres: null, latestMoisturePercent: 40 });
    assert.equal(advice.status, 'needs_water');
    assert.equal(advice.litresPerDay, null);
  });

  it('marks every answer as guidance, not a measurement', () => {
    assert.equal(adviseIrrigation({ ...base, latestMoisturePercent: 40 }).guidance, true);
  });
});
describe('Irrigation routes', () => {
  it('advice requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/irrigation/advice'), makeEnv());
    assert.equal(res.status, 401);
  });

  it('usage requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/irrigation/usage'), makeEnv());
    assert.equal(res.status, 401);
  });

  it('schedules require authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/irrigation/schedules'), makeEnv());
    assert.equal(res.status, 401);
  });

  it('the requirement table is public reference data', async () => {
    const res = await worker.fetch(await request('/api/v1/irrigation/requirements'), makeEnv());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.requirements));
    // Carried on every response so a client cannot present these as
    // measurements of a field.
    assert.match(data.disclaimer, /Advisory/);
  });

  it('returns usage with a zero state rather than an empty shape', async () => {
    const res = await worker.fetch(await request('/api/v1/irrigation/usage', {
      token: await farmerToken(),
    }), makeEnv());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.usage.totalLitres, 0);
    assert.equal(data.usage.unconfirmedCount, 0);
  });

  it('rejects a negative volume, duration or cost', async () => {
    const env = makeEnv();
    for (const bad of [{ volume_litres: -1 }, { duration_minutes: -5 }, { cost_taka: -10 }]) {
      const res = await worker.fetch(await request('/api/v1/irrigation/events', {
        method: 'POST', token: await farmerToken(), body: bad,
      }), env);
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
  });

  it('rejects a schedule time that could never fire', async () => {
    for (const bad of ['99:99', '6:00', '', 'noon', '25:00']) {
      const res = await worker.fetch(await request('/api/v1/irrigation/schedules', {
        method: 'POST', token: await farmerToken(), body: { start_time: bad },
      }), makeEnv());
      assert.equal(res.status, 400, `accepted ${bad}`);
    }
  });

  it('rejects an out-of-range schedule interval', async () => {
    const res = await worker.fetch(await request('/api/v1/irrigation/schedules', {
      method: 'POST', token: await farmerToken(), body: { start_time: '06:00', interval_days: 45 },
    }), makeEnv());
    assert.equal(res.status, 400);
  });

  it('refuses to record a run against another farmer device', async () => {
    const res = await worker.fetch(await request('/api/v1/irrigation/events', {
      method: 'POST', token: await otherToken(),
      body: { device_id: 'dev-someone-else', volume_litres: 100 },
    }), makeEnv({ DB: dbReturning(null, []) }));
    // Trusting the client here would let a run be booked to another pump.
    assert.equal(res.status, 404);
  });
});