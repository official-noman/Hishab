/* =========================================================
   Hishab — bank / bKash statement parser
   Supports:
   • CSV / TSV / semicolon statements with a header row
   • pasted PDF text or SMS-style lines
   • debit/credit columns, signed amounts, Dr/Cr markers
   • automatic balance-delta inference when the sign is missing
   • transfer detection (ATM, cash out/in, add money, cash deposit)
   ========================================================= */

import {
  guessType, isCashOutDescription, isTransferDescription, matchCategory,
} from './categories.js';
import { parseDateAny, parseNumber } from './utils.js';

const MAX_ROWS = 5000;
const MAX_TEXT = 2_500_000;
const AMOUNT_RX = /(?:৳|BDT|Tk\.?)?\s*\(?-?\s*(?:\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\.\d{1,2})\)?\s*(?:Dr|Cr)?/gi;
const NUMBER_RX = /\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2}/g;

export const SAMPLE_BANK_CSV = `BRAC Bank - Account Statement
Account: 0123 4567 8901
Period: 01/10/2026 - 21/10/2026

Date,Description,Reference,Debit,Credit,Balance
01/10/2026,Salary Credit,SAL-OCT-26,,58000.00,81250.00
02/10/2026,ATM Withdrawal,ATM-4412,5000.00,,76250.00
03/10/2026,House Rent,RENT-OCT,12000.00,,64250.00
04/10/2026,Shwapno Super Shop,POS-8821,2350.00,,61900.00
05/10/2026,Internet Bill,BILL-1024,1050.00,,60850.00
06/10/2026,Freelance Payment,FR-7788,,8500.00,69350.00
07/10/2026,Uber Ride,UB-9981,340.00,,69010.00
08/10/2026,Cash Deposit,CD-1200,,3000.00,72010.00
09/10/2026,Daraz Order,DZ-9922,2200.00,,69810.00
10/10/2026,Bkash Add Money,BK-8822,2000.00,,67810.00
12/10/2026,Pharmacy,PH-6612,700.00,,67110.00
15/10/2026,Netflix Subscription,NF-1122,650.00,,66460.00
18/10/2026,Salary Advance,ADV-001,,5000.00,71460.00
20/10/2026,Electricity Bill,DESCO-338,1850.00,,69610.00
21/10/2026,Mobile Recharge,GP-771,600.00,,69010.00
`;

export const SAMPLE_BKASH_TEXT = `বিকাশ স্টেটমেন্ট
Account: 01712-345678
Period: 01/10/2026 - 21/10/2026

01/10/2026 10:22 9A8B7C6D1E Send Money to 01712345678 -1,200.00 5,400.00
02/10/2026 12:05 K7L8M9N0P1 Payment to Foodpanda -450.00 4,950.00
03/10/2026 09:10 A1B2C3D4E5 Cash Out -2,000.00 2,950.00
04/10/2026 15:40 F6G7H8I9J0 Mobile Recharge -500.00 2,450.00
05/10/2026 18:30 T1U2V3W4X5 Received from 01719876543 3,000.00 5,450.00
06/10/2026 11:00 Z9Y8X7W6V5 Merchant Payment -1,250.00 4,200.00
07/10/2026 08:45 C3D4E5F6G7 Add Money from Bank 2,500.00 6,700.00
08/10/2026 20:15 H8I9J0K1L2 Send Money to 01710000001 -800.00 5,900.00
09/10/2026 13:20 M2N3O4P5Q6 Cash In 3,000.00 8,900.00
10/10/2026 17:55 R7S8T9U0V1 Payment to Daraz -1,750.00 7,150.00
12/10/2026 10:05 W2X3Y4Z5A6 Refund from Daraz 350.00 7,500.00
14/10/2026 19:25 B7C8D9E0F1 Send Money to 01715555555 -2,000.00 5,500.00
16/10/2026 09:50 G2H3I4J5K6 Cash Out -3,000.00 2,500.00
18/10/2026 14:10 L7M8N9O0P1 Payment to Shwapno -1,150.00 1,350.00
20/10/2026 11:35 Q2R3S4T5U6 Cash In 4,000.00 5,350.00
`;

export const SAMPLE_BKASH_CSV = `bKash Statement
Account: 01712-345678
Period: 01/10/2026 - 21/10/2026

Date,Time,Trx ID,Description,Amount,Balance
01/10/2026,10:22,9A8B7C6D1E,Send Money to 01712345678,-1200.00,5400.00
02/10/2026,12:05,K7L8M9N0P1,Payment to Foodpanda,-450.00,4950.00
03/10/2026,09:10,A1B2C3D4E5,Cash Out,-2000.00,2950.00
04/10/2026,15:40,F6G7H8I9J0,Mobile Recharge,-500.00,2450.00
05/10/2026,18:30,T1U2V3W4X5,Received from 01719876543,3000.00,5450.00
07/10/2026,08:45,C3D4E5F6G7,Add Money from Bank,2500.00,7950.00
09/10/2026,13:20,M2N3O4P5Q6,Cash In,3000.00,10950.00
10/10/2026,17:55,R7S8T9U0V1,Payment to Daraz,-1750.00,9200.00
12/10/2026,10:05,W2X3Y4Z5A6,Refund from Daraz,350.00,9550.00
16/10/2026,09:50,G2H3I4J5K6,Cash Out,-3000.00,6550.00
`;

export function detectSource(text, hint = 'auto') {
  if (hint === 'bank' || hint === 'bkash') return hint;
  const low = String(text || '').toLowerCase();
  if (/bikash\s*statement|bkash\s*statement|বিকাশ\s*স্টেটমেন্ট|বিকাশ\s*স্টেটমেন্ট/.test(low)) return 'bkash';
  if (/trx\s*id/.test(low) && /(send money|cash out|add money|cash in)/.test(low)) return 'bkash';
  if (/send money to\s*\d{6,}/.test(low) && /cash out/.test(low)) return 'bkash';
  return 'bank';
}

/* ------------------------------ CSV ------------------------------ */
function normalizeInput(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/\t+\n/g, '\n');
}

function parseDelimited(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
    if (rows.length > MAX_ROWS + 80) break;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

function classifyHeader(cell) {
  const n = String(cell || '')
    .toLowerCase()
    .replace(/[._\-()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return null;
  if (/(date|তারিখ)/.test(n)) return 'date';
  if (/(time|সময়)/.test(n) && !/date/.test(n)) return 'time';
  if (/(dr\s*\/\s*cr|debit\s*\/\s*credit|transaction type|dr cr)/.test(n)) return 'type';
  if (/(debit|withdraw|withdrawal|withdrawl|ডেবিট|উত্তোলন)/.test(n)) return 'debit';
  if (/(credit|deposit|ক্রেডিট|জমা)/.test(n)) return 'credit';
  if (/(balance|ব্যালেন্স)/.test(n)) return 'balance';
  if (/(trx|transaction id|txn id|trans id|reference|ref no|cheque|check no|voucher|tid|আইডি)/.test(n)) return 'ref';
  if (/(amount|amt|value|টাকা|পরিমাণ)/.test(n)) return 'amount';
  if (/(description|narration|particular|particulars|details|remarks|purpose|merchant|beneficiary|receiver|sender|বিবরণ)/.test(n)) return 'desc';
  if (/(type|ধরন)/.test(n)) return 'type';
  return null;
}

function findHeader(rows) {
  let best = null;
  const limit = Math.min(rows.length, 35);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const map = { date: -1, time: -1, desc: [], debit: -1, credit: -1, amount: -1, balance: -1, ref: -1, type: -1 };
    row.forEach((cell, idx) => {
      const kind = classifyHeader(cell);
      if (!kind) return;
      if (kind === 'desc') {
        if (!map.desc.includes(idx)) map.desc.push(idx);
      } else if (map[kind] === -1) {
        map[kind] = idx;
      }
    });
    if (map.date < 0) continue;
    if (map.debit < 0 && map.credit < 0 && map.amount < 0) continue;
    let score = 4;
    if (map.desc.length) score += 2;
    if (map.debit >= 0) score += 2;
    if (map.credit >= 0) score += 2;
    if (map.amount >= 0) score += 2;
    if (map.balance >= 0) score += 0.5;
    if (map.ref >= 0) score += 0.5;
    if (!best || score > best.score) best = { index: i, map, score, row };
  }
  return best;
}

function extractAmountInfo(raw, typeText) {
  const s = String(raw ?? '').trim();
  const n = parseNumber(s);
  const neg = /^\s*\(.*\)\s*$/.test(s) || /^\s*-/.test(s) || /-\s*$/.test(s) || /\bdr\b/i.test(`${s} ${typeText}`);
  const pos = /\bcr\b/i.test(`${s} ${typeText}`);
  return { value: Math.abs(n), negative: neg, positive: pos && !neg, hasDigits: /\d/.test(s) };
}

function buildCsvRecord(row, map, source, index) {
  const cell = (idx) => (idx >= 0 ? String(row[idx] ?? '') : '');
  const dateRaw = cell(map.date);
  const date = parseDateAny(dateRaw);
  if (!date) return null;

  const descParts = map.desc.map((idx) => cell(idx)).filter((v) => v && v.trim());
  const typeRaw = cell(map.type).trim();
  if (typeRaw && !/^(debit|credit|dr|cr|dr\/cr|debit\/credit)$/i.test(typeRaw)) descParts.push(typeRaw);
  let desc = cleanDescription(descParts.join(' '));

  const debitInfo = extractAmountInfo(cell(map.debit), typeRaw);
  const creditInfo = extractAmountInfo(cell(map.credit), typeRaw);
  const amountInfo = extractAmountInfo(cell(map.amount), typeRaw);

  let amount = 0;
  let type = null;
  let confident = false;

  if (map.debit >= 0 && debitInfo.value > 0) {
    amount = debitInfo.value;
    type = 'expense';
    confident = true;
  } else if (map.credit >= 0 && creditInfo.value > 0) {
    amount = creditInfo.value;
    type = 'income';
    confident = true;
  } else if (amountInfo.value > 0) {
    amount = amountInfo.value;
    if (amountInfo.negative) { type = 'expense'; confident = true; }
    else if (amountInfo.positive) { type = 'income'; confident = true; }
    else {
      const hint = guessType(desc, amountInfo.value);
      if (hint === 'income') { type = 'income'; confident = true; }
      else if (hint === 'transfer') { type = 'transfer'; confident = true; }
      else if (/\b(debit|withdrawal|send money|payment|cash out|recharge|purchase)\b/i.test(`${desc} ${typeRaw}`)) {
        type = 'expense';
        confident = true;
      }
    }
  }

  if (!amount) return null;
  if (!type) type = 'expense';

  const balanceRaw = cell(map.balance);
  const balance = /\d/.test(balanceRaw) ? parseNumber(balanceRaw) : null;
  const refRaw = cell(map.ref).trim();

  return {
    index,
    date,
    amount,
    balance,
    desc,
    type,
    confident,
    ref: refRaw,
    source,
    rawDate: dateRaw,
  };
}

function cleanDescription(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;|:-]+|[\s,;|:-]+$/g, '')
    .slice(0, 220);
}

function routeTransfer(desc, source) {
  const low = String(desc || '').toLowerCase();
  const account = source === 'bkash' ? 'bkash' : 'bank';

  // Bank charges and bKash fees are real expenses, even when the description
  // contains "ATM" or "Cash Out". Do not turn them into transfers.
  if (/\b(?:fee|fees|charge|charges|commission)\b/i.test(low)) return null;

  // ATM / cash withdrawal / bKash Cash Out: money leaves Bank or bKash and
  // the same amount enters Cash. Net balance stays unchanged.
  if (isCashOutDescription(low)) {
    return { account, toAccount: 'cash' };
  }

  // Cash in / deposit: physical cash enters the bank or bKash account.
  if (/\bcash\s*in\b/.test(low) || /cash\s*deposit\b/.test(low) || /\batm\s*deposit\b/.test(low)) {
    return source === 'bkash'
      ? { account: 'cash', toAccount: 'bkash' }
      : { account: 'cash', toAccount: 'bank' };
  }

  // Add Money from a bank account goes into bKash.
  if (/\badd\s*money\b/.test(low)) {
    return { account: 'bank', toAccount: 'bkash' };
  }

  if (isTransferDescription(low)) {
    return { account, toAccount: '' };
  }
  return null;
}

function extractRef(desc, source, explicit = '') {
  const direct = String(explicit || '').trim();
  if (direct && direct !== '-') return direct.slice(0, 60);
  const text = String(desc || '');
  const tagged = text.match(/\b(?:ref|trx|txn|tid|transaction\s*id)[:\s#-]*([A-Z0-9-]{5,24})/i);
  if (tagged) return tagged[1];
  if (source === 'bkash') {
    const token = text.match(/\b(?=[A-Z0-9]{8,14}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{8,14}\b/);
    if (token) return token[0];
  }
  return '';
}

function inferTypesFromBalance(records, openingBalance = null) {
  const asc = records
    .filter((r) => r.balance != null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  let prev = Number.isFinite(openingBalance) ? openingBalance : null;
  for (const rec of asc) {
    if (prev != null) {
      const delta = rec.balance - prev;
      const charge = Number(rec.charge) || 0;
      const expenseMatch = Math.abs((delta - charge) + rec.amount) < 0.06;
      const incomeMatch = Math.abs((delta - charge) - rec.amount) < 0.06;
      // The running balance is authoritative: it also catches OCR/text
      // layouts where the debit/credit column is not visible.
      if (expenseMatch && !incomeMatch) {
        if (rec.type !== 'transfer') rec.type = 'expense';
        rec.confident = true;
      } else if (incomeMatch && !expenseMatch) {
        if (rec.type !== 'transfer') rec.type = 'income';
        rec.confident = true;
      } else if (!rec.confident) {
        if (Math.abs(Math.abs(delta) - Math.abs(rec.amount)) < 0.06) {
          rec.type = delta > 0 ? 'income' : 'expense';
          rec.confident = true;
        }
      }
    }
    prev = rec.balance;
  }
}

function finalizeRecord(rec, source) {
  const desc = rec.desc || '';
  const route = routeTransfer(desc, source);
  let type = rec.type;
  let account = source === 'bkash' ? 'bkash' : 'bank';
  let toAccount = '';

  if (route) {
    type = 'transfer';
    account = route.account;
    toAccount = route.toAccount;
  } else if (type === 'transfer') {
    account = source === 'bkash' ? 'bkash' : 'bank';
  }

  if (type !== 'transfer') {
    type = rec.type === 'income' ? 'income' : 'expense';
  }

  const category = type === 'transfer' ? 'transfer' : matchCategory(desc, type);
  const ref = extractRef(desc, source, rec.ref);
  return {
    date: rec.date,
    type,
    amount: Math.round(rec.amount * 100) / 100,
    description: desc,
    note: desc,
    ref,
    category,
    account,
    toAccount,
    source,
    balance: rec.balance,
    rawDate: rec.rawDate,
  };
}

/* ------------------------------ word layout / tables ------------------------------ */
const LAYOUT_HEADER_GAP = 11;
const MONTH_RX = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const OCR_DIGIT_MAP = {
  O: '0', o: '0', Q: '0', D: '0', F: '0', f: '0', I: '1', l: '1', '|': '1', i: '1',
  S: '5', s: '5', B: '8', Z: '2', z: '2', g: '9', q: '9', '?': '7', T: '7',
};

function layoutBox(word) {
  const h = Number(word?.h ?? word?.height ?? 10) || 10;
  const left = Number(word?.left ?? word?.x ?? 0) || 0;
  const right = Number.isFinite(Number(word?.right)) ? Number(word.right) : left + (Number(word?.w) || 0);
  const top = Number.isFinite(Number(word?.top)) ? Number(word.top) : (Number(word?.y) || 0) - h;
  return {
    text: String(word?.text || '').trim(),
    left,
    right,
    top,
    h,
    conf: Number(word?.conf) || 0,
    cx: (left + right) / 2,
  };
}

function layoutWordOverlap(a, b) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  if (right <= left) return 0;
  return (right - left) / Math.max(1, Math.min(a.right - a.left, b.right - b.left));
}

function groupLayoutRows(words) {
  const boxes = (words || []).map(layoutBox).filter((w) => w.text);
  boxes.sort((a, b) => a.top - b.top || a.left - b.left);
  const rows = [];
  for (const word of boxes) {
    const tolerance = Math.max(4.5, Math.min(7, word.h * 0.85));
    let row = rows.find((r) => Math.abs(r.top - word.top) <= tolerance);
    if (!row) {
      row = { top: word.top, words: [] };
      rows.push(row);
    }
    row.words.push(word);
    row.top = Math.min(row.top, word.top);
  }
  rows.sort((a, b) => a.top - b.top);
  for (const row of rows) {
    row.words.sort((a, b) => a.left - b.left);
    // Overlapping OCR words come from the same printed cell. Keep the
    // highest-confidence variant instead of gluing "159.00 150.00" together.
    const kept = [];
    for (const word of row.words) {
      const duplicate = kept.find((existing) => (
        Math.abs(existing.top - word.top) < Math.max(existing.h, word.h) * 0.8
        && layoutWordOverlap(existing, word) > 0.55
      ));
      if (!duplicate) kept.push(word);
      else if (word.conf > duplicate.conf) kept[kept.indexOf(duplicate)] = word;
    }
    row.words = kept.sort((a, b) => a.left - b.left);
    row.text = row.words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  }
  return rows;
}

function headerCells(row) {
  const cells = [];
  let current = null;
  for (const word of row.words) {
    if (!current || word.left - current.right > LAYOUT_HEADER_GAP) {
      current = { left: word.left, right: word.right, words: [word] };
      cells.push(current);
    } else {
      current.words.push(word);
      current.right = Math.max(current.right, word.right);
    }
  }
  return cells.map((cell) => ({
    text: cell.words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim(),
    left: cell.left,
    right: cell.right,
    center: (cell.left + cell.right) / 2,
  }));
}

function classifyLayoutHeader(text) {
  const n = String(text || '')
    .toLowerCase()
    .replace(/[._\-()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return null;
  if (/\b(date|time)\b/.test(n) && !/transaction|details/.test(n)) return 'date';
  if (/\b(withdraw|withdrawal|debit|out)\b/.test(n)) return 'debit';
  if (/\b(deposit|credit|in)\b/.test(n)) return 'credit';
  if (/\b(charge|charges|fee|fees)\b/.test(n)) return 'fee';
  if (/\bbalance\b/.test(n)) return 'balance';
  if (/\b(particular|particulars|description|details|narration)\b/.test(n)) return 'desc';
  if (/\b(type)\b/.test(n)) return 'type';
  if (/\b(chq|cheque|check|ref)\b/.test(n)) return 'ref';
  return null;
}

function buildLayoutColumns(cells) {
  const roles = [];
  for (const cell of cells) {
    const role = classifyLayoutHeader(cell.text);
    if (!role || role === 'ref') continue;
    if (roles.some((r) => r.role === role)) continue;
    roles.push({ role, ...cell });
  }
  if (!roles.some((r) => r.role === 'date')) return null;
  if (!roles.some((r) => r.role === 'balance')) return null;
  if (!roles.some((r) => r.role === 'debit' || r.role === 'credit')) return null;

  const left = roles.filter((r) => ['date', 'type', 'desc'].includes(r.role)).sort((a, b) => a.left - b.left);
  const numeric = roles.filter((r) => ['debit', 'credit', 'fee', 'balance'].includes(r.role)).sort((a, b) => a.left - b.left);
  if (!left.length || !numeric.length) return null;

  const numericStart = Math.min(...numeric.map((r) => r.left)) - 10;
  for (let i = 0; i < left.length; i += 1) {
    left[i].minX = i === 0 ? -Infinity : (left[i - 1].right + left[i].left) / 2;
    left[i].maxX = i === left.length - 1
      ? numericStart
      : (left[i].right + left[i + 1].left) / 2;
  }
  for (let i = 0; i < numeric.length; i += 1) {
    numeric[i].minX = i === 0 ? numericStart : (numeric[i - 1].center + numeric[i].center) / 2;
    numeric[i].maxX = i === numeric.length - 1 ? Infinity : (numeric[i].center + numeric[i + 1].center) / 2;
  }
  return { left, numeric, numericStart };
}

function emptyLayoutCells() {
  return { date: [], type: [], desc: [], debit: [], credit: [], fee: [], balance: [] };
}

function assignLayoutCells(row, columns) {
  const cells = emptyLayoutCells();
  for (const word of row.words) {
    const group = word.cx < columns.numericStart ? columns.left : columns.numeric;
    let column = group.find((col) => word.cx >= col.minX && word.cx < col.maxX);
    if (!column) {
      let best = Infinity;
      for (const col of group) {
        const distance = Math.abs(word.cx - col.center);
        if (distance < best) {
          best = distance;
          column = col;
        }
      }
    }
    if (column && cells[column.role]) cells[column.role].push(word);
  }
  for (const key of Object.keys(cells)) {
    cells[key].sort((a, b) => a.left - b.left);
  }
  return cells;
}

function layoutCellText(words, numeric = false) {
  if (!words || !words.length) return '';
  if (!numeric) return words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  const kept = [];
  for (const word of words.slice().sort((a, b) => a.left - b.left)) {
    const duplicate = kept.find((existing) => layoutWordOverlap(existing, word) > 0.55);
    if (!duplicate) kept.push(word);
    else if (word.conf > duplicate.conf) kept[kept.indexOf(duplicate)] = word;
  }
  let out = '';
  for (const word of kept) {
    const text = word.text.trim();
    if (!text) continue;
    if (!out) out = text;
    else if (/[.,]$/.test(out) || /^[.,]/.test(text)) out += text;
    else if (/^\d{2}$/.test(text) && !/\.\d{2}\s*$/.test(out)) out += `.${text}`;
    else out += text;
  }
  return out;
}

function moneyFromLayoutText(raw) {
  let s = String(raw || '');
  if (!s) return 0;
  const negative = /^\s*\(?-|-?\s*$/.test(s) || /\(.*\)/.test(s);
  s = s.replace(/[OoQDI FfLl|iSsBZzgq?T]/g, (ch) => OCR_DIGIT_MAP[ch] || ch);
  s = s.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return 0;
  s = s.replace(/-/g, '');
  const dots = (s.match(/\./g) || []).length;
  if (dots > 1) {
    const last = s.lastIndexOf('.');
    s = `${s.slice(0, last).replace(/\./g, '')}${s.slice(last)}`;
  }
  let value = Math.abs(parseNumber(s));
  const digitsOnly = s.replace(/\D/g, '');
  const hadSeparator = /[.,]/.test(s);
  // Scanned statements often drop the decimal point entirely. Six or more
  // digits are almost always paisa (e.g. 119319 -> 1193.19); five digits
  // ending in 00 are a whole amount with a lost ".00" (20000 -> 200.00).
  if (!hadSeparator && (digitsOnly.length >= 6
    || (digitsOnly.length === 5 && /00$/.test(digitsOnly)))) {
    value /= 100;
  }
  return negative ? -value : value;
}

function layoutMoney(words) {
  return moneyFromLayoutText(layoutCellText(words, true));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** OCR frequently loses the decimal point. Return plausible readings of a
 * numeric cell (raw, tenths, hundredths, and one extra zero). The balance
 * chain in reconcileLayoutRows picks the reading that actually fits. */
function numericCandidates(raw) {
  const text = String(raw || '');
  const base = Math.abs(moneyFromLayoutText(text));
  const values = new Set();
  if (base > 0) values.add(roundMoney(base));
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (base > 0 && !/[.,]/.test(cleaned) && cleaned.replace(/\D/g, '').length >= 3) {
    for (const candidate of [base / 10, base / 100, base * 10]) {
      const value = roundMoney(candidate);
      if (value >= 0.01 && value < 100_000_000) values.add(value);
    }
  }
  return [...values];
}

function uniqueCandidates(...lists) {
  const values = [];
  for (const list of lists) {
    for (const value of list || []) {
      const number = roundMoney(Math.abs(Number(value)));
      if (Number.isFinite(number) && number > 0 && !values.some((v) => Math.abs(v - number) < 0.005)) {
        values.push(number);
      }
    }
  }
  return values;
}

function looksLikeLayoutDate(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (MONTH_RX.test(s)) return true;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dmy) return +dmy[1] >= 1 && +dmy[1] <= 31 && +dmy[2] >= 1 && +dmy[2] <= 12;
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(s);
}

function parseLayoutDate(text, fallback = null) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return fallback;
  let iso = parseDateAny(s);
  if (iso) return iso;
  iso = parseDateAny(s.slice(0, 24));
  if (iso) return iso;

  // OCR often turns a digit into ')', 'O' or 'l'. Repair just the day/year
  // around a month name; never rewrite the month itself.
  const month = s.match(MONTH_RX);
  if (month) {
    const before = s.slice(0, month.index);
    const after = s.slice(month.index + month[0].length);
    const dayRaw = (before.match(/([0-9OoIlSsBbZz]{1,2})[^A-Za-z0-9]*$/) || [])[1] || '';
    const yearRaw = (after.match(/[^A-Za-z0-9]*([0-9OoIlSsBbZz]{2,4})/) || [])[1] || '';
    const day = dayRaw.replace(/[OoQDI l|iSsBZzgq?T]/g, (ch) => OCR_DIGIT_MAP[ch] || ch).replace(/\D/g, '');
    const year = yearRaw.replace(/[OoQDI l|iSsBZzgq?T]/g, (ch) => OCR_DIGIT_MAP[ch] || ch).replace(/\D/g, '');
    if (day && year) {
      iso = parseDateAny(`${day}-${month[0]}-${year}`);
      if (iso) return iso;
    }
  }
  return fallback;
}

function layoutTypeKey(typeText, desc) {
  const s = `${typeText || ''} ${desc || ''}`.toLowerCase();
  if (/reversal|reversed/.test(s)) return 'reversal';
  if (/cash\s*o(?:ut|st|w|wt)|cosh\s*out/.test(s)) return 'cash-out';
  if (/cash\s*in|cash\s*m/.test(s)) return 'cash-in';
  if (/add\s*money|bank\s*to\s*b.?kash|bank\s*to\s*bikash/.test(s)) return 'add-money';
  if (/send\s*money|send\s*monet|s3nd/.test(s)) return 'send-money';
  if (/loan\s*repayment|repayment/.test(s)) return 'loan-repayment';
  if (/\bloan\b/.test(s)) return 'loan';
  if (/b.?kash\s*to\s*mfs|\bmfs\b/.test(s)) return 'mfs';
  if (/pay\s*bill|payment|merchant|paybill/.test(s)) return 'payment';
  if (/recharge|mobile/.test(s)) return 'recharge';
  if (/cashback|refund|receive|received/.test(s)) return 'incoming';
  if (/pay\s*later/.test(s)) return 'pay-later';
  return 'other';
}

function layoutBalanceValue(words) {
  const text = layoutCellText(words);
  if (!/\d/.test(text)) return null;
  const value = Math.abs(layoutMoney(words));
  return Number.isFinite(value) ? value : null;
}

function rowIsLayoutHeader(row, cells, sourceHint) {
  const roles = cells.map((cell) => classifyLayoutHeader(cell.text)).filter(Boolean);
  const text = row.text || '';
  if (!/\b(date|particular|description|details|transaction|withdraw|deposit|balance)\b/i.test(text)) {
    return false;
  }
  if (roles.includes('date') && roles.includes('balance')
    && (roles.includes('debit') || roles.includes('credit'))) return true;
  // bKash screenshots are sometimes scrolled so that only the right-hand
  // header labels are visible. The column positions are still recoverable.
  return sourceHint === 'bkash' && roles.includes('fee') && roles.includes('balance')
    && (roles.includes('type') || roles.includes('desc'));
}

function buildHeaderColumns(cells, sourceHint) {
  const direct = buildLayoutColumns(cells);
  if (direct || sourceHint !== 'bkash') return direct;

  const roles = cells.map((cell) => classifyLayoutHeader(cell.text)).filter(Boolean);
  const charge = cells.find((cell) => classifyLayoutHeader(cell.text) === 'fee');
  const balance = cells.find((cell) => classifyLayoutHeader(cell.text) === 'balance');
  if (!charge || !balance || !roles.includes('desc')) return null;

  const synthetic = cells.slice();
  if (!roles.includes('date')) {
    synthetic.push({ text: 'Date & Time', left: 30, right: 100, center: 65 });
  }
  if (!roles.includes('type')) {
    synthetic.push({ text: 'Transaction Type', left: 105, right: 200, center: 152 });
  }
  if (!roles.includes('debit')) {
    synthetic.push({
      text: 'Out',
      left: charge.left - 159,
      right: charge.left - 109,
      center: charge.left - 134,
    });
  }
  if (!roles.includes('credit')) {
    synthetic.push({
      text: 'in',
      left: charge.left - 89,
      right: charge.left - 39,
      center: charge.left - 64,
    });
  }
  return buildLayoutColumns(synthetic);
}

function parseLayoutRecords(layout, sourceHint) {
  if (!layout || !Array.isArray(layout.pages)) return [];
  const records = [];
  let index = 0;
  let openingBalance = null;

  for (const page of layout.pages) {
    if (!page || !Array.isArray(page.words) || !page.words.length) continue;
    const rows = groupLayoutRows(page.words);

    // Find the table header anywhere on the page. A screenshot can start with
    // transactions above a repeated header, or lose the left half of the header.
    let columns = null;
    for (const row of rows) {
      const cells = headerCells(row);
      if (rowIsLayoutHeader(row, cells, sourceHint)) {
        columns = buildHeaderColumns(cells, sourceHint);
        if (columns) break;
      }
    }
    if (!columns) continue;
    const timeColumnLayout = [...(columns.left || []), ...(columns.numeric || [])]
      .some((column) => column.role === 'fee');

    let current = null;
    let lastDate = null;

    const pushCurrent = () => {
      if (!current) return;
      if (current.date || current.dateLike) records.push(current);
      current = null;
    };

    for (const row of rows) {
      const cells = headerCells(row);
      if (rowIsLayoutHeader(row, cells, sourceHint)) {
        pushCurrent();
        continue;
      }
      if (/balance\s*forward|opening\s*balance/i.test(row.text)) {
        pushCurrent();
        const forwarded = layoutBalanceValue(assignLayoutCells(row, columns).balance);
        if (forwarded != null) openingBalance = forwarded;
        continue;
      }
      if (looksLikeFooter(row.text)) continue;

      const assigned = assignLayoutCells(row, columns);
      const dateText = layoutCellText(assigned.date);
      const dateLike = looksLikeLayoutDate(dateText);
      const date = parseLayoutDate(dateText, lastDate);
      const outText = layoutCellText(assigned.debit, true);
      const inText = layoutCellText(assigned.credit, true);
      const feeText = layoutCellText(assigned.fee, true);
      const balanceText = layoutCellText(assigned.balance, true);
      const outValue = Math.abs(layoutMoney(assigned.debit));
      const inValue = Math.abs(layoutMoney(assigned.credit));
      const typeText = layoutCellText(assigned.type);
      const descText = layoutCellText(assigned.desc);
      const typeKey = layoutTypeKey(typeText, descText);
      // A screenshot can start halfway through a row, leaving only its time in
      // the first column. The amount and the transaction type still identify it
      // as a real row; its date is filled from the next row after parsing.
      const timeLike = timeColumnLayout && !dateLike
        && /^\d{1,2}[:.]\d{2}/.test(dateText.trim())
        && (outValue > 0 || inValue > 0)
        && (typeKey !== 'other' || descText.length >= 12);

      if (dateLike || timeLike) {
        pushCurrent();
        index += 1;
        current = {
          index,
          date: dateLike ? date : null,
          dateLike: true,
          rawDate: dateText,
          dateText,
          typeText,
          desc: cleanDescription(`${typeText} ${descText}`),
          out: outValue,
          in: inValue,
          fee: layoutMoney(assigned.fee),
          balance: layoutBalanceValue(assigned.balance),
          outCandidates: numericCandidates(outText),
          inCandidates: numericCandidates(inText),
          feeCandidates: numericCandidates(feeText),
          balanceCandidates: numericCandidates(balanceText),
          kind: 'unknown',
          source: sourceHint,
          ref: '',
          timeText: '',
          top: row.top,
        };
        if (current.date && lastDate && current.date < lastDate) current.date = lastDate;
        if (current.date) lastDate = current.date;
      } else if (current) {
        // Continuation lines sit directly under their transaction. A numeric
        // line far below is a page header/footer (e.g. the bKash page balance),
        // not part of the last row.
        if (row.top - current.top > 24) {
          pushCurrent();
          continue;
        }
        const extra = layoutCellText(assigned.desc) || layoutCellText(assigned.type);
        if (extra && !looksLikeMeta(extra) && current.desc.length < 220) {
          current.desc = cleanDescription(`${current.desc} ${extra}`);
        }
        if (/^\d{1,2}[:.]\d{2}/.test(dateText)) current.timeText = dateText;
        if (!current.out && assigned.debit.length) {
          current.out = Math.abs(layoutMoney(assigned.debit));
          current.outCandidates = numericCandidates(layoutCellText(assigned.debit, true));
        }
        if (!current.in && assigned.credit.length) {
          current.in = Math.abs(layoutMoney(assigned.credit));
          current.inCandidates = numericCandidates(layoutCellText(assigned.credit, true));
        }
        if (current.balance == null && assigned.balance.length) {
          current.balance = layoutBalanceValue(assigned.balance);
          current.balanceCandidates = numericCandidates(layoutCellText(assigned.balance, true));
        }
        if (!current.fee && assigned.fee.length) {
          current.fee = layoutMoney(assigned.fee);
          current.feeCandidates = numericCandidates(layoutCellText(assigned.fee, true));
        }
      }
    }
    pushCurrent();
  }

  // Dates that OCR could not read inherit the previous (or, for the first row,
  // the next) transaction date. Statements are chronological.
  let last = null;
  for (let i = 0; i < records.length; i += 1) {
    if (records[i].date) last = records[i].date;
    else if (last) records[i].date = last;
  }
  let next = null;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i].date) next = records[i].date;
    else if (next) records[i].date = next;
  }
  // Statements are chronological. If OCR turned "27" into "2", keep the
  // previous valid date rather than importing a transaction into the past.
  let runningDate = null;
  for (const rec of records) {
    if (!rec.date) continue;
    if (runningDate && rec.date < runningDate) rec.date = runningDate;
    else runningDate = rec.date;
  }

  const usable = records.filter((r) => r.date && (r.out > 0 || r.in > 0));
  for (const rec of usable) {
    rec.kind = /trx\s*id|transaction\s*type|charge\s*\/?\s*fee/i.test(`${rec.desc} ${rec.typeText}`)
      ? 'bkash'
      : 'bank';
    if (/trx\s*id/i.test(rec.desc)) rec.kind = 'bkash';
  }
  if (sourceHint === 'bkash') usable.forEach((r) => { r.kind = 'bkash'; });
  if (sourceHint === 'bank') usable.forEach((r) => { r.kind = 'bank'; });

  reconcileLayoutRows(usable, openingBalance);
  return usable;
}

function isPayLaterRow(rec) {
  return rec.kind === 'bkash' && /pay\s*later/i.test(`${rec.typeText || ''} ${rec.desc || ''}`);
}

function expectedBalanceDelta(rec) {
  if (isPayLaterRow(rec)) return rec.fee;
  return rec.in - rec.out + rec.fee;
}

function feeSignFor(rec) {
  const key = layoutTypeKey(rec.typeText, rec.desc);
  const credit = key === 'reversal' || key === 'incoming'
    || /refund|cashback|reversal/i.test(`${rec.typeText || ''} ${rec.desc || ''}`);
  return credit ? 1 : -1;
}

function normalizeFeeSign(rec) {
  if (rec.kind !== 'bkash' || !rec.fee) return;
  rec.fee = Math.abs(rec.fee) * feeSignFor(rec);
}

function normalizeFeeScale(rec) {
  if (rec.kind !== 'bkash' || !rec.fee) return;
  const amount = Math.max(rec.out || 0, rec.in || 0);
  if (!(amount > 0)) return;
  const absolute = Math.abs(rec.fee);
  // A lost decimal point turns "12.30" into "1230". A real bKash charge is
  // never more than 10% of the transaction amount.
  if (absolute > amount * 0.1 && absolute / 100 <= amount * 0.1) {
    rec.fee = Math.sign(rec.fee) * roundMoney(absolute / 100);
  }
}

function normalizeCashOutFee(rec) {
  if (rec.kind !== 'bkash') return;
  if (!/cash\s*o(?:ut|st|w|wt)\b/i.test(`${rec.typeText || ''} ${rec.desc || ''}`)) return;
  const amount = rec.out > 0 ? rec.out : 0;
  if (!(amount > 0) || !(Math.abs(rec.fee) > 0)) return;
  // bKash charges 1.395% for a normal Cash Out. The charge column is only a
  // few pixels wide in screenshots, so OCR often turns "2.79" into "7" and
  // "3.63" into "36". Use the published rate when the reading is implausible.
  const expected = roundMoney(amount * 0.01395);
  if (expected > 0 && Math.abs(Math.abs(rec.fee) - expected) > 0.25) {
    rec.fee = -expected;
  }
}

function feeOptionsFor(rec) {
  const sign = feeSignFor(rec);
  const values = [roundMoney(rec.fee), 0];
  for (const candidate of rec.feeCandidates || []) {
    values.push(roundMoney(sign * candidate));
  }
  const unique = [];
  for (const value of values) {
    if (Number.isFinite(value) && !unique.some((v) => Math.abs(v - value) < 0.005)) unique.push(value);
  }
  return unique.slice(0, 12);
}

function amountOptionsFor(rec) {
  const values = uniqueCandidates([rec.out, rec.in], rec.outCandidates, rec.inCandidates);
  const options = [];
  const push = (out, incoming) => {
    const value = { out: roundMoney(out), in: roundMoney(incoming) };
    if (!options.some((o) => Math.abs(o.out - value.out) < 0.005 && Math.abs(o.in - value.in) < 0.005)) {
      options.push(value);
    }
  };
  if (rec.out > 0) push(rec.out, 0);
  if (rec.in > 0) push(0, rec.in);
  if (rec.out > 0 && rec.in > 0) push(rec.out, rec.in);
  push(0, 0);
  for (const value of values) {
    push(value, 0);
    push(0, value);
  }
  return options.slice(0, 20);
}

function balanceOptionsFor(rec) {
  const values = [];
  if (rec.balance != null && Number.isFinite(rec.balance)) values.push(roundMoney(rec.balance));
  for (const candidate of uniqueCandidates(rec.balanceCandidates)) {
    if (!values.some((v) => Math.abs(v - candidate) < 0.005)) values.push(candidate);
  }
  return values;
}

function reconcileLayoutRows(records, openingBalance = null) {
  for (const rec of records) {
    normalizeFeeSign(rec);
    normalizeFeeScale(rec);
    normalizeCashOutFee(rec);
  }

  // A balance that OCR missed can be rebuilt from the next row's balance and
  // amount. This also anchors the very first row of a mid-statement screenshot.
  for (let i = records.length - 2; i >= 0; i -= 1) {
    const rec = records[i];
    if (rec.balance != null) continue;
    const next = records[i + 1];
    if (next.balance == null) continue;
    const value = roundMoney(next.balance - expectedBalanceDelta(next));
    if (Number.isFinite(value) && value >= -0.01) rec.balance = value;
  }

  let prev = Number.isFinite(openingBalance) ? openingBalance : null;
  for (const rec of records) {
    if (rec.balance == null) continue;
    if (prev == null) {
      prev = rec.balance;
      continue;
    }

    const delta = roundMoney(rec.balance - prev);
    const payLater = isPayLaterRow(rec);
    if (payLater) {
      rec.fee = delta;
      prev = rec.balance;
      continue;
    }

    const scale = Math.max(rec.out, rec.in, Math.abs(delta), 1);
    const feeLimit = Math.max(40, Math.min(500, scale * 0.05));
    const currentDelta = rec.in - rec.out;
    const feeCandidate = roundMoney(delta - currentDelta);

    if (Math.abs(feeCandidate) <= feeLimit) {
      // The amount was read correctly; the charge column was not.
      rec.fee = feeCandidate;
    } else {
      const originalOut = rec.out;
      const originalIn = rec.in;
      const original = Math.max(originalOut, originalIn);
      let corrected = null;
      if (originalOut > 0 && originalIn <= 0) {
        corrected = rec.fee - delta;
        if (corrected > 0) rec.out = corrected;
      } else if (originalIn > 0 && originalOut <= 0) {
        corrected = delta - rec.fee;
        if (corrected > 0) rec.in = corrected;
      } else {
        const net = delta - rec.fee;
        if (net < 0) {
          rec.out = Math.abs(net);
          rec.in = 0;
          corrected = rec.out;
        } else {
          rec.in = net;
          rec.out = 0;
          corrected = rec.in;
        }
      }

      // Only accept a corrected amount when it is close to the OCR reading, or
      // when a tiny balance move clearly disproves a wild OCR amount (e.g. a
      // 15.00 cashback read as 1,800.00).
      const closeEnough = original > 0
        && Math.abs(corrected - original) / Math.max(original, 1) <= 0.3;
      const smallAndClear = corrected > 0 && original > 0
        && corrected <= original * 0.2 && Math.abs(delta) <= 100;
      if (corrected == null || corrected <= 0 || (!closeEnough && !smallAndClear)) {
        rec.out = originalOut;
        rec.in = originalIn;
        rec.unbalanced = true;
      } else {
        rec.amountCorrected = true;
        const fee = roundMoney(delta - (rec.in - rec.out));
        if (Math.abs(fee) <= feeLimit) rec.fee = fee;
      }
    }
    prev = rec.balance;
  }
}

function finalizeLayoutRecords(records, fallbackSource) {
  const rows = [];
  for (const rec of records) {
    const source = rec.kind === 'bkash' ? 'bkash' : (fallbackSource === 'bkash' ? 'bkash' : 'bank');
    const amount = rec.out > 0 ? rec.out : rec.in;
    if (!amount) continue;
    const typeKey = layoutTypeKey(rec.typeText, rec.desc);
    let type = rec.in > 0 && rec.out <= 0 ? 'income' : 'expense';
    if (typeKey === 'loan') type = 'income';
    if (typeKey === 'loan-repayment') type = 'expense';
    if (typeKey === 'reversal') type = rec.in > 0 ? 'income' : 'expense';

    const base = {
      index: rec.index,
      date: rec.date,
      amount,
      charge: rec.fee || 0,
      balance: rec.balance,
      desc: cleanDescription(rec.desc || rec.typeText || 'Statement entry'),
      type,
      confident: true,
      ref: rec.ref || '',
      source,
      rawDate: rec.rawDate,
    };
    const main = finalizeRecord(base, source);
    if (rec.timeText) main.note = cleanDescription(`${main.note} ${rec.timeText}`);
    main.description = main.note;
    if (rec.unbalanced) main.warning = 'balance-mismatch';
    rows.push(main);

    // bKash prints the transaction amount and its fee in separate columns.
    // Keep the fee as its own row so totals and the running balance agree.
    if (Math.abs(rec.fee) >= 0.01) {
      const feeType = rec.fee < 0 ? 'expense' : 'income';
      const feeSource = source;
      const feeDesc = cleanDescription(`${rec.typeText || 'bKash'} ${rec.fee < 0 ? 'charge' : 'fee refund'} — ${rec.desc || ''}`);
      rows.push({
        date: rec.date,
        type: feeType,
        amount: Math.round(Math.abs(rec.fee) * 100) / 100,
        description: feeDesc,
        note: feeDesc,
        ref: '',
        category: feeType === 'expense' ? 'fees' : 'refund',
        account: feeSource === 'bkash' ? 'bkash' : 'bank',
        toAccount: '',
        source: feeSource,
        balance: null,
        rawDate: rec.rawDate,
      });
    }
  }
  return rows;
}

/* ------------------------------ pasted text ------------------------------ */
const DATE_PATTERNS = [
  /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/,
  /(\d{1,2}\s*[-/.]\s*[A-Za-z\u0980-\u09FF]{3,12}\s*[-/.]\s*\d{2,4})/,
  /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/,
  /(\d{1,2}\s+[A-Za-z\u0980-\u09FF]{3,12}\s+\d{2,4})/,
];

function findDateInLine(line) {
  // A date normally sits at the start of a statement row, but OCR and phone
  // screenshots may put a description in front of it. Search a wider head.
  const head = line.slice(0, 120);
  for (const rx of DATE_PATTERNS) {
    const match = head.match(rx);
    if (!match) continue;
    const iso = parseDateAny(match[1]);
    if (!iso) continue;
    return {
      iso,
      start: match.index,
      end: match.index + match[0].length,
      text: match[1],
    };
  }
  return null;
}

function findAmounts(text) {
  const out = [];
  AMOUNT_RX.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RX.exec(text)) !== null) {
    const raw = m[0];
    const value = parseNumber(raw);
    if (!Number.isFinite(value) || value === 0) continue;
    out.push({
      raw: raw.trim(),
      value,
      start: m.index,
      end: m.index + raw.length,
      negative: /^-|^\(|-\s*$/.test(raw.trim()) || /\(.*\)/.test(raw),
    });
    if (out.length > 12) break;
  }
  return out;
}

function looksLikeFooter(line) {
  const text = String(line || '').trim();
  return /^(total|grand total|closing balance|opening balance|balance carried|balance forward|summary|মোট|মোট ব্যালেন্স)/i.test(text)
    || /^(this electronic statement|please advice|please advise|\*{3}end of|end of statement|thank you for using|call\s*16247|bKash statement|bank statement)/i.test(text)
    || /\bpage\s+\d+\s+(?:of|\/)\s+\d+$/i.test(text);
}

function looksLikeTotal(line) {
  return /^-?[\d,]+\.\d{2}(?:\s+-?[\d,]+\.\d{2}){1,4}$/.test(String(line || '').replace(/\s+/g, ' ').trim());
}

function looksLikeHeader(line) {
  const words = line.toLowerCase().split(/\s+/);
  const labels = ['date', 'description', 'particulars', 'debit', 'credit', 'balance', 'amount', 'reference', 'withdrawal', 'deposit', 'trx', 'transaction'];
  let hits = 0;
  for (const label of labels) {
    if (words.includes(label)) hits += 1;
  }
  return hits >= 2;
}

function looksLikeMeta(line) {
  return /:/.test(line)
    || /^(account|statement|period|date|time|opening|closing|balance|total|page|trx|transaction|summary|ifsc|branch|address|phone|email)\b/i.test(line.trim());
}

function parseTextLines(text, source) {
  // Clean the lines first and join descriptions that sit above an orphan date.
  const lines = [];
  let openingBalance = null;
  for (const rawLine of text.split('\n')) {
    let line = rawLine.replace(/[ \t]+/g, ' ').trim();
    if (!line || line.length < 6) continue;

    // BRAC (and many banks) print the carried-forward balance before the rows.
    if (/^balance\s*(?:forward|b\/f|carried\s*forward)\b/i.test(line)) {
      const values = findAmounts(line);
      if (values.length) openingBalance = values[values.length - 1].value;
      continue;
    }

    if (looksLikeFooter(line) || looksLikeHeader(line)) continue;
    lines.push(line);
  }

  const records = [];
  let index = 0;
  let pendingPrefix = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const dateInfo = findDateInLine(line);
    if (!dateInfo) {
      if (looksLikeMeta(line) || /^\d{1,2}:\d{2}/.test(line)) continue;

      // Decide whether an undated line is a wrapped detail of the row above
      // (BRAC prints "Payment" / "-11 ATM DHAKA" below the row) or a
      // description printed above an orphan date (bKash card OCR).
      const next = lines[i + 1];
      const nextDate = next ? findDateInLine(next) : null;
      let nextHasAmount = false;
      if (nextDate) {
        const nextRest = `${next.slice(0, nextDate.start)} ${next.slice(nextDate.end)}`.trim();
        nextHasAmount = findAmounts(nextRest).length > 0;
      }

      if (nextDate && !nextHasAmount && !findAmounts(line).length && line.length <= 100) {
        // The description is printed above its date (common in screenshot OCR).
        pendingPrefix = cleanDescription(`${pendingPrefix} ${line}`);
      } else if (records.length && !findAmounts(line).length && line.length <= 120) {
        // Otherwise it is a wrapped detail of the transaction above.
        const last = records[records.length - 1];
        if (last.desc.length < 180) last.desc = cleanDescription(`${last.desc} ${line}`);
      }
      continue;
    }
    index += 1;

    let rest = `${line.slice(0, dateInfo.start)} ${line.slice(dateInfo.end)}`.trim();
    if (pendingPrefix) {
      rest = `${pendingPrefix} ${rest}`;
      pendingPrefix = '';
    }
    rest = rest.replace(/^\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\s*/i, '');
    rest = rest.replace(/^[,;|\-–—]+\s*/, '');

    let amounts = findAmounts(rest);
    let consumed = i;

    // OCR often puts the amount on a line below the date. Look ahead a little,
    // but never cross into the next dated transaction.
    while (!amounts.length && consumed - i < 3 && consumed + 1 < lines.length) {
      const next = lines[consumed + 1];
      if (findDateInLine(next)) break;
      consumed += 1;
      rest = `${rest} ${next}`.trim();
      amounts = findAmounts(rest);
    }
    if (!amounts.length) continue;
    i = consumed;

    const first = amounts[0];
    let balance = null;
    let main = amounts[0];
    let charge = 0;
    if (amounts.length >= 2) {
      balance = amounts[amounts.length - 1].value;
      const candidates = amounts.slice(0, -1);
      main = candidates.reduce((best, item) => (Math.abs(item.value) > Math.abs(best.value) ? item : best), candidates[0]);
      if (candidates.length >= 2) {
        const fee = candidates.find((item) => item !== main && Math.abs(item.value) < Math.abs(main.value) * 0.5);
        if (fee) charge = fee.value;
      }
    }

    const amount = Math.abs(main.value);
    if (!amount) continue;

    let desc = rest.slice(0, first.start).trim();
    desc = desc.replace(/[,;|]+\s*$/, '').replace(/\s+/g, ' ');
    if (!desc) desc = 'Statement entry';

    const typeText = desc.toLowerCase();
    let type;
    let confident = false;
    if (main.negative) {
      type = 'expense';
      confident = true;
    } else if (/\b(cr|credit)\b/i.test(`${main.raw} ${desc.slice(-8)}`)) {
      type = 'income';
      confident = true;
    } else if (/\b(dr|debit)\b/i.test(`${main.raw} ${desc.slice(-8)}`)) {
      type = 'expense';
      confident = true;
    } else if (isTransferDescription(desc) || /\bcash\s*(out|in)\b/i.test(desc) || /\badd\s*money\b/i.test(desc)) {
      type = 'transfer';
      confident = true;
    } else {
      const hint = guessType(desc, 1);
      if (hint === 'income') { type = 'income'; confident = true; }
      else if (hint === 'transfer') { type = 'transfer'; confident = true; }
      else if (/\b(received|receive|refund|cashback|salary|credit|deposit|inbound)\b/i.test(typeText)) {
        type = 'income';
        confident = true;
      } else if (/\b(cash out|send money|payment|recharge|purchase|withdraw|bill|debit|fee)\b/i.test(typeText)) {
        type = 'expense';
        confident = true;
      } else {
        type = 'expense';
      }
    }

    records.push({
      index,
      date: dateInfo.iso,
      amount,
      charge,
      balance,
      desc,
      type,
      confident,
      ref: '',
      source,
      rawDate: dateInfo.text,
    });
  }

  inferTypesFromBalance(records, openingBalance);
  return records.map((rec) => finalizeRecord(rec, source)).filter((r) => r.amount > 0).slice(0, MAX_ROWS);
}

/* ------------------------------ entry point ------------------------------ */
export function parseStatement(input, options = {}) {
  const text = normalizeInput(input);
  const layoutPages = options.layout?.pages;
  const hasLayout = Array.isArray(layoutPages) && layoutPages.some((page) => page?.words?.length);
  if (!text.trim() && !hasLayout) {
    return { ok: false, rows: [], source: 'bank', format: 'none', warnings: ['empty'] };
  }
  if (text.length > MAX_TEXT) {
    return { ok: false, rows: [], source: 'bank', format: 'none', warnings: ['too-large'] };
  }

  let source = detectSource(text, options.sourceHint || 'auto');
  let format = 'none';
  let rows = [];
  const warnings = [];

  // 0) Statement with PDF/OCR word coordinates. Columns survive even when OCR
  // flattens the text, so this path is more accurate than the text fallback.
  if (hasLayout) {
    const layoutRecords = parseLayoutRecords(options.layout, source);
    if (layoutRecords.length) {
      if (layoutRecords.every((rec) => rec.kind === 'bkash')) source = 'bkash';
      rows = finalizeLayoutRecords(layoutRecords, source);
      if (rows.length) format = 'layout';
      if (layoutRecords.some((rec) => rec.unbalanced)) warnings.push('balance-mismatch');
    }
  }

  // 1) CSV / delimited
  const candidates = ['\t', ',', ';', '|'];
  let best = null;
  if (!rows.length) for (const delim of candidates) {
    if (!text.includes(delim)) continue;
    const table = parseDelimited(text, delim);
    if (table.length < 2) continue;
    const header = findHeader(table);
    if (!header) continue;
    let valid = 0;
    for (let i = header.index + 1; i < Math.min(table.length, header.index + 30); i += 1) {
      if (parseDateAny(table[i]?.[header.map.date])) valid += 1;
    }
    if (!valid) continue;
    const score = header.score + Math.min(valid, 6) + (delim === '\t' ? 0.4 : 0);
    if (!best || score > best.score) {
      best = { delim, table, header, score };
      if (source === 'bank' && header.map.ref >= 0 && header.map.debit < 0 && header.map.credit < 0) {
        const headerText = header.row.join(' ').toLowerCase();
        if (/trx|tid|bkash|bikash/.test(headerText)) source = 'bkash';
      }
    }
  }

  if (best) {
    const records = [];
    for (let i = best.header.index + 1; i < best.table.length; i += 1) {
      const rec = buildCsvRecord(best.table[i], best.header.map, source, i);
      if (rec) records.push(rec);
      if (records.length >= MAX_ROWS) break;
    }
    inferTypesFromBalance(records);
    rows = records.map((rec) => finalizeRecord(rec, source)).filter((r) => r.amount > 0);
    if (rows.length) format = 'csv';
  }

  // 2) pasted text fallback
  if (!rows.length) {
    rows = parseTextLines(text, source);
    if (rows.length) format = 'text';
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return {
    ok: rows.length > 0,
    rows,
    source,
    format,
    total,
    warnings,
    detected: rows.length,
  };
}

/** Group parsed rows for a lightweight preview count. */
export function summarizeParsed(rows) {
  const summary = { expense: 0, income: 0, transfer: 0, totalExpense: 0, totalIncome: 0 };
  for (const r of rows) {
    if (r.type === 'transfer') summary.transfer += 1;
    else if (r.type === 'income') {
      summary.income += 1;
      summary.totalIncome += r.amount;
    } else {
      summary.expense += 1;
      summary.totalExpense += r.amount;
    }
  }
  return summary;
}

export {
  parseDelimited, findHeader, parseTextLines, classifyHeader,
  parseLayoutRecords, finalizeLayoutRecords, groupLayoutRows, layoutMoney,
  headerCells, buildLayoutColumns, assignLayoutCells, layoutCellText,
  looksLikeLayoutDate, parseLayoutDate, classifyLayoutHeader,
};
