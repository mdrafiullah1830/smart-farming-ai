import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

export async function districtsRoute(request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT id, name_en, name_bn, division, latitude, longitude FROM districts ORDER BY name_en').all();
  return json(request, env, { districts: result.results });
}

export async function districtDetailRoute(request: Request, env: Env, id: string): Promise<Response> {
  const district = await env.DB.prepare('SELECT id, name_en, name_bn, division, latitude, longitude FROM districts WHERE id = ? OR name_en = ? COLLATE NOCASE').bind(id, id).first<Record<string, unknown>>();
  if (!district) return error(request, env, 404, 'District not found');
  return json(request, env, { ...district, name: district.name_bn ?? district.name_en, crops: [], temp: null, rain: null });
}

export async function divisionsRoute(request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT DISTINCT division FROM districts ORDER BY division').all<{ division: string }>();
  return json(request, env, { success: true, divisions: result.results.map((row) => row.division) });
}

export async function zillasRoute(request: Request, env: Env): Promise<Response> {
  const division = new URL(request.url).searchParams.get('division');
  if (!division) return error(request, env, 400, 'division is required');
  const result = await env.DB.prepare('SELECT name_en FROM districts WHERE division = ? ORDER BY name_en').bind(division).all<{ name_en: string }>();
  return json(request, env, { success: true, zillas: result.results.map((row) => row.name_en) });
}

export async function unionsRoute(request: Request, env: Env): Promise<Response> {
  const zilla = new URL(request.url).searchParams.get('zilla');
  if (!zilla) return error(request, env, 400, 'zilla is required');
  const result = await env.DB.prepare('SELECT u.name_en FROM upazilas u JOIN districts d ON d.id = u.district_id WHERE d.name_en = ? ORDER BY u.name_en').bind(zilla).all<{ name_en: string }>();
  const unions = result.results.map((row) => row.name_en);
  return json(request, env, { success: true, unions: unions.length ? unions : [zilla] });
}