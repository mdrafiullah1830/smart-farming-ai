/**
 * Irrigation advice for the dashboard card.
 *
 * The API returns a status, both-language copy, and the volume in whole litres.
 * All three render: the status is the decision, the copy is the reasoning, and
 * the litres are what makes it a water plan rather than a yes/no.
 *
 * "No reading" is a real state and is shown as one. Rendering it as "adequate"
 * would tell a farmer their dry field is fine.
 */

import { irrigation } from '../api.js';
import { t, getLang } from '../i18n.js';
import { el, qs, replaceChildren } from '../dom.js';
import { setState, State } from '../states.js';
import { reportClientError } from '../telemetry.js';

const STATUS_META = {
  needs_water: { icon: '💧', key: 'irrigationNeedsWater', cls: 'irr-needs' },
  watch: { icon: '👀', key: 'irrigationWatch', cls: 'irr-watch' },
  adequate: { icon: '✅', key: 'irrigationAdequate', cls: 'irr-adequate' },
  no_reading: { icon: '—', key: 'irrigationNoReading', cls: 'irr-noreading' },
  // An unknown crop is not the same as a missing probe, so it gets its own copy
  // rather than borrowing the no-reading message and misleading the farmer.
  no_requirement: { icon: '—', key: 'irrigationNoRequirement', cls: 'irr-noreading' },
};

function litres(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('en-IN') : '—';
}

export function renderIrrigationAdvice(payload) {
  const box = qs('#irrigationAdvice');
  if (!box) return;

  const advice = payload?.advice;
  if (!advice) {
    setState(box, State.EMPTY);
    replaceChildren(box, el('p', { className: 'muted', text: t('irrigationNoReading') }));
    return;
  }

  const lang = getLang();
  const meta = STATUS_META[advice.status] || STATUS_META.no_reading;

  const parts = [
    el('div', { className: `irrigation-headline ${meta.cls}` }, [
      el('span', { className: 'irrigation-headline-icon', text: meta.icon }),
      el('div', {}, [
        el('strong', { text: lang === 'en' ? advice.headlineEn : advice.headlineBn }),
        el('p', { className: 'muted', text: lang === 'en' ? advice.detailEn : advice.detailBn }),
      ]),
    ]),
  ];

  // The requirement figures are advisory. Saying so on the card is the honest
  // thing, and it is why the API labels them too.
  if (advice.mmPerDay) {
    parts.push(el('p', { className: 'muted irrigation-basis' }, [
      el('span', {
        text: lang === 'en'
          ? `Guidance: ${advice.mmPerDay} mm/day at the ${advice.stage} stage, ${advice.litresPerDay ? `${litres(advice.litresPerDay)} L/day for this field` : 'area unknown'} — a published crop-stage figure, not a measurement of your field`
          : `নির্দেশনা: ${advice.stage} ধাপে ${advice.mmPerDay} মিমি/দিন${advice.litresPerDay ? `, এই জমিতে ${litres(advice.litresPerDay)} লিটার/দিন` : ''} — প্রকাশিত ফসল-ধাপের হিসাব, আপনার জমির পরিমাপ নয়`,
      }),
    ]));
  }

  replaceChildren(box, ...parts);
  setState(box, advice.status === 'no_reading' || advice.status === 'no_requirement' ? State.EMPTY : State.READY);
}

/**
 * Load the advice. Called on dashboard boot and on auth change, because the
 * sensor reading it depends on is the farmer's own.
 */
export async function loadIrrigationAdvice() {
  const box = qs('#irrigationAdvice');
  if (!box) return;

  try {
    const { data } = await irrigation.advice({ crop: 'Rice', season: 'boro', days_since_sowing: 60 });
    renderIrrigationAdvice(data);
  } catch (error) {
    // No advice is better than a wrong one, so the block says nothing is known.
    setState(box, State.ERROR);
    replaceChildren(box, el('p', { className: 'muted', text: t('irrigationAdviceUnavailable') }));
    reportClientError('irrigation_advice', error);
  }
}