import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { verifyToken } from '../auth.ts';

export interface AuthContext {
  id: string;
  email: string;
  via: 'jwt' | 'device';
  ownerId: string;
  deviceId?: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function authenticateRequest(request: Request, env: Env): Promise<AuthContext | null> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (payload) {
      return { id: payload.id, email: payload.email, via: 'jwt', ownerId: payload.id };
    }
  }

  const deviceKey = request.headers.get('X-Device-Key');
  if (deviceKey) {
    const keyHash = await sha256Hex(deviceKey);
    const deviceKeyRow = await env.DB.prepare(
      'SELECT device_id, owner_id FROM device_keys WHERE key_hash = ? AND revoked_at IS NULL'
    ).bind(keyHash).first<{ device_id: string; owner_id: string }>();
    if (deviceKeyRow) {
      return { id: deviceKeyRow.device_id, email: '', via: 'device', ownerId: deviceKeyRow.owner_id, deviceId: deviceKeyRow.device_id };
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