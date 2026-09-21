import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
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
  return json(request, env, { success: true, items: [], notifications: [] });
}