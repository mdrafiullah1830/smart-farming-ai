import type { AuthUser, Env } from './types';

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

export async function createToken(user: Omit<AuthUser, 'exp'>, secret: string): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(encoder.encode(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + 3600 })));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${await hmac(secret, unsigned)}`;
}

export async function verifyToken(token: string, secret: string): Promise<AuthUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}`);
  if (expected !== parts[2]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[1]))) as AuthUser;
    return payload.id && payload.email && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

export async function currentUser(request: Request, env: Env): Promise<AuthUser | null> {
  const value = request.headers.get('Authorization');
  if (!value?.startsWith('Bearer ')) return null;
  return verifyToken(value.slice(7), env.JWT_SECRET);
}

export async function hashPassword(password: string, salt: string = crypto.randomUUID()): Promise<string> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 210_000 },
    material,
    256,
  );
  return `pbkdf2_sha256$210000$${salt}$${base64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, , salt] = stored.split('$');
  if (!salt) return false;
  return (await hashPassword(password, salt)) === stored;
}
