/* Run with: npm test */
import assert from 'node:assert/strict';
import {
  buildBackup, demoState, fingerprint, looseFingerprint, mergeStates, parseBackup,
} from '../assets/js/store.js';
import {
  accountSummary, buildInsights, buildReport, budgetStatus, categoryBreakdown,
  filterTxns, memberBreakdown, totals, weeklySeries,
} from '../assets/js/analytics.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const state = demoState();
const dates = state.txns.map((tx) => tx.date).sort();
const span = { from: dates[0], to: dates[dates.length - 1] };

console.log('\nanalytics');

test('demo data has 3 members and realistic transaction volume', () => {
  assert.equal(state.members.length, 3);
  assert.ok(state.txns.length > 80);
  assert.ok(state.settings.budget > 0);
});

test('totals exclude transfers and net is income minus expense', () => {
  const sum = totals(state.txns);
  assert.ok(sum.transfer > 0);
  assert.equal(sum.net, sum.income - sum.expense);
  assert.ok(sum.income > 0 && sum.expense > 0);
  assert.equal(sum.count, state.txns.length);
});

test('date filtering keeps only the requested window', () => {
  const filtered = filterTxns(state, { ...span, memberId: 'all' });
  assert.equal(filtered.length, state.txns.length);
  const lastMonth = filterTxns(state, { from: span.to, to: span.to });
  assert.ok(lastMonth.length > 0);
  assert.ok(lastMonth.every((tx) => tx.date === span.to));
});

test('member filter returns only that member', () => {
  const member = state.members[1];
  const filtered = filterTxns(state, { ...span, memberId: member.id });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((tx) => tx.memberId === member.id));
  const breakdown = memberBreakdown(filtered, state, 'expense');
  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0].memberId, member.id);
});

test('weekly series covers the range and adds up to the totals', () => {
  const filtered = filterTxns(state, { ...span });
  const weeks = weeklySeries(filtered, span.from, span.to);
  assert.ok(weeks.length >= 3);
  const sum = totals(filtered);
  const weekExpense = weeks.reduce((n, week) => n + week.expense, 0);
  const weekIncome = weeks.reduce((n, week) => n + week.income, 0);
  assert.ok(Math.abs(weekExpense - sum.expense) < 0.01);
  assert.ok(Math.abs(weekIncome - sum.income) < 0.01);
});

test('category breakdown shares add up to 100%', () => {
  const categories = categoryBreakdown(state.txns, 'expense');
  assert.ok(categories.length > 3);
  const share = categories.reduce((n, cat) => n + cat.share, 0);
  assert.ok(Math.abs(share - 100) < 0.01);
  assert.ok(categories[0].amount >= categories[categories.length - 1].amount);
});

test('account balances include openings and ignore transfer double counting', () => {
  const summary = accountSummary(state);
  const sum = totals(state.txns);
  const openings = state.accounts.bank.opening + state.accounts.bkash.opening + state.accounts.cash.opening;
  assert.ok(Math.abs(summary.total - (openings + sum.income - sum.expense)) < 0.01);
  for (const id of ['bank', 'bkash', 'cash']) {
    assert.ok(Number.isFinite(summary.accounts[id].balance));
  }
});

test('ATM withdrawal moves Bank to Cash without changing net balance', () => {
  const s = demoState();
  s.accounts.bank.opening = 10000;
  s.accounts.bkash.opening = 500;
  s.accounts.cash.opening = 1000;
  s.txns = [{
    id: 't_atm',
    memberId: s.members[0].id,
    date: '2026-10-20',
    type: 'transfer',
    amount: 2000,
    category: 'transfer',
    account: 'bank',
    toAccount: 'cash',
    note: 'ATM withdrawal',
    ref: 'ATM-1',
    source: 'bank',
    createdAt: '2026-10-20T10:00:00.000Z',
  }];
  const summary = accountSummary(s);
  assert.equal(summary.accounts.bank.balance, 8000);
  assert.equal(summary.accounts.cash.balance, 3000);
  assert.equal(summary.accounts.bkash.balance, 500);
  assert.equal(summary.total, 11500);
  assert.equal(totals(s.txns).expense, 0);
  assert.equal(totals(s.txns).transfer, 2000);
  assert.equal(totals(s.txns).net, 0);
});

test('report builder applies filters, weeks, insights and budget', () => {
  const report = buildReport(state, { ...span, memberId: state.members[0].id });
  assert.equal(report.txns.length, filterTxns(state, { ...span, memberId: state.members[0].id }).length);
  assert.ok(report.weekly.length > 0);
  assert.ok(report.categories.length > 0);
  assert.equal(report.members.length, 1);
  assert.ok(report.top.length <= 5);
  assert.equal(typeof report.avgDay, 'number');
  const insights = buildInsights(null, report, 'bn');
  assert.ok(insights.length >= 2);
  assert.ok(insights.every((item) => item.text && item.text.length > 0));
});

test('budget status reports spending and remaining amount', () => {
  const status = budgetStatus(state);
  assert.ok(status.budget > 0);
  assert.ok(status.spent > 0);
  assert.equal(status.remaining, status.budget - status.spent);
  assert.ok(status.usedPct > 0);
});

test('backup round-trip is valid and merge is idempotent', () => {
  const backup = buildBackup(state);
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.txns.length, state.txns.length);
  const merged = mergeStates(state, parsed);
  assert.equal(merged.added, 0);
  assert.equal(merged.membersAdded, 0);
  assert.equal(merged.state.txns.length, state.txns.length);
  assert.throws(() => parseBackup({ app: 'other' }), /invalid-backup/);
});

test('merging a backup with a new transaction adds exactly one', () => {
  const incoming = JSON.parse(JSON.stringify(state));
  incoming.txns.push({
    id: 'backup_extra_1',
    memberId: incoming.members[0].id,
    date: span.to,
    type: 'expense',
    amount: 777,
    category: 'other',
    account: 'cash',
    note: 'backup only entry',
    ref: 'BACKUP-EXTRA',
    source: 'manual',
  });
  const merged = mergeStates(state, parseBackup({
    app: 'hishab', format: 1, state: incoming,
  }));
  assert.equal(merged.added, 1);
  assert.equal(merged.state.txns.length, state.txns.length + 1);
});

test('fingerprint is stable for the same statement row', () => {
  const tx = { source: 'bank', date: '2026-10-01', amount: 1200, ref: 'ABC', note: 'x' };
  assert.equal(fingerprint(tx), fingerprint({ ...tx, note: 'different' }));
  assert.notEqual(fingerprint(tx), fingerprint({ ...tx, amount: 1201 }));
});

test('loose fingerprint matches a PDF row and an OCR row', () => {
  const pdfRow = {
    type: 'expense', date: '2026-10-03', amount: 12000,
    note: 'House Rent RENT-OCT',
  };
  const ocrRow = {
    type: 'expense', date: '2026-10-03', amount: 12000,
    note: 'House  Rent',
  };
  assert.equal(looseFingerprint(pdfRow), looseFingerprint(ocrRow));
  assert.notEqual(
    looseFingerprint(pdfRow),
    looseFingerprint({ ...ocrRow, amount: 12001 }),
  );
});

console.log(`\n${passed} analytics tests passed\n`);
