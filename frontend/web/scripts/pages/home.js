/** Home page controller: dynamic cards, calendar, alerts, ticker, hero metrics. */

import { api } from '../api.js';
import { getLang, t, applyI18n } from '../i18n.js';
import { el, clear, setText, qs, qsa, safeExternalHref } from '../dom.js';
import { setState, State } from '../states.js';
import { formatCurrencyBdt, formatPercent, formatTemp } from '../format.js';
import { reportClientError } from '../telemetry.js';
import { bindShell } from '../shell.js';

function stageFromCalendarRow(row, lang) {
  const stages = [];
  if (row.sowing_start) stages.push({ label: lang === 'bn' ? 'বীজ তৈরি' : 'Land prep', active: true });
  if (row.sowing_end) stages.push({ label: lang === 'bn' ? 'রোপণ' : 'Transplanting', active: true });
  stages.push({ label: lang === 'bn' ? 'বৃদ্ধি' : 'Growing', active: false });
  if (row.harvest_start) stages.push({ label: lang === 'bn' ? 'ফসল তোলা' : 'Harvest', active: true });
  while (stages.length < 4) stages.push({ label: '—', active: false });
  return stages.slice(0, 4);
}

async function loadCalendar(crop) {
  const { data } = await api.get(`/api/v1/crops/calendar?crop=${encodeURIComponent(crop)}`, { timeoutMs: 8000 });
  return data;
}

function renderTimeline(container, stages) {
  clear(container);
  for (const stage of stages) {
    container.append(el('span', { className: stage.active ? 'active' : '', text: stage.label }));
  }
}

function setActiveCalendarTab(activeBtn) {
  qsa('.calendar-tabs button').forEach((b) => {
    const on = b === activeBtn;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

async function selectCalendarCrop(crop, { panelState } = {}) {
  const timeline = qs('#calendarTimeline');
  const lang = getLang();
  if (!timeline) return;
  setState(timeline.parentElement, State.LOADING, { lang });
  try {
    const data = await loadCalendar(crop);
    const rows = data?.rows || [];
    if (!rows.length) {
      setState(timeline.parentElement, State.EMPTY, {
        message: lang === 'bn' ? `এই ফসলের ক্যালেন্ডার নেই` : `No calendar for ${crop}`,
        lang,
      });
      renderTimeline(timeline, [
        { label: lang === 'bn' ? 'তথ্য নেই' : 'No data', active: false },
      ]);
      return;
    }
    const stage = stageFromCalendarRow(rows[0], lang);
    renderTimeline(timeline, stage);
    setState(timeline.parentElement, State.READY, { lang });
    timeline.dataset.source = data.source || 'unknown';
  } catch (err) {
    reportClientError(err, { component: 'home-calendar' });
    setState(timeline.parentElement, State.ERROR, {
      message: t('loadFailed'),
      lang,
      retry: () => selectCalendarCrop(crop, { panelState }),
    });
  }
}

async function loadWeatherFloat() {
  const node = qs('#heroWeather');
  if (!node) return;
  const lang = getLang();
  setState(node, State.LOADING, { lang });
  try {
    const { data } = await api.get('/api/v1/weather?lat=23.81&lng=90.41&lang=' + lang, { timeoutMs: 9000 });
    const cur = data?.current;
    if (!cur) throw new Error('empty weather');
    setText(qs('#heroWeatherTemp'), formatTemp(cur.temp));
    setText(qs('#heroWeatherDesc'), `${cur.condition} · ${formatPercent(0)}`.replace(' · 0%', ''));
    setText(qs('#heroWeatherIcon'), cur.icon || '🌤');
    setState(node, State.READY, { lang });
    node.dataset.fetchedAt = new Date().toISOString();
  } catch (err) {
    reportClientError(err, { component: 'home-weather' });
    setState(node, State.ERROR, {
      message: t('loadFailed'),
      lang,
      retry: loadWeatherFloat,
    });
  }
}

async function loadMarketFloat() {
  const node = qs('#heroMarket');
  if (!node) return;
  const lang = getLang();
  setState(node, State.LOADING, { lang });
  try {
    const { data } = await api.get('/api/v1/market/prices', { timeoutMs: 9000 });
    const prices = data?.prices || {};
    const firstKey = Object.keys(prices)[0];
    if (!firstKey) {
      setState(node, State.EMPTY, { lang });
      setText(qs('#heroMarketPrice'), '—');
      return;
    }
    const row = prices[firstKey];
    setText(qs('#heroMarketPrice'), formatCurrencyBdt(row.minPrice ?? row.maxPrice));
    setText(qs('#heroMarketName'), row.name || firstKey);
    setState(node, State.READY, { lang });
    node.dataset.fetchedAt = new Date().toISOString();
  } catch (err) {
    reportClientError(err, { component: 'home-market' });
    setState(node, State.ERROR, { message: t('loadFailed'), lang, retry: loadMarketFloat });
  }
}

async function loadAlerts() {
  const node = qs('#weatherAlertBody');
  if (!node) return;
  const lang = getLang();
  setState(node, State.LOADING, { lang });
  try {
    const { data } = await api.get('/api/v1/disaster/alerts', { timeoutMs: 9000 });
    const alerts = data?.alerts || [];
    clear(node);
    if (!alerts.length) {
      setState(node, State.EMPTY, {
        message: lang === 'bn' ? 'কোনো সতর্কতা নেই' : 'No active alerts',
        lang,
      });
      node.append(el('p', { className: 'muted', text: lang === 'bn' ? 'কোনো সতর্কতা নেই' : 'No active alerts' }));
      return;
    }
    const top = alerts[0];
    const link = safeExternalHref(top.link);
    const box = el('div', { className: 'alert-copy' }, [
      el('div', { className: 'alert-symbol', text: '⛈', 'aria-hidden': 'true' }),
      el('div', {}, [
        el('h3', { text: top.title || (lang === 'bn' ? 'আবহাওয়া সতর্কতা' : 'Weather alert') }),
        el('p', { text: top.description || '' }),
        link
          ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', className: 'text-link', text: lang === 'bn' ? 'বিস্তারিত' : 'Details' })
          : null,
        el('small', { className: 'muted', text: `${data.source || 'BMD'} · ${top.publishedAt || ''}` }),
      ]),
    ]);
    node.append(box);
    setState(node, State.READY, { lang });
    node.dataset.fetchedAt = new Date().toISOString();
  } catch (err) {
    reportClientError(err, { component: 'home-alerts' });
    setState(node, State.ERROR, { message: t('loadFailed'), lang, retry: loadAlerts });
  }
}

async function loadTicker() {
  const node = qs('#tickerItems');
  if (!node) return;
  try {
    const { data } = await api.get('/api/v1/market/prices', { timeoutMs: 8000 });
    const prices = Object.entries(data?.prices || {}).slice(0, 4);
    clear(node);
    if (!prices.length) {
      node.append(el('span', { text: t('empty') }));
      return;
    }
    for (const [id, row] of prices) {
      node.append(
        el('span', {}, [
          document.createTextNode(`${row.name || id}  ${formatCurrencyBdt(row.minPrice)} `),
        ]),
      );
    }
    // weather snippet
    try {
      const w = await api.get('/api/v1/disaster/alerts', { timeoutMs: 6000 });
      const a = w.data?.alerts?.[0];
      if (a?.title) node.append(el('span', { text: `🌧 ${a.title.slice(0, 48)}` }));
    } catch {
      /* weather optional */
    }
  } catch (err) {
    reportClientError(err, { component: 'home-ticker' });
    clear(node);
    node.append(el('span', { className: 'muted', text: t('offline') }));
  }
}

function bindCalendarTabs() {
  qsa('.calendar-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveCalendarTab(btn);
      const crop = btn.getAttribute('data-crop') || btn.dataset.crop;
      void selectCalendarCrop(crop);
    });
    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        const tabs = qsa('.calendar-tabs button');
        const i = tabs.indexOf(btn);
        const next = ev.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : tabs[(i - 1 + tabs.length) % tabs.length];
        next.focus();
        next.click();
      }
    });
  });
}

function fixDeadLinks(root) {
  qsa('a[href="#"]', root).forEach((a) => {
    a.setAttribute('href', 'dashboard.html');
    a.setAttribute('title', t('viewAll'));
  });
}

export function initHome() {
  bindShell();
  fixDeadLinks(document);
  bindCalendarTabs();
  const initial = qsa('.calendar-tabs button').find((b) => b.classList.contains('active'))?.getAttribute('data-crop') || 'Rice';
  void selectCalendarCrop(initial);

  void loadWeatherFloat();
  void loadMarketFloat();
  void loadAlerts();
  void loadTicker();

  document.addEventListener('sf:langchange', () => {
    applyI18n();
    const active = qsa('.calendar-tabs button').find((b) => b.classList.contains('active'));
    if (active) void selectCalendarCrop(active.getAttribute('data-crop'));
    void loadWeatherFloat();
    void loadAlerts();
  });
}

if (typeof document !== 'undefined' && !globalThis.__SF_HOME_INIT__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalThis.__SF_HOME_INIT__ = true;
      initHome();
    });
  } else {
    globalThis.__SF_HOME_INIT__ = true;
    initHome();
  }
}
