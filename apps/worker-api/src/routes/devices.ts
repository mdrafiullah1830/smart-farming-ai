import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
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