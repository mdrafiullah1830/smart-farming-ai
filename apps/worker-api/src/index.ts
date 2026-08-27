import { createToken, currentUser, hashPassword, verifyPassword } from './auth';
import { corsHeaders, error, json } from './http';
import type { Env } from './types';

type UserRow = { id: string; email: string; name: string; password_hash: string };

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

async function register(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string; name_en?: string; email?: string; password?: string }>(request);
  const name = (data?.name ?? data?.name_en)?.trim();
  const email = data?.email?.trim().toLowerCase();
  const password = data?.password ?? '';
  if (!name || !email || password.length < 8) {
    return error(request, env, 400, 'Name, valid email and an 8-character password are required');
  }
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error(request, env, 409, 'Email is already registered');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
    .bind(id, name, email, await hashPassword(password)).run();
  return json(request, env, { token: await createToken({ id, email }, env.JWT_SECRET), user: { id, name, email } }, 201);
}

async function login(request: Request, env: Env): Promise<Response> {
  const data = await body<{ email?: string; password?: string }>(request);
  const email = data?.email?.trim().toLowerCase();
  if (!email || !data?.password) return error(request, env, 400, 'Email and password are required');
  const user = await env.DB.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ? AND is_active = 1')
    .bind(email).first<UserRow>();
  if (!user || !(await verifyPassword(data.password, user.password_hash))) {
    return error(request, env, 401, 'Invalid email or password');
  }
  return json(request, env, {
    token: await createToken({ id: user.id, email: user.email }, env.JWT_SECRET),
    user: { id: user.id, name: user.name, email: user.email },
  });
}

async function upload(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const contentType = request.headers.get('Content-Type') ?? '';
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(contentType)) return error(request, env, 415, 'Only JPEG, PNG and WebP images are accepted');
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (!length || length > 10 * 1024 * 1024) return error(request, env, 413, 'Image must be between 1 byte and 10 MB');
  const extension = contentType.split('/')[1].replace('jpeg', 'jpg');
  const objectKey = `disease-images/${user.id}/${crypto.randomUUID()}.${extension}`;
  await env.UPLOADS.put(objectKey, request.body, { httpMetadata: { contentType } });
  await env.DB.prepare('INSERT INTO uploaded_files (id, owner_id, object_key, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, objectKey, contentType, length).run();
  return json(request, env, { objectKey }, 201);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (url.pathname === '/health') return json(request, env, { status: 'ok', service: 'worker-api' });
  if (url.pathname === '/api/v1/auth/register' && request.method === 'POST') return register(request, env);
  if (url.pathname === '/api/v1/auth/login' && request.method === 'POST') return login(request, env);
  if (url.pathname === '/api/v1/auth/profile' && request.method === 'GET') {
    const auth = await currentUser(request, env);
    if (!auth) return error(request, env, 401, 'Authentication required');
    const user = await env.DB.prepare('SELECT id, name, email, phone, language, created_at FROM users WHERE id = ? AND is_active = 1')
      .bind(auth.id).first();
    return user ? json(request, env, user) : error(request, env, 404, 'User not found');
  }
  if (url.pathname === '/api/v1/districts' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT id, name_en, name_bn, division, latitude, longitude FROM districts ORDER BY name_en').all();
    return json(request, env, { districts: result.results });
  }
  if (url.pathname === '/api/v1/soil/summary' && request.method === 'GET') {
    const district = url.searchParams.get('district');
    const upazila = url.searchParams.get('upazila');
    if (!district) return error(request, env, 400, 'district is required');
    const query = upazila
      ? env.DB.prepare('SELECT feature_name, feature_value, area_ha, source FROM soil_features WHERE district_name = ? AND upazila_name = ? ORDER BY feature_name, area_ha DESC').bind(district, upazila)
      : env.DB.prepare('SELECT feature_name, feature_value, SUM(area_ha) AS area_ha, source FROM soil_features WHERE district_name = ? GROUP BY feature_name, feature_value, source ORDER BY feature_name, area_ha DESC').bind(district);
    const result = await query.all();
    return json(request, env, { district, upazila, features: result.results });
  }
  if (url.pathname === '/api/v1/uploads/disease' && request.method === 'POST') return upload(request, env);
  return error(request, env, 404, 'Route not found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await route(request, env); }
    catch (cause) {
      console.error('request_failed', cause);
      return error(request, env, 500, 'Internal server error');
    }
  },
};
