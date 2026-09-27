/** API client with timeout, structured errors, credentials, and request IDs. */

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown', requestId = null, body = null, url = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.body = body;
    this.url = url;
  }
}

export function createRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_TIMEOUT_MS = 12000;

function resolveBaseUrl(base) {
  if (base) return String(base).replace(/\/$/, '');
  // Optional absolute API origin (VITE_API_BASE_URL). When unset we stay
  // same-origin and rely on the dev proxy / the Vercel rewrite.
  const configured = import.meta.env?.VITE_API_BASE_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location) return window.location.origin;
  return '';
}

/**
 * Canonical session token. `setCredentials()` stores `{token, user}` under
 * `sfAuth`; older builds wrote a bare token under `sfAccessToken`, so that key
 * is kept only as a read-through migration path.
 */
function readStoredToken() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const current = getCredentials()?.token;
  if (current) return current;
  try {
    return window.localStorage.getItem('sfAccessToken');
  } catch {
    return null;
  }
}

/**
 * @param {string} path - path beginning with / (e.g. /api/v1/health)
 * @param {RequestInit & { timeoutMs?: number, baseUrl?: string, token?: string|null }} options
 */
export async function apiFetch(path, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl,
    token,
    headers: extraHeaders,
    ...rest
  } = options;

  const base = resolveBaseUrl(baseUrl);
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const requestId = createRequestId();

  const headers = new Headers(extraHeaders || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  headers.set('X-Request-Id', requestId);

  const auth = token ?? readStoredToken();
  if (auth && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${auth}`);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      credentials: 'include',
      signal: options.signal || controller?.signal,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, {
        code: 'timeout',
        requestId,
        url,
      });
    }
    throw new ApiError(err?.message || 'Network error', {
      code: 'network',
      requestId,
      url,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  const serverRequestId = response.headers.get('X-Request-Id') || requestId;
  const contentType = response.headers.get('Content-Type') || '';
  let body = null;
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else if (!response.ok) {
    body = { error: (await response.text()).slice(0, 200) };
  }

  if (!response.ok) {
    const message =
      (body && (body.error || body.detail)) ||
      `Request failed with status ${response.status}`;
    let code = 'http_error';
    if (response.status === 401) code = 'unauthorized';
    else if (response.status === 403) code = 'forbidden';
    else if (response.status === 404) code = 'not_found';
    else if (response.status === 429) code = 'rate_limited';
    else if (response.status >= 500) code = 'server_error';
    throw new ApiError(message, {
      status: response.status,
      code,
      requestId: serverRequestId,
      body,
      url,
    });
  }

  return { data: body, requestId: serverRequestId, status: response.status, response };
}

export const api = {
  get: (path, options) => apiFetch(path, { ...options, method: 'GET' }),
  post: (path, body, options) =>
    apiFetch(path, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      body: JSON.stringify(body ?? {}),
    }),
  put: (path, body, options) =>
    apiFetch(path, {
      ...options,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      body: JSON.stringify(body ?? {}),
    }),
  del: (path, options) => apiFetch(path, { ...options, method: 'DELETE' }),
};

export function getCredentials() {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem('sfAuth') : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setCredentials(value) {
  try {
    if (!value) window.localStorage?.removeItem('sfAuth');
    else window.localStorage?.setItem('sfAuth', JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
