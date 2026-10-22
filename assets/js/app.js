/* =========================================================
   Hishab — app shell, router and interaction layer
   ========================================================= */

import {
  ACCOUNT_IDS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, MEMBER_COLORS, MEMBER_EMOJIS,
  accountName, categoryName, getCategory, matchCategory,
} from './categories.js';
import { buildReport } from './analytics.js';
import { avatar, brandMark, icon } from './components.js';
import {
  MAX_FILE_BYTES, MAX_FILES, extractFile, fileKind, formatBytes, stopOcr,
} from './extract.js';
import { setLang, t } from './i18n.js';
import {
  SAMPLE_BANK_CSV, SAMPLE_BKASH_CSV, parseStatement,
} from './parsers.js';
import {
  addMember, addTxn, buildBackup, clearUndo, deleteMember, deleteTxn, demoState,
  fingerprint, loadState, loadUi, loadUndo, makeTxn, markDuplicateRows, mergeStates,
  parseBackup, resetStateKeepPrefs, saveState, saveUi, saveUndo, undoInfo, updateMember, updateTxn,
} from './store.js';
import {
  PRESETS, addDaysISO, copyText, csvCell, downloadJSON, downloadText, esc,
  fmtMoney, formatDate, formatRangeLabel, getPresetRange, parseNumber, sharePayload, todayISO,
  vibrate,
} from './utils.js';
import {
  createSpeechRecognizer, parseVoiceCommand, speechSupported,
} from './voice.js';
import { activityView } from './views/activity.js';
import { homeView } from './views/home.js';
import { importView } from './views/importView.js';
import { moreView } from './views/more.js';
import { reportView } from './views/report.js';

const ROUTES = ['home', 'activity', 'import', 'report', 'more'];
const NAV = [
  { id: 'home', icon: 'home' },
  { id: 'activity', icon: 'activity' },
  { id: 'import', icon: 'import' },
  { id: 'report', icon: 'report' },
  { id: 'more', icon: 'more' },
];

const appEl = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toast-root');

let state = loadState();
let ui = loadUi();
let route = 'home';
let sheet = null;
let deferredPrompt = null;
let installed = isStandalone();
let searchTimer = 0;
let importFiles = [];
let importSeq = 0;
let voiceRec = null;
let voiceTimer = 0;
let voiceLang = 'en-US';

/* =========================================================
   boot
   ========================================================= */
ui = {
  preset: 'this-month',
  from: '',
  to: '',
  activityLimit: 80,
  activityType: 'all',
  activityAccount: 'all',
  activitySearch: '',
  import: {},
  ...ui,
};
if (!ui.import) ui.import = {};

setLang(state.settings.lang);
applyTheme();

const bootEl = document.getElementById('boot');
if (bootEl) {
  document.body.appendChild(bootEl);
  setTimeout(() => {
    bootEl.style.transition = 'opacity .32s ease';
    bootEl.style.opacity = '0';
    setTimeout(() => bootEl.remove(), 380);
  }, 450);
}

try {
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1' && state.txns.length === 0) {
    state = demoState();
    saveState(state);
    ui.preset = 'this-month';
    saveUi(ui);
  }
} catch {
  /* ignore malformed URLs */
}

if (!location.hash) {
  try {
    history.replaceState(null, '', '#/home');
  } catch {
    /* ignore */
  }
}

render();
bindEvents();
registerServiceWorker();

/* =========================================================
   rendering
   ========================================================= */
function routeFromHash() {
  const raw = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(raw) ? raw : 'home';
}

function currentRange() {
  return getPresetRange(ui.preset || 'this-month', ui.from, ui.to);
}

function buildCtx() {
  const range = currentRange();
  const report = buildReport(state, {
    from: range.from,
    to: range.to,
    memberId: state.activeMember,
  });
  return {
    state,
    ui,
    range,
    report,
    lang: state.settings.lang,
    importFiles: importFiles.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      badge: item.badge,
      meta: item.meta,
      error: item.error,
    })),
    install: { canInstall: Boolean(deferredPrompt), installed, ios: isIOS() },
    undo: undoInfo(),
  };
}

function snapshot(label) {
  saveUndo(state, label, ui);
}

function performUndo() {
  const undo = loadUndo();
  if (!undo) {
    toast(t('undo.none'), 'warn');
    return;
  }
  state = undo.state;
  saveState(state);
  clearUndo();
  if (undo.ui) {
    ui = {
      ...ui,
      preset: undo.ui.preset || 'all',
      from: undo.ui.from || '',
      to: undo.ui.to || '',
      activityLimit: undo.ui.activityLimit || 80,
      import: {},
    };
  } else {
    ui = { ...ui, preset: 'all', from: '', to: '', import: {} };
  }
  saveUi(ui);
  closeSheet();
  render({ animate: false });
  toast(t('undo.done'), 'success');
}

function render(opts = {}) {
  route = routeFromHash();
  setLang(state.settings.lang);
  applyTheme();

  const ctx = buildCtx();
  let body = '';
  if (route === 'home') body = homeView(ctx);
  else if (route === 'activity') body = activityView(ctx);
  else if (route === 'import') body = importView(ctx);
  else if (route === 'report') body = reportView(ctx);
  else body = moreView(ctx);

  const scrollY = window.scrollY;
  appEl.innerHTML = `<div class="app-shell">
    ${topbar(ctx)}
    <main>
      <section class="screen ${opts.animate === false ? 'no-anim' : ''}" id="screen-${route}">
        ${body}
      </section>
    </main>
  </div>
  ${bottomNav()}
  ${route === 'import' ? '' : fab()}`;

  renderSheet();
  updateTopbarScroll();

  if (opts.keepScroll) {
    window.scrollTo(0, scrollY);
  }
  if (opts.focusSearch) {
    const input = document.getElementById('txn-search');
    if (input) {
      input.focus();
      const len = input.value.length;
      try { input.setSelectionRange(len, len); } catch { /* ignore */ }
    }
  }
}

function topbar(ctx) {
  const active = state.members.find((m) => m.id === state.activeMember);
  const pillMember = active || { emoji: '👥', color: '#7C9CFF', name: t('member.everyone') };
  const pillName = active ? active.name : t('app.allMembers');

  return `<header class="topbar" id="topbar">
    <a class="brand" href="#/home" aria-label="${esc(t('app.name'))}">
      ${brandMark()}
      <span class="brand-txt">${t('app.name')}<small>HISHAB</small></span>
    </a>
    <div class="top-actions">
      <button class="icon-btn" type="button" data-action="toggle-theme" aria-label="${esc(t('more.theme'))}">
        ${icon(state.settings.theme === 'dark' ? 'sun' : 'moon', 17)}
      </button>
      <button class="member-pill" type="button" data-action="open-member-sheet" aria-label="${esc(t('member.switch'))}">
        ${avatar(pillMember)}
        <span class="member-pill-name">${esc(pillName)}</span>
        ${icon('chevronDown', 13)}
      </button>
    </div>
  </header>`;
}

function bottomNav() {
  return `<nav class="bottom-nav" aria-label="${esc(t('app.name'))}">
    ${NAV.map((item) => `<a class="nav-item ${route === item.id ? 'active' : ''}" href="#/${item.id}" ${route === item.id ? 'aria-current="page"' : ''}>
      <span class="nav-ic">${icon(item.icon, 19)}</span>
      <span>${t(`nav.${item.id}`)}</span>
    </a>`).join('')}
  </nav>`;
}

function fab() {
  const showVoice = route === 'home' || route === 'activity';
  return `<div class="fab-stack">
    ${showVoice ? `<button class="fab fab-mic" type="button" data-action="open-voice" aria-label="${esc(t('voice.start'))}">
      ${icon('mic', 21)}
    </button>` : ''}
    <button class="fab" type="button" data-action="open-add" aria-label="${esc(t('txn.addCash'))}">
      ${icon('plus', 25)}
    </button>
  </div>`;
}

function updateTopbarScroll() {
  const bar = document.getElementById('topbar');
  if (bar) bar.classList.toggle('scrolled', window.scrollY > 4);
}

/* =========================================================
   sheets
   ========================================================= */
function renderSheet() {
  document.body.classList.toggle('sheet-open', Boolean(sheet));
  if (!sheet) {
    sheetRoot.innerHTML = '';
    return;
  }

  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="sheet-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(sheetTitle())}">
      <div class="sheet-head">
        <span class="grab" aria-hidden="true"></span>
        <div class="sheet-title">${esc(sheetTitle())}</div>
        <button class="x-btn" type="button" data-action="sheet-close" aria-label="${esc(t('common.close'))}">${icon('close', 15)}</button>
      </div>
      <div class="sheet-body">${sheetBody()}</div>
    </div>`;
}

function closeSheet() {
  stopVoice();
  sheet = null;
  renderSheet();
}

function sheetTitle() {
  if (!sheet) return '';
  switch (sheet.type) {
    case 'txn': return sheet.editId ? t('txn.edit') : t('txn.add');
    case 'voice': return t('voice.title');
    case 'members': return t('member.switch');
    case 'member': return sheet.memberId ? t('more.editMember') : t('more.addMember');
    case 'range': return t('filter.title');
    case 'budget': return t('budget.title');
    case 'accounts': return t('more.accounts');
    case 'confirm': return sheet.title || t('common.confirm');
    case 'install': return t('more.install');
    default: return t('app.name');
  }
}

function sheetBody() {
  if (!sheet) return '';
  switch (sheet.type) {
    case 'txn': return txnSheet();
    case 'voice': return voiceSheet();
    case 'members': return membersSheet();
    case 'member': return memberSheet();
    case 'range': return rangeSheet();
    case 'budget': return budgetSheet();
    case 'accounts': return accountsSheet();
    case 'confirm': return confirmSheet();
    case 'install': return installSheet();
    default: return '';
  }
}

/* ------------------------------ transaction sheet ------------------------------ */
function openTxnSheet(id, overrides = null) {
  const existing = id ? state.txns.find((tx) => tx.id === id) : null;
  const memberId = state.activeMember !== 'all' ? state.activeMember : state.members[0].id;
  const draft = existing
    ? { ...existing, amount: String(existing.amount) }
    : {
      type: 'expense',
      amount: '',
      category: 'food',
      account: 'cash',
      toAccount: 'bank',
      date: todayISO(),
      memberId,
      note: '',
      ref: '',
      source: 'manual',
    };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) draft[key] = value;
    }
  }
  sheet = { type: 'txn', editId: id || null, draft, error: '' };
  renderSheet();
}

function txnSheet() {
  const s = sheet;
  const d = s.draft;
  const type = d.type;
  const lang = state.settings.lang;
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const acct = d.account || 'cash';
  const toAcct = d.toAccount && d.toAccount !== acct
    ? d.toAccount
    : ACCOUNT_IDS.find((a) => a !== acct) || 'bank';

  return `<form id="txn-form" novalidate>
    ${!s.editId ? `<button class="voice-entry-btn" type="button" data-action="open-voice">
      <span class="voice-entry-ic">${icon('mic', 18)}</span>
      <span class="voice-entry-copy">
        <span class="voice-entry-title">${t('voice.open')}</span>
        <span class="voice-entry-sub">${t('voice.openHint')}</span>
      </span>
      ${icon('chevronRight', 16)}
    </button>` : ''}

    <div class="field">
      <span class="field-label">${t('txn.type')}</span>
      <div class="seg">
        ${['expense', 'income', 'transfer'].map((ty) => `<button type="button" data-action="txn-type" data-type="${ty}" class="${type === ty ? 'active' : ''}">${t(`txn.${ty}`)}</button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label for="txn-amount">${t('txn.amount')}</label>
      <div class="amount-wrap">
        <span class="cur">৳</span>
        <input id="txn-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="${t('txn.amountPh')}" value="${esc(d.amount === '' || d.amount == null ? '' : d.amount)}" required>
      </div>
      <div class="quick-amts">
        ${[100, 200, 500, 1000, 2000].map((v) => `<button type="button" data-action="quick-amount" data-amount="${v}">৳${v}</button>`).join('')}
      </div>
    </div>

    ${type !== 'transfer' ? `<div class="field">
      <span class="field-label">${t('txn.category')}</span>
      <div class="cat-pick">
        ${cats.map((cat) => `<button type="button" data-action="txn-cat" data-cat="${cat.id}" class="${d.category === cat.id ? 'active' : ''}">
          <span class="emoji">${cat.emoji}</span>${esc(categoryName(cat.id, lang))}
        </button>`).join('')}
      </div>
    </div>` : ''}

    <div class="field-row">
      <div class="field">
        <label for="txn-date">${t('txn.date')}</label>
        <input class="input" id="txn-date" name="date" type="date" value="${esc(d.date || todayISO())}" required>
      </div>
      <div class="field">
        <label for="txn-member">${t('txn.member')}</label>
        <select class="select" id="txn-member" name="memberId">
          ${state.members.map((m) => `<option value="${esc(m.id)}" ${m.id === d.memberId ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label for="txn-account">${type === 'transfer' ? t('txn.fromAccount') : t('txn.account')}</label>
        <select class="select" id="txn-account" name="account">
          ${ACCOUNT_IDS.map((id) => `<option value="${id}" ${id === acct ? 'selected' : ''}>${esc(accountName(id, lang))}</option>`).join('')}
        </select>
      </div>
      ${type === 'transfer' ? `<div class="field">
        <label for="txn-to">${t('txn.toAccount')}</label>
        <select class="select" id="txn-to" name="toAccount">
          ${ACCOUNT_IDS.filter((id) => id !== acct).map((id) => `<option value="${id}" ${id === toAcct ? 'selected' : ''}>${esc(accountName(id, lang))}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>

    <div class="field">
      <label for="txn-note">${t('txn.note')} <span class="faint">(${t('txn.noteOptional')})</span></label>
      <input class="input" id="txn-note" name="note" type="text" maxlength="240" placeholder="${esc(t('txn.notePh'))}" value="${esc(d.note || '')}">
    </div>

    ${type === 'transfer' ? `<div class="alert info">${icon('refresh', 14)}<span>${t('txn.transferHint')}</span></div>` : ''}
    ${s.error ? `<div class="form-error show">${esc(s.error)}</div>` : ''}

    <div class="sheet-actions">
      <button class="btn ghost" type="button" data-action="sheet-close">${t('common.cancel')}</button>
      <button class="btn primary" type="submit">${icon('check', 15)}${s.editId ? t('txn.update') : t('txn.save')}</button>
    </div>
    ${s.editId ? `<button class="btn danger block" type="button" data-action="ask-delete-txn" data-id="${esc(s.editId)}" style="margin-top:8px">${icon('trash', 15)}${t('txn.delete')}</button>` : ''}
  </form>`;
}

function syncTxnDraft() {
  if (!sheet || sheet.type !== 'txn') return;
  const get = (id) => document.getElementById(id)?.value;
  const d = sheet.draft;
  if (get('txn-amount') != null) d.amount = get('txn-amount');
  if (get('txn-date')) d.date = get('txn-date');
  if (get('txn-note') != null) d.note = get('txn-note');
  if (get('txn-member')) d.memberId = get('txn-member');
  if (get('txn-account')) d.account = get('txn-account');
  if (get('txn-to')) d.toAccount = get('txn-to');
}

function saveTxnForm() {
  syncTxnDraft();
  const d = sheet.draft;
  const amount = Math.abs(parseNumber(d.amount));
  if (!(amount > 0)) {
    sheet.error = t('txn.errAmount');
    renderSheet();
    return;
  }

  const type = d.type;
  const account = ACCOUNT_IDS.includes(d.account) ? d.account : 'cash';
  const toAccount = ACCOUNT_IDS.includes(d.toAccount) && d.toAccount !== account
    ? d.toAccount
    : ACCOUNT_IDS.find((a) => a !== account) || 'cash';

  if (type === 'transfer' && toAccount === account) {
    sheet.error = t('txn.errTransfer');
    renderSheet();
    return;
  }

  let category = d.category;
  if (type === 'transfer') category = 'transfer';
  else if (!category) category = matchCategory(d.note, type);

  const data = {
    type,
    amount,
    category,
    account,
    toAccount: type === 'transfer' ? toAccount : '',
    date: d.date || todayISO(),
    memberId: d.memberId,
    note: d.note || '',
    ref: d.ref || '',
    source: d.source || 'manual',
  };

  snapshot(t(sheet.editId ? 'undo.labelEdit' : 'undo.labelAdd'));

  if (sheet.editId) {
    updateTxn(state, sheet.editId, data);
    toast(t('txn.updated'), 'success');
  } else {
    addTxn(state, makeTxn(state, data));
    toast(t('txn.saved'), 'success');
  }

  state.settings.onboarded = true;
  saveState(state);
  vibrate(9);
  closeSheet();
  render({ animate: false });
}

/* ------------------------------ voice entry ------------------------------ */
function openVoiceSheet() {
  stopVoice();
  sheet = {
    type: 'voice',
    phase: 'idle',
    transcript: '',
    interim: '',
    parsed: null,
    error: '',
    status: t('voice.tap'),
    lang: voiceLang,
  };
  renderSheet();
  if (speechSupported()) startVoice();
  else {
    sheet.phase = 'error';
    sheet.error = t('voice.unsupported');
    updateVoiceLive();
    toast(t('voice.unsupportedShort'), 'info');
  }
}

function voiceSheet() {
  const v = sheet;
  return `<div class="voice-hero" id="voice-hero">
      <button class="voice-mic" id="voice-mic-btn" type="button" data-action="voice-toggle" aria-label="${esc(t('voice.start'))}">
        ${icon('mic', 32)}
      </button>
      <div class="voice-status" id="voice-status" aria-live="polite">${esc(v.status || t('voice.tap'))}</div>
      <div class="voice-langs" aria-label="${esc(t('voice.lang'))}">
        <button type="button" data-action="voice-lang" data-lang="en-US" class="${v.lang === 'en-US' ? 'active' : ''}">${t('voice.english')}</button>
        <button type="button" data-action="voice-lang" data-lang="bn-BD" class="${v.lang === 'bn-BD' ? 'active' : ''}">${t('voice.bangla')}</button>
      </div>
    </div>

    <div class="voice-transcript ${v.transcript || v.interim ? 'has-text' : ''}" id="voice-transcript" aria-live="polite">
      ${voiceTranscriptHtml(v)}
    </div>

    <div id="voice-result">${voiceResultHtml(v.parsed)}</div>
    <div id="voice-error">${v.error ? `<div class="form-error show">${esc(v.error)}</div>` : ''}</div>

    <div class="alert info">${icon('info', 14)}<span>${t('voice.privacy')}</span></div>

    <div class="sheet-actions">
      <button class="btn ghost" id="voice-edit-btn" type="button" data-action="voice-edit">${t('voice.edit')}</button>
      <button class="btn primary" id="voice-save-btn" type="button" data-action="voice-save" ${v.parsed?.ok ? '' : 'disabled'}>${icon('check', 15)}${t('voice.save')}</button>
    </div>`;
}

function voiceTranscriptHtml(v) {
  if (!v.transcript && !v.interim) {
    return `<span class="voice-placeholder">${esc(t('voice.example'))}</span>`;
  }
  return `${esc(v.transcript)}${v.interim ? `<span class="interim"> ${esc(v.interim)}</span>` : ''}`;
}

function voiceResultHtml(parsed) {
  if (!parsed) {
    return `<div class="voice-empty">${icon('sparkles', 14)}<span>${t('voice.previewEmpty')}</span></div>`;
  }

  const category = getCategory(parsed.category);
  const memberId = parsed.memberId
    || (state.activeMember !== 'all' ? state.activeMember : state.members[0]?.id);
  const member = state.members.find((item) => item.id === memberId);
  const tone = parsed.type === 'income' ? 'good' : parsed.type === 'expense' ? 'bad' : 'neutral';
  return `<div class="voice-result">
      <div class="voice-result-head">
        <div>
          <div class="voice-result-label">${t('voice.detected')}</div>
          <div class="voice-amount">${esc(fmtMoney(parsed.amount))}</div>
        </div>
        <span class="badge ${tone}">${esc(t(`txn.${parsed.type}`))}</span>
      </div>
      <div class="voice-chips">
        <span class="voice-chip">${category.emoji} ${esc(categoryName(parsed.category))}</span>
        <span class="voice-chip">${icon('wallet', 12)}${esc(accountName(parsed.account))}${parsed.toAccount ? ` → ${esc(accountName(parsed.toAccount))}` : ''}</span>
        <span class="voice-chip">${icon('calendar', 12)}${esc(formatDate(parsed.date, 'short'))}</span>
        ${member ? `<span class="voice-chip">${esc(member.emoji)} ${esc(member.name)}</span>` : ''}
      </div>
      <div class="voice-note">${esc(parsed.note)}</div>
      ${parsed.warnings?.includes('multiple-amounts') ? `<div class="voice-warning">${icon('alert', 13)}<span>${esc(t('voice.multiple'))}</span></div>` : ''}
      ${parsed.ok ? '' : `<div class="form-error show" style="margin-top:9px">${esc(t('voice.needAmount'))}</div>`}
    </div>`;
}

function updateVoiceLive() {
  if (!sheet || sheet.type !== 'voice') return;
  const v = sheet;

  const status = document.getElementById('voice-status');
  if (status) status.textContent = v.status || t('voice.tap');

  const transcript = document.getElementById('voice-transcript');
  if (transcript) {
    transcript.innerHTML = voiceTranscriptHtml(v);
    transcript.classList.toggle('has-text', Boolean(v.transcript || v.interim));
  }

  const result = document.getElementById('voice-result');
  if (result) result.innerHTML = voiceResultHtml(v.parsed);

  const error = document.getElementById('voice-error');
  if (error) error.innerHTML = v.error ? `<div class="form-error show">${esc(v.error)}</div>` : '';

  const save = document.getElementById('voice-save-btn');
  if (save) {
    const canSave = Boolean(v.parsed?.ok && v.parsed.amount > 0);
    save.disabled = !canSave;
  }

  const mic = document.getElementById('voice-mic-btn');
  if (mic) {
    const listening = v.phase === 'listening';
    mic.classList.toggle('listening', listening);
    mic.setAttribute('aria-label', t(listening ? 'voice.stop' : 'voice.start'));
  }

  const hero = document.getElementById('voice-hero');
  if (hero) hero.classList.toggle('listening', v.phase === 'listening');

  document.querySelectorAll('[data-action="voice-lang"]').forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === v.lang);
  });
}

function startVoice() {
  if (!sheet || sheet.type !== 'voice') return;
  const v = sheet;
  stopVoice();

  if (!speechSupported()) {
    v.phase = 'error';
    v.error = t('voice.unsupported');
    updateVoiceLive();
    return;
  }

  v.phase = 'listening';
  v.transcript = '';
  v.interim = '';
  v.parsed = null;
  v.error = '';
  v.status = t('voice.listening');
  updateVoiceLive();

  let recognizer;
  try {
    recognizer = createSpeechRecognizer(v.lang || voiceLang);
  } catch {
    v.phase = 'error';
    v.status = t('voice.tap');
    v.error = t('voice.errUnknown');
    updateVoiceLive();
    return;
  }
  if (!recognizer) {
    v.phase = 'error';
    v.error = t('voice.unsupported');
    updateVoiceLive();
    return;
  }
  voiceRec = recognizer;

  recognizer.onstart = () => {
    if (sheet !== v) return;
    v.phase = 'listening';
    v.status = t('voice.listening');
    updateVoiceLive();
  };

  recognizer.onresult = (event) => {
    if (sheet !== v) return;
    let finalText = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i += 1) {
      const alternative = event.results[i][0];
      const text = alternative?.transcript || '';
      if (event.results[i].isFinal) finalText += `${text} `;
      else interim += `${text} `;
    }
    v.transcript = finalText.trim();
    v.interim = interim.trim();
    v.error = '';
    if (v.transcript) {
      v.parsed = parseVoiceCommand(v.transcript, {
        members: state.members,
        lang: v.lang,
      });
    }
    v.status = v.interim ? t('voice.hearing') : (v.parsed?.ok ? t('voice.ready') : t('voice.listening'));
    updateVoiceLive();
  };

  recognizer.onerror = (event) => {
    if (sheet !== v) return;
    if (event.error === 'aborted') return;
    clearTimeout(voiceTimer);
    voiceTimer = 0;
    v.phase = 'ready';
    if (event.error === 'no-speech') {
      v.status = t('voice.nothing');
      updateVoiceLive();
      return;
    }
    v.error = t(`voice.err.${event.error}`, {}) || t('voice.errUnknown');
    if (v.error === `voice.err.${event.error}`) v.error = t('voice.errUnknown');
    v.status = t('voice.tap');
    updateVoiceLive();
  };

  recognizer.onend = () => {
    if (voiceRec === recognizer) voiceRec = null;
    clearTimeout(voiceTimer);
    voiceTimer = 0;
    if (sheet !== v) return;
    v.phase = 'ready';
    const spoken = (v.transcript || v.interim || '').trim();
    if (spoken) {
      v.transcript = spoken;
      v.interim = '';
      v.parsed = parseVoiceCommand(spoken, {
        members: state.members,
        lang: v.lang,
      });
      v.status = v.parsed.ok ? t('voice.ready') : t('voice.needAmount');
    } else if (!v.error) {
      v.status = t('voice.nothing');
    }
    updateVoiceLive();
  };

  try {
    recognizer.start();
  } catch {
    voiceRec = null;
    v.phase = 'error';
    v.status = t('voice.tap');
    v.error = t('voice.errUnknown');
    updateVoiceLive();
    return;
  }

  voiceTimer = setTimeout(() => {
    if (voiceRec === recognizer) {
      try {
        recognizer.stop();
      } catch {
        /* ignore */
      }
    }
  }, 15000);
}

function stopVoiceListening() {
  if (!voiceRec) return;
  if (sheet?.type === 'voice') {
    sheet.status = sheet.parsed?.ok ? t('voice.ready') : t('voice.stopping');
    updateVoiceLive();
  }
  try {
    voiceRec.stop();
  } catch {
    /* ignore */
  }
}

function stopVoice() {
  clearTimeout(voiceTimer);
  voiceTimer = 0;
  const recognizer = voiceRec;
  voiceRec = null;
  if (!recognizer) return;
  recognizer.onstart = null;
  recognizer.onresult = null;
  recognizer.onerror = null;
  recognizer.onend = null;
  try {
    recognizer.abort();
  } catch {
    /* ignore */
  }
}

function setVoiceLang(lang) {
  if (!sheet || sheet.type !== 'voice') return;
  voiceLang = lang === 'bn-BD' ? 'bn-BD' : 'en-US';
  sheet.lang = voiceLang;
  const wasListening = sheet.phase === 'listening';
  stopVoice();
  if (wasListening) startVoice();
  else updateVoiceLive();
}

function saveVoiceEntry() {
  if (!sheet || sheet.type !== 'voice') return;
  const parsed = sheet.parsed;
  if (!parsed?.ok || !(parsed.amount > 0)) return;

  const type = ['expense', 'income', 'transfer'].includes(parsed.type) ? parsed.type : 'expense';
  const account = ACCOUNT_IDS.includes(parsed.account) ? parsed.account : 'cash';
  let toAccount = '';
  if (type === 'transfer') {
    toAccount = ACCOUNT_IDS.includes(parsed.toAccount) && parsed.toAccount !== account
      ? parsed.toAccount
      : ACCOUNT_IDS.find((id) => id !== account) || 'bank';
  }

  let category = type === 'transfer' ? 'transfer' : parsed.category;
  const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (type !== 'transfer' && !pool.some((item) => item.id === category)) {
    category = matchCategory(parsed.note, type);
  }

  const memberId = state.members.some((member) => member.id === parsed.memberId)
    ? parsed.memberId
    : (state.activeMember !== 'all' ? state.activeMember : state.members[0].id);

  snapshot(t('undo.labelVoice'));
  addTxn(state, makeTxn(state, {
    type,
    amount: Math.abs(parsed.amount),
    category,
    account,
    toAccount,
    date: parsed.date || todayISO(),
    memberId,
    note: parsed.note || '',
    ref: '',
    source: 'manual',
  }));

  state.settings.onboarded = true;
  saveState(state);
  stopVoice();
  closeSheet();
  vibrate(12);
  toast(t('voice.saved'), 'success');
  render({ animate: false });
}

function editVoiceEntry() {
  if (!sheet || sheet.type !== 'voice') return;
  const parsed = sheet.parsed;
  stopVoice();

  if (!parsed) {
    openTxnSheet(null);
    return;
  }

  const type = ['expense', 'income', 'transfer'].includes(parsed.type) ? parsed.type : 'expense';
  const account = ACCOUNT_IDS.includes(parsed.account) ? parsed.account : 'cash';
  let toAccount = '';
  if (type === 'transfer') {
    toAccount = ACCOUNT_IDS.includes(parsed.toAccount) && parsed.toAccount !== account
      ? parsed.toAccount
      : ACCOUNT_IDS.find((id) => id !== account) || 'bank';
  }

  openTxnSheet(null, {
    type,
    amount: parsed.amount > 0 ? String(parsed.amount) : '',
    category: type === 'transfer' ? 'transfer' : parsed.category,
    account,
    toAccount,
    date: parsed.date || todayISO(),
    memberId: state.members.some((member) => member.id === parsed.memberId)
      ? parsed.memberId
      : undefined,
    note: parsed.note || '',
  });
}

/* ------------------------------ member sheets ------------------------------ */
function membersSheet() {
  const all = { emoji: '👥', color: '#7C9CFF', name: t('app.allMembers') };
  const everyone = state.activeMember === 'all';
  const rows = state.members.map((m) => {
    const active = state.activeMember === m.id;
    const count = state.txns.filter((tx) => tx.memberId === m.id).length;
    return `<div class="member-manage">
      ${avatar(m)}
      <button class="mm-main" type="button" data-action="member-select" data-id="${esc(m.id)}">
        <div class="mm-name">${esc(m.name)} ${active ? `<span class="tag">${t('member.current')}</span>` : ''}</div>
        <div class="mm-sub">${esc(t('member.txns', { n: count }))}</div>
      </button>
      <button class="icon-text" type="button" data-action="member-edit" data-id="${esc(m.id)}" aria-label="${esc(t('common.edit'))}">${icon('edit', 14)}</button>
      ${active ? `<span style="color:var(--income);display:grid;place-items:center;width:24px">${icon('check', 15)}</span>` : '<span style="width:24px"></span>'}
    </div>`;
  }).join('');

  return `<div class="member-manage" style="margin-bottom:6px">
    ${avatar(all)}
    <button class="mm-main" type="button" data-action="member-select" data-id="all">
      <div class="mm-name">${t('app.allMembers')} ${everyone ? `<span class="tag">${t('member.current')}</span>` : ''}</div>
      <div class="mm-sub">${esc(t('app.memberCount', { n: state.members.length }))} · ${esc(t('member.everyone'))}</div>
    </button>
    ${everyone ? `<span style="color:var(--income);display:grid;place-items:center;width:24px">${icon('check', 15)}</span>` : '<span style="width:24px"></span>'}
  </div>
  <div class="divider"></div>
  <div class="member-list">${rows}</div>
  <button class="btn soft block mt-14" type="button" data-action="member-new">${icon('plus', 15)}${t('more.addMember')}</button>`;
}

function openMemberSheet(id) {
  const existing = id ? state.members.find((m) => m.id === id) : null;
  sheet = {
    type: 'member',
    memberId: existing?.id || null,
    draft: {
      name: existing?.name || '',
      emoji: existing?.emoji || MEMBER_EMOJIS[0],
      color: existing?.color || MEMBER_COLORS[state.members.length % MEMBER_COLORS.length],
    },
    error: '',
  };
  renderSheet();
}

function memberSheet() {
  const s = sheet;
  const d = s.draft;
  return `<form id="member-form" novalidate>
    <div class="field">
      <label for="member-name">${t('more.memberName')}</label>
      <input class="input" id="member-name" type="text" maxlength="40" placeholder="${esc(t('more.memberNamePh'))}" value="${esc(d.name)}" required>
    </div>
    <div class="field">
      <span class="field-label">${t('more.memberEmoji')}</span>
      <div class="emoji-grid">
        ${MEMBER_EMOJIS.map((emoji) => `<button class="emoji-pick ${d.emoji === emoji ? 'active' : ''}" type="button" data-action="member-emoji" data-emoji="${esc(emoji)}">${esc(emoji)}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <span class="field-label">${t('more.memberColor')}</span>
      <div class="swatches">
        ${MEMBER_COLORS.map((color) => `<button class="swatch ${d.color === color ? 'active' : ''}" type="button" data-action="member-color" data-color="${color}" style="background:${color}" aria-label="${color}"></button>`).join('')}
      </div>
    </div>
    ${s.error ? `<div class="form-error show">${esc(s.error)}</div>` : ''}
    <div class="sheet-actions">
      <button class="btn ghost" type="button" data-action="sheet-close">${t('common.cancel')}</button>
      <button class="btn primary" type="submit">${icon('check', 15)}${t('common.save')}</button>
    </div>
    ${s.memberId && state.members.length > 1 ? `<button class="btn danger block" type="button" data-action="member-delete" data-id="${esc(s.memberId)}" style="margin-top:8px">${icon('trash', 15)}${t('more.memberDelete')}</button>` : ''}
  </form>`;
}

function syncMemberDraft() {
  if (!sheet || sheet.type !== 'member') return;
  const name = document.getElementById('member-name');
  if (name) sheet.draft.name = name.value;
}

function saveMemberForm() {
  syncMemberDraft();
  const d = sheet.draft;
  if (!String(d.name || '').trim()) {
    sheet.error = t('more.memberErrName');
    renderSheet();
    return;
  }
  snapshot(t(sheet.memberId ? 'undo.labelMember' : 'undo.labelMemberAdd'));
  if (sheet.memberId) {
    updateMember(state, sheet.memberId, d);
    toast(t('more.memberUpdated'), 'success');
  } else {
    addMember(state, d);
    toast(t('more.memberAdded'), 'success');
  }
  saveState(state);
  closeSheet();
  render({ animate: false });
}

/* ------------------------------ range sheet ------------------------------ */
function openRangeSheet() {
  const r = currentRange();
  const today = todayISO();
  const from = r.from <= '0001-01-01' ? addDaysISO(today, -29) : (r.from > today ? today : r.from);
  const to = r.to >= '9998-01-01' ? today : (r.to > today ? today : r.to);
  sheet = { type: 'range', draft: { from, to }, error: '' };
  renderSheet();
}

function rangeSheet() {
  const d = sheet.draft;
  return `<form id="range-form" novalidate>
    <div class="field-row">
      <div class="field">
        <label for="range-from">${t('filter.from')}</label>
        <input class="input" id="range-from" type="date" value="${esc(d.from)}" required>
      </div>
      <div class="field">
        <label for="range-to">${t('filter.to')}</label>
        <input class="input" id="range-to" type="date" value="${esc(d.to)}" required>
      </div>
    </div>
    <div class="hint" style="margin-bottom:7px">${t('filter.quick')}</div>
    <div class="toolbar-chips" style="margin-top:0">
      ${PRESETS.map((preset) => `<button class="chip" type="button" data-action="range-preset" data-preset="${preset}">${t(`preset.${preset}`)}</button>`).join('')}
    </div>
    ${sheet.error ? `<div class="form-error show">${esc(sheet.error)}</div>` : ''}
    <div class="sheet-actions">
      <button class="btn ghost" type="button" data-action="sheet-close">${t('common.cancel')}</button>
      <button class="btn primary" type="submit">${icon('calendar', 15)}${t('filter.apply')}</button>
    </div>
  </form>`;
}

function syncRangeDraft() {
  if (!sheet || sheet.type !== 'range') return;
  const from = document.getElementById('range-from')?.value;
  const to = document.getElementById('range-to')?.value;
  if (from) sheet.draft.from = from;
  if (to) sheet.draft.to = to;
}

function saveRangeForm() {
  syncRangeDraft();
  const { from, to } = sheet.draft;
  if (!from || !to || from > to) {
    sheet.error = t('filter.invalid');
    renderSheet();
    return;
  }
  ui.preset = 'custom';
  ui.from = from;
  ui.to = to;
  ui.activityLimit = 80;
  saveUi(ui);
  closeSheet();
  render({ animate: false });
  window.scrollTo(0, 0);
}

/* ------------------------------ budget sheet ------------------------------ */
function openBudgetSheet() {
  sheet = {
    type: 'budget',
    draft: { budget: state.settings.budget ? String(state.settings.budget) : '' },
  };
  renderSheet();
}

function budgetSheet() {
  return `<form id="budget-form" novalidate>
    <div class="field">
      <label for="budget-input">${t('more.budget')}</label>
      <div class="amount-wrap">
        <span class="cur">৳</span>
        <input id="budget-input" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(t('more.budgetPh'))}" value="${esc(sheet.draft.budget)}">
      </div>
      <div class="hint">${t('more.budgetDesc')}</div>
    </div>
    <div class="sheet-actions">
      <button class="btn ghost" type="button" data-action="sheet-close">${t('common.cancel')}</button>
      <button class="btn primary" type="submit">${icon('check', 15)}${t('common.save')}</button>
    </div>
    ${state.settings.budget ? `<button class="btn danger block" type="button" data-action="budget-remove" style="margin-top:8px">${t('budget.remove')}</button>` : ''}
  </form>`;
}

function saveBudgetForm() {
  const raw = document.getElementById('budget-input')?.value || '';
  const next = Math.max(0, parseNumber(raw));
  if (next !== state.settings.budget) snapshot(t('undo.labelBudget'));
  state.settings.budget = next;
  saveState(state);
  closeSheet();
  toast(t('more.saved'), 'success');
  render({ animate: false });
}

/* ------------------------------ opening balances ------------------------------ */
function openAccountsSheet() {
  sheet = {
    type: 'accounts',
    draft: Object.fromEntries(ACCOUNT_IDS.map((id) => [id, String(state.accounts[id]?.opening || '')])),
  };
  renderSheet();
}

function accountsSheet() {
  const lang = state.settings.lang;
  return `<form id="accounts-form" novalidate>
    <div class="hint" style="margin:0 0 12px">${t('more.accountsDesc')}</div>
    ${ACCOUNT_IDS.map((id) => `<div class="field">
      <label for="acct-${id}">${esc(accountName(id, lang))}</label>
      <div class="amount-wrap">
        <span class="cur" style="font-size:16px">৳</span>
        <input id="acct-${id}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(sheet.draft[id])}">
      </div>
    </div>`).join('')}
    <div class="sheet-actions">
      <button class="btn ghost" type="button" data-action="sheet-close">${t('common.cancel')}</button>
      <button class="btn primary" type="submit">${icon('check', 15)}${t('common.save')}</button>
    </div>
  </form>`;
}

function saveAccountsForm() {
  const next = {};
  for (const id of ACCOUNT_IDS) {
    next[id] = parseNumber(document.getElementById(`acct-${id}`)?.value || '');
  }
  if (ACCOUNT_IDS.some((id) => next[id] !== state.accounts[id].opening)) {
    snapshot(t('undo.labelAccounts'));
  }
  for (const id of ACCOUNT_IDS) {
    state.accounts[id].opening = next[id];
  }
  saveState(state);
  closeSheet();
  toast(t('more.saved'), 'success');
  render({ animate: false });
}

/* ------------------------------ confirm / install ------------------------------ */
function openConfirm({ title, desc, confirmLabel, action, payload = null, tone = 'primary' }) {
  sheet = { type: 'confirm', title, desc, confirmLabel, action, payload, tone };
  renderSheet();
}

function confirmSheet() {
  return `<p style="font-size:12px;color:var(--muted);line-height:1.7;margin:2px 0 4px">${esc(sheet.desc)}</p>
    <div class="sheet-actions">
      <button class="btn ghost" type="button" data-action="sheet-close">${t('common.cancel')}</button>
      <button class="btn ${sheet.tone === 'danger' ? 'danger' : 'primary'}" type="button" data-action="confirm-yes">${esc(sheet.confirmLabel || t('common.confirm'))}</button>
    </div>`;
}

function installSheet() {
  const ios = isIOS();
  return `<div class="insights">
    <div class="insight"><span class="ins-ic">${icon('install', 13)}</span><span>${t(ios ? 'more.installIos' : 'more.installManual')}</span></div>
    <div class="insight"><span class="ins-ic good">${icon('shield', 13)}</span><span>${t('more.installOffline')}</span></div>
  </div>
  <div class="sheet-actions">
    <button class="btn primary" type="button" data-action="sheet-close">${t('common.ok')}</button>
  </div>`;
}

/* =========================================================
   actions
   ========================================================= */
function bindEvents() {
  window.addEventListener('hashchange', () => {
    stopVoice();
    sheet = null;
    render();
    window.scrollTo(0, 0);
  });
  window.addEventListener('scroll', updateTopbarScroll, { passive: true });
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheet) closeSheet();
  });
  window.addEventListener('pagehide', stopVoice);

  document.addEventListener('dragover', (event) => {
    const dz = event.target.closest?.('[data-dropzone]');
    if (!dz) return;
    event.preventDefault();
    dz.classList.add('drag');
  });
  document.addEventListener('dragleave', (event) => {
    const dz = event.target.closest?.('[data-dropzone]');
    if (dz) dz.classList.remove('drag');
  });
  document.addEventListener('drop', (event) => {
    const dz = event.target.closest?.('[data-dropzone]');
    if (!dz) return;
    event.preventDefault();
    dz.classList.remove('drag');
    const files = event.dataTransfer?.files;
    if (files?.length) addImportFiles(files);
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (route === 'more') render({ animate: false });
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    toast(t('toast.installed'), 'success');
    if (route === 'more') render({ animate: false });
  });
}

function onClick(event) {
  const target = event.target.closest?.('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;

  if (action === 'sheet-close') {
    closeSheet();
    return;
  }

  try {
    handleAction(action, target, event);
  } catch (err) {
    console.warn(err);
    toast(t('toast.error'), 'error');
  }
}

function handleAction(action, el) {
  switch (action) {
    case 'filter-preset': {
      const preset = el.dataset.preset;
      if (!PRESETS.includes(preset)) return;
      ui.preset = preset;
      ui.from = '';
      ui.to = '';
      ui.activityLimit = 80;
      saveUi(ui);
      render({ animate: false });
      window.scrollTo(0, 0);
      return;
    }
    case 'open-range':
      openRangeSheet();
      return;
    case 'range-preset': {
      syncRangeDraft();
      const preset = el.dataset.preset;
      if (!PRESETS.includes(preset)) return;
      const r = getPresetRange(preset, null, null);
      const today = todayISO();
      sheet.draft.from = r.from <= '0001-01-01' ? addDaysISO(today, -29) : (r.from > today ? today : r.from);
      sheet.draft.to = r.to >= '9998-01-01' ? today : (r.to > today ? today : r.to);
      sheet.error = '';
      renderSheet();
      return;
    }
    case 'toggle-theme':
    case 'set-theme': {
      const next = action === 'set-theme'
        ? el.dataset.theme
        : (state.settings.theme === 'dark' ? 'light' : 'dark');
      state.settings.theme = next === 'light' ? 'light' : 'dark';
      saveState(state);
      render({ animate: false });
      return;
    }
    case 'dismiss-welcome':
      state.settings.onboarded = true;
      saveState(state);
      render({ animate: false });
      return;
    case 'open-member-sheet':
      sheet = { type: 'members' };
      renderSheet();
      return;
    case 'member-select': {
      const id = el.dataset.id;
      state.activeMember = id === 'all' || state.members.some((m) => m.id === id) ? id : 'all';
      saveState(state);
      closeSheet();
      render({ animate: false });
      return;
    }
    case 'member-new':
      openMemberSheet(null);
      return;
    case 'member-edit':
      openMemberSheet(el.dataset.id);
      return;
    case 'member-emoji':
      syncMemberDraft();
      sheet.draft.emoji = el.dataset.emoji || '🙂';
      sheet.error = '';
      renderSheet();
      return;
    case 'member-color':
      syncMemberDraft();
      sheet.draft.color = el.dataset.color || MEMBER_COLORS[0];
      sheet.error = '';
      renderSheet();
      return;
    case 'member-delete':
      openConfirm({
        title: t('more.memberDelete'),
        desc: t('more.memberDeleteDesc'),
        confirmLabel: t('common.delete'),
        action: 'delete-member',
        payload: el.dataset.id,
        tone: 'danger',
      });
      return;

    case 'open-add':
      openTxnSheet(null);
      return;
    case 'open-voice':
      openVoiceSheet();
      return;
    case 'voice-toggle':
      if (sheet?.type === 'voice' && sheet.phase === 'listening' && voiceRec) stopVoiceListening();
      else startVoice();
      return;
    case 'voice-lang':
      setVoiceLang(el.dataset.lang);
      return;
    case 'voice-save':
      saveVoiceEntry();
      return;
    case 'voice-edit':
      editVoiceEntry();
      return;
    case 'edit-txn':
      openTxnSheet(el.dataset.id);
      return;
    case 'txn-type': {
      syncTxnDraft();
      const type = el.dataset.type;
      if (!['expense', 'income', 'transfer'].includes(type)) return;
      sheet.draft.type = type;
      if (type === 'transfer') {
        sheet.draft.category = 'transfer';
        if (!sheet.draft.toAccount || sheet.draft.toAccount === sheet.draft.account) {
          sheet.draft.toAccount = ACCOUNT_IDS.find((id) => id !== sheet.draft.account) || 'bank';
        }
      } else {
        const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        if (!pool.some((cat) => cat.id === sheet.draft.category)) {
          sheet.draft.category = type === 'income' ? 'salary' : 'food';
        }
      }
      sheet.error = '';
      renderSheet();
      return;
    }
    case 'txn-cat':
      syncTxnDraft();
      sheet.draft.category = el.dataset.cat || sheet.draft.category;
      sheet.error = '';
      renderSheet();
      return;
    case 'quick-amount': {
      const input = document.getElementById('txn-amount');
      if (input) input.value = el.dataset.amount || '';
      return;
    }
    case 'ask-delete-txn':
      openConfirm({
        title: t('txn.deleteTitle'),
        desc: t('txn.deleteDesc'),
        confirmLabel: t('common.delete'),
        action: 'delete-txn',
        payload: el.dataset.id,
        tone: 'danger',
      });
      return;

    case 'open-budget':
      openBudgetSheet();
      return;
    case 'budget-remove':
      if (state.settings.budget) snapshot(t('undo.labelBudget'));
      state.settings.budget = 0;
      saveState(state);
      closeSheet();
      toast(t('more.saved'), 'success');
      render({ animate: false });
      return;
    case 'open-accounts':
      openAccountsSheet();
      return;

    case 'activity-type':
      ui.activityType = el.dataset.type || 'all';
      ui.activityLimit = 80;
      render({ animate: false, keepScroll: true });
      return;
    case 'activity-account':
      ui.activityAccount = el.dataset.account || 'all';
      ui.activityLimit = 80;
      render({ animate: false, keepScroll: true });
      return;
    case 'activity-clear-search':
      ui.activitySearch = '';
      ui.activityLimit = 80;
      render({ animate: false, focusSearch: true, keepScroll: true });
      return;
    case 'activity-more':
      ui.activityLimit = (ui.activityLimit || 80) + 80;
      render({ animate: false, keepScroll: true });
      return;
    case 'activity-reset':
      ui.activityType = 'all';
      ui.activityAccount = 'all';
      ui.activitySearch = '';
      ui.activityLimit = 80;
      ui.preset = 'this-month';
      ui.from = '';
      ui.to = '';
      saveUi(ui);
      render({ animate: false });
      return;

    case 'import-source':
      syncImportText();
      ui.import.sourceHint = el.dataset.source || 'auto';
      ui.import.preview = null;
      ui.import.error = '';
      ui.import.notice = '';
      render({ animate: false, keepScroll: true });
      return;
    case 'import-sample': {
      const bkash = (ui.import.sourceHint || 'auto') === 'auto' ? true : (ui.import.sourceHint === 'bkash');
      importFiles = [];
      ui.import = {
        ...(ui.import || {}),
        text: bkash ? SAMPLE_BKASH_CSV : SAMPLE_BANK_CSV,
        preview: null,
        error: '',
        notice: '',
        busy: false,
      };
      render({ animate: false, keepScroll: true });
      analyzeImport();
      return;
    }
    case 'import-clear':
      importFiles = [];
      stopOcr();
      ui.import = {};
      render({ animate: false, keepScroll: true });
      return;
    case 'import-file-remove': {
      const id = el.dataset.id;
      importFiles = importFiles.filter((item) => item.id !== id);
      ui.import = { ...(ui.import || {}), preview: null, error: '', notice: '' };
      render({ animate: false, keepScroll: true });
      return;
    }
    case 'import-file-clear':
      importFiles = [];
      ui.import = { ...(ui.import || {}), preview: null, error: '', notice: '' };
      render({ animate: false, keepScroll: true });
      return;
    case 'pick-file':
      document.getElementById('import-file')?.click();
      return;
    case 'import-analyze':
      analyzeImport();
      return;
    case 'import-toggle-all': {
      const rows = ui.import?.preview?.rows || [];
      if (!rows.length) return;
      const allSelected = rows.every((row) => row.include);
      rows.forEach((row) => { row.include = !allSelected; });
      render({ animate: false, keepScroll: true });
      return;
    }
    case 'import-confirm':
      confirmImport();
      return;

    case 'report-print':
      window.getSelection?.()?.removeAllRanges?.();
      setTimeout(() => window.print(), 40);
      return;
    case 'report-csv':
      exportReportCsv();
      return;
    case 'report-share':
      shareReport();
      return;

    case 'export-backup':
      downloadJSON(`hishab-backup-${todayISO()}.json`, buildBackup(state));
      toast(t('more.saved'), 'success');
      return;
    case 'restore-backup':
      pickRestoreFile();
      return;
    case 'undo-last':
      performUndo();
      return;
    case 'load-demo-sheet':
    case 'load-demo-home':
      openConfirm({
        title: t('more.confirmDemo'),
        desc: t('more.confirmDemoDesc'),
        confirmLabel: t('common.start'),
        action: 'load-demo',
      });
      return;
    case 'clear-sheet':
      openConfirm({
        title: t('more.confirmClear'),
        desc: t('more.confirmClearDesc'),
        confirmLabel: t('common.delete'),
        action: 'clear-data',
        tone: 'danger',
      });
      return;
    case 'install-app':
      promptInstall();
      return;
    case 'confirm-yes':
      runConfirmed();
      return;
    default:
      return;
  }
}

/* =========================================================
   form handlers
   ========================================================= */
function onSubmit(event) {
  const form = event.target;
  if (!form || !form.id) return;
  if (form.id === 'txn-form') {
    event.preventDefault();
    saveTxnForm();
  } else if (form.id === 'member-form') {
    event.preventDefault();
    saveMemberForm();
  } else if (form.id === 'range-form') {
    event.preventDefault();
    saveRangeForm();
  } else if (form.id === 'budget-form') {
    event.preventDefault();
    saveBudgetForm();
  } else if (form.id === 'accounts-form') {
    event.preventDefault();
    saveAccountsForm();
  }
}

function onChange(event) {
  const el = event.target;
  if (!el) return;

  if (el.id === 'import-file') {
    if (el.files?.length) addImportFiles(el.files);
    el.value = '';
    return;
  }
  if (el.id === 'import-member') {
    ui.import = { ...(ui.import || {}), memberId: el.value };
    return;
  }
  if (el.dataset.change === 'import-include') {
    const row = ui.import?.preview?.rows?.find((r) => r.index === Number(el.dataset.index));
    if (row) row.include = Boolean(el.checked);
    rerenderPreviewKeepScroll();
    return;
  }
  if (el.dataset.change === 'import-type') {
    const row = ui.import?.preview?.rows?.find((r) => r.index === Number(el.dataset.index));
    if (row) {
      const type = ['expense', 'income', 'transfer'].includes(el.value) ? el.value : 'expense';
      row.type = type;
      if (type === 'transfer') {
        row.category = 'transfer';
        if (!row.toAccount || row.toAccount === row.account) {
          row.toAccount = ACCOUNT_IDS.find((id) => id !== row.account) || 'bank';
        }
      } else {
        row.category = matchCategory(row.description, type);
        row.toAccount = '';
      }
      rerenderPreviewKeepScroll();
    }
  }
}

function onInput(event) {
  const el = event.target;
  if (!el) return;
  if (el.id === 'txn-search') {
    ui.activitySearch = el.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      ui.activityLimit = 80;
      render({ animate: false, focusSearch: true, keepScroll: true });
    }, 230);
  } else if (el.id === 'import-text') {
    ui.import = { ...(ui.import || {}), text: el.value };
  }
}

/* =========================================================
   import flow
   ========================================================= */
function syncImportText() {
  const text = document.getElementById('import-text')?.value;
  if (text != null) ui.import = { ...(ui.import || {}), text };
}

function importErrorText(err) {
  const code = err?.code || 'read';
  const map = {
    unsupported: 'import.errUnsupported',
    'too-large': 'import.errLarge',
    empty: 'import.errEmpty',
    password: 'import.errPassword',
    pdf: 'import.errPdf',
    image: 'import.errImage',
    ocr: 'import.errOcr',
    'no-text': 'import.errNoText',
    read: 'import.readError',
  };
  return t(map[code] || 'import.readError');
}

function addImportFiles(fileList) {
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;
  let rejected = 0;
  for (const file of incoming) {
    if (importFiles.length >= MAX_FILES) {
      rejected += 1;
      continue;
    }
    const kind = fileKind(file);
    const id = `f_${Date.now().toString(36)}_${importSeq += 1}`;
    const badge = kind === 'image' ? 'IMG' : kind === 'pdf' ? 'PDF' : kind === 'csv' ? 'CSV' : kind === 'text' ? 'TXT' : '?';
    const meta = `${formatBytes(file.size)} • ${kind === 'unknown' ? t('import.unknownType') : kind === 'image' ? t('import.photo') : kind === 'pdf' ? 'PDF' : kind === 'csv' ? 'CSV' : t('import.textFile')}`;
    let error = '';
    if (kind === 'unknown') error = t('import.errUnsupported');
    else if (!file.size) error = t('import.errEmpty');
    else if (file.size > MAX_FILE_BYTES) error = t('import.errLarge');
    const duplicate = importFiles.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
    if (duplicate) continue;
    importFiles.push({
      id,
      file,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified || 0,
      kind,
      badge,
      meta,
      error,
      text: '',
    });
  }
  if (rejected) toast(t('import.maxFiles', { n: MAX_FILES }), 'warn');
  ui.import = { ...(ui.import || {}), preview: null, error: '', notice: '', busy: false };
  render({ animate: false, keepScroll: true });
}

function setImportProgress(pct, label) {
  const value = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if (ui.import?.progress) ui.import.progress = { pct: value, label };
  const bar = document.getElementById('import-progress-bar');
  const pctEl = document.getElementById('import-progress-pct');
  const labelEl = document.getElementById('import-progress-label');
  if (bar) bar.style.width = `${value}%`;
  if (pctEl) pctEl.textContent = `${value}%`;
  if (labelEl && label) labelEl.textContent = label;
}

async function analyzeImport() {
  if (ui.import?.busy) return;
  syncImportText();
  const imp = ui.import || {};
  const text = String(imp.text || '').trim();
  const usable = importFiles.filter((item) => item.file && !item.error);
  if (!usable.length && !text) {
    toast(importFiles.length ? t('import.errAllFiles') : t('import.errNoFile'), 'warn');
    return;
  }

  ui.import = {
    ...imp,
    busy: true,
    error: '',
    notice: '',
    preview: null,
    progress: { pct: 0, label: t('import.reading') },
  };
  render({ animate: false, keepScroll: true });

  const parsedSources = [];
  const notes = [];
  let scannedAny = false;
  let failed = 0;

  try {
    for (let i = 0; i < usable.length; i += 1) {
      const item = usable[i];
      item.error = '';
      item.text = '';
      setImportProgress((i / Math.max(usable.length, 1)) * 100, `${item.name} — ${t('import.reading')}`);
      try {
        const extracted = await extractFile(item.file, (pct, label) => {
          const overall = ((i + (pct / 100)) / Math.max(usable.length, 1)) * 100;
          setImportProgress(overall, `${item.name} — ${label}`);
        });
        item.text = extracted.text;
        if (extracted.scanned) scannedAny = true;
        if (extracted.warnings?.includes('pdf-pages-limited') || extracted.warnings?.includes('ocr-pages-limited')) {
          notes.push(t('import.limitNote'));
        }
        parsedSources.push({
          text: extracted.text,
          kind: extracted.kind,
          name: item.name,
          layout: extracted.layout,
        });
      } catch (err) {
        failed += 1;
        item.error = importErrorText(err);
        notes.push(`${item.name}: ${item.error}`);
      }
    }

    if (text) parsedSources.push({ text, kind: 'text', name: t('import.pastedText') });
    setImportProgress(96, t('import.parsing'));

    const merged = [];
    const sources = [];
    for (const source of parsedSources) {
      const parsed = parseStatement(source.text, {
        sourceHint: imp.sourceHint || 'auto',
        layout: source.layout,
      });
      if (!parsed.ok) continue;
      if (!sources.includes(parsed.source)) sources.push(parsed.source);
      for (const row of parsed.rows) merged.push(row);
    }

    if (!merged.length) {
      ui.import = {
        ...ui.import,
        busy: false,
        preview: null,
        error: failed
          ? t('import.errAllFiles')
          : `${t('import.none')} — ${t('import.noneDesc')}`,
      };
      return;
    }

    const rows = markDuplicateRows(state.txns, merged)
      .map((row, index) => ({ ...row, index }));

    setImportProgress(100, t('import.done'));
    const notices = [];
    if (scannedAny) notices.push(t('import.scannedNote'));
    if (failed) notices.push(t('import.partial', { n: failed }));
    if (notes.length && !failed) notices.push(...notes);
    ui.import = {
      ...ui.import,
      busy: false,
      error: '',
      notice: notices.filter(Boolean).join(' '),
      preview: {
        rows,
        sources,
        source: sources[0] || 'bank',
        format: 'mixed',
        duplicates: rows.filter((row) => row.duplicate).length,
      },
    };
  } catch (err) {
    ui.import = {
      ...ui.import,
      busy: false,
      error: importErrorText(err),
    };
  } finally {
    if (ui.import.busy) ui.import = { ...ui.import, busy: false };
    render({ animate: false, keepScroll: true });
    setTimeout(() => {
      document.querySelector('.preview-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }
}

function rerenderPreviewKeepScroll() {
  const list = document.querySelector('.pv-list');
  const scrollTop = list ? list.scrollTop : 0;
  render({ animate: false, keepScroll: true });
  const next = document.querySelector('.pv-list');
  if (next) next.scrollTop = scrollTop;
}

function confirmImport() {
  const imp = ui.import || {};
  const preview = imp.preview;
  if (!preview) return;
  const selected = preview.rows.filter((row) => row.include);
  if (!selected.length) {
    toast(t('import.pickAtLeast'), 'warn');
    return;
  }

  const memberId = imp.memberId
    || (state.activeMember !== 'all' ? state.activeMember : state.members[0]?.id);
  const seen = new Set(state.txns.map(fingerprint));
  const plannedSeen = new Set(seen);
  let planned = 0;
  for (const row of selected) {
    const fp = fingerprint({
      source: row.source,
      date: row.date,
      amount: row.amount,
      ref: row.ref,
      note: row.note,
    });
    if (plannedSeen.has(fp)) continue;
    plannedSeen.add(fp);
    planned += 1;
  }
  let added = 0;
  let snapshotted = false;
  let importedFrom = '';
  let importedTo = '';

  for (const row of selected) {
    const fp = fingerprint({
      source: row.source,
      date: row.date,
      amount: row.amount,
      ref: row.ref,
      note: row.note,
    });
    if (seen.has(fp)) continue;
    seen.add(fp);
    if (!snapshotted) {
      snapshot(planned === 1 ? t('undo.labelImportOne') : t('undo.labelImport', { n: planned }));
      snapshotted = true;
    }
    addTxn(state, makeTxn(state, {
      type: row.type,
      amount: row.amount,
      category: row.category,
      account: row.account,
      toAccount: row.toAccount,
      date: row.date,
      memberId,
      note: row.description || row.note || '',
      ref: row.ref || '',
      source: row.source,
    }));
    added += 1;
    if (row.date) {
      if (!importedFrom || row.date < importedFrom) importedFrom = row.date;
      if (!importedTo || row.date > importedTo) importedTo = row.date;
    }
  }

  if (!added) {
    toast(t('import.none'), 'warn');
    return;
  }

  state.settings.onboarded = true;
  saveState(state);
  if (importedFrom) {
    ui.preset = 'custom';
    ui.from = importedFrom;
    ui.to = importedTo || importedFrom;
    saveUi(ui);
  }
  ui.import = {};
  importFiles = [];
  vibrate(10);
  toast(t('import.success', { n: added }), 'success');
  if (location.hash === '#/activity') render({ animate: false });
  else location.hash = '#/activity';
}

/* =========================================================
   report export / share
   ========================================================= */
function exportReportCsv() {
  const ctx = buildCtx();
  const rows = [['Date', 'Type', 'Category', 'Account', 'To account', 'Member', 'Amount', 'Note', 'Reference', 'Source']];
  for (const tx of ctx.report.txns) {
    const member = state.members.find((m) => m.id === tx.memberId);
    rows.push([
      tx.date,
      tx.type,
      categoryName(tx.category, 'en'),
      accountName(tx.account, 'en'),
      tx.toAccount ? accountName(tx.toAccount, 'en') : '',
      member?.name || '',
      tx.amount.toFixed(2),
      tx.note || '',
      tx.ref || '',
      tx.source || '',
    ]);
  }
  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  downloadText(`hishab-report-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  toast(t('report.exported'), 'success');
}

async function shareReport() {
  const ctx = buildCtx();
  const r = ctx.report;
  const lang = state.settings.lang;
  const rangeLabel = ui.preset === 'all'
    ? t('preset.all')
    : formatRangeLabel(r.effective.from, r.effective.to, lang);
  const member = state.members.find((m) => m.id === state.activeMember);
  const memberLabel = member ? member.name : t('report.memberAll');
  const lines = [
    t('report.shareTitle'),
    t('report.shareIntro', { range: rangeLabel, member: memberLabel }),
    `${t('home.income')}: ${fmtMoney(r.totals.income)}`,
    `${t('home.expense')}: ${fmtMoney(r.totals.expense)}`,
    `${t('report.net')}: ${fmtMoney(r.totals.net, { sign: true })}`,
  ];
  if (r.categories[0]) {
    lines.push(t('home.topCategory', { cat: categoryName(r.categories[0].id, lang) }));
  }
  const text = lines.join('\n');

  try {
    await sharePayload(t('report.shareTitle'), text);
  } catch {
    const ok = await copyText(text);
    toast(ok ? t('report.shared') : t('toast.error'), ok ? 'success' : 'error');
  }
}

/* =========================================================
   backup / demo / clear
   ========================================================= */
function pickRestoreFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const incoming = parseBackup(text);
      const merged = mergeStates(state, incoming);
      snapshot(t('undo.labelRestore'));
      state = merged.state;
      saveState(state);
      closeSheet();
      render({ animate: false });
      toast(t('more.restored', { n: merged.added }), 'success');
    } catch {
      toast(t('more.invalidBackup'), 'error');
    }
  });
  input.click();
}

function resetUiForData() {
  ui = {
    preset: 'this-month',
    from: '',
    to: '',
    activityLimit: 80,
    activityType: 'all',
    activityAccount: 'all',
    activitySearch: '',
    import: {},
  };
  saveUi(ui);
}

function runConfirmed() {
  if (!sheet || sheet.type !== 'confirm') return;
  const { action, payload } = sheet;

  if (action === 'delete-txn') {
    snapshot(t('undo.labelDelete'));
    deleteTxn(state, payload);
    saveState(state);
    closeSheet();
    toast(t('txn.deleted'), 'success');
    render({ animate: false });
    return;
  }
  if (action === 'delete-member') {
    snapshot(t('undo.labelMemberDelete'));
    const result = deleteMember(state, payload);
    if (!result.ok) clearUndo();
    saveState(state);
    closeSheet();
    if (result.ok) toast(t('more.memberDeleted'), 'success');
    else toast(t('toast.error'), 'error');
    render({ animate: false });
    return;
  }
  if (action === 'load-demo') {
    snapshot(t('undo.labelDemo'));
    state = demoState();
    saveState(state);
    resetUiForData();
    closeSheet();
    toast(t('more.demoLoaded'), 'success');
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (action === 'clear-data') {
    snapshot(t('undo.labelClear'));
    state = resetStateKeepPrefs(state);
    saveState(state);
    resetUiForData();
    closeSheet();
    toast(t('more.cleared'), 'success');
    render();
    window.scrollTo(0, 0);
  }
}

/* =========================================================
   install / theme / helpers
   ========================================================= */
async function promptInstall() {
  if (deferredPrompt) {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice?.outcome === 'accepted') {
        toast(t('toast.installed'), 'success');
        if (route === 'more') render({ animate: false });
      } else if (route === 'more') {
        render({ animate: false });
      }
    } catch {
      sheet = { type: 'install' };
      renderSheet();
    }
  } else {
    sheet = { type: 'install' };
    renderSheet();
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === 'light' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.settings.theme === 'light' ? '#F3F6FA' : '#0B0F14');
}

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

function isIOS() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua);
  const ipadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return ios || ipadOs;
}

function toast(message, tone = 'info') {
  if (!toastRoot) return;
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.innerHTML = `${icon(tone === 'success' ? 'check' : tone === 'error' ? 'alert' : 'info', 15)}<span>${esc(message)}</span>`;
  toastRoot.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 250);
  }, 2700);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      if (reg.waiting) {
        toast(t('toast.updateReady'), 'info');
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast(t('toast.updateReady'), 'info');
          }
        });
      });
    }).catch(() => {
      /* offline support is optional */
    });
  });
}
