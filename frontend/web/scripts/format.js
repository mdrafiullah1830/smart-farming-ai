/** Formatting and unit conversion helpers (locale-aware for bn/en). */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatNumber(value, { locale = 'en-US', maximumFractionDigits = 1 } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(Number(value));
}

export function formatCurrencyBdt(value, { locale = 'en-US', digits = 2 } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
  return `৳ ${formatted}`;
}

export function formatTemp(celsius, { unit = 'C' } = {}) {
  if (celsius == null || Number.isNaN(Number(celsius))) return '—';
  const c = Number(celsius);
  if (unit === 'F') return `${Math.round((c * 9) / 5 + 32)}°F`;
  return `${Math.round(c)}°C`;
}

export function formatPercent(value, { digits = 1, sign = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n).toFixed(digits);
  const prefix = sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : '';
  return `${prefix}${abs}%`;
}

export function formatDistanceKm(km) {
  if (km == null || Number.isNaN(Number(km))) return '—';
  const n = Number(km);
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${formatNumber(n, { maximumFractionDigits: 1 })} km`;
}

/** Convert kilograms to acres-scale rate: kg/ha → kg/acre */
export function kgHaToKgAcre(kgPerHa) {
  if (kgPerHa == null || Number.isNaN(Number(kgPerHa))) return null;
  return (Number(kgPerHa) / 2.4710538).toFixed(1);
}

/** Convert hectares to acres */
export function hectaresToAcres(ha) {
  if (ha == null || Number.isNaN(Number(ha))) return null;
  return (Number(ha) * 2.4710538).toFixed(2);
}

/** Convert acres to hectares */
export function acresToHectares(acres) {
  if (acres == null || Number.isNaN(Number(acres))) return null;
  return (Number(acres) / 2.4710538).toFixed(2);
}

/** metres to feet */
export function metresToFeet(m) {
  if (m == null || Number.isNaN(Number(m))) return null;
  return (Number(m) * 3.28084).toFixed(1);
}

export function formatDate(iso, { locale = 'en-GB', timeZone = 'Asia/Dhaka' } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(d);
}

export function formatRelativeTime(iso, now = Date.now()) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDateTime(iso, { locale = 'en-GB', timeZone = 'Asia/Dhaka' } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(d);
}

/** human file size */
export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function round(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const f = 10 ** digits;
  return Math.round(Number(value) * f) / f;
}

/** Localize a number string for display given language */
export function localizeNumeral(value, lang = 'en') {
  const s = String(value ?? '');
  return lang === 'bn' ? toBanglaDigits(s) : s;
}

export function formatDateForLang(iso, lang = 'en') {
  return formatDate(iso, { locale: lang === 'bn' ? 'bn-BD' : 'en-GB' });
}
