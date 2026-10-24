/* Run with: npm test */
import assert from 'node:assert/strict';
import {
  SAMPLE_BANK_CSV, SAMPLE_BKASH_CSV, SAMPLE_BKASH_TEXT,
  classifyHeader, detectSource, parseStatement,
} from '../assets/js/parsers.js';
import { parseNumber } from '../assets/js/utils.js';
import { isCashOutDescription, suggestedTransferTarget } from '../assets/js/categories.js';

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

console.log('\nparsers');

test('bank CSV: 15 rows, header and totals detected', () => {
  const result = parseStatement(SAMPLE_BANK_CSV);
  assert.equal(result.ok, true);
  assert.equal(result.format, 'csv');
  assert.equal(result.source, 'bank');
  assert.equal(result.rows.length, 15);
  const total = result.rows.reduce((sum, row) => sum + row.amount, 0);
  assert.ok(total > 100000);
});

test('bank CSV: debit becomes expense, credit becomes income', () => {
  const { rows } = parseStatement(SAMPLE_BANK_CSV);
  const salary = rows.find((row) => row.ref === 'SAL-OCT-26');
  const rent = rows.find((row) => row.ref === 'RENT-OCT');
  assert.equal(salary.type, 'income');
  assert.equal(salary.amount, 58000);
  assert.equal(salary.category, 'salary');
  assert.equal(rent.type, 'expense');
  assert.equal(rent.amount, 12000);
  assert.equal(rent.category, 'rent');
});

test('bank CSV: ATM and deposits become transfers (no double count)', () => {
  const { rows } = parseStatement(SAMPLE_BANK_CSV);
  const atm = rows.find((row) => row.ref === 'ATM-4412');
  const deposit = rows.find((row) => row.ref === 'CD-1200');
  const addMoney = rows.find((row) => row.ref === 'BK-8822');
  assert.equal(atm.type, 'transfer');
  assert.equal(atm.account, 'bank');
  assert.equal(atm.toAccount, 'cash');
  assert.equal(deposit.type, 'transfer');
  assert.equal(deposit.account, 'cash');
  assert.equal(deposit.toAccount, 'bank');
  assert.equal(addMoney.type, 'transfer');
  assert.equal(addMoney.toAccount, 'bkash');
});

test('bank CASH OUT / ATM goes to Cash, never bKash', () => {
  const csv = `Date,Description,Reference,Debit,Credit,Balance
01/10/2026,CASH OUT,TRX-1,2000.00,,8000.00
02/10/2026,ATM WITHDRAWAL,TRX-2,1500.00,,6500.00
03/10/2026,CASH WDL,TRX-3,500.00,,6000.00
04/10/2026,CASH OUT CHARGE,TRX-4,20.00,,5980.00
`;
  const { rows } = parseStatement(csv, { sourceHint: 'bank' });
  const cashOut = rows.find((row) => row.ref === 'TRX-1');
  const atm = rows.find((row) => row.ref === 'TRX-2');
  const wdl = rows.find((row) => row.ref === 'TRX-3');
  const fee = rows.find((row) => row.ref === 'TRX-4');
  for (const row of [cashOut, atm, wdl]) {
    assert.equal(row.type, 'transfer');
    assert.equal(row.account, 'bank');
    assert.equal(row.toAccount, 'cash');
  }
  assert.equal(fee.type, 'expense');
  assert.equal(fee.category, 'fees');
});

test('bKash CSV: Cash Out still goes to Cash', () => {
  const csv = `Date,Time,Trx ID,Description,Amount,Balance
01/10/2026,10:00,TRX-1,Cash Out,-2000.00,8000.00
`;
  const { rows } = parseStatement(csv, { sourceHint: 'bkash' });
  assert.equal(rows[0].type, 'transfer');
  assert.equal(rows[0].account, 'bkash');
  assert.equal(rows[0].toAccount, 'cash');
});

test('ATM deposit goes from Cash into Bank, not the other way', () => {
  const csv = `Date,Description,Reference,Debit,Credit,Balance
05/10/2026,ATM DEPOSIT,TRX-5,,1000.00,6980.00
`;
  const { rows } = parseStatement(csv, { sourceHint: 'bank' });
  assert.equal(rows[0].type, 'transfer');
  assert.equal(rows[0].account, 'cash');
  assert.equal(rows[0].toAccount, 'bank');
});

test('bKash CSV: source detection and refs', () => {
  const result = parseStatement(SAMPLE_BKASH_CSV);
  assert.equal(result.ok, true);
  assert.equal(result.source, 'bkash');
  assert.equal(result.rows.length, 10);
  const food = result.rows.find((row) => row.ref === 'K7L8M9N0P1');
  assert.equal(food.type, 'expense');
  assert.equal(food.amount, 450);
  assert.equal(food.category, 'food');
});

test('bKash pasted text: 15 rows with signed amounts', () => {
  const result = parseStatement(SAMPLE_BKASH_TEXT);
  assert.equal(result.ok, true);
  assert.equal(result.format, 'text');
  assert.equal(result.rows.length, 15);
  const cashOut = result.rows.filter((row) => row.type === 'transfer' && row.account === 'bkash');
  assert.ok(cashOut.length >= 2);
});

test('dates: DMY and month names', () => {
  const { rows } = parseStatement('Date,Description,Amount\n15/10/2026,Coffee,-120.00\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-15');
});

test('empty or unrecognised input is reported, not thrown', () => {
  assert.equal(parseStatement('').ok, false);
  assert.equal(parseStatement('hello world, nothing here').ok, false);
});

test('source hints are respected', () => {
  assert.equal(detectSource('random', 'bkash'), 'bkash');
  assert.equal(detectSource('bKash Statement\nTrx ID, Cash Out'), 'bkash');
});

test('cash-out descriptions are routed to Cash, fees are not', () => {
  assert.equal(isCashOutDescription('ATM withdrawal'), true);
  assert.equal(isCashOutDescription('Cash Out'), true);
  assert.equal(isCashOutDescription('CASH WDL'), true);
  assert.equal(isCashOutDescription('Cash Out charge'), false);
  assert.equal(isCashOutDescription('ATM deposit'), false);
  assert.equal(suggestedTransferTarget('bank', 'ATM withdrawal'), 'cash');
  assert.equal(suggestedTransferTarget('bkash', 'Cash Out'), 'cash');
  assert.equal(suggestedTransferTarget('cash', ''), 'bank');
});

test('header classifier understands Dr/Cr and Bengali', () => {
  assert.equal(classifyHeader('Debit'), 'debit');
  assert.equal(classifyHeader('Credit'), 'credit');
  assert.equal(classifyHeader('Trx ID'), 'ref');
  assert.equal(classifyHeader('তারিখ'), 'date');
  assert.equal(classifyHeader('বিবরণ'), 'desc');
});

test('money parser handles separators and dr/cr', () => {
  assert.equal(parseNumber('1,234.50'), 1234.5);
  assert.equal(parseNumber('(1,200)'), -1200);
  assert.equal(parseNumber('৳ 2,350'), 2350);
  assert.equal(parseNumber('1.200,50'), 1200.5);
  assert.equal(parseNumber('1250 Dr'), 1250);
});

console.log(`\n${passed} parser tests passed\n`);
