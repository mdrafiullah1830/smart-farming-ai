import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

export async function farmsRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT id, name, district_id, upazila_id, latitude, longitude, area_acres, created_at FROM farms WHERE owner_id = ? ORDER BY created_at DESC',
    ).bind(user.id).all();
    return json(request, env, { success: true, farms: result.results });
  }

  if (request.method === 'POST') {
    const data = await body<{
      name?: string; district_id?: string; upazila_id?: string;
      latitude?: number; longitude?: number; area_acres?: number;
    }>(request);
    const name = data?.name?.trim();
    const areaAcres = Number(data?.area_acres);
    if (!name) return error(request, env, 400, 'name is required');
    if (!Number.isFinite(areaAcres) || areaAcres <= 0) return error(request, env, 400, 'area_acres must be greater than 0');

    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO farms (id, owner_id, name, district_id, upazila_id, latitude, longitude, area_acres) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, user.id, name, data?.district_id ?? null, data?.upazila_id ?? null,
      Number.isFinite(latitude) ? latitude : null, Number.isFinite(longitude) ? longitude : null, areaAcres).run();
    return json(request, env, { success: true, farm: { id, name, area_acres: areaAcres } }, 201);
  }

  return error(request, env, 405, 'Method not allowed');
}

export async function deleteFarmRoute(request: Request, env: Env, farmId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const result = await env.DB.prepare('DELETE FROM farms WHERE id = ? AND owner_id = ?').bind(farmId, user.id).run();
  if (!result.meta.changes) return error(request, env, 404, 'Farm not found');
  return json(request, env, { success: true });
}