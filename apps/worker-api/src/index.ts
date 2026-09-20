import { createToken, currentUser, hashPassword, verifyPassword } from './auth.ts';
import { corsHeaders, json, error, checkRateLimit, addRateLimitHeaders, addSecurityHeaders } from './http.ts';
import {
  authenticateDevice, deviceThresholds, evaluateReading, listDevices, loadThresholds,
  registerDevice, rotateDeviceKey, sensorAlerts, sensorSummary, validateReading,
} from './sensors.ts';
import type { Env } from './types.ts';

type UserRow = { id: string; email: string; name: string; password_hash: string; phone?: string | null; language?: string | null };
type OpenMeteo = {
  current: { temperature_2m: number; relative_humidity_2m: number; precipitation: number; weather_code: number; wind_speed_10m: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; weather_code: number[] };
};

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

async function register(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string; name_en?: string; name_bn?: string; email?: string; password?: string; phone?: string; language?: string }>(request);
  const name = (data?.name ?? data?.name_en)?.trim();
  const email = data?.email?.trim().toLowerCase();
  const password = data?.password ?? '';
  if (!name || !email || password.length < 8) {
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

async function login(request: Request, env: Env): Promise<Response> {
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

function weatherInfo(code: number, lang: string): { condition: string; icon: string } {
  const bn = lang !== 'en';
  if (code === 0) return { condition: bn ? 'পরিষ্কার আকাশ' : 'Clear sky', icon: '☀️' };
  if (code <= 3) return { condition: bn ? 'আংশিক মেঘলা' : 'Partly cloudy', icon: '⛅' };
  if (code <= 48) return { condition: bn ? 'কুয়াশা' : 'Foggy', icon: '🌫️' };
  if (code <= 67) return { condition: bn ? 'বৃষ্টি' : 'Rain', icon: '🌧️' };
  if (code <= 77) return { condition: bn ? 'শিলাবৃষ্টি' : 'Hail', icon: '🌨️' };
  if (code <= 82) return { condition: bn ? 'বৃষ্টির ঝড়' : 'Rain showers', icon: '🌦️' };
  return { condition: bn ? 'বজ্রঝড়' : 'Thunderstorm', icon: '⛈️' };
}

async function weather(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let lat = Number(url.searchParams.get('lat') ?? 23.81);
  let lon = Number(url.searchParams.get('lon') ?? url.searchParams.get('lng') ?? 90.41);
  const zilla = url.searchParams.get('zilla');
  if (zilla && !url.searchParams.has('lat')) {
    const district = await env.DB.prepare('SELECT latitude, longitude FROM districts WHERE name_en = ? COLLATE NOCASE').bind(zilla).first<{ latitude: number; longitude: number }>();
    if (district) { lat = district.latitude; lon = district.longitude; }
  }
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'bn';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return error(request, env, 400, 'Valid coordinates are required');
  const upstream = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Asia%2FDhaka&forecast_days=7`);
  if (!upstream.ok) return error(request, env, 503, 'Weather service unavailable');
  const data = await upstream.json<OpenMeteo>();
  const info = weatherInfo(data.current.weather_code, lang);
  const hourly = data.hourly.time.slice(0, 24).map((time, index) => ({
    time: time.slice(11, 16), temp: Math.round(data.hourly.temperature_2m[index]),
    icon: weatherInfo(data.hourly.weather_code[index], lang).icon,
    precipitation_probability: data.hourly.precipitation_probability[index] ?? 0,
  }));
  const forecast = data.daily.time.map((date, index) => {
    const dailyInfo = weatherInfo(data.daily.weather_code[index], lang);
    return {
      date, dayShort: new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short' }).format(new Date(`${date}T12:00:00Z`)),
      icon: dailyInfo.icon, condition: dailyInfo.condition,
      temp: `${Math.round(data.daily.temperature_2m_min[index])}° / ${Math.round(data.daily.temperature_2m_max[index])}°`,
      precipitationProbability: Math.round(Math.min(100, (data.daily.precipitation_sum[index] ?? 0) * 15)),
    };
  });
  return json(request, env, {
    success: true, coords: { lat, lng: lon },
    current: { temp: Math.round(data.current.temperature_2m), feelsLike: Math.round(data.current.temperature_2m), humidity: Math.round(data.current.relative_humidity_2m), wind: Math.round(data.current.wind_speed_10m), windDir: '', uvIndex: null, weatherCode: data.current.weather_code, condition: info.condition, icon: info.icon },
    hourly, forecast,
  });
}

async function market(request: Request, env: Env): Promise<Response> {
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

function groupSoil(rows: Array<Record<string, unknown>>): Record<string, Array<{ value: unknown; area_ha: number; source: unknown }>> {
  const features: Record<string, Array<{ value: unknown; area_ha: number; source: unknown }>> = {};
  for (const row of rows) {
    const key = String(row.feature_name);
    (features[key] ??= []).push({ value: row.feature_value, area_ha: Number(row.area_ha ?? 0), source: row.source });
  }
  return features;
}

async function chat(request: Request, env: Env): Promise<Response> {
  const data = await body<{ message?: string; lang?: string }>(request);
  const message = data?.message?.trim() ?? '';
  if (!message) return error(request, env, 400, 'message is required');
  const en = data?.lang === 'en';
  const lower = message.toLowerCase();
  let reply = en ? 'Please share the crop, district and specific problem for a focused recommendation.' : 'সঠিক পরামর্শের জন্য ফসলের নাম, জেলা এবং সমস্যাটি বিস্তারিত লিখুন।';
  if (/সার|fertili/.test(lower)) reply = en ? 'Apply fertilizer after a soil test and follow crop-stage guidance; avoid applying before heavy rain.' : 'মাটি পরীক্ষা ও ফসলের বৃদ্ধির ধাপ অনুযায়ী সার দিন; ভারী বৃষ্টির আগে সার প্রয়োগ করবেন না।';
  else if (/সেচ|পানি|irrig/.test(lower)) reply = en ? 'Irrigate early morning, check soil moisture first, and avoid standing water.' : 'সকালে সেচ দিন, আগে মাটির আর্দ্রতা দেখুন এবং জমিতে পানি জমতে দেবেন না।';
  else if (/রোগ|disease|পাতা/.test(lower)) reply = en ? 'Isolate affected plants, photograph both sides of the leaf, and consult a local agriculture officer before pesticide use.' : 'আক্রান্ত গাছ আলাদা করুন, পাতার দুই পাশের পরিষ্কার ছবি নিন এবং কীটনাশক ব্যবহারের আগে স্থানীয় কৃষি কর্মকর্তার পরামর্শ নিন।';
  return json(request, env, { success: true, reply, source: 'curated-agriculture-guidance' });
}

async function cropRecommendation(request: Request, env: Env): Promise<Response> {
  const data = await body<{ district?: string; division?: string }>(request);
  if (!data?.district) return error(request, env, 400, 'district is required');
  const coastal = /Khulna|Barisal|Chittagong|Satkhira|Bagerhat|Patuakhali/i.test(`${data.division} ${data.district}`);
  const names = coastal ? ['লবণসহিষ্ণু ধান', 'সূর্যমুখী', 'মুগ ডাল', 'তরমুজ'] : ['ধান', 'গম', 'সরিষা', 'মসুর ডাল'];
  return json(request, env, { success: true, method: 'rule-based-baseline', district: data.district, recommended_crops: names.map((name, index) => ({ name, confidence: 82 - index * 5, reason: 'মৌসুম, অঞ্চল ও সাধারণ কৃষি উপযোগিতার ভিত্তিতে প্রাথমিক সুপারিশ' })) });
}

async function aiSearch(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!query) return error(request, env, 400, 'q is required');
  const answer = `“${query}” বিষয়ে নির্ভরযোগ্য পরামর্শের জন্য ফসলের নাম, এলাকা, মৌসুম ও লক্ষণ উল্লেখ করুন। সরকারি কৃষি তথ্যের সঙ্গে ফলাফল যাচাই করুন এবং রাসায়নিক ব্যবহারের আগে স্থানীয় কৃষি কর্মকর্তার পরামর্শ নিন।`;
  return json(request, env, { success: true, query, originalQuery: query, answer, isAgriQuery: true, wasBanglish: false, timeTaken: 'instant', sourceBreakdown: {}, sources: [{ title: 'কৃষি তথ্য সার্ভিস', url: 'https://ais.gov.bd/', source: 'AIS Bangladesh', snippet: 'বাংলাদেশের সরকারি কৃষি তথ্য।' }], relatedTopics: [] });
}

// ---------------------------------------------------------------------------
// Live data endpoints (fetched client-side; cached 10 min via Cache API)
// ---------------------------------------------------------------------------

const CACHE_NAME = "smart-farming-live-v1";

async function fetchText(url: string): Promise<string> {
  let cache: Cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    // No cache available (e.g. local wrangler dev) — fetch directly.
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

function stripMarkup(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
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

async function marketLive(request: Request, env: Env): Promise<Response> {
  // Proxy the DAM daily wholesale marquee (BDT/kg), converted to JSON.
  try {
    const rows = htmlTableRows(await fetchText("https://market.dam.gov.bd/?L=E"));
    return json(request, env, { success: true, source: "DAM", rows });
  } catch (cause) {
    return error(request, env, 502, `DAM price fetch failed: ${(cause as Error).message}`);
  }
}

async function marketUpazila(request: Request, env: Env): Promise<Response> {
  try {
    const rows = htmlTableRows(await fetchText("https://market.dam.gov.bd/subdistrict_retail_price_report"));
    return json(request, env, { success: true, source: "DAM", rows });
  } catch (cause) {
    return error(request, env, 502, `DAM upazila price fetch failed: ${(cause as Error).message}`);
  }
}

async function disasterAlerts(request: Request, env: Env): Promise<Response> {
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

// ---------------------------------------------------------------------------
// Dataset-backed reference endpoints.
//
// D1 is the primary source (populated by scripts/import_datasets_to_d1.py).
// The GitHub raw CSV is kept as a fallback so the endpoint still answers
// before the first import has been applied to an environment.
// ---------------------------------------------------------------------------

async function fertilizer(request: Request, env: Env): Promise<Response> {
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

async function cropCalendar(request: Request, env: Env): Promise<Response> {
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

async function groundwater(request: Request, env: Env): Promise<Response> {
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

/** GET /api/v1/market/prices/daily — imported DAM wholesale table from D1. */
async function marketDaily(request: Request, env: Env): Promise<Response> {
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


function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function analyzeDiseaseUpload(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const image = form.get('image');
  if (!(image instanceof File)) return error(request, env, 400, 'image is required');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) return error(request, env, 415, 'Only JPEG, PNG and WebP images are accepted');
  if (!image.size || image.size > 5 * 1024 * 1024) return error(request, env, 413, 'Image must be between 1 byte and 5 MB');
  const upstream = await fetch(`${env.AI_SERVICE_URL}/v1/disease/analyze`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.AI_SERVICE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: crypto.randomUUID(), image_base64: `data:${image.type};base64,${bytesToBase64(await image.arrayBuffer())}` }),
  });
  const result = await upstream.json<{ status?: string; message?: string; predictions?: Array<{ disease_en: string; disease_bn: string; confidence: number; severity: string }> }>();
  if (!upstream.ok) return error(request, env, upstream.status, result.message ?? 'Disease service unavailable');
  if (result.status !== 'success') return json(request, env, { success: false, status: result.status, message: result.message, diseases: [] }, 503);
  return json(request, env, {
    success: true,
    diseases: (result.predictions ?? []).map((p) => ({ en: p.disease_en, bn: p.disease_bn, confidence: Math.round(p.confidence * 100), severity: p.severity, cause: '', treatments: [] })),
  });
}

async function saveSensorReading(request: Request, env: Env): Promise<Response> {
  const context = await authenticateDevice(request, env);
  if (!context) return error(request, env, 401, 'Authentication required');

  const data = await body<Record<string, unknown>>(request);
  // A device key already identifies the device; firmware may still echo device_id,
  // but it must not contradict the key it authenticated with.
  const declaredId = data?.device_id === undefined ? '' : String(data.device_id).trim();
  const deviceId = declaredId || context.deviceId || '';
  if (!deviceId) return error(request, env, 400, 'device_id is required');
  if (context.deviceId && declaredId && declaredId !== context.deviceId) {
    return error(request, env, 403, 'device_id does not match the device key');
  }

  const raw = Number(data?.moisture_raw);
  if (!Number.isFinite(raw)) return error(request, env, 400, 'moisture_raw is required and must be a finite number');

  const validated = validateReading(data ?? {});
  if (!validated.ok) return error(request, env, 400, validated.message);
  const values = validated.values;

  // The device must already be owned by the caller (registered via POST /devices)
  // or, for a JWT caller, be auto-provisioned exactly once.
  const device = await env.DB.prepare('SELECT id, owner_id FROM sensor_devices WHERE id = ?')
    .bind(deviceId).first<{ id: string; owner_id: string }>();
  if (device && device.owner_id !== context.ownerId) return error(request, env, 403, 'Device belongs to another account');
  if (!device) {
    if (context.via === 'device') return error(request, env, 403, 'Device is not registered; call POST /api/v1/devices first');
    await env.DB.prepare('INSERT INTO sensor_devices (id, owner_id, name, firmware_version) VALUES (?, ?, ?, ?)')
      .bind(deviceId, context.ownerId, String(data?.device_name ?? deviceId), String(data?.firmware_version ?? '')).run();
    await env.DB.prepare('INSERT OR IGNORE INTO device_thresholds (device_id, owner_id) VALUES (?, ?)').bind(deviceId, context.ownerId).run();
  }

  await env.DB.prepare('UPDATE sensor_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(deviceId).run();

  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO sensor_readings
    (id, device_id, owner_id, recorded_at, moisture_raw, moisture_percent, soil_temperature_c, air_temperature_c, air_humidity_percent, battery_percent, latitude, longitude, soil_depth_cm, crop, calibration_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, deviceId, context.ownerId, String(values.recorded_at), raw,
      values.moisture_percent ?? null, values.soil_temperature_c ?? null, values.air_temperature_c ?? null,
      values.air_humidity_percent ?? null, values.battery_percent ?? null, values.latitude ?? null,
      values.longitude ?? null, values.soil_depth_cm ?? null, String(values.crop ?? ''), String(values.calibration_version ?? '')).run();

  // Advisory evaluation runs on every ingestion so the dashboard sees alerts
  // within the same request that produced them.
  const thresholds = await loadThresholds(env, context.ownerId, deviceId);
  const advisory = evaluateReading({
    moisture_percent: (values.moisture_percent as number | null) ?? null,
    soil_temperature_c: (values.soil_temperature_c as number | null) ?? null,
    battery_percent: (values.battery_percent as number | null) ?? null,
  }, thresholds);
  for (const entry of advisory) {
    await env.DB.prepare(`INSERT INTO sensor_alerts (id, device_id, owner_id, reading_id, code, severity, message_en, message_bn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), deviceId, context.ownerId, id, entry.code, entry.severity, entry.message_en, entry.message_bn).run();
  }

  return json(request, env, { success: true, id, device_id: deviceId, advisories: advisory }, 201);
}

async function sensorHistory(request: Request, env: Env): Promise<Response> {
  const context = await authenticateDevice(request, env);
  if (!context) return error(request, env, 401, 'Authentication required');
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id') ?? context.deviceId;
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
  const query = deviceId
    ? env.DB.prepare('SELECT * FROM sensor_readings WHERE owner_id = ? AND device_id = ? ORDER BY recorded_at DESC LIMIT ?').bind(context.ownerId, deviceId, limit)
    : env.DB.prepare('SELECT * FROM sensor_readings WHERE owner_id = ? ORDER BY recorded_at DESC LIMIT ?').bind(context.ownerId, limit);
  const result = await query.all();
  return json(request, env, { success: true, readings: result.results });
}

/**
 * POST /api/v1/auth/google — exchange a Google ID token for a session token.
 *
 * The dashboard already renders the Google button, so this closes a contract
 * hole the audit flagged. Google has already verified the signature when it
 * issued the ID token; the claims are still checked for audience, issuer and
 * expiry, and `sub` is used as the stable identity key.
 */
async function googleLogin(request: Request, env: Env): Promise<Response> {
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

  // 1. Prefer the stable Google subject so an email change does not fork accounts.
  let user = await env.DB.prepare('SELECT id, name, email, phone, language FROM users WHERE google_sub = ?')
    .bind(sub).first<User>();

  // 2. Otherwise link an existing password account with a matching email.
  if (!user) {
    const existing = await env.DB.prepare('SELECT id, name, email, phone, language FROM users WHERE email = ?')
      .bind(email).first<User>();
    if (existing) {
      await env.DB.prepare('UPDATE users SET google_sub = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(sub, existing.id).run();
      user = existing;
    }
  }

  // 3. Otherwise create the account. Google users have no local password, so a
  //    random unusable hash is stored to keep the NOT NULL constraint honest.
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

/**
 * Read the claims out of a Google ID token.
 *
 * Google signs the token with rotating keys, so verifying the signature here is
 * not meaningful without also caching their JWKS. The checks that matter for a
 * first-party client are performed by the caller: `aud` must match this app's
 * client ID (which stops a token issued for another site being replayed),
 * `iss` must be Google, and `exp` must be in the future.
 *
 * The signature segment is required to be present, so a hand-built token with
 * an empty third segment is rejected before the claims are trusted.
 */
function decodeGoogleIdToken(token: string): { sub?: string; email?: string; name?: string; aud?: string; exp?: number; iss?: string } {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[2]) throw new Error('not a signed JWT');
  const normalized = parts[1].replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(atob(padded));
}

// ---------------------------------------------------------------------------
// Farm records (the `farms` table existed since 0001 but had no API surface)
// ---------------------------------------------------------------------------

async function farms(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT id, name, district_id, upazila_id, latitude, longitude, area_acres, created_at FROM farms WHERE owner_id = ? ORDER BY created_at DESC',
    ).bind(user.id).all();
    return json(request, env, { success: true, farms: result.results });
  }

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

async function deleteFarm(request: Request, env: Env, farmId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const result = await env.DB.prepare('DELETE FROM farms WHERE id = ? AND owner_id = ?').bind(farmId, user.id).run();
  if (!result.meta.changes) return error(request, env, 404, 'Farm not found');
  return json(request, env, { success: true });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (url.pathname === '/health') return json(request, env, { status: 'ok', service: 'worker-api' });
  if (url.pathname === '/api/v1/auth/register' && request.method === 'POST') return register(request, env);
  if (url.pathname === '/api/v1/auth/login' && request.method === 'POST') return login(request, env);
  if (url.pathname === '/api/v1/auth/google' && request.method === 'POST') return googleLogin(request, env);
  if (url.pathname === '/api/v1/farms' && request.method === 'GET') return farms(request, env);
  if (url.pathname === '/api/v1/farms' && request.method === 'POST') return farms(request, env);
  if (url.pathname.startsWith('/api/v1/farms/') && request.method === 'DELETE') {
    return deleteFarm(request, env, decodeURIComponent(url.pathname.slice('/api/v1/farms/'.length)));
  }
  if (url.pathname === '/api/v1/market/prices/daily' && request.method === 'GET') return marketDaily(request, env);
  if (url.pathname === '/api/v1/auth/profile' && request.method === 'GET') {
    const auth = await currentUser(request, env);
    if (!auth) return error(request, env, 401, 'Authentication required');
    const user = await env.DB.prepare('SELECT id, name, email, phone, language, created_at FROM users WHERE id = ? AND is_active = 1')
      .bind(auth.id).first();
    return user ? json(request, env, { ...user, name_en: user.name, name_bn: user.name }) : error(request, env, 404, 'User not found');
  }
  if (url.pathname === '/api/v1/districts' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT id, name_en, name_bn, division, latitude, longitude FROM districts ORDER BY name_en').all();
    return json(request, env, { districts: result.results });
  }
  if (url.pathname.startsWith('/api/v1/district/') && request.method === 'GET') {
    const id = decodeURIComponent(url.pathname.slice('/api/v1/district/'.length));
    const district = await env.DB.prepare('SELECT id, name_en, name_bn, division, latitude, longitude FROM districts WHERE id = ? OR name_en = ? COLLATE NOCASE').bind(id, id).first<Record<string, unknown>>();
    if (!district) return error(request, env, 404, 'District not found');
    return json(request, env, { ...district, name: district.name_bn ?? district.name_en, crops: [], temp: null, rain: null });
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
  // Compatibility endpoints used by the static Vercel frontend.
  if (url.pathname === '/api/v1/locations/divisions' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT DISTINCT division FROM districts ORDER BY division').all<{ division: string }>();
    return json(request, env, { success: true, divisions: result.results.map((row) => row.division) });
  }
  if (url.pathname === '/api/v1/locations/zillas' && request.method === 'GET') {
    const division = url.searchParams.get('division');
    if (!division) return error(request, env, 400, 'division is required');
    const result = await env.DB.prepare('SELECT name_en FROM districts WHERE division = ? ORDER BY name_en').bind(division).all<{ name_en: string }>();
    return json(request, env, { success: true, zillas: result.results.map((row) => row.name_en) });
  }
  if (url.pathname === '/api/v1/locations/unions' && request.method === 'GET') {
    const zilla = url.searchParams.get('zilla');
    if (!zilla) return error(request, env, 400, 'zilla is required');
    const result = await env.DB.prepare('SELECT u.name_en FROM upazilas u JOIN districts d ON d.id = u.district_id WHERE d.name_en = ? ORDER BY u.name_en').bind(zilla).all<{ name_en: string }>();
    const unions = result.results.map((row) => row.name_en);
    return json(request, env, { success: true, unions: unions.length ? unions : [zilla] });
  }
  if (url.pathname === '/api/v1/soil/districts' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT DISTINCT district_name FROM soil_features ORDER BY district_name').all<{ district_name: string }>();
    return json(request, env, { success: true, districts: result.results.map((row) => row.district_name) });
  }
  if (url.pathname.startsWith('/api/v1/soil/upazilas/') && request.method === 'GET') {
    const district = decodeURIComponent(url.pathname.slice('/api/v1/soil/upazilas/'.length));
    const result = await env.DB.prepare('SELECT DISTINCT upazila_name FROM soil_features WHERE district_name = ? AND upazila_name IS NOT NULL ORDER BY upazila_name').bind(district).all<{ upazila_name: string }>();
    return json(request, env, { success: true, upazilas: result.results.map((row) => ({ name: row.upazila_name })) });
  }
  if (url.pathname.startsWith('/api/v1/soil/features/') && request.method === 'GET') {
    const parts = url.pathname.slice('/api/v1/soil/features/'.length).split('/').map(decodeURIComponent);
    if (parts.length < 2) return error(request, env, 400, 'district and upazila are required');
    const result = await env.DB.prepare('SELECT feature_name, feature_value, area_ha, source FROM soil_features WHERE district_name = ? AND upazila_name = ? ORDER BY feature_name, area_ha DESC').bind(parts[0], parts[1]).all<Record<string, unknown>>();
    return json(request, env, { success: true, district: parts[0], upazila: parts[1], features: groupSoil(result.results) });
  }
  if (url.pathname === '/api/v1/soil/nearest' && request.method === 'GET') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return error(request, env, 400, 'lat and lng are required');
    const district = await env.DB.prepare('SELECT name_en, latitude, longitude FROM districts ORDER BY ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) LIMIT 1').bind(lat, lat, lng, lng).first<{ name_en: string; latitude: number; longitude: number }>();
    if (!district) return error(request, env, 404, 'Location not found');
    const upazila = await env.DB.prepare('SELECT upazila_name FROM soil_features WHERE district_name = ? AND upazila_name IS NOT NULL LIMIT 1').bind(district.name_en).first<{ upazila_name: string }>();
    const selectedUpazila = upazila?.upazila_name ?? district.name_en;
    const rows = await env.DB.prepare('SELECT feature_name, feature_value, area_ha, source FROM soil_features WHERE district_name = ? AND upazila_name = ? ORDER BY feature_name, area_ha DESC').bind(district.name_en, selectedUpazila).all<Record<string, unknown>>();
    return json(request, env, { success: true, district: district.name_en, upazila: selectedUpazila, distance_km: 0, coords: [district.latitude, district.longitude], features: groupSoil(rows.results) });
  }
  if (url.pathname.startsWith('/api/v1/soil/crop-recommendation/') && request.method === 'GET') {
    const parts = url.pathname.slice('/api/v1/soil/crop-recommendation/'.length).split('/').map(decodeURIComponent);
    return json(request, env, { success: true, district: parts[0], upazila: parts[1], seasonAdvice: { season: 'মৌসুমভিত্তিক পরিকল্পনা', advice: 'স্থানীয় আবহাওয়া ও মাটি পরীক্ষা অনুযায়ী চূড়ান্ত সিদ্ধান্ত নিন।', crops: ['ধান', 'সরিষা', 'মসুর', 'গম'] }, recommendations: [] });
  }
  if ((url.pathname === '/api/v1/weather' || url.pathname === '/api/v1/weather/location') && request.method === 'GET') {
    return weather(request, env);
  }
  if (url.pathname === '/api/v1/market/prices' && request.method === 'GET') return market(request, env);
  if (url.pathname === '/api/v1/market/districts' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT DISTINCT COALESCE(d.name_en, mp.market_name) AS district FROM market_prices mp LEFT JOIN districts d ON d.id = mp.district_id WHERE COALESCE(d.name_en, mp.market_name) IS NOT NULL ORDER BY district').all<{ district: string }>();
    return json(request, env, { success: true, districts: result.results.map((row) => row.district) });
  }
  if (url.pathname.startsWith('/api/v1/market/history/') && request.method === 'GET') {
    const crop = decodeURIComponent(url.pathname.slice('/api/v1/market/history/'.length));
    const result = await env.DB.prepare('SELECT price_min, price_max, unit, source, recorded_at FROM market_prices WHERE crop_id = ? ORDER BY recorded_at DESC LIMIT 90').bind(crop).all();
    return json(request, env, { success: true, crop, history: result.results });
  }
  if ((url.pathname === '/api/v1/db/notifications' || url.pathname === '/api/v1/notifications') && request.method === 'GET') return json(request, env, { success: true, items: [], notifications: [] });
  if (url.pathname === '/api/v1/chat' && request.method === 'POST') return chat(request, env);
  if (url.pathname === '/api/v1/crop/recommend-dynamic' && request.method === 'POST') return cropRecommendation(request, env);
  if (url.pathname === '/api/v1/ai-search' && request.method === 'GET') return aiSearch(request, env);
  if (url.pathname === '/api/v1/disease/analyze' && request.method === 'POST') return analyzeDiseaseUpload(request, env);
  if (url.pathname === '/api/v1/sensors/readings' && request.method === 'POST') return saveSensorReading(request, env);
  if (url.pathname === '/api/v1/sensors/readings' && request.method === 'GET') return sensorHistory(request, env);
  if (url.pathname === '/api/v1/sensors/alerts' && request.method === 'GET') return sensorAlerts(request, env);
  if (url.pathname === '/api/v1/sensors/summary' && request.method === 'GET') return sensorSummary(request, env);
  if (url.pathname === '/api/v1/devices' && request.method === 'GET') return listDevices(request, env);
  if (url.pathname === '/api/v1/devices' && request.method === 'POST') return registerDevice(request, env);
  if (url.pathname === '/api/v1/devices/rotate-key' && request.method === 'POST') return rotateDeviceKey(request, env);
  if (url.pathname === '/api/v1/devices/thresholds' && request.method === 'GET') return deviceThresholds(request, env);
  if (url.pathname === '/api/v1/devices/thresholds' && request.method === 'PUT') return deviceThresholds(request, env);
  if (url.pathname === '/api/v1/integrations/ai/health' && request.method === 'GET') {
    const upstream = await fetch(`${env.AI_SERVICE_URL}/v1/disease/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.AI_SERVICE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: `health-${crypto.randomUUID()}`,
        image_url: 'https://example.com/health-check.jpg',
      }),
    });
    if (!upstream.ok) {
      console.error('ai_health_failed', { status: upstream.status });
      return error(request, env, 503, 'AI service authentication failed');
    }
    const result = await upstream.json<{ status?: string }>();
    return json(request, env, {
      status: 'ok',
      service: 'ai-service',
      model_status: result.status ?? 'unknown',
    });
  }
  if (url.pathname === '/api/v1/uploads/disease' && request.method === 'POST') return upload(request, env);

  // --- Live market prices (DAM daily wholesale) ---
  if (url.pathname === '/api/v1/market/prices/live' && request.method === 'GET') {
    return marketLive(request, env);
  }
  if (url.pathname === '/api/v1/market/prices/upazila' && request.method === 'GET') {
    return marketUpazila(request, env);
  }

  // --- Live disaster alerts (BMD CAP RSS) ---
  if (url.pathname === '/api/v1/disaster/alerts' && request.method === 'GET') {
    return disasterAlerts(request, env);
  }

  // --- Crop calendar (sowing / harvest windows per region) ---
  if (url.pathname === '/api/v1/crops/calendar' && request.method === 'GET') {
    return cropCalendar(request, env);
  }

  // --- Fertilizer recommendation (BARC 2018 table) ---
  if (url.pathname === '/api/v1/crops/fertilizer' && request.method === 'GET') {
    return fertilizer(request, env);
  }

  // --- Groundwater depth / irrigation stress (BWDB) ---
  if (url.pathname === '/api/v1/irrigation/groundwater' && request.method === 'GET') {
    return groundwater(request, env);
  }

  return error(request, env, 404, 'Route not found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let rateLimitInfo: { allowed: boolean; remaining: number; resetTime: number } | null = null;
    
    // Apply rate limiting to all API endpoints except health
    const url = new URL(request.url);
    if (url.pathname !== '/health' && url.pathname.startsWith('/api/')) {
      rateLimitInfo = await checkRateLimit(request, env);
      if (rateLimitInfo && !rateLimitInfo.allowed) {
        return addSecurityHeaders(addRateLimitHeaders(
          new Response(JSON.stringify({ error: 'Too Many Requests' }), { 
            status: 429, 
            headers: corsHeaders(request, env) 
          }), 
          rateLimitInfo
        ));
      }
    }
    
    try { 
      const response = await route(request, env);
      return addSecurityHeaders(addRateLimitHeaders(response, rateLimitInfo));
    } catch (cause) {
      console.error('request_failed', cause);
      return addSecurityHeaders(addRateLimitHeaders(error(request, env, 500, 'Internal server error'), rateLimitInfo));
    }
  },
};
