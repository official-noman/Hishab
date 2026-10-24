/* =========================================================
   Hishab — on-device assistant
   Searches the local transaction list with a small, offline
   natural-language parser. No network, no external model.
   ========================================================= */

import {
  ACCOUNT_IDS, CATEGORIES, accountName, categoryName, getCategory,
} from './categories.js';
import { accountSummary } from './analytics.js';
import {
  addDaysISO, bnToEn, endOfMonthISO, fmtMoney, formatDate, formatRangeLabel,
  isoOf, parseDateAny, parseISO, todayISO,
} from './utils.js';
import { normalizePhone } from './store.js';

const BN_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

const MONTH_WORDS = new Map();
[
  ['jan', 0], ['january', 0], ['জানু', 0], ['জানুয়ারি', 0],
  ['feb', 1], ['february', 1], ['ফেব', 1], ['ফেব্রুয়ারি', 1],
  ['mar', 2], ['march', 2], ['মার্চ', 2],
  ['apr', 3], ['april', 3], ['এপ্রি', 3], ['এপ্রিল', 3],
  ['may', 4], ['মে', 4],
  ['jun', 5], ['june', 5], ['জুন', 5],
  ['jul', 6], ['july', 6], ['জুলা', 6], ['জুলাই', 6],
  ['aug', 7], ['august', 7], ['আগ', 7], ['আগস্ট', 7],
  ['sep', 8], ['sept', 8], ['september', 8], ['সেপ', 8], ['সেপ্টেম্বর', 8],
  ['oct', 9], ['october', 9], ['অক্টো', 9], ['অক্টোবর', 9],
  ['nov', 10], ['november', 10], ['নভে', 10], ['নভেম্বর', 10],
  ['dec', 11], ['december', 11], ['ডিসে', 11], ['ডিসেম্বর', 11],
].forEach(([word, index]) => MONTH_WORDS.set(word, index));

const CATEGORY_ALIASES = {
  food: ['food', 'restaurant', 'restaurants', 'cafe', 'cafes', 'খাবার', 'রেস্টুরেন্ট'],
  groceries: ['groceries', 'grocery', 'bazar', 'bazaar', 'super shop', 'supermarket', 'market', 'বাজার'],
  transport: ['transport', 'transportation', 'fare', 'যাতায়াত', 'ভাড়া'],
  bills: ['bill', 'bills', 'recharge', 'utility', 'utilities', 'বিল', 'রিচার্জ'],
  shopping: ['shopping', 'কেনাকাটা'],
  health: ['health', 'medical', 'medicine', 'pharmacy', 'doctor', 'হাসপাতাল', 'ঔষধ', 'স্বাস্থ্য'],
  education: ['education', 'tuition', 'school fee', 'শিক্ষা', 'টিউশন'],
  entertainment: ['entertainment', 'cinema', 'movie', 'subscription', 'বিনোদন', 'সিনেমা'],
  rent: ['rent', 'house rent', 'flat rent', 'বাসা ভাড়া', 'বাড়ি ভাড়া'],
  family: ['family', 'পরিবার'],
  personal: ['personal', 'salon', 'haircut', 'ব্যক্তিগত', 'সেলুন'],
  gifts: ['gift', 'gifts', 'উপহার'],
  fees: ['fee', 'fees', 'charge', 'charges', 'service charge', 'ফি', 'চার্জ'],
  salary: ['salary', 'বেতন'],
  business: ['business', 'sales', 'ব্যবসা'],
  freelance: ['freelance', 'ফ্রিল্যান্স'],
  interest: ['interest', 'profit', 'সুদ', 'মুনাফা'],
  cashback: ['cashback', 'bonus', 'ক্যাশব্যাক', 'বোনাস'],
  refund: ['refund', 'reversal', 'রিফান্ড'],
};

const CATEGORY_WORDS = [];
for (const cat of CATEGORIES) {
  const words = new Set([
    cat.id,
    cat.en,
    cat.bn,
    ...(CATEGORY_ALIASES[cat.id] || []),
  ]);
  for (const word of words) {
    const phrase = normalizeText(word);
    if (phrase) CATEGORY_WORDS.push({ id: cat.id, phrase });
  }
}
CATEGORY_WORDS.sort((a, b) => b.phrase.length - a.phrase.length);

const STOP_WORDS = new Set(`
  a an the i me my mine we our us you your yours he she it they them their
  is are was were am be been being do does did done have has had having
  what which who whom whose when where why how much many
  please tell show list display give get find search see check about
  money taka tk poisa paisa amount total sum cost costs spent spend spending
  expense expenses paid pay payment payments gave give given send sent sending
  received receive income earning earned earn
  transaction transactions transiction transictions transaction's txn txns entry entries
  history record records details detail date dates time day days week weeks month months year years
  today yesterday tomorrow last this current previous past recent latest all everything every
  from to in on at for of and or with by via using between after before during
  sob shob shobgulo koto koyta koyti kotho khoroch kharch kharoch kharcha
  ami amar amake dilam diyechi diyechi korechi korchi pelam peyechi
  theke porjonto kobe kothay kake kar ki ken
  হিসাব আমার আমি আমাকে কত টাকা খরচ খরচা করেছি করেছি দিয়েছি দিলাম পেয়েছি
  সব সবগুলো লেনদেন দেখাও দেখতে কবে কোথায় কাকে কেন কি টাকার পরিমাণ মোট
  atm cash withdrawal withdraw withdrawn deposit transfer transfers
`.split(/\s+/).filter(Boolean));

const TERM_ALIASES = {
  poss: 'pos',
  ps: 'pos',
  transiction: 'transaction',
  transictions: 'transactions',
  transation: 'transaction',
  trasaction: 'transaction',
  resturant: 'restaurant',
  resturent: 'restaurant',
  restora: 'restaurant',
  kharch: 'expense',
  khoroch: 'expense',
  kharoch: 'expense',
  kharcha: 'expense',
};

const INCOME_WORDS = /\b(income|earn(?:ed|ing)?|receive[ds]?|receiving|salary|credit(?:ed)?|refund(?:ed)?|cashback|bonus|profit|interest|peyechi|pelam|আয়|পেয়েছি|জমা)\b/i;
const TRANSFER_WORDS = /\b(transfer|transfers|atm|cash\s*out|cash\s*withdraw(?:al|n)?|withdraw(?:al|n)?|withdrew|cash\s*in|deposit(?:ed)?)\b|স্থানান্তর|এটিএম|ক্যাশ\s*আউট|উত্তোলন/i;
const EXPENSE_WORDS = /\b(spent|spend|spending|expense|expenses|paid|pay|payment|payments|gave|give|given|send|sent|cost|costs|khoroch|kharch|kharoch|kharcha)\b|খরচ|দিয়েছি|দিলাম|পাঠিয়েছি/i;

const LIST_WORDS = /\b(list|show|display|recent|latest|history|transactions?|transictions?|entries|entry|when|dates?|all|everything|sob|shob)\b|দেখাও|সব|লেনদেন|কবে/i;
const HELP_WORDS = /\b(help|guide|how to use|what can you do|instructions?|usage|assistant help)\b|সাহায্য|কিভাবে|কীভাবে|গাইড/i;
const GREETING_WORDS = /^(hi|hello|hey|salam|assalamu|assalam|আসসালামু|সালাম|হাই|হ্যালো)\b/i;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthStart(year, monthIndex) {
  return `${year}-${pad2(monthIndex + 1)}-01`;
}

function monthEnd(year, monthIndex) {
  return endOfMonthISO(monthStart(year, monthIndex));
}

function monthLabel(year, monthIndex, lang) {
  if (lang === 'bn') return `${BN_MONTHS[monthIndex]} ${year}`;
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][monthIndex]} ${year}`;
}

function shiftMonthISO(iso, months) {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setMonth(d.getMonth() + months);
  return isoOf(d);
}

export function normalizeText(value) {
  return bnToEn(String(value ?? ''))
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9\u0980-\u09FF]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(text, phrase) {
  const value = normalizeText(text);
  const needle = normalizeText(phrase);
  if (!value || !needle) return false;
  return (` ${value} `).includes(` ${needle} `);
}

function addPhraseWords(target, phrase) {
  for (const word of normalizeText(phrase).split(' ')) {
    if (word) target.add(word);
  }
}

function digitsOf(value) {
  return bnToEn(String(value ?? '')).replace(/\D/g, '');
}

function phoneQuery(raw) {
  const compact = bnToEn(String(raw ?? ''));
  const runs = compact.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  let best = '';
  for (const run of runs) {
    const clean = run.trim();
    // Date literals can also contain 8 digits; don't treat them as phones.
    if (/[./]/.test(clean)) continue;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(clean)) continue;
    const digits = normalizePhone(clean);
    if (digits.length >= 8 && digits.length <= 16 && digits.length > best.length) best = digits;
  }
  return best;
}

function phoneHit(transactionDigits, phone) {
  if (!transactionDigits || !phone) return false;
  if (transactionDigits.includes(phone)) return true;
  if (phone.startsWith('880') && transactionDigits.includes(phone.slice(3))) return true;
  if (phone.startsWith('0') && transactionDigits.includes(`88${phone}`)) return true;
  if (phone.length >= 10 && transactionDigits.includes(phone.slice(-10))) return true;
  return false;
}

/* ------------------------------ dates ------------------------------ */
function parseRange(normalized, raw, today, lang) {
  const all = {
    from: '0000-01-01',
    to: today,
    label: 'all time',
    dates: 'all time',
    kind: 'all',
    explicit: false,
  };
  const text = bnToEn(String(raw ?? '')).toLowerCase();
  const s = normalized;

  // Explicit date pair: 2026-09-01 to 2026-09-30
  let m = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|until|till|theke|porjonto|–|-)\s*(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const from = parseDateAny(m[1]);
    const to = parseDateAny(m[2]);
    if (from && to) return dateRange(from, to, lang, 'date');
  }

  m = text.match(/\b(?:from|between)\s+(.+?)\s+(?:to|until|till|and)\s+(.+)$/i);
  if (m) {
    const from = parseDateAny(m[1].trim());
    const to = parseDateAny(m[2].trim());
    if (from && to) return dateRange(from, to, lang, 'date');
  }

  if (/\bday before yesterday\b|পরশু/.test(s)) {
    const date = addDaysISO(today, -2);
    return dateRange(date, date, lang, 'relative', 'day before yesterday');
  }
  if (/\btoday\b|আজ|aaj/.test(s)) return dateRange(today, today, lang, 'relative', 'today');
  if (/\byesterday\b|গতকাল|gotokal/.test(s)) {
    const date = addDaysISO(today, -1);
    return dateRange(date, date, lang, 'relative', 'yesterday');
  }

  m = s.match(/(?:last|past|previous|শেষ)\s+(\d{1,3})\s*(days?|weeks?|months?|years?|দিন|সপ্তাহ|মাস|বছর)/);
  if (m) {
    const count = Math.max(1, Math.min(365, Number(m[1]) || 1));
    const unit = m[2];
    let from;
    if (/^day|দিন/.test(unit)) from = addDaysISO(today, -(count - 1));
    else if (/^week|সপ্তাহ/.test(unit)) from = addDaysISO(today, -(count * 7 - 1));
    else if (/^month|মাস/.test(unit)) from = shiftMonthISO(today, -count);
    else from = shiftMonthISO(today, -count * 12);
    return dateRange(from, today, lang, 'relative', `last ${count} ${m[2]}`);
  }

  if (/\bthis\s+(?:month|mash)\b|এই\s*মাস|চলতি\s*মাস/.test(s)) {
    return dateRange(`${today.slice(0, 7)}-01`, today, lang, 'relative', 'this month');
  }
  if (/\b(?:last|previous|past)\s+(?:month|mash)\b|গত\s*মাস|আগের\s*মাস/.test(s)) {
    const from = addDaysISO(shiftMonthISO(`${today.slice(0, 7)}-01`, -1), 0);
    return dateRange(from, endOfMonthISO(from), lang, 'relative', 'last month');
  }
  if (/\bthis\s+week\b|এই\s*সপ্তাহ|চলতি\s*সপ্তাহ/.test(s)) {
    const d = parseISO(today);
    const offset = d ? (d.getDay() + 6) % 7 : 0;
    return dateRange(addDaysISO(today, -offset), today, lang, 'relative', 'this week');
  }
  if (/\b(?:last|previous|past)\s+week\b|গত\s*সপ্তাহ|আগের\s*সপ্তাহ/.test(s)) {
    const d = parseISO(today);
    const offset = d ? (d.getDay() + 6) % 7 : 0;
    const thisStart = addDaysISO(today, -offset);
    const from = addDaysISO(thisStart, -7);
    return dateRange(from, addDaysISO(from, 6), lang, 'relative', 'last week');
  }
  if (/\bthis\s+year\b|এই\s*বছর|চলতি\s*বছর/.test(s)) {
    return dateRange(`${today.slice(0, 4)}-01-01`, today, lang, 'relative', 'this year');
  }
  if (/\b(?:last|previous|past)\s+year\b|গত\s*বছর|আগের\s*বছর/.test(s)) {
    const year = Number(today.slice(0, 4)) - 1;
    return dateRange(`${year}-01-01`, `${year}-12-31`, lang, 'relative', 'last year');
  }

  // A named month, optionally followed by a year.
  const yearMatch = s.match(/\b(19\d{2}|20\d{2})\b/);
  let namedMonth = -1;
  for (const [word, index] of MONTH_WORDS) {
    if (includesPhrase(s, word)) { namedMonth = index; break; }
  }
  if (namedMonth >= 0) {
    const nowYear = Number(today.slice(0, 4));
    let year = yearMatch ? Number(yearMatch[1]) : nowYear;
    let from = monthStart(year, namedMonth);
    if (!yearMatch && from > today) {
      year -= 1;
      from = monthStart(year, namedMonth);
    }
    return dateRange(from, monthEnd(year, namedMonth), lang, 'month', monthLabel(year, namedMonth, lang));
  }

  if (yearMatch && !/\b\d{1,2}[\/.\-]\d{1,2}/.test(text)) {
    const year = Number(yearMatch[1]);
    return dateRange(`${year}-01-01`, `${year}-12-31`, lang, 'year', String(year));
  }

  const single = parseDateAny(text.trim());
  if (single) return dateRange(single, single, lang, 'date');
  return all;
}

function dateRange(from, to, lang, kind, label = '') {
  const safeFrom = from <= to ? from : to;
  const safeTo = from <= to ? to : from;
  return {
    from: safeFrom,
    to: safeTo,
    label: label || formatRangeLabel(safeFrom, safeTo, lang),
    dates: formatRangeLabel(safeFrom, safeTo, lang),
    kind,
    explicit: true,
  };
}

function inDateRange(tx, range) {
  return tx.date >= range.from && tx.date <= range.to;
}

/* ------------------------------ query features ------------------------------ */
function detectCategories(s, excluded) {
  const ids = [];
  const words = [];
  for (const item of CATEGORY_WORDS) {
    if (!includesPhrase(s, item.phrase)) continue;
    if (!ids.includes(item.id)) ids.push(item.id);
    if (!words.includes(item.phrase)) words.push(item.phrase);
  }
  for (const word of words) {
    excluded.add(word);
    addPhraseWords(excluded, word);
  }
  return {
    ids,
    words,
    hasIncome: ids.some((id) => getCategory(id).type === 'income'),
    hasExpense: ids.some((id) => getCategory(id).type === 'expense'),
  };
}

function detectAccounts(s, excluded) {
  const ids = [];
  const words = [];
  if (includesPhrase(s, 'bank') || includesPhrase(s, 'ব্যাংক')) {
    ids.push('bank');
    words.push('bank', 'ব্যাংক');
  }
  if (includesPhrase(s, 'bkash') || includesPhrase(s, 'bikash') || includesPhrase(s, 'বিকাশ')) {
    ids.push('bkash');
    words.push('bkash', 'bikash', 'বিকাশ');
  }
  const cashOut = /\bcash\s*(?:out|withdraw(?:al|n)?|wd|wdl|in|deposit)\b|ক্যাশ\s*(?:আউট|উত্তোলন|জমা)/.test(s);
  if (!cashOut && (includesPhrase(s, 'cash') || includesPhrase(s, 'ক্যাশ'))) {
    ids.push('cash');
    words.push('cash', 'ক্যাশ');
  }
  for (const word of words) {
    excluded.add(word);
    addPhraseWords(excluded, word);
  }
  return ids;
}

function detectMember(state, s, excluded) {
  if (/\b(all members?|everyone|everybody|sobai|shobai)\b|সবাই|সব\s*সদস্য/.test(s)) {
    return 'all';
  }
  let found = null;
  for (const member of state.members || []) {
    const name = normalizeText(member.name);
    if (!name) continue;
    // "Me" is too common a word to treat as a member name on its own.
    if (name.length < 3) continue;
    if (includesPhrase(s, name) || (name.split(' ').length > 1 && name.split(' ').every((word) => includesPhrase(s, word)))) {
      if (!found || name.length > found.name.length) found = { id: member.id, name };
    }
  }
  if (found) {
    addPhraseWords(excluded, found.name);
    return found.id;
  }
  // The assistant searches every member by default; mention a member name to narrow it.
  return 'all';
}

function detectContact(state, s, raw, excluded) {
  const contacts = Array.isArray(state.contacts) ? state.contacts : [];
  const phone = phoneQuery(raw);
  let contact = null;

  if (phone) {
    contact = contacts.find((item) => phoneHit(phone, item.phone)) || null;
  }

  if (!contact) {
    let best = null;
    for (const item of contacts) {
      const name = normalizeText(item.name);
      if (!name || name.length < 3) continue;
      if (!includesPhrase(s, name)) continue;
      if (!best || name.length > best.name.length) best = { contact: item, name };
    }
    if (best) contact = best.contact;
  }

  const identity = {
    contact,
    phone: contact?.phone || phone || '',
    name: contact?.name || '',
  };

  if (!identity.phone && !identity.name) return null;

  if (identity.phone) addPhraseWords(excluded, identity.phone);
  if (identity.name) addPhraseWords(excluded, identity.name);

  // Names typed with a number but not saved yet are still useful search terms.
  if (!identity.name && !identity.phone) return null;
  return identity;
}

function detectType(s, categories, identity, terms, intent) {
  if (TRANSFER_WORDS.test(s)) return 'transfer';
  if (INCOME_WORDS.test(s)) return 'income';
  if (EXPENSE_WORDS.test(s)) return 'expense';
  if (categories.hasIncome && !categories.hasExpense) return 'income';
  if (categories.hasExpense) return 'expense';
  if (identity) return 'expense';
  if (terms.length) return 'expense';
  if (/\b(all|everything|every|sob|shob)\b|সব/.test(s)) return 'all';
  if (intent === 'list' && /\btransactions?|transictions?|entries|history\b|লেনদেন/.test(s)) return 'all';
  return 'all';
}

function detectIntent(s, hasFilters) {
  if (HELP_WORDS.test(s)) return 'help';
  if (GREETING_WORDS.test(s)) return 'greeting';
  const balanceWords = /\b(balance|balances|how much (?:money|taka|cash)? ?(?:do i have|i have|have i got)|how much (?:money|taka|cash)? ?(?:in|at) (?:the )?(?:bank|bkash|cash)|available balance|remaining balance)\b|ব্যালেন্স|কত\s*টাকা\s*আছে|কত\s*আছে/;
  if (balanceWords.test(s) && !EXPENSE_WORDS.test(s) && !TRANSFER_WORDS.test(s)) return 'balance';
  if (LIST_WORDS.test(s)) return 'list';
  if (EXPENSE_WORDS.test(s) || INCOME_WORDS.test(s) || TRANSFER_WORDS.test(s)) return 'spend';
  return hasFilters ? 'spend' : 'unknown';
}

function detectExplicitLimit(s) {
  let m = s.match(/(?:last|latest|recent|top|first)\s+(\d{1,3})\s+(?:transactions?|transictions?|txns?|entries?)\b/);
  if (!m) m = s.match(/\b(\d{1,3})\s+(?:transactions?|transictions?|txns?|entries?)\b/);
  if (m) return Math.max(1, Math.min(50, Number(m[1])));
  if (/\blast transaction\b|সর্বশেষ\s*লেনদেন/.test(s)) return 1;
  return 0;
}

function extractTerms(s, excluded) {
  const out = [];
  for (const token of s.split(' ')) {
    if (!token || STOP_WORDS.has(token) || excluded.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    const mapped = TERM_ALIASES[token] || token;
    if (STOP_WORDS.has(mapped) || excluded.has(mapped)) continue;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

/* ------------------------------ matching ------------------------------ */
function editAtMostOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenHit(tokens, term) {
  for (const token of tokens) {
    if (token === term) return true;
    if (term.length >= 4 && (token.startsWith(term) || term.startsWith(token))) return true;
    if (term.length >= 5 && token.length >= 5 && editAtMostOne(token, term)) return true;
  }
  return false;
}

function buildHaystack(tx, state, contactList) {
  const cat = getCategory(tx.category);
  const member = (state.members || []).find((item) => item.id === tx.memberId);
  const parts = [
    tx.note, tx.ref, tx.source, tx.type, tx.date,
    cat.en, cat.bn,
    accountName(tx.account, 'en'), accountName(tx.account, 'bn'),
    tx.toAccount ? accountName(tx.toAccount, 'en') : '',
    tx.toAccount ? accountName(tx.toAccount, 'bn') : '',
    member?.name, tx.amount,
  ].filter(Boolean);
  const digits = parts.join(' ').replace(/\D/g, '');
  for (const contact of contactList) {
    if (contact.phone && phoneHit(digits, contact.phone)) parts.push(contact.name);
  }
  const text = normalizeText(parts.join(' '));
  return { text, tokens: text.split(' '), digits };
}

function identityHit(hay, identity) {
  if (!identity) return true;
  if (identity.phone && phoneHit(hay.digits, identity.phone)) return true;
  if (!identity.name) return false;
  const tokens = normalizeText(identity.name).split(' ').filter(Boolean);
  if (!tokens.length) return false;
  const matched = tokens.filter((token) => hay.tokens.some((item) => (
    item === token
    || (token.length >= 4 && (item.startsWith(token) || token.startsWith(item)))
    || (token.length >= 5 && editAtMostOne(token, item))
  )));
  if (matched.length === tokens.length) return true;
  // A distinctive first name is enough when the saved label has more words.
  return matched.some((token) => token.length >= 5);
}

function inList(value, list) {
  return !list.length || list.includes(value);
}

function matchedTransactions(state, criteria) {
  const {
    range, memberFilter, type, accounts, categories, identity, terms,
  } = criteria;
  const contacts = Array.isArray(state.contacts) ? state.contacts : [];
  const cache = new Map();
  const hayOf = (tx) => {
    if (!cache.has(tx.id)) cache.set(tx.id, buildHaystack(tx, state, contacts));
    return cache.get(tx.id);
  };

  const pick = (useCategory) => (state.txns || []).filter((tx) => {
    if (!inDateRange(tx, range)) return false;
    if (memberFilter !== 'all' && tx.memberId !== memberFilter) return false;
    if (type !== 'all' && tx.type !== type) return false;
    if (accounts.length && !accounts.includes(tx.account)) return false;
    if (useCategory && categories.length && !categories.includes(tx.category)) return false;

    const hay = hayOf(tx);
    const termsMatch = !terms.length || terms.every((term) => tokenHit(hay.tokens, term));
    if (identity) {
      const idMatch = identityHit(hay, identity);
      // For an unsaved phone, a name-only note is still a valid match.
      if (!identity.contact && identity.phone && terms.length) {
        if (!idMatch && !termsMatch) return false;
      } else if (!idMatch || !termsMatch) {
        return false;
      }
    } else if (!termsMatch) {
      return false;
    }
    return true;
  });

  let rows = pick(true);
  if (!rows.length && categories.length && terms.length) rows = pick(false);
  return rows.sort(compareTransactions);
}

function compareTransactions(a, b) {
  const byDate = b.date.localeCompare(a.date);
  if (byDate) return byDate;
  const byCreated = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  if (byCreated) return byCreated;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

/* ------------------------------ answers ------------------------------ */
function rangeSuffix(range) {
  if (!range || range.kind === 'all') return '';
  if (range.kind === 'relative') return ` ${range.label}`;
  return ` in ${range.label}`;
}

function subjectText(criteria, type) {
  const { contact, terms, categories, accounts } = criteria;
  if (contact) {
    const name = contact.contact
      ? `${contact.name} (${contact.phone})`
      : (contact.name || contact.phone);
    if (type === 'income') return ` from ${name}`;
    if (type === 'transfer') return ` involving ${name}`;
    return ` to ${name}`;
  }
  if (terms.length) return ` matching “${terms.join(' ')}”`;
  if (categories.length) {
    return ` on ${categories.map((id) => categoryName(id)).join(', ')}`;
  }
  if (accounts.length) return ` in ${accounts.map((id) => accountName(id)).join(', ')}`;
  return '';
}

function titleFor(criteria, type, range) {
  const { contact, terms, categories } = criteria;
  let title = '';
  if (contact) title = contact.name || contact.phone;
  else if (terms.length) title = terms.join(' ');
  else if (categories.length) title = categories.map((id) => categoryName(id)).join(', ');
  else if (type === 'income') title = 'Income';
  else if (type === 'expense') title = 'Expenses';
  else if (type === 'transfer') title = 'Transfers';
  else title = 'Transactions';
  if (range && range.kind !== 'all') title += ` · ${range.label}`;
  return title;
}

function chipsFor(criteria, type, range) {
  const chips = [];
  if (range && range.kind !== 'all') chips.push({ kind: 'calendar', text: range.dates });
  else chips.push({ kind: 'calendar', text: 'All time' });
  if (type !== 'all') {
    chips.push({ kind: type === 'income' ? 'arrowDownLeft' : type === 'transfer' ? 'refresh' : 'arrowUpRight', text: `${type.charAt(0).toUpperCase()}${type.slice(1)}` });
  }
  if (criteria.contact) {
    chips.push({ kind: 'user', text: criteria.contact.name || criteria.contact.phone });
  }
  if (criteria.categories.length) {
    chips.push({ kind: 'tag', text: criteria.categories.map((id) => categoryName(id)).join(', ') });
  }
  if (criteria.accounts.length) {
    chips.push({ kind: 'wallet', text: criteria.accounts.map((id) => accountName(id)).join(', ') });
  }
  if (criteria.memberFilter && criteria.memberFilter !== 'all' && criteria.memberLabel) {
    chips.push({ kind: 'user', text: criteria.memberLabel });
  }
  return chips;
}

export function exampleQuestions(state) {
  const contacts = Array.isArray(state?.contacts) ? state.contacts : [];
  const out = [];
  if (contacts[0]) out.push(`How much did I give ${contacts[0].name}?`);
  out.push('How much did I spend on shopping last month?');
  out.push('Show my Rizq restaurant expenses');
  out.push('List POS transactions');
  out.push('Show bill payments this year');
  out.push('What is my bank balance?');
  out.push('Show my last 10 transactions');
  return [...new Set(out)].slice(0, 6);
}

function helpAnswer(state, lang) {
  const examples = exampleQuestions(state);
  return {
    ok: true,
    intent: 'help',
    title: 'How to ask',
    text: [
      'Ask in your own words. I search every bank, bKash and cash transaction saved on this phone.',
      'You can mention a date (today, last month, January 2026), a category (shopping, bills, food), an account (bank, bKash, cash), a note/merchant (Rizq restaurant), a phone number, or a saved contact name.',
      'For a saved contact, open “Saved contacts” below, add a name and number once, then ask by the name.',
      'I can also list POS transactions, bill payments, the latest entries, totals and account balances. Nothing is sent to a server.',
    ].join('\n\n'),
    chips: [{ kind: 'shield', text: 'On-device · offline' }],
    suggestions: examples,
  };
}

function greetingAnswer(state) {
  return {
    ok: true,
    intent: 'greeting',
    title: 'Hi, I’m Hishab Assistant',
    text: 'Ask me about any transaction from the beginning — spending, income, transfers, dates, categories, merchants, phone numbers or saved contacts. I work entirely on this device.',
    chips: [{ kind: 'shield', text: 'On-device · offline' }],
    suggestions: exampleQuestions(state),
  };
}

function balanceAnswer(state, query, lang) {
  const summary = accountSummary(state);
  const accounts = detectAccounts(normalizeText(query), new Set());
  const selected = accounts.length ? accounts : ACCOUNT_IDS;
  const selectedTotal = selected.reduce((sum, id) => sum + (summary.accounts[id]?.balance || 0), 0);
  const balances = ACCOUNT_IDS.map((id) => ({
    id,
    name: accountName(id, lang),
    balance: summary.accounts[id]?.balance || 0,
  }));
  const text = accounts.length
    ? `Your ${accounts.map((id) => accountName(id, lang)).join(' / ')} balance is ${fmtMoney(selectedTotal)}.`
    : `Your total balance is ${fmtMoney(summary.total)} — ${balances.map((item) => `${item.name} ${fmtMoney(item.balance)}`).join(' · ')}.`;
  return {
    ok: true,
    intent: 'balance',
    title: accounts.length ? `${accounts.map((id) => accountName(id, lang)).join(' / ')} balance` : 'Account balance',
    text,
    total: selectedTotal,
    count: 0,
    balances,
    chips: [{ kind: 'wallet', text: 'All-time balance' }],
    suggestions: exampleQuestions(state),
  };
}

function emptyAnswer(state, criteria, range) {
  const { contact, terms, categories, type } = criteria;
  let title = 'No matching transactions';
  let text = '';
  if (!(state.txns || []).length) {
    title = 'No transactions yet';
    text = 'There are no transactions on this phone yet. Import a bank or bKash statement, or add an expense, then ask me again.';
  } else if (contact?.phone && !contact.contact) {
    text = `I couldn’t find a transaction with ${contact.phone}${rangeSuffix(range)}. If this is a person you pay often, save the number under a name in “Saved contacts” below.`;
  } else {
    const subject = subjectText(criteria, type);
    const what = type === 'expense' ? 'expenses' : type === 'income' ? 'income' : type === 'transfer' ? 'transfers' : 'transactions';
    text = `I couldn’t find any ${what}${subject}${rangeSuffix(range)}. Try a shorter note or merchant name, remove the date filter, or ask for “all time”.`;
  }
  return {
    ok: false,
    empty: true,
    intent: 'empty',
    title,
    text,
    total: 0,
    count: 0,
    txns: [],
    range,
    chips: chipsFor(criteria, type, range),
    suggestions: exampleQuestions(state),
  };
}

function transactionAnswer(state, query, criteria, range, intent, limit, explicitLimit, lang) {
  const allRows = matchedTransactions(state, criteria);
  if (!allRows.length) return emptyAnswer(state, criteria, range);

  const totalMatches = allRows.length;
  const rows = explicitLimit ? allRows.slice(0, explicitLimit) : allRows;
  const { type } = criteria;
  let expense = 0;
  let income = 0;
  let transfer = 0;
  for (const tx of rows) {
    if (tx.type === 'expense') expense += tx.amount;
    else if (tx.type === 'income') income += tx.amount;
    else transfer += tx.amount;
  }
  const count = rows.length;
  const total = type === 'expense' ? expense
    : type === 'income' ? income
      : type === 'transfer' ? transfer
        : expense + income + transfer;
  const noun = type === 'transfer' ? 'transfer' : 'transaction';
  const countText = `${count} ${noun}${count === 1 ? '' : 's'}`;
  const subject = subjectText(criteria, type);
  const suffix = rangeSuffix(range);
  const q = normalizeText(query);
  const gave = criteria.contact && /\b(gave|give|given|send|sent|paid|pay)\b|দিয়েছি|দিলাম|পাঠিয়েছি/.test(q);
  const contactLabel = criteria.contact
    ? (criteria.contact.name ? `${criteria.contact.name}${criteria.contact.phone ? ` (${criteria.contact.phone})` : ''}` : criteria.contact.phone)
    : '';
  let text;
  if (type === 'expense' && gave) {
    text = `You gave ${contactLabel} ${fmtMoney(expense)} across ${countText}${suffix}.`;
  } else if (type === 'expense') text = `You spent ${fmtMoney(expense)} across ${countText}${subject}${suffix}.`;
  else if (type === 'income') text = `You received ${fmtMoney(income)} across ${countText}${subject}${suffix}.`;
  else if (type === 'transfer') text = `You moved ${fmtMoney(transfer)} in ${countText}${subject}${suffix}.`;
  else {
    const bits = [];
    if (expense) bits.push(`expenses ${fmtMoney(expense)}`);
    if (income) bits.push(`income ${fmtMoney(income)}`);
    if (transfer) bits.push(`transfers ${fmtMoney(transfer)}`);
    text = `You had ${countText}${subject}${suffix}${bits.length ? ` — ${bits.join(' · ')}` : ''}.`;
  }

  const displayLimit = Math.max(1, Math.min(limit || 12, 50));
  const shown = rows.slice(0, displayLimit);
  const latest = rows[0];
  return {
    ok: true,
    intent,
    title: titleFor(criteria, type, range),
    text,
    detail: latest ? `Latest: ${formatDate(latest.date, 'long', lang)}` : '',
    total,
    expenseTotal: expense,
    incomeTotal: income,
    transferTotal: transfer,
    count,
    totalMatches,
    txns: shown,
    more: Math.max(0, totalMatches - shown.length),
    range,
    type,
    contact: criteria.contact || null,
    chips: chipsFor(criteria, type, range),
    suggestions: exampleQuestions(state),
  };
}

/**
 * Answer a natural-language question about the local transaction list.
 * @param {string} query
 * @param {object} state normalized Hishab state
 * @param {{lang?: string, today?: string}} [opts]
 */
export function answerQuestion(query, state, opts = {}) {
  const raw = String(query || '').trim();
  const s = normalizeText(raw);
  const lang = opts.lang || state?.settings?.lang || 'en';
  const today = opts.today || todayISO();

  if (!s) {
    return {
      ok: false,
      empty: true,
      intent: 'unknown',
      title: 'Ask me about your money',
      text: 'Try a question like “How much did I spend on shopping last month?” or open the help section for examples.',
      suggestions: exampleQuestions(state),
    };
  }

  const earlyIntent = detectIntent(s, false);
  if (earlyIntent === 'help') return helpAnswer(state, lang);
  if (earlyIntent === 'greeting') return greetingAnswer(state);
  if (earlyIntent === 'balance') return balanceAnswer(state, raw, lang);

  const range = parseRange(s, raw, today, lang);
  const excluded = new Set();
  const categories = detectCategories(s, excluded);
  const accounts = detectAccounts(s, excluded);
  const memberFilter = detectMember(state, s, excluded);
  const member = (state.members || []).find((item) => item.id === memberFilter);
  const identity = detectContact(state, s, raw, excluded);
  const explicitLimit = detectExplicitLimit(s);
  const limit = explicitLimit || (earlyIntent === 'list' ? 20 : 12);
  const terms = extractTerms(s, excluded);
  const intent = detectIntent(s, Boolean(categories.ids.length || accounts.length || identity || terms.length));
  const type = detectType(s, categories, identity, terms, intent);
  const criteria = {
    range,
    categories: categories.ids,
    accounts,
    contact: identity,
    identity,
    terms,
    type,
    memberFilter,
    memberLabel: member?.name || '',
  };

  if (intent === 'unknown') {
    return {
      ok: false,
      empty: true,
      intent,
      title: 'I didn’t catch that',
      text: 'I can search transactions by date, category, account, note/merchant, phone number or saved contact. Try a question like “How much did I spend on shopping last month?”',
      suggestions: exampleQuestions(state),
    };
  }

  return transactionAnswer(state, raw, criteria, range, intent, limit, explicitLimit, lang);
}

export { CATEGORY_ALIASES, MONTH_WORDS };
