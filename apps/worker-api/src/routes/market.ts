import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

function stripMarkup(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}

function htmlTableRows(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripMarkup(cell[1]))
  ).filter((row) => row.some(Boolean));
}

function csvRows(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const split = (line: string) => [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)]
    .map((m) => (m[1] ?? m[2] ?? '').replace(/""/g, '"').trim());
  const headers = split(lines.shift() ?? '');
  return lines.filter(Boolean).map((line) => Object.fromEntries(headers.map((key, i) => [key, split(line)[i] ?? ''])));
}

const CACHE_NAME = "smart-farming-live-v1";

async function fetchText(url: string): Promise<string> {
  let cache: Cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`upstream ${r.status} for ${url}`);
    return r.text();
  }
  const cached = await cache.match(url);
  if (cached) return cached.text();
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`upstream ${r.status} for ${url}`);
  const data = await r.text();
  await cache.put(url, new Response(data, {
    headers: { "Content-Type": r.headers.get("Content-Type") ?? "text/plain", "Cache-Control": "max-age=600" },
  }));
  return data;
}

async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse(await fetchText(url));
}

export async function marketRoute(request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT mp.crop_id, c.name_en, c.name_bn, mp.district_id, mp.market_name,
           mp.price_min, mp.price_max, mp.unit, mp.source, mp.recorded_at
    FROM market_prices mp LEFT JOIN crops c ON c.id = mp.crop_id
    ORDER BY mp.recorded_at DESC LIMIT 500
  `).all();
  const prices: Record<string, unknown> = {};
  for (const row of result.results as Array<Record<string, unknown>>) {
    const key = String(row.crop_id);
    if (!(key in prices)) prices[key] = { name: row.name_bn ?? row.name_en ?? key, nameEn: row.name_en ?? key, minPrice: row.price_min, maxPrice: row.price_max, unit: row.unit, source: row.source, updatedAt: row.recorded_at };
  }
  return json(request, env, { success: true, prices, rows: result.results });
}

export async function marketDailyRoute(request: Request, env: Env): Promise<Response> {
  const crop = new URL(request.url).searchParams.get("crop");
  try {
    const statement = crop
      ? env.DB.prepare("SELECT crop_key, label_bn, price_min, price_max, price_mid, change_pct, unit, recorded_at, source FROM market_prices_daily WHERE crop_key = ? ORDER BY recorded_at DESC LIMIT 90").bind(crop)
      : env.DB.prepare("SELECT crop_key, label_bn, price_min, price_max, price_mid, change_pct, unit, recorded_at, source FROM market_prices_daily ORDER BY recorded_at DESC, crop_key LIMIT 500");
    const result = await statement.all();
    return json(request, env, { success: true, rows: result.results });
  } catch (cause) {
    return error(request, env, 502, `market daily table unavailable: ${(cause as Error).message}`);
  }
}

export async function marketDistrictsRoute(request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT DISTINCT COALESCE(d.name_en, mp.market_name) AS district FROM market_prices mp LEFT JOIN districts d ON d.id = mp.district_id WHERE COALESCE(d.name_en, mp.market_name) IS NOT NULL ORDER BY district').all<{ district: string }>();
  return json(request, env, { success: true, districts: result.results.map((row) => row.district) });
}

export async function marketHistoryRoute(request: Request, env: Env, crop: string): Promise<Response> {
  const result = await env.DB.prepare('SELECT price_min, price_max, unit, source, recorded_at FROM market_prices WHERE crop_id = ? ORDER BY recorded_at DESC LIMIT 90').bind(crop).all();
  return json(request, env, { success: true, crop, history: result.results });
}

export async function marketLiveRoute(request: Request, env: Env): Promise<Response> {
  try {
    const rows = htmlTableRows(await fetchText("https://market.dam.gov.bd/?L=E"));
    return json(request, env, { success: true, source: "DAM", rows });
  } catch (cause) {
    return error(request, env, 502, `DAM price fetch failed: ${(cause as Error).message}`);
  }
}

export async function marketUpazilaRoute(request: Request, env: Env): Promise<Response> {
  try {
    const rows = htmlTableRows(await fetchText("https://market.dam.gov.bd/subdistrict_retail_price_report"));
    return json(request, env, { success: true, source: "DAM", rows });
  } catch (cause) {
    return error(request, env, 502, `DAM upazila price fetch failed: ${(cause as Error).message}`);
  }
}

export async function cropCalendarRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const crop = url.searchParams.get("crop");
  const region = url.searchParams.get("region");

  try {
    const conditions: string[] = [];
    const bindings: string[] = [];
    if (crop) { conditions.push("crop = ?"); bindings.push(crop); }
    if (region) { conditions.push("region = ?"); bindings.push(region); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const statement = env.DB.prepare(
      `SELECT crop, region, season, sowing_start, sowing_end, harvest_start, harvest_end, seed_kg_per_acre, notes, source FROM crop_calendar ${where} ORDER BY crop, region`,
    );
    const result = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
    if (result.results.length) return json(request, env, { success: true, source: "D1", rows: result.results });
  } catch (cause) {
    console.warn("crop_calendar_d1_failed", cause);
  }

  try {
    const data = await fetchJson("https://raw.githubusercontent.com/mdrafiullah1830/smart_farming_ai/main/datasets/crop_calendar/crop_calendar.json");
    let rows: unknown[] = Array.isArray(data) ? data : ((data as { rows?: unknown[] }).rows ?? []);
    if (crop) rows = (rows as { crop: string }[]).filter((r) => r.crop === crop);
    if (region) rows = (rows as { region: string }[]).filter((r) => r.region === region);
    return json(request, env, { success: true, source: "github-fallback", rows });
  } catch (cause) {
    return error(request, env, 502, `crop calendar unavailable: ${(cause as Error).message}`);
  }
}

export async function fertilizerRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const crop = url.searchParams.get("crop");
  const soilType = url.searchParams.get("soil_type") ?? url.searchParams.get("region");

  try {
    const conditions: string[] = [];
    const bindings: string[] = [];
    if (crop) { conditions.push("crop = ?"); bindings.push(crop); }
    if (soilType) { conditions.push("soil_type = ?"); bindings.push(soilType); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const statement = env.DB.prepare(
      `SELECT crop, season, soil_type, n_kg_per_acre, p_kg_per_acre, k_kg_per_acre, s_kg_per_acre, zn_kg_per_acre, notes, source FROM fertilizer_recommendations ${where} ORDER BY crop, soil_type`,
    );
    const result = bindings.length ? await statement.bind(...bindings).all() : await statement.all();
    if (result.results.length) return json(request, env, { success: true, source: "D1", rows: result.results });
  } catch (cause) {
    console.warn("fertilizer_d1_failed", cause);
  }

  try {
    const out = csvRows(await fetchText("https://raw.githubusercontent.com/mdrafiullah1830/smart_farming_ai/main/datasets/fertilizer/barc_fertilizer_recommendation.csv"))
      .filter((r) => !crop || r.crop === crop)
      .filter((r) => !soilType || r.soil_type === soilType);
    return json(request, env, { success: true, source: "github-fallback", rows: out });
  } catch (cause) {
    return error(request, env, 502, `fertilizer table unavailable: ${(cause as Error).message}`);
  }
}

export async function groundwaterRoute(request: Request, env: Env): Promise<Response> {
  const district = new URL(request.url).searchParams.get("district");

  try {
    const statement = district
      ? env.DB.prepare("SELECT district, division, depth_m, stress_level, notes, source FROM groundwater_depth WHERE district = ? COLLATE NOCASE").bind(district)
      : env.DB.prepare("SELECT district, division, depth_m, stress_level, notes, source FROM groundwater_depth ORDER BY district");
    const result = await statement.all();
    if (result.results.length) return json(request, env, { success: true, source: "D1", rows: result.results });
  } catch (cause) {
    console.warn("groundwater_d1_failed", cause);
  }

  try {
    const out = csvRows(await fetchText("https://raw.githubusercontent.com/mdrafiullah1830/smart_farming_ai/main/datasets/irrigation/groundwater_depth.csv"))
      .map((r): Record<string, string | number> => ({ ...r, depth_m: Number(r.depth_m) }))
      .filter((r) => !district || String(r.district).toLowerCase() === district.toLowerCase());
    return json(request, env, { success: true, source: "github-fallback", rows: out });
  } catch (cause) {
    return error(request, env, 502, `groundwater fetch failed: ${(cause as Error).message}`);
  }
}

export async function disasterAlertsRoute(request: Request, env: Env): Promise<Response> {
  try {
    const xml = await fetchText("https://cap.bmd.gov.bd/api/cap/rss.xml");
    const alerts = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((item) => ({
      title: stripMarkup(item[1].match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
      description: stripMarkup(item[1].match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? ''),
      publishedAt: stripMarkup(item[1].match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? ''),
      link: stripMarkup(item[1].match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? ''),
    }));
    return json(request, env, { success: true, source: "BMD CAP RSS", alerts });
  } catch (cause) {
    return error(request, env, 502, `BMD alert fetch failed: ${(cause as Error).message}`);
  }
}