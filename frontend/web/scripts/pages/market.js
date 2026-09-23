/** Market page: commodity/range changes, chart, watchlist, alerts, export. */

import { api } from '../api.js';
import { getLang, t, applyI18n } from '../i18n.js';
import { el, clear, setText, qs, qsa } from '../dom.js';
import { setState, State } from '../states.js';
import { storageGet, storageSet } from '../storage.js';
import { formatCurrencyBdt, formatPercent, round } from '../format.js';
import { reportClientError } from '../telemetry.js';
import { bindShell, requireAuth } from '../shell.js';

const WATCHLIST_KEY = 'market.watchlist';
const ALERTS_KEY = 'market.alerts';
const RANGE_DAYS = { '7': 7, '30': 30, '90': 90 };

let state = {
  prices: {},
  rows: [],
  crop: null,
  range: '7',
  history: [],
  districts: [],
};

function getWatchlist() {
  const list = storageGet(WATCHLIST_KEY, []);
  return Array.isArray(list) ? list : [];
}

function setWatchlist(list) {
  storageSet(WATCHLIST_KEY, list);
}

function getAlerts() {
  const list = storageGet(ALERTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function setAlerts(list) {
  storageSet(ALERTS_KEY, list);
}

function cropIds() {
  return Object.keys(state.prices || {});
}

function defaultCrop() {
  const ids = cropIds();
  if (!ids.length) return null;
  const preferred = ids.find((id) => /rice|aman|dhan/i.test(id)) || ids[0];
  return preferred;
}

async function loadPrices() {
  const strip = qs('#commodities');
  const lang = getLang();
  if (strip) setState(strip, State.LOADING, { lang });
  try {
    const { data } = await api.get('/api/v1/market/prices', { timeoutMs: 10000 });
    state.prices = data.prices || {};
    state.rows = data.rows || [];
    if (!state.crop || !state.prices[state.crop]) state.crop = defaultCrop();
    renderCommodityStrip();
    renderTicker();
    if (strip) setState(strip, Object.keys(state.prices).length ? State.READY : State.EMPTY, { lang });
    await loadHistory();
    renderDistrictComparison();
    renderWatchlist();
    renderInsights();
  } catch (err) {
    reportClientError(err, { component: 'market-prices' });
    if (strip) setState(strip, State.ERROR, { message: t('loadFailed'), lang, retry: loadPrices });
  }
}

function renderCommodityStrip() {
  const strip = qs('#commodities');
  if (!strip) return;
  clear(strip);
  const ids = cropIds().slice(0, 5);
  if (!ids.length) {
    strip.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  for (const id of ids) {
    const row = state.prices[id];
    const btn = el(
      'button',
      {
        type: 'button',
        className: `commodity${id === state.crop ? ' active' : ''}`,
        dataset: { crop: id, name: row.name || id },
        'aria-pressed': id === state.crop ? 'true' : 'false',
        onClick: () => selectCrop(id),
      },
      [
        el('span', { className: 'emoji', text: '🌾', 'aria-hidden': 'true' }),
        el('span', {}, [el('b', { text: row.name || id }), el('small', { text: row.unit || 'kg' })]),
      ],
    );
    strip.append(btn);
  }
}

function renderTicker() {
  const ticker = qs('#tickerPrices');
  if (!ticker) return;
  clear(ticker);
  const entries = Object.entries(state.prices).slice(0, 5);
  if (!entries.length) {
    ticker.append(el('span', { className: 'muted', text: t('empty') }));
    return;
  }
  for (const [id, row] of entries) {
    ticker.append(
      el('span', {}, [
        document.createTextNode(`${row.name || id}  ${formatCurrencyBdt(row.minPrice)} `),
      ]),
    );
  }
}

async function selectCrop(crop) {
  state.crop = crop;
  qsa('.commodity').forEach((b) => {
    const on = b.dataset.crop === crop;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  updatePriceSummary();
  await loadHistory();
}

function updatePriceSummary() {
  const lang = getLang();
  const row = state.prices[state.crop];
  const node = qs('#priceSummary');
  if (!node) return;
  if (!row) {
    setText(qs('#currentPrice'), '—');
    setText(qs('#priceHigh'), '—');
    setText(qs('#priceLow'), '—');
    setText(qs('#priceChange'), '—');
    setState(node, State.EMPTY, { lang });
    return;
  }
  setText(qs('#currentPrice'), formatCurrencyBdt(row.minPrice));
  setText(qs('#priceHigh'), formatCurrencyBdt(row.maxPrice));
  setText(qs('#priceLow'), formatCurrencyBdt(row.minPrice));
  // change from history if available
  const hist = state.history;
  if (hist.length >= 2) {
    const latest = Number(hist[0].price_mid ?? hist[0].price_max);
    const prev = Number(hist[hist.length - 1].price_mid ?? hist[hist.length - 1].price_min);
    if (Number.isFinite(latest) && Number.isFinite(prev) && prev !== 0) {
      const pct = ((latest - prev) / prev) * 100;
      setText(qs('#priceChange'), formatPercent(round(pct, 1), { sign: true }));
      const chip = qs('#priceChange');
      if (chip) chip.className = pct >= 0 ? 'chip positive-chip' : 'chip negative-chip';
    }
  } else {
    setText(qs('#priceChange'), '—');
  }
  setText(qs('#chartCropLabel'), row.name || state.crop || '');
  setState(node, State.READY, { lang });
  node.dataset.fetchedAt = new Date().toISOString();
}

async function loadHistory() {
  const wrap = qs('#chartWrap');
  if (!wrap || !state.crop) return;
  const lang = getLang();
  setState(wrap, State.LOADING, { lang });
  try {
    const days = RANGE_DAYS[state.range] || 7;
    const { data } = await api.get(
      `/api/v1/market/history/${encodeURIComponent(state.crop)}?days=${days}`,
      { timeoutMs: 10000 },
    );
    let history = data.history || data.rows || [];
    if (!Array.isArray(history)) history = [];
    // history endpoint may ignore days; slice client-side
    state.history = history.slice(0, days);
    drawChart(state.history);
    updatePriceSummary();
    setState(wrap, state.history.length ? State.READY : State.EMPTY, {
      message: t('empty'),
      lang,
      retry: loadHistory,
    });
  } catch (err) {
    reportClientError(err, { component: 'market-history' });
    setState(wrap, State.ERROR, { message: t('loadFailed'), lang, retry: loadHistory });
  }
}

function drawChart(history) {
  const svg = qs('#priceChart');
  if (!svg) return;
  clear(svg);
  const W = 700;
  const H = 230;
  const pad = 20;

  const points = history
    .map((row, i) => ({
      x: i,
      y: Number(row.price_mid ?? row.price_max ?? row.price_min ?? NaN),
      row,
    }))
    .filter((p) => Number.isFinite(p.y));

  if (points.length < 2) {
    // honest empty chart message via parent state — leave axis only
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    line.setAttribute('x', String(W / 2));
    line.setAttribute('y', String(H / 2));
    line.setAttribute('text-anchor', 'middle');
    line.setAttribute('fill', '#65756f');
    line.setAttribute('font-size', '14');
    line.textContent = t('empty');
    svg.append(line);
    return;
  }

  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const stepX = (W - pad * 2) / Math.max(1, points.length - 1);
  const toXY = (p, idx) => ({
    x: pad + idx * stepX,
    y: H - pad - ((p.y - min) / span) * (H - pad * 2),
  });

  const coords = points.map(toXY);
  const lineD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L${coords[coords.length - 1].x.toFixed(1)} ${H - pad} L${coords[0].x.toFixed(1)} ${H - pad} Z`;

  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = `<linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#70b38c" stop-opacity=".38"/><stop offset="1" stop-color="#70b38c" stop-opacity="0"/></linearGradient>`;
  // gradient ids are static and not user-controlled
  svg.append(defs);

  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', 'url(#area)');
  svg.append(area);

  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', lineD);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#126846');
  line.setAttribute('stroke-width', '4');
  svg.append(line);

  // markers
  coords.forEach((c, i) => {
    if (i !== 0 && i !== coords.length - 1 && i % Math.ceil(coords.length / 6) !== 0) return;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', c.x.toFixed(1));
    dot.setAttribute('cy', c.y.toFixed(1));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', '#126846');
    const title = document.createElementNS(ns, 'title');
    const row = points[i].row;
    title.textContent = `${row.recorded_at || ''} ${row.price_mid ?? row.price_max ?? ''}`;
    dot.append(title);
    svg.append(dot);
  });
}

function bindRanges() {
  qsa('#rangeTabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('#rangeTabs button').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      state.range = btn.getAttribute('data-range') || '7';
      void loadHistory();
    });
  });
}

function renderWatchlist() {
  const body = qs('#watchlistBody');
  if (!body) return;
  const lang = getLang();
  clear(body);
  const list = getWatchlist();
  if (!list.length) {
    const tr = el('tr', {}, [el('td', { colspan: '4', className: 'muted', text: t('empty') })]);
    body.append(tr);
    return;
  }
  for (const id of list) {
    const row = state.prices[id];
    body.append(
      el('tr', { dataset: { crop: id } }, [
        el('td', { text: row?.name || id }),
        el('td', { text: row ? formatCurrencyBdt(row.minPrice) : '—' }),
        el('td', { text: row?.updatedAt ? formatDateShort(row.updatedAt) : '—' }),
        el('td', {}, [
          el('button', {
            type: 'button',
            className: 'btn btn-soft btn-tiny',
            text: lang === 'bn' ? 'বাদ' : 'Remove',
            'aria-label': `${lang === 'bn' ? 'সরান' : 'Remove'} ${id}`,
            onClick: () => removeFromWatchlist(id),
          }),
        ]),
      ]),
    );
  }
}

function formatDateShort(iso) {
  try {
    return new Date(iso).toLocaleDateString(getLang() === 'bn' ? 'bn-BD' : 'en-GB');
  } catch {
    return '—';
  }
}

function addToWatchlist(id) {
  const list = getWatchlist();
  if (list.includes(id)) return false;
  list.push(id);
  setWatchlist(list);
  renderWatchlist();
  return true;
}

function removeFromWatchlist(id) {
  setWatchlist(getWatchlist().filter((x) => x !== id));
  renderWatchlist();
}

function bindWatchlistAdd() {
  const btn = qs('#watchlistAdd');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!state.crop) return;
    const ok = addToWatchlist(state.crop);
    const lang = getLang();
    setText(btn, ok ? (lang === 'bn' ? 'ওয়াচলিস্টে ✓' : 'Watchlisted ✓') : (lang === 'bn' ? 'আগেই আছে' : 'Already listed'));
  });
}

function renderDistrictComparison() {
  const body = qs('#districtCompareBody');
  const chip = qs('#districtCompareCrop');
  if (!body) return;
  if (chip && state.crop) chip.textContent = state.prices[state.crop]?.name || state.crop;
  clear(body);

  // Group latest row per district for selected crop
  const byDistrict = new Map();
  for (const row of state.rows) {
    if (state.crop && String(row.crop_id) !== String(state.crop)) continue;
    const d = row.market_name || row.district_id || '—';
    if (!byDistrict.has(d)) byDistrict.set(d, row);
  }
  const entries = [...byDistrict.entries()].slice(0, 6);
  if (!entries.length) {
    body.append(el('tr', {}, [el('td', { colspan: '4', className: 'muted', text: t('empty') })]));
    return;
  }
  const mids = entries.map(([, r]) => (Number(r.price_min) + Number(r.price_max)) / 2).filter(Number.isFinite);
  const avg = mids.reduce((a, b) => a + b, 0) / (mids.length || 1);

  for (const [district, row] of entries) {
    const mid = (Number(row.price_min) + Number(row.price_max)) / 2;
    const vs = avg ? ((mid - avg) / avg) * 100 : 0;
    body.append(
      el('tr', {}, [
        el('td', { text: district }),
        el('td', { text: formatCurrencyBdt(mid) }),
        el('td', {
          className: vs >= 0 ? 'positive' : 'negative',
          text: formatPercent(round(vs, 1), { sign: true }),
        }),
        el('td', {}, [el('span', { className: vs >= 0 ? 'positive' : 'negative', text: vs >= 0 ? '▲' : '▼' })]),
      ]),
    );
  }
}

function renderInsights() {
  const node = qs('#insightsList');
  if (!node) return;
  const lang = getLang();
  clear(node);
  const row = state.prices[state.crop];
  const items = [];
  if (row) {
    items.push(
      lang === 'bn'
        ? `${row.name} সর্বনিম্ন ${formatCurrencyBdt(row.minPrice)}, সর্বোচ্চ ${formatCurrencyBdt(row.maxPrice)} (${row.unit || 'kg'})`
        : `${row.name} min ${formatCurrencyBdt(row.minPrice)}, max ${formatCurrencyBdt(row.maxPrice)} (${row.unit || 'kg'})`,
    );
  }
  if (state.history.length >= 2) {
    const latest = Number(state.history[0].price_mid ?? state.history[0].price_max);
    const oldest = Number(state.history[state.history.length - 1].price_mid ?? state.history[state.history.length - 1].price_min);
    const pct = oldest ? ((latest - oldest) / oldest) * 100 : 0;
    items.push(
      lang === 'bn'
        ? `${state.range} দিনে ${pct >= 0 ? 'বৃদ্ধি' : 'হ্রাস'} ${formatPercent(Math.abs(pct), { digits: 1 })}`
        : `${state.range}-day change ${formatPercent(pct, { sign: true, digits: 1 })}`,
    );
  }
  items.push(lang === 'bn' ? `উৎস: ${row?.source || 'D1 seed / DAM'}` : `Source: ${row?.source || 'D1 seed / DAM'}`);
  items.push(lang === 'bn' ? 'ক্রয়/বিক্রয় সিদ্ধান্তের আগে স্থানীয় বাজার যাচাই করুন' : 'Verify locally before buy/sell decisions');
  if (!items.length) items.push(t('empty'));
  for (const text of items) node.append(el('div', { className: 'insight-row', text }));
}

async function loadDistricts() {
  try {
    const { data } = await api.get('/api/v1/market/districts', { timeoutMs: 8000 });
    state.districts = data.districts || [];
  } catch {
    state.districts = [];
  }
}

function bindAlerts() {
  const btn = qs('#createAlertBtn');
  const modal = qs('#alertModal');
  if (!btn || !modal) return;
  btn.addEventListener('click', () => {
    if (!requireAuth(t('createAlert'))) return;
    modal.hidden = false;
    qs('#alertCrop')?.focus();
  });
  qs('#alertCancel')?.addEventListener('click', () => {
    modal.hidden = true;
  });
  qs('#alertForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const crop = qs('#alertCrop')?.value?.trim();
    const price = Number(qs('#alertPrice')?.value);
    const error = qs('#alertError');
    if (!crop || !Number.isFinite(price) || price <= 0) {
      if (error) {
        error.hidden = false;
        error.textContent = getLang() === 'bn' ? 'সঠিক ফসল ও ইতিবাচক দাম দিন' : 'Enter a crop and positive price';
      }
      return;
    }
    if (error) error.hidden = true;
    const alerts = getAlerts();
    alerts.push({ id: crypto.randomUUID(), crop, price, createdAt: new Date().toISOString() });
    setAlerts(alerts);
    renderAlerts();
    modal.hidden = true;
    qs('#alertForm').reset();
  });
}

function renderAlerts() {
  const list = qs('#alertsList');
  if (!list) return;
  const lang = getLang();
  clear(list);
  const alerts = getAlerts();
  if (!alerts.length) {
    list.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  for (const a of alerts) {
    list.append(
      el('div', { className: 'insight-row' }, [
        el('span', { text: `${a.crop} ≤ ${formatCurrencyBdt(a.price)}` }),
        el('button', {
          type: 'button',
          className: 'btn btn-soft btn-tiny',
          text: lang === 'bn' ? 'মুছুন' : 'Delete',
          onClick: () => {
            setAlerts(getAlerts().filter((x) => x.id !== a.id));
            renderAlerts();
          },
        }),
      ]),
    );
  }
}

function bindExport() {
  const btn = qs('#exportBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const lang = getLang();
    const headers = ['crop_id', 'name', 'price_min', 'price_max', 'unit', 'source', 'recorded_at', 'market_name'];
    const rows = state.rows.filter((r) => !state.crop || String(r.crop_id) === String(state.crop));
    if (!rows.length) {
      alert(lang === 'bn' ? 'এক্সপোর্ট করার মতো ডেটা নেই' : 'Nothing to export');
      return;
    }
    const csv = [headers.join(',')];
    for (const r of rows) {
      csv.push(
        headers
          .map((h) => {
            const v = r[h] ?? '';
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(','),
      );
    }
    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `market-${state.crop || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function bindDirections() {
  const btn = qs('#directionsBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const market = qs('#nearestMarketName')?.textContent?.trim();
    if (!market) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(market + ' Bangladesh')}`, '_blank', 'noopener');
  });
}

function renderAIRecommend() {
  const node = qs('#aiRecommend');
  if (!node) return;
  const lang = getLang();
  clear(node);
  const row = state.prices[state.crop];
  if (!row) {
    node.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  let direction = lang === 'bn' ? 'পর্যবেক্ষণ' : 'HOLD';
  if (state.history.length >= 3) {
    const recent = state.history.slice(0, 3).map((h) => Number(h.price_mid ?? h.price_max));
    const older = state.history.slice(-3).map((h) => Number(h.price_mid ?? h.price_min));
    const avgR = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgO = older.reduce((a, b) => a + b, 0) / older.length;
    if (avgR > avgO * 1.02) direction = lang === 'bn' ? 'বিক্রয়' : 'SELL';
    else if (avgR < avgO * 0.98) direction = lang === 'bn' ? 'অপেক্ষা' : 'WAIT';
  }
  node.append(
    el('div', { className: 'sell', text: direction }),
    el('p', {
      className: 'muted',
      text:
        lang === 'bn'
          ? 'নিম্ন মূল্য ইতিহাসভিত্তিক সাধারণ সূচক — বিনিয়োগ পরামর্শ নয়।'
          : 'Heuristic from price history only — not financial advice.',
    }),
  );
}

export function initMarket() {
  bindShell();
  bindRanges();
  bindWatchlistAdd();
  bindAlerts();
  bindExport();
  bindDirections();
  renderAlerts();
  qsa('a[href="#"]').forEach((a) => a.setAttribute('href', 'dashboard.html'));

  void loadPrices()
    .catch(() => {})
    .finally(() => renderAIRecommend());
  void loadDistricts();

  document.addEventListener('sf:langchange', () => {
    applyI18n();
    renderCommodityStrip();
    renderTicker();
    renderWatchlist();
    renderInsights();
    renderAlerts();
    updatePriceSummary();
    renderAIRecommend();
  });
}

if (typeof document !== 'undefined' && !globalThis.__SF_MARKET_INIT__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalThis.__SF_MARKET_INIT__ = true;
      initMarket();
    });
  } else {
    globalThis.__SF_MARKET_INIT__ = true;
    initMarket();
  }
}
