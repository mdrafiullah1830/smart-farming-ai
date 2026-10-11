import type { Env } from '../types.ts';
import { json, error } from '../http.ts';

/**
 * Model inference proxies for the two long-running AI-service endpoints the
 * dashboard and soil pages call: yield estimation and price forecasting.
 *
 * The Worker owns validation because a malformed request should never reach
 * the model queue, and because FastAPI's 422 `detail` array is not something a
 * farmer-facing UI should have to translate. The numeric bounds below mirror
 * `apps/ai-service/app/schemas.py`; if that schema changes, change both.
 */

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

// Inference plus cold-start on the free Render tier can be slow; fail fast
// with a clear answer instead of stalling the browser (same idea as M1).
const AI_TIMEOUT_MS = 15000;

const YIELD_BOUNDS = {
  temperature: { min: -10, max: 55 },
  humidity: { min: 0, max: 100 },
  rainfall: { min: 0, max: 1000 },
  ph: { min: 3, max: 10 },
  nitrogen: { min: 0, max: 300 },
  area_acres: { min: 0, max: 10000 },
} as const;

const SEASONS = new Set(['kharif', 'rabi', 'summer']);

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : NaN;
  return Number.isFinite(n) ? n : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function checkYieldInput(data: Record<string, unknown>): string | null {
  const crop = readString(data.crop);
  if (!crop || crop.length > 40) return 'crop is required (max 40 characters)';
  for (const [field, bound] of Object.entries(YIELD_BOUNDS)) {
    const value = finiteNumber(data[field]);
    if (value === null) return `${field} must be a number`;
    if (field === 'area_acres') {
      if (value <= bound.min || value > bound.max) return `${field} must be greater than 0 and at most ${bound.max}`;
    } else if (value < bound.min || value > bound.max) {
      return `${field} must be between ${bound.min} and ${bound.max}`;
    }
  }
  if (data.irrigation_used !== undefined && typeof data.irrigation_used !== 'boolean') {
    return 'irrigation_used must be true or false';
  }
  if (data.season !== undefined) {
    const season = readString(data.season);
    if (!season || !SEASONS.has(season.toLowerCase())) return `season must be one of ${[...SEASONS].join(', ')}`;
  }
  return null;
}

function buildYieldPayload(data: Record<string, unknown>): Record<string, unknown> {
  return {
    crop: readString(data.crop)?.toLowerCase(),
    temperature: finiteNumber(data.temperature),
    humidity: finiteNumber(data.humidity),
    rainfall: finiteNumber(data.rainfall),
    ph: finiteNumber(data.ph),
    nitrogen: finiteNumber(data.nitrogen),
    area_acres: finiteNumber(data.area_acres),
    irrigation_used: data.irrigation_used === true,
    season: (readString(data.season) ?? 'kharif').toLowerCase(),
  };
}

/**
 * Chronological (oldest first) mid-price series for a crop, taken from the
 * same `market_prices` rows the chart on the market page draws, so the
 * forecast and the visible history can never disagree.
 */
async function priceHistoryFromD1(env: Env, crop: string): Promise<number[] | null> {
  try {
    const result = await env.DB.prepare(
      'SELECT price_min, price_max, price_mid FROM market_prices WHERE crop_id = ? ORDER BY recorded_at DESC LIMIT 90',
    ).bind(crop).all<{ price_min: number; price_max: number; price_mid: number | null }>();
    const series = result.results.map((row) => {
      const mid = row.price_mid ?? (Number(row.price_min) + Number(row.price_max)) / 2;
      return Number(mid);
    }).filter((value) => Number.isFinite(value) && value > 0).reverse();
    return series.length >= 7 ? series.slice(-180) : null;
  } catch (cause) {
    console.warn('forecast_history_failed', cause);
    return null;
  }
}

function fastApiMessage(result: { detail?: unknown }): string | null {
  const detail = result.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => (item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : null))
      .filter((msg): msg is string => Boolean(msg));
    if (parts.length) return parts.join('; ');
  }
  return null;
}

async function callAiService(request: Request, env: Env, path: string, payload: Record<string, unknown>): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.AI_SERVICE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
    console.error('ai_service_call_failed', { path, timedOut, error: cause instanceof Error ? cause.message : String(cause) });
    return error(request, env, timedOut ? 504 : 502, timedOut ? 'AI service timed out' : 'AI service is unreachable');
  }

  let parsed: unknown = null;
  try { parsed = JSON.parse(await upstream.text()); } catch { /* non-JSON upstream handled below */ }
  const result = (parsed && typeof parsed === 'object' ? parsed : {}) as { status?: string; message?: string };

  if (!upstream.ok) {
    return error(request, env, upstream.status, fastApiMessage(result as { detail?: unknown }) ?? 'AI service rejected the request');
  }
  if (result.status === 'model_unavailable') {
    // Honest unavailable state, not a fabricated prediction.
    return json(request, env, {
      success: false,
      status: 'model_unavailable',
      message: result.message ?? 'This model has not been deployed on the AI service.',
      available: false,
    }, 503);
  }
  if (result.status !== 'success') {
    return json(request, env, {
      success: false,
      status: result.status ?? 'error',
      message: result.message ?? 'Inference failed',
      available: true,
    }, 502);
  }
  return json(request, env, { success: true, ...result });
}

export async function yieldPredictRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<Record<string, unknown>>(request);
  if (!data) return error(request, env, 400, 'JSON body is required');
  const invalid = checkYieldInput(data);
  if (invalid) return error(request, env, 400, invalid);
  return callAiService(request, env, '/v1/yield/predict', buildYieldPayload(data));
}

export async function marketForecastRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<Record<string, unknown>>(request);
  if (!data) return error(request, env, 400, 'JSON body is required');

  let history: number[] | null = null;
  if (data.history !== undefined) {
    if (!Array.isArray(data.history)) return error(request, env, 400, 'history must be an array of prices');
    const series = data.history.map((value) => finiteNumber(value)).filter((value): value is number => value !== null && value > 0);
    if (series.length !== data.history.length) return error(request, env, 400, 'history values must be positive numbers');
    if (series.length < 7 || series.length > 180) return error(request, env, 400, 'history must contain 7 to 180 prices, oldest first');
    history = series;
  } else {
    const crop = readString(data.crop) ?? (typeof data.crop === 'number' ? String(data.crop) : null);
    if (!crop) return error(request, env, 400, 'crop or history is required');
    history = await priceHistoryFromD1(env, crop);
    if (!history) {
      return json(request, env, {
        success: false,
        status: 'insufficient_history',
        message: 'At least 7 recorded prices are needed to forecast this crop.',
        available: true,
      }, 422);
    }
  }

  const days = data.days === undefined ? 7 : finiteNumber(data.days);
  if (days === null || !Number.isInteger(days) || days < 1 || days > 30) {
    return error(request, env, 400, 'days must be an integer between 1 and 30');
  }

  const crop = readString(data.crop) ?? (typeof data.crop === 'number' ? String(data.crop) : 'unknown');
  return callAiService(request, env, '/v1/market/forecast', { crop, history, days });
}
