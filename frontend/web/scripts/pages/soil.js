/** Soil page: field/location selection, metrics, comparison, report, reminder. */

import { api } from '../api.js';
import { getLang, t, applyI18n } from '../i18n.js';
import { el, clear, setText, qs, qsa } from '../dom.js';
import { setState, State } from '../states.js';
import { storageGet, storageSet } from '../storage.js';
import { formatDate, round } from '../format.js';
import { reportClientError } from '../telemetry.js';
import { bindShell, requireAuth } from '../shell.js';

const REMINDER_KEY = 'soil.reminder';
const FIELDS_KEY = 'soil.fields';
const COMPARE_KEY = 'soil.compare';

const FEATURE_META = {
  nitrogen: { key: 'nitrogen', label: 'N', optimal: [80, 120], unit: 'kg/ha' },
  phosphorus: { key: 'phosphorus', label: 'P', optimal: [40, 60], unit: 'kg/ha' },
  potassium: { key: 'potassium', label: 'K', optimal: [120, 180], unit: 'kg/ha' },
  ph: { key: 'ph', label: 'pH', optimal: [6.0, 7.0], unit: '' },
};

function statusFor(value, optimal, lang) {
  if (value == null || Number.isNaN(Number(value))) return { label: '—', cls: '' };
  const v = Number(value);
  const [lo, hi] = optimal;
  if (v < lo) return { label: lang === 'bn' ? 'কম' : 'Low', cls: 'low' };
  if (v > hi) return { label: lang === 'bn' ? 'বেশি' : 'High', cls: 'high' };
  return { label: lang === 'bn' ? 'মাঝারি' : 'Moderate', cls: 'ok' };
}

function parseFeatureValue(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function healthScore(features) {
  const scores = [];
  for (const meta of Object.values(FEATURE_META)) {
    const raw = features[meta.key] ?? features[meta.label.toLowerCase()];
    const v = Array.isArray(raw) ? parseFeatureValue(raw[0]?.value) : parseFeatureValue(raw);
    if (v == null) continue;
    const [lo, hi] = meta.optimal;
    const mid = (lo + hi) / 2;
    const dist = Math.abs(v - mid) / mid;
    scores.push(Math.max(0, 100 - dist * 120));
  }
  if (!scores.length) return null;
  return round(scores.reduce((a, b) => a + b, 0) / scores.length, 0);
}

function flattenFeatures(grouped) {
  const out = {};
  for (const [name, list] of Object.entries(grouped || {})) {
    const key = String(name).toLowerCase().replace(/[^a-z]/g, '');
    const first = Array.isArray(list) ? list[0] : list;
    out[key] = first?.value ?? first;
    if (typeof out[key] === 'string') out[key] = parseFeatureValue(out[key]);
  }
  return out;
}

async function loadDistricts() {
  const select = qs('#districtSelect');
  const division = qs('#divisionSelect');
  if (!select) return;
  try {
    const { data } = await api.get('/api/v1/soil/districts', { timeoutMs: 9000 });
    const districts = data.districts || [];
    clear(select);
    select.append(el('option', { value: '', text: getLang() === 'bn' ? 'জেলা বাছাই' : 'Select district' }));
    for (const d of districts) {
      select.append(el('option', { value: d, text: d }));
    }
    if (!districts.length) setState(select.closest('.panel') || select, State.EMPTY, { lang: getLang() });
  } catch (err) {
    reportClientError(err, { component: 'soil-districts' });
    setState(select.closest('.panel') || select, State.ERROR, {
      message: t('loadFailed'),
      lang: getLang(),
      retry: loadDistricts,
    });
  }
  // divisions from a static set used by BARC data
  if (division && !division.dataset.loaded) {
    const divisions = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Barishal', 'Sylhet', 'Rangpur', 'Mymensingh'];
    clear(division);
    division.append(el('option', { value: '', text: getLang() === 'bn' ? 'বিভাগ' : 'Division' }));
    for (const d of divisions) division.append(el('option', { value: d, text: d }));
    division.dataset.loaded = '1';
  }
}

async function loadUpazilas(district) {
  const select = qs('#upazilaSelect');
  if (!select) return;
  clear(select);
  select.append(el('option', { value: '', text: getLang() === 'bn' ? 'উপজেলা' : 'Upazila' }));
  if (!district) return;
  try {
    const { data } = await api.get(`/api/v1/soil/upazilas/${encodeURIComponent(district)}`, { timeoutMs: 8000 });
    const list = data.upazilas || [];
    for (const u of list) {
      const name = typeof u === 'string' ? u : u.name;
      select.append(el('option', { value: name, text: name }));
    }
  } catch (err) {
    reportClientError(err, { component: 'soil-upazilas' });
  }
}

function getFields() {
  const f = storageGet(FIELDS_KEY, null);
  if (Array.isArray(f) && f.length) return f;
  return [
    { id: 'a', name: 'Field A (North)' },
    { id: 'b', name: 'Field B (South)' },
    { id: 'c', name: 'Field C (East)' },
  ];
}

function renderFieldSelect() {
  const select = qs('#fieldSelect');
  if (!select) return;
  const fields = getFields();
  const current = select.value;
  clear(select);
  for (const f of fields) select.append(el('option', { value: f.id, text: f.name }));
  if (current) select.value = current;
}

async function loadReport({ district, upazila }) {
  const panel = qs('#soilReport');
  const lang = getLang();
  if (!panel) return;
  setState(panel, State.LOADING, { lang });
  try {
    const { data } = await api.get(
      `/api/v1/soil/features/${encodeURIComponent(district)}/${encodeURIComponent(upazila)}`,
      { timeoutMs: 10000 },
    );
    const grouped = data.features || {};
    const flat = flattenFeatures(grouped);
    storageSet('soil.lastFeatures', flat);
    storageSet('soil.lastMeta', { district, upazila, fetchedAt: new Date().toISOString(), source: 'D1 BARC soil_features' });

    renderMetrics(flat, grouped);
    renderReportHeader(district, upazila);
    renderComparison(flat);
    renderFertilizer(flat);
    renderCrops(district, upazila);
    setState(panel, Object.keys(flat).length ? State.READY : State.EMPTY, {
      message: t('empty'),
      lang,
      retry: () => loadReport({ district, upazila }),
    });
  } catch (err) {
    reportClientError(err, { component: 'soil-report' });
    setState(panel, State.ERROR, { message: err.message || t('loadFailed'), lang, retry: () => loadReport({ district, upazila }) });
  }
}

function renderReportHeader(district, upazila) {
  setText(qs('#reportTitle'), `${district} · ${upazila}`);
  const meta = storageGet('soil.lastMeta', null);
  setText(qs('#lastTested'), meta?.fetchedAt ? formatDate(meta.fetchedAt) : '—');
  setText(qs('#reportSource'), meta?.source || '—');
  setText(qs('#locationContext'), district);
}

function setGauge(id, value, optimal, unit, lang) {
  const strong = qs(`#${id} strong`);
  const status = qs(`#${id}Status`);
  const optimalEl = qs(`#${id}Optimal`);
  const gauge = qs(`#${id}`);
  if (strong) strong.innerHTML = '';
  if (strong) {
    strong.append(document.createTextNode(value == null ? '—' : String(value)));
    if (unit) {
      const small = el('small', { style: 'font-size:11px', text: ` ${unit}` });
      strong.append(small);
    }
  }
  const st = statusFor(value, optimal, lang);
  if (status) {
    status.textContent = st.label;
    status.className = `soil-status ${st.cls}`;
  }
  if (optimalEl) optimalEl.textContent = `Optimal: ${optimal[0]}–${optimal[1]}`;
  if (gauge && value != null) {
    const [lo, hi] = optimal;
    const pct = Math.max(5, Math.min(100, ((Number(value) - lo * 0.5) / (hi * 1.5 - lo * 0.5)) * 100));
    gauge.style.setProperty('--gauge-value', `${round(pct, 0)}%`);
  }
}

function renderMetrics(flat, grouped) {
  const lang = getLang();
  const n = flat.nitrogen ?? parseFeatureValue(grouped?.nitrogen?.[0]?.value);
  const p = flat.phosphorus ?? flat.phos ?? parseFeatureValue(grouped?.phosphorus?.[0]?.value);
  const k = flat.potassium ?? parseFeatureValue(grouped?.potassium?.[0]?.value);
  const ph = flat.ph ?? flat.phlevel ?? parseFeatureValue(grouped?.ph?.[0]?.value);

  setGauge('gaugeN', n, FEATURE_META.nitrogen.optimal, 'kg/ha', lang);
  setGauge('gaugeP', p, FEATURE_META.phosphorus.optimal, 'kg/ha', lang);
  setGauge('gaugeK', k, FEATURE_META.potassium.optimal, 'kg/ha', lang);
  setGauge('gaugePh', ph, FEATURE_META.ph.optimal, '', lang);

  const score = healthScore({ nitrogen: n, phosphorus: p, potassium: k, ph });
  const ring = qs('#healthRing');
  const ringValue = qs('#healthScore');
  if (score == null) {
    if (ringValue) {
      clear(ringValue);
      ringValue.append(document.createTextNode('—'), el('small', { text: '—' }));
    }
    if (ring) ring.style.setProperty('--value', '0');
  } else {
    if (ring) ring.style.setProperty('--value', String(score));
    if (ringValue) {
      clear(ringValue);
      const label = score >= 70 ? (lang === 'bn' ? 'ভালো' : 'Good') : score >= 50 ? (lang === 'bn' ? 'মাঝারি' : 'Moderate') : (lang === 'bn' ? 'দুর্বল' : 'Poor');
      ringValue.append(document.createTextNode(String(score)), el('small', { text: label }));
    }
  }
}

function renderComparison(activeFlat) {
  const body = qs('#compareBody');
  if (!body) return;
  clear(body);
  const fields = getFields().slice(0, 3);
  const lang = getLang();
  // header
  const head = el('tr', {}, [el('th', { text: lang === 'bn' ? 'প্যারামিটার' : 'Parameter' })]);
  for (const f of fields) head.append(el('th', { text: f.name }));
  body.append(head);

  const rows = [
    ['Nitrogen', 'nitrogen', 'kg/ha'],
    ['Phosphorus', 'phosphorus', 'kg/ha'],
    ['Potassium', 'potassium', 'kg/ha'],
    ['pH Level', 'ph', ''],
    ['Health Score', '__score', ''],
  ];

  for (const [label, key, unit] of rows) {
    const tr = el('tr', {}, [el('td', { text: label })]);
    for (const f of fields) {
      let value = null;
      if (key === '__score') {
        const feats = f.id === (storageGet('soil.lastMeta', {})?.fieldId || '') ? activeFlat : storageGet(`soil.fieldFeatures.${f.id}`, activeFlat);
        value = healthScore(feats || activeFlat);
      } else {
        const feats = storageGet(`soil.fieldFeatures.${f.id}`, null) || activeFlat;
        value = feats?.[key];
      }
      tr.append(el('td', { text: value == null ? '—' : `${value}${unit ? ' ' + unit : ''}` }));
    }
    body.append(tr);
  }
}

function renderFertilizer(flat) {
  const list = qs('#doseList');
  if (!list) return;
  clear(list);
  const lang = getLang();
  const plan = [
    { name: 'Urea (N)', n: flat.nitrogen, optimal: FEATURE_META.nitrogen.optimal, emoji: '🌿' },
    { name: 'TSP (P)', n: flat.phosphorus, optimal: FEATURE_META.phosphorus.optimal, emoji: '🟤' },
    { name: 'MOP (K)', n: flat.potassium, optimal: FEATURE_META.potassium.optimal, emoji: '🔴' },
  ];
  for (const item of plan) {
    const need = item.n == null ? null : Math.max(0, Math.round(item.optimal[1] - Number(item.n)));
    list.append(
      el('div', { className: 'dose' }, [
        el('span', { text: item.emoji }),
        el('span', {}, [
          el('b', { text: item.name }),
          el('small', { className: 'muted', text: lang === 'bn' ? 'লাগতে পারে' : 'deficit-based estimate', style: 'display:block' }),
        ]),
        el('strong', { text: need == null ? '—' : `${need} kg/ha` }),
      ]),
    );
  }
  setText(qs('#doseCaveat'), lang === 'bn' ? 'সার পরিমাণ মাটি পরীক্ষার ফলাফল ও ফসলের ধাপ অনুযায়ী নিশ্চিত করুন।' : 'Confirm doses with a soil test and crop stage.');
}

async function renderCrops(district, upazila) {
  const row = qs('#cropRow');
  if (!row) return;
  clear(row);
  try {
    const { data } = await api.get(
      `/api/v1/soil/crop-recommendation/${encodeURIComponent(district)}/${encodeURIComponent(upazila)}`,
      { timeoutMs: 8000 },
    );
    const crops = data.seasonAdvice?.crops || data.recommendations?.map((r) => r.name) || [];
    if (!crops.length) {
      row.append(el('p', { className: 'muted', text: t('empty') }));
      return;
    }
    for (const c of crops) {
      row.append(el('div', { className: 'crop-tile' }, [el('span', { className: 'emoji', text: '🌾' }), document.createTextNode(c)]));
    }
    setText(qs('#cropSource'), data.source || 'rule-based baseline');
  } catch (err) {
    reportClientError(err, { component: 'soil-crops' });
    row.append(el('p', { className: 'muted', text: t('loadFailed') }));
  }
}

function bindFilters() {
  qs('#districtSelect')?.addEventListener('change', (ev) => {
    void loadUpazilas(ev.target.value);
  });
  qs('#viewReportBtn')?.addEventListener('click', () => {
    const district = qs('#districtSelect')?.value;
    const upazila = qs('#upazilaSelect')?.value;
    const error = qs('#filterError');
    if (!district || !upazila) {
      if (error) {
        error.hidden = false;
        error.textContent = getLang() === 'bn' ? 'জেলা ও উপজেলা বাছাই করুন' : 'Select district and upazila';
      }
      return;
    }
    if (error) error.hidden = true;
    void loadReport({ district, upazila });
  });
}

function bindFieldSelect() {
  qs('#fieldSelect')?.addEventListener('change', async (ev) => {
    const fieldId = ev.target.value;
    const meta = storageGet('soil.lastMeta', null);
    const flat = storageGet(`soil.fieldFeatures.${fieldId}`, storageGet('soil.lastFeatures', null));
    if (flat) {
      renderMetrics(flat, null);
      renderComparison(flat);
      renderFertilizer(flat);
    } else if (meta?.district && meta?.upazila) {
      await loadReport({ district: meta.district, upazila: meta.upazila });
    }
    storageSet(COMPARE_KEY, fieldId);
  });
}

function bindCompare() {
  qs('#compareBtn')?.addEventListener('click', () => {
    const panel = qs('#comparePanel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    qs('#compareBtn')?.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    const flat = storageGet('soil.lastFeatures', null);
    if (!panel.hidden) renderComparison(flat);
  });
}

function bindDownloadReport() {
  qs('#downloadReportBtn')?.addEventListener('click', () => {
    const lang = getLang();
    const meta = storageGet('soil.lastMeta', null);
    const flat = storageGet('soil.lastFeatures', null);
    if (!flat || !meta) {
      alert(lang === 'bn' ? 'আগে মাটি রিপোর্ট লোড করুন' : 'Load a soil report first');
      return;
    }
    const lines = [
      `Smart Farming AI — Soil Report`,
      `District: ${meta.district}`,
      `Upazila: ${meta.upazila}`,
      `Fetched: ${meta.fetchedAt}`,
      `Source: ${meta.source}`,
      '',
      ...Object.entries(flat).map(([k, v]) => `${k}: ${v}`),
      '',
      lang === 'bn' ? 'তথ্য যাচাই করে ব্যবহার করুন।' : 'Verify before use.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soil-report-${meta.district}-${meta.upazila}.txt`.replace(/\s+/g, '_');
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function bindReminder() {
  qs('#setReminderBtn')?.addEventListener('click', () => {
    if (!requireAuth(t('setReminder'))) return;
    const modal = qs('#reminderModal');
    if (modal) {
      modal.hidden = false;
      qs('#reminderDate')?.focus();
    }
  });
  qs('#reminderCancel')?.addEventListener('click', () => {
    const m = qs('#reminderModal');
    if (m) m.hidden = true;
  });
  qs('#reminderForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const date = qs('#reminderDate')?.value;
    const error = qs('#reminderError');
    if (!date || Number.isNaN(Date.parse(date))) {
      if (error) {
        error.hidden = false;
        error.textContent = getLang() === 'bn' ? 'সঠিক তারিখ দিন' : 'Enter a valid date';
      }
      return;
    }
    if (error) error.hidden = true;
    storageSet(REMINDER_KEY, { date, createdAt: new Date().toISOString() });
    renderReminder();
    qs('#reminderModal').hidden = true;
  });
}

function renderReminder() {
  const node = qs('#reminderBox');
  if (!node) return;
  const lang = getLang();
  const r = storageGet(REMINDER_KEY, null);
  clear(node);
  if (!r) {
    node.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  node.append(
    el('div', { style: 'font-size:25px', text: '◷' }),
    el('b', { text: formatDate(r.date) }),
    el('p', { className: 'muted', text: lang === 'bn' ? 'পরবর্তী মাটি পরীক্ষা রিমাইন্ডার' : 'Next soil test reminder' }),
    el('button', {
      type: 'button',
      className: 'btn btn-soft btn-tiny',
      text: lang === 'bn' ? 'মুছুন' : 'Clear',
      onClick: () => {
        storageSet(REMINDER_KEY, null);
        renderReminder();
      },
    }),
  );
}

function bindGeo() {
  qs('#locationBtn')?.addEventListener('click', () => {
    const err = qs('#locationError');
    if (!navigator.geolocation) {
      if (err) {
        err.hidden = false;
        err.textContent = getLang() === 'bn' ? 'অবস্থান সাপোর্ট নেই' : 'Geolocation unsupported';
      }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (err) err.hidden = true;
        try {
          const { latitude, longitude } = pos.coords;
          const { data } = await api.get(`/api/v1/soil/nearest?lat=${latitude}&lng=${longitude}`, { timeoutMs: 9000 });
          const districtSelect = qs('#districtSelect');
          if (districtSelect && data.district) {
            districtSelect.value = data.district;
            await loadUpazilas(data.district);
            const up = qs('#upazilaSelect');
            if (up && data.upazila) up.value = data.upazila;
          }
          if (data.district && data.upazila) await loadReport({ district: data.district, upazila: data.upazila });
        } catch (e) {
          reportClientError(e, { component: 'soil-geo' });
          if (err) {
            err.hidden = false;
            err.textContent = e.message || t('loadFailed');
          }
        }
      },
      (geoErr) => {
        if (err) {
          err.hidden = false;
          err.textContent = geoErr.message || 'Location permission denied';
        }
      },
      { timeout: 8000 },
    );
  });
}

export function initSoil() {
  bindShell();
  renderFieldSelect();
  bindFilters();
  bindFieldSelect();
  bindCompare();
  bindDownloadReport();
  bindReminder();
  bindGeo();
  renderReminder();
  qsa('a[href="#"]').forEach((a) => a.setAttribute('href', 'dashboard.html'));

  void loadDistricts();

  // Prefill from query if present
  const params = new URLSearchParams(location.search);
  if (params.get('district')) {
    const d = qs('#districtSelect');
    if (d) {
      d.value = params.get('district');
      void loadUpazilas(params.get('district')).then(() => {
        if (params.get('upazila') && qs('#upazilaSelect')) qs('#upazilaSelect').value = params.get('upazila');
      });
    }
  }

  document.addEventListener('sf:langchange', () => {
    applyI18n();
    renderReminder();
    const flat = storageGet('soil.lastFeatures', null);
    if (flat) {
      renderMetrics(flat, null);
      renderFertilizer(flat);
      renderComparison(flat);
    }
  });
}

if (typeof document !== 'undefined' && !globalThis.__SF_SOIL_INIT__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalThis.__SF_SOIL_INIT__ = true;
      initSoil();
    });
  } else {
    globalThis.__SF_SOIL_INIT__ = true;
    initSoil();
  }
}
