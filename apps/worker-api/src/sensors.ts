/**
 * Sensor ingestion, device authentication and advisory rules.
 *
 * Boundaries:
 *   - `authenticateDevice` resolves either a user JWT (dashboard reads) or a
 *     device API key (firmware writes) into an owner context.
 *   - `evaluateReading` is pure: given a reading and a threshold row it returns
 *     the advisories that should be raised. Keeping it pure makes the rule set
 *     unit-testable without D1.
 *   - Storage helpers never fabricate data. If a value is absent it stays NULL.
 */
import { currentUser } from './auth.ts';
import { error, json } from './http.ts';
import type { Env } from './types.ts';
import type { DeviceContext, ThresholdRow } from './sensors.types.ts';
import { DEFAULT_THRESHOLDS } from './sensors.types.ts';
import { evaluateReading } from './sensors.rules.ts';

export type { DeviceContext, ThresholdRow } from './sensors.types.ts';
export { DEFAULT_THRESHOLDS } from './sensors.types.ts';
export { evaluateReading } from './sensors.rules.ts';
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateDeviceKey(deviceId: string): string {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const body = [...random].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sfa_${deviceId}_${body}`;
}

export async function hashDeviceKey(key: string): Promise<string> {
  return sha256Hex(key);
}

/**
 * Resolve the caller of a sensor request.
 *
 * Precedence: `X-Device-Key` (firmware) wins over `Authorization: Bearer`
 * (dashboard) because a device never sends both. A device key must be active
 * (not revoked) and its device row must still exist.
 */
export async function authenticateDevice(request: Request, env: Env): Promise<DeviceContext | null> {
  const deviceKey = request.headers.get('X-Device-Key')?.trim();
  if (deviceKey) {
    const row = await env.DB.prepare(
      'SELECT id, device_id, owner_id FROM device_keys WHERE key_hash = ? AND revoked_at IS NULL',
    ).bind(await hashDeviceKey(deviceKey)).first<{ id: string; device_id: string; owner_id: string }>();
    if (!row) return null;
    await env.DB.prepare('UPDATE device_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(row.id).run();
    return { ownerId: row.owner_id, deviceId: row.device_id, via: 'device' };
  }

  // Fall back to a dashboard session token.
  const user = await currentUser(request, env);
  return user ? { ownerId: user.id, deviceId: null, via: 'user' } : null;
}

const VALIDATION_RANGES: Array<[string, number, number]> = [
  ['moisture_percent', 0, 100],
  ['air_humidity_percent', 0, 100],
  ['battery_percent', 0, 100],
  ['latitude', -90, 90],
  ['longitude', -180, 180],
  ['soil_depth_cm', 0, 500],
  ['soil_temperature_c', -30, 80],
  ['air_temperature_c', -30, 80],
];

export type ReadingInput = Record<string, unknown>;

/**
 * Validate an incoming reading. Returns either the cleaned row values or the
 * first problem found. Rejects NaN/Infinity instead of silently dropping them,
 * because a corrupt reading is worse than a rejected one.
 */
export function validateReading(
  input: ReadingInput,
): { ok: true; values: Record<string, number | string | null> } | { ok: false; message: string } {
  const numberOrNull = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };

  const values: Record<string, number | string | null> = {};
  for (const [key, min, max] of VALIDATION_RANGES) {
    if (!(key in input)) continue;
    const parsed = numberOrNull(input[key]);
    if (parsed === null) continue;
    if (Number.isNaN(parsed)) return { ok: false, message: `${key} must be a finite number` };
    if (parsed < min || parsed > max) return { ok: false, message: `${key} must be between ${min} and ${max}` };
    values[key] = parsed;
  }

  const recordedAt = input.recorded_at === undefined || input.recorded_at === null || input.recorded_at === ''
    ? new Date().toISOString()
    : String(input.recorded_at);
  if (Number.isNaN(Date.parse(recordedAt))) return { ok: false, message: 'recorded_at must be an ISO-8601 timestamp' };
  values.recorded_at = recordedAt;

  values.crop = input.crop === undefined || input.crop === null ? '' : String(input.crop).slice(0, 120);
  values.calibration_version = input.calibration_version === undefined || input.calibration_version === null
    ? ''
    : String(input.calibration_version).slice(0, 60);
  return { ok: true, values };
}

export async function loadThresholds(env: Env, ownerId: string, deviceId: string): Promise<ThresholdRow> {
  const row = await env.DB.prepare(
    'SELECT moisture_min_percent, moisture_max_percent, soil_temp_min_c, soil_temp_max_c, battery_min_percent FROM device_thresholds WHERE device_id = ? AND owner_id = ?',
  ).bind(deviceId, ownerId).first<ThresholdRow>();
  return row ?? DEFAULT_THRESHOLDS;
}

// ---------------------------------------------------------------------------
// Handlers (exported so index.ts stays a thin router)
// ---------------------------------------------------------------------------

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json<T>();
  } catch {
    return null;
  }
}

/**
 * POST /api/v1/devices — register a device for the signed-in farmer and mint
 * its first ingestion key. The plaintext key is returned exactly once.
 */
export async function registerDevice(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const data = await parseJson<{ device_id?: string; name?: string; firmware_version?: string }>(request);
  const deviceId = String(data?.device_id ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{4,64}$/.test(deviceId)) {
    return error(request, env, 400, 'device_id must be 4-64 characters of letters, digits, dot, dash, colon or underscore');
  }

  const existing = await env.DB.prepare('SELECT owner_id FROM sensor_devices WHERE id = ?')
    .bind(deviceId).first<{ owner_id: string }>();
  if (existing && existing.owner_id !== user.id) return error(request, env, 409, 'Device is already registered to another account');

  if (!existing) {
    await env.DB.prepare('INSERT INTO sensor_devices (id, owner_id, name, firmware_version) VALUES (?, ?, ?, ?)')
      .bind(deviceId, user.id, String(data?.name ?? deviceId).slice(0, 120), String(data?.firmware_version ?? '').slice(0, 60)).run();
  } else {
    await env.DB.prepare("UPDATE sensor_devices SET name = COALESCE(NULLIF(?, ''), name), firmware_version = COALESCE(NULLIF(?, ''), firmware_version) WHERE id = ?")
      .bind(String(data?.name ?? ''), String(data?.firmware_version ?? ''), deviceId).run();
  }
  await env.DB.prepare('INSERT OR IGNORE INTO device_thresholds (device_id, owner_id) VALUES (?, ?)').bind(deviceId, user.id).run();

  const key = generateDeviceKey(deviceId);
  await env.DB.prepare('INSERT INTO device_keys (id, device_id, owner_id, key_hash, key_prefix, label) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), deviceId, user.id, await hashDeviceKey(key), key.slice(0, 12), 'primary').run();

  return json(request, env, {
    success: true,
    device: { id: deviceId, name: data?.name ?? deviceId },
    // Returned once; the operator flashes this into the device and stores the hash only.
    api_key: key,
    key_prefix: key.slice(0, 12),
  }, 201);
}

/** GET /api/v1/devices — devices owned by the caller, with latest reading summary. */
export async function listDevices(request: Request, env: Env): Promise<Response> {
  const context = await authenticateDevice(request, env);
  if (!context) return error(request, env, 401, 'Authentication required');
  const result = await env.DB.prepare(`
    SELECT d.id, d.name, d.firmware_version, d.created_at, d.last_seen_at,
           r.moisture_percent, r.soil_temperature_c, r.battery_percent, r.recorded_at AS last_reading_at
    FROM sensor_devices d
    LEFT JOIN sensor_readings r ON r.id = (
      SELECT id FROM sensor_readings WHERE device_id = d.id ORDER BY recorded_at DESC LIMIT 1
    )
    WHERE d.owner_id = ?
    ORDER BY d.last_seen_at DESC NULLS LAST, d.created_at DESC
  `).bind(context.ownerId).all();
  return json(request, env, { success: true, devices: result.results });
}

/** POST /api/v1/devices/rotate-key — issue a new key and revoke the old one. */
export async function rotateDeviceKey(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const data = await parseJson<{ device_id?: string }>(request);
  const deviceId = String(data?.device_id ?? '').trim();
  const device = await env.DB.prepare('SELECT id FROM sensor_devices WHERE id = ? AND owner_id = ?')
    .bind(deviceId, user.id).first<{ id: string }>();
  if (!device) return error(request, env, 404, 'Device not found');

  await env.DB.prepare('UPDATE device_keys SET revoked_at = CURRENT_TIMESTAMP WHERE device_id = ? AND owner_id = ? AND revoked_at IS NULL')
    .bind(deviceId, user.id).run();
  const key = generateDeviceKey(deviceId);
  await env.DB.prepare('INSERT INTO device_keys (id, device_id, owner_id, key_hash, key_prefix, label) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), deviceId, user.id, await hashDeviceKey(key), key.slice(0, 12), 'rotated').run();
  return json(request, env, { success: true, api_key: key, key_prefix: key.slice(0, 12) });
}

/** GET/PUT /api/v1/devices/thresholds — read or update advisory limits. */
export async function deviceThresholds(request: Request, env: Env): Promise<Response> {
  const context = await authenticateDevice(request, env);
  if (!context) return error(request, env, 401, 'Authentication required');
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id') ?? context.deviceId ?? '';
  if (!deviceId) return error(request, env, 400, 'device_id is required');

  if (request.method === 'GET') {
    const thresholds = await loadThresholds(env, context.ownerId, deviceId);
    return json(request, env, { success: true, device_id: deviceId, thresholds });
  }

  const data = await parseJson<Partial<ThresholdRow>>(request);
  const current = await loadThresholds(env, context.ownerId, deviceId);
  const merged: ThresholdRow = { ...current, ...(data ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return error(request, env, 400, `${key} must be a number`);
  }
  if (merged.moisture_min_percent >= merged.moisture_max_percent) return error(request, env, 400, 'moisture_min_percent must be below moisture_max_percent');
  if (merged.soil_temp_min_c >= merged.soil_temp_max_c) return error(request, env, 400, 'soil_temp_min_c must be below soil_temp_max_c');

  await env.DB.prepare(`
    INSERT INTO device_thresholds (device_id, owner_id, moisture_min_percent, moisture_max_percent, soil_temp_min_c, soil_temp_max_c, battery_min_percent, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(device_id) DO UPDATE SET
      moisture_min_percent = excluded.moisture_min_percent,
      moisture_max_percent = excluded.moisture_max_percent,
      soil_temp_min_c = excluded.soil_temp_min_c,
      soil_temp_max_c = excluded.soil_temp_max_c,
      battery_min_percent = excluded.battery_min_percent,
      updated_at = CURRENT_TIMESTAMP
  `).bind(deviceId, context.ownerId, merged.moisture_min_percent, merged.moisture_max_percent,
    merged.soil_temp_min_c, merged.soil_temp_max_c, merged.battery_min_percent).run();
  return json(request, env, { success: true, device_id: deviceId, thresholds: merged });
}

/** GET /api/v1/sensors/alerts — advisory history for the caller's devices. */
export async function sensorAlerts(request: Request, env: Env): Promise<Response> {
  const context = await authenticateDevice(request, env);
  if (!context) return error(request, env, 401, 'Authentication required');
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
  const query = deviceId
    ? env.DB.prepare('SELECT * FROM sensor_alerts WHERE owner_id = ? AND device_id = ? ORDER BY created_at DESC LIMIT ?').bind(context.ownerId, deviceId, limit)
    : env.DB.prepare('SELECT * FROM sensor_alerts WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?').bind(context.ownerId, limit);
  const result = await query.all();
  return json(request, env, { success: true, alerts: result.results });
}

/** GET /api/v1/sensors/summary — fleet-level view for the dashboard map. */
export async function sensorSummary(request: Request, env: Env): Promise<Response> {
  const context = await authenticateDevice(request, env);
  if (!context) return error(request, env, 401, 'Authentication required');
  const result = await env.DB.prepare(`
    SELECT d.id AS device_id, d.name, d.last_seen_at,
           r.moisture_percent, r.soil_temperature_c, r.air_temperature_c, r.battery_percent,
           r.latitude, r.longitude, r.crop, r.recorded_at
    FROM sensor_devices d
    LEFT JOIN sensor_readings r ON r.id = (
      SELECT id FROM sensor_readings WHERE device_id = d.id ORDER BY recorded_at DESC LIMIT 1
    )
    WHERE d.owner_id = ?
  `).bind(context.ownerId).all();
  const alerts = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM sensor_alerts WHERE owner_id = ? AND severity = 'critical' AND created_at > datetime('now', '-1 day')",
  ).bind(context.ownerId).first<{ total: number }>();
  return json(request, env, {
    success: true,
    device_count: result.results.length,
    critical_alerts_24h: alerts?.total ?? 0,
    devices: result.results,
  });
}

/** POST /api/v1/sensors/readings — ingest a sensor reading from firmware or dashboard. */
export async function saveSensorReading(request: Request, env: Env): Promise<Response> {
  const context = await authenticateDevice(request, env);
  if (!context) return error(request, env, 401, 'Authentication required');

  const data = await parseJson<Record<string, unknown>>(request);
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

/** GET /api/v1/sensors/readings — fetch sensor reading history. */
export async function sensorHistory(request: Request, env: Env): Promise<Response> {
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



