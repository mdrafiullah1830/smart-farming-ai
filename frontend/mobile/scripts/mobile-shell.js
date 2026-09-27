/**
 * Mobile shell controller.
 *
 * The desktop pages use a sidebar + top command bar. On phones we replace that
 * chrome with a fixed top app bar and a bottom tab bar. This module only wires
 * behaviour that is unique to the mobile chrome:
 *   - bottom tab active-state
 *   - "More" bottom sheet (Resources / Insights / Alerts / language / auth)
 *   - scrolled shadow on the top bar
 *   - auto-fill of the mobile search field from the page query string
 *
 * Everything else (auth gate, global search modal, Ctrl+K, lang toggle, user
 * chip, i18n) is reused verbatim from the shared shell so no functionality is
 * lost and no duplicate modals are created.
 */

import { bindShell } from './shell.js';
import { qs, qsa, el } from './dom.js';
import { getLang } from './i18n.js';

/** Mark the tab matching the current document as active. */
export function syncActiveTab(path = typeof location !== 'undefined' ? location.pathname : '') {
  const file = (path.split('/').pop() || 'index.html').split('#')[0] || 'index.html';
  // Also check without .html extension since server may redirect /soil.html -> /soil
  const fileNoExt = file.replace(/\.html$/, '');
  qsa('[data-tab]').forEach((tab) => {
    const tabFile = tab.getAttribute('href')?.split('/').pop()?.split('#')[0];
    const tabFileNoExt = tabFile?.replace(/\.html$/, '');
    const active = tabFile === file || tabFileNoExt === fileNoExt || (file === '' && tabFile === 'index.html');
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

/** Toggle the shadow under the top app bar once the page scrolls. */
export function bindScrollShadow() {
  const bar = qs('.m-appbar');
  if (!bar) return;
  const update = () => bar.classList.toggle('is-scrolled', window.scrollY > 4);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

/** Mirror the page-query text into the collapsed search field. */
export function bindSearchMirror() {
  const inline = qs('#commandSearch');
  const mirror = qs('[data-search-mirror]');
  if (!inline || !mirror) return;
  const sync = () => {
    mirror.textContent = inline.value || '';
    mirror.classList.toggle('has-value', Boolean(inline.value));
  };
  inline.addEventListener('input', sync);
  sync();
}

let moreSheet;

function buildMoreSheet() {
  const overlay = el('div', {
    className: 'm-sheet-overlay',
    id: 'mobileMoreSheet',
    hidden: true,
    onClick: (ev) => {
      if (ev.target === overlay) closeMoreSheet();
    },
  });

  const links = [
    { href: 'index.html#resources', icon: 'library_books', key: 'resources', fallback: 'Resources' },
    { href: 'index.html#insights', icon: 'tune', key: 'insights', fallback: 'Insights' },
    { href: 'dashboard.html#alerts', icon: 'notifications', key: 'notifications', fallback: 'Alerts' },
    { href: 'soil.html', icon: 'science', key: 'navSoil', fallback: 'Soil' },
    { href: 'market.html', icon: 'storefront', key: 'navMarket', fallback: 'Market' },
    { href: 'ai-search.html', icon: 'psychology', key: 'navAI', fallback: 'AI Assistant' },
  ];

  const menu = el('div', { className: 'm-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'moreSheetTitle' }, [
    el('div', { className: 'm-sheet-grip', 'aria-hidden': 'true' }),
    el('div', { className: 'm-sheet-head' }, [
      el('h2', { id: 'moreSheetTitle', className: 'm-sheet-title', 'data-i18n': 'moreMenu', text: getLang() === 'bn' ? 'আরও' : 'More' }),
      el('button', {
        type: 'button',
        className: 'btn icon-btn',
        text: '×',
        'aria-label': 'Close',
        onClick: () => closeMoreSheet(),
      }),
    ]),
  ]);

  const grid = el('div', { className: 'm-more-grid' });
  for (const item of links) {
    const icon = el('span', { className: 'material-icons-round', text: item.icon });
    grid.append(
      el('a', { className: 'm-more-item', href: item.href }, [
        icon,
        el('span', { 'data-i18n': item.key, text: item.fallback }),
      ]),
    );
  }
  menu.append(grid);

  menu.append(
    el('div', { className: 'm-more-foot' }, [
      el('div', { className: 'lang-toggle', role: 'group', 'aria-label': 'Language' }, [
        el('button', { className: 'btn', type: 'button', 'data-lang': 'bn', text: 'বাংলা' }),
        el('button', { className: 'btn', type: 'button', 'data-lang': 'en', text: 'EN' }),
      ]),
      el('a', { className: 'btn m-more-site', href: 'index.html' }, [
        el('span', { className: 'material-icons-round', text: 'public' }),
        el('span', { 'data-i18n': 'desktopSite', text: getLang() === 'bn' ? 'ডেস্কটপ সাইট' : 'Desktop site' }),
      ]),
    ]),
  );

  overlay.append(menu);
  document.body.append(overlay);
  return overlay;
}

export function openMoreSheet() {
  if (typeof document === 'undefined') return;
  if (!moreSheet) moreSheet = buildMoreSheet();
  moreSheet.hidden = false;
  document.body.classList.add('m-sheet-open');
  moreSheet.querySelector('a, button')?.focus();
}

export function closeMoreSheet() {
  if (moreSheet) moreSheet.hidden = true;
  document.body.classList.remove('m-sheet-open');
}

export function bindMobileShell(root = document) {
  // Reuse every shared behaviour (auth, search modal, i18n, telemetry).
  bindShell(root);

  syncActiveTab();
  bindScrollShadow();
  bindSearchMirror();
  bindTableLabels();

  root.querySelectorAll('[data-open-more]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      openMoreSheet();
    });
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeMoreSheet();
  });

  document.addEventListener('sf:langchange', () => {
    if (moreSheet) {
      moreSheet.remove();
      moreSheet = null;
    }
    // Header labels are re-derived after the language swap.
    requestAnimationFrame(() => bindTableLabels());
  });
}

/**
 * Copy table header text into each cell's `data-label`, so the CSS can render
 * numeric tables as readable stacked cards on narrow screens. Uses a
 * MutationObserver because the page controllers rebuild rows asynchronously
 * after API responses.
 */
export function bindTableLabels(scope = document) {
  const tables = scope.querySelectorAll('table');
  tables.forEach((table) => {
    const apply = () => {
      const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach((tr) => {
        [...tr.children].forEach((cell, index) => {
          if (cell.hasAttribute('colspan')) {
            cell.removeAttribute('data-label');
            return;
          }
          const label = headers[index];
          if (label) cell.setAttribute('data-label', label);
          else cell.removeAttribute('data-label');
        });
      });
    };
    apply();
    if (table.dataset.labelsObserved === '1') return;
    table.dataset.labelsObserved = '1';
    const observer = new MutationObserver(apply);
    observer.observe(table, { childList: true, subtree: true, characterData: true });
  });
}

