import type { AuthUser, Env } from './types.ts';

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

const ACCESS_TOKEN_TTL = 3600;       // 1 hour
const REFRESH_TOKEN_TTL = 30 * 24 * 3600; // 30 days

export async function createToken(user: Omit<AuthUser, 'exp'>, secret: string): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(encoder.encode(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL })));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${await hmac(secret, unsigned)}`;
}

export async function createRefreshToken(userId: string, secret: string): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(encoder.encode(JSON.stringify({
    sub: userId,
    type: 'refresh',
    exp: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL,
    jti: crypto.randomUUID(),
  })));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${await hmac(secret, unsigned)}`;
}

export async function verifyToken(token: string, secret: string): Promise<AuthUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}`);
  if (expected !== parts[2]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[1]))) as AuthUser & { type?: string };
    if (payload.type === 'refresh') return null; // refresh tokens not valid as access tokens
    return payload.id && payload.email && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string, secret: string): Promise<{ sub: string; jti: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}`);
  if (expected !== parts[2]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[1])));
    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub, jti: payload.jti };
  } catch {
    return null;
  }
}

export async function currentUser(request: Request, env: Env): Promise<AuthUser | null> {
  const value = request.headers.get('Authorization');
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7);
  // Check revocation list
  if (env.RATE_LIMIT_KV) {
    const revoked = await env.RATE_LIMIT_KV.get(`revoked:${token}`);
    if (revoked) return null;
  }
  return verifyToken(token, env.JWT_SECRET);
}

export async function revokeToken(token: string, env: Env): Promise<void> {
  if (env.RATE_LIMIT_KV) {
    // Store revocation with TTL matching max token lifetime (30 days)
    await env.RATE_LIMIT_KV.put(`revoked:${token}`, '1', { expirationTtl: REFRESH_TOKEN_TTL });
  }
}

// Password validation: min 8 chars, max 128, must include uppercase, lowercase, digit
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
  if (password.length > 128) return { valid: false, error: 'Password must be at most 128 characters' };
  if (!PASSWORD_RE.test(password)) return { valid: false, error: 'Password must contain uppercase, lowercase, and a digit' };
  return { valid: true };
}

// Brute-force protection: track failed login attempts
export async function checkBruteForce(email: string, env: Env): Promise<{ allowed: boolean; remaining: number }> {
  if (!env.RATE_LIMIT_KV) return { allowed: true, remaining: 5 };
  const key = `bruteforce:${email}`;
  const data = await env.RATE_LIMIT_KV.get(key, { type: 'json' }) as { count: number; resetAt: number } | null;
  const now = Date.now();
  if (data && data.resetAt > now && data.count >= 5) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: data && data.resetAt > now ? 5 - data.count : 5 };
}

export async function recordFailedLogin(email: string, env: Env): Promise<void> {
  if (!env.RATE_LIMIT_KV) return;
  const key = `bruteforce:${email}`;
  const data = await env.RATE_LIMIT_KV.get(key, { type: 'json' }) as { count: number; resetAt: number } | null;
  const now = Date.now();
  const count = data && data.resetAt > now ? data.count + 1 : 1;
  const resetAt = data && data.resetAt > now ? data.resetAt : now + 15 * 60 * 1000; // 15 min window
  await env.RATE_LIMIT_KV.put(key, JSON.stringify({ count, resetAt }), { expirationTtl: 900 });
}

export async function resetFailedLogins(email: string, env: Env): Promise<void> {
  if (!env.RATE_LIMIT_KV) return;
  await env.RATE_LIMIT_KV.delete(`bruteforce:${email}`);
}

// Google JWT verification using Google's JWKS
export async function verifyGoogleJWT(token: string, clientId: string): Promise<{ sub: string; email: string; name?: string } | null> {
  try {
    // Fetch Google's public keys
    const jwksResp = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    const jwks = await jwksResp.json<{ keys: Array<{ kid: string; n: string; e: string; kty: string }> }>();

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[0])));
    const key = jwks.keys.find((k) => k.kid === header.kid);
    if (!key) return null;

    // Verify signature using Web Crypto RSA
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: false },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = decodeBase64url(parts[2]);
    const signatureBuffer = new Uint8Array(signature).buffer as ArrayBuffer;
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signatureBuffer, data);
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[1])));
    if (payload.aud !== clientId) return null;
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return { sub: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

// Cloudflare Workers' WebCrypto rejects PBKDF2 iteration counts above 100000
// (NotSupportedError), so the work factor is capped there instead of the
// desktop-recommended 600000. Raising it would break registration in prod.
export const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string, salt: string = crypto.randomUUID(), iterations: number = PBKDF2_ITERATIONS): Promise<string> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations },
    material,
    256,
  );
  return `pbkdf2_sha256$${iterations}$${salt}$${base64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt] = stored.split('$');
  if (scheme !== 'pbkdf2_sha256' || !salt) return false;
  const count = Number(iterations);
  if (!Number.isInteger(count) || count <= 0) return false;
  try {
    return (await hashPassword(password, salt, count)) === stored;
  } catch {
    // A hash above the Workers PBKDF2 cap cannot be recomputed here; treat it
    // as a failed match instead of letting the login route return a 500.
    return false;
  }
}
