/* =========================================================
   Hishab — settings / more view
   ========================================================= */

import { ACCOUNT_IDS, accountName } from '../categories.js';
import { accountSummary } from '../analytics.js';
import { avatar, badge, brandMark, icon } from '../components.js';
import { t } from '../i18n.js';
import {
  esc, fmtMoney, formatRangeLabel,
} from '../utils.js';
import { APP_VERSION, formatBytes, stateSizeBytes } from '../store.js';

export function moreView(ctx) {
  const { state, ui, range, lang, install, undo } = ctx;
  const summary = accountSummary(state);
  const size = formatBytes(stateSizeBytes(state));
  const rangeLabel = ui.preset === 'all'
    ? t('preset.all')
    : formatRangeLabel(range.from, range.to, lang);
  const txnCount = state.txns.length;

  return `<section class="section">
      <div class="profile-card">
        <div class="profile-avatar">${brandMark()}</div>
        <div class="grow">
          <div class="profile-name">${t('app.name')}</div>
          <div class="profile-sub">${esc(t('more.membersCount', { n: state.members.length, m: txnCount }))}</div>
          <div class="profile-sub">${esc(t('more.dataSummary', { n: txnCount, size }))}</div>
        </div>
        <span class="badge neutral">v${esc(APP_VERSION)}</span>
      </div>
    </section>

    <section class="set-section">
      <div class="set-title">${t('assistant.title')}</div>
      <div class="set-card">
        <div class="set-row">
          <div class="set-left">
            <span class="set-ic">${icon('sparkles', 15)}</span>
            <div>
              <div class="set-label">${t('assistant.open')}</div>
              <div class="set-sub">${esc(t('assistant.moreSub', { n: (state.contacts || []).length }))}</div>
            </div>
          </div>
          <a class="btn small soft" href="#/assistant">${icon('chat', 14)}${t('assistant.openBtn')}</a>
        </div>
      </div>
    </section>

    <section class="set-section">
      <div class="set-title">${t('more.members')}</div>
      <div class="set-card">
        ${state.members.map((m) => memberRow(m, state, lang)).join('')}
        <div class="set-row">
          <button class="icon-text" type="button" data-action="member-new">${icon('plus', 14)}${t('more.addMember')}</button>
          <span class="hint" style="margin:0">${t('more.membersDesc')}</span>
        </div>
      </div>
    </section>

    <section class="set-section">
      <div class="set-title">${t('more.budget')}</div>
      <div class="set-card">
        <div class="set-row">
          <div class="set-left">
            <span class="set-ic">${icon('target', 15)}</span>
            <div>
              <div class="set-label">${t('more.budget')}</div>
              <div class="set-sub">${t('more.budgetDesc')}</div>
            </div>
          </div>
          <button class="btn small ${state.settings.budget ? 'soft' : 'ghost'}" type="button" data-action="open-budget">
            ${state.settings.budget ? fmtMoney(state.settings.budget) : t('budget.set')}
          </button>
        </div>
      </div>
    </section>

    <section class="set-section">
      <div class="set-title">${t('more.accounts')}</div>
      <div class="set-card">
        <div class="set-row">
          <div class="set-left">
            <span class="set-ic">${icon('wallet', 15)}</span>
            <div>
              <div class="set-label">${t('more.accounts')}</div>
              <div class="set-sub">${t('more.accountsDesc')}</div>
            </div>
          </div>
          <button class="btn small ghost" type="button" data-action="open-accounts">${icon('edit', 14)}${t('common.edit')}</button>
        </div>
        <div class="acct-grid" style="padding:0 0 13px">
          ${ACCOUNT_IDS.map((id) => {
            const opening = state.accounts[id]?.opening || 0;
            const current = summary.accounts[id]?.balance || 0;
            const color = id === 'bank' ? '#7C9CFF' : id === 'bkash' ? '#FF5C8A' : '#2BD9A2';
            const ic = id === 'bank' ? 'bank' : id === 'bkash' ? 'phone' : 'cash';
            return `<div class="acct">
              <div class="acct-top"><span class="acct-dot" style="background:${color}"></span>${icon(ic, 11)} ${esc(accountName(id, lang))}</div>
              <div class="acct-val ${opening < 0 ? 'neg' : ''}">${fmtMoney(opening)}</div>
              <div class="acct-sub ${current < 0 ? 'neg' : ''}">${t('acct.current')}: <span class="nowrap">${fmtMoney(current)}</span></div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </section>

    <section class="set-section">
      <div class="set-title">${t('more.appearance')}</div>
      <div class="set-card">
        <div class="set-row">
          <div class="set-left">
            <span class="set-ic">${icon(state.settings.theme === 'dark' ? 'moon' : 'sun', 15)}</span>
            <div>
              <div class="set-label">${t('more.theme')}</div>
              <div class="set-sub">${state.settings.theme === 'dark' ? t('more.dark') : t('more.light')}</div>
            </div>
          </div>
          <div class="lang-toggle">
            <button type="button" class="${state.settings.theme === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark">${t('more.dark')}</button>
            <button type="button" class="${state.settings.theme === 'light' ? 'active' : ''}" data-action="set-theme" data-theme="light">${t('more.light')}</button>
          </div>
        </div>
        <div class="set-row">
          <div class="set-left">
            <span class="set-ic">${icon('calendar', 15)}</span>
            <div>
              <div class="set-label">${t('report.period')}</div>
              <div class="set-sub">${esc(t('more.rangeInfo', { range: rangeLabel }))}</div>
            </div>
          </div>
          <button class="icon-text" type="button" data-action="open-range">${icon('chevronRight', 15)}</button>
        </div>
      </div>
    </section>

    <section class="set-section">
      <div class="set-title">${t('more.data')}</div>
      <div class="set-card">
        ${undo ? dataRow({
          iconName: 'undo',
          label: t('more.undo'),
          sub: undo.label ? t('undo.last', { label: undo.label }) : t('more.undoDesc'),
          action: 'undo-last',
          actionLabel: t('more.undoBtn'),
        }) : ''}
        ${dataRow({
          iconName: 'download', label: t('more.export'), sub: t('more.exportDesc'),
          action: 'export-backup', actionLabel: t('common.download'),
        })}
        ${dataRow({
          iconName: 'upload', label: t('more.backup'), sub: t('more.backupDesc'),
          action: 'restore-backup', actionLabel: t('common.add'),
        })}
        ${dataRow({
          iconName: 'sparkles', label: t('more.demo'), sub: t('more.demoDesc'),
          action: 'load-demo-sheet', actionLabel: t('common.start'),
        })}
        ${dataRow({
          iconName: 'trash', label: t('more.clear'), sub: t('more.clearDesc'),
          action: 'clear-sheet', actionLabel: t('common.delete'), danger: true,
        })}
      </div>
      <div class="hint" style="padding:0 4px">${t('more.backupHint')} · ${esc(t('more.dataSummary', { n: txnCount, size }))}</div>
    </section>

    <section class="section" style="margin-top:14px">
      ${installCard(install, lang)}
      <div class="privacy">${icon('shield', 15)}<span>${t('more.privacy')}</span></div>
      <div class="version">
        ${t('more.version', { v: APP_VERSION })}<br>
        ${t('more.made')}
      </div>
    </section>`;
}

function memberRow(member, state, lang) {
  const count = state.txns.filter((tx) => tx.memberId === member.id).length;
  const total = state.txns
    .filter((tx) => tx.memberId === member.id && tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const active = state.activeMember === member.id;

  return `<div class="member-manage">
    ${avatar(member)}
    <button class="mm-main" type="button" data-action="member-edit" data-id="${esc(member.id)}">
      <div class="mm-name">${esc(member.name)} ${active ? `<span class="tag">${t('member.current')}</span>` : ''}</div>
      <div class="mm-sub">${esc(t('member.txns', { n: count }))} · ${esc(t('member.total'))} ${fmtMoney(total)}</div>
    </button>
    <button class="icon-text" type="button" data-action="member-select" data-id="${esc(member.id)}" aria-label="${esc(t('member.switch'))}">
      ${active ? icon('check', 15) : icon('users', 15)}
    </button>
    <button class="icon-text" type="button" data-action="member-edit" data-id="${esc(member.id)}" aria-label="${esc(t('common.edit'))}">
      ${icon('edit', 14)}
    </button>
  </div>`;
}

function dataRow({ iconName, label, sub, action, actionLabel, danger = false }) {
  return `<div class="set-row">
    <div class="set-left">
      <span class="set-ic" style="${danger ? 'color:var(--expense)' : ''}">${icon(iconName, 15)}</span>
      <div>
        <div class="set-label" style="${danger ? 'color:var(--expense)' : ''}">${esc(label)}</div>
        <div class="set-sub">${esc(sub)}</div>
      </div>
    </div>
    <button class="btn small ${danger ? 'danger' : 'ghost'} set-control" type="button" data-action="${action}" aria-label="${esc(actionLabel)}">
      ${icon(iconName === 'download' ? 'download' : iconName === 'upload' ? 'upload' : iconName === 'trash' ? 'trash' : iconName === 'undo' ? 'undo' : 'chevronRight', 14)}
      ${esc(actionLabel)}
    </button>
  </div>`;
}

function installCard(install = {}, lang) {
  const installed = Boolean(install.installed);
  return `<div class="install-card">
    <div class="row" style="align-items:flex-start;gap:10px">
      <span class="ic">${icon(installed ? 'check' : 'install', 18)}</span>
      <div class="grow">
        <div class="install-title">${t('more.install')}</div>
        <div class="install-desc">${installed ? t('more.installed') : (install.ios ? t('more.installIos') : t('more.installDesc'))}</div>
      </div>
      ${installed
        ? badge(t('more.installed'), 'good', 'check')
        : `<button class="btn small primary" type="button" data-action="install-app">${icon('install', 14)}${t('more.installBtn')}</button>`}
    </div>
    ${installed ? '' : `<div class="install-desc" style="margin-top:9px">${t('more.installOffline')}</div>`}
  </div>`;
}
