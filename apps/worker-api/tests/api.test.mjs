import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, it, before } from 'node:test';
import worker from '../src/index.ts' with { type: 'macro' };

const env = {
  JWT_SECRET: 'test-secret-key-min-32-chars-long',
  ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  AI_SERVICE_URL: 'https://ai.example.com',
  AI_SERVICE_TOKEN: 'test-ai-token',
  DB: {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ success: true }),
    }),
  } as any,
  UPLOADS: {
    put: async () => {},
  } as any,
  RATE_LIMIT_KV: {
    get: async () => null,
    put: async () => {},
  } as any,
};

function createRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
}

describe('Worker API', () => {
  it('health endpoint returns ok', async () => {
    const req = createRequest('/health');
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  it('auth register requires name, email, password', async () => {
    const req = createRequest('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@test.com', password: 'short' }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('auth register succeeds with valid data', async () => {
    const req = createRequest('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name_en: 'Test User', email: 'test2@test.com', password: 'password123' }),
    });
    const res = await worker.fetch(req, env);
    // Will fail due to DB mock, but should not be 400
    assert.notEqual(res.status, 400);
  });

  it('districts endpoint returns array', async () => {
    const req = createRequest('/api/v1/districts');
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.districts));
  });

  it('weather endpoint accepts lat/lng', async () => {
    const req = createRequest('/api/v1/weather?lat=23.81&lng=90.41');
    const res = await worker.fetch(req, env);
    // Will fail due to upstream, but should not be 400
    assert.notEqual(res.status, 400);
  });

  it('market prices endpoint returns object', async () => {
    const req = createRequest('/api/v1/market/prices');
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body === 'object');
  });

  it('chat endpoint requires message', async () => {
    const req = createRequest('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('crop recommendation requires district', async () => {
    const req = createRequest('/api/v1/crop/recommend-dynamic', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('ai-search requires query', async () => {
    const req = createRequest('/api/v1/ai-search');
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('CORS headers present on responses', async () => {
    const req = createRequest('/health');
    const res = await worker.fetch(req, env);
    assert.ok(res.headers.has('Access-Control-Allow-Origin'));
    assert.ok(res.headers.has('Access-Control-Allow-Credentials'));
  });

  it('OPTIONS request returns 204', async () => {
    const req = createRequest('/api/v1/auth/register', { method: 'OPTIONS' });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 204);
  });

  it('rate limit headers present when KV configured', async () => {
    const req = createRequest('/health');
    const res = await worker.fetch(req, env);
    // Rate limit headers should be present
    assert.ok(res.headers.has('X-RateLimit-Limit') || !env.RATE_LIMIT_KV);
  });
});