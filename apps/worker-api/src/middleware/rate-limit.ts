import type { Env } from '../types.ts';
import { corsHeaders, json, error, checkRateLimit, addRateLimitHeaders } from '../http.ts';

// Rate limiting configuration
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export const defaultRateLimitConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
  keyPrefix: 'api',
};

export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...defaultRateLimitConfig, ...config };
  
  return async (request: Request, env: Env, next: () => Promise<Response>): Promise<Response> => {
    if (!env.RATE_LIMIT_KV) {
      return next();
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? 'unknown';
    const key = `ratelimit:${finalConfig.keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - finalConfig.windowMs;

    try {
      const current = await env.RATE_LIMIT_KV.get(key, { type: 'json' }) as { count: number; windowStart: number } | null;

      let count = 1;
      let currentWindowStart = now;

      if (current && current.windowStart > windowStart) {
        count = current.count + 1;
        currentWindowStart = current.windowStart;
      }

      if (count > finalConfig.maxRequests) {
        const resetTime = currentWindowStart + finalConfig.windowMs;
        const response = error(request, env, 429, 'Too Many Requests');
        return addRateLimitHeaders(response, { allowed: false, remaining: 0, resetTime });
      }

      await env.RATE_LIMIT_KV.put(key, JSON.stringify({ count, windowStart: currentWindowStart }), {
        expirationTtl: Math.ceil(finalConfig.windowMs / 1000) + 10,
      });

      const response = await next();
      return addRateLimitHeaders(response, { allowed: true, remaining: finalConfig.maxRequests - count, resetTime: currentWindowStart + finalConfig.windowMs });
    } catch (e) {
      console.warn('Rate limit check failed:', e);
      return next();
    }
  };
}