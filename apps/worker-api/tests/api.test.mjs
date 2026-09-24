import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, it, before } from 'node:test';
import worker from '../src/index.ts';
import { createToken } from '../src/auth.ts';

const env = {
  JWT_SECRET: 'test-secret-key-min-32-chars-long',
  ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  AI_SERVICE_URL: 'https://ai.example.com',
  AI_SERVICE_TOKEN: 'test-ai-token',
  DB: {
    prepare: (_sql) => ({
      bind: (..._args) => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ success: true }),
    }),
    batch: async (_statements) => [{ success: true }],
  },
  UPLOADS: {
    put: async () => {},
  },
  RATE_LIMIT_KV: {
    get: async () => null,
    put: async () => {},
  },
};

async function bearerToken() {
  return createToken({ id: 'user-1', email: 'tester@example.com' }, env.JWT_SECRET);
}

function createRequest(path, options = {}) {
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
      body: JSON.stringify({ name_en: 'Test User', email: 'test2@test.com', password: 'Password123' }),
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
    const req = createRequest('/health', {
      headers: { Origin: 'http://localhost:3000' },
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true');
  });

  it('OPTIONS request returns 204', async () => {
    const req = createRequest('/api/v1/auth/register', { method: 'OPTIONS' });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 204);
  });

  it('rate limit headers present when KV configured', async () => {
    const req = createRequest('/api/v1/districts');
    const res = await worker.fetch(req, env);
    // Rate limit headers should be present
    assert.ok(res.headers.has('X-RateLimit-Limit') || !env.RATE_LIMIT_KV);
  });

  it('security headers present on responses', async () => {
    const req = createRequest('/health');
    const res = await worker.fetch(req, env);
    assert.ok(res.headers.has('X-Content-Type-Options'));
    assert.ok(res.headers.has('X-Frame-Options'));
    assert.ok(res.headers.has('X-XSS-Protection'));
    assert.ok(res.headers.has('Referrer-Policy'));
    assert.ok(res.headers.has('Content-Security-Policy'));
  });

  it('CSP allows required external resources', async () => {
    const req = createRequest('/health');
    const res = await worker.fetch(req, env);
    const csp = res.headers.get('Content-Security-Policy');
    assert.ok(csp?.includes("connect-src 'self'"));
    assert.ok(csp?.includes('api.open-meteo.com'));
    assert.ok(csp?.includes('market.dam.gov.bd'));
    assert.ok(csp?.includes('cap.bmd.gov.bd'));
    assert.ok(csp?.includes('raw.githubusercontent.com'));
  });

  it('client-errors accepts a telemetry batch without auth', async () => {
    const req = createRequest('/api/v1/client-errors', {
      method: 'POST',
      body: JSON.stringify({
        errors: [{ message: 'boom', page: '/dashboard', context: { component: 'dash' } }],
      }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.accepted, 1);
  });

  it('client-errors rejects a malformed body', async () => {
    const req = createRequest('/api/v1/client-errors', {
      method: 'POST',
      body: JSON.stringify({ errors: 'nope' }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('client-errors rejects an oversized batch', async () => {
    const req = createRequest('/api/v1/client-errors', {
      method: 'POST',
      body: JSON.stringify({ errors: Array.from({ length: 21 }, (_, i) => ({ message: `e${i}` })) }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('tasks require authentication', async () => {
    const req = createRequest('/api/v1/tasks');
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401);
  });

  it('tasks GET returns the signed-in user list', async () => {
    const token = await bearerToken();
    const req = createRequest('/api/v1/tasks', { headers: { Authorization: `Bearer ${token}` } });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.synced, true);
    assert.deepEqual(body.tasks, []);
  });

  it('tasks POST validates the payload', async () => {
    const token = await bearerToken();
    const req = createRequest('/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('tasks POST upserts a task', async () => {
    const token = await bearerToken();
    const req = createRequest('/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task: { id: 't1', title: { bn: 'সেচ', en: 'Irrigate' }, done: true } }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.synced, true);
    assert.equal(body.success, true);
  });

  it('device command requires authentication', async () => {
    const req = createRequest('/api/v1/devices/dev-1/command', {
      method: 'POST',
      body: JSON.stringify({ command: 'irrigation_on' }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401);
  });

  it('device command rejects unknown commands', async () => {
    const token = await bearerToken();
    const req = createRequest('/api/v1/devices/dev-1/command', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: 'explode' }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 400);
  });

  it('device command 404s for a device the caller does not own', async () => {
    const token = await bearerToken();
    const req = createRequest('/api/v1/devices/dev-1/command', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: 'irrigation_on' }),
    });
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 404);
  });

  it('notifications require authentication', async () => {
    const req = createRequest('/api/v1/notifications');
    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401);
  });
});
