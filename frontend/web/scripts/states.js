/** UI state helpers: loading / empty / error / stale / offline / unauthorized. */

import { el, clear, setText } from './dom.js';

export const State = {
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
  STALE: 'stale',
  OFFLINE: 'offline',
  UNAUTHORIZED: 'unauthorized',
  RATE_LIMITED: 'rate_limited',
  UNAVAILABLE: 'unavailable',
};

export function isOffline() {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) return navigator.onLine === false;
  return false;
}

export function setState(node, state, { message = '', retry = null, lang = 'en' } = {}) {
  if (!node) return;
  node.dataset.state = state;
  node.setAttribute('aria-busy', state === State.LOADING ? 'true' : 'false');

  const messages = {
    loading: lang === 'bn' ? 'লোড হচ্ছে…' : 'Loading…',
    empty: lang === 'bn' ? 'কোনো ডেটা নেই' : 'No data yet',
    error: lang === 'bn' ? 'ত্রুটি হয়েছে' : 'Something went wrong',
    stale: lang === 'bn' ? 'পুরনো ডেটা — সংযোগ নেই' : 'Stale data — offline',
    offline: lang === 'bn' ? 'অফলাইন — আবার চেষ্টা করুন' : 'Offline — retry when online',
    unauthorized: lang === 'bn' ? 'সাইন ইন করুন' : 'Sign in required',
    rate_limited: lang === 'bn' ? 'অনেকবার চেষ্টা — কিছুক্ষণ অপেক্ষা করুন' : 'Rate limited — try shortly',
    unavailable: lang === 'bn' ? 'সেবা এখন নেই' : 'Service unavailable',
    ready: '',
  };

  let banner = node.querySelector('[data-state-banner]');
  if (!banner) {
    banner = el('div', { className: 'state-banner', dataset: { stateBanner: '' }, role: 'status' });
    node.prepend(banner);
  }

  if (state === State.READY || state === State.LOADING) {
    banner.hidden = state === State.READY;
    if (state === State.LOADING) {
      clear(banner);
      banner.className = 'state-banner state-loading';
      banner.append(el('span', { className: 'spinner-inline', 'aria-hidden': 'true' }), el('span', { text: messages.loading }));
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
    return;
  }

  banner.hidden = false;
  banner.className = `state-banner state-${state}`;
  clear(banner);
  banner.append(el('span', { text: message || messages[state] || state }));
  if (retry && (state === State.ERROR || state === State.OFFLINE || state === State.RATE_LIMITED || state === State.STALE)) {
    const btn = el('button', {
      type: 'button',
      className: 'btn btn-soft state-retry',
      text: lang === 'bn' ? 'আবার চেষ্টা' : 'Retry',
      onClick: retry,
    });
    banner.append(btn);
  }
}

export function markStale(node) {
  if (node) node.dataset.stale = '1';
}

export function ageMs(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Date.now() - t;
}

export function isStale(iso, maxMs = 15 * 60 * 1000) {
  return ageMs(iso) > maxMs;
}

export function emptyState(elRoot, message, lang = 'en') {
  setState(elRoot, State.EMPTY, {
    message: message || (lang === 'bn' ? 'কোনো ডেটা নেই' : 'Nothing to show yet'),
    lang,
  });
}

export { setText };
