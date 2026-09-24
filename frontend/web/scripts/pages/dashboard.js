/** Dashboard controller: partial/full data, fields, tasks, notifications, irrigation. */

import { api } from '../api.js';
import { getLang, t, applyI18n } from '../i18n.js';
import { el, clear, setText, qs, qsa } from '../dom.js';
import { setState, State, isStale, isOffline } from '../states.js';
import { storageGet, storageSet } from '../storage.js';
import { formatTemp, formatPercent, formatCurrencyBdt, formatDateForLang } from '../format.js';
import { reportClientError } from '../telemetry.js';
import { bindShell, requireAuth, isAuthenticated, openAuthModal, setUserChip } from '../shell.js';
import { withOptimistic } from '../optimistic.js';

const TASKS_KEY = 'dashboard.tasks';
const DEFAULT_TASKS = [
  { id: 't1', time: '06:00', title: { bn: 'মাঠ A-তে সেচ পরীক্ষা', en: 'Check Field A irrigation' }, done: false },
  { id: 't2', time: '09:00', title: { bn: 'মাঠ B-তে পোকা পরীক্ষা', en: 'Inspect Field B for pests' }, done: false },
  { id: 't3', time: '11:00', title: { bn: 'ইউরিয়া প্রয়োগ', en: 'Apply urea to Field D' }, done: false },
  { id: 't4', time: '14:00', title: { bn: 'পানির লেভেল দেখুন', en: 'Check water level' }, done: false },
  { id: 't5', time: '16:00', title: { bn: 'বৃষ্টির জন্য প্রস্তুতি', en: 'Prepare for heavy rain' }, done: false },
];

function loadTasks() {
  const saved = storageGet(TASKS_KEY, null);
  if (Array.isArray(saved) && saved.length) return saved;
  return DEFAULT_TASKS.map((x) => ({ ...x }));
}

function saveTasks(tasks) {
  storageSet(TASKS_KEY, tasks);
}

/**
 * Pull the server copy of the task list when there is a session. Local
 * storage stays the source of truth for guests, so the widget never fails
 * just because the API is unreachable.
 */
async function syncTasksFromServer() {
  if (!isAuthenticated()) return;
  try {
    const { data } = await api.get('/api/v1/tasks', { timeoutMs: 6000 });
    if (data?.synced === false) return;
    const remote = Array.isArray(data?.tasks) ? data.tasks : [];
    if (remote.length) {
      saveTasks(remote);
      renderTasks();
    }
  } catch (err) {
    reportClientError(err, { component: 'task-sync', console: true });
  }
}

function renderTasks() {
  const list = qs('#taskList');
  const counter = qs('#taskCount');
  if (!list) return;
  const tasks = loadTasks();
  const lang = getLang();
  clear(list);
  if (!tasks.length) {
    list.append(el('p', { className: 'muted', text: t('empty') }));
    if (counter) counter.textContent = '0';
    return;
  }
  for (const task of tasks) {
    const title = typeof task.title === 'object' ? task.title[lang] || task.title.en : task.title;
    const input = el('input', {
      type: 'checkbox',
      checked: task.done || false,
      'aria-label': title,
      onChange: (ev) => void toggleTask(task.id, ev.target.checked, ev.target),
    });
    const label = el('label', { className: 'task', dataset: { taskId: task.id } }, [
      el('time', { text: task.time }),
      input,
      el('span', {}, [el('b', { text: title }), el('small', { text: task.done ? (lang === 'bn' ? 'সম্পন্ন' : 'Done') : (lang === 'bn' ? 'বাকি' : 'Pending') })]),
    ]);
    list.append(label);
  }
  if (counter) counter.textContent = String(tasks.filter((x) => x.done).length) + '/' + tasks.length;
}

async function toggleTask(id, done, checkbox) {
  const tasks = loadTasks();
  const snapshot = () => loadTasks();
  const result = await withOptimistic({
    snapshot,
    apply: () => {
      const next = tasks.map((x) => (x.id === id ? { ...x, done } : x));
      saveTasks(next);
      renderTasks();
    },
    rollback: () => {
      renderTasks();
      if (checkbox) checkbox.checked = !done;
    },
    mutation: async () => {
      // Persist locally always; server sync when authenticated
      if (isAuthenticated()) {
        try {
          const task = loadTasks().find((x) => x.id === id);
          if (task) await api.post('/api/v1/tasks', { task: { ...task, done } }, { timeoutMs: 5000 });
        } catch (err) {
          // Local persistence already succeeded — surface soft error only
          reportClientError(err, { component: 'task-sync', console: true });
        }
      }
      return true;
    },
    onError: (err) => reportClientError(err, { component: 'task-optimistic' }),
  });
  if (!result.ok) renderTasks();
}

function bindMarkComplete() {
  const btn = qs('#markTasksComplete');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const list = qs('#taskList');
    if (!list) return;
    const checked = qsa('input[type="checkbox"]:checked', list);
    const tasks = loadTasks();
    const ids = new Set(
      checked.map((c) => c.closest('[data-task-id]')?.getAttribute('data-task-id')).filter(Boolean),
    );
    if (!ids.size) return;
    const next = tasks.map((x) => (ids.has(x.id) ? { ...x, done: true } : x));
    saveTasks(next);
    renderTasks();
  });
}

async function loadWeather() {
  const node = qs('#weatherCard');
  if (!node) return;
  const lang = getLang();
  setState(node, State.LOADING, { lang });
  try {
    const { data } = await api.get('/api/v1/weather?lat=23.81&lng=90.41&lang=' + lang, { timeoutMs: 10000 });
    const c = data.current;
    setText(qs('#weatherTemp'), formatTemp(c.temp));
    setText(qs('#weatherCondition'), c.condition);
    setText(qs('#weatherHumidity'), formatPercent(c.humidity, { digits: 0 }));
    setText(qs('#weatherWind'), `${Math.round(c.wind)} km/h`);
    setText(qs('#weatherIcon'), c.icon || '🌤');
    const days = qs('#forecastDays');
    if (days) {
      clear(days);
      for (const day of (data.forecast || []).slice(0, 7)) {
        days.append(
          el('div', { className: 'day' }, [
            el('b', { text: day.dayShort }),
            el('div', { className: 'wx', text: day.icon }),
            el('strong', { text: day.temp }),
            el('br'),
            el('span', { text: `${day.precipitationProbability}%` }),
          ]),
        );
      }
    }
    setText(qs('#headingDate'), formatDateForLang(new Date().toISOString(), lang));
    setState(node, State.READY, { lang });
    node.dataset.fetchedAt = new Date().toISOString();
    setText(qs('#heroHeadingMeta'), `${c.temp}°C · ${c.condition}`);
  } catch (err) {
    reportClientError(err, { component: 'dash-weather' });
    const stale = node.dataset.fetchedAt;
    setState(node, isOffline() ? State.OFFLINE : State.ERROR, {
      message: isOffline() ? t('offline') : t('loadFailed'),
      lang,
      retry: loadWeather,
    });
    if (stale && isStale(stale)) node.dataset.stale = '1';
  }
}

async function loadMarketMini() {
  const node = qs('#marketMini');
  if (!node) return;
  const lang = getLang();
  setState(node, State.LOADING, { lang });
  try {
    const { data } = await api.get('/api/v1/market/prices', { timeoutMs: 9000 });
    const entries = Object.entries(data.prices || {}).slice(0, 4);
    clear(node);
    if (!entries.length) {
      setState(node, State.EMPTY, { lang });
      node.append(el('p', { className: 'muted', text: t('empty') }));
      return;
    }
    for (const [id, row] of entries) {
      node.append(
        el('div', {}, [
          el('span', { text: row.name || id }),
          el('b', { text: formatCurrencyBdt(row.minPrice) }),
        ]),
      );
    }
    setState(node, State.READY, { lang });
  } catch (err) {
    reportClientError(err, { component: 'dash-market' });
    setState(node, State.ERROR, { message: t('loadFailed'), lang, retry: loadMarketMini });
  }
}

async function loadNotifications(_open = false) {
  const panel = qs('#notificationsPanel');
  const badge = qs('#notifBadge');
  if (!panel) return;
  const lang = getLang();
  if (!isAuthenticated()) {
    setState(panel, State.UNAUTHORIZED, {
      message: t('authRequired'),
      lang,
      retry: () => openAuthModal(t('notifications')),
    });
    if (badge) badge.hidden = true;
    return;
  }
  setState(panel, State.LOADING, { lang });
  try {
    const { data } = await api.get('/api/v1/notifications', { timeoutMs: 8000 });
    const items = data.items || data.notifications || [];
    clear(panel);
    if (badge) {
      badge.hidden = items.length === 0;
      badge.textContent = String(items.length);
    }
    if (!items.length) {
      setState(panel, State.EMPTY, { lang });
      panel.append(el('p', { className: 'muted', text: t('empty') }));
      return;
    }
    for (const item of items) {
      const title = (lang === 'bn' && item.message_bn) || item.title || item.message || item.body || '—';
      panel.append(
        el('div', { className: 'activity-row' }, [
          el('span', { text: title }),
          el('time', { text: item.created_at || '' }),
        ]),
      );
    }
    setState(panel, State.READY, { lang });
  } catch (err) {
    reportClientError(err, { component: 'dash-notifications' });
    if (badge) badge.hidden = true;
    setState(panel, err.status === 401 ? State.UNAUTHORIZED : State.ERROR, {
      message: err.message || t('loadFailed'),
      lang,
      retry: () => loadNotifications(true),
    });
  }
}

/**
 * Irrigation honesty: only show control when a device is linked.
 * Without hardware we never fake "running".
 */
async function loadIrrigation() {
  const node = qs('#irrigationCard');
  if (!node) return;
  const lang = getLang();
  const status = qs('#irrigationStatus');
  const toggle = qs('#irrigationSwitch');
  const manage = qs('#irrigationManage');

  setState(node, State.LOADING, { lang });
  try {
    if (!isAuthenticated()) {
      throw Object.assign(new Error(t('authRequired')), { status: 401, code: 'unauthorized' });
    }
    const { data } = await api.get('/api/v1/devices', { timeoutMs: 8000 });
    const devices = data.devices || data.items || [];
    const irrigationDevice = devices.find(
      (d) => /irrigat|valve|pump|সেচ/i.test(String(d.type || d.kind || d.name || '')),
    );

    if (!irrigationDevice) {
      if (toggle) {
        toggle.disabled = true;
        toggle.classList.remove('on');
        toggle.setAttribute('aria-checked', 'false');
        toggle.title = t('irrigationUnavailable');
      }
      if (status) status.textContent = t('irrigationNoDevice');
      if (manage) manage.disabled = true;
      setState(node, State.UNAVAILABLE, { message: t('irrigationUnavailable'), lang });
      node.dataset.device = 'none';
      return;
    }

    if (toggle) {
      toggle.disabled = false;
      toggle.classList.toggle('on', irrigationDevice.state === 'on' || irrigationDevice.status === 'on');
      toggle.setAttribute('aria-checked', toggle.classList.contains('on') ? 'true' : 'false');
      toggle.dataset.deviceId = irrigationDevice.id;
    }
    if (status) status.textContent = irrigationDevice.state || irrigationDevice.status || '—';
    if (manage) manage.disabled = false;
    setState(node, State.READY, { lang });
    node.dataset.device = irrigationDevice.id;
  } catch (err) {
    reportClientError(err, { component: 'dash-irrigation' });
    if (toggle) {
      toggle.disabled = true;
      toggle.classList.remove('on');
      toggle.title = t('irrigationUnavailable');
    }
    if (status) status.textContent = t('irrigationUnavailable');
    if (manage) manage.disabled = true;
    setState(node, err.status === 401 ? State.UNAUTHORIZED : State.UNAVAILABLE, {
      message: err.status === 401 ? t('authRequired') : t('irrigationUnavailable'),
      lang,
      retry: () => loadIrrigation(),
    });
    node.dataset.device = 'none';
  }
}

async function loadSensors() {
  const node = qs('#sensorCard');
  if (!node) return;
  const lang = getLang();
  setState(node, State.LOADING, { lang });
  try {
    if (!isAuthenticated()) throw Object.assign(new Error('auth'), { status: 401 });
    const { data } = await api.get('/api/v1/sensors/summary', { timeoutMs: 8000 });
    const online = data.online ?? 0;
    const total = data.total ?? 0;
    setText(qs('#sensorCount'), `${online} / ${total}`);
    setText(qs('#sensorLabel'), total ? (lang === 'bn' ? 'অনলাইন' : 'Online') : t('noSensors'));
    if (!total) {
      setState(node, State.EMPTY, { message: t('noSensors'), lang });
      return;
    }
    setState(node, State.READY, { lang });
  } catch (err) {
    reportClientError(err, { component: 'dash-sensors' });
    setText(qs('#sensorCount'), '—');
    setText(qs('#sensorLabel'), err.status === 401 ? t('unauthorized') : t('empty'));
    setState(node, err.status === 401 ? State.UNAUTHORIZED : State.EMPTY, {
      message: err.status === 401 ? t('authRequired') : t('noSensors'),
      lang,
      retry: loadSensors,
    });
  }
}

async function loadFields() {
  const node = qs('#fieldsPanel');
  if (!node) return;
  const lang = getLang();
  setState(node, State.LOADING, { lang });
  try {
    if (!isAuthenticated()) throw Object.assign(new Error('auth'), { status: 401 });
    const { data } = await api.get('/api/v1/farms', { timeoutMs: 8000 });
    const farms = data.farms || data.items || [];
    const overlay = qs('#fieldMapOverlays');
    if (overlay) {
      clear(overlay);
      if (!farms.length) {
        setState(node, State.EMPTY, { message: t('noFields'), lang });
        overlay.append(el('p', { className: 'muted', text: t('noFields') }));
        return;
      }
      const classes = ['a', 'b', 'c'];
      farms.slice(0, 3).forEach((farm, i) => {
        overlay.append(
          el('div', { className: `field-outline ${classes[i] || 'a'}` }, [
            document.createTextNode(`${farm.name || farm.id} `),
            el('br'),
            el('small', { text: `${farm.area_acres ?? '—'} ac · ${farm.crop || '—'}` }),
          ]),
        );
      });
    }
    setState(node, State.READY, { lang });
  } catch (err) {
    reportClientError(err, { component: 'dash-fields' });
    if (err.status === 401) {
      setState(node, State.UNAUTHORIZED, {
        message: t('authRequired'),
        lang,
        retry: () => openAuthModal(t('fields')),
      });
    } else {
      setState(node, State.ERROR, { message: t('loadFailed'), lang, retry: loadFields });
    }
  }
}

function bindNotificationsButton() {
  const btn = qs('#notificationsBtn');
  const panel = qs('#notificationsPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) void loadNotifications(true);
  });
}

function bindIrrigationSwitch() {
  const toggle = qs('#irrigationSwitch');
  if (!toggle) return;
  toggle.addEventListener('click', async () => {
    if (toggle.disabled || !toggle.dataset.deviceId) return;
    if (!requireAuth(t('irrigation'))) return;
    const wasOn = toggle.classList.contains('on');
    // optimistic
    toggle.classList.toggle('on', !wasOn);
    toggle.setAttribute('aria-checked', toggle.classList.contains('on') ? 'true' : 'false');
    try {
      await api.post(
        `/api/v1/devices/${encodeURIComponent(toggle.dataset.deviceId)}/command`,
        { command: wasOn ? 'irrigation_off' : 'irrigation_on' },
        { timeoutMs: 6000 },
      );
    } catch (err) {
      toggle.classList.toggle('on', wasOn);
      toggle.setAttribute('aria-checked', wasOn ? 'true' : 'false');
      reportClientError(err, { component: 'irrigation-command' });
      const status = qs('#irrigationStatus');
      if (status) status.textContent = err.message || t('loadFailed');
    }
  });
}

function bindSearch() {
  const input = qs('#commandSearch');
  if (!input) return;
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;
      location.href = `ai-search.html?q=${encodeURIComponent(q)}`;
    }
  });
}

export function initDashboard() {
  bindShell();
  setUserChip();
  const guest = storageGet('user', null);
  setText(qs('#greetName'), guest?.name || guest?.email || (getLang() === 'bn' ? 'কৃষক' : 'Farmer'));
  renderTasks();
  bindMarkComplete();
  bindNotificationsButton();
  bindIrrigationSwitch();
  bindSearch();

  void loadWeather();
  void loadMarketMini();
  void loadFields();
  void loadIrrigation();
  void loadSensors();
  void loadNotifications(false);
  void syncTasksFromServer();

  document.addEventListener('sf:langchange', () => {
    applyI18n();
    renderTasks();
    void loadWeather();
    void loadIrrigation();
    void loadSensors();
  });
  document.addEventListener('sf:auth', () => {
    void loadFields();
    void loadIrrigation();
    void loadSensors();
    void loadNotifications(false);
    void syncTasksFromServer();
    setUserChip();
    const guest = storageGet('user', null);
    setText(qs('#greetName'), guest?.name || guest?.email || (getLang() === 'bn' ? 'কৃষক' : 'Farmer'));
  });
}

if (typeof document !== 'undefined' && !globalThis.__SF_DASH_INIT__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalThis.__SF_DASH_INIT__ = true;
      initDashboard();
    });
  } else {
    globalThis.__SF_DASH_INIT__ = true;
    initDashboard();
  }
}
