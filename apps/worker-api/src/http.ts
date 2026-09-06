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

// Rate limiting using Cloudflare KV
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per IP

export async function checkRateLimit(request: Request, env: Env, keyPrefix: string = 'api'): Promise<{ allowed: boolean; remaining: number; resetTime: number } | null> {
  if (!env.RATE_LIMIT_KV) {
    // No KV namespace configured, skip rate limiting
    return null;
  }
  
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? 'unknown';
  const key = `ratelimit:${keyPrefix}:${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  try {
    // Get current count
    const current = await env.RATE_LIMIT_KV.get(key, { type: 'json' }) as { count: number; windowStart: number } | null;
    
    let count = 1;
    let currentWindowStart = now;
    
    if (current && current.windowStart > windowStart) {
      count = current.count + 1;
      currentWindowStart = current.windowStart;
    }
    
    if (count > RATE_LIMIT_MAX_REQUESTS) {
      const resetTime = currentWindowStart + RATE_LIMIT_WINDOW_MS;
      return { allowed: false, remaining: 0, resetTime };
    }
    
    // Store updated count with TTL
    await env.RATE_LIMIT_KV.put(key, JSON.stringify({ count, windowStart: currentWindowStart }), {
      expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) + 10,
    });
    
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - count, resetTime: currentWindowStart + RATE_LIMIT_WINDOW_MS };
  } catch (e) {
    // If KV fails, allow request (fail open)
    console.warn('Rate limit check failed:', e);
    return null;
  }
}

export function addRateLimitHeaders(response: Response, rateLimitInfo: { allowed: boolean; remaining: number; resetTime: number } | null): Response {
  if (!rateLimitInfo) return response;
  
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  headers.set('X-RateLimit-Remaining', String(Math.max(0, rateLimitInfo.remaining)));
  headers.set('X-RateLimit-Reset', String(Math.ceil(rateLimitInfo.resetTime / 1000)));
  
  if (!rateLimitInfo.allowed) {
    headers.set('Retry-After', String(Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)));
  }
  
  return new Response(response.body, {
    status: rateLimitInfo.allowed ? response.status : 429,
    statusText: rateLimitInfo.allowed ? response.statusText : 'Too Many Requests',
    headers,
  });
}
