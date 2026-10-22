/* =========================================================
   Hishab — hand-rolled SVG charts (no dependencies)
   ========================================================= */

import { fmtCompact, fmtMoney, formatDate, formatWeekShort, niceCeil } from './utils.js';
import { t } from './i18n.js';

let gradientSeq = 0;

function gridLine(x1, y1, x2, y2, cls = '') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--chart-grid)" stroke-width="1" ${cls}/>`;
}

export function weeklyBarChart(weeks, opts = {}) {
  if (!weeks || !weeks.length) return chartEmpty();
  const hasData = weeks.some((w) => w.income > 0 || w.expense > 0);
  if (!hasData) return chartEmpty();

  const W = 360;
  const H = 186;
  const padL = 30;
  const padR = 6;
  const padT = 8;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let max = 0;
  for (const w of weeks) max = Math.max(max, w.income, w.expense);
  const top = niceCeil(max);
  const n = weeks.length;
  const groupW = plotW / n;
  const barW = Math.max(3.5, Math.min(10, groupW * 0.27));
  const gap = Math.max(1.5, Math.min(3, groupW * 0.06));

  let bars = '';
  let labels = '';
  let ticks = '';

  for (let i = 0; i < 3; i += 1) {
    const value = (top / 2) * i;
    const y = padT + plotH - (value / top) * plotH;
    ticks += `<text x="${padL - 6}" y="${y + 2.6}" text-anchor="end" font-size="7.5" fill="var(--chart-axis)" font-family="inherit">${value === 0 ? '0' : fmtCompact(value, { symbol: false })}</text>`;
    if (i > 0) ticks += gridLine(padL, y, W - padR, y);
  }

  for (let i = 0; i < n; i += 1) {
    const w = weeks[i];
    const cx = padL + groupW * i + groupW / 2;
    const ih = w.income > 0 ? Math.max(2.5, (w.income / top) * plotH) : 0;
    const eh = w.expense > 0 ? Math.max(2.5, (w.expense / top) * plotH) : 0;
    const ix = cx - barW - gap / 2;
    const ex = cx + gap / 2;

    if (w.isCurrent) {
      bars += `<rect x="${(cx - groupW / 2 + 3).toFixed(1)}" y="${padT}" width="${Math.max(1, groupW - 6).toFixed(1)}" height="${plotH}" rx="6" fill="var(--income-soft)" opacity="0.55"/>`;
    }

    if (ih > 0) {
      bars += `<rect class="chart-bar" x="${ix.toFixed(1)}" y="${(padT + plotH - ih).toFixed(1)}" width="${barW.toFixed(1)}" height="${ih.toFixed(1)}" rx="2.6" fill="var(--income)" opacity="0.92"><title>${escapeSvg(`${formatWeekShort(w.labelStart, w.labelEnd)} · ${t('chart.income')}: ${fmtMoney(w.income)}`)}</title></rect>`;
    }
    if (eh > 0) {
      bars += `<rect class="chart-bar" x="${ex.toFixed(1)}" y="${(padT + plotH - eh).toFixed(1)}" width="${barW.toFixed(1)}" height="${eh.toFixed(1)}" rx="2.6" fill="var(--expense)" opacity="0.9"><title>${escapeSvg(`${formatWeekShort(w.labelStart, w.labelEnd)} · ${t('chart.expense')}: ${fmtMoney(w.expense)}`)}</title></rect>`;
    }

    const every = n <= 7 ? 1 : n <= 10 ? 2 : 3;
    if (i % every === 0 || i === n - 1) {
      const fs = n > 8 ? 7 : 7.8;
      labels += `<text x="${cx.toFixed(1)}" y="${H - 11}" text-anchor="middle" font-size="${fs}" fill="var(--chart-axis)" font-family="inherit">${formatWeekShort(w.labelStart, w.labelEnd)}</text>`;
    }
  }

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeSvg(t('home.weekly'))}">
    ${ticks}
    ${bars}
    <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--line-strong)" stroke-width="1"/>
    ${labels}
    <text x="${W - padR}" y="${H - 1}" text-anchor="end" font-size="7" fill="var(--chart-axis)" opacity="0.8" font-family="inherit">${escapeSvg(t('chart.weekHint'))}</text>
  </svg>`;
}

export function donutChart(items, opts = {}) {
  const total = opts.total ?? (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  const W = 160;
  const cx = 80;
  const cy = 80;
  const r = 57;
  const stroke = 17;
  const circumference = 2 * Math.PI * r;

  if (!items || !items.length || total <= 0) {
    return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${escapeSvg(t('chart.expense'))}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>
      <text x="${cx}" y="${cy + 1}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)" font-family="inherit">৳0</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="7.5" fill="var(--chart-axis)" letter-spacing=".5" font-family="inherit">${escapeSvg(t('chart.expense'))}</text>
    </svg>`;
  }

  let offset = 0;
  let segs = '';
  for (const item of items) {
    const share = Math.max(0, Math.min(1, item.amount / total));
    const rawLen = share * circumference;
    const gap = rawLen > 6 ? 1.8 : 0.6;
    const len = Math.max(0, rawLen - gap);
    const color = item.category?.color || item.color || 'var(--accent)';
    segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt">
      <title>${escapeSvg(`${item.name || item.category?.bn || ''} · ${fmtMoney(item.amount)}`)}</title>
    </circle>`;
    offset += rawLen;
  }

  const compact = total >= 100000 ? fmtCompact(total) : fmtMoney(total);
  return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${escapeSvg(t('chart.expense'))}: ${escapeSvg(fmtMoney(total))}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}" opacity=".55"/>
    ${segs}
    <text x="${cx}" y="${cy + 1}" text-anchor="middle" font-size="${compact.length > 9 ? 11 : 13.5}" font-weight="700" fill="var(--text)" font-family="inherit">${escapeSvg(compact)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="7.5" fill="var(--chart-axis)" letter-spacing=".5" font-family="inherit">${escapeSvg(t('chart.expense'))}</text>
  </svg>`;
}

export function sparkline(points, opts = {}) {
  if (!points || points.length < 2) return '';
  const W = 360;
  const H = opts.height || 62;
  const padX = 3;
  const padY = 8;
  const values = points.map((p) => p.value);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (max - min < 1) {
    max = 1;
    min = -1;
  }
  const range = max - min;
  const x = (i) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v) => padY + (1 - (v - min) / range) * (H - padY * 2);

  const coords = points.map((p, i) => [x(i), y(p.value)]);
  const line = smoothPath(coords);
  const area = `${line} L ${coords[coords.length - 1][0].toFixed(1)} ${H - 2} L ${coords[0][0].toFixed(1)} ${H - 2} Z`;
  const last = points[points.length - 1].value;
  const color = last < 0 ? 'var(--expense)' : 'var(--income)';
  const gradId = `sparkGrad${++gradientSeq}`;
  const zeroY = y(0);
  const showZero = min < 0 && max > 0;

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:${last < 0 ? '#FF6B81' : '#2BD9A2'};stop-opacity:.28"/>
        <stop offset="1" style="stop-color:${last < 0 ? '#FF6B81' : '#2BD9A2'};stop-opacity:0"/>
      </linearGradient>
    </defs>
    ${showZero ? `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="3 4" opacity=".7"/>` : ''}
    <path d="${area}" fill="url(#${gradId})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${coords[coords.length - 1][0].toFixed(1)}" cy="${coords[coords.length - 1][1].toFixed(1)}" r="2.8" fill="${color}"/>
  </svg>`;
}

export function trendChart(points, opts = {}) {
  if (!points || points.length < 2) return chartEmpty();
  const W = 360;
  const H = 128;
  const padL = 6;
  const padR = 6;
  const padT = 8;
  const padB = 21;
  const values = points.map((p) => p.value);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (max - min < 1) {
    max += 1;
    min -= 1;
  }
  const range = max - min;
  const x = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const coords = points.map((p, i) => [x(i), y(p.value)]);
  const line = smoothPath(coords);
  const area = `${line} L ${coords[coords.length - 1][0].toFixed(1)} ${H - padB} L ${coords[0][0].toFixed(1)} ${H - padB} Z`;
  const last = values[values.length - 1];
  const color = last < 0 ? 'var(--expense)' : 'var(--income)';
  const zeroInside = min < 0 && max > 0;
  const zeroY = y(0);
  const gradId = `trendGrad${++gradientSeq}`;

  const labels = [];
  const idxs = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  for (const i of [...new Set(idxs)]) {
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    labels.push(`<text x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="${anchor}" font-size="7.2" fill="var(--chart-axis)" font-family="inherit">${formatDate(points[i].date, 'short', opts.lang || 'en')}</text>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeSvg(t('chart.trend'))}">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:${last < 0 ? '#FF6B81' : '#2BD9A2'};stop-opacity:.22"/>
        <stop offset="1" style="stop-color:${last < 0 ? '#FF6B81' : '#2BD9A2'};stop-opacity:0"/>
      </linearGradient>
    </defs>
    ${gridLine(padL, padT + 2, W - padR, padT + 2)}
    ${zeroInside ? `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="3 4"/>` : ''}
    <path d="${area}" fill="url(#${gradId})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${coords[coords.length - 1][0].toFixed(1)}" cy="${coords[coords.length - 1][1].toFixed(1)}" r="3" fill="${color}"/>
    ${labels.join('')}
  </svg>`;
}

export function chartEmpty(message) {
  return `<div class="chart-empty">
    <span class="ce-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg></span>
    <span>${escapeSvg(message || t('chart.noData'))}</span>
  </div>`;
}

/* ------------------------------ helpers ------------------------------ */
function smoothPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)} L ${points[1][0].toFixed(1)} ${points[1][1].toFixed(1)}`;
  }
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const tns = 0.18;
    const cp1x = p1[0] + (p2[0] - p0[0]) * tns;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tns;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tns;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tns;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function escapeSvg(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
