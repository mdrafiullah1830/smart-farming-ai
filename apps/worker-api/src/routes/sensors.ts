import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { authenticateDevice, saveSensorReading, sensorHistory, sensorAlerts, sensorSummary } from '../sensors.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

export async function sensorsReadingsRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'POST') {
    return saveSensorReading(request, env);
  }
  if (request.method === 'GET') {
    return sensorHistory(request, env);
  }
  return error(request, env, 405, 'Method not allowed');
}

export async function sensorsAlertsRoute(request: Request, env: Env): Promise<Response> {
  return sensorAlerts(request, env);
}

export async function sensorsSummaryRoute(request: Request, env: Env): Promise<Response> {
  return sensorSummary(request, env);
}