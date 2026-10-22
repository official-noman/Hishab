/* =========================================================
   Hishab — voice entry (speech recognition + command parser)
   ========================================================= */

import { accountName, categoryName, matchCategory } from './categories.js';
import { addDaysISO, bnToEn, todayISO } from './utils.js';

const EN_UNITS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const EN_TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const BN_NUMBERS = {
  শূন্য: 0,
  এক: 1,
  দুই: 2,
  দু: 2,
  তিন: 3,
  চার: 4,
  পাঁচ: 5,
  ছয়: 6,
  সাত: 7,
  আট: 8,
  নয়: 9,
  দশ: 10,
  এগারো: 11,
  বারো: 12,
  তেরো: 13,
  চৌদ্দ: 14,
  পনেরো: 15,
  পনের: 15,
  ষোল: 16,
  সতেরো: 17,
  আঠারো: 18,
  উনিশ: 19,
  বিশ: 20,
  পঁচিশ: 25,
  ত্রিশ: 30,
  চল্লিশ: 40,
  পঞ্চাশ: 50,
  ষাট: 60,
  সত্তর: 70,
  আশি: 80,
  নব্বই: 90,
  একশ: 100,
  একশো: 100,
  দুইশ: 200,
  দুশো: 200,
  তিনশ: 300,
  চারশ: 400,
  পাঁচশ: 500,
  ছয়শ: 600,
  সাতশ: 700,
  আটশ: 800,
  নয়শ: 900,
  শত: 100,
  হাজার: 1000,
  লাখ: 100000,
  লক্ষ: 100000,
  কোটি: 10000000,
};

const MULTIPLIERS = {
  hundred: 100,
  thousand: 1000,
  million: 1000000,
  lakh: 100000,
  lac: 100000,
  crore: 10000000,
  ...Object.fromEntries(
    Object.entries(BN_NUMBERS).filter(([, value]) => value >= 100),
  ),
};

const NUMBER_WORDS = new Set([
  ...Object.keys(EN_UNITS),
  ...Object.keys(EN_TENS),
  ...Object.keys(BN_NUMBERS),
  ...Object.keys(MULTIPLIERS),
]);

const CURRENCY_WORDS = /\b(?:taka|toka|takka|tacka|taca|tk|bdt|poisha|paisa)\b|৳|টাকা/g;
const TYPE_WORDS = /\b(?:spent|spend|paid|pay|payment|cost|expense|income|received|receive|got|earned|earn|bought|buy|purchase|transferred|transfer|moved|move|added|add|sent|send|gave|given|donated|withdraw|withdrew|deposit|deposited|save|record|log|entry|transaction)\b/gi;
const ACCOUNT_WORDS = /\b(?:bank|bkash|bikash|b-kash|card|account|cash)\b|ব্যাংক(?:ে)?|ব্যাঙ্ক(?:ে)?|বিকাশ(?:ে)?|ক্যাশ(?:ে)?|নগদ(?:ে)?/gi;
const DATE_WORDS = /\b(?:today|yesterday|yester-day|last night|day before yesterday)\b|আজ|গতকাল|পরশু/gi;
const SPEECH_FILLER = /\b(?:i|we|he|she|they|you|my|our|on|for|at|about|of|to|from|by|with|the|a|an|please|pls)\b/gi;

const INCOME_WORDS = /\b(?:income|salary|bonus|cashback|refund|profit|interest|earned|earn|received|receive|got|credited|credit|deposit|deposited|sold|sales|freelance)\b/i;
const EXPENSE_WORDS = /\b(?:spent|spend|paid|pay|payment|cost|expense|bought|buy|purchase|fare|bill|recharge|withdraw|withdrew|sent|gave|given|donated)\b/i;
const TRANSFER_WORDS = /\b(?:transfer|transferred|move|moved|add money|cash out|cash in|atm|withdraw|withdrew|withdrawal|withdrawn|deposit|deposited)\b/i;
const FROM_TO_WORDS = /\bfrom\s+(?:my\s+)?(?:bank|bkash|bikash|b-kash|cash|account|card)\b.*\bto\s+(?:my\s+)?(?:bank|bkash|bikash|b-kash|cash|account|card)\b/i;
const FAMILY_WORDS = /\b(?:mom|mum|mother|dad|father|family|wife|husband|brother|sister|son|daughter|parents)\b|আম্মু|আব্বু|মা|বাবা|পরিবার/i;

const BN_INCOME_WORDS = ['বেতন', 'আয়', 'পেয়েছি', 'পেলাম', 'বোনাস', 'ফেরত', 'লাভ', 'কামাই', 'উপার্জন', 'জমা হয়েছে'];
const BN_EXPENSE_WORDS = ['খরচ', 'দিয়েছি', 'দিলাম', 'কিনেছি', 'কিনলাম', 'ভাড়া', 'বিল', 'রিচার্জ'];
const BN_TRANSFER_WORDS = ['ট্রান্সফার', 'স্থানান্তর', 'উত্তোলন', 'ক্যাশ আউট', 'ক্যাশ ইন', 'অ্যাড মানি', 'এটিএম'];
const BN_NOTE_WORDS = /দিয়েছি|দিলাম|কিনেছি|কিনলাম|পেয়েছি|পেলাম|ট্রান্সফার|স্থানান্তর|উত্তোলন|এটিএম|আমি|আমার|জন্য|থেকে/g;

/* ------------------------------ amount ------------------------------ */
function parseNumericAmounts(text) {
  const out = [];
  const rx = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g;
  let match;
  while ((match = rx.exec(text)) !== null) {
    let value = Number.parseFloat(match[0].replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 24);
    const before = text.slice(Math.max(0, match.index - 14), match.index);
    const multiplier = after.match(/^\s*(?:(k|lakh|lac|crore|thousand|million)\b|(লাখ|লক্ষ|কোটি|হাজার))/i);
    let raw = match[0];
    if (multiplier) {
      const word = (multiplier[1] || multiplier[2] || '').toLowerCase();
      const factor = word === 'k' ? 1000 : MULTIPLIERS[word];
      if (factor) {
        value *= factor;
        raw += multiplier[0];
      }
    }
    out.push({
      value,
      raw,
      index: match.index,
      currency: /\b(?:taka|toka|takka|tacka|taca|tk|bdt)\b/i.test(after)
        || /\b(?:taka|toka|takka|tacka|taca|tk|bdt)\b/i.test(before),
    });
  }
  return out;
}

function computeNumber(tokens, start) {
  let total = 0;
  let current = 0;
  let used = 0;

  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === 'and' && used > 0) {
      used += 1;
      continue;
    }
    const unit = EN_UNITS[token] ?? EN_TENS[token] ?? BN_NUMBERS[token];
    if (unit != null) {
      current += unit;
      used += 1;
      continue;
    }
    const multiplier = MULTIPLIERS[token];
    if (multiplier != null) {
      if (multiplier === 100) {
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * multiplier;
        current = 0;
      }
      used += 1;
      continue;
    }
    break;
  }

  return { value: total + current, used };
}

function parseWordAmount(text) {
  const tokens = text.split(/[\s-]+/).map((token) => token.replace(/^[^a-z0-9\u0980-\u09ff]+|[^a-z0-9\u0980-\u09ff]+$/gi, ''));
  for (let i = 0; i < tokens.length; i += 1) {
    if (!tokens[i]) continue;
    const isNumber = EN_UNITS[tokens[i]] != null
      || EN_TENS[tokens[i]] != null
      || BN_NUMBERS[tokens[i]] != null
      || MULTIPLIERS[tokens[i]] != null;
    if (!isNumber) continue;
    const result = computeNumber(tokens, i);
    if (result.used > 0 && result.value > 0) return result;
  }
  return null;
}

function findAmount(text) {
  const numeric = parseNumericAmounts(text);
  const words = parseWordAmount(text);
  const withCurrency = numeric.filter((item) => item.currency);
  const chosen = withCurrency[0] || numeric[0] || words;
  return {
    value: chosen ? Math.round(chosen.value * 100) / 100 : 0,
    raw: chosen ? String(chosen.raw ?? chosen.value) : '',
    candidates: numeric.length + (words ? 1 : 0),
  };
}

/* ------------------------------ intent ------------------------------ */
function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function detectType(text) {
  if (
    TRANSFER_WORDS.test(text)
    || FROM_TO_WORDS.test(text)
    || includesAny(text, BN_TRANSFER_WORDS)
  ) {
    return 'transfer';
  }

  const hasIncome = INCOME_WORDS.test(text) || includesAny(text, BN_INCOME_WORDS);
  const hasExpense = EXPENSE_WORDS.test(text) || includesAny(text, BN_EXPENSE_WORDS);

  if (hasIncome && !hasExpense) return 'income';
  if (hasExpense && !hasIncome) return 'expense';
  if (hasIncome && hasExpense) {
    const gotMoney = /\b(?:received|receive|got|earned|earn)\b/i.test(text)
      || includesAny(text, ['পেয়েছি', 'পেলাম']);
    const hardExpense = /\b(?:paid|spent|bought|cost|sent|gave|bill)\b/i.test(text)
      || includesAny(text, ['দিয়েছি', 'দিলাম', 'কিনেছি', 'কিনলাম', 'খরচ']);
    const paymentWord = /\bpayment\b/i.test(text);
    if (gotMoney && !hardExpense) return 'income';
    if (hardExpense) return 'expense';
    if (paymentWord) return 'expense';
    return 'income';
  }
  return 'expense';
}

function accountId(word) {
  const token = String(word || '').toLowerCase();
  if (/bkash|bikash|b-kash|বিকাশ/.test(token)) return 'bkash';
  if (/bank|card|account|ব্যাংক|ব্যাঙ্ক/.test(token)) return 'bank';
  if (/cash|ক্যাশ|নগদ/.test(token)) return 'cash';
  return '';
}

function detectAccounts(text) {
  const mentions = [];
  const rx = /\b(bkash|bikash|b-kash|bank|card|account|cash)\b|বিকাশ|ব্যাংক|ব্যাঙ্ক|ক্যাশ|নগদ/gi;
  let match;
  while ((match = rx.exec(text)) !== null) {
    const id = accountId(match[0]);
    if (id) mentions.push({ id, index: match.index });
  }

  const fromMatch = text.match(/\bfrom\s+(?:my\s+)?(bkash|bikash|b-kash|bank|card|account|cash)\b/i)
    || text.match(/\bfrom\s+(?:my\s+)?(বিকাশ|ব্যাংক|ব্যাঙ্ক|ক্যাশ|নগদ)/i);
  const toMatch = text.match(/\bto\s+(?:my\s+)?(bkash|bikash|b-kash|bank|card|account|cash)\b/i)
    || text.match(/\bto\s+(?:my\s+)?(বিকাশ|ব্যাংক|ব্যাঙ্ক|ক্যাশ|নগদ)/i);
  const byMatch = text.match(/\b(?:by|with|via|using)\s+(?:my\s+)?(bkash|bikash|b-kash|bank|card|account|cash)\b/i);

  return {
    mentions,
    from: fromMatch ? accountId(fromMatch[1]) : '',
    to: toMatch ? accountId(toMatch[1]) : '',
    by: byMatch ? accountId(byMatch[1]) : '',
  };
}

function routeAccounts(text, type, accounts) {
  const mentioned = accounts.mentions.map((item) => item.id);
  let account = accounts.from || accounts.by || mentioned[0] || '';
  let toAccount = accounts.to || '';

  if (type !== 'transfer') {
    return { account: account || accounts.by || 'cash', toAccount: '' };
  }

  if (/\badd\s*money\b/i.test(text)) {
    return { account: account || 'bank', toAccount: toAccount || 'bkash' };
  }
  if (/\batm\b/i.test(text)) {
    return { account: accounts.from || 'bank', toAccount: accounts.to || 'cash' };
  }
  if (/\bcash\s*out\b/i.test(text) || /\bwithdraw/i.test(text)) {
    const source = mentioned.find((id) => id !== 'cash') || '';
    return { account: accounts.from || source || 'bkash', toAccount: toAccount || 'cash' };
  }
  if (/\bcash\s*in\b/i.test(text)) {
    const source = mentioned.find((id) => id !== 'bkash') || '';
    return { account: accounts.from || source || 'cash', toAccount: toAccount || 'bkash' };
  }
  if (/\bdeposit/i.test(text)) {
    return { account: account || 'cash', toAccount: toAccount || 'bank' };
  }

  if (account && toAccount && account === toAccount) toAccount = '';
  if (!account && !toAccount) {
    account = mentioned[0] || 'cash';
    toAccount = mentioned[1] || '';
  }
  if (!account) account = mentioned[0] || 'cash';
  if (!toAccount) {
    toAccount = mentioned.find((id) => id !== account)
      || (account === 'cash' ? 'bank' : 'cash');
  }
  return { account, toAccount };
}

function detectDate(text, today) {
  if (/\bday before yesterday\b|পরশু/i.test(text)) return addDaysISO(today, -2);
  if (/\b(?:yesterday|last night)\b|গতকাল/i.test(text)) return addDaysISO(today, -1);
  return today;
}

function detectMember(text, members) {
  for (const member of Array.isArray(members) ? members : []) {
    const name = String(member?.name || '').trim();
    if (name.length < 2) continue;
    const low = name.toLowerCase();
    if (['me', 'i', 'my', 'self', 'all', 'everyone'].includes(low)) continue;
    if (/^[a-z0-9 .'-]+$/i.test(name)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)) return member.id;
    } else if (text.includes(low)) {
      return member.id;
    }
  }
  return '';
}

function pickCategory(text, type) {
  const categoryText = text.replace(/\bfair\b/g, 'fare');
  let category = matchCategory(categoryText, type);
  if (type !== 'transfer' && category === 'transfer') {
    if (/\bcredit\s*card\b|\bcard\s*payment\b/i.test(categoryText)) return 'bills';
    const stripped = categoryText
      .replace(/\batm\b|\bcash\s*(?:out|in)\b|\badd\s*money\b|\bwithdraw(?:al)?\b|\bdeposit\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    category = matchCategory(stripped, type);
  }
  if (type !== 'transfer' && category === 'transfer') {
    if (FAMILY_WORDS.test(text)) return 'family';
    return type === 'income' ? 'other-income' : 'other';
  }
  if (type === 'expense' && category === 'other' && FAMILY_WORDS.test(text)) return 'family';
  return category;
}

function extractDescription(text) {
  const labelled = text.match(/\b(?:description|details?|note)\s+(.+)$/i);
  if (labelled) return labelled[1].trim();

  const forPhrase = text.match(/\bfor\s+(.+)$/i);
  if (forPhrase) return forPhrase[1].trim();

  return '';
}

function cleanNote(text, options) {
  let note = options.description || text;
  note = note.replace(CURRENCY_WORDS, ' ');
  note = note.replace(TYPE_WORDS, ' ');
  note = note.replace(BN_NOTE_WORDS, ' ');
  note = note.replace(ACCOUNT_WORDS, ' ');
  note = note.replace(DATE_WORDS, ' ');
  if (options.category === 'transport') {
    note = note.replace(/\bfair\b/gi, 'fare');
  }
  note = note.replace(/\b(?:purpose|category)\b/gi, ' ');

  if (options.amountRaw) {
    note = note.split(options.amountRaw).join(' ');
  }
  for (const word of NUMBER_WORDS) {
    note = note.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}([^\\p{L}\\p{N}]|$)`, 'giu'), ' ');
  }

  note = note.replace(/[.,!?;:।]+/g, ' ').replace(/\s+/g, ' ').trim();
  note = note.replace(SPEECH_FILLER, ' ').replace(/\s+/g, ' ').trim();
  note = note.replace(/^[-–—]+|[-–—]+$/g, '').trim();

  if (!note) {
    if (options.type === 'transfer') {
      return `${accountName(options.account)} to ${accountName(options.toAccount)}`;
    }
    return categoryName(options.category);
  }

  return note.charAt(0).toUpperCase() + note.slice(1);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeVoiceText(value) {
  return bnToEn(String(value || ''))
    .toLowerCase()
    .replace(/[৳]/g, ' ')
    .replace(/[“”"'’]/g, ' ')
    .replace(/[!?;:()[\]{}।]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turn a spoken sentence into transaction fields.
 * The parser never stores the audio and never talks to a server.
 */
export function parseVoiceCommand(value, options = {}) {
  const transcript = String(value || '').trim();
  const text = normalizeVoiceText(transcript);
  const today = options.today || todayISO();
  const amountInfo = findAmount(text);
  const type = detectType(text);
  const accounts = detectAccounts(text);
  const route = routeAccounts(text, type, accounts);
  const category = type === 'transfer' ? 'transfer' : pickCategory(text, type);
  const date = detectDate(text, today);
  const memberId = detectMember(text, options.members);
  const description = extractDescription(text);
  const note = cleanNote(text, {
    description,
    amountRaw: amountInfo.raw,
    type,
    account: route.account,
    toAccount: route.toAccount,
    category,
  });

  const warnings = [];
  if (!(amountInfo.value > 0)) warnings.push('missing-amount');
  if (amountInfo.candidates > 1) warnings.push('multiple-amounts');

  return {
    ok: amountInfo.value > 0,
    transcript,
    amount: amountInfo.value,
    type,
    category,
    note,
    account: route.account,
    toAccount: type === 'transfer' ? route.toAccount : '',
    memberId,
    date,
    warnings,
  };
}

/* ------------------------------ browser speech ------------------------------ */
export function speechSupported() {
  return typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognizer(lang = 'en-US') {
  if (!speechSupported()) return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognizer = new Ctor();
  try {
    recognizer.lang = lang;
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
  } catch {
    /* older speech engines may not support every option */
  }
  return recognizer;
}
