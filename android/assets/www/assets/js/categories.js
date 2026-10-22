/* =========================================================
   Hishab — categories, accounts and keyword classifier
   ========================================================= */

export const CATEGORIES = [
  {
    id: 'food', type: 'expense', emoji: '🍛', color: '#FFB86B', bn: 'খাবার', en: 'Food',
    keywords: ['food', 'restaurant', 'cafe', 'coffee', 'kfc', 'pizza', 'burger', 'biryani', 'kacchi', 'foodpanda', 'hungry', 'bakery', 'snacks', 'lunch', 'dinner', 'breakfast', 'tea', 'hotel', 'swiggy', 'চা', 'খাবার', 'রেস্টুরেন্ট', 'বিরিয়ানি', 'কাচ্চি', 'নাস্তা'],
  },
  {
    id: 'groceries', type: 'expense', emoji: '🛒', color: '#7BD88F', bn: 'বাজার', en: 'Groceries',
    keywords: ['grocery', 'groceries', 'super shop', 'supershop', 'superstore', 'shwapno', 'agora', 'meena', 'bazar', 'bazaar', 'vegetable', 'fish', 'meat', 'market', 'daily needs', 'unilever', 'fresh', 'নিত্যপ্রয়োজন', 'বাজার', 'মাছ', 'মাংস', 'সবজি', 'কাঁচাবাজার'],
  },
  {
    id: 'transport', type: 'expense', emoji: '🚌', color: '#7C9CFF', bn: 'যাতায়াত', en: 'Transport',
    keywords: ['uber', 'pathao', 'obhai', 'ride', 'bus', 'train', 'launch', 'cng', 'rickshaw', 'fuel', 'petrol', 'octane', 'diesel', 'taxi', 'fare', 'metro', 'railway', 'ভাড়া', 'বাস', 'রিকশা', 'সিএনজি', 'তেল', 'যাতায়াত'],
  },
  {
    id: 'bills', type: 'expense', emoji: '🧾', color: '#FF8FA3', bn: 'বিল ও রিচার্জ', en: 'Bills & Recharge',
    keywords: ['electricity', 'desco', 'dpdc', 'palli bidyut', 'gas bill', 'titas', 'water bill', 'wasa', 'internet', 'wifi', 'broadband', 'link3', 'amc', 'recharge', 'mobile', 'grameenphone', 'gp', 'robi', 'banglalink', 'airtel', 'teletalk', 'bill', 'utility', 'বিদ্যুৎ', 'গ্যাস', 'পানি', 'ইন্টারনেট', 'রিচার্জ', 'বিল', 'মোবাইল'],
  },
  {
    id: 'shopping', type: 'expense', emoji: '🛍️', color: '#D49CFF', bn: 'কেনাকাটা', en: 'Shopping',
    keywords: ['daraz', 'aarong', 'ecstasy', 'pickaboo', 'clothing', 'dress', 'shoe', 'bata', 'fashion', 'mall', 'ajkerdeal', 'shopping', 'purchase', 'কেনাকাটা', 'জামা', 'জুতা', 'পোশাক'],
  },
  {
    id: 'health', type: 'expense', emoji: '🩺', color: '#6FE3D2', bn: 'স্বাস্থ্য', en: 'Health',
    keywords: ['hospital', 'pharmacy', 'medicine', 'doctor', 'diagnostic', 'lab test', 'health', 'dental', 'square hospital', 'ibne sina', 'aushadhaloy', 'clinic', 'ঔষধ', 'ডাক্তার', 'হাসপাতাল', 'ফার্মেসি', 'স্বাস্থ্য', 'চিকিৎসা'],
  },
  {
    id: 'education', type: 'expense', emoji: '📚', color: '#FFD166', bn: 'শিক্ষা', en: 'Education',
    keywords: ['school', 'college', 'university', 'tuition', 'admission', 'exam', 'book', 'stationery', 'course', 'udemy', 'coaching', 'বই', 'স্কুল', 'কলেজ', 'টিউশন', 'পরীক্ষা', 'শিক্ষা'],
  },
  {
    id: 'entertainment', type: 'expense', emoji: '🎬', color: '#FF7EB6', bn: 'বিনোদন', en: 'Entertainment',
    keywords: ['cinema', 'movie', 'netflix', 'spotify', 'youtube', 'game', 'concert', 'ticket', 'star cineplex', 'subscription', 'সিনেমা', 'মুভি', 'গেম', 'বিনোদন'],
  },
  {
    id: 'rent', type: 'expense', emoji: '🏠', color: '#C9A7FF', bn: 'বাসা ভাড়া', en: 'Rent',
    keywords: ['house rent', 'flat rent', 'landlord', 'rent', 'বাসা ভাড়া', 'বাড়ি ভাড়া', 'ভাড়া'],
  },
  {
    id: 'family', type: 'expense', emoji: '👨‍👩‍👧', color: '#9FE870', bn: 'পরিবার ও মানুষ', en: 'Family & People',
    keywords: ['family', 'parents', 'mother', 'father', 'send money', 'send to', 'gift', 'আব্বু', 'আম্মু', 'পরিবার', 'মা', 'বাবা', 'টাকা পাঠ'],
  },
  {
    id: 'personal', type: 'expense', emoji: '💼', color: '#8FA3B8', bn: 'ব্যক্তিগত', en: 'Personal',
    keywords: ['personal', 'salon', 'haircut', 'gym', 'spa', 'barber', 'সেলুন', 'হেয়ারকাট', 'ব্যক্তিগত'],
  },
  {
    id: 'gifts', type: 'expense', emoji: '🎁', color: '#FFA3C4', bn: 'উপহার', en: 'Gifts',
    keywords: ['gift', 'birthday', 'wedding', 'anniversary', 'উপহার', 'জন্মদিন', 'বিয়ে'],
  },
  {
    id: 'fees', type: 'expense', emoji: '🏷️', color: '#B8C4D6', bn: 'চার্জ ও ফি', en: 'Fees & Charges',
    keywords: ['fee', 'charge', 'charges', 'service charge', 'vat', 'tax', 'commission', 'excise', 'sms fee', 'ফি', 'চার্জ', 'ভ্যাট', 'ট্যাক্স'],
  },
  {
    id: 'other', type: 'expense', emoji: '🧩', color: '#90A0B0', bn: 'অন্যান্য', en: 'Other',
    keywords: [],
  },
  {
    id: 'salary', type: 'income', emoji: '💰', color: '#2BD9A2', bn: 'বেতন', en: 'Salary',
    keywords: ['salary', 'payroll', 'wage', 'বেতন'],
  },
  {
    id: 'business', type: 'income', emoji: '📈', color: '#35C4A0', bn: 'ব্যবসা', en: 'Business',
    keywords: ['business', 'sales', 'invoice', 'merchant settlement', 'বিক্রয়', 'ব্যবসা'],
  },
  {
    id: 'freelance', type: 'income', emoji: '💻', color: '#7C9CFF', bn: 'ফ্রিল্যান্স', en: 'Freelance',
    keywords: ['freelance', 'upwork', 'fiverr', 'project payment', 'client payment', 'প্রজেক্ট', 'ফ্রিল্যান্স'],
  },
  {
    id: 'interest', type: 'income', emoji: '🏦', color: '#6FE3D2', bn: 'সুদ ও মুনাফা', en: 'Interest & Profit',
    keywords: ['interest', 'profit', 'dividend', 'সুদ', 'মুনাফা', 'লাভ'],
  },
  {
    id: 'cashback', type: 'income', emoji: '✨', color: '#FFD166', bn: 'ক্যাশব্যাক ও বোনাস', en: 'Cashback & Bonus',
    keywords: ['cashback', 'bonus', 'reward', 'ক্যাশব্যাক', 'বোনাস'],
  },
  {
    id: 'refund', type: 'income', emoji: '↩️', color: '#FFB86B', bn: 'রিফান্ড', en: 'Refund',
    keywords: ['refund', 'reversal', 'ফেরত', 'রিফান্ড'],
  },
  {
    id: 'other-income', type: 'income', emoji: '➕', color: '#90A0B0', bn: 'অন্যান্য আয়', en: 'Other income',
    keywords: [],
  },
  {
    id: 'transfer', type: 'transfer', emoji: '🔁', color: '#8FA3B8', bn: 'স্থানান্তর', en: 'Transfer',
    keywords: [],
  },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.type === 'expense');
export const INCOME_CATEGORIES = CATEGORIES.filter((c) => c.type === 'income');

export function getCategory(id) {
  return CATEGORY_MAP[id] || CATEGORY_MAP.other;
}

export function categoryName(id, lang = 'en') {
  const cat = getCategory(id);
  return lang === 'bn' ? cat.bn : cat.en;
}

export const ACCOUNTS = {
  bank: { id: 'bank', bn: 'ব্যাংক', en: 'Bank', emoji: '🏦', color: '#7C9CFF' },
  bkash: { id: 'bkash', bn: 'বিকাশ', en: 'bKash', emoji: '📱', color: '#FF5C8A' },
  cash: { id: 'cash', bn: 'ক্যাশ', en: 'Cash', emoji: '💵', color: '#2BD9A2' },
};

export const ACCOUNT_IDS = ['bank', 'bkash', 'cash'];

export function accountName(id, lang = 'en') {
  const acct = ACCOUNTS[id] || ACCOUNTS.cash;
  return lang === 'bn' ? acct.bn : acct.en;
}

export const MEMBER_COLORS = ['#2BD9A2', '#7C9CFF', '#FFB86B', '#FF6B81', '#B28BFF', '#6FE3D2', '#9FE870', '#FF9AC4'];
export const MEMBER_EMOJIS = ['🙂', '👨', '👩', '👦', '👧', '🧑', '👴', '👵', '🐱', '🌸', '⚡', '🌟'];

const TRANSFER_PATTERNS = [
  /\batm\b/i,
  /cash\s*(withdraw|withdrawal|withdrawn|wd|out|deposit|in)\b/i,
  // Screenshot OCR often confuses "out" with "ost", "ow" or "owt".
  /cash\s*o(?:ut|st|w|wt)\b/i,
  /\badd\s*money\b/i,
  /\b(self|own)\s*transfer\b/i,
  /credit\s*card\s*(payment|bill)/i,
  /এটিএম/,
  /ক্যাশ\s*(আউট|ইন|উত্তোলন|জমা)/,
  /নিজের\s*অ্যাকাউন্ট/,
];

export function isTransferDescription(text) {
  const s = String(text || '');
  return TRANSFER_PATTERNS.some((rx) => rx.test(s));
}

function keywordHit(text, keyword) {
  const k = String(keyword).toLowerCase();
  if (!k) return 0;
  if (/^[a-z0-9][a-z0-9 &.'-]*$/i.test(k)) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const rx = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    return rx.test(text) ? k.length + 2 : 0;
  }
  return text.includes(k) ? k.length : 0;
}

/** Pick the best matching category id for a description. */
export function matchCategory(description, type = 'expense') {
  const text = String(description || '').toLowerCase();
  if (!text) return type === 'income' ? 'other-income' : 'other';

  if (type === 'transfer' || isTransferDescription(text)) return 'transfer';

  const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  let bestId = type === 'income' ? 'other-income' : 'other';
  let bestScore = 0;

  for (const cat of pool) {
    for (const kw of cat.keywords) {
      const score = keywordHit(text, kw);
      if (score > bestScore) {
        bestScore = score;
        bestId = cat.id;
      }
    }
  }
  return bestId;
}

/** Guess type (income/expense/transfer) from bKash-like descriptions. */
export function guessType(description, amount) {
  const s = String(description || '').toLowerCase();
  if (isTransferDescription(s)) return 'transfer';
  if (/\b(refund|refunded|reversal|received|receive|cash in|cash-in|add money|deposit|credit|salary|bonus|cashback|interest|profit|inbound)\b/i.test(s)) {
    return 'income';
  }
  if (amount < 0) return 'expense';
  if (/\b(send money|payment|pay|purchase|cash out|withdraw|recharge|bill|fee|charge|debit)\b/i.test(s)) return 'expense';
  return amount < 0 ? 'expense' : 'expense';
}
