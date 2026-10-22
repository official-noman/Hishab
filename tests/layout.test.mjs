/* Statement-layout regressions for the real BRAC PDF and bKash screenshots. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStatement } from '../assets/js/parsers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);
const read = (name) => fs.readFileSync(fixture(name), 'utf8');

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

function totals(rows) {
  return rows.reduce((out, row) => {
    out[row.type] = (out[row.type] || 0) + row.amount;
    return out;
  }, {});
}

function bkashLayout(name) {
  const raw = JSON.parse(read(name));
  const words = raw.map((w) => ({
    text: w.text,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    conf: w.conf,
    left: w.x,
    right: w.x + w.w,
    top: w.y,
    height: w.h,
  }));
  return {
    text: words.map((w) => w.text).join(' '),
    layout: { pages: [{ page: 1, width: 702, height: 1600, words }] },
  };
}

console.log('\nstatement layout');

test('BRAC PDF text layer: 42 rows and exact totals', () => {
  const result = parseStatement(read('brac-text.txt'), { sourceHint: 'bank' });
  assert.equal(result.ok, true);
  assert.equal(result.format, 'text');
  assert.equal(result.rows.length, 42);
  const sums = totals(result.rows);
  assert.equal(sums.income, 51500);
  assert.equal(sums.expense, 35727);
  assert.equal(sums.transfer, 2500);
});

test('BRAC PDF word coordinates: same 42 rows as the text layer', () => {
  const layout = JSON.parse(read('brac-layout.json'));
  const result = parseStatement(read('brac-text.txt'), { sourceHint: 'bank', layout });
  assert.equal(result.ok, true);
  assert.equal(result.format, 'layout');
  assert.equal(result.rows.length, 42);
  const sums = totals(result.rows);
  assert.equal(sums.income, 51500);
  assert.equal(sums.expense, 35727);
  assert.equal(sums.transfer, 2500);
  assert.deepEqual(result.warnings, []);
});

test('bKash screenshot 2: partial top table and repeated header', () => {
  const source = bkashLayout('words-bkash-2.json');
  const result = parseStatement(source.text, { sourceHint: 'bkash', layout: source.layout });
  assert.equal(result.ok, true);
  assert.equal(result.format, 'layout');
  assert.ok(result.rows.length >= 35, `expected at least 35 rows, got ${result.rows.length}`);

  assert.ok(result.rows.some((row) => row.date === '2026-09-24' && row.type === 'transfer' && row.amount === 200 && row.balance === 299.87));
  assert.ok(result.rows.some((row) => row.date === '2026-09-24' && row.type === 'transfer' && row.amount === 260));
  assert.ok(result.rows.some((row) => row.date === '2026-09-26' && row.type === 'income' && row.amount === 150));
  assert.ok(result.rows.some((row) => /cash out/i.test(row.description) && row.category === 'fees' && row.amount === 2.79));
  assert.ok(result.rows.some((row) => /cash ost/i.test(row.description) && row.category === 'fees' && row.amount === 3.63));

  let last = '';
  for (const row of result.rows) {
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.amount > 0, 'every imported row must have a positive amount');
    assert.ok(row.date >= last, 'rows must stay in chronological order');
    last = row.date;
  }
  assert.ok(result.rows.filter((row) => row.balance != null).length >= 20);
  assert.ok(result.warnings.includes('balance-mismatch'));
});

test('bKash screenshot 1: scrolled page with a partial header', () => {
  const source = bkashLayout('words-bkash-1.json');
  const result = parseStatement(source.text, { sourceHint: 'bkash', layout: source.layout });
  assert.equal(result.ok, true);
  assert.equal(result.format, 'layout');
  assert.ok(result.rows.length >= 25, `expected at least 25 rows, got ${result.rows.length}`);
  assert.ok(result.rows.some((row) => row.date === '2026-10-09' && row.type === 'income' && row.amount === 2140));
  assert.ok(result.rows.some((row) => row.date === '2026-10-12' && row.amount === 1995.56));
  assert.ok(result.rows.every((row) => row.amount > 0 && row.date));
});

test('partial bKash header is rebuilt from visible right-hand columns', () => {
  const words = [
    ['Transaction', 113, 100, 60],
    ['Transaction Details', 237, 100, 84],
    ['Charge/Fee', 584, 100, 48],
    ['Balance', 649, 100, 35],
    ['12-Oct-26', 37, 120, 42],
    ['Send Money', 113, 120, 52],
    ['01712345678', 237, 120, 58],
    ['150.00', 520, 120, 26],
    ['-1.50', 584, 120, 20],
    ['186.24', 649, 120, 28],
    ['13-Oct-26', 37, 145, 42],
    ['Cash Out', 113, 145, 42],
    ['Ruposhi', 237, 145, 42],
    ['100.00', 450, 145, 26],
    ['-1.00', 584, 145, 20],
    ['85.24', 649, 145, 25],
  ].map(([text, x, y, w]) => ({
    text, x, y, w, h: 10, conf: 95, left: x, right: x + w, top: y, height: 10,
  }));
  const result = parseStatement(words.map((word) => word.text).join(' '), {
    sourceHint: 'bkash',
    layout: { pages: [{ page: 1, width: 702, height: 200, words }] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.format, 'layout');
  const main = result.rows.filter((row) => row.category !== 'fees');
  assert.equal(main.length, 2);
  assert.equal(main[0].date, '2026-10-12');
  assert.equal(main[0].type, 'income');
  assert.equal(main[0].amount, 150);
  assert.equal(main[0].balance, 186.24);
  assert.equal(main[1].date, '2026-10-13');
  assert.equal(main[1].type, 'transfer');
  assert.equal(main[1].amount, 100);
  assert.equal(main[1].balance, 85.24);
});

console.log(`\n${passed} layout tests passed`);
