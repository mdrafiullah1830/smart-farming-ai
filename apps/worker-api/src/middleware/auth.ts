import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { verifyToken } from '../auth.ts';

// Auth context attached to request
export interface AuthContext {
  id: string;
  email: string;
  via: 'jwt' | 'device';
  ownerId: string;
  deviceId?: string;
}

export async function authenticateRequest(request: Request, env: Env): Promise<AuthContext | null> {
  // Try JWT authentication first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (payload) {
      return { id: payload.id, email: payload.email, via: 'jwt', ownerId: payload.id };
    }
  }

  // Try device authentication
  const deviceKey = request.headers.get('X-Device-Key');
  if (deviceKey) {
    const device = await env.DB.prepare('SELECT id, owner_id FROM sensor_devices WHERE api_key = ?').bind(deviceKey).first<{ id: string; owner_id: string }>();
    if (device) {
      return { id: device.id, email: '', via: 'device', ownerId: device.owner_id, deviceId: device.id };
    }
  }

  return null;
}

export function requireAuth(context: AuthContext | null, request: Request, env: Env): Response | null {
  if (!context) {
    return error(request, env, 401, 'Authentication required');
  }
  return null;
}