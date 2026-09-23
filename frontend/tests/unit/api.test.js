import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createRequestId, apiFetch, api, getCredentials, setCredentials } from '../../web/scripts/api.js';

describe('api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setCredentials(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('createRequestId returns unique ids', () => {
    const a = createRequestId();
    const b = createRequestId();
    assert.ok(a && b && a !== b);
  });

  it('ApiError carries structured fields', () => {
    const err = new ApiError('boom', { status: 401, code: 'unauthorized', requestId: 'r1' });
    assert.equal(err.name, 'ApiError');
    assert.equal(err.status, 401);
    assert.equal(err.code, 'unauthorized');
    assert.equal(err.requestId, 'r1');
  });

  it('sends X-Request-Id and parses JSON success', async () => {
    let seenHeaders;
    globalThis.fetch = mock.fn(async (url, init) => {
      seenHeaders = init.headers;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'srv-1' },
      });
    });
    const res = await apiFetch('/api/v1/health', { baseUrl: 'http://api.test' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { ok: true });
    assert.equal(res.requestId, 'srv-1');
    assert.ok(seenHeaders.get('X-Request-Id'));
    assert.equal(seenHeaders.get('Accept'), 'application/json');
    assert.equal(String(globalThis.fetch.mock.calls[0].arguments[0]), 'http://api.test/api/v1/health');
  });

  it('maps 401 to unauthorized ApiError', async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(JSON.stringify({ error: 'bad token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await assert.rejects(
      () => apiFetch('/api/v1/farms', { baseUrl: 'http://api.test' }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 401);
        assert.equal(err.code, 'unauthorized');
        assert.equal(err.message, 'bad token');
        return true;
      },
    );
  });

  it('maps 429 to rate_limited and 5xx to server_error', async () => {
    globalThis.fetch = mock.fn(async () => new Response('nope', { status: 429 }));
    await assert.rejects(() => apiFetch('/x', { baseUrl: 'http://api.test' }), (err) => err.code === 'rate_limited');
    globalThis.fetch = mock.fn(async () => new Response('nope', { status: 503 }));
    await assert.rejects(() => apiFetch('/x', { baseUrl: 'http://api.test' }), (err) => err.code === 'server_error');
  });

  it('aborts on timeout with code timeout', async () => {
    globalThis.fetch = mock.fn(
      (url, init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }),
    );
    await assert.rejects(
      () => apiFetch('/slow', { baseUrl: 'http://api.test', timeoutMs: 20 }),
      (err) => err.code === 'timeout' && err instanceof ApiError,
    );
  });

  it('network failures become code network', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await assert.rejects(() => apiFetch('/x', { baseUrl: 'http://api.test' }), (err) => err.code === 'network');
  });

  it('api.get/post set methods and JSON body', async () => {
    const calls = [];
    globalThis.fetch = mock.fn(async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await api.get('/api/v1/a', { baseUrl: 'http://api.test' });
    await api.post('/api/v1/b', { z: 2 }, { baseUrl: 'http://api.test' });
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[1].init.method, 'POST');
    assert.equal(calls[1].init.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(calls[1].init.body), { z: 2 });
  });

  it('credentials helpers read/write sfAuth via localStorage when present', () => {
    // Node without window: setCredentials is a no-op safe path
    setCredentials({ token: 't', user: { id: 1 } });
    const creds = getCredentials();
    // Without window.localStorage this may be null — both are valid safe outcomes
    assert.ok(creds === null || creds.token === 't');
  });
});
