/** Namespaced localStorage helpers with JSON safety. */

const PREFIX = 'sf:';
const memoryStore = new Map();

function store() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* private mode */
  }
  return {
    getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
    setItem: (k, v) => memoryStore.set(k, String(v)),
    removeItem: (k) => memoryStore.delete(k),
  };
}

export function storageGet(key, fallback = null) {
  try {
    const raw = store().getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    store().setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key) {
  try {
    store().removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Merge partial into existing object array/map safely */
export function storageUpdate(key, updater) {
  const current = storageGet(key);
  const next = typeof updater === 'function' ? updater(current) : updater;
  storageSet(key, next);
  return next;
}
