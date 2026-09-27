/** Shared shell: auth gate, global search, keyboard shortcuts, lang toggle. */

import { getLang, applyI18n, bindLangToggle, t } from './i18n.js';
import { getCredentials, setCredentials } from './api.js';
import { el, qs, clear } from './dom.js';
import { storageGet, storageSet, storageRemove } from './storage.js';
import { reportClientError, installGlobalErrorHandlers } from './telemetry.js';
import { api } from './api.js';

export function isAuthenticated() {
  return Boolean(getCredentials()?.token);
}

/**
 * Protected action gate: opens auth modal or redirects to sign-in.
 * Returns true if allowed to proceed.
 */
export function requireAuth(actionLabel = '') {
  if (isAuthenticated()) return true;
  openAuthModal(actionLabel);
  return false;
}

let authModal;

export function openAuthModal(reason = '') {
  if (typeof document === 'undefined') return;
  if (!authModal) authModal = buildAuthModal();
  const reasonEl = authModal.querySelector('[data-auth-reason]');
  reasonEl.textContent = reason ? `${t('authRequired')}${reason ? ` — ${reason}` : ''}` : t('authRequired');
  authModal.hidden = false;
  const first = authModal.querySelector('input, button');
  first?.focus();
}

export function closeAuthModal() {
  if (authModal) authModal.hidden = true;
}

function buildAuthModal() {
  const overlay = el('div', {
    className: 'modal-overlay',
    id: 'authModal',
    hidden: true,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'authModalTitle',
  });

  const title = el('h2', { id: 'authModalTitle', text: t('signIn') });
  const reason = el('p', { className: 'muted', dataset: { authReason: '' } });
  const email = el('input', {
    type: 'email',
    id: 'authEmail',
    required: true,
    autocomplete: 'email',
    placeholder: 'email@example.com',
    'aria-label': 'Email',
  });
  const password = el('input', {
    type: 'password',
    id: 'authPassword',
    required: true,
    minlength: 8,
    autocomplete: 'current-password',
    placeholder: '••••••••',
    'aria-label': 'Password',
  });
  const errorBox = el('p', { className: 'form-error', role: 'alert', dataset: { authError: '' }, hidden: true });
  const submit = el('button', { type: 'submit', className: 'btn btn-primary', text: t('signIn') });
  const closeBtn = el('button', {
    type: 'button',
    className: 'btn icon-btn',
    text: '×',
    'aria-label': 'Close',
    onClick: () => closeAuthModal(),
  });

  const form = el(
    'form',
    {
      id: 'authForm',
      onSubmit: async (ev) => {
        ev.preventDefault();
        errorBox.hidden = true;
        try {
          const res = await api.post('/api/v1/auth/login', {
            email: email.value.trim(),
            password: password.value,
          });
          setCredentials({ token: res.data.token, user: res.data.user });
          storageSet('user', res.data.user);
          closeAuthModal();
          document.dispatchEvent(new CustomEvent('sf:auth', { detail: { user: res.data.user } }));
        } catch (err) {
          reportClientError(err, { component: 'auth' });
          errorBox.hidden = false;
          errorBox.textContent = err.message || t('loadFailed');
        }
      },
    },
    [
      el('label', { for: 'authEmail', text: 'Email' }),
      email,
      el('label', { for: 'authPassword', text: 'Password' }),
      password,
      errorBox,
      submit,
    ],
  );

  overlay.append(
    el('div', { className: 'modal-card' }, [el('div', { className: 'modal-head' }, [title, closeBtn]), reason, form]),
  );
  document.body.append(overlay);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closeAuthModal();
  });
  return overlay;
}

export function logout() {
  const creds = getCredentials();
  if (creds?.token) {
    api.post('/api/v1/auth/logout', {}, { token: creds.token }).catch(() => {});
  }
  setCredentials(null);
  storageRemove('user');
  document.dispatchEvent(new CustomEvent('sf:auth', { detail: { user: null } }));
}

/* ---------- Global search ---------- */

let searchModal;

export function openGlobalSearch() {
  if (typeof document === 'undefined') return;
  if (!searchModal) searchModal = buildSearchModal();
  searchModal.hidden = false;
  const input = searchModal.querySelector('#globalSearchInput');
  input.value = '';
  renderSearchResults(searchModal.querySelector('#globalSearchResults'), '');
  input.focus();
}

export function closeGlobalSearch() {
  if (searchModal) searchModal.hidden = true;
}

export const SEARCH_INDEX = [
  { title: 'Home', title_bn: 'হোম', href: 'index.html', keywords: 'home landing hero' },
  { title: 'Dashboard', title_bn: 'ড্যাশবোর্ড', href: 'dashboard.html', keywords: 'dashboard farm weather fields tasks' },
  { title: 'Market', title_bn: 'বাজার', href: 'market.html', keywords: 'market prices commodity watchlist chart' },
  { title: 'Soil', title_bn: 'মাটি', href: 'soil.html', keywords: 'soil npk ph fertilizer report' },
  { title: 'AI Assistant', title_bn: 'AI সহকারী', href: 'ai-search.html', keywords: 'ai search chat question photo' },
  { title: 'Weather', title_bn: 'আবহাওয়া', href: 'dashboard.html#weather', keywords: 'weather forecast rain temperature' },
  { title: 'Irrigation', title_bn: 'সেচ', href: 'dashboard.html#irrigation', keywords: 'irrigation water device' },
];

function buildSearchModal() {
  const overlay = el('div', {
    className: 'modal-overlay',
    id: 'globalSearchModal',
    hidden: true,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('searchOpen'),
  });
  const input = el('input', {
    id: 'globalSearchInput',
    type: 'search',
    placeholder: t('searchPlaceholder'),
    'aria-label': t('search'),
    autocomplete: 'off',
  });
  const results = el('div', { id: 'globalSearchResults', className: 'search-results', role: 'listbox' });
  const closeBtn = el('button', {
    type: 'button',
    className: 'btn icon-btn',
    text: '×',
    'aria-label': 'Close search',
    onClick: () => closeGlobalSearch(),
  });

  overlay.append(
    el('div', { className: 'modal-card search-card' }, [
      el('div', { className: 'search-head' }, [input, closeBtn]),
      results,
    ]),
  );
  document.body.append(overlay);

  input.addEventListener('input', () => renderSearchResults(results, input.value));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const first = results.querySelector('a');
      if (first) {
        ev.preventDefault();
        location.href = first.getAttribute('href');
      }
    }
    if (ev.key === 'Escape') closeGlobalSearch();
  });
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closeGlobalSearch();
  });
  return overlay;
}

export function filterSearchIndex(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return SEARCH_INDEX;
  return SEARCH_INDEX.filter((item) => {
    const hay = `${item.title} ${item.title_bn} ${item.keywords}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderSearchResults(container, query) {
  clear(container);
  const lang = getLang();
  const items = filterSearchIndex(query);
  if (!items.length) {
    container.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  for (const item of items) {
    container.append(
      el('a', { href: item.href, role: 'option', className: 'search-item' }, [
        el('b', { text: lang === 'bn' ? item.title_bn : item.title }),
        el('small', { className: 'muted', text: item.href }),
      ]),
    );
  }
}

export function bindShell(root = document) {
  installGlobalErrorHandlers();
  applyI18n(root);
  bindLangToggle(root);

  root.querySelectorAll('[data-open-search]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      openGlobalSearch();
    });
  });

  root.querySelectorAll('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      logout();
    });
  });

  root.querySelectorAll('[data-require-auth]').forEach((node) => {
    node.addEventListener('click', (ev) => {
      if (!requireAuth(node.getAttribute('data-require-auth') || '')) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    });
  });

  // Ctrl/Cmd+K opens search
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        openGlobalSearch();
      }
      if (ev.key === 'Escape') {
        closeGlobalSearch();
        closeAuthModal();
      }
    });
  }

  document.addEventListener('sf:langchange', () => {
    applyI18n(document);
    setUserChip();
  });
}

export function setUserChip(user) {
  const nameEl = qs('[data-user-name]');
  const avatarEl = qs('[data-user-avatar]');
  const guest = storageGet('user', null) || user;
  if (nameEl) nameEl.textContent = guest?.name || guest?.email || (getLang() === 'bn' ? 'অতিথি' : 'Guest');
  if (avatarEl) {
    const label = guest?.name || guest?.email || 'G';
    avatarEl.textContent = label.slice(0, 2).toUpperCase();
  }
}
