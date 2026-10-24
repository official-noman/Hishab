/* =========================================================
   Hishab — statement import view (PDF / photos / CSV)
   ========================================================= */

import { accountName, categoryName, getCategory } from '../categories.js';
import { icon } from '../components.js';
import { t } from '../i18n.js';
import { esc, fmtMoney } from '../utils.js';

const SOURCES = [
  { id: 'auto', label: 'import.auto' },
  { id: 'bank', label: 'import.bank' },
  { id: 'bkash', label: 'import.bkash' },
];

const TYPES = [
  { id: 'expense', label: 'txn.expense' },
  { id: 'income', label: 'txn.income' },
  { id: 'transfer', label: 'txn.transfer' },
];

export function importView(ctx) {
  const { state, ui, lang } = ctx;
  const imp = ui.import || {};
  const files = ctx.importFiles || [];
  const memberId = imp.memberId || (state.activeMember !== 'all' ? state.activeMember : state.members[0]?.id);
  const preview = imp.preview;
  const rows = preview?.rows || [];
  const included = rows.filter((r) => r.include);
  const dupCount = rows.filter((r) => r.duplicate).length;
  const previewCount = 250;

  return `<section class="section">
    <div class="card" style="background:
      radial-gradient(320px 180px at 100% 0%, rgba(43,217,162,.13), transparent 65%), var(--surface)">
      <div class="row" style="gap:11px;align-items:flex-start">
        <span class="dz-ic" style="margin:0;flex:none">${icon('import', 20)}</span>
        <div class="grow">
          <h2 class="card-title">${t('import.title')}</h2>
          <p class="card-sub" style="margin-top:3px">${t('import.sub')}</p>
        </div>
      </div>

      <div class="import-opts">
        <div class="field">
          <span class="field-label">${t('import.source')}</span>
          <div class="seg">
            ${SOURCES.map((s) => `<button type="button" class="${(imp.sourceHint || 'auto') === s.id ? 'active' : ''}" data-action="import-source" data-source="${s.id}">${t(s.label)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label for="import-member">${t('import.member')}</label>
          <select class="select" id="import-member">
            ${state.members.map((m) => `<option value="${esc(m.id)}" ${m.id === memberId ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="dropzone" data-dropzone="import">
        <div class="dz-ic">${icon('file', 20)}</div>
        <div class="dz-title">${t('import.fileTitle')}</div>
        <div class="dz-sub">${t('import.fileDesc')}</div>
        <div class="mt-10">
          <button class="btn small ghost" type="button" data-action="pick-file">${icon('upload', 14)}${files.length ? t('import.addMore') : t('import.choose')}</button>
        </div>
        <div class="dz-formats">${t('import.formats')}</div>
        <input type="file" id="import-file" multiple accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values,.pdf,application/pdf,image/*" hidden>
      </div>

      ${files.length ? fileList(files) : ''}

      ${imp.busy ? progressCard(imp) : ''}

      <div class="divider"></div>

      <div class="field">
        <label for="import-text">${t('import.pasteTitle')}</label>
        <textarea id="import-text" class="textarea paste-area" spellcheck="false" placeholder="${esc(t('import.pastePh'))}">${esc(imp.text || '')}</textarea>
        <div class="hint">${t('import.pasteDesc')}</div>
      </div>

      <div class="btn-row">
        <button class="btn primary" type="button" data-action="import-analyze" ${imp.busy ? 'disabled' : ''}>${imp.busy ? t('import.analyzing') : t('import.analyze')}</button>
        <button class="btn" type="button" data-action="import-sample" ${imp.busy ? 'disabled' : ''}>${t('import.sample')}</button>
        <button class="btn ghost" type="button" data-action="import-clear" ${imp.busy ? 'disabled' : ''}>${t('import.clear')}</button>
      </div>
    </div>
  </section>

  ${preview ? previewCard(preview, rows.slice(0, previewCount), included, dupCount, rows.length, lang) : ''}

  ${imp.error ? `<section class="section"><div class="alert">${icon('alert', 14)}<span>${esc(imp.error)}</span></div></section>` : ''}
  ${imp.notice ? `<section class="section"><div class="alert info">${icon('info', 14)}<span>${esc(imp.notice)}</span></div></section>` : ''}

  <section class="section card">
    <div class="card-head">
      <div class="card-title">${t('import.howTitle')}</div>
      <span style="color:var(--faint)">${icon('info', 15)}</span>
    </div>
    <div class="insights">
      <div class="insight"><span class="ins-ic">${icon('file', 13)}</span><span>${t('import.how1')}</span></div>
      <div class="insight"><span class="ins-ic">${icon('copy', 13)}</span><span>${t('import.how2')}</span></div>
      <div class="insight"><span class="ins-ic good">${icon('check', 13)}</span><span>${t('import.how3')}</span></div>
    </div>
    <div class="mt-10"><div class="alert info">${icon('lock', 14)}<span>${t('import.privacy')}</span></div></div>
    <div class="mt-10"><div class="alert info">${icon('refresh', 14)}<span>${t('import.transferNote')}</span></div></div>
  </section>
  <div class="footer-note">${t('app.footer')}</div>`;
}

function fileList(files) {
  return `<div class="file-list">
    <div class="file-list-head">
      <span>${t('import.filesSelected', { n: files.length })}</span>
      <button class="icon-text" type="button" data-action="import-file-clear">${t('import.removeAll')}</button>
    </div>
    ${files.map((file) => `<div class="file-item ${file.error ? 'bad' : ''}">
      <span class="file-badge ${esc(file.kind)}">${esc(file.badge)}</span>
      <div class="file-main">
        <div class="file-name">${esc(file.name)}</div>
        <div class="file-meta">${esc(file.meta)}${file.error ? ` • ${esc(file.error)}` : ''}</div>
      </div>
      <button class="file-del" type="button" data-action="import-file-remove" data-id="${esc(file.id)}" aria-label="${esc(t('import.removeFile'))}">${icon('close', 13)}</button>
    </div>`).join('')}
  </div>`;
}

function progressCard(imp) {
  const pct = Math.max(0, Math.min(100, Number(imp.progress?.pct) || 0));
  return `<div class="import-progress">
    <div class="progress-top">
      <span id="import-progress-label">${esc(imp.progress?.label || t('import.reading'))}</span>
      <span id="import-progress-pct">${pct}%</span>
    </div>
    <div class="progress-track"><i id="import-progress-bar" style="width:${pct}%"></i></div>
    <div class="hint" style="margin-top:7px">${t('import.ocrNote')}</div>
  </div>`;
}

function previewCard(preview, visibleRows, included, dupCount, totalRows, lang) {
  const total = included.reduce((sum, r) => sum + r.amount, 0);
  const sourceLabel = preview.sources?.length > 1
    ? t('import.mixed')
    : preview.source === 'bkash' ? t('import.bkash') : preview.source === 'image' ? t('import.photo') : t('import.bank');

  return `<section class="section card preview-card">
    <div class="card-head">
      <div>
        <div class="card-title">${t('import.preview')}</div>
        <div class="card-sub">${t('import.previewDesc', { n: included.length })} ${dupCount ? `• ${t('import.previewDup', { n: dupCount })}` : ''}</div>
      </div>
      <span class="badge good">${icon('check', 11)}${esc(sourceLabel)}</span>
    </div>
    <div class="pv-summary">
      <span class="badge neutral">${t('import.detected', { src: sourceLabel, n: totalRows })}</span>
      ${dupCount ? `<span class="badge warn">${t('import.previewDup', { n: dupCount })}</span>` : ''}
      <button class="icon-text" type="button" data-action="import-toggle-all">${t('import.selectAll')}</button>
    </div>

    <div class="pv-list">
      ${visibleRows.map((row) => previewRow(row, lang)).join('')}
    </div>
    ${totalRows > visibleRows.length ? `<div class="hint">${t('import.rowsMore', { n: totalRows - visibleRows.length })}</div>` : ''}

    <div class="import-foot">
      <div>
        <div style="font-size:9.5px;color:var(--faint)">${t('import.totalSelected', { n: included.length })}</div>
        <div class="amt-total">${fmtMoney(total)}</div>
      </div>
      <button class="btn primary" type="button" data-action="import-confirm" ${included.length ? '' : 'disabled'}>
        ${icon('check', 15)} ${t('import.confirm', { n: included.length })}
      </button>
    </div>
  </section>`;
}

function previewRow(row, lang) {
  const cat = getCategory(row.category);
  const sign = row.type === 'income' ? '+' : row.type === 'expense' ? '-' : '';
  const amountClass = row.type === 'income' ? 'pos' : row.type === 'transfer' ? 'faint' : '';
  const accountLabel = row.type === 'transfer' && row.toAccount
    ? t('txn.transferFromTo', {
      from: accountName(row.account, lang),
      to: accountName(row.toAccount, lang),
    })
    : accountName(row.account, lang);
  return `<div class="pv-row ${row.duplicate ? 'dup' : ''}">
    <input class="pv-check" type="checkbox" data-change="import-include" data-index="${row.index}" ${row.include ? 'checked' : ''} aria-label="${t('import.include')}">
    <div class="pv-main">
      <div class="pv-desc">${esc(row.description || categoryName(row.category, lang))}</div>
      <div class="pv-meta">
        <span>${esc(row.date)}</span>
        <span>•</span>
        <span>${cat.emoji} ${esc(categoryName(row.category, lang))}</span>
        <span>•</span>
        <span>${esc(accountLabel)}</span>
        ${row.duplicate ? `<span class="tag">${esc(t('import.dupe'))}</span>` : ''}
      </div>
    </div>
    <div class="pv-right">
      <div class="pv-amt ${amountClass}">${sign}${fmtMoney(row.amount)}</div>
      <select class="pv-type" data-change="import-type" data-index="${row.index}" aria-label="${t('import.showType')}">
        ${TYPES.map((ty) => `<option value="${ty.id}" ${row.type === ty.id ? 'selected' : ''}>${t(ty.label)}</option>`).join('')}
      </select>
    </div>
  </div>`;
}
