import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import worker from '../src/index.ts';

const realFetch = globalThis.fetch;

// Newest first, the order `ORDER BY recorded_at DESC` returns from D1.
const rows = Array.from({ length: 10 }, (_, index) => {
  const i = 9 - index;
  return { price_min: 100 + i, price_max: 110 + i, price_mid: 105 + i };
});

function makeEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-secret-key-min-32-chars-long',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    AI_SERVICE_URL: 'https://ai.example.com',
    AI_SERVICE_TOKEN: 'test-ai-token',
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: rows }),
          first: async () => null,
          run: async () => ({ success: true }),
        }),
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
      batch: async () => [{ success: true }],
    },
    RATE_LIMIT_KV: { get: async () => null, put: async () => {} },
    ...overrides,
  };
}

function createRequest(path, options = {}) {
  return new Request(`http://localhost${path}`, {
    method: options.method ?? 'POST',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validYieldInput() {
  return {
    crop: 'Rice',
    temperature: 28,
    humidity: 70,
    rainfall: 200,
    ph: 6.5,
    nitrogen: 40,
    area_acres: 2.5,
    irrigation_used: true,
    season: 'kharif',
  };
}

after(() => {
  globalThis.fetch = realFetch;
});

describe('Yield prediction proxy', () => {
  it('rejects a missing crop', async () => {
    const input = validYieldInput();
    delete input.crop;
    const res = await worker.fetch(createRequest('/api/v1/yield/predict', { body: JSON.stringify(input) }), makeEnv());
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /crop/);
  });

  it('rejects an out-of-range ph', async () => {
    const input = validYieldInput();
    input.ph = 12;
    const res = await worker.fetch(createRequest('/api/v1/yield/predict', { body: JSON.stringify(input) }), makeEnv());
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /ph/);
  });

  it('rejects a non-numeric temperature', async () => {
    const input = validYieldInput();
    input.temperature = 'hot';
    const res = await worker.fetch(createRequest('/api/v1/yield/predict', { body: JSON.stringify(input) }), makeEnv());
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /temperature/);
  });

  it('forwards a valid request with the service token', async () => {
    let captured = null;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return jsonResponse({ status: 'success', message: 'ok', model: 'gradient_boosting', yield_per_acre: 4.2, total_yield: 10.5 });
    };
    const res = await worker.fetch(
      createRequest('/api/v1/yield/predict', { body: JSON.stringify(validYieldInput()) }),
      makeEnv(),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.yield_per_acre, 4.2);

    assert.equal(captured.url, 'https://ai.example.com/v1/yield/predict');
    assert.equal(captured.init.headers.Authorization, 'Bearer test-ai-token');
    const payload = JSON.parse(captured.init.body);
    assert.equal(payload.crop, 'rice');
    assert.equal(payload.season, 'kharif');
    assert.equal(payload.irrigation_used, true);
    assert.equal(payload.area_acres, 2.5);
  });

  it('maps model_unavailable to an honest 503', async () => {
    globalThis.fetch = async () => jsonResponse({ status: 'model_unavailable', message: 'not deployed' });
    const res = await worker.fetch(
      createRequest('/api/v1/yield/predict', { body: JSON.stringify(validYieldInput()) }),
      makeEnv(),
    );
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.status, 'model_unavailable');
    assert.equal(body.available, false);
    assert.equal(body.message, 'not deployed');
  });

  it('maps an upstream timeout to 504', async () => {
    globalThis.fetch = async () => {
      const cause = new Error('The operation timed out.');
      cause.name = 'TimeoutError';
      throw cause;
    };
    const res = await worker.fetch(
      createRequest('/api/v1/yield/predict', { body: JSON.stringify(validYieldInput()) }),
      makeEnv(),
    );
    assert.equal(res.status, 504);
    assert.match((await res.json()).error, /timed out/);
  });

  it('turns a FastAPI 422 detail into a readable error', async () => {
    globalThis.fetch = async () => jsonResponse({ detail: [{ msg: 'Input should be less than or equal to 55' }] }, 422);
    const res = await worker.fetch(
      createRequest('/api/v1/yield/predict', { body: JSON.stringify(validYieldInput()) }),
      makeEnv(),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /less than or equal to 55/);
  });
});

describe('Market forecast proxy', () => {
  it('requires crop or history', async () => {
    const res = await worker.fetch(createRequest('/api/v1/market/forecast', { body: JSON.stringify({ days: 7 }) }), makeEnv());
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /crop or history/);
  });

  it('rejects a history shorter than 7 points', async () => {
    const res = await worker.fetch(
      createRequest('/api/v1/market/forecast', { body: JSON.stringify({ crop: 'potato', history: [1, 2, 3] }) }),
      makeEnv(),
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /7 to 180/);
  });

  it('rejects non-positive history values', async () => {
    const res = await worker.fetch(
      createRequest('/api/v1/market/forecast', { body: JSON.stringify({ crop: 'potato', history: [1, 2, 3, 4, 5, 6, 0] }) }),
      makeEnv(),
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /positive/);
  });

  it('rejects an out-of-range days value', async () => {
    const res = await worker.fetch(
      createRequest('/api/v1/market/forecast', { body: JSON.stringify({ crop: 'potato', days: 0 }) }),
      makeEnv(),
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /days/);
  });

  it('builds an oldest-first history from D1 when none is supplied', async () => {
    let captured = null;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return jsonResponse({ status: 'success', message: 'ok', model: 'lstm', forecast: [106, 107, 108], trend: 'rising' });
    };
    const res = await worker.fetch(
      createRequest('/api/v1/market/forecast', { body: JSON.stringify({ crop: '3', days: 3 }) }),
      makeEnv(),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.trend, 'rising');

    const payload = JSON.parse(captured.init.body);
    assert.equal(captured.url, 'https://ai.example.com/v1/market/forecast');
    assert.equal(payload.crop, '3');
    assert.equal(payload.days, 3);
    // Rows arrive newest-first from SQL; the model needs oldest-first.
    assert.equal(payload.history.length, 10);
    assert.equal(payload.history[0], 105);
    assert.equal(payload.history.at(-1), 114);
  });

  it('reports insufficient history without inventing a forecast', async () => {
    const shortEnv = makeEnv();
    shortEnv.DB.prepare = () => ({
      bind: () => ({ all: async () => ({ results: rows.slice(0, 3) }) }),
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ success: true }),
    });
    const res = await worker.fetch(
      createRequest('/api/v1/market/forecast', { body: JSON.stringify({ crop: '3' }) }),
      shortEnv,
    );
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.status, 'insufficient_history');
    assert.equal(body.success, false);
    assert.match(body.message, /At least 7/);
  });

  it('passes client-supplied history straight through', async () => {
    let captured = null;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return jsonResponse({ status: 'success', message: 'ok', forecast: [1, 2], trend: 'flat' });
    };
    const history = [10, 11, 12, 13, 14, 15, 16];
    const res = await worker.fetch(
      createRequest('/api/v1/market/forecast', { body: JSON.stringify({ crop: 'potato', history }) }),
      makeEnv(),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(captured.init.body).history, history);
  });

  it('maps model_unavailable to an honest 503', async () => {
    globalThis.fetch = async () => jsonResponse({ status: 'model_unavailable', message: 'no model' });
    const res = await worker.fetch(
      createRequest('/api/v1/market/forecast', { body: JSON.stringify({ crop: 'potato', history: [1, 2, 3, 4, 5, 6, 7] }) }),
      makeEnv(),
    );
    assert.equal(res.status, 503);
    assert.equal((await res.json()).status, 'model_unavailable');
  });
});
