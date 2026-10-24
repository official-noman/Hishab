/* On-device assistant search. Run with: npm test */
import assert from 'node:assert/strict';
import { accountSummary } from '../assets/js/analytics.js';
import { answerQuestion, exampleQuestions } from '../assets/js/assistant.js';
import { defaultState } from '../assets/js/store.js';

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

const TODAY = '2026-10-23';

function makeState() {
  const state = defaultState();
  state.accounts = {
    bank: { opening: 10000 },
    bkash: { opening: 5000 },
    cash: { opening: 1000 },
  };
  state.contacts = [
    { id: 'c_jemmy', name: 'Jemmy bhai', phone: '918272727', createdAt: '2026-09-01T00:00:00.000Z' },
  ];
  state.txns = [
    {
      id: 't1', date: '2026-10-20', type: 'expense', amount: 500, category: 'shopping',
      account: 'cash', memberId: 'm_self', note: 'Daraz POS purchase', ref: 'POS-1',
    },
    {
      id: 't2', date: '2026-10-10', type: 'expense', amount: 850, category: 'food',
      account: 'bkash', memberId: 'm_self', note: 'Rizq restaurant',
    },
    {
      id: 't3', date: '2026-09-15', type: 'expense', amount: 2000, category: 'family',
      account: 'bkash', memberId: 'm_self', note: 'Send money to Jemmy bhai 918272727',
    },
    {
      id: 't4', date: '2026-09-05', type: 'expense', amount: 1200, category: 'shopping',
      account: 'cash', memberId: 'm_self', note: 'Daraz dress',
    },
    {
      id: 't5', date: '2026-09-20', type: 'expense', amount: 700, category: 'bills',
      account: 'bank', memberId: 'm_self', note: 'Pay bill electricity',
    },
    {
      id: 't6', date: '2026-10-01', type: 'income', amount: 50000, category: 'salary',
      account: 'bank', memberId: 'm_self', note: 'Monthly salary',
    },
    {
      id: 't7', date: '2026-10-05', type: 'transfer', amount: 3000, category: 'transfer',
      account: 'bank', toAccount: 'cash', memberId: 'm_self', note: 'ATM cash out',
    },
    {
      id: 't8', date: '2026-08-15', type: 'expense', amount: 400, category: 'food',
      account: 'cash', memberId: 'm_family1', note: 'Rizq restaurant',
    },
  ];
  return state;
}

const state = makeState();
const ask = (query, opts = {}) => answerQuestion(query, state, { today: TODAY, ...opts });

console.log('\nassistant');

test('shopping last month is filtered by category and calendar month', () => {
  const answer = ask('how much money i spent in shopping last month?');
  assert.equal(answer.ok, true);
  assert.equal(answer.type, 'expense');
  assert.equal(answer.count, 1);
  assert.equal(answer.total, 1200);
  assert.equal(answer.range.from, '2026-09-01');
  assert.equal(answer.range.to, '2026-09-30');
  assert.equal(answer.txns[0].date, '2026-09-05');
});

test('merchant/note search finds Rizq restaurant across all members', () => {
  const answer = ask('how much at Rizq restaurant?');
  assert.equal(answer.ok, true);
  assert.equal(answer.count, 2);
  assert.equal(answer.total, 1250);
  assert.ok(answer.title.toLowerCase().includes('rizq'));
  assert.ok(answer.txns.every((tx) => tx.note.includes('Rizq')));
});

test('saved contact name and phone answer the same question with dates', () => {
  const byName = ask('how much money i give jemmy bhai?');
  const byPhone = ask('how much did i give 918272727?');
  assert.equal(byName.count, 1);
  assert.equal(byName.total, 2000);
  assert.equal(byName.contact.name, 'Jemmy bhai');
  assert.equal(byName.txns[0].date, '2026-09-15');
  assert.ok(byName.text.includes('Jemmy bhai'));
  assert.equal(byPhone.total, 2000);
  assert.equal(byPhone.contact.name, 'Jemmy bhai');
});

test('POS typo is understood and lists POS transactions', () => {
  const answer = ask('transiction via poss');
  assert.equal(answer.ok, true);
  assert.equal(answer.count, 1);
  assert.equal(answer.total, 500);
  assert.equal(answer.txns[0].ref, 'POS-1');
});

test('bill payment query uses the bills category', () => {
  const answer = ask('show bill payments this year');
  assert.equal(answer.ok, true);
  assert.equal(answer.count, 1);
  assert.equal(answer.total, 700);
});

test('spending totals exclude transfers and income', () => {
  const answer = ask('how much did i spend this month');
  assert.equal(answer.type, 'expense');
  assert.equal(answer.total, 1350);
  assert.equal(answer.count, 2);
  assert.ok(!answer.txns.some((tx) => tx.type === 'transfer'));
  assert.ok(!answer.txns.some((tx) => tx.type === 'income'));
});

test('explicit last N applies to the count and keeps total matches', () => {
  const answer = ask('show last 3 transactions');
  assert.equal(answer.type, 'all');
  assert.equal(answer.count, 3);
  assert.equal(answer.txns.length, 3);
  assert.equal(answer.totalMatches, 8);
  assert.equal(answer.more, 5);
});

test('all transactions and member filtering work', () => {
  const all = ask('show all transactions');
  assert.equal(all.count, 8);
  const family = ask('family 1 food');
  assert.equal(family.count, 1);
  assert.equal(family.total, 400);
  assert.equal(family.txns[0].memberId, 'm_family1');
});

test('balance answers use all-time account balances', () => {
  const answer = ask('what is my bank balance?');
  const summary = accountSummary(state);
  assert.equal(answer.intent, 'balance');
  assert.equal(answer.total, summary.accounts.bank.balance);
  assert.equal(answer.balances.length, 3);
  assert.ok(answer.text.includes('Bank'));
});

test('help, greeting and no-match answers are safe fallbacks', () => {
  const help = ask('help');
  assert.equal(help.intent, 'help');
  assert.ok(help.text.includes('Saved contacts'));
  const greeting = ask('hello');
  assert.equal(greeting.intent, 'greeting');
  const empty = ask('zoo entrance fee');
  assert.equal(empty.ok, false);
  assert.equal(empty.empty, true);
  assert.ok(empty.text.includes('couldn’t find'));
});

test('examples include a saved contact and core questions', () => {
  const examples = exampleQuestions(state);
  assert.ok(examples.some((item) => item.includes('Jemmy bhai')));
  assert.ok(examples.some((item) => item.includes('shopping')));
  assert.ok(examples.length <= 6);
});

console.log(`\n${passed} assistant tests passed`);
