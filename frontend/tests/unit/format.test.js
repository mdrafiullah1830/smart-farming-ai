import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toBanglaDigits,
  formatNumber,
  formatCurrencyBdt,
  formatTemp,
  formatPercent,
  formatDistanceKm,
  kgHaToKgAcre,
  hectaresToAcres,
  acresToHectares,
  metresToFeet,
  formatDate,
  formatRelativeTime,
  formatDateTime,
  formatBytes,
  round,
  localizeNumeral,
  formatDateForLang,
} from '../../web/scripts/format.js';

describe('format helpers', () => {
  it('converts digits to Bangla', () => {
    assert.equal(toBanglaDigits('42'), '৪২');
    assert.equal(toBanglaDigits('abc'), 'abc');
  });

  it('formats numbers with null/NaN as em dash', () => {
    assert.equal(formatNumber(null), '—');
    assert.equal(formatNumber('x'), '—');
    assert.equal(formatNumber(1234.56, { maximumFractionDigits: 1 }), '1,234.6');
  });

  it('formats BDT currency with taka sign', () => {
    assert.equal(formatCurrencyBdt(null), '—');
    assert.equal(formatCurrencyBdt(100), '৳ 100.00');
  });

  it('formats temperature C and F', () => {
    assert.equal(formatTemp(null), '—');
    assert.equal(formatTemp(28.4), '28°C');
    assert.equal(formatTemp(0, { unit: 'F' }), '32°F');
  });

  it('formats percent with optional sign', () => {
    assert.equal(formatPercent(null), '—');
    assert.equal(formatPercent(5.25), '5.3%');
    assert.equal(formatPercent(-3, { sign: true }), '−3.0%');
    assert.equal(formatPercent(3, { sign: true }), '+3.0%');
  });

  it('formats distances under 1 km as metres', () => {
    assert.equal(formatDistanceKm(0.4), '400 m');
    assert.equal(formatDistanceKm(12.5), '12.5 km');
    assert.equal(formatDistanceKm(null), '—');
  });

  it('converts land units', () => {
    assert.equal(kgHaToKgAcre(247.10538), '100.0');
    assert.equal(kgHaToKgAcre(null), null);
    assert.equal(hectaresToAcres(1), '2.47');
    assert.equal(acresToHectares(2.4710538), '1.00');
    assert.equal(metresToFeet(3.048), '10.0');
  });

  it('formats dates in Dhaka timezone', () => {
    assert.equal(formatDate(null), '—');
    assert.equal(formatDate('not-a-date'), '—');
    const out = formatDate('2026-09-15T12:00:00Z');
    assert.match(out, /15\s+Sept?\s+2026/);
    assert.equal(formatDateForLang('2026-09-15T12:00:00Z', 'bn'), formatDate('2026-09-15T12:00:00Z', { locale: 'bn-BD' }));
  });

  it('formats relative time', () => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    assert.equal(formatRelativeTime(null), '—');
    assert.equal(formatRelativeTime('2026-09-15T11:59:30Z', now), 'just now');
    assert.equal(formatRelativeTime('2026-09-15T11:30:00Z', now), '30m ago');
    assert.equal(formatRelativeTime('2026-09-15T09:00:00Z', now), '3h ago');
    assert.equal(formatRelativeTime('2026-09-13T12:00:00Z', now), '2d ago');
  });

  it('formats datetime and bytes', () => {
    assert.equal(formatDateTime(null), '—');
    assert.match(formatDateTime('2026-09-15T12:00:00Z'), /15/);
    assert.equal(formatBytes(null), '—');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  });

  it('rounds and localizes numerals', () => {
    assert.equal(round(null), null);
    assert.equal(round(3.14159, 2), 3.14);
    assert.equal(localizeNumeral('10', 'bn'), '১০');
    assert.equal(localizeNumeral('10', 'en'), '10');
  });
});
