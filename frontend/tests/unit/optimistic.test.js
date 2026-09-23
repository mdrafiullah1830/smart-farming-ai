import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOptimistic, withOptimistic } from '../../web/scripts/optimistic.js';

describe('optimistic updates', () => {
  it('withOptimistic applies then commits on success', async () => {
    let list = [1];
    const res = await withOptimistic({
      snapshot: () => [...list],
      apply: () => {
        list = [...list, 2];
      },
      rollback: (prev) => {
        list = prev;
      },
      mutation: async () => 'saved',
    });
    assert.equal(res.ok, true);
    assert.equal(res.result, 'saved');
    assert.deepEqual(list, [1, 2]);
  });

  it('withOptimistic rolls back on failure', async () => {
    let list = [1];
    let rolled = null;
    const res = await withOptimistic({
      snapshot: () => [...list],
      apply: () => {
        list = [...list, 2];
      },
      rollback: (prev) => {
        list = prev;
        rolled = prev;
      },
      mutation: async () => {
        throw new Error('server down');
      },
      onError: (err) => assert.equal(err.message, 'server down'),
    });
    assert.equal(res.ok, false);
    assert.deepEqual(list, [1]);
    assert.deepEqual(rolled, [1]);
  });

  it('createOptimistic rollback only when active', () => {
    const o = createOptimistic({
      rollback: () => {},
    });
    assert.equal(o.isActive, false);
    assert.equal(o.rollback(), false);
    o.begin({ a: 1 });
    assert.equal(o.isActive, true);
    assert.deepEqual(o.snapshot, { a: 1 });
    assert.equal(o.rollback(), true);
    assert.equal(o.isActive, false);
  });

  it('rollback recovers from rollbackFn errors via onError', () => {
    let captured = null;
    const o = createOptimistic({
      rollback: () => {
        throw new Error('bad restore');
      },
      onError: (e) => {
        captured = e.message;
      },
    });
    o.begin('snap');
    assert.equal(o.rollback(), true);
    assert.equal(captured, 'bad restore');
  });
});
