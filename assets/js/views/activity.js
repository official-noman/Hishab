/* =========================================================
   Hishab — transactions / activity view
   ========================================================= */

import { ACCOUNT_IDS, accountName } from '../categories.js';
import { filterTxns, totals } from '../analytics.js';
import {
  dayHead, emptyState, filterBar, icon, txnRow,
} from '../components.js';
import { t } from '../i18n.js';
import { esc, fmtMoney } from '../utils.js';

const TYPE_FILTERS = [
  { id: 'all', label: 'common.all' },
  { id: 'expense', label: 'txn.expense' },
  { id: 'income', label: 'txn.income' },
  { id: 'transfer', label: 'txn.transfer' },
];

export function activityView(ctx) {
  const { state, ui, range, lang } = ctx;
  const filtered = filterTxns(state, {
    from: range.from,
    to: range.to,
    memberId: state.activeMember,
    type: ui.activityType || 'all',
    account: ui.activityAccount || 'all',
    search: ui.activitySearch || '',
  });
  const sum = totals(filtered);

  const groups = new Map();
  for (const tx of filtered) {
    if (!groups.has(tx.date)) groups.set(tx.date, []);
    groups.get(tx.date).push(tx);
  }
  const dates = [...groups.keys()].sort((a, b) => b.localeCompare(a));

  const dayTotals = new Map();
  for (const tx of filtered) {
    const d = dayTotals.get(tx.date) || { expense: 0, income: 0 };
    if (tx.type === 'expense') d.expense += tx.amount;
    else if (tx.type === 'income') d.income += tx.amount;
    dayTotals.set(tx.date, d);
  }

  const limit = ui.activityLimit || 80;
  let shown = 0;
  let list = '';
  for (const date of dates) {
    if (shown >= limit) break;
    const items = groups.get(date);
    const day = dayTotals.get(date) || { expense: 0, income: 0 };
    list += dayHead(date, day.expense, day.income, lang);
    let rows = '';
    for (const tx of items) {
      if (shown >= limit) break;
      rows += txnRow(tx, state, lang);
      shown += 1;
    }
    list += `<div class="txn-list">${rows}</div>`;
  }

  const empty = !filtered.length;
  const hasAny = state.txns.length > 0;

  return `${filterBar(ui, range, lang)}
    <div class="summary-strip">
      <span class="ss-ic">${icon('activity', 14)}</span>
      <span><b>${filtered.length}</b> ${t('home.txns')}</span>
      <span style="color:var(--line-strong)">|</span>
      <span>${t('home.expense')} <b>${fmtMoney(sum.expense)}</b></span>
      ${sum.income > 0 ? `<span>${t('home.income')} <b class="pos">${fmtMoney(sum.income)}</b></span>` : ''}
    </div>
    <div class="section">
      <div class="search">
        ${icon('search', 16)}
        <input id="txn-search" type="search" placeholder="${esc(t('txn.search'))}" value="${esc(ui.activitySearch || '')}" autocomplete="off" enterkeyhint="search" aria-label="${esc(t('txn.search'))}">
        ${ui.activitySearch ? `<button class="clear" data-action="activity-clear-search" aria-label="${esc(t('common.close'))}">${icon('close', 14)}</button>` : ''}
      </div>
      <div class="toolbar-chips">
        ${TYPE_FILTERS.map((f) => `<button class="chip ${(ui.activityType || 'all') === f.id ? 'active' : ''}" data-action="activity-type" data-type="${f.id}">${t(f.label)}</button>`).join('')}
        <span style="width:1px;background:var(--line);margin:6px 3px;flex:none"></span>
        <button class="chip ${(ui.activityAccount || 'all') === 'all' ? 'active' : ''}" data-action="activity-account" data-account="all">${t('acct.all')}</button>
        ${ACCOUNT_IDS.map((id) => `<button class="chip ${ui.activityAccount === id ? 'active' : ''}" data-action="activity-account" data-account="${id}">${esc(accountName(id, lang))}</button>`).join('')}
      </div>
    </div>
    ${empty
      ? emptyBlock(hasAny)
      : `<section class="section" style="margin-top:2px">${list}</section>
         ${filtered.length > limit ? `<div class="section"><button class="btn ghost block" data-action="activity-more">${t('txn.loadMore')} (${filtered.length - limit})</button></div>` : ''}`}
    <div class="footer-note">${t('app.footer')}</div>`;
}

function emptyBlock(hasAny) {
  if (!hasAny) {
    return `<section class="card section">${emptyState({
      emoji: '📥',
      title: t('empty.importTitle'),
      desc: t('empty.importDesc'),
      actions: `
        <a class="btn primary small" href="#/import">${icon('import', 14)}${t('home.emptyImport')}</a>
        <button class="btn small" data-action="open-add">${icon('plus', 14)}${t('home.emptyAdd')}</button>
      `,
    })}</section>`;
  }
  const filtered = t('txn.noneDesc');
  return `<section class="card section">${emptyState({
    emoji: '🔍',
    title: t('txn.noneTitle'),
    desc: filtered,
    actions: `<button class="btn small" data-action="activity-reset">${t('txn.clearFilter')}</button>`,
  })}</section>`;
}
