import type { Env } from '../types.ts';
import { json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

// ---------------------------------------------------------------------------
// Irrigation & Water Management.
//
// The existing irrigation switch turns a pump on and off. That is remote
// control, not water management, and it answers none of the three questions a
// farmer actually has: does this field need water now, how much, and what did
// last season cost.
//
// The judgement here is deliberately conservative. A field is only called
// "needs water" when the moisture reading is BELOW the requirement threshold,
// never merely because it is not saturated. Over-watering rice costs pumped
// water and the fuel to move it, and in the coastal belt it also raises
// salinity. Telling a farmer to irrigate when they do not need to is an
// expensive kind of wrong answer, so the engine stays quiet until it is sure.
//
// Every recommendation is labelled as guidance derived from published
// crop-stage figures, not a measurement of that field.
// ---------------------------------------------------------------------------

type Season = 'boro' | 'aman' | 'aus' | 'other';

type WaterRequirement = {
  id: string;
  district_id: string | null;
  crop_name_en: string;
  crop_name_bn: string;
  season: Season;
  stage: string;
  mm_per_day: number;
  note: string | null;
};

/**
 * Growth stages in order, so the current stage is derivable from how long ago
 * the crop was sown rather than asked of the farmer.
 */
const STAGE_ORDER = ['sowing', 'transplanted', 'tillering', 'panicle', 'maturity'];

/** Days after sowing that each stage typically begins for boro/aman rice. */
const STAGE_DAYS: Record<string, number> = {
  sowing: 0,
  transplanted: 10,
  tillering: 30,
  panicle: 60,
  maturity: 95,
};

export function stageForDays(daysSinceSowing: number): string {
  let stage = 'sowing';
  for (const candidate of STAGE_ORDER) {
    if (daysSinceSowing >= (STAGE_DAYS[candidate] ?? 0)) stage = candidate;
  }
  return stage;
}

/**
 * The requirement for a crop at a stage, preferring the district-specific row.
 *
 * District rows exist for two real reasons -- higher evapotranspiration in the
 * north-west, salinity in the coastal belt -- so a district figure must win over
 * the national default rather than being averaged with it.
 */
export function pickRequirement(
  requirements: WaterRequirement[],
  crop: string,
  season: Season,
  stage: string,
  districtId?: string | null,
): WaterRequirement | null {
  const match = (r: WaterRequirement) => r.crop_name_en === crop && r.season === season && r.stage === stage;
  return requirements.find((r) => match(r) && r.district_id && r.district_id === districtId)
    ?? requirements.find((r) => match(r) && !r.district_id)
    ?? null;
}

/**
 * Soil moisture above this counts as adequate. A rice field is a shallow-water
 * crop, so this sits well below saturation on purpose.
 */
/**
 * Soil moisture above this counts as adequate. A rice field is a shallow-water
 * crop, so this sits well below saturation on purpose.
 */
export const ADEQUATE_MOISTURE_PERCENT = 60;

export type Advice = {
  status: 'adequate' | 'watch' | 'needs_water' | 'no_reading' | 'no_requirement';
  statusBn: 'পর্যাপ্ত' | 'লক্ষ্য রাখুন' | 'সেচ দরকার' | 'তথ্য নেই' | 'চাহিদা অজানা';
  headlineBn: string;
  headlineEn: string;
  detailBn: string;
  detailEn: string;
  /** Whole litres for the area, or null when it cannot be computed. */
  litresPerDay: number | null;
  mmPerDay: number | null;
  stage: string;
  guidance: boolean;
};

/** 1 mm of water over 1 acre is 4.047 litres. A conversion, not an estimate. */
const LITRES_PER_MM_PER_ACRE = 4.047;

/**
 * Bengali numerals.
 *
 * The rest of the Bangla copy carries Bengali digits, and a Bangla sentence
 * reading "73 লিটার" beside a dashboard reading "৭৩" looks broken. `en-IN`
 * grouping is still applied for the thousands separator, then the digits are
 * mapped.
 */
function bengaliNumber(value: number): string {
  return value.toLocaleString('en-IN').replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

function litres(mmPerDay: number, areaAcres: number | null): number | null {
  return areaAcres && areaAcres > 0 ? Math.round(mmPerDay * areaAcres * LITRES_PER_MM_PER_ACRE) : null;
}

/**
 * Decide whether a field needs water.
 *
 * When the area is unknown the recommendation still stands and the volume is
 * null: dropping the advice because a number is missing would be the wrong
 * trade, since the farmer can act on "needs water" regardless of litres.
 */
export function adviseIrrigation(input: {
  requirement: WaterRequirement | null;
  latestMoisturePercent: number | null;
  areaAcres: number | null;
  stage: string;
}): Advice {
  // The requirement is independent of any sensor: it is the crop's demand for
  // this stage, and a farmer should get it even before a probe is wired up. So
  // it is resolved first and carried on every branch below.
  const requirement = input.requirement;
  const hasRequirement = requirement !== null;
  const mmPerDay = requirement?.mm_per_day ?? null;
  const common = {
    stage: input.stage,
    guidance: true,
    mmPerDay,
    litresPerDay: mmPerDay === null ? null : litres(mmPerDay, input.areaAcres),
  };

  if (!hasRequirement) {
    return {
      ...common,
      status: 'no_requirement',
      statusBn: 'চাহিদা অজানা',
      headlineBn: 'এই ফসলের জন্য চাহিদার তথ্য নেই',
      headlineEn: 'No requirement recorded for this crop',
      detailBn: 'ফসল ও মৌসুম সঠিকভাবে দিলে পরামর্শ দেওয়া যাবে।',
      detailEn: 'Supply the crop and season correctly to get a recommendation.',
    };
  }

  // No reading but a known requirement: still hand over the figure. Withholding
  // it because a sensor is missing would throw away the one useful number.
  if (input.latestMoisturePercent === null) {
    return {
      ...common,
      status: 'no_reading',
      statusBn: 'তথ্য নেই',
      headlineBn: 'মাটির আর্দ্রতার তথ্য নেই',
      headlineEn: 'No soil moisture reading yet',
      detailBn: `সেচের সিদ্ধান্ত নিতে একটি সেন্সর পড়া প্রয়োজন, তবে এই ধাপে প্রয়োজন ${bengaliNumber(mmPerDay as number)} মিমি/দিন`
        + (common.litresPerDay ? `, প্রায় ${bengaliNumber(common.litresPerDay)} লিটার` : '') + '।',
      detailEn: `A sensor reading is needed before an irrigation decision can be made, but this stage needs ${mmPerDay} mm/day`
        + (common.litresPerDay ? `, about ${common.litresPerDay.toLocaleString('en-IN')} litres` : '') + '.',
    };
  }

  const moisture = input.latestMoisturePercent;

  if (moisture < ADEQUATE_MOISTURE_PERCENT) {
    return {
      ...common,
      status: 'needs_water',
      statusBn: 'সেচ দরকার',
      headlineBn: 'এখন সেচ দরকার',
      headlineEn: 'Irrigation needed now',
      detailBn: `মাটির আর্দ্রতা ${bengaliNumber(Math.round(moisture))}% — ${bengaliNumber(mmPerDay as number)} মিমি/দিন প্রয়োজন`
        + (common.litresPerDay ? `, প্রায় ${bengaliNumber(common.litresPerDay)} লিটার` : '')
        + '। সকালে সেচ দিলে বাষ্পীভবন কম হয়।',
      detailEn: `Soil moisture is ${Math.round(moisture)}% — needs ${mmPerDay} mm/day`
        + (common.litresPerDay ? `, about ${common.litresPerDay.toLocaleString('en-IN')} litres` : '')
        + '. Irrigation early in the morning loses less to evaporation.',
    };
  }

  if (moisture < ADEQUATE_MOISTURE_PERCENT + 10) {
    return {
      ...common,
      status: 'watch',
      statusBn: 'লক্ষ্য রাখুন',
      headlineBn: 'সেচের প্রস্তুতি নিন',
      headlineEn: 'Prepare to irrigate',
      detailBn: `মাটির আর্দ্রতা ${bengaliNumber(Math.round(moisture))}% — সীমান্তের কাছে। আগামীকাল আবার দেখুন।`,
      detailEn: `Soil moisture is ${Math.round(moisture)}% — close to the threshold. Check again tomorrow.`,
    };
  }

  return {
    ...common,
    status: 'adequate',
    statusBn: 'পর্যাপ্ত',
    headlineBn: 'এখন সেচের দরকার নেই',
    headlineEn: 'No irrigation needed now',
    detailBn: `মাটির আর্দ্রতা ${bengaliNumber(Math.round(moisture))}% — পর্যাপ্ত।`,
    detailEn: `Soil moisture is ${Math.round(moisture)}% — adequate.`,
  };
}

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

/**
 * GET /api/v1/irrigation/advice
 *
 * The judgement call: latest sensor reading plus the seeded requirement for the
 * farmer's crop, season and district. Public requirements, but the sensor
 * reading is the farmer's own, so this route requires auth.
 */
export async function irrigationAdviceRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const url = new URL(request.url);
  const crop = (url.searchParams.get('crop') ?? 'Rice').trim();
  const seasonParam = url.searchParams.get('season');
  const season: Season = ['boro', 'aman', 'aus', 'other'].includes(seasonParam ?? '')
    ? (seasonParam as Season) : 'boro';
  const districtId = url.searchParams.get('district_id')?.trim() || null;
  const sownDaysAgoRaw = Number(url.searchParams.get('days_since_sowing'));
  // An unset or nonsensical value falls back to the panicle stage rather than
  // "sowing": advising on a seedling is as wrong as advising on a mature crop,
  // and peak demand is the figure most likely to be needed.
  const daysSinceSowing = Number.isFinite(sownDaysAgoRaw) && sownDaysAgoRaw >= 0
    ? sownDaysAgoRaw : 60;
  const stage = stageForDays(daysSinceSowing);

  const requirements = await env.DB.prepare(
    'SELECT id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day, note FROM water_requirements',
  ).all<WaterRequirement>();

  // The farmer's own latest moisture reading, if a device has reported one.
  const reading = await env.DB.prepare(
    `SELECT r.moisture_percent, r.recorded_at
     FROM sensor_readings r
     WHERE r.owner_id = ? AND r.moisture_percent IS NOT NULL
     ORDER BY r.recorded_at DESC LIMIT 1`,
  ).bind(user.id).first<{ moisture_percent: number | null; recorded_at: string }>();

  const farm = await env.DB.prepare(
    'SELECT area_acres FROM farms WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1',
  ).bind(user.id).first<{ area_acres: number }>();

  const requirement = pickRequirement(requirements.results, crop, season, stage, districtId);
  const advice = adviseIrrigation({
    requirement,
    latestMoisturePercent: reading?.moisture_percent ?? null,
    areaAcres: farm?.area_acres ?? null,
    stage,
  });

  return json(request, env, {
    success: true,
    crop, season, stage, daysSinceSowing,
    areaAcres: farm?.area_acres ?? null,
    moisturePercent: reading?.moisture_percent ?? null,
    readingAt: reading?.recorded_at ?? null,
    districtSpecific: !!requirement?.district_id,
    advice,
  });
}

/**
 * GET /api/v1/irrigation/usage
 * POST /api/v1/irrigation/events
 *
 * The history the pump switch cannot keep. `device_commands` overwrites one row
 * per device, so without this there is no answer to "how much water did this
 * field get last season" -- the question that decides whether a pump is worth
 * its fuel.
 */
export async function irrigationUsageRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const url = new URL(request.url);
  const seasonParam = url.searchParams.get('season');
  const season: Season | null = ['boro', 'aman', 'aus', 'other'].includes(seasonParam ?? '')
    ? (seasonParam as Season) : null;

  if (request.method === 'GET') {
    const events = await env.DB.prepare(
      `SELECT id, device_id, source, crop_name_en, season, volume_litres,
              duration_minutes, started_at, ended_at, cost_taka, note
       FROM irrigation_events WHERE owner_id = ?${season ? ' AND season = ?' : ''}
       ORDER BY started_at DESC LIMIT 200`,
    ).bind(...(season ? [user.id, season] : [user.id])).all();

    const rows = events.results as Array<{ volume_litres: number | null; cost_taka: number | null }>;
    // Only confirmed runs count. A NULL volume is an "on" command whose run was
    // never reported, and counting it as zero would make the total look
    // authoritative when it is not.
    const confirmed = rows.filter((r) => r.volume_litres !== null);
    return json(request, env, {
      success: true,
      season,
      usage: {
        // Whole litres: D1 has no decimal type and a decimal litre is not real.
        totalLitres: confirmed.reduce((sum, r) => sum + (r.volume_litres ?? 0), 0),
        totalCostTaka: confirmed.reduce((sum, r) => sum + (r.cost_taka ?? 0), 0),
        runCount: confirmed.length,
        // Runs with no confirmed volume: visible, not silently dropped.
        unconfirmedCount: rows.length - confirmed.length,
      },
      events: events.results,
    });
  }

  if (request.method === 'POST') {
    const data = await body<{
      device_id?: string; crop_name_en?: string; season?: string;
      volume_litres?: number; duration_minutes?: number;
      started_at?: string; cost_taka?: number; note?: string; source?: string;
    }>(request);

    const volume = Number(data?.volume_litres);
    if (data?.volume_litres !== undefined && (!Number.isFinite(volume) || volume < 0)) {
      return error(request, env, 400, 'volume_litres must be zero or more');
    }
    const minutes = Number(data?.duration_minutes);
    if (data?.duration_minutes !== undefined && (!Number.isFinite(minutes) || minutes < 0)) {
      return error(request, env, 400, 'duration_minutes must be zero or more');
    }
    const cost = Number(data?.cost_taka);
    if (data?.cost_taka !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      return error(request, env, 400, 'cost_taka must be zero or more');
    }
    const seasonValue: Season | null = ['boro', 'aman', 'aus', 'other'].includes(data?.season ?? '')
      ? (data!.season as Season) : null;
    const source = ['manual', 'scheduled', 'auto'].includes(data?.source ?? '') ? data!.source : 'manual';

    // A device id must belong to this farmer. Trusting the client here would let
    // a run be recorded against somebody else's pump.
    let deviceId: string | null = null;
    if (data?.device_id) {
      const device = await env.DB.prepare('SELECT id FROM sensor_devices WHERE id = ? AND owner_id = ?')
        .bind(data.device_id, user.id).first<{ id: string }>();
      if (!device) return error(request, env, 404, 'Device not found');
      deviceId = device.id;
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO irrigation_events
         (id, owner_id, device_id, source, crop_name_en, season,
          volume_litres, duration_minutes, started_at, cost_taka, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, user.id, deviceId, source, data?.crop_name_en?.trim() || null, seasonValue,
      Number.isFinite(volume) ? Math.round(volume) : null,
      Number.isFinite(minutes) ? Math.round(minutes) : null,
      data?.started_at?.trim() || new Date().toISOString(),
      Number.isFinite(cost) ? Math.round(cost) : null,
      data?.note?.trim() || null).run();

    return json(request, env, {
      success: true,
      event: { id, volume_litres: Number.isFinite(volume) ? Math.round(volume) : null },
    }, 201);
  }

  return error(request, env, 405, 'Method not allowed');
}

/** GET/POST /api/v1/irrigation/schedules — recurring irrigation intent. */
export async function irrigationSchedulesRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  if (request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT id, name, crop_name_en, season, start_time, interval_days,
              target_litres, active, created_at
       FROM irrigation_schedules WHERE owner_id = ? ORDER BY active DESC, start_time`,
    ).bind(user.id).all();
    return json(request, env, { success: true, schedules: result.results });
  }

  if (request.method === 'POST') {
    const data = await body<{
      name?: string; crop_name_en?: string; season?: string; start_time?: string;
      interval_days?: number; target_litres?: number;
    }>(request);

    // Validated here as well as by the CHECK constraint, so a bad time comes
    // back as a 400 naming the field rather than a constraint failure surfacing
    // as a 500.
    const time = (data?.start_time ?? '').trim();
    if (!/^[0-2][0-9]:[0-5][0-9]$/.test(time) || Number(time.slice(0, 2)) > 23) {
      return error(request, env, 400, 'start_time must be HH:MM with an hour from 00 to 23');
    }
    const interval = Number(data?.interval_days ?? 1);
    if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
      return error(request, env, 400, 'interval_days must be a whole number from 1 to 30');
    }
    const target = Number(data?.target_litres);
    if (data?.target_litres !== undefined && (!Number.isFinite(target) || target < 0)) {
      return error(request, env, 400, 'target_litres must be zero or more');
    }
    const seasonValue: Season | null = ['boro', 'aman', 'aus', 'other'].includes(data?.season ?? '')
      ? (data!.season as Season) : null;

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO irrigation_schedules
         (id, owner_id, name, crop_name_en, season, start_time, interval_days, target_litres)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, user.id, data?.name?.trim() || 'Irrigation', data?.crop_name_en?.trim() || null,
      seasonValue, time, interval, Number.isFinite(target) ? Math.round(target) : null).run();

    return json(request, env, { success: true, schedule: { id, start_time: time, interval_days: interval } }, 201);
  }

  return error(request, env, 405, 'Method not allowed');
}

/**
 * Public requirement table, so a client can offer a crop/stage picker without
 * inventing its own list.
 */
export async function waterRequirementsRoute(request: Request, env: Env): Promise<Response> {
  const season = new URL(request.url).searchParams.get('season');
  const result = ['boro', 'aman', 'aus', 'other'].includes(season ?? '')
    ? await env.DB.prepare(
      'SELECT id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day FROM water_requirements WHERE season = ? ORDER BY crop_name_en, stage',
    ).bind(season).all()
    : await env.DB.prepare(
      'SELECT id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day FROM water_requirements ORDER BY season, crop_name_en, stage',
    ).all();

  return json(request, env, {
    success: true,
    // Repeated on every response so a client cannot present these as
    // measurements of a field.
    disclaimer: 'Advisory crop-stage figures in mm/day, not measurements of any field.',
    requirements: result.results,
  });
}
