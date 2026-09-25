import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { currentUser } from '../auth.ts';
import { saveSensorReading } from '../sensors.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

function groupSoil(rows: Array<Record<string, unknown>>): Record<string, Array<{ value: unknown; area_ha: number; source: unknown }>> {
  const features: Record<string, Array<{ value: unknown; area_ha: number; source: unknown }>> = {};
  for (const row of rows) {
    const key = String(row.feature_name);
    (features[key] ??= []).push({ value: row.feature_value, area_ha: Number(row.area_ha ?? 0), source: row.source });
  }
  return features;
}

export async function chatRoute(request: Request, env: Env): Promise<Response> {
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

export async function cropRecommendationRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ district?: string; division?: string }>(request);
  if (!data?.district) return error(request, env, 400, 'district is required');
  const coastal = /Khulna|Barisal|Chittagong|Satkhira|Bagerhat|Patuakhali/i.test(`${data.division} ${data.district}`);
  const names = coastal ? ['লবণসহিষ্ণু ধান', 'সূর্যমুখী', 'মুগ ডাল', 'তরমুজ'] : ['ধান', 'গম', 'সরিষা', 'মসুর ডাল'];
  return json(request, env, { success: true, method: 'rule-based-baseline', district: data.district, recommended_crops: names.map((name, index) => ({ name, confidence: 82 - index * 5, reason: 'মৌসুম, অঞ্চল ও সাধারণ কৃষি উপযোগিতার ভিত্তিতে প্রাথমিক সুপারিশ' })) });
}

export async function aiSearchRoute(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!query) return error(request, env, 400, 'q is required');
  const answer = `“${query}” বিষয়ে নির্ভরযোগ্য পরামর্শের জন্য ফসলের নাম, এলাকা, মৌসুম ও লক্ষণ উল্লেখ করুন। সরকারি কৃষি তথ্যের সঙ্গে ফলাফল যাচাই করুন এবং রাসায়নিক ব্যবহারের আগে স্থানীয় কৃষি কর্মকর্তার পরামর্শ নিন।`;
  return json(request, env, { success: true, query, originalQuery: query, answer, isAgriQuery: true, wasBanglish: false, timeTaken: 'instant', sourceBreakdown: {}, sources: [{ title: 'কৃষি তথ্য সার্ভিস', url: 'https://ais.gov.bd/', source: 'AIS Bangladesh', snippet: 'বাংলাদেশের সরকারি কৃষি তথ্য।' }], relatedTopics: [] });
}

export async function soilSummaryRoute(request: Request, env: Env): Promise<Response> {
  const district = new URL(request.url).searchParams.get('district');
  const upazila = new URL(request.url).searchParams.get('upazila');
  if (!district) return error(request, env, 400, 'district is required');
  const query = upazila
    ? env.DB.prepare('SELECT feature_name, feature_value, area_ha, source FROM soil_features WHERE district_name = ? AND upazila_name = ? ORDER BY feature_name, area_ha DESC').bind(district, upazila)
    : env.DB.prepare('SELECT feature_name, feature_value, SUM(area_ha) AS area_ha, source FROM soil_features WHERE district_name = ? GROUP BY feature_name, feature_value, source ORDER BY feature_name, area_ha DESC').bind(district);
  const result = await query.all();
  return json(request, env, { district, upazila, features: result.results });
}

export async function soilDistrictsRoute(request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT DISTINCT district_name FROM soil_features ORDER BY district_name').all<{ district_name: string }>();
  const districts = result.results.map((row) => row.district_name);
  let locations: Array<{ name: string; division: string | null }> = [];
  try {
    const joined = await env.DB.prepare(
      "SELECT name_en AS name, division FROM districts WHERE EXISTS (SELECT 1 FROM soil_features WHERE soil_features.district_name = districts.name_en) ORDER BY name_en",
    ).all<{ name: string; division: string | null }>();
    locations = joined.results;
  } catch (cause) {
    console.warn('soil_districts_division_join_failed', cause);
  }
  return json(request, env, { success: true, districts, locations });
}

export async function soilUpazilasRoute(request: Request, env: Env, district: string): Promise<Response> {
  const result = await env.DB.prepare('SELECT DISTINCT upazila_name FROM soil_features WHERE district_name = ? AND upazila_name IS NOT NULL ORDER BY upazila_name').bind(district).all<{ upazila_name: string }>();
  return json(request, env, { success: true, upazilas: result.results.map((row) => ({ name: row.upazila_name })) });
}

export async function soilFeaturesRoute(request: Request, env: Env, district: string, upazila: string): Promise<Response> {
  const result = await env.DB.prepare('SELECT feature_name, feature_value, area_ha, source FROM soil_features WHERE district_name = ? AND upazila_name = ? ORDER BY feature_name, area_ha DESC').bind(district, upazila).all<Record<string, unknown>>();
  return json(request, env, { success: true, district, upazila, features: groupSoil(result.results) });
}

export async function soilNearestRoute(request: Request, env: Env): Promise<Response> {
  const lat = Number(new URL(request.url).searchParams.get('lat'));
  const lng = Number(new URL(request.url).searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return error(request, env, 400, 'lat and lng are required');
  const district = await env.DB.prepare('SELECT name_en, latitude, longitude FROM districts ORDER BY ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) LIMIT 1').bind(lat, lat, lng, lng).first<{ name_en: string; latitude: number; longitude: number }>();
  if (!district) return error(request, env, 404, 'Location not found');
  const upazila = await env.DB.prepare('SELECT upazila_name FROM soil_features WHERE district_name = ? AND upazila_name IS NOT NULL LIMIT 1').bind(district.name_en).first<{ upazila_name: string }>();
  const selectedUpazila = upazila?.upazila_name ?? district.name_en;
  const rows = await env.DB.prepare('SELECT feature_name, feature_value, area_ha, source FROM soil_features WHERE district_name = ? AND upazila_name = ? ORDER BY feature_name, area_ha DESC').bind(district.name_en, selectedUpazila).all<Record<string, unknown>>();
  return json(request, env, { success: true, district: district.name_en, upazila: selectedUpazila, distance_km: 0, coords: [district.latitude, district.longitude], features: groupSoil(rows.results) });
}

export async function soilCropRecommendationRoute(request: Request, env: Env, district: string, upazila: string): Promise<Response> {
  return json(request, env, { success: true, district, upazila, seasonAdvice: { season: 'মৌসুমভিত্তিক পরিকল্পনা', advice: 'স্থানীয় আবহাওয়া ও মাটি পরীক্ষা অনুযায়ী চূড়ান্ত সিদ্ধান্ত নিন।', crops: ['ধান', 'সরিষা', 'মসুর', 'গম'] }, recommendations: [] });
}