/* =========================================================
   Hishab — on-device assistant view
   ========================================================= */

import { accountName, categoryName, getCategory } from '../categories.js';
import { icon } from '../components.js';
import { exampleQuestions } from '../assistant.js';
import { t } from '../i18n.js';
import {
  esc, fmtMoney, formatDate,
} from '../utils.js';

const CHIP_ICONS = {
  calendar: 'calendar',
  arrowUpRight: 'arrowUpRight',
  arrowDownLeft: 'arrowDownLeft',
  refresh: 'refresh',
  user: 'user',
  tag: 'tag',
  wallet: 'wallet',
  shield: 'shield',
};

export function assistantView(ctx) {
  const { state, lang, assistant } = ctx;
  const messages = Array.isArray(assistant?.messages) ? assistant.messages : [];
  const contacts = Array.isArray(state.contacts) ? state.contacts : [];
  const examples = exampleQuestions(state);
  const helpOpen = messages.length === 0;

  return `
    <section class="section">
      <div class="assistant-hero">
        <div class="assistant-orb">${icon('sparkles', 24)}</div>
        <div class="grow">
          <div class="assistant-title">${t('assistant.title')}</div>
          <div class="assistant-sub">${t('assistant.sub')}</div>
        </div>
        <span class="assistant-badge">${icon('shield', 12)}${t('assistant.offline')}</span>
      </div>
    </section>

    <section class="section">
      ${helpCard(examples, helpOpen)}
    </section>

    <section class="section">
      ${chatCard(messages, state, lang, examples)}
    </section>

    <section class="section">
      ${contactsCard(contacts)}
    </section>

    <div class="assistant-page-note">
      ${icon('lock', 12)}
      <span>${t('assistant.privacy')}</span>
    </div>`;
}

function helpCard(examples, open) {
  return `<details class="assistant-help" ${open ? 'open' : ''}>
    <summary>
      <span class="assistant-help-summary">${icon('info', 15)}<span>${t('assistant.helpTitle')}</span></span>
      ${icon('chevronDown', 15, 'assistant-help-chev')}
    </summary>
    <div class="assistant-help-body">
      <p>${t('assistant.helpIntro')}</p>
      <ol class="assistant-steps">
        <li><span>1</span><div>${t('assistant.helpStep1')}</div></li>
        <li><span>2</span><div>${t('assistant.helpStep2')}</div></li>
        <li><span>3</span><div>${t('assistant.helpStep3')}</div></li>
      </ol>
      <div class="assistant-example-label">${t('assistant.examples')}</div>
      <div class="assistant-chips">${examples.map(exampleChip).join('')}</div>
    </div>
  </details>`;
}

function exampleChip(text) {
  return `<button class="assistant-chip example" type="button" data-action="assistant-example" data-q="${esc(text)}">${esc(text)}</button>`;
}

function chatCard(messages, state, lang, examples) {
  return `<div class="card assistant-chat-card">
    <div class="card-head assistant-chat-head">
      <div>
        <div class="card-title">${t('assistant.chatTitle')}</div>
        <div class="card-sub">${t('assistant.chatSub', { n: state.txns.length })}</div>
      </div>
      ${messages.length ? `<button class="icon-btn assistant-clear" type="button" data-action="assistant-clear" aria-label="${esc(t('assistant.clear'))}" title="${esc(t('assistant.clear'))}">${icon('trash', 15)}</button>` : ''}
    </div>

    <div class="assistant-thread" id="assistant-thread" aria-live="polite">
      ${messages.length ? messages.map((message, index) => messageHtml(message, state, lang, index === messages.length - 1)).join('') : emptyChat(examples)}
    </div>

    <form class="assistant-composer" id="assistant-form" autocomplete="off">
      <input class="input" id="assistant-input" name="question" type="text" maxlength="240" autocomplete="off" enterkeyhint="send" placeholder="${esc(t('assistant.placeholder'))}" aria-label="${esc(t('assistant.placeholder'))}">
      <button class="assistant-send" type="submit" aria-label="${esc(t('assistant.send'))}">${icon('send', 18)}</button>
    </form>
    <div class="assistant-footnote">${icon('shield', 12)}<span>${t('assistant.footnote')}</span></div>
  </div>`;
}

function emptyChat(examples) {
  return `<div class="assistant-empty">
    <div class="assistant-empty-orb">${icon('sparkles', 20)}</div>
    <div class="assistant-empty-title">${t('assistant.emptyTitle')}</div>
    <div class="assistant-empty-desc">${t('assistant.emptyDesc')}</div>
    <div class="assistant-chips">${examples.slice(0, 4).map(exampleChip).join('')}</div>
  </div>`;
}

function messageHtml(message, state, lang, last) {
  if (message.role === 'user') {
    return `<div class="assistant-msg user" ${last ? 'id="assistant-end"' : ''}>
      <div class="assistant-bubble user">${esc(message.text)}</div>
    </div>`;
  }
  return `<div class="assistant-msg bot" ${last ? 'id="assistant-end"' : ''}>
    <span class="assistant-avatar">${icon('sparkles', 14)}</span>
    <div class="assistant-bubble">${answerHtml(message.answer || {}, state, lang)}</div>
  </div>`;
}

function answerHtml(answer, state, lang) {
  const chips = Array.isArray(answer.chips) ? answer.chips : [];
  const balances = Array.isArray(answer.balances) ? answer.balances : [];
  const txns = Array.isArray(answer.txns) ? answer.txns : [];
  const suggestions = Array.isArray(answer.suggestions) ? answer.suggestions : [];
  const showSuggestions = suggestions.length && (!txns.length || answer.intent === 'help' || answer.intent === 'greeting' || answer.intent === 'unknown');

  return `<div class="assistant-bubble-title">${esc(answer.title || t('assistant.answerFallback'))}</div>
    <div class="assistant-bubble-text">${esc(answer.text || '')}</div>
    ${answer.detail ? `<div class="assistant-detail">${esc(answer.detail)}</div>` : ''}
    ${chips.length ? `<div class="assistant-chips">${chips.map(chipHtml).join('')}</div>` : ''}
    ${balances.length ? `<div class="assistant-balances">${balances.map((item) => `<div class="assistant-balance">
      <span>${esc(item.name)}</span>
      <strong>${fmtMoney(item.balance)}</strong>
    </div>`).join('')}</div>` : ''}
    ${txns.length ? `<div class="assistant-txns">${txns.map((tx) => txnHtml(tx, state, lang)).join('')}</div>` : ''}
    ${answer.more ? `<div class="assistant-more">${t('assistant.showing', { shown: txns.length, count: answer.totalMatches || answer.count || txns.length })}</div>` : ''}
    ${showSuggestions ? `<div class="assistant-suggestions"><div class="assistant-suggestions-label">${t('assistant.tryThese')}</div><div class="assistant-chips">${suggestions.map(exampleChip).join('')}</div></div>` : ''}`;
}

function chipHtml(chip) {
  if (!chip) return '';
  if (typeof chip === 'string') return `<span class="assistant-chip static">${esc(chip)}</span>`;
  const iconName = CHIP_ICONS[chip.kind] || 'tag';
  return `<span class="assistant-chip static">${icon(iconName, 12)}${esc(chip.text || '')}</span>`;
}

function txnHtml(tx, state, lang) {
  const cat = getCategory(tx.category);
  const member = state.members.find((item) => item.id === tx.memberId);
  const title = tx.note || tx.ref || (tx.type === 'transfer' ? t('txn.transfer') : categoryName(tx.category, lang));
  const account = tx.type === 'transfer'
    ? `${accountName(tx.account, lang)} → ${accountName(tx.toAccount, lang)}`
    : accountName(tx.account, lang);
  const sub = [
    formatDate(tx.date, 'long', lang),
    tx.type === 'transfer' ? t('txn.transfer') : categoryName(tx.category, lang),
    account,
    member?.name,
  ].filter(Boolean).join(' · ');
  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';
  const emoji = tx.type === 'transfer' ? '🔄' : cat.emoji;
  return `<button class="assistant-txn" type="button" data-action="edit-txn" data-id="${esc(tx.id)}">
    <span class="cat-ic" style="background:${esc(cat.color)}22;color:${esc(cat.color)}">${emoji}</span>
    <span class="assistant-txn-main">
      <span class="assistant-txn-title">${esc(title)}</span>
      <span class="assistant-txn-sub">${esc(sub)}</span>
    </span>
    <span class="assistant-txn-amt ${tx.type === 'transfer' ? 'transfer' : ''}">${sign}${fmtMoney(tx.amount)}</span>
  </button>`;
}

function contactsCard(contacts) {
  return `<div class="card assistant-contacts-card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('assistant.contactsTitle')}</div>
        <div class="card-sub">${t('assistant.contactsSub')}</div>
      </div>
      <span class="badge neutral">${contacts.length}</span>
    </div>

    <form class="assistant-contact-form" id="assistant-contact-form" autocomplete="off">
      <div class="assistant-contact-fields">
        <div class="field">
          <label for="assistant-contact-name">${t('assistant.contactName')}</label>
          <input class="input" id="assistant-contact-name" name="name" type="text" maxlength="60" autocomplete="off" placeholder="${esc(t('assistant.contactNamePh'))}">
        </div>
        <div class="field">
          <label for="assistant-contact-phone">${t('assistant.contactPhone')}</label>
          <input class="input" id="assistant-contact-phone" name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="off" placeholder="${esc(t('assistant.contactPhonePh'))}">
        </div>
      </div>
      <button class="btn soft block" type="submit">${icon('plus', 15)}${t('assistant.contactAdd')}</button>
    </form>

    ${contacts.length ? `<div class="assistant-contact-list">${contacts.map((contact) => `<div class="assistant-contact-row">
      <span class="assistant-contact-avatar">${icon('user', 15)}</span>
      <span class="assistant-contact-info">
        <span class="assistant-contact-name">${esc(contact.name)}</span>
        <span class="assistant-contact-phone">${esc(contact.phone)}</span>
      </span>
      <button class="icon-btn assistant-contact-del" type="button" data-action="assistant-contact-delete" data-id="${esc(contact.id)}" aria-label="${esc(t('assistant.contactDelete'))}" title="${esc(t('assistant.contactDelete'))}">${icon('trash', 14)}</button>
    </div>`).join('')}</div>` : `<div class="assistant-contact-empty">${icon('users', 16)}<span>${t('assistant.contactEmpty')}</span></div>`}

    <div class="assistant-contact-hint">${icon('info', 12)}<span>${t('assistant.contactHint')}</span></div>
  </div>`;
}
