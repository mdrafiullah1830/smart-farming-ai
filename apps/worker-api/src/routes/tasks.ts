import type { Env } from '../types.ts';
import { json, error, isMissingRelation } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

const MAX_TASKS_PER_REQUEST = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_TIME_LENGTH = 16;

interface TaskRow {
  id: string;
  time?: string | null;
  title_bn: string;
  title_en: string;
  done: number;
  position: number;
  updated_at?: string;
}

interface TaskInput {
  id?: string;
  time?: string | null;
  title?: string | { bn?: string; en?: string };
  title_bn?: string;
  title_en?: string;
  done?: boolean | number;
  position?: number;
}

/** API shape the dashboard consumes: bilingual title object + boolean done. */
function present(row: TaskRow) {
  return {
    id: row.id,
    time: row.time ?? '',
    title: { bn: row.title_bn, en: row.title_en || row.title_bn },
    done: row.done === 1,
    position: row.position,
    updated_at: row.updated_at ?? null,
  };
}

function cleanId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return crypto.randomUUID();
  return raw.slice(0, 64);
}

function cleanTitle(input: TaskInput): { bn: string; en: string } {
  if (typeof input.title === 'object' && input.title !== null) {
    const bn = String(input.title.bn ?? input.title_en ?? '').trim().slice(0, MAX_TITLE_LENGTH);
    const en = String(input.title.en ?? input.title_bn ?? '').trim().slice(0, MAX_TITLE_LENGTH);
    return { bn: bn || en, en: en || bn };
  }
  if (typeof input.title === 'string') {
    const value = input.title.trim().slice(0, MAX_TITLE_LENGTH);
    return { bn: value, en: value };
  }
  const bn = String(input.title_bn ?? '').trim().slice(0, MAX_TITLE_LENGTH);
  const en = String(input.title_en ?? '').trim().slice(0, MAX_TITLE_LENGTH);
  return { bn: bn || en, en: en || bn };
}

/**
 * GET  /api/v1/tasks — the caller's dashboard task list.
 * POST /api/v1/tasks — upsert one task (`task`) or a batch (`tasks`).
 *
 * When migration 0007 has not been applied the routes answer
 * `synced: false` instead of failing, so the dashboard keeps using its
 * local copy rather than showing an error.
 */
export async function tasksRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  if (request.method === 'GET') {
    try {
      const result = await env.DB.prepare(
        'SELECT id, time, title_bn, title_en, done, position, updated_at FROM tasks WHERE owner_id = ? ORDER BY position ASC, created_at ASC LIMIT ?',
      ).bind(user.id, MAX_TASKS_PER_REQUEST).all<TaskRow>();
      return json(request, env, { success: true, synced: true, tasks: result.results.map(present) });
    } catch (cause) {
      if (!isMissingRelation(cause)) throw cause;
      return json(request, env, { success: true, synced: false, tasks: [], reason: 'migration_pending' });
    }
  }

  if (request.method === 'POST') {
    const data = await body<{ task?: TaskInput; tasks?: TaskInput[] }>(request);
    const raw = Array.isArray(data?.tasks) ? data.tasks : data?.task ? [data.task] : [];
    if (!raw.length) return error(request, env, 400, 'task or tasks is required');
    if (raw.length > MAX_TASKS_PER_REQUEST) {
      return error(request, env, 400, `at most ${MAX_TASKS_PER_REQUEST} tasks per request`);
    }

    const statements = raw.map((input, index) => {
      const id = cleanId(input.id);
      const title = cleanTitle(input ?? {});
      const time = String(input.time ?? '').trim().slice(0, MAX_TIME_LENGTH);
      const done = input.done === true || input.done === 1 ? 1 : 0;
      const position = Number.isFinite(Number(input.position)) ? Math.trunc(Number(input.position)) : index;
      return env.DB.prepare(`
        INSERT INTO tasks (id, owner_id, time, title_bn, title_en, done, position, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(owner_id, id) DO UPDATE SET
          time = excluded.time,
          title_bn = excluded.title_bn,
          title_en = excluded.title_en,
          done = excluded.done,
          position = excluded.position,
          updated_at = CURRENT_TIMESTAMP
      `).bind(id, user.id, time, title.bn, title.en, done, position);
    });

    try {
      await env.DB.batch(statements);
      const saved = await env.DB.prepare(
        'SELECT id, time, title_bn, title_en, done, position, updated_at FROM tasks WHERE owner_id = ? ORDER BY position ASC, created_at ASC LIMIT ?',
      ).bind(user.id, MAX_TASKS_PER_REQUEST).all<TaskRow>();
      return json(request, env, { success: true, synced: true, tasks: saved.results.map(present) }, 201);
    } catch (cause) {
      if (!isMissingRelation(cause)) throw cause;
      return json(request, env, { success: false, synced: false, tasks: [], reason: 'migration_pending' }, 503);
    }
  }

  return error(request, env, 405, 'Method not allowed');
}
