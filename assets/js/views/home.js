/* =========================================================
   Hishab — Home / overview view
   ========================================================= */

import { accountName, categoryName, getCategory } from '../categories.js';
import { accountSummary, buildInsights } from '../analytics.js';
import {
  badge, categoryRow, emptyState, filterBar, insightRow, progress,
  statCard, txnRow, icon,
} from '../components.js';
import { weeklyBarChart, donutChart, sparkline } from '../charts.js';
import { t } from '../i18n.js';
import {
  esc, fmtMoney, fmtCompact, formatRangeLabel,
} from '../utils.js';

export function homeView(ctx) {
  const { state, ui, range, report, lang } = ctx;
  const firstRun = state.txns.length === 0;

  if (firstRun) {
    return `${filterBar(ui, range, lang)}
      <section class="section">${welcomeCard()}</section>
      <section class="section card">
        ${emptyState({
          emoji: '📥',
          title: t('empty.importTitle'),
          desc: t('empty.importDesc'),
          actions: `
            <a class="btn primary small" href="#/import">${icon('import', 14)}${t('home.emptyImport')}</a>
            <button class="btn small" data-action="open-add">${icon('plus', 14)}${t('home.emptyAdd')}</button>
          `,
        })}
      </section>
      <div class="footer-note">${t('app.footer')}</div>`;
  }

  return `${filterBar(ui, range, lang)}
    ${!state.settings.onboarded ? `<section class="section">${welcomeCard()}</section>` : ''}
    <section class="section">${heroCard(report, ui, range, lang)}</section>
    <section class="section stat-grid">
      ${statCard({
        label: t('stat.income'), value: fmtMoney(report.totals.income),
        sub: t('stat.incomeSub'), iconName: 'arrowDownLeft', color: 'var(--income)',
      })}
      ${statCard({
        label: t('stat.expense'), value: fmtMoney(report.totals.expense),
        sub: t('stat.expenseSub'), iconName: 'arrowUpRight', color: 'var(--expense)',
      })}
      ${statCard({
        label: t('stat.savings'), value: fmtMoney(report.totals.net),
        sub: report.totals.savingsRate == null ? '—' : `${Math.round(report.totals.savingsRate)}%`,
        tone: report.totals.net < 0 ? 'neg' : report.totals.net > 0 ? 'pos' : '',
        iconName: 'wallet', color: 'var(--accent)',
      })}
      ${statCard({
        label: t('stat.avgDay'), value: fmtMoney(report.avgDay),
        sub: t('stat.avgSub', { n: report.days }), iconName: 'chart', color: 'var(--amber)',
      })}
    </section>
    <section class="section">${budgetCard(report.budget, lang)}</section>
    <section class="section">${weeklyCard(report, lang)}</section>
    ${report.categories.length ? `<section class="section">${categoryCard(report, lang)}</section>` : ''}
    ${insightCard(report, lang)}
    <section class="section">${accountsCard(state, lang)}</section>
    <section class="section">${recentCard(state, report, lang)}</section>
    <div class="footer-note">${icon('shield', 12)} ${t('app.footer')}</div>`;
}

function welcomeCard() {
  return `<div class="welcome">
    <button class="dismiss" data-action="dismiss-welcome" aria-label="${t('home.dismiss')}">${icon('close', 13)}</button>
    <h3>${t('home.welcomeTitle')}</h3>
    <p>${t('home.welcomeDesc')}</p>
    <div class="welcome-steps">
      <div class="w-step"><span class="w-num">1</span><span>${t('home.step1')}</span></div>
      <div class="w-step"><span class="w-num">2</span><span>${t('home.step2')}</span></div>
      <div class="w-step"><span class="w-num">3</span><span>${t('home.step3')}</span></div>
    </div>
    <div class="row" style="gap:7px;flex-wrap:wrap">
      <a class="btn primary" href="#/import">${t('home.start')} ${icon('chevronRight', 14)}</a>
      <button class="btn ghost small" data-action="load-demo-home">${t('home.demo')}</button>
    </div>
  </div>`;
}

function heroCard(report, ui, range, lang) {
  const net = report.totals.net;
  const cls = net < 0 ? 'neg' : net > 0 ? 'pos' : '';
  const rangeLabel = ui.preset === 'all'
    ? t('preset.all')
    : formatRangeLabel(range.from, range.to, lang);
  const rate = report.totals.savingsRate;
  const spark = sparkline(report.daily.points, { height: 58 });

  return `<div class="hero">
    <div class="hero-top">
      <span class="hero-label">${t('home.net')} <span class="sep">·</span> <b>${t('home.noTransfer')}</b></span>
      <span class="hero-range">${rangeLabel}</span>
    </div>
    <div class="hero-amount ${cls}">${fmtMoney(net, { sign: true })}</div>
    <div class="hero-meta">
      <span>${t('home.income')} <b>${fmtMoney(report.totals.income)}</b></span>
      <span class="sep"></span>
      <span>${t('home.expense')} <b>${fmtMoney(report.totals.expense)}</b></span>
      <span class="sep"></span>
      <span>${t('txn.count', { n: report.totals.count })}</span>
    </div>
    <div class="row" style="margin-top:9px">
      ${rate == null
        ? `<span class="hero-badge">${t('home.noTransfer')}</span>`
        : `<span class="hero-badge ${rate < 0 ? 'neg' : ''}">${t('home.savingsRate')} ${Math.round(rate)}%</span>`}
      <a class="hero-badge" href="#/report" style="text-decoration:none">${t('home.viewReport')} ${icon('chevronRight', 11)}</a>
    </div>
    <div class="hero-chart">${spark}</div>
  </div>`;
}

function budgetCard(budget, lang) {
  if (!budget.budget) {
    return `<div class="card">
      <div class="row between">
        <div>
          <div class="card-title">${t('home.budget')}</div>
          <div class="card-sub">${t('home.noBudget')}</div>
        </div>
        <button class="btn small soft" data-action="open-budget">${t('home.setBudget')}</button>
      </div>
    </div>`;
  }

  const color = budget.over ? 'var(--expense)' : budget.usedPct >= 80 ? 'var(--amber)' : 'var(--income)';
  const remainingText = budget.over
    ? t('home.budgetOver', { amount: fmtMoney(budget.spent - budget.budget) })
    : t('home.budgetLeft', { amount: fmtMoney(budget.remaining) });

  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('home.budget')}</div>
        <div class="card-sub">${t('home.budgetUsed', { spent: fmtMoney(budget.spent), total: fmtMoney(budget.budget) })}</div>
      </div>
      ${badge(t('home.daysLeft', { n: budget.daysLeft }), budget.over ? 'bad' : 'neutral')}
    </div>
    ${progress(budget.usedPct, color)}
    <div class="row between" style="margin-top:9px">
      <span style="font-size:11px;font-weight:600;color:${budget.over ? 'var(--expense)' : 'var(--muted)'}">${remainingText}</span>
      <span style="font-size:10.5px;color:var(--faint)">${t('home.dailyAllow', { amount: fmtMoney(budget.dailyAllowance) })}</span>
    </div>
    ${budget.over ? `<div class="mt-10"><div class="alert">${icon('alert', 14)}<span>${t('insight.budgetOver', { amount: fmtMoney(budget.spent - budget.budget) })}</span></div></div>` : ''}
  </div>`;
}

function weeklyCard(report, lang) {
  const weeks = report.weekly.slice(-12);
  const wow = report.wow;
  let changeBadge = '';
  if (wow && wow.dir === 'new') {
    changeBadge = badge(t('home.more'), 'warn', 'trendUp');
  } else if (wow && wow.pct != null && Math.abs(wow.pct) >= 0.5) {
    changeBadge = badge(
      `${Math.abs(Math.round(wow.pct))}%`,
      wow.dir === 'up' ? 'bad' : 'good',
      wow.dir === 'up' ? 'trendUp' : 'trendDown',
    );
  }

  const avg = weeks.length ? weeks.reduce((sum, w) => sum + w.expense, 0) / weeks.length : 0;
  const current = weeks[weeks.length - 1];

  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('home.weekly')}</div>
        <div class="card-sub">${t('home.weeklySub')}</div>
      </div>
      <div class="row" style="gap:6px">
        ${changeBadge}
        <a class="card-link" href="#/report">${t('common.seeAll')} ${icon('chevronRight', 13)}</a>
      </div>
    </div>
    <div class="chart">${weeklyBarChart(weeks, { lang })}</div>
    <div class="chart-legend-row">
      <div class="legend">
        <span class="legend-item income"><i class="dot"></i>${t('chart.income')}</span>
        <span class="legend-item expense"><i class="dot"></i>${t('chart.expense')}</span>
      </div>
      ${weeks.length >= 12 ? `<span style="font-size:9.5px;color:var(--faint)">${t('chart.last12')}</span>` : ''}
    </div>
    <div class="divider"></div>
    <div class="row between" style="font-size:11px;color:var(--muted)">
      <span>${t('home.thisWeek')} <b style="color:var(--text)">${fmtMoney(current?.expense || 0)}</b></span>
      <span>${t('home.weekAvg')} <b style="color:var(--text)">${fmtMoney(avg)}</b></span>
    </div>
  </div>`;
}

function categoryCard(report, lang) {
  const cats = report.categories;
  const top = cats.slice(0, 5);
  const total = report.totals.expense;
  const donutItems = top.map((c) => ({
    ...c,
    name: categoryName(c.id, lang),
    category: getCategory(c.id),
  }));

  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('home.category')}</div>
        <div class="card-sub">${t('home.categorySub')}</div>
      </div>
      <a class="card-link" href="#/report">${t('common.seeAll')} ${icon('chevronRight', 13)}</a>
    </div>
    <div class="donut-wrap">
      <div class="donut">${donutChart(donutItems, { total })}</div>
      <div class="cat-list">
        ${top.slice(0, 4).map((c) => categoryRow(c, lang, total)).join('')}
      </div>
    </div>
    ${cats[0] ? `<div class="mt-10" style="font-size:10.5px;color:var(--faint)">${t('home.topCategory', { cat: categoryName(cats[0].id, lang) })}</div>` : ''}
  </div>`;
}

function insightCard(report, lang) {
  const insights = buildInsights(null, report, lang).slice(0, 3);
  if (!insights.length) return '';
  return `<section class="section card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('report.insights')}</div>
        <div class="card-sub">${t('home.categorySub')}</div>
      </div>
      <span class="ins-ic" style="width:26px;height:26px;border-radius:8px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center">${icon('sparkles', 13)}</span>
    </div>
    <div class="insights">${insights.map(insightRow).join('')}</div>
  </section>`;
}

function accountsCard(state, lang) {
  const summary = accountSummary(state);
  const entries = Object.values(summary.accounts);

  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('home.accounts')}</div>
        <div class="card-sub">${t('home.accountsSub')}</div>
      </div>
      <span class="badge neutral">${fmtMoney(summary.total)}</span>
    </div>
    <div class="acct-grid">
      ${entries.map((a) => {
        const acct = accountName(a.id, lang);
        const color = a.id === 'bank' ? '#7C9CFF' : a.id === 'bkash' ? '#FF5C8A' : '#2BD9A2';
        const iconName = a.id === 'bank' ? 'bank' : a.id === 'bkash' ? 'phone' : 'cash';
        const value = Math.abs(a.balance) >= 100000 ? fmtCompact(a.balance) : fmtMoney(a.balance);
        return `<div class="acct">
          <div class="acct-top"><span class="acct-dot" style="background:${color}"></span>${icon(iconName, 11)} ${esc(acct)}</div>
          <div class="acct-val ${a.balance < 0 ? 'neg' : ''}" title="${fmtMoney(a.balance)}">${value}</div>
          <div class="acct-sub">${a.balance < 0 ? t('budget.over') : t('acct.balance')}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function recentCard(state, report, lang) {
  const recent = report.txns.slice(0, 5);
  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('home.recent')}</div>
        <div class="card-sub">${t('home.recentSub')}</div>
      </div>
      <a class="card-link" href="#/activity">${t('home.viewAll')} ${icon('chevronRight', 13)}</a>
    </div>
    ${recent.length
      ? `<div class="txn-list" style="border:0;padding:0;background:transparent">${recent.map((tx) => txnRow(tx, state, lang)).join('')}</div>`
      : `<div class="rep-empty">${t('txn.noneTitle')}</div>`}
  </div>`;
}
