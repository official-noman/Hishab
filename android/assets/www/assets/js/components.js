/* =========================================================
   Hishab — reusable UI pieces + icon set
   ========================================================= */

import { accountName, categoryName, getCategory } from './categories.js';
import {
  addDaysISO, esc, fmtMoney, formatRangeLabel, PRESETS, todayISO,
} from './utils.js';
import { t } from './i18n.js';

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-5.5h5V21"/>',
  activity: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.15" fill="currentColor" stroke="none"/><circle cx="3.6" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="3.6" cy="18" r="1.15" fill="currentColor" stroke="none"/>',
  import: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  report: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M22 20H2"/>',
  more: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M8 21h8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  arrowDownLeft: '<path d="M17 7 7 17"/><path d="M16 17H7V8"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.6 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  share: '<path d="M12 16V3"/><path d="m7 8 5-5 5 5"/><path d="M5 14v7h14v-7"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 4h16"/>',
  print: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5h20v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1.5"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 7V5a2 2 0 0 1 2-2h12"/><path d="M16 13h2"/>',
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14.5A6.5 6.5 0 0 1 22 21"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  receipt: '<path d="M6 3v18l3-2 3 2 3-2 3 2V3l-3 2-3-2-3 2Z"/><path d="M9 9h6M9 13h6"/>',
  trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  tag: '<path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z"/><circle cx="7" cy="7" r="1.5"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 7.7 8 9 4.5-1.3 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  install: '<path d="M12 3v11"/><path d="m7 9 5 5 5-5"/><path d="M4 18v3h16v-3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  chart: '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>',
  zap: '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  inbox: '<path d="M4 4h16v16H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3v-6.2A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 10h8M8 14h5"/>',
  bot: '<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6"/>',
};

export function icon(name, size = 20, extra = '') {
  const inner = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${extra}">${inner}</svg>`;
}

export function brandMark() {
  return `<span class="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none">
      <rect x="16" y="35" width="7" height="14" rx="2.4" fill="#2BD9A2"/>
      <rect x="28.5" y="27" width="7" height="22" rx="2.4" fill="#4FE8BC"/>
      <rect x="41" y="19" width="7" height="30" rx="2.4" fill="#7C9CFF"/>
      <circle cx="49" cy="16" r="5.5" fill="#FF6B81"/>
    </svg>
  </span>`;
}

export function avatar(member, cls = '') {
  const m = member || { emoji: '🙂', color: '#2BD9A2', name: '' };
  return `<span class="avatar ${cls}" style="background:${m.color}26;color:${m.color}" title="${esc(m.name)}">${esc(m.emoji || '🙂')}</span>`;
}

export function catIcon(categoryId, cls = '') {
  const cat = getCategory(categoryId);
  return `<span class="cat-ic ${cls}" style="background:${cat.color}1f;color:${cat.color}" aria-hidden="true">${cat.emoji}</span>`;
}

export function badge(text, tone = '', iconName = '') {
  return `<span class="badge ${tone}">${iconName ? icon(iconName, 11) : ''}${esc(text)}</span>`;
}

export function filterBar(ui, range, lang) {
  const label = ui.preset === 'all'
    ? t('preset.all')
    : formatRangeLabel(range.from, range.to, lang);
  const presetChips = PRESETS.map((preset) => (
    `<button class="chip ${ui.preset === preset ? 'active' : ''}" data-action="filter-preset" data-preset="${preset}">${t(`preset.${preset}`)}</button>`
  )).join('');

  return `<div class="filter-wrap">
    <div class="filter-scroll">
      <button class="chip ${ui.preset === 'custom' ? 'active' : ''}" data-action="open-range" aria-label="${esc(t('filter.title'))}">
        ${icon('calendar', 14)}<span>${esc(label)}</span>
      </button>
      ${presetChips}
    </div>
  </div>`;
}

export function txnRow(tx, state, lang, opts = {}) {
  const cat = getCategory(tx.category);
  const member = state.members.find((m) => m.id === tx.memberId);
  const isTransfer = tx.type === 'transfer';
  const acct = accountName(tx.account, lang);
  const title = tx.note || (isTransfer ? t('txn.transferShort') : categoryName(tx.category, lang));
  let sub = isTransfer
    ? `${acct} → ${accountName(tx.toAccount || tx.account, lang)}`
    : `${categoryName(tx.category, lang)} · ${acct}`;
  if (member && state.activeMember === 'all' && state.members.length > 1) sub += ` · ${member.name}`;

  let amount = '';
  if (isTransfer) {
    amount = `<span class="txn-amt transfer">${fmtMoney(tx.amount)}</span>`;
  } else if (tx.type === 'income') {
    amount = `<span class="txn-amt pos">+${fmtMoney(tx.amount)}</span>`;
  } else {
    amount = `<span class="txn-amt">-${fmtMoney(tx.amount)}</span>`;
  }

  return `<button class="txn" data-action="edit-txn" data-id="${esc(tx.id)}" aria-label="${esc(`${title} ${amount.replace(/<[^>]+>/g, '')}`)}">
    ${catIcon(tx.category)}
    <span class="txn-main">
      <span class="txn-title">${esc(title)}${isTransfer ? `<span class="tag">${esc(t('txn.transferShort'))}</span>` : ''}</span>
      <span class="txn-sub">${esc(sub)}</span>
    </span>
    ${amount}
  </button>`;
}

export function dayHead(iso, expense, income, lang) {
  const today = todayISO();
  let label;
  if (iso === today) label = t('txn.today');
  else if (addDaysISO(iso, 1) === today) label = t('txn.yesterday');
  else label = formatDateWithWeekday(iso, lang);
  const right = expense > 0
    ? `<span class="day-total">${esc(t('txn.dayTotal'))} -${fmtMoney(expense)}</span>`
    : income > 0
      ? `<span class="day-total pos">+${fmtMoney(income)}</span>`
      : '<span class="day-total"></span>';
  return `<div class="day-head"><span class="day-label">${esc(label)}</span>${right}</div>`;
}

function formatDateWithWeekday(iso, lang) {
  const wd = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'short' }).format(new Date(`${iso}T12:00:00`));
  const d = formatWeekdayDate(iso, lang);
  return `${wd}, ${d}`;
}

function formatWeekdayDate(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = lang === 'bn'
    ? ['জানু', 'ফেব', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলা', 'আগ', 'সেপ', 'অক্টো', 'নভে', 'ডিসে']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  return `${d} ${months[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`;
}

export function statCard({ label, value, sub = '', tone = '', iconName = 'wallet', color = 'var(--income)' }) {
  return `<div class="stat">
    <div class="stat-top">
      <span class="stat-label">${esc(label)}</span>
      <span class="stat-ic" style="background:${color}1c;color:${color}">${icon(iconName, 13)}</span>
    </div>
    <div class="stat-val ${tone}">${value}</div>
    ${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}
  </div>`;
}

export function progress(value, color = 'var(--income)') {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="bar"><i style="width:${width}%;background:${color}"></i></div>`;
}

export function emptyState({ emoji = '🧾', title, desc = '', actions = '' }) {
  return `<div class="empty">
    <div class="empty-emoji">${emoji}</div>
    <div class="empty-title">${esc(title)}</div>
    ${desc ? `<div class="empty-desc">${esc(desc)}</div>` : ''}
    ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
  </div>`;
}

const INSIGHT_ICONS = {
  top: 'tag', up: 'trendUp', down: 'trendDown', avg: 'chart',
  savings: 'wallet', alert: 'alert', budget: 'target', biggest: 'receipt',
  week: 'calendar', cash: 'cash', none: 'info',
};

export function insightRow(insight) {
  const ic = INSIGHT_ICONS[insight.icon] || 'info';
  const tone = insight.tone === 'good' ? 'good' : insight.tone === 'bad' ? 'bad' : insight.tone === 'warn' ? 'warn' : '';
  return `<div class="insight">
    <span class="ins-ic ${tone}">${icon(ic, 13)}</span>
    <span>${esc(insight.text)}</span>
  </div>`;
}

export function weekChip(week, lang) {
  return `<div class="week-cell ${week.isCurrent ? 'today' : ''}">
    <div class="wd">${esc(formatWeekShortLocal(week.labelStart, week.labelEnd))}</div>
    <div class="wd-v">${esc(fmtMoney(week.expense))}</div>
  </div>`;
}

function formatWeekShortLocal(start, end) {
  const a = start.slice(8).replace(/^0/, '');
  const b = end.slice(8).replace(/^0/, '');
  return `${a}–${b}`;
}

export function categoryRow(item, lang, total) {
  const cat = getCategory(item.id);
  const share = total ? (item.amount / total) * 100 : 0;
  return `<div class="cat-row">
    ${catIcon(item.id, 'sm')}
    <div class="cat-info">
      <div class="cat-top">
        <span class="cat-name">${esc(categoryName(item.id, lang))}</span>
        <span class="cat-amt">${fmtMoney(item.amount)}</span>
      </div>
      ${progress(share, cat.color)}
    </div>
    <span class="pct">${Math.round(share)}%</span>
  </div>`;
}

export { ICONS };
