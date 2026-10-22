/* =========================================================
   Hishab — shared utilities (dates, money, formatting)
   ========================================================= */

export const BDT = '৳';

const BN_DIGITS = {
  '০': 0, '১': 1, '২': 2, '৩': 3, '৪': 4,
  '৫': 5, '৬': 6, '৭': 7, '৮': 8, '৯': 9,
};

export function bnToEn(value) {
  return String(value ?? '').replace(/[০-৯]/g, (d) => String(BN_DIGITS[d] ?? d));
}

export function uid(prefix = 't') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Parse a money-ish value. Handles 1,234.50 / (1,200) / 1.200,50 / ৳ / Dr-Cr. */
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw == null) return 0;
  let s = bnToEn(String(raw)).trim();
  if (!s) return 0;

  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  s = s.replace(/\s|\u00a0/g, '');
  s = s.replace(/(?:cr|dr)\.?$/i, '');
  s = s.replace(/[^0-9.,+\-]/g, '');
  if (s.includes('-')) sign = -1;
  s = s.replace(/[+\-]/g, '');
  if (!s) return 0;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      s = parts.join('.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return sign * n;
}

/* ------------------------------ money ------------------------------ */
export function fmtMoney(value, opts = {}) {
  const n = Number(value) || 0;
  const symbol = opts.symbol ?? BDT;
  const abs = Math.abs(n);
  const decimals = opts.decimals ?? (Math.round(abs * 100) % 100 === 0 ? 0 : 2);
  const body = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  }).format(abs);
  const sign = n < 0 ? '-' : (opts.sign && n > 0 ? '+' : '');
  return `${sign}${symbol}${body}`;
}

export function fmtCompact(value, opts = {}) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const symbol = opts.symbol === false ? '' : BDT;
  let out;
  if (abs >= 1e7) out = `${trimZero(abs / 1e7)}Cr`;
  else if (abs >= 1e5) out = `${trimZero(abs / 1e5)}L`;
  else if (abs >= 1e3) out = `${trimZero(abs / 1e3)}k`;
  else out = `${trimZero(abs)}`;
  return `${n < 0 ? '-' : ''}${symbol}${out}`;
}

function trimZero(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function pct(part, whole) {
  if (!whole) return 0;
  return (Number(part) / Number(whole)) * 100;
}

/* ------------------------------ dates ------------------------------ */
export function todayISO() {
  return isoOf(new Date());
}

export function isoOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function addDaysISO(iso, days) {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

export function diffDays(from, to) {
  const a = parseISO(from);
  const b = parseISO(to);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

export function startOfWeekISO(iso) {
  const d = parseISO(iso);
  if (!d) return iso;
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return isoOf(d);
}

export function endOfWeekISO(iso) {
  return addDaysISO(startOfWeekISO(iso), 6);
}

export function endOfMonthISO(iso) {
  const d = parseISO(iso);
  if (!d) return iso;
  return isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function daysInMonth(iso) {
  const d = parseISO(iso);
  if (!d) return 30;
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_BN = ['জানু', 'ফেব', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলা', 'আগ', 'সেপ', 'অক্টো', 'নভে', 'ডিসে'];
const MONTHS_FULL_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const MONTH_LOOKUP = {
  jan: 0, january: 0, জানু: 0, জানুয়ারি: 0,
  feb: 1, february: 1, ফেব: 1, ফেব্রুয়ারি: 1,
  mar: 2, march: 2, মার্চ: 2,
  apr: 3, april: 3, এপ্রি: 3, এপ্রিল: 3,
  may: 4, মে: 4,
  jun: 5, june: 5, জুন: 5,
  jul: 6, july: 6, জুলা: 6, জুলাই: 6,
  aug: 7, august: 7, আগ: 7, আগস্ট: 7,
  sep: 8, sept: 8, september: 8, সেপ: 8, সেপ্টেম্বর: 8,
  oct: 9, october: 9, অক্টো: 9, অক্টোবর: 9,
  nov: 10, november: 10, নভে: 10, নভেম্বর: 10,
  dec: 11, december: 11, ডিসে: 11, ডিসেম্বর: 11,
};

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_EN_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
const WEEKDAYS_BN_FULL = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

function year4(value) {
  let y = Number(value);
  if (!Number.isFinite(y)) return NaN;
  if (y < 100) y += y < 70 ? 2000 : 1900;
  return y;
}

function monthIndex(name) {
  const key = String(name || '').toLowerCase().replace(/\.$/, '');
  return key in MONTH_LOOKUP ? MONTH_LOOKUP[key] : -1;
}

function makeISO(y, m, d) {
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 12);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return isoOf(dt);
}

/** Parse almost any statement date into YYYY-MM-DD (or null). */
export function parseDateAny(raw) {
  if (raw instanceof Date) return isoOf(raw);
  if (!raw) return null;
  let s = bnToEn(String(raw)).trim().replace(/^["']|["']$/g, '');
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]|$)/);
  if (m) return makeISO(+m[1], +m[2], +m[3]);

  s = s.replace(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*[,\s]+/i, '');

  m = s.match(/^(\d{1,2})[\s\-/.,]+([A-Za-z\u0980-\u09FF]{3,12})[\s\-/.,]+(\d{2,4})/);
  if (m) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) return makeISO(year4(m[3]), mi + 1, +m[1]);
  }

  m = s.match(/^([A-Za-z\u0980-\u09FF]{3,12})[\s\-/.,]+(\d{1,2})(?:[,\s\-/.]+(\d{2,4}))?/);
  if (m) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) return makeISO(m[3] ? year4(m[3]) : new Date().getFullYear(), mi + 1, +m[2]);
  }

  m = s.match(/^(\d{1,2})[\s\-/.](\d{1,2})[\s\-/.](\d{2,4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = year4(m[3]);
    let d;
    let mo;
    if (a > 12 && b <= 12) { d = a; mo = b; }
    else if (b > 12 && a <= 12) { d = b; mo = a; }
    else { d = a; mo = b; } // Bangladesh convention: DMY
    return makeISO(y, mo, d);
  }

  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) {
    const dt = new Date(parsed);
    return makeISO(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return null;
}

export function formatDate(iso, style = 'short', lang = 'en') {
  const d = parseISO(iso);
  if (!d) return '';
  const months = lang === 'bn' ? MONTHS_BN : MONTHS_EN;
  const day = d.getDate();
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  if (style === 'short') return `${day} ${mon}`;
  if (style === 'long') return `${day} ${mon} ${year}`;
  if (style === 'month') return `${lang === 'bn' ? MONTHS_FULL_BN[d.getMonth()] : MONTHS_EN[d.getMonth()]} ${year}`;
  if (style === 'full') {
    const wd = lang === 'bn' ? WEEKDAYS_BN[d.getDay()] : WEEKDAYS_EN[d.getDay()];
    return `${wd}, ${day} ${mon} ${year}`;
  }
  if (style === 'weekday') return lang === 'bn' ? WEEKDAYS_BN[d.getDay()] : WEEKDAYS_EN[d.getDay()];
  return `${day} ${mon} ${year}`;
}

export function formatWeekShort(start, end) {
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return '';
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()}`;
  return `${a.getDate()}/${a.getMonth() + 1}–${b.getDate()}/${b.getMonth() + 1}`;
}

export function formatWeekLong(start, end, lang = 'en') {
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return '';
  const months = lang === 'bn' ? MONTHS_BN : MONTHS_EN;
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${months[a.getMonth()]}`;
  }
  return `${a.getDate()} ${months[a.getMonth()]} – ${b.getDate()} ${months[b.getMonth()]}`;
}

export function formatRangeLabel(from, to, lang = 'en') {
  if (!from || !to) return '';
  if (from === to) return formatDate(from, 'long', lang);
  const a = parseISO(from);
  const b = parseISO(to);
  if (!a || !b) return '';
  const months = lang === 'bn' ? MONTHS_BN : MONTHS_EN;
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) {
      return `${a.getDate()}–${b.getDate()} ${months[a.getMonth()]} ${b.getFullYear()}`;
    }
    return `${a.getDate()} ${months[a.getMonth()]} – ${b.getDate()} ${months[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${formatDate(from, 'long', lang)} – ${formatDate(to, 'long', lang)}`;
}

export function weekdayLabels(lang = 'en') {
  return lang === 'bn' ? WEEKDAYS_BN : WEEKDAYS_EN;
}

export function weekdayFull(iso, lang = 'en') {
  const d = parseISO(iso);
  if (!d) return '';
  return lang === 'bn' ? WEEKDAYS_BN_FULL[d.getDay()] : WEEKDAYS_EN_FULL[d.getDay()];
}

export const PRESETS = ['this-week', 'last-week', 'this-month', 'last-month', 'last30', 'this-year', 'all'];

/** Compute {from,to} for a preset. `all` uses sentinel bounds. */
export function getPresetRange(preset, customFrom, customTo, now = todayISO()) {
  const today = parseISO(now);
  const monthStart = isoOf(new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const monthEnd = endOfMonthISO(now);
  switch (preset) {
    case 'this-week': {
      const from = startOfWeekISO(now);
      return { from, to: addDaysISO(from, 6) };
    }
    case 'last-week': {
      const from = addDaysISO(startOfWeekISO(now), -7);
      return { from, to: addDaysISO(from, 6) };
    }
    case 'last-month': {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15, 12);
      const iso = isoOf(lastMonth);
      return { from: isoOf(new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1, 12)), to: endOfMonthISO(iso) };
    }
    case 'last30':
      return { from: addDaysISO(now, -29), to: now };
    case 'this-year':
      return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` };
    case 'all':
      return { from: '0000-01-01', to: '9999-12-31' };
    case 'custom': {
      const from = parseDateAny(customFrom) || monthStart;
      const to = parseDateAny(customTo) || monthEnd;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    case 'this-month':
    default:
      return { from: monthStart, to: monthEnd };
  }
}

export function rangeDays(from, to) {
  return Math.max(1, diffDays(from, to) + 1);
}

/** Dates can be compared lexicographically because they are ISO. */
export function inRange(date, from, to) {
  return (!from || date >= from) && (!to || date <= to);
}

/** Nice round ceiling for chart axes. */
export function niceCeil(value) {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(v));
  const f = v / power;
  let nice;
  if (f <= 1) nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 2.5) nice = 2.5;
  else if (f <= 5) nice = 5;
  else nice = 10;
  return nice * power;
}

export function clampDate(iso, from, to) {
  if (iso < from) return from;
  if (iso > to) return to;
  return iso;
}

/* ------------------------------ text / files ------------------------------ */
export function normDesc(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[|,;]+/g, ' ')
    .trim();
}

export function downloadBlob(filename, blob) {
  if (!blob) return;
  // The standalone Android build exposes a small bridge that writes the file
  // through MediaStore. WebView does not handle blob: downloads itself.
  const bridge = window.HishabAndroid;
  if (bridge && typeof bridge.saveBase64 === 'function' && typeof FileReader !== 'undefined') {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const value = String(reader.result || '');
          const comma = value.indexOf(',');
          if (comma >= 0) bridge.saveBase64(filename, value.slice(comma + 1));
        } catch {
          /* fall through to a normal browser download */
        }
      };
      reader.readAsDataURL(blob);
      return;
    } catch {
      /* fall through to a normal browser download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadJSON(filename, data) {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

export function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function debounce(fn, wait = 180) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function vibrate(ms = 8) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}

export function sharePayload(title, text) {
  try {
    if (navigator.share) {
      return navigator.share({ title, text });
    }
  } catch {
    /* ignore */
  }
  return Promise.reject(new Error('no-share'));
}
