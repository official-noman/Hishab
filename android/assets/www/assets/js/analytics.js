/* =========================================================
   Hishab — analytics: totals, weekly series, balances, insights
   ========================================================= */

import {
  ACCOUNT_IDS, CATEGORY_MAP, EXPENSE_CATEGORIES, categoryName, accountName, getCategory,
} from './categories.js';
import {
  addDaysISO, clamp, diffDays, fmtMoney, formatDate, formatWeekLong, inRange,
  parseISO, startOfWeekISO, todayISO, endOfMonthISO, pct,
} from './utils.js';
import { t } from './i18n.js';
import { memberById } from './store.js';

export function filterTxns(state, opts = {}) {
  const {
    from = '0000-01-01', to = '9999-12-31', memberId = 'all',
    type = 'all', account = 'all', search = '',
  } = opts;
  const q = String(search || '').trim().toLowerCase();

  return state.txns
    .filter((tx) => {
      if (!inRange(tx.date, from, to)) return false;
      if (memberId !== 'all' && tx.memberId !== memberId) return false;
      if (type !== 'all' && tx.type !== type) return false;
      if (account !== 'all' && tx.account !== account) return false;
      if (q) {
        const cat = getCategory(tx.category);
        const member = state.members.find((m) => m.id === tx.memberId);
        const hay = [
          tx.note, tx.ref, tx.source,
          cat.bn, cat.en,
          accountName(tx.account, 'bn'), accountName(tx.account, 'en'),
          member?.name,
          tx.type,
          tx.amount,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d) return d;
      const c = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      if (c) return c;
      return b.id.localeCompare(a.id);
    });
}

export function totals(txns) {
  let income = 0;
  let expense = 0;
  let transfer = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  for (const tx of txns) {
    if (tx.type === 'income') { income += tx.amount; incomeCount += 1; }
    else if (tx.type === 'expense') { expense += tx.amount; expenseCount += 1; }
    else transfer += tx.amount;
  }
  return {
    income,
    expense,
    transfer,
    net: income - expense,
    count: txns.length,
    incomeCount,
    expenseCount,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : null,
  };
}

export function categoryBreakdown(txns, type = 'expense') {
  const map = new Map();
  let total = 0;
  for (const tx of txns) {
    if (tx.type !== type) continue;
    const key = tx.category || (type === 'income' ? 'other-income' : 'other');
    const item = map.get(key) || { id: key, amount: 0, count: 0 };
    item.amount += tx.amount;
    item.count += 1;
    map.set(key, item);
    total += tx.amount;
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      category: CATEGORY_MAP[item.id] || CATEGORY_MAP.other,
      share: total > 0 ? (item.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function memberBreakdown(txns, state, type = 'expense') {
  const map = new Map();
  let total = 0;
  for (const tx of txns) {
    if (tx.type !== type) continue;
    const item = map.get(tx.memberId) || { memberId: tx.memberId, amount: 0, count: 0 };
    item.amount += tx.amount;
    item.count += 1;
    map.set(tx.memberId, item);
    total += tx.amount;
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      member: state.members.find((m) => m.id === item.memberId) || state.members[0],
      share: total > 0 ? (item.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function accountBreakdown(txns) {
  const map = new Map(ACCOUNT_IDS.map((id) => [id, { id, income: 0, expense: 0, count: 0 }]));
  for (const tx of txns) {
    const item = map.get(tx.account);
    if (!item) continue;
    if (tx.type === 'income') item.income += tx.amount;
    else if (tx.type === 'expense') item.expense += tx.amount;
    if (tx.type !== 'transfer') item.count += 1;
  }
  return [...map.values()];
}

/** All-time account balances, including transfers between accounts. */
export function accountSummary(state) {
  const result = Object.fromEntries(ACCOUNT_IDS.map((id) => [id, {
    id,
    opening: state.accounts[id]?.opening || 0,
    income: 0,
    expense: 0,
    transferIn: 0,
    transferOut: 0,
    balance: state.accounts[id]?.opening || 0,
    count: 0,
  }]));

  for (const tx of state.txns) {
    const acct = result[tx.account];
    if (!acct) continue;
    if (tx.type === 'income') {
      acct.income += tx.amount;
      acct.balance += tx.amount;
      acct.count += 1;
    } else if (tx.type === 'expense') {
      acct.expense += tx.amount;
      acct.balance -= tx.amount;
      acct.count += 1;
    } else if (tx.type === 'transfer') {
      acct.transferOut += tx.amount;
      acct.balance -= tx.amount;
      acct.count += 1;
      if (tx.toAccount && result[tx.toAccount]) {
        result[tx.toAccount].transferIn += tx.amount;
        result[tx.toAccount].balance += tx.amount;
      }
    }
  }

  const total = ACCOUNT_IDS.reduce((sum, id) => sum + result[id].balance, 0);
  return { accounts: result, total };
}

/** Effective from/to for stats (handles all-time and future dates). */
export function effectiveRange(txns, from, to, today = todayISO()) {
  let start = from;
  let end = to;
  const all = !from || from <= '0001-01-01' || to >= '9998-01-01';

  if (all) {
    if (txns.length) {
      start = txns[txns.length - 1].date; // txns sorted desc
      end = txns.reduce((max, tx) => (tx.date > max ? tx.date : max), txns[0].date);
      if (end > today) end = today;
    } else {
      start = addDaysISO(today, -29);
      end = today;
    }
  } else {
    if (end > today && start <= today) end = today;
  }
  if (!start) start = today;
  if (!end) end = today;
  if (start > end) start = end;
  return { from: start, to: end, isAll: all };
}

export function weeklySeries(txns, from, to, today = todayISO()) {
  const start = startOfWeekISO(from);
  const lastWeek = startOfWeekISO(to);
  if (!start || !lastWeek) return [];

  const buckets = new Map();
  for (const tx of txns) {
    if (tx.type === 'transfer') continue;
    const key = startOfWeekISO(tx.date);
    const b = buckets.get(key) || { income: 0, expense: 0, count: 0 };
    if (tx.type === 'income') b.income += tx.amount;
    else b.expense += tx.amount;
    b.count += 1;
    buckets.set(key, b);
  }

  const weeks = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= lastWeek && guard < 600) {
    guard += 1;
    const rawEnd = addDaysISO(cursor, 6);
    const b = buckets.get(cursor) || { income: 0, expense: 0, count: 0 };
    const cStart = cursor < from ? from : cursor;
    const cEnd = rawEnd > to ? to : rawEnd;
    weeks.push({
      start: cursor,
      end: rawEnd,
      labelStart: cStart,
      labelEnd: cEnd,
      income: b.income,
      expense: b.expense,
      net: b.income - b.expense,
      count: b.count,
      isCurrent: today >= cursor && today <= rawEnd,
    });
    cursor = addDaysISO(cursor, 7);
  }
  return weeks;
}

export function weeklyChange(weeks) {
  if (!weeks.length) return null;
  const current = weeks[weeks.length - 1];
  const previous = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  if (!previous) return null;
  const prev = previous.expense;
  const cur = current.expense;
  if (prev === 0 && cur === 0) return { pct: 0, dir: 'flat', current, previous };
  if (prev === 0) return { pct: null, dir: 'new', current, previous };
  const change = ((cur - prev) / prev) * 100;
  return {
    pct: change,
    dir: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'flat',
    current,
    previous,
  };
}

export function dailySeries(txns, from, to) {
  const start = from;
  const end = to;
  const span = diffDays(start, end) + 1;
  if (!parseISO(start) || !parseISO(end) || span < 1) {
    return { points: [{ date: start, value: 0 }], granularity: 'day', span: 1 };
  }
  const netByDay = new Map();
  for (const tx of txns) {
    if (tx.type === 'transfer') continue;
    const delta = tx.type === 'income' ? tx.amount : -tx.amount;
    netByDay.set(tx.date, (netByDay.get(tx.date) || 0) + delta);
  }

  const points = [];
  let running = 0;

  if (span <= 130) {
    for (let i = 0; i < span; i += 1) {
      const date = addDaysISO(start, i);
      running += netByDay.get(date) || 0;
      points.push({ date, value: running });
    }
    return { points, granularity: 'day', span };
  }

  // weekly aggregation for long ranges
  let cursor = startOfWeekISO(start);
  let guard = 0;
  while (cursor <= end && guard < 600) {
    guard += 1;
    for (let d = 0; d < 7; d += 1) {
      const date = addDaysISO(cursor, d);
      if (date < start || date > end) continue;
      running += netByDay.get(date) || 0;
    }
    const labelDate = addDaysISO(cursor, 6) > end ? end : addDaysISO(cursor, 6);
    points.push({ date: labelDate, value: running });
    cursor = addDaysISO(cursor, 7);
  }
  return { points, granularity: 'week', span };
}

export function budgetStatus(state, today = todayISO()) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = endOfMonthISO(today);
  let spent = 0;
  for (const tx of state.txns) {
    if (tx.type === 'expense' && inRange(tx.date, monthStart, monthEnd)) spent += tx.amount;
  }
  const budget = Number(state.settings.budget) || 0;
  const total = Number(state.settings.budget) || 0;
  const dt = parseISO(today);
  const dayOfMonth = dt ? dt.getDate() : 1;
  const totalDays = dt ? new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate() : 30;
  const daysLeft = Math.max(1, totalDays - dayOfMonth + 1);
  const remaining = budget - spent;
  const projected = dayOfMonth > 0 ? (spent / dayOfMonth) * totalDays : spent;
  return {
    budget,
    total,
    spent,
    remaining,
    usedPct: budget > 0 ? clamp((spent / budget) * 100, 0, 999) : 0,
    daysLeft,
    dailyAllowance: remaining > 0 ? remaining / daysLeft : 0,
    projected,
    over: budget > 0 && spent > budget,
    monthStart,
    monthEnd,
    dayOfMonth,
    totalDays,
  };
}

export function topExpenses(txns, n = 5) {
  return txns
    .filter((tx) => tx.type === 'expense')
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

export function buildReport(state, opts = {}) {
  const today = todayISO();
  const filtered = filterTxns(state, opts);
  const sum = totals(filtered);
  const effective = effectiveRange(filtered, opts.from, opts.to, today);
  const days = Math.max(1, diffDays(effective.from, effective.to) + 1);
  const weekly = weeklySeries(filtered, effective.from, effective.to, today);
  const accounts = accountSummary(state);
  const budget = budgetStatus(state, today);
  const categories = categoryBreakdown(filtered, 'expense');
  const incomeCategories = categoryBreakdown(filtered, 'income');
  const members = memberBreakdown(filtered, state, 'expense');
  const accountsInPeriod = accountBreakdown(filtered);
  const daily = dailySeries(filtered, effective.from, effective.to);

  return {
    txns: filtered,
    totals: sum,
    days,
    avgDay: days > 0 ? sum.expense / days : 0,
    effective,
    weekly,
    wow: weeklyChange(weekly),
    categories,
    incomeCategories,
    members,
    accounts,
    accountsInPeriod,
    budget,
    top: topExpenses(filtered, 5),
    daily,
  };
}

export function buildInsights(state, report, lang = 'en') {
  const out = [];
  const { totals: sum, categories, weekly, budget, txns } = report;

  if (!sum.expense) {
    out.push({ tone: 'info', icon: 'none', text: t('insight.noExpense') });
    return out;
  }

  if (categories[0]) {
    out.push({
      tone: 'info',
      icon: 'top',
      text: t('insight.top', {
        cat: categoryName(categories[0].id, lang),
        pct: Math.round(categories[0].share),
      }),
    });
  }

  if (report.wow) {
    const { dir, pct: change } = report.wow;
    if (dir === 'up' && change != null) {
      out.push({ tone: 'bad', icon: 'up', text: t('insight.up', { pct: Math.abs(Math.round(change)) }) });
    } else if (dir === 'down' && change != null) {
      out.push({ tone: 'good', icon: 'down', text: t('insight.down', { pct: Math.abs(Math.round(change)) }) });
    }
  }

  out.push({
    tone: 'info',
    icon: 'avg',
    text: t('insight.avg', { amount: fmtMoney(report.avgDay) }),
  });

  if (sum.income > 0) {
    if (sum.net >= 0) {
      out.push({
        tone: 'good',
        icon: 'savings',
        text: t('insight.savingsGood', { pct: Math.round(sum.savingsRate || 0) }),
      });
    } else {
      out.push({
        tone: 'bad',
        icon: 'alert',
        text: t('insight.savingsBad', { amount: fmtMoney(Math.abs(sum.net)) }),
      });
    }
  }

  if (budget.budget > 0) {
    if (budget.over) {
      out.push({
        tone: 'bad',
        icon: 'budget',
        text: t('insight.budgetOver', { amount: fmtMoney(budget.spent - budget.budget) }),
      });
    } else {
      out.push({
        tone: 'good',
        icon: 'budget',
        text: t('insight.budgetOk', { amount: fmtMoney(budget.remaining) }),
      });
    }
  }

  if (report.top[0]) {
    out.push({
      tone: 'info',
      icon: 'biggest',
      text: t('insight.biggest', {
        amount: fmtMoney(report.top[0].amount),
        desc: report.top[0].note || categoryName(report.top[0].category, lang),
      }),
    });
  }

  const meaningful = weekly.filter((w) => w.count > 0);
  if (meaningful.length >= 3) {
    const high = meaningful.reduce((a, b) => (b.expense > a.expense ? b : a));
    const low = meaningful.reduce((a, b) => (b.expense < a.expense ? b : a));
    const highLabel = formatWeekLong(high.labelStart, high.labelEnd, lang);
    const lowLabel = formatWeekLong(low.labelStart, low.labelEnd, lang);
    out.push({
      tone: 'warn',
      icon: 'week',
      text: t('insight.weekHigh', { label: highLabel, amount: fmtMoney(high.expense) }),
    });
    out.push({
      tone: 'good',
      icon: 'week',
      text: t('insight.weekLow', { label: lowLabel, amount: fmtMoney(low.expense) }),
    });
  }

  const cashSpend = txns
    .filter((tx) => tx.type === 'expense' && tx.account === 'cash')
    .reduce((n, tx) => n + tx.amount, 0);
  if (sum.expense > 0 && cashSpend / sum.expense > 0.45) {
    out.push({
      tone: 'warn',
      icon: 'cash',
      text: t('insight.cashHeavy', { pct: Math.round((cashSpend / sum.expense) * 100) }),
    });
  }

  return out;
}

export function weekDayTotals(txns, start, end) {
  const totalsByDay = new Map();
  for (const tx of txns) {
    if (tx.type === 'transfer') continue;
    if (!inRange(tx.date, start, end)) continue;
    const delta = tx.type === 'income' ? tx.amount : -tx.amount;
    totalsByDay.set(tx.date, (totalsByDay.get(tx.date) || 0) + delta);
  }
  return totalsByDay;
}

export function categoryEmoji(id) {
  return getCategory(id).emoji;
}

export function categoryColor(id) {
  return getCategory(id).color;
}

export { EXPENSE_CATEGORIES, memberById, pct };
