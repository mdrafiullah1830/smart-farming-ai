import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

export async function aiHealthRoute(request: Request, env: Env): Promise<Response> {
  const upstream = await fetch(`${env.AI_SERVICE_URL}/v1/disease/analyze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.AI_SERVICE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_id: `health-${crypto.randomUUID()}`,
      image_url: 'https://example.com/health-check.jpg',
    }),
  });
  if (!upstream.ok) {
    console.error('ai_health_failed', { status: upstream.status });
    return error(request, env, 503, 'AI service authentication failed');
  }
  const result = await upstream.json<{ status?: string }>();
  return json(request, env, {
    status: 'ok',
    service: 'ai-service',
    model_status: result.status ?? 'unknown',
  });
}

export async function notificationsRoute(request: Request, env: Env): Promise<Response> {
  return json(request, env, { success: true, items: [], notifications: [] });
}