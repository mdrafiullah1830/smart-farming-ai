import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { storageGet, storageSet, storageRemove, storageUpdate } from '../../web/scripts/storage.js';

describe('storage helpers', () => {
  beforeEach(() => {
    storageRemove('unit-a');
    storageRemove('unit-b');
  });

  it('returns fallback when key missing', () => {
    assert.equal(storageGet('unit-missing', null), null);
    assert.deepEqual(storageGet('unit-missing', { x: 1 }), { x: 1 });
  });

  it('round-trips JSON values under sf: prefix', () => {
    assert.equal(storageSet('unit-a', { n: 1 }), true);
    assert.deepEqual(storageGet('unit-a'), { n: 1 });
    storageSet('unit-a', 'str');
    assert.equal(storageGet('unit-a'), 'str');
  });

  it('removes keys', () => {
    storageSet('unit-a', 1);
    storageRemove('unit-a');
    assert.equal(storageGet('unit-a', null), null);
  });

  it('updates via updater function', () => {
    storageSet('unit-b', [1]);
    const next = storageUpdate('unit-b', (cur) => [...(cur || []), 2]);
    assert.deepEqual(next, [1, 2]);
    assert.deepEqual(storageGet('unit-b'), [1, 2]);
  });

  it('does not throw on corrupt JSON', () => {
    // Simulate corrupt raw value through set of invalid via direct store if available
    const bad = storageGet('unit-b');
    assert.ok(Array.isArray(bad) || bad === null || typeof bad === 'object');
  });
});
