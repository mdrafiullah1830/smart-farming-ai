import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function uploadsRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const contentType = request.headers.get('Content-Type') ?? '';
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(contentType)) return error(request, env, 415, 'Only JPEG, PNG and WebP images are accepted');
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (!length || length > 10 * 1024 * 1024) return error(request, env, 413, 'Image must be between 1 byte and 10 MB');
  const extension = contentType.split('/')[1].replace('jpeg', 'jpg');
  const objectKey = `disease-images/${user.id}/${crypto.randomUUID()}.${extension}`;
  await env.UPLOADS.put(objectKey, request.body, { httpMetadata: { contentType } });
  await env.DB.prepare('INSERT INTO uploaded_files (id, owner_id, object_key, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, objectKey, contentType, length).run();
  return json(request, env, { objectKey }, 201);
}

export async function diseaseAnalyzeRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const form = await request.formData();
  const image = form.get('image');
  if (!(image instanceof File)) return error(request, env, 400, 'image is required');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) return error(request, env, 415, 'Only JPEG, PNG and WebP images are accepted');
  if (!image.size || image.size > 5 * 1024 * 1024) return error(request, env, 413, 'Image must be between 1 byte and 5 MB');
  const upstream = await fetch(`${env.AI_SERVICE_URL}/v1/disease/analyze`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.AI_SERVICE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: crypto.randomUUID(), image_base64: `data:${image.type};base64,${bytesToBase64(await image.arrayBuffer())}` }),
  });
  const result = await upstream.json<{ status?: string; message?: string; predictions?: Array<{ disease_en: string; disease_bn: string; confidence: number; severity: string }> }>();
  if (!upstream.ok) return error(request, env, upstream.status, result.message ?? 'Disease service unavailable');
  if (result.status !== 'success') return json(request, env, { success: false, status: result.status, message: result.message, diseases: [] }, 503);
  return json(request, env, {
    success: true,
    diseases: (result.predictions ?? []).map((p) => ({ en: p.disease_en, bn: p.disease_bn, confidence: Math.round(p.confidence * 100), severity: p.severity, cause: '', treatments: [] })),
  });
}