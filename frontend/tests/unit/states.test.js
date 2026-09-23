import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { State, setState, isStale, ageMs, emptyState, markStale } from '../../web/scripts/states.js';

function ensureDocument() {
  if (typeof globalThis.document !== 'undefined') return;
  globalThis.document = {
    createElement(tag) {
      const n = {
        tagName: tag,
        className: '',
        textContent: '',
        hidden: false,
        dataset: {},
        children: [],
        attrs: {},
        append(...cs) {
          this.children.push(...cs);
        },
        prepend(...cs) {
          this.children.unshift(...cs);
        },
        removeChild(c) {
          const i = this.children.indexOf(c);
          if (i >= 0) this.children.splice(i, 1);
        },
        get firstChild() {
          return this.children[0] || null;
        },
        querySelector(sel) {
          if (sel === '[data-state-banner]') {
            return this.children.find((c) => c.dataset && 'stateBanner' in c.dataset) || null;
          }
          if (sel === 'button') return this.children.find((c) => c.tagName === 'BUTTON') || null;
          if (sel === 'span') return this.children.find((c) => c.tagName === 'SPAN') || null;
          return null;
        },
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
        addEventListener() {},
      };
      return n;
    },
    createTextNode(text) {
      return { textContent: text };
    },
  };
}

function makeHostNode() {
  return {
    dataset: {},
    attrs: {},
    children: [],
    prepend(c) {
      this.children.unshift(c);
    },
    append(...cs) {
      this.children.push(...cs);
    },
    querySelector(sel) {
      if (sel === '[data-state-banner]') {
        return this.children.find((c) => c.dataset && 'stateBanner' in c.dataset) || null;
      }
      return null;
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
  };
}

describe('states helpers', () => {
  beforeEach(() => {
    ensureDocument();
  });

  it('exposes state enum values', () => {
    assert.equal(State.LOADING, 'loading');
    assert.equal(State.UNAUTHORIZED, 'unauthorized');
    assert.equal(State.RATE_LIMITED, 'rate_limited');
    assert.equal(State.UNAVAILABLE, 'unavailable');
  });

  it('ageMs and isStale', () => {
    assert.equal(ageMs(null), Infinity);
    assert.equal(ageMs('invalid'), Infinity);
    const recent = new Date().toISOString();
    assert.ok(ageMs(recent) < 1000);
    assert.equal(isStale(recent, 60_000), false);
    assert.equal(isStale('2020-01-01T00:00:00Z', 60_000), true);
    assert.equal(isStale(null), true);
  });

  it('setState is a no-op on null node', () => {
    assert.equal(setState(null, State.LOADING), undefined);
  });

  it('setState sets dataset.state and aria-busy', () => {
    const node = makeHostNode();

    setState(node, State.LOADING, { lang: 'en' });
    assert.equal(node.dataset.state, 'loading');
    assert.equal(node.attrs['aria-busy'], 'true');
    const bannerEl = node.children.find((c) => c.dataset && 'stateBanner' in c.dataset);
    assert.ok(bannerEl);
    assert.equal(bannerEl.hidden, false);

    setState(node, State.READY);
    assert.equal(node.dataset.state, 'ready');
    assert.equal(node.attrs['aria-busy'], 'false');

    setState(node, State.ERROR, { message: 'kaboom', lang: 'en', retry: () => {} });
    assert.equal(node.dataset.state, 'error');
    assert.equal(bannerEl.hidden, false);

    setState(node, State.UNAUTHORIZED, { lang: 'bn' });
    assert.equal(node.dataset.state, 'unauthorized');
  });

  it('emptyState and markStale', () => {
    const node = makeHostNode();
    emptyState(node, null, 'en');
    assert.equal(node.dataset.state, 'empty');
    markStale(node);
    assert.equal(node.dataset.stale, '1');
  });
});
