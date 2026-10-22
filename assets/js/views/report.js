/* =========================================================
   Hishab — full report view (screen + print layout)
   ========================================================= */

import { ACCOUNT_IDS, accountName, categoryName, getCategory } from '../categories.js';
import { buildInsights } from '../analytics.js';
import {
  avatar, badge, catIcon, categoryRow, emptyState, icon, insightRow,
  progress, statCard,
} from '../components.js';
import { donutChart, weeklyBarChart } from '../charts.js';
import { t } from '../i18n.js';
import {
  esc, fmtMoney, formatDate, formatRangeLabel, formatWeekLong, todayISO,
} from '../utils.js';

export function reportView(ctx) {
  const { state, ui, report, lang } = ctx;
  const member = state.members.find((m) => m.id === state.activeMember);
  const memberLabel = state.activeMember === 'all'
    ? t('report.memberAll')
    : (member?.name || t('report.memberAll'));
  const rangeLabel = ui.preset === 'all'
    ? t('preset.all')
    : formatRangeLabel(report.effective.from, report.effective.to, lang);
  const generated = formatDate(todayISO(), 'long', lang);
  const empty = report.txns.length === 0;

  return `${printHead(rangeLabel, memberLabel, generated)}
    ${heroCard(report, rangeLabel, memberLabel)}
    ${empty
      ? `<section class="section card">${emptyState({
        emoji: '📊',
        title: t('report.noData'),
        desc: t('empty.importDesc'),
        actions: `
          <a class="btn primary small" href="#/import">${icon('import', 14)}${t('home.emptyImport')}</a>
          <button class="btn small" data-action="open-add">${icon('plus', 14)}${t('home.emptyAdd')}</button>
        `,
      })}</section>`
      : `${summaryStats(report, lang)}
        ${insightCard(report, lang)}
        ${weeklyCard(report, lang)}
        ${categoryCard(report, lang)}
        ${memberCard(report, lang)}
        ${accountCard(report, lang)}
        ${topCard(report, state, lang)}`}
    <div class="footer-note no-print">${icon('shield', 12)} ${t('home.noTransfer')} · ${t('app.footer')}</div>
    <div class="print-only print-sign">
      <span>${t('print.disclaimer')}</span>
      <span>${esc(t('report.generated', { date: generated }))}</span>
    </div>`;
}

/* ------------------------------ print header ------------------------------ */
function printHead(rangeLabel, memberLabel, generated) {
  return `<div class="print-only print-head">
    <div>
      <div class="print-brand">${t('app.name')}<small>HISHAB</small></div>
      <div style="font-size:10px;color:#5b6b7a;margin-top:2px">${t('print.report')}</div>
    </div>
    <div class="print-meta">
      <div>${t('print.period')}: <b>${esc(rangeLabel)}</b></div>
      <div>${t('print.member')}: <b>${esc(memberLabel)}</b></div>
      <div>${t('print.generated')}: <b>${esc(generated)}</b></div>
    </div>
  </div>`;
}

/* ------------------------------ hero ------------------------------ */
function heroCard(report, rangeLabel, memberLabel) {
  const net = report.totals.net;
  const cls = net < 0 ? 'neg' : net > 0 ? 'pos' : '';
  const rate = report.totals.savingsRate;

  return `<section class="section">
    <div class="report-hero">
      <div class="report-label">
        <span>${t('report.title')} · ${esc(rangeLabel)}</span>
        <span>${esc(memberLabel)}</span>
      </div>
      <div class="report-net ${cls}">${fmtMoney(net, { sign: true })}</div>
      <div class="report-meta-grid">
        <div class="rm">
          <div class="rm-label">${t('home.income')}</div>
          <div class="rm-val pos">${fmtMoney(report.totals.income)}</div>
        </div>
        <div class="rm">
          <div class="rm-label">${t('home.expense')}</div>
          <div class="rm-val neg">${fmtMoney(report.totals.expense)}</div>
        </div>
        <div class="rm">
          <div class="rm-label">${t('report.savings')}</div>
          <div class="rm-val">${rate == null ? '—' : `${Math.round(rate)}%`}</div>
        </div>
      </div>
      <div class="report-actions no-print">
        <button class="btn small ghost" type="button" data-action="report-print">${icon('print', 14)}${t('report.print')}</button>
        <button class="btn small ghost" type="button" data-action="report-csv">${icon('download', 14)}${t('report.csv')}</button>
        <button class="btn small ghost" type="button" data-action="report-share">${icon('share', 14)}${t('report.share')}</button>
      </div>
    </div>
  </section>`;
}

/* ------------------------------ stats ------------------------------ */
function summaryStats(report, lang) {
  const biggest = report.top[0];
  const rate = report.totals.savingsRate;
  const count = report.totals.incomeCount + report.totals.expenseCount;
  return `<section class="section stat-grid">
    ${statCard({
      label: t('report.avgDay'), value: fmtMoney(report.avgDay),
      sub: t('stat.avgSub', { n: report.days }), iconName: 'chart', color: 'var(--amber)',
    })}
    ${statCard({
      label: t('report.savings'), value: rate == null ? '—' : `${Math.round(rate)}%`,
      sub: t('stat.savingsSub', { pct: rate == null ? 0 : Math.round(rate) }),
      tone: rate != null && rate < 0 ? 'neg' : rate != null && rate > 0 ? 'pos' : '',
      iconName: 'wallet', color: 'var(--income)',
    })}
    ${statCard({
      label: t('report.txns'), value: String(count),
      sub: t('home.noTransfer'), iconName: 'receipt', color: 'var(--accent)',
    })}
    ${statCard({
      label: t('report.biggest'), value: biggest ? fmtMoney(biggest.amount) : '—',
      sub: biggest ? (biggest.note || categoryName(biggest.category, lang)).slice(0, 34) : t('common.noData'),
      iconName: 'trendUp', color: 'var(--expense)',
    })}
  </section>`;
}

/* ------------------------------ insights ------------------------------ */
function insightCard(report, lang) {
  const insights = buildInsights(null, report, lang);
  const today = todayISO();
  if (report.budget.budget > 0 && report.budget.projected > 0 && report.effective.to >= today) {
    insights.push({
      tone: 'info',
      icon: 'budget',
      text: t('insight.projection', { amount: fmtMoney(report.budget.projected) }),
    });
  }
  if (!insights.length) return '';

  return `<section class="section card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('report.insights')}</div>
        <div class="card-sub">${t('report.weeklySub')}</div>
      </div>
      <span class="ins-ic" style="width:26px;height:26px;border-radius:8px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center">${icon('sparkles', 13)}</span>
    </div>
    <div class="insights">${insights.map(insightRow).join('')}</div>
  </section>`;
}

/* ------------------------------ weekly ------------------------------ */
function weeklyCard(report, lang) {
  const weeks = report.weekly;
  const recent = weeks.slice(-12);
  const hasData = recent.some((w) => w.income > 0 || w.expense > 0);
  const totalWeeks = weeks.length;

  const rows = recent.map((w) => `<tr>
    <td class="week">${esc(formatWeekLong(w.labelStart, w.labelEnd, lang))}${w.isCurrent ? ` <span class="tag">${t('txn.today')}</span>` : ''}</td>
    <td class="r">${fmtMoney(w.income)}</td>
    <td class="r">${fmtMoney(w.expense)}</td>
    <td class="r ${w.net < 0 ? 'neg' : w.net > 0 ? 'pos' : ''}">${fmtMoney(w.net)}</td>
  </tr>`).join('');

  return `<section class="section card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('report.weekly')}</div>
        <div class="card-sub">${t('report.weeklySub')}</div>
      </div>
      ${report.wow && report.wow.pct != null
        ? badge(`${Math.abs(Math.round(report.wow.pct))}%`, report.wow.dir === 'up' ? 'bad' : 'good', report.wow.dir === 'up' ? 'trendUp' : 'trendDown')
        : badge(t('chart.weekHint'), 'neutral')}
    </div>
    <div class="chart">${weeklyBarChart(recent, { lang })}</div>
    <div class="chart-legend-row">
      <div class="legend">
        <span class="legend-item income"><i class="dot"></i>${t('chart.income')}</span>
        <span class="legend-item expense"><i class="dot"></i>${t('chart.expense')}</span>
      </div>
      ${totalWeeks > 12 ? `<span style="font-size:9.5px;color:var(--faint)">${t('report.moreWeeks', { n: 12 })}</span>` : ''}
    </div>
    <div class="divider"></div>
    ${hasData
      ? `<div class="table-wrap">
          <table class="rep">
            <thead><tr>
              <th>${t('report.week')}</th>
              <th class="r">${t('report.income')}</th>
              <th class="r">${t('report.expense')}</th>
              <th class="r">${t('report.netCol')}</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
      : `<div class="rep-empty">${t('report.noData')}</div>`}
  </section>`;
}

/* ------------------------------ categories ------------------------------ */
function categoryCard(report, lang) {
  const cats = report.categories;
  if (!cats.length) return '';
  const top = cats.slice(0, 6);
  const total = report.totals.expense;
  const donutItems = top.map((c) => ({
    ...c,
    name: categoryName(c.id, lang),
    category: getCategory(c.id),
  }));

  return `<section class="section card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('report.categories')}</div>
        <div class="card-sub">${t('home.categorySub')}</div>
      </div>
      <span class="badge neutral">${fmtMoney(total)}</span>
    </div>
    <div class="donut-wrap">
      <div class="donut">${donutChart(donutItems, { total })}</div>
      <div class="grow">
        <div style="font-size:10px;color:var(--faint)">${t('home.topCategory', { cat: categoryName(cats[0].id, lang) })}</div>
        <div style="font-size:19px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums">${fmtMoney(cats[0].amount)}</div>
        <div style="font-size:10px;color:var(--faint);margin-top:2px">${t('txn.count', { n: cats[0].count })} · ${Math.round(cats[0].share)}%</div>
        <div class="mt-10">${progress(cats[0].share, getCategory(cats[0].id).color)}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="cat-full-list">
      ${cats.map((c) => categoryRow(c, lang, total)).join('')}
    </div>
  </section>`;
}

/* ------------------------------ members ------------------------------ */
function memberCard(report, lang) {
  const members = report.members;
  if (!members.length) return '';

  return `<section class="section card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('report.members')}</div>
        <div class="card-sub">${t('report.memberAll')}</div>
      </div>
      <span class="badge neutral">${t('app.memberCount', { n: members.length })}</span>
    </div>
    <div class="member-list">
      ${members.map((m) => `<div class="member-row">
        ${avatar(m.member)}
        <div class="m-main">
          <div class="m-top">
            <span class="m-name">${esc(m.member.name)}</span>
            <span class="m-amt">${fmtMoney(m.amount)}</span>
          </div>
          ${progress(m.share, m.member.color)}
          <div class="m-sub">${esc(t('member.txns', { n: m.count }))} · ${Math.round(m.share)}%</div>
        </div>
      </div>`).join('')}
    </div>
  </section>`;
}

/* ------------------------------ accounts ------------------------------ */
function accountCard(report, lang) {
  // report.accounts already holds the all-time balances; use it directly.
  const period = Object.fromEntries(report.accountsInPeriod.map((a) => [a.id, a]));

  return `<section class="section card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('report.accounts')}</div>
        <div class="card-sub">${t('report.accountBalance')}</div>
      </div>
      <span class="badge neutral">${fmtMoney(report.accounts.total)}</span>
    </div>
    <div class="table-wrap">
      <table class="rep">
        <thead><tr>
          <th>${t('txn.account')}</th>
          <th class="r">${t('acct.in')}</th>
          <th class="r">${t('acct.out')}</th>
          <th class="r">${t('acct.current')}</th>
        </tr></thead>
        <tbody>
          ${ACCOUNT_IDS.map((id) => {
            const a = report.accounts.accounts[id];
            const p = period[id] || { income: 0, expense: 0 };
            return `<tr>
              <td class="week">${esc(accountName(id, lang))}</td>
              <td class="r pos">${fmtMoney(p.income)}</td>
              <td class="r">${fmtMoney(p.expense)}</td>
              <td class="r ${a.balance < 0 ? 'neg' : ''}">${fmtMoney(a.balance)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="hint">${t('home.accountsSub')} · ${t('home.noTransfer')}</div>
  </section>`;
}

/* ------------------------------ top expenses ------------------------------ */
function topCard(report, state, lang) {
  const top = report.top;
  if (!top.length) return '';
  return `<section class="section card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('report.top')}</div>
        <div class="card-sub">${t('report.topSpend')}</div>
      </div>
      <span class="ins-ic" style="width:26px;height:26px;border-radius:8px;background:var(--expense-soft);color:var(--expense);display:grid;place-items:center">${icon('trendUp', 13)}</span>
    </div>
    <div class="top-list">
      ${top.map((tx, i) => {
        const member = state.members.find((m) => m.id === tx.memberId);
        return `<div class="top-item">
          <span class="top-rank">${i + 1}</span>
          ${catIcon(tx.category, 'sm')}
          <div class="top-main">
            <div class="top-desc">${esc(tx.note || categoryName(tx.category, lang))}</div>
            <div class="top-meta">${esc(formatDate(tx.date, 'short', lang))} · ${esc(categoryName(tx.category, lang))}${member && state.activeMember === 'all' ? ` · ${esc(member.name)}` : ''}</div>
          </div>
          <span class="top-amt">-${fmtMoney(tx.amount)}</span>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}
