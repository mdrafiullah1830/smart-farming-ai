import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { createToken, createRefreshToken, verifyRefreshToken, currentUser, hashPassword, verifyPassword, validatePassword, checkBruteForce, recordFailedLogin, resetFailedLogins, revokeToken, verifyGoogleJWT } from '../auth.ts';

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
  if (!name || !email || !EMAIL_RE.test(email)) {
    return error(request, env, 400, 'Name and valid email are required');
  }
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return error(request, env, 400, pwCheck.error!);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error(request, env, 409, 'Email is already registered');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, phone, language) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, name, email, await hashPassword(password), data?.phone?.trim() ?? '', data?.language === 'en' ? 'en' : 'bn').run();
  const token = await createToken({ id, email }, env.JWT_SECRET);
  const refreshToken = await createRefreshToken(id, env.JWT_SECRET);
  return json(request, env, {
    success: true,
    token,
    refresh_token: refreshToken,
    user: { id, name, name_en: name, name_bn: data?.name_bn?.trim() || name, email, phone: data?.phone?.trim() ?? '' },
  }, 201);
}

export async function loginRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ email?: string; password?: string }>(request);
  const email = data?.email?.trim().toLowerCase();
  if (!email || !data?.password) return error(request, env, 400, 'Email and password are required');

  // Brute-force protection
  const bf = await checkBruteForce(email, env);
  if (!bf.allowed) return error(request, env, 429, 'Too many login attempts. Try again in 15 minutes.');

  const user = await env.DB.prepare('SELECT id, name, email, password_hash, phone, language FROM users WHERE email = ? AND is_active = 1')
    .bind(email).first<UserRow>();
  if (!user || !(await verifyPassword(data.password, user.password_hash))) {
    await recordFailedLogin(email, env);
    return error(request, env, 401, 'Invalid email or password');
  }
  await resetFailedLogins(email, env);
  const token = await createToken({ id: user.id, email: user.email }, env.JWT_SECRET);
  const refreshToken = await createRefreshToken(user.id, env.JWT_SECRET);
  return json(request, env, {
    success: true,
    token,
    refresh_token: refreshToken,
    user: { id: user.id, name: user.name, name_en: user.name, name_bn: user.name, email: user.email, phone: user.phone ?? '', language: user.language ?? 'bn' },
  });
}

export async function refreshRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ refresh_token?: string }>(request);
  if (!data?.refresh_token) return error(request, env, 400, 'refresh_token is required');
  const payload = await verifyRefreshToken(data.refresh_token, env.JWT_SECRET);
  if (!payload) return error(request, env, 401, 'Invalid or expired refresh token');

  const user = await env.DB.prepare('SELECT id, name, email, phone, language FROM users WHERE id = ? AND is_active = 1')
    .bind(payload.sub).first<UserRow>();
  if (!user) return error(request, env, 401, 'User not found');

  // Revoke old refresh token (rotate)
  await revokeToken(data.refresh_token, env);

  const token = await createToken({ id: user.id, email: user.email }, env.JWT_SECRET);
  const refreshToken = await createRefreshToken(user.id, env.JWT_SECRET);
  return json(request, env, {
    success: true,
    token,
    refresh_token: refreshToken,
  });
}

export async function logoutRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const data = await body<{ refresh_token?: string; access_token?: string }>(request);
  if (data?.refresh_token) await revokeToken(data.refresh_token, env);
  // Also revoke the current access token
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) await revokeToken(authHeader.slice(7), env);
  return json(request, env, { success: true, message: 'Logged out successfully' });
}

export async function googleLoginRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ credential?: string }>(request);
  const credential = data?.credential?.trim();
  if (!credential) return error(request, env, 400, 'credential is required');
  if (!env.GOOGLE_CLIENT_ID) return error(request, env, 503, 'Google sign-in is not configured');

  // Verify Google JWT signature properly
  const claims = await verifyGoogleJWT(credential, env.GOOGLE_CLIENT_ID);
  if (!claims) return error(request, env, 401, 'Invalid Google credential');

  const sub = claims.sub;
  const email = claims.email.trim().toLowerCase();

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

  const token = await createToken({ id: user.id, email: user.email }, env.JWT_SECRET);
  const refreshToken = await createRefreshToken(user.id, env.JWT_SECRET);
  return json(request, env, {
    success: true,
    token,
    refresh_token: refreshToken,
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