import type { Env } from '../types.ts';
import { corsHeaders, json, error, isMissingRelation } from '../http.ts';
import { currentUser } from '../auth.ts';
import { registerDevice, listDevices, rotateDeviceKey, deviceThresholds } from '../sensors.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

export async function devicesRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  if (request.method === 'GET') {
    return listDevices(request, env);
  }

  if (request.method === 'POST') {
    return registerDevice(request, env);
  }

  return error(request, env, 405, 'Method not allowed');
}

export async function deviceRotateKeyRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  return rotateDeviceKey(request, env);
}

export async function deviceThresholdsRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  return deviceThresholds(request, env);
}

/**
 * Commands the dashboard is allowed to queue for a device. The Worker has no
 * push channel to firmware, so a command is persisted as the operator's
 * *desired* state and applied the next time the device checks in — the API
 * always answers `queued: true` rather than pretending the actuator moved.
 */
const DEVICE_COMMANDS: Record<string, 'on' | 'off'> = {
  irrigation_on: 'on',
  irrigation_off: 'off',
  start: 'on',
  stop: 'off',
  power_on: 'on',
  power_off: 'off',
};

export async function deviceCommandRoute(request: Request, env: Env, deviceId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const data = await body<{ command?: string }>(request);
  const command = String(data?.command ?? '').trim().toLowerCase();
  const nextState = DEVICE_COMMANDS[command];
  if (!nextState) {
    return error(request, env, 400, `command must be one of: ${Object.keys(DEVICE_COMMANDS).join(', ')}`);
  }
  if (!/^[A-Za-z0-9._:-]{4,64}$/.test(deviceId)) {
    return error(request, env, 400, 'device_id must be 4-64 characters of letters, digits, dot, dash, colon or underscore');
  }

  const device = await env.DB.prepare('SELECT id FROM sensor_devices WHERE id = ? AND owner_id = ?')
    .bind(deviceId, user.id).first<{ id: string }>();
  if (!device) return error(request, env, 404, 'Device not found');

  try {
    await env.DB.prepare(`
      INSERT INTO device_commands (device_id, owner_id, command, state, issued_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(device_id) DO UPDATE SET
        command = excluded.command,
        state = excluded.state,
        issued_at = CURRENT_TIMESTAMP
    `).bind(deviceId, user.id, command, nextState).run();
  } catch (cause) {
    if (!isMissingRelation(cause)) throw cause;
    return json(request, env, {
      success: false,
      synced: false,
      reason: 'migration_pending',
      device_id: deviceId,
      command,
      state: nextState,
      queued: false,
    }, 503);
  }

  return json(request, env, {
    success: true,
    device_id: deviceId,
    command,
    state: nextState,
    queued: true,
  });
}