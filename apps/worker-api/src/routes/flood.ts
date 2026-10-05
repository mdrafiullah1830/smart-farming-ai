import type { Env } from '../types.ts';
import { json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

// ---------------------------------------------------------------------------
// Flood & Climate Resilience Engine.
//
// The decision a farmer faces in a flood is narrow and time-bound: should this
// standing crop move, and how many days are left to decide. So the engine
// returns three things -- a risk level, the reason for it, and a deadline --
// rather than a bare score nobody can act on.
//
// Risk is computed per request from the stored exposure plus live rainfall and
// is never persisted. A stored risk number outlives the forecast that produced
// it, and acting on a stale risk is worse than having none. Only what the
// farmer controls (their standing crop) and static geography (the zone) are
// stored; the weather half is fetched live.
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'moderate' | 'high' | 'severe';

export type FloodZoneRow = {
  id: string;
  district_id: string;
  name_en: string;
  name_bn: string;
  flood_depth_m: number;
  flood_duration_days: number;
  flood_seasons: string;
  note: string | null;
  district_name_en?: string;
  district_name_bn?: string;
};

type ExposureRow = {
  id: string;
  user_id: string;
  farm_id: string | null;
  zone_id: string;
  crop_name_en: string;
  crop_name_bn: string;
  area_acres: number;
  planted_on: string | null;
  seasons: string;
  crop_value_taka: number | null;
  drainage_class: number;
};

type OpenMeteoForecast = {
  daily?: {
    time?: string[];
    precipitation_sum?: (number | null)[];
    precipitation_hours?: (number | null)[];
  };
};

function seasonList(raw: string): string[] {
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Which crop season we are in, from the Bengali calendar a farmer actually uses.
 * Approximate: the solar terms that matter shift by a day or two a year, and a
 * one-day error does not change the advice.
 */
export function currentSeason(date: Date): string {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  if (m === 3 || (m === 4 && d <= 14)) return 'boro';
  if (m >= 4 && m <= 8) return 'aman';
  if (m >= 10 || (m === 9 && d >= 15)) return 'aus';
  return 'boro';
}

/**
 * A zone floods a given season when it either names that season or lists no
 * seasons at all. An empty list is not "never floods" -- it means the source
 * did not break it down, and reading it as safe would understate the risk.
 */
function zoneFloodsIn(zoneFloodSeasons: string, season: string): boolean {
  const seasons = seasonList(zoneFloodSeasons);
  return seasons.length === 0 || seasons.includes(season);
}

/**
 * Live rainfall pressure, 0..1, from the 7-day forecast.
 *
 * Deliberately simple and explainable: a farmer told "risk 0.62" and shown
 * "72mm in 3 days" can check the reasoning. A model nobody can interrogate is
 * worse than no model for a decision with a deadline attached.
 */
export function rainfallPressure(forecast: OpenMeteoForecast): { pressure: number; rainMm7d: number; peakDailyMm: number } {
  const values = (forecast.daily?.precipitation_sum ?? []).map((mm) => (Number.isFinite(mm) ? (mm as number) : 0));
  const hours = (forecast.daily?.precipitation_hours ?? []).map((h) => (Number.isFinite(h) ? (h as number) : 0));
  const rainMm7d = values.reduce((sum, mm) => sum + mm, 0);
  const peakDailyMm = values.length ? Math.max(...values) : 0;
  // Rain spread over many hours drains; the same total in a few hours does not.
  const concentration = hours.length ? Math.max(...hours) : 0;
  const totalComponent = Math.min(1, rainMm7d / 180);
  const intensityComponent = Math.min(1, concentration / 18);
  const pressure = Math.min(1, 0.65 * totalComponent + 0.35 * intensityComponent);
  return { pressure, rainMm7d: Math.round(rainMm7d), peakDailyMm: Math.round(peakDailyMm) };
}

export type RiskAssessment = {
  level: RiskLevel;
  score: number;
  reasons_bn: string[];
  reasons_en: string[];
  /** Days left to decide; null when the risk is not time-bound. */
  actionDays: number | null;
  actionWindowBn: string;
  actionWindowEn: string;
};

function levelFromScore(score: number): RiskLevel {
  if (score >= 0.75) return 'severe';
  if (score >= 0.5) return 'high';
  if (score >= 0.25) return 'moderate';
  return 'low';
}

/**
 * Combine the static exposure with the live forecast.
 *
 * Weights are chosen so the static facts dominate and the forecast modulates: a
 * zone that reliably floods 1.5 m for two weeks is dangerous even in a dry week,
 * and a shallow zone in a downpour is still dangerous. Nothing here is a
 * trained model; it is an explicit, arguable rule set, which is what makes it
 * defensible to a farmer.
 */
export function assessFloodRisk(input: {
  floodDepthM: number;
  floodDurationDays: number;
  drainageClass: number;
  cropsInSeason: boolean;
  rainfallPressure: number;
  rainMm7d: number;
  season: string;
}): RiskAssessment {
  const depth = Math.min(1, input.floodDepthM / 2.0);         // 2 m is severe
  const duration = Math.min(1, input.floodDurationDays / 21); // 3 weeks is severe
  const drainage = [1.0, 0.85, 0.55][input.drainageClass - 1] ?? 0.7;
  const staticRisk = Math.min(1, (0.55 * depth + 0.45 * duration) * drainage);

  // A crop out of season is not standing in the water, so rainfall is
  // irrelevant to it even when the zone itself floods now.
  const weatherRisk = input.cropsInSeason ? input.rainfallPressure : 0;
  // A fully-exposing zone must be able to reach `severe` on its own facts. With
  // 0.65/0.35 weights a static risk of 1.0 topped out at 0.65, so no amount of
  // drought could ever produce a severe warning and the worst fields would be
  // downgraded. The floor guarantees the static half can always reach the top
  // level on its own; rain can push a marginal zone up, never pull a certain
  // one down.
  const score = Math.max(0, Math.min(1, staticRisk * 0.65 + weatherRisk * 0.35 + (staticRisk >= 1 ? 0.15 : 0)));
  const level = levelFromScore(score);

  const reasonsBn: string[] = [];
  const reasonsEn: string[] = [];
  if (input.floodDepthM >= 1) {
    reasonsBn.push(`এই এলাকায় পানির গভীরতা সাধারণত ${input.floodDepthM.toFixed(1)} মিটার বেশি`);
    reasonsEn.push(`Typical flood depth here is ${input.floodDepthM.toFixed(1)} m`);
  }
  if (input.floodDurationDays >= 7) {
    reasonsBn.push(`পানি সাধারণত ${input.floodDurationDays} দিন থাকে`);
    reasonsEn.push(`Water typically stands for ${input.floodDurationDays} days`);
  }
  if (input.drainageClass === 1) {
    reasonsBn.push('এই জমিতে নিষ্কাশন ব্যবস্থা দুর্বল');
    reasonsEn.push('Drainage on this plot is poor');
  }
  if (input.cropsInSeason && input.rainMm7d >= 40) {
    reasonsBn.push(`আগামী ৭ দিনে ${input.rainMm7d} মিমি বৃষ্টির আভাস`);
    reasonsEn.push(`${input.rainMm7d} mm of rain forecast in the next 7 days`);
  } else if (input.cropsInSeason && input.rainfallPressure >= 0.4) {
    reasonsBn.push('ভারী বৃষ্টির সম্ভাবনা বাড়ছে');
    reasonsEn.push('Heavy rain is becoming likely');
  }
  if (!input.cropsInSeason) {
    reasonsBn.push(`${input.season} মৌসুমে এই ফসল মাঠে নেই`);
    reasonsEn.push(`No ${input.season} crop is standing here right now`);
  }
  if (!reasonsBn.length) {
    reasonsBn.push('এই মুহূর্তে উল্লেখযোগ্য ঝুঁকি নেই');
    reasonsEn.push('No significant risk at the moment');
  }

  // The deadline is the useful part: below `high` there is nothing to decide.
  let actionDays: number | null = null;
  if (level === 'severe') actionDays = 2;
  else if (level === 'high') actionDays = 4;
  else if (level === 'moderate') actionDays = 7;

  const actionWindowBn = actionDays === null
    ? 'এখনই কোনো পদক্ষেপ লাগবে না'
    : actionDays <= 2 ? '২ দিনের মধ্যে ফসল তোলার সিদ্ধান্ত নিন'
      : actionDays <= 4 ? '৪ দিনের মধ্যে পরিকল্পনা করুন'
        : 'এই সপ্তাহে নজর রাখুন';
  const actionWindowEn = actionDays === null
    ? 'No action needed right now'
    : actionDays <= 2 ? 'Decide on harvest within 2 days'
      : actionDays <= 4 ? 'Plan within 4 days'
        : 'Keep monitoring this week';

  return {
    level, score: Number(score.toFixed(2)),
    reasons_bn: reasonsBn, reasons_en: reasonsEn,
    actionDays, actionWindowBn, actionWindowEn,
  };
}

type Rainfall = { pressure: number; rainMm7d: number; peakDailyMm: number; available: boolean };

/**
 * Fetch the 7-day rainfall outlook. A forecast outage must not erase the
 * exposure: the static half of the assessment still stands on its own.
 */
export async function fetchRainfall(lat: number, lon: number): Promise<Rainfall> {
  try {
    const upstream = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&daily=precipitation_sum,precipitation_hours&forecast_days=7&timezone=Asia%2FDhaka',
      { signal: AbortSignal.timeout(8000) },
    );
    if (!upstream.ok) return { pressure: 0, rainMm7d: 0, peakDailyMm: 0, available: false };
    const data = await upstream.json<OpenMeteoForecast>();
    const { pressure, rainMm7d, peakDailyMm } = rainfallPressure(data);
    return { pressure, rainMm7d, peakDailyMm, available: true };
  } catch {
    return { pressure: 0, rainMm7d: 0, peakDailyMm: 0, available: false };
  }
}

/**
 * Assess one exposure against the live forecast.
 *
 * A crop counts as standing only when BOTH the zone floods in this season AND
 * the farmer's own season list includes it. Either alone is not enough: a zone
 * that floods in `aman` says nothing about a boro crop in the same field.
 */
export async function assessExposure(
  exposure: ExposureRow,
  zone: FloodZoneRow,
  rainfall: Rainfall,
  season: string,
): Promise<RiskAssessment & { exposureId: string; zoneNameBn: string; zoneNameEn: string; atRiskTaka: number }> {
  const cropStanding = zoneFloodsIn(zone.flood_seasons, season)
    && exposure.seasons.split(',').some((s) => s.trim().toLowerCase() === season);

  const risk = assessFloodRisk({
    floodDepthM: zone.flood_depth_m,
    floodDurationDays: zone.flood_duration_days,
    drainageClass: exposure.drainage_class,
    cropsInSeason: cropStanding,
    rainfallPressure: rainfall.pressure,
    rainMm7d: rainfall.rainMm7d,
    season,
  });

  // At-risk value is the standing crop's value, not the whole year's. Only a
  // severe risk implies total loss; below that the farmer loses time and
  // inputs, so a fraction is the honest figure rather than the full value.
  const fraction = risk.level === 'severe' ? 1
    : risk.level === 'high' ? 0.5
      : risk.level === 'moderate' ? 0.2 : 0;
  const atRiskTaka = exposure.crop_value_taka === null ? 0 : toTaka(exposure.crop_value_taka * fraction);

  return {
    ...risk,
    exposureId: exposure.id,
    zoneNameBn: zone.name_bn || zone.name_en,
    zoneNameEn: zone.name_en,
    atRiskTaka,
  };
}

export type AssessedExposure = Awaited<ReturnType<typeof assessExposure>>;

/**
 * Rainfall for one district from its centroid. The id is resolved first so an
 * unknown id is answered honestly rather than surfacing as a foreign-key error
 * or a silent 500.
 */
async function rainfallForDistrict(env: Env, districtId: string): Promise<{ rainfall: Rainfall; nameEn: string; nameBn: string }> {
  const district = await env.DB.prepare(
    'SELECT name_en, name_bn, latitude, longitude FROM districts WHERE id = ?',
  ).bind(districtId).first<{ name_en: string; name_bn: string; latitude: number; longitude: number }>();

  if (!district) return { rainfall: { pressure: 0, rainMm7d: 0, peakDailyMm: 0, available: false }, nameEn: '', nameBn: '' };

  const lat = Number.isFinite(district.latitude) ? district.latitude : 23.81;
  const lon = Number.isFinite(district.longitude) ? district.longitude : 90.41;
  return { rainfall: await fetchRainfall(lat, lon), nameEn: district.name_en, nameBn: district.name_bn || district.name_en };
}

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

const LEVEL_ORDER: Record<RiskLevel, number> = { severe: 3, high: 2, moderate: 1, low: 0 };

/** Whole taka only -- D1 has no decimal type and fractional taka is not real money. */
export function toTaka(value: number): number {
  return Math.round(value);
}

/**
 * Exposure CRUD.
 *
 * `zone_id` is resolved before the insert for the same reason the marketplace
 * route does it: it is a foreign key, and an id that is not a row turns a
 * client mistake into an opaque 500. An unknown id answers 400 and names the
 * endpoint that carries the valid ones.
 */
export async function floodExposureRoute(request: Request, env: Env, exposureId?: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  if (exposureId) {
    if (request.method === 'DELETE') {
      const result = await env.DB.prepare(
        'DELETE FROM flood_exposures WHERE id = ? AND user_id = ?',
      ).bind(exposureId, user.id).run();
      if (!result.meta.changes) return error(request, env, 404, 'Exposure not found');
      return json(request, env, { success: true });
    }
    return error(request, env, 405, 'Method not allowed');
  }

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT e.id, e.farm_id, e.zone_id, e.crop_name_en, e.crop_name_bn, e.area_acres,
              e.planted_on, e.seasons, e.crop_value_taka, e.drainage_class, e.created_at,
              z.name_en AS zone_name_en, z.name_bn AS zone_name_bn
       FROM flood_exposures e JOIN flood_zones z ON z.id = e.zone_id
       WHERE e.user_id = ? ORDER BY e.created_at DESC`,
    ).bind(user.id).all();
    return json(request, env, { success: true, exposures: result.results });
  }

  if (request.method === 'POST') {
    const data = await body<{
      zone_id?: string; farm_id?: string; crop_name_en?: string; crop_name_bn?: string;
      area_acres?: number; planted_on?: string; seasons?: string;
      crop_value_taka?: number; drainage_class?: number;
    }>(request);

    const zoneId = data?.zone_id?.trim();
    const cropEn = data?.crop_name_en?.trim();
    const areaAcres = Number(data?.area_acres);
    if (!zoneId) return error(request, env, 400, 'zone_id is required');
    if (!cropEn) return error(request, env, 400, 'crop_name_en is required');
    if (!Number.isFinite(areaAcres) || areaAcres <= 0) {
      return error(request, env, 400, 'area_acres must be greater than 0');
    }

    const zone = await env.DB.prepare('SELECT id FROM flood_zones WHERE id = ?').bind(zoneId).first<{ id: string }>();
    if (!zone) return error(request, env, 400, 'Unknown zone_id. Use an id from GET /api/v1/flood/zones');

    const drainage = Number(data?.drainage_class ?? 2);
    if (!Number.isInteger(drainage) || drainage < 1 || drainage > 3) {
      return error(request, env, 400, 'drainage_class must be 1, 2 or 3');
    }
    const value = Number(data?.crop_value_taka);
    if (data?.crop_value_taka !== undefined && (!Number.isFinite(value) || value < 0)) {
      return error(request, env, 400, 'crop_value_taka must be zero or more');
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO flood_exposures
         (id, user_id, farm_id, zone_id, crop_name_en, crop_name_bn, area_acres,
          planted_on, seasons, crop_value_taka, drainage_class)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, user.id, data?.farm_id ?? null, zoneId, cropEn, data?.crop_name_bn?.trim() ?? '',
      areaAcres, data?.planted_on?.trim() || null, data?.seasons?.trim() ?? '',
      Number.isFinite(value) ? toTaka(value) : null, drainage,
    ).run();

    return json(request, env, {
      success: true,
      exposure: { id, zone_id: zoneId, crop_name_en: cropEn, area_acres: areaAcres },
    }, 201);
  }

  return error(request, env, 405, 'Method not allowed');
}
export async function floodAssessmentRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const rows = await env.DB.prepare(
    `SELECT e.id, e.user_id, e.farm_id, e.zone_id, e.crop_name_en, e.crop_name_bn,
            e.area_acres, e.planted_on, e.seasons, e.crop_value_taka, e.drainage_class,
            z.id AS z_id, z.district_id, z.name_en AS z_name_en, z.name_bn AS z_name_bn,
            z.flood_depth_m, z.flood_duration_days, z.flood_seasons, z.note,
            d.name_en AS d_name_en, d.name_bn AS d_name_bn, d.latitude, d.longitude
     FROM flood_exposures e
     JOIN flood_zones z ON z.id = e.zone_id
     LEFT JOIN districts d ON d.id = z.district_id
     WHERE e.user_id = ?
     ORDER BY e.created_at DESC`,
  ).bind(user.id).all<Record<string, unknown>>();

  const season = currentSeason(new Date());
  const assessed: AssessedExposure[] = [];
  // One forecast per district, reused across that district's exposures: three
  // fields in one upazila should cost one upstream request, not three.
  const rainfallCache = new Map<string, Rainfall>();

  for (const row of rows.results) {
    const r = row as Record<string, never>;
    const zone: FloodZoneRow = {
      id: r.z_id, district_id: r.district_id, name_en: r.z_name_en, name_bn: r.z_name_bn,
      flood_depth_m: r.flood_depth_m, flood_duration_days: r.flood_duration_days,
      flood_seasons: r.flood_seasons, note: r.note,
    };
    const exposure: ExposureRow = {
      id: r.id, user_id: r.user_id, farm_id: r.farm_id, zone_id: r.zone_id,
      crop_name_en: r.crop_name_en, crop_name_bn: r.crop_name_bn, area_acres: r.area_acres,
      planted_on: r.planted_on, seasons: r.seasons, crop_value_taka: r.crop_value_taka,
      drainage_class: r.drainage_class,
    };
    let rainfall = rainfallCache.get(r.district_id);
    if (!rainfall) {
      const lat = Number.isFinite(r.latitude) ? Number(r.latitude) : 23.81;
      const lon = Number.isFinite(r.longitude) ? Number(r.longitude) : 90.41;
      rainfall = await fetchRainfall(lat, lon);
      rainfallCache.set(r.district_id, rainfall);
    }
    assessed.push(await assessExposure(exposure, zone, rainfall, season));
  }

  // Worst first: the exposure that needs a decision today must not sit below a
  // calm one in the list.
  assessed.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || b.score - a.score);

  return json(request, env, {
    success: true,
    season,
    highestLevel: assessed[0]?.level ?? 'low',
    totalAtRiskTaka: assessed.reduce((sum, a) => sum + a.atRiskTaka, 0),
    forecastAvailable: [...rainfallCache.values()].some((r) => r.available),
    exposures: assessed,
  });
}

/**
 * District-level exposure: how much is at risk across all farmers in one
 * district. Public, because a district administration and relief agencies need
 * the same picture, and it exposes no farmer identity.
 */
export async function floodDistrictRoute(request: Request, env: Env, districtId: string): Promise<Response> {
  const { rainfall, nameEn, nameBn } = await rainfallForDistrict(env, districtId);
  if (!nameEn) {
    return error(request, env, 400, 'Unknown district_id. Use an id from /api/v1/locations/zillas');
  }
  const zones = await env.DB.prepare(
    `SELECT id, district_id, name_en, name_bn, flood_depth_m, flood_duration_days,
            flood_seasons, note
     FROM flood_zones WHERE district_id = ? ORDER BY flood_depth_m DESC`,
  ).bind(districtId).all<FloodZoneRow>();

  const season = currentSeason(new Date());
  // A district's headline risk is its most exposed zone in this season.
  let highest: RiskLevel = 'low';
  let worstScore = 0;
  for (const zone of zones.results) {
    const r = assessFloodRisk({
      floodDepthM: zone.flood_depth_m,
      floodDurationDays: zone.flood_duration_days,
      drainageClass: 2,
      cropsInSeason: zoneFloodsIn(zone.flood_seasons, season),
      rainfallPressure: rainfall.pressure,
      rainMm7d: rainfall.rainMm7d,
      season,
    });
    if (r.score > worstScore) { worstScore = r.score; highest = r.level; }
  }

  return json(request, env, {
    success: true, district: { id: districtId, name_en: nameEn, name_bn: nameBn },
    season, level: highest, score: Number(worstScore.toFixed(2)),
    forecast: { available: rainfall.available, rainMm7d: rainfall.rainMm7d, peakDailyMm: rainfall.peakDailyMm },
    zones: zones.results,
  });
}

const VALID_ACTIONS = ['none', 'early', 'relocated', 'drained', 'lost'] as const;

/**
 * Record what the farmer actually did about a warning.
 *
 * Append-only and tied to the exposure, so the loss ledger and the hit rate
 * (how often acting on a warning avoided a loss) can be computed later. The
 * risk level is snapshotted at the time of the action: a `severe` warning in
 * March is not the same evidence as one in August.
 */
export async function floodActionRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT a.id, a.exposure_id, a.action, a.risk_level_at_action, a.loss_taka,
              a.note, a.acted_on, e.crop_name_en, e.crop_name_bn, e.crop_value_taka
       FROM flood_actions a JOIN flood_exposures e ON e.id = a.exposure_id
       WHERE a.user_id = ? ORDER BY a.acted_on DESC LIMIT 100`,
    ).bind(user.id).all();
    const rows = result.results as Array<{ loss_taka: number | null }>;
    const claimed = rows.filter((r) => r.loss_taka !== null);
    return json(request, env, {
      success: true,
      actions: result.results,
      ledger: {
        claimCount: claimed.length,
        totalClaimedTaka: claimed.reduce((sum, r) => sum + (r.loss_taka ?? 0), 0),
      },
    });
  }

  if (request.method !== 'POST') return error(request, env, 405, 'Method not allowed');

  const data = await body<{ exposure_id?: string; action?: string; loss_taka?: number; note?: string }>(request);
  const exposureId = data?.exposure_id?.trim();
  const action = data?.action?.trim();
  if (!exposureId) return error(request, env, 400, 'exposure_id is required');
  if (!action || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return error(request, env, 400, `action must be one of: ${VALID_ACTIONS.join(', ')}`);
  }

  // Ownership is checked rather than trusted: this is what stops a farmer
  // logging an action against somebody else's field.
  const exposure = await env.DB.prepare(
    'SELECT id, zone_id FROM flood_exposures WHERE id = ? AND user_id = ?',
  ).bind(exposureId, user.id).first<{ id: string; zone_id: string }>();
  if (!exposure) return error(request, env, 404, 'Exposure not found');

  const loss = Number(data?.loss_taka);
  if (data?.loss_taka !== undefined && (!Number.isFinite(loss) || loss < 0)) {
    return error(request, env, 400, 'loss_taka must be zero or more');
  }

  // Snapshot the risk level now so the hit-rate analysis is honest later. The
  // static half is used on purpose: a stored level must be comparable across
  // months, and a forecast-derived level would move under the same zone.
  const zone = await env.DB.prepare(
    'SELECT flood_depth_m, flood_duration_days, flood_seasons FROM flood_zones WHERE id = ?',
  ).bind(exposure.zone_id).first<{ flood_depth_m: number; flood_duration_days: number; flood_seasons: string }>();
  const season = currentSeason(new Date());
  const level = zone
    ? assessFloodRisk({
      floodDepthM: zone.flood_depth_m, floodDurationDays: zone.flood_duration_days,
      drainageClass: 2, cropsInSeason: zoneFloodsIn(zone.flood_seasons, season),
      rainfallPressure: 0, rainMm7d: 0, season,
    }).level
    : 'low';

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO flood_actions
       (id, exposure_id, user_id, action, risk_level_at_action, loss_taka, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, exposureId, user.id, action, level,
    Number.isFinite(loss) ? toTaka(loss) : null, data?.note?.trim() || null).run();

  return json(request, env, {
    success: true, action: { id, exposure_id: exposureId, action, risk_level_at_action: level },
  }, 201);
}

/** Public list of known flood zones, filterable by district. */
export async function floodZonesRoute(request: Request, env: Env): Promise<Response> {
  const districtId = new URL(request.url).searchParams.get('district_id')?.trim();
  const base = `SELECT z.id, z.district_id, z.name_en, z.name_bn, z.flood_depth_m, z.flood_duration_days,
                       z.flood_seasons, z.note, d.name_en AS district_name_en, d.name_bn AS district_name_bn
                FROM flood_zones z LEFT JOIN districts d ON d.id = z.district_id`;
  const result = districtId
    ? await env.DB.prepare(`${base} WHERE z.district_id = ? ORDER BY z.flood_depth_m DESC`).bind(districtId).all()
    : await env.DB.prepare(`${base} ORDER BY z.flood_depth_m DESC LIMIT 200`).all();
  return json(request, env, { success: true, zones: result.results });
}