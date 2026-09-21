import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { createToken, currentUser, hashPassword, verifyPassword } from '../auth.ts';

type UserRow = { id: string; email: string; name: string; password_hash: string; phone?: string | null; language?: string | null };

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string; name_en?: string; name_bn?: string; email?: string; password?: string; phone?: string; language?: string }>(request);
  const name = (data?.name ?? data?.name_en)?.trim();
  const email = data?.email?.trim().toLowerCase();
  const password = data?.password ?? '';
  if (!name || !email || !EMAIL_RE.test(email) || password.length < 8) {
    return error(request, env, 400, 'Name, valid email and an 8-character password are required');
  }
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error(request, env, 409, 'Email is already registered');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, phone, language) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, name, email, await hashPassword(password), data?.phone?.trim() ?? '', data?.language === 'en' ? 'en' : 'bn').run();
  return json(request, env, {
    success: true,
    token: await createToken({ id, email }, env.JWT_SECRET),
    user: { id, name, name_en: name, name_bn: data?.name_bn?.trim() || name, email, phone: data?.phone?.trim() ?? '' },
  }, 201);
}

export async function loginRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ email?: string; password?: string }>(request);
  const email = data?.email?.trim().toLowerCase();
  if (!email || !data?.password) return error(request, env, 400, 'Email and password are required');
  const user = await env.DB.prepare('SELECT id, name, email, password_hash, phone, language FROM users WHERE email = ? AND is_active = 1')
    .bind(email).first<UserRow>();
  if (!user || !(await verifyPassword(data.password, user.password_hash))) {
    return error(request, env, 401, 'Invalid email or password');
  }
  return json(request, env, {
    success: true,
    token: await createToken({ id: user.id, email: user.email }, env.JWT_SECRET),
    user: { id: user.id, name: user.name, name_en: user.name, name_bn: user.name, email: user.email, phone: user.phone ?? '', language: user.language ?? 'bn' },
  });
}

export async function googleLoginRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ credential?: string }>(request);
  const credential = data?.credential?.trim();
  if (!credential) return error(request, env, 400, 'credential is required');
  if (!env.GOOGLE_CLIENT_ID) return error(request, env, 503, 'Google sign-in is not configured');

  let claims: { sub?: string; email?: string; name?: string; aud?: string; exp?: number; iss?: string };
  try {
    claims = decodeGoogleIdToken(credential);
  } catch {
    return error(request, env, 401, 'Malformed Google credential');
  }

  if (claims.aud !== env.GOOGLE_CLIENT_ID) return error(request, env, 401, 'Google credential audience mismatch');
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') {
    return error(request, env, 401, 'Google credential issuer mismatch');
  }
  if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return error(request, env, 401, 'Google credential has expired');
  const sub = claims.sub;
  const email = claims.email?.trim().toLowerCase();
  if (!sub || !email) return error(request, env, 401, 'Google credential is missing sub or email');

  type User = { id: string; name: string; email: string; phone: string | null; language: string | null };

  let user = await env.DB.prepare('SELECT id, name, email, phone, language FROM users WHERE google_sub = ?')
    .bind(sub).first<User>();

  if (!user) {
    const existing = await env.DB.prepare('SELECT id, name, email, phone, language FROM users WHERE email = ?')
      .bind(email).first<User>();
    if (existing) {
      await env.DB.prepare('UPDATE users SET google_sub = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(sub, existing.id).run();
      user = existing;
    }
  }

  if (!user) {
    const id = crypto.randomUUID();
    const name = claims.name?.trim() || email.split('@')[0];
    await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, phone, language, google_sub) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, email, await hashPassword(crypto.randomUUID()), '', 'bn', sub).run();
    user = { id, name, email, phone: '', language: 'bn' };
  }

  return json(request, env, {
    success: true,
    token: await createToken({ id: user.id, email: user.email }, env.JWT_SECRET),
    user: { id: user.id, name: user.name, name_en: user.name, name_bn: user.name, email: user.email, phone: user.phone ?? '', language: user.language ?? 'bn' },
  });
}

export async function profileRoute(request: Request, env: Env): Promise<Response> {
  const auth = await currentUser(request, env);
  if (!auth) return error(request, env, 401, 'Authentication required');
  const user = await env.DB.prepare('SELECT id, name, email, phone, language, created_at FROM users WHERE id = ? AND is_active = 1')
    .bind(auth.id).first();
  return user ? json(request, env, { ...user, name_en: user.name, name_bn: user.name }) : error(request, env, 404, 'User not found');
}

function decodeGoogleIdToken(token: string): { sub?: string; email?: string; name?: string; aud?: string; exp?: number; iss?: string } {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[2]) throw new Error('not a signed JWT');

  // SECURITY: This only decodes the payload without verifying the signature.
  // In production, verify against Google's JWKS endpoint:
  // https://www.googleapis.com/oauth2/v3/certs
  // Use a library like `jose` for proper JWT verification.
  // TODO: Replace with proper signature verification before production use.
  const normalized = parts[1].replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(atob(padded));
}