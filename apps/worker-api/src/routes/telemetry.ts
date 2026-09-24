import type { Env } from '../types.ts';
import { json, error } from '../http.ts';

const MAX_BATCH = 20;
const MAX_MESSAGE_LENGTH = 300;
const MAX_STACK_LENGTH = 400;
const MAX_PAGE_LENGTH = 200;
const MAX_COMPONENT_LENGTH = 80;

interface ClientError {
  message?: unknown;
  stack?: unknown;
  page?: unknown;
  ts?: unknown;
  context?: { component?: unknown; code?: unknown; status?: unknown } | null;
}

function text(value: unknown, limit: number): string {
  return String(value ?? '').slice(0, limit);
}

/**
 * POST /api/v1/client-errors — intake for the browser telemetry queue.
 *
 * Deliberately unauthenticated: it must still work when the failure being
 * reported *is* an auth failure. Entries are structured-logged (queryable in
 * the Worker's tail/logs) and never persisted, so a broken client cannot grow
 * an unbounded D1 table.
 */
export async function clientErrorsRoute(request: Request, env: Env): Promise<Response> {
  let payload: { errors?: ClientError[] } | null = null;
  try {
    payload = await request.json<{ errors?: ClientError[] }>();
  } catch {
    payload = null;
  }

  if (!payload || !Array.isArray(payload.errors)) {
    return error(request, env, 400, 'body must be {"errors":[...]}');
  }
  if (payload.errors.length > MAX_BATCH) {
    return error(request, env, 400, `at most ${MAX_BATCH} errors per batch`);
  }

  const requestId = request.headers.get('X-Request-Id') ?? '';
  const page = payload.errors[0]?.page;
  for (const entry of payload.errors) {
    if (!entry || typeof entry !== 'object') continue;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'warn',
      msg: 'client_error',
      requestId,
      page: text(entry.page ?? page, MAX_PAGE_LENGTH),
      clientTs: text(entry.ts, 40),
      message: text(entry.message, MAX_MESSAGE_LENGTH),
      stack: text(entry.stack, MAX_STACK_LENGTH),
      component: text(entry.context?.component, MAX_COMPONENT_LENGTH),
      code: text(entry.context?.code, MAX_COMPONENT_LENGTH),
      status: entry.context?.status ?? null,
    }));
  }

  return json(request, env, { success: true, accepted: payload.errors.length }, 202);
}
