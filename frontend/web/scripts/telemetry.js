/** Lightweight privacy-conscious client telemetry (no PII, no paid vendor). */

const queue = [];
let flushTimer = null;
const ENDPOINT = '/api/v1/client-errors';
const MAX_QUEUE = 20;

function shouldSend() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.__SF_TELEMETRY_DISABLED__) return false;
    return true;
  } catch {
    return false;
  }
}

function sanitize(message) {
  return String(message || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .slice(0, 300);
}

export function reportClientError(error, context = {}) {
  const entry = {
    message: sanitize(error?.message || String(error)),
    stack: sanitize(error?.stack || '').slice(0, 400),
    page: typeof location !== 'undefined' ? location.pathname : '',
    context: {
      component: context.component || null,
      code: context.code || null,
      status: context.status ?? null,
    },
    ts: new Date().toISOString(),
  };

  // Dev noise reduction: only console.warn when not production-like
  const isProd = typeof location !== 'undefined' && !/localhost|127\.0\.0\.1/.test(location.hostname);
  if (!isProd && context.console !== false) {
    console.warn('[sf-telemetry]', entry.message, entry.context);
  }

  if (!shouldSend()) return;

  queue.push(entry);
  if (queue.length > MAX_QUEUE) queue.shift();
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 2000);
}

export async function flush() {
  if (!queue.length || !shouldSend()) return;
  const batch = queue.splice(0, queue.length);
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ errors: batch }),
    });
  } catch {
    /* drop — never block the UI */
  }
}

export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined' || window.__SF_TELEMETRY_INSTALLED__) return;
  window.__SF_TELEMETRY_INSTALLED__ = true;
  window.addEventListener('error', (ev) => {
    reportClientError(ev.error || ev.message, { component: 'window' });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    reportClientError(ev.reason || new Error('unhandledrejection'), { component: 'promise' });
  });
}
