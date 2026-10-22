/* =========================================================
   Hishab — state, storage, demo data, backup merge
   ========================================================= */

import {
  ACCOUNT_IDS, MEMBER_COLORS, MEMBER_EMOJIS, matchCategory,
} from './categories.js';
import {
  addDaysISO, isoOf, normDesc, parseDateAny, parseISO, parseNumber, todayISO, uid,
} from './utils.js';

export const STORAGE_KEY = 'hishab.state.v1';
export const UI_KEY = 'hishab.ui.v1';
export const UNDO_KEY = 'hishab.undo.v1';
export const APP_VERSION = '1.3.1';

export function defaultState() {
  return {
    version: 1,
    members: [
      { id: 'm_self', name: 'Me', emoji: '🙂', color: MEMBER_COLORS[0] },
      { id: 'm_family1', name: 'Family 1', emoji: MEMBER_EMOJIS[1], color: MEMBER_COLORS[1] },
      { id: 'm_family2', name: 'Family 2', emoji: MEMBER_EMOJIS[2], color: MEMBER_COLORS[2] },
    ],
    activeMember: 'all',
    txns: [],
    accounts: {
      bank: { opening: 0 },
      bkash: { opening: 0 },
      cash: { opening: 0 },
    },
    settings: {
      lang: 'en',
      theme: 'dark',
      budget: 0,
      onboarded: false,
    },
  };
}

export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  const state = {
    version: 1,
    members: [],
    activeMember: 'all',
    txns: [],
    accounts: {
      bank: { opening: 0 },
      bkash: { opening: 0 },
      cash: { opening: 0 },
    },
    settings: { ...base.settings },
  };

  const seenMemberIds = new Set();
  for (const m of Array.isArray(raw.members) ? raw.members : []) {
    if (!m || typeof m !== 'object') continue;
    const id = String(m.id || uid('m'));
    if (seenMemberIds.has(id)) continue;
    seenMemberIds.add(id);
    state.members.push({
      id,
      name: String(m.name || '').trim().slice(0, 40) || 'Member',
      emoji: String(m.emoji || '🙂').slice(0, 8),
      color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : MEMBER_COLORS[state.members.length % MEMBER_COLORS.length],
    });
  }
  if (!state.members.length) state.members = base.members;

  const memberIds = new Set(state.members.map((m) => m.id));
  state.activeMember = raw.activeMember === 'all' || memberIds.has(raw.activeMember) ? (raw.activeMember || 'all') : 'all';

  for (const id of ACCOUNT_IDS) {
    const src = raw.accounts && raw.accounts[id];
    state.accounts[id] = { opening: parseNumber(src?.opening) };
  }

  const s = raw.settings || {};
  state.settings.lang = 'en';
  state.settings.theme = s.theme === 'light' ? 'light' : 'dark';
  state.settings.budget = Math.max(0, parseNumber(s.budget));
  state.settings.onboarded = Boolean(s.onboarded);

  const seenIds = new Set();
  const txns = Array.isArray(raw.txns) ? raw.txns : [];
  for (const item of txns) {
    if (!item || typeof item !== 'object') continue;
    const date = parseDateAny(item.date) || (item.date && parseISO(item.date) ? String(item.date) : null);
    if (!date) continue;
    const amount = Math.abs(parseNumber(item.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    let type = ['expense', 'income', 'transfer'].includes(item.type) ? item.type : 'expense';
    let account = ACCOUNT_IDS.includes(item.account) ? item.account : 'cash';
    let toAccount = ACCOUNT_IDS.includes(item.toAccount) ? item.toAccount : '';
    if (type === 'transfer') {
      if (!toAccount || toAccount === account) toAccount = ACCOUNT_IDS.find((a) => a !== account) || 'cash';
    } else {
      toAccount = '';
    }

    const note = String(item.note || item.description || '').slice(0, 240);
    let category = String(item.category || '');
    if (type === 'transfer') category = 'transfer';
    else if (!category || (type === 'income' && category === 'other') || (type === 'expense' && category === 'other-income')) {
      category = matchCategory(note, type);
    }

    let id = String(item.id || '');
    if (!id || seenIds.has(id)) id = uid('t');
    seenIds.add(id);

    const memberId = memberIds.has(item.memberId) ? item.memberId : state.members[0].id;
    const source = ['bank', 'bkash', 'cash', 'manual'].includes(item.source) ? item.source : 'manual';

    state.txns.push({
      id,
      memberId,
      date,
      type,
      amount: Math.round(amount * 100) / 100,
      category,
      account,
      toAccount,
      note,
      ref: String(item.ref || '').slice(0, 80),
      source,
      createdAt: item.createdAt || new Date().toISOString(),
    });
  }

  return state;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Could not save state', err);
    return false;
  }
}

export function loadUi() {
  const fallback = { preset: 'this-month', from: '', to: '', activityLimit: 80 };
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...(parsed || {}) };
  } catch {
    return fallback;
  }
}

export function saveUi(ui) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({
      preset: ui.preset,
      from: ui.from,
      to: ui.to,
      activityLimit: ui.activityLimit,
    }));
  } catch {
    /* ignore */
  }
}

/* ------------------------------ undo ------------------------------ */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Keep the state from just before the last data-changing action. */
export function saveUndo(state, label, ui = null) {
  try {
    const payload = {
      version: 1,
      label: String(label || ''),
      at: new Date().toISOString(),
      state: clone(state),
      ui: ui ? clone({
        preset: ui.preset,
        from: ui.from,
        to: ui.to,
        activityLimit: ui.activityLimit,
      }) : null,
    };
    localStorage.setItem(UNDO_KEY, JSON.stringify(payload));
    return payload;
  } catch (err) {
    console.warn('Could not save undo snapshot', err);
    return null;
  }
}

function readUndo() {
  try {
    const raw = localStorage.getItem(UNDO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Metadata only, for rendering the settings row without cloning the state. */
export function undoInfo() {
  const raw = readUndo();
  return raw ? { label: String(raw.label || ''), at: raw.at || '' } : null;
}

/** Full snapshot, with a normalized state ready to become the live state. */
export function loadUndo() {
  const raw = readUndo();
  if (!raw) return null;
  return {
    label: String(raw.label || ''),
    at: raw.at || '',
    state: normalizeState(raw.state),
    ui: raw.ui && typeof raw.ui === 'object' ? raw.ui : null,
  };
}

export function clearUndo() {
  try {
    localStorage.removeItem(UNDO_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------ CRUD ------------------------------ */
export function presentCategory(type, category) {
  if (type === 'transfer') return 'transfer';
  if (type === 'income') return category && ['salary', 'business', 'freelance', 'interest', 'cashback', 'refund', 'other-income'].includes(category) ? category : 'other-income';
  return category && category !== 'transfer' && !['salary', 'business', 'freelance', 'interest', 'cashback', 'refund', 'other-income'].includes(category) ? category : 'other';
}

export function makeTxn(state, data) {
  const memberId = state.members.some((m) => m.id === data.memberId) ? data.memberId : state.members[0].id;
  const type = ['expense', 'income', 'transfer'].includes(data.type) ? data.type : 'expense';
  const account = ACCOUNT_IDS.includes(data.account) ? data.account : 'cash';
  let toAccount = '';
  if (type === 'transfer') {
    toAccount = ACCOUNT_IDS.includes(data.toAccount) && data.toAccount !== account ? data.toAccount : ACCOUNT_IDS.find((a) => a !== account);
  }
  return {
    id: uid('t'),
    memberId,
    date: parseDateAny(data.date) || todayISO(),
    type,
    amount: Math.round(Math.abs(parseNumber(data.amount)) * 100) / 100,
    category: presentCategory(type, data.category),
    account,
    toAccount,
    note: String(data.note || '').trim().slice(0, 240),
    ref: String(data.ref || '').trim().slice(0, 80),
    source: ['bank', 'bkash', 'cash', 'manual'].includes(data.source) ? data.source : 'manual',
    createdAt: new Date().toISOString(),
  };
}

export function addTxn(state, txn) {
  state.txns.push(txn);
  return txn;
}

export function updateTxn(state, id, patch) {
  const idx = state.txns.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const prev = state.txns[idx];
  const merged = { ...prev, ...patch, id: prev.id, createdAt: prev.createdAt };
  merged.category = presentCategory(merged.type, merged.category);
  merged.amount = Math.round(Math.abs(parseNumber(merged.amount)) * 100) / 100;
  if (merged.type !== 'transfer') merged.toAccount = '';
  if (!ACCOUNT_IDS.includes(merged.account)) merged.account = 'cash';
  if (merged.type === 'transfer' && (!merged.toAccount || merged.toAccount === merged.account)) {
    merged.toAccount = ACCOUNT_IDS.find((a) => a !== merged.account);
  }
  state.txns[idx] = merged;
  return merged;
}

export function deleteTxn(state, id) {
  const before = state.txns.length;
  state.txns = state.txns.filter((t) => t.id !== id);
  return before !== state.txns.length;
}

export function addMember(state, data) {
  const member = {
    id: uid('m'),
    name: String(data.name || '').trim().slice(0, 40) || 'Member',
    emoji: String(data.emoji || MEMBER_EMOJIS[0]).slice(0, 8),
    color: /^#[0-9a-f]{6}$/i.test(data.color || '') ? data.color : MEMBER_COLORS[state.members.length % MEMBER_COLORS.length],
  };
  state.members.push(member);
  return member;
}

export function updateMember(state, id, data) {
  const member = state.members.find((m) => m.id === id);
  if (!member) return null;
  if (data.name != null) member.name = String(data.name).trim().slice(0, 40) || member.name;
  if (data.emoji) member.emoji = String(data.emoji).slice(0, 8);
  if (/^#[0-9a-f]{6}$/i.test(data.color || '')) member.color = data.color;
  return member;
}

export function deleteMember(state, id) {
  if (state.members.length <= 1) return { ok: false, moved: 0 };
  const idx = state.members.findIndex((m) => m.id === id);
  if (idx < 0) return { ok: false, moved: 0 };
  const fallback = state.members.find((m) => m.id !== id);
  let moved = 0;
  for (const t of state.txns) {
    if (t.memberId === id) {
      t.memberId = fallback.id;
      moved += 1;
    }
  }
  state.members.splice(idx, 1);
  if (state.activeMember === id) state.activeMember = 'all';
  return { ok: true, moved };
}

export function memberById(state, id) {
  return state.members.find((m) => m.id === id) || state.members[0];
}

/* ------------------------------ dedupe / backup ------------------------------ */
export function fingerprint(tx) {
  return [
    tx.source || '',
    tx.date,
    (Number(tx.amount) || 0).toFixed(2),
    normDesc(tx.ref) || normDesc(tx.note),
  ].join('|');
}

/**
 * A looser key used only while importing. It catches the same row coming from
 * a PDF and a photo of the same statement, where OCR may not keep the reference.
 */
export function looseFingerprint(tx) {
  const note = normDesc(tx.note)
    .replace(/\b(?=[a-z0-9-]{5,}\b)(?=[a-z0-9-]*\d)[a-z0-9-]+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 2)
    .join(' ');
  if (!note) return '';
  return ['L', tx.date, (Number(tx.amount) || 0).toFixed(2), tx.type || '', note].join('|');
}

export function fingerprints(state) {
  const out = new Set();
  for (const tx of state.txns) {
    out.add(fingerprint(tx));
    const loose = looseFingerprint(tx);
    if (loose) out.add(loose);
  }
  return out;
}

/**
 * Match imported rows against existing transactions without collapsing
 * repeated but separate rows. A loose fingerprint is shared by two different
 * "IB/BKASH/..." rows, so each existing transaction may only absorb one row.
 */
export function markDuplicateRows(existing, rows) {
  const pool = [];
  const byKey = new Map();

  function add(tx) {
    const index = pool.length;
    const keys = [...new Set([fingerprint(tx), looseFingerprint(tx)].filter(Boolean))];
    pool.push({ keys, used: false });
    for (const key of keys) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(index);
    }
  }

  for (const tx of existing) add(tx);

  return rows.map((row) => {
    const keys = [...new Set([fingerprint(row), looseFingerprint(row)].filter(Boolean))];
    let match = null;
    for (const key of keys) {
      const found = (byKey.get(key) || []).find((index) => !pool[index].used);
      if (found != null) {
        match = found;
        break;
      }
    }
    if (match != null) {
      pool[match].used = true;
      return { ...row, duplicate: true, include: false };
    }
    add(row);
    return { ...row, duplicate: false, include: true };
  });
}

export function buildBackup(state) {
  return {
    app: 'hishab',
    format: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
}

export function parseBackup(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  if (!obj || obj.app !== 'hishab' || !obj.state || !Array.isArray(obj.state.txns)) {
    throw new Error('invalid-backup');
  }
  return normalizeState(obj.state);
}

/**
 * Merge an incoming backup into current state: members are matched by name,
 * transactions are deduped by id + fingerprint.
 */
export function mergeStates(current, incoming) {
  const state = normalizeState(JSON.parse(JSON.stringify(current)));
  const memberByName = new Map(state.members.map((m) => [m.name.trim().toLowerCase(), m]));
  const incomingMap = new Map(incoming.members.map((m) => [m.id, m]));
  const idMap = new Map();
  let membersAdded = 0;

  for (const m of incoming.members) {
    const key = m.name.trim().toLowerCase();
    let target = memberByName.get(key);
    if (!target) {
      target = { ...m, id: uid('m') };
      state.members.push(target);
      memberByName.set(key, target);
      membersAdded += 1;
    }
    idMap.set(m.id, target.id);
  }

  const seenIds = new Set(state.txns.map((t) => t.id));
  const seenFp = fingerprints(state);
  let added = 0;

  for (const t of incoming.txns) {
    const memberId = idMap.get(t.memberId) || state.members[0].id;
    const candidate = { ...t, memberId };
    if (seenIds.has(candidate.id)) continue;
    const fp = fingerprint(candidate);
    if (seenFp.has(fp)) continue;
    // new id to avoid accidental collisions on future imports
    candidate.id = uid('t');
    state.txns.push(candidate);
    seenIds.add(candidate.id);
    seenFp.add(fp);
    added += 1;
  }

  return { state, added, membersAdded };
}

/* ------------------------------ demo data ------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_TEMPLATES = {
  food: {
    notes: ['Lunch', 'Foodpanda', 'Kacchi biryani', 'Tea & snacks', 'Restaurant', 'Coffee', 'Dinner'],
    range: [120, 950],
    accounts: ['cash', 'cash', 'bkash', 'bkash'],
  },
  groceries: {
    notes: ['Weekly groceries', 'Shwapno', 'Fish & vegetables', 'Local market', 'Meat', 'Milk & eggs'],
    range: [380, 2800],
    accounts: ['cash', 'cash', 'bkash'],
  },
  transport: {
    notes: ['Uber', 'Pathao ride', 'CNG fare', 'Bus fare', 'Rickshaw', 'Fuel'],
    range: [60, 480],
    accounts: ['cash', 'cash', 'bkash'],
  },
  bills: {
    notes: ['Electricity bill', 'Gas bill', 'Internet bill', 'Mobile recharge', 'Water bill'],
    range: [280, 2200],
    accounts: ['bkash', 'bkash', 'bank'],
  },
  shopping: {
    notes: ['Dress', 'Shoes', 'Daraz order', 'Home supplies', 'Shopping'],
    range: [650, 4200],
    accounts: ['bkash', 'bank'],
  },
  health: {
    notes: ['Medicine', 'Doctor fee', 'Lab test'],
    range: [300, 2400],
    accounts: ['cash', 'cash', 'bkash'],
  },
  education: {
    notes: ['Books', 'School fee', 'Tuition'],
    range: [600, 3200],
    accounts: ['bank', 'cash'],
  },
  entertainment: {
    notes: ['Cinema ticket', 'Netflix', 'Games'],
    range: [250, 900],
    accounts: ['bkash', 'cash'],
  },
  family: {
    notes: ['Sent to Mom', 'Sent to Dad', 'For the family'],
    range: [1000, 5000],
    accounts: ['bkash'],
  },
  personal: {
    notes: ['Salon', 'Haircut'],
    range: [150, 600],
    accounts: ['cash'],
  },
  gifts: {
    notes: ['Gift', 'Birthday gift'],
    range: [500, 2200],
    accounts: ['bkash', 'cash'],
  },
  fees: {
    notes: ['Bank charge', 'bKash fee', 'ATM charge'],
    range: [20, 180],
    accounts: ['bank', 'bkash'],
  },
};

const DEMO_WEIGHTS = [
  ['food', 20], ['groceries', 13], ['transport', 13], ['bills', 5],
  ['shopping', 5], ['health', 3], ['education', 2], ['entertainment', 3],
  ['family', 3], ['personal', 2], ['gifts', 1], ['fees', 3],
];

function pickWeighted(rng) {
  const total = DEMO_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [key, w] of DEMO_WEIGHTS) {
    r -= w;
    if (r <= 0) return key;
  }
  return 'food';
}

export function demoState() {
  const rand = mulberry32(20261021);
  const state = defaultState();
  state.members = [
    { id: 'm_self', name: 'Me', emoji: '🙂', color: '#2BD9A2' },
    { id: 'm_abbu', name: 'Dad', emoji: '👨', color: '#7C9CFF' },
    { id: 'm_ammu', name: 'Mom', emoji: '👩', color: '#FFB86B' },
  ];
  state.activeMember = 'all';
  state.settings.budget = 35000;
  state.settings.onboarded = true;
  state.accounts.bank.opening = 24000;
  state.accounts.bkash.opening = 1850;
  state.accounts.cash.opening = 1200;

  const today = todayISO();
  let seq = 0;
  const add = (data) => {
    seq += 1;
    const amount = Math.round(data.amount / 5) * 5 || 5;
    state.txns.push({
      id: `demo_${seq}`,
      memberId: data.memberId || 'm_self',
      date: data.date,
      type: data.type,
      amount,
      category: presentCategory(data.type, data.category),
      account: data.account,
      toAccount: data.type === 'transfer' ? data.toAccount : '',
      note: data.note,
      ref: data.ref || '',
      source: data.source || data.account,
      createdAt: `${addDaysISO(data.date, -1)}T10:00:00.000Z`,
    });
  };
  const memberForExpense = () => {
    const r = rand();
    if (r < 0.62) return 'm_self';
    if (r < 0.84) return 'm_ammu';
    return 'm_abbu';
  };

  for (let offset = 0; offset < 74; offset += 1) {
    const date = addDaysISO(today, -offset);
    const dt = parseISO(date);
    if (!dt) continue;
    const dom = dt.getDate();

    if (dom === 1) {
      add({
        date, type: 'income', amount: 58000, category: 'salary', account: 'bank',
        note: 'Monthly salary', source: 'bank', memberId: 'm_self', ref: `SAL-${date.slice(0, 7)}`,
      });
      add({
        date, type: 'income', amount: 32000, category: 'business', account: 'bank',
        note: 'Business income', source: 'bank', memberId: 'm_abbu',
      });
    }
    if (dom === 3) {
      add({
        date, type: 'expense', amount: 12000, category: 'rent', account: 'bank',
        note: 'House rent', source: 'bank', memberId: 'm_self',
      });
      add({
        date, type: 'expense', amount: 900, category: 'groceries', account: 'cash',
        note: 'Start-of-month groceries', source: 'cash', memberId: 'm_ammu',
      });
    }
    if (dom === 5) {
      add({
        date, type: 'expense', amount: 1850, category: 'bills', account: 'bkash',
        note: 'Electricity & gas bill', source: 'bkash', memberId: 'm_self',
      });
      add({
        date, type: 'expense', amount: 1050, category: 'bills', account: 'bkash',
        note: 'Internet bill', source: 'bkash', memberId: 'm_self',
      });
    }
    if (dom === 8) {
      add({
        date, type: 'transfer', amount: 4000, category: 'transfer', account: 'bank', toAccount: 'cash',
        note: 'ATM withdrawal', source: 'bank', memberId: 'm_self',
      });
    }
    if (dom === 12 && offset < 40) {
      add({
        date, type: 'income', amount: 8500, category: 'freelance', account: 'bkash',
        note: 'Freelance payment', source: 'bkash', memberId: 'm_self', ref: `FR-${date.slice(5)}`,
      });
    }
    if (dom === 15) {
      add({
        date, type: 'expense', amount: 2200, category: 'shopping', account: 'bank',
        note: 'Daraz order', source: 'bank', memberId: 'm_self',
      });
      add({
        date, type: 'expense', amount: 600, category: 'bills', account: 'bkash',
        note: 'Mobile recharge', source: 'bkash', memberId: 'm_ammu',
      });
    }
    if (dom === 18) {
      add({
        date, type: 'transfer', amount: 3000, category: 'transfer', account: 'bkash', toAccount: 'cash',
        note: 'bKash cash out', source: 'bkash', memberId: 'm_self',
      });
    }
    if (dom === 20) {
      add({
        date, type: 'income', amount: 450, category: 'cashback', account: 'bkash',
        note: 'bKash cashback', source: 'bkash', memberId: 'm_self',
      });
      add({
        date, type: 'expense', amount: 700, category: 'health', account: 'cash',
        note: 'Medicine', source: 'cash', memberId: 'm_ammu',
      });
    }
    if (dom === 22) {
      add({
        date, type: 'expense', amount: 4200, category: 'shopping', account: 'bank',
        note: 'Shoes & dress', source: 'bank', memberId: 'm_ammu',
      });
    }
    if (dom === 25) {
      add({
        date, type: 'income', amount: 1500, category: 'refund', account: 'bkash',
        note: 'Refund', source: 'bkash', memberId: 'm_self',
      });
    }

    // everyday spending — 1 to 3 entries per day, some days empty
    const count = offset === 0 ? 2 : rand() < 0.18 ? 0 : rand() < 0.72 ? 1 : 2;
    for (let k = 0; k < count; k += 1) {
      const cat = pickWeighted(rand);
      const tpl = DEMO_TEMPLATES[cat];
      if (!tpl) continue;
      const note = tpl.notes[Math.floor(rand() * tpl.notes.length)];
      const base = tpl.range[0] + rand() * (tpl.range[1] - tpl.range[0]);
      const acct = tpl.accounts[Math.floor(rand() * tpl.accounts.length)] || 'cash';
      add({
        date,
        type: 'expense',
        amount: base,
        category: cat,
        account: acct,
        note,
        source: acct,
        memberId: memberForExpense(),
      });
    }
  }

  // a little extra for a realistic category chart
  add({
    date: addDaysISO(today, -1), type: 'expense', amount: 3200, category: 'education',
    account: 'bank', note: 'Books & notebooks', source: 'bank', memberId: 'm_abbu',
  });
  add({
    date: addDaysISO(today, -2), type: 'expense', amount: 1750, category: 'health',
    account: 'bkash', note: 'Doctor fee', source: 'bkash', memberId: 'm_ammu',
  });
  add({
    date: addDaysISO(today, -4), type: 'expense', amount: 980, category: 'entertainment',
    account: 'bkash', note: 'Cinema ticket', source: 'bkash', memberId: 'm_self',
  });
  add({
    date: addDaysISO(today, -6), type: 'expense', amount: 2500, category: 'family',
    account: 'bkash', note: 'Sent to Mom', source: 'bkash', memberId: 'm_self',
  });

  state.txns.sort((a, b) => a.date.localeCompare(b.date));
  return normalizeState(state);
}

export function resetStateKeepPrefs(state) {
  const next = defaultState();
  next.settings.lang = state.settings.lang;
  next.settings.theme = state.settings.theme;
  return next;
}

export function stateSizeBytes(state) {
  try {
    return new Blob([JSON.stringify(state)]).size;
  } catch {
    return JSON.stringify(state).length;
  }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Used by dev tooling / tests. */
export function demoDateSpan() {
  return { from: addDaysISO(todayISO(), -73), to: isoOf(new Date()) };
}
