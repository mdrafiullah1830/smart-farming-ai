import type { Env } from './types';

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request, env) });
}

export function error(request: Request, env: Env, status: number, message: string): Response {
  return json(request, env, { error: message }, status);
}
