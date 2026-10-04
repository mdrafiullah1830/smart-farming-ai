/**
 * Flood & Climate Resilience panel on the dashboard.
 *
 * The API returns a risk level, the reasons behind it, and a decision window.
 * All three are rendered: the reason is what makes the number checkable, and
 * the window is the part a farmer can act on. Everything goes through dom.js
 * helpers, so a crop name a farmer typed is inserted as text, never as markup.
 *
 * When the API cannot be reached the panel says so and shows no numbers. A
 * flood panel that quietly displayed a stale "low risk" would be worse than no
 * panel at all.
 */

import { flood, getCredentials } from '../api.js';
import { t, applyI18n, getLang } from '../i18n.js';
import { el, qs, replaceChildren } from '../dom.js';
import { setState, State } from '../states.js';
import { reportClientError } from '../telemetry.js';

const panel = qs('#floodPanel');
const summaryNode = qs('#floodSummary');
const listNode = qs('#floodExposureList');
const seasonNode = qs('#floodSeason');

/** Levels ordered worst-first; the list is sorted by the API but a caller may not be. */
const LEVEL_META = {
  severe: { icon: '🛑', key: 'floodLevelSevere', cls: 'flood-severe' },
  high: { icon: '⚠️', key: 'floodLevelHigh', cls: 'flood-high' },
  moderate: { icon: '🌧️', key: 'floodLevelModerate', cls: 'flood-moderate' },
  low: { icon: '✅', key: 'floodLevelLow', cls: 'flood-low' },
};

const SEASON_LABEL = {
  boro: { bn: 'বোরো মৌসুম', en: 'Boro season' },
  aman: { bn: 'আমন মৌসুম', en: 'Aman season' },
  aus: { bn: 'আউস মৌসুম', en: 'Aus season' },
};

function taka(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `৳${n.toLocaleString('en-IN')}` : '—';
}

function area(acres) {
  const n = Number(acres);
  return Number.isFinite(n) ? `${n} একর` : '—';
}

export function renderFloodPanel(assessment) {
  if (!panel || !summaryNode || !listNode) return;
  const lang = getLang();

  if (seasonNode) {
    const season = assessment?.season;
    seasonNode.textContent = season ? (SEASON_LABEL[season]?.[lang] || season) : '';
  }

  const exposures = Array.isArray(assessment?.exposures) ? assessment.exposures : [];
  if (!exposures.length) {
    setState(panel, State.EMPTY);
    replaceChildren(summaryNode, el('p', { className: 'muted', text: t('floodNoExposure') }));
    replaceChildren(listNode);
    return;
  }

  // A forecast outage must not read as "all clear". Say it, and still show the
  // static half of the assessment, which does not depend on the forecast.
  const summaryBits = [];
  if (assessment.forecastAvailable === false) {
    summaryBits.push(el('p', { className: 'muted flood-forecast-missing', text: t('floodForecastMissing') }));
  }
  summaryBits.push(el('p', {
    className: 'muted',
    text: `${t('floodAtRisk')} ${taka(assessment.totalAtRiskTaka)}`,
  }));

  const worst = exposures[0];
  const meta = LEVEL_META[worst?.level] || LEVEL_META.low;
  summaryBits.unshift(el('div', { className: `flood-headline ${meta.cls}` }, [
    el('span', { className: 'flood-headline-icon', text: meta.icon }),
    el('div', {}, [
      el('strong', { text: t(meta.key) }),
      el('p', {
        className: 'flood-window',
        // The deadline is the actionable part of the whole feature.
        text: lang === 'en' ? worst?.actionWindowEn || '' : worst?.actionWindowBn || '',
      }),
    ]),
  ]));

  replaceChildren(summaryNode, ...summaryBits);

  const rows = exposures.map((exposure) => {
    const m = LEVEL_META[exposure.level] || LEVEL_META.low;
    const reasons = lang === 'en' ? exposure.reasons_en || [] : exposure.reasons_bn || [];
    return el('article', { className: `flood-row ${m.cls}` }, [
      el('div', { className: 'flood-row-head' }, [
        el('span', { className: 'flood-level', text: `${m.icon} ${t(m.key)}` }),
        el('span', { className: 'muted', text: lang === 'en' ? exposure.zoneNameEn : exposure.zoneNameBn }),
      ]),
      el('p', { className: 'flood-crop' }, [
        el('b', { text: exposure.zoneNameEn ? '' : '' }),
        el('span', { text: area(exposure.areaAcres) }),
      ]),
      reasons.length
        ? el('ul', { className: 'flood-reasons' }, reasons.map((reason) => el('li', { text: reason })))
        : null,
      exposure.atRiskTaka > 0
        ? el('p', { className: 'muted', text: `${t('floodAtRisk')}: ${taka(exposure.atRiskTaka)}` })
        : null,
    ].filter(Boolean));
  });

  replaceChildren(listNode, ...rows);
  setState(panel, State.READY);
}

/**
 * Load and render. Called on dashboard boot.
 */
export async function loadFloodPanel() {
  if (!panel) return;

  if (!getCredentials()?.token) {
    setState(panel, State.EMPTY);
    replaceChildren(summaryNode, el('p', { className: 'muted', text: t('floodSignInPrompt') }));
    replaceChildren(listNode);
    return;
  }

  try {
    const { data } = await flood.assessment({ timeoutMs: 12000 });
    renderFloodPanel(data);
    applyI18n();
  } catch (error) {
    setState(panel, State.ERROR);
    replaceChildren(summaryNode, el('p', { className: 'muted', text: t('floodUnavailable') }));
    replaceChildren(listNode);
    reportClientError('flood_assessment', error);
  }
}