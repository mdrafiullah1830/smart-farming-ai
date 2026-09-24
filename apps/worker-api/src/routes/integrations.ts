import type { Env } from '../types.ts';
import { corsHeaders, json, error, isMissingRelation } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

export async function aiHealthRoute(request: Request, env: Env): Promise<Response> {
  const healthCheckUrl = `${env.AI_SERVICE_URL}/health`;
  const upstream = await fetch(healthCheckUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${env.AI_SERVICE_TOKEN}`,
    },
  });
  if (!upstream.ok) {
    console.error('ai_health_failed', { status: upstream.status });
    return error(request, env, 503, 'AI service unavailable');
  }
  const result = await upstream.json<{ status?: string; models?: Record<string, string> }>();
  return json(request, env, {
    status: 'ok',
    service: 'ai-service',
    models: result.models ?? {},
  });
}

export async function notificationsRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const items: Array<Record<string, unknown>> = [];

  // Row 1: account notifications. `user_id IS NULL` rows are broadcasts
  // (weather/market/disease) that every signed-in user should see.
  try {
    const result = await env.DB.prepare(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE user_id = ? OR user_id IS NULL
       ORDER BY created_at DESC
       LIMIT 20`,
    ).bind(user.id).all();
    for (const row of result.results) {
      items.push({ ...row, source: 'account' });
    }
  } catch (cause) {
    if (!isMissingRelation(cause)) throw cause;
  }

  // Row 2: advisories raised by the rule engine for this user's devices.
  try {
    const result = await env.DB.prepare(
      `SELECT id, message_en AS message, message_bn, severity AS type, created_at, 0 AS is_read
       FROM sensor_alerts
       WHERE owner_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
    ).bind(user.id).all();
    for (const row of result.results) {
      items.push({ ...row, title: row.message, source: 'sensor' });
    }
  } catch (cause) {
    if (!isMissingRelation(cause)) throw cause;
  }

  items.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const trimmed = items.slice(0, 20);
  const unread = trimmed.filter((item) => item.is_read === 0 || item.is_read === false).length;

  return json(request, env, {
    success: true,
    items: trimmed,
    notifications: trimmed,
    unread_count: unread,
  });
}