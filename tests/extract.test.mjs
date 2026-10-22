/* Hishab — file extraction unit tests (no browser needed) */
import assert from 'node:assert/strict';
import { parseStatement } from '../assets/js/parsers.js';
import { cleanOcrText, fileKind, formatBytes, MAX_FILE_BYTES } from '../assets/js/extract.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('\nextract');

test('detects PDF, image, CSV and TXT files', () => {
  assert.equal(fileKind({ name: 'statement.pdf', type: '' }), 'pdf');
  assert.equal(fileKind({ name: 'bkash.png', type: 'image/png' }), 'image');
  assert.equal(fileKind({ name: 'bank.csv', type: 'text/csv' }), 'csv');
  assert.equal(fileKind({ name: 'copy.txt', type: 'text/plain' }), 'text');
  assert.equal(fileKind({ name: 'archive.zip', type: 'application/zip' }), 'unknown');
});

test('cleans OCR noise without touching amounts', () => {
  const input = 'Page 1 of 3\r\n01/10/2026 | Cash Out | -2,000.00 | 2,950.00\u000c\n\n\n';
  const out = cleanOcrText(input);
  assert.ok(!out.includes('Page 1 of 3'));
  assert.ok(out.includes('2,000.00'));
  assert.ok(out.includes('2,950.00'));
  assert.ok(!out.includes('\r'));
});

test('formats file sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
  assert.ok(MAX_FILE_BYTES >= 10 * 1024 * 1024);
});

test('parses OCR-style bank lines', () => {
  const text = cleanOcrText(`
    BRAC Bank Account Statement
    01/10/2026 ATM Withdrawal ATM-4412 5,000.00 76,250.00
    03/10/2026 House Rent RENT-OCT 12,000.00 64,250.00
    04/10/2026 Salary Credit SAL-OCT 58,000.00 122,250.00
  `);
  const parsed = parseStatement(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].type, 'transfer');
  assert.equal(parsed.rows[1].amount, 12000);
  assert.equal(parsed.rows[2].type, 'income');
});

test('parses OCR-style bKash lines', () => {
  const text = cleanOcrText(`
    bKash Statement
    01/10/2026 10:22 9A8B7C6D1E Send Money -1,200.00 5,400.00
    03/10/2026 09:10 A1B2C3D4E5 Cash Out -2,000.00 2,950.00
    05/10/2026 18:30 T1U2V3W4X5 Received from 01719876543 3,000.00 5,950.00
  `);
  const parsed = parseStatement(text);
  assert.equal(parsed.source, 'bkash');
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[1].type, 'transfer');
  assert.equal(parsed.rows[2].type, 'income');
});

test('parses multi-line screenshot text (description, date, amount)', () => {
  const text = cleanOcrText(`
    Send Money to 01712345678
    01/10/2026 10:22 9A8B7C6D1E
    -1,200.00 5,400.00
    Cash Out
    03/10/2026 09:10 A1B2C3D4E5
    -2,000.00 3,400.00
    Received from 01719876543
    05/10/2026 18:30 T1U2V3W4X5
    3,000.00 6,400.00
  `);
  const parsed = parseStatement(text);
  assert.equal(parsed.source, 'bkash');
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].amount, 1200);
  assert.equal(parsed.rows[0].type, 'expense');
  assert.equal(parsed.rows[1].type, 'transfer');
  assert.equal(parsed.rows[2].type, 'income');
  assert.equal(parsed.rows[2].amount, 3000);
});

console.log(`\n${passed} extract tests passed\n`);
