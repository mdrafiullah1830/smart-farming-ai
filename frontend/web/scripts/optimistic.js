/**
 * Optimistic update with automatic rollback.
 *
 * usage:
 *   const undo = beginOptimistic(render, () => list.filter(...));
 *   try { await api...; undo.commit(); } catch { undo.rollback(); }
 */

export function createOptimistic({ apply: _apply, rollback: rollbackFn, onError }) {
  let snapshot = null;
  let active = false;

  return {
    begin(prevSnapshot) {
      snapshot = prevSnapshot;
      active = true;
      return snapshot;
    },
    commit() {
      active = false;
      snapshot = null;
    },
    rollback() {
      if (!active) return false;
      active = false;
      if (rollbackFn) {
        try {
          rollbackFn(snapshot);
        } catch (err) {
          onError?.(err);
        }
      }
      snapshot = null;
      return true;
    },
    get isActive() {
      return active;
    },
    get snapshot() {
      return snapshot;
    },
  };
}

/**
 * Run an async mutation with optimistic UI.
 * @param {object} opts
 * @param {Function} opts.snapshot - capture current state before mutation
 * @param {Function} opts.apply - apply optimistic change
 * @param {Function} opts.rollback - restore from snapshot
 * @param {Function} opts.mutation - async server call
 */
export async function withOptimistic({ snapshot, apply, rollback, mutation, onError }) {
  const prev = snapshot();
  apply(prev);
  try {
    const result = await mutation();
    return { ok: true, result, prev };
  } catch (err) {
    rollback(prev);
    onError?.(err, prev);
    return { ok: false, error: err, prev };
  }
}
