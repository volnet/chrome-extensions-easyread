import '../scripts/diagnostics.js';
import * as easyReadTools from '../scripts/easyReadTools.js';
import { initializeTabs } from '../scripts/ui.js';
import { initializeRecords } from '../records/recordsView.js';
await globalThis.EasyReadLocale?.ready;

const message = easyReadTools.getMessageForLocales;
async function notesCommand(action, data = {}) {
  const result = await chrome.runtime.sendMessage({ command: 'easyreadNotes', action, ...data });
  if (!result || result.error) throw new Error(result?.error || message('ui_operation_failed'));
  return result;
}
await notesCommand('all');
const languageSelect = document.getElementById('uiLanguage');
chrome.storage.local.get('uiLanguage').then(data => { languageSelect.value = ['en', 'zh-CN'].includes(data.uiLanguage) ? data.uiLanguage : 'auto'; });
languageSelect.addEventListener('change', () => run(async () => {
  await chrome.storage.local.set({ uiLanguage: languageSelect.value });
  location.reload();
}, languageSelect));
const output = document.getElementById('output');
let busy = false;
let readLaterPage = 1;
let readLaterItems = [];
let completedItems = [], completedPage = 1;
const UNREAD_PAGE_SIZE = 10, COMPLETED_PAGE_SIZE = 100;
function readLaterCheckbox(item) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'readLaterCheckbox';
  checkbox.disabled = busy;
  checkbox.checked = item.status === easyReadTools.READ_STATUS_READED;
  checkbox.setAttribute('aria-label', `${message(checkbox.checked ? 'read_later_unread' : 'read_later_completed')}: ${item.title || item.url || item.key}`);
  checkbox.addEventListener('change', () => run(async () => {
    const checked = checkbox.checked;
    await easyReadTools.updateStorageJsonData('readLaters', data => {
      const items = data.readLaters || [];
      const target = items.find(entry => (entry.key || entry.url) === (item.key || item.url)
        && entry.createDateTime === item.createDateTime && entry.status === item.status);
      if (!target) throw new Error(message('ui_operation_failed'));
      target.status = checked ? easyReadTools.READ_STATUS_READED : easyReadTools.READ_STATUS_UNREAD;
      if (checked) target.endReadDateTime = Date.now();
      else delete target.endReadDateTime;
      return { status: easyReadTools.UPDATE_STATUS_YES, value: items };
    });
    await refreshSettingsReadLater();
    easyReadTools.updateBudgeText();
  }, checkbox));
  return checkbox;
}
function renderCompletedReadLater() {
  document.getElementById('readLaterCompletedTitle').textContent = `${message('read_later_completed')} (${completedItems.length})`;
  const total = Math.max(1, Math.ceil(completedItems.length / COMPLETED_PAGE_SIZE));
  completedPage = Math.min(completedPage, total);
  const list = document.getElementById('settingsReadLaterCompletedList');
  list.replaceChildren();
  for (const item of document.getElementById('readLaterCompleted').open ? completedItems.slice((completedPage - 1) * COMPLETED_PAGE_SIZE, completedPage * COMPLETED_PAGE_SIZE) : []) {
    const row = document.createElement('li'), url = item.url || item.key || '';
    const title = document.createElement(easyReadTools.isSupportedScheme(url) ? 'a' : 'strong');
    title.textContent = item.title || url;
    if (title.tagName === 'A') { title.href = url; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
    const address = document.createElement('small'); address.textContent = url;
    const content = document.createElement('div'); content.className = 'readLaterItemContent'; content.append(title, address);
    row.append(readLaterCheckbox(item), content); list.append(row);
  }
  document.getElementById('readLaterCompletedEmpty').hidden = completedItems.length > 0;
  document.getElementById('readLaterCompletedPagination').hidden = !completedItems.length;
  document.getElementById('readLaterCompletedCount').textContent = message('setting_read_later_count', [String(completedItems.length), String(completedPage), String(total)]);
  document.getElementById('readLaterCompletedPrevious').disabled = completedPage === 1;
  document.getElementById('readLaterCompletedNext').disabled = completedPage === total;
}
document.getElementById('readLaterCompleted').addEventListener('toggle', renderCompletedReadLater);
document.getElementById('readLaterCompletedPagination').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
document.getElementById('readLaterCompletedPrevious').onclick = () => { completedPage = Math.max(1, completedPage - 1); renderCompletedReadLater(); };
document.getElementById('readLaterCompletedNext').onclick = () => { completedPage++; renderCompletedReadLater(); };
let readLaterRevision = 0;
function renderSettingsReadLater() {
  renderCompletedReadLater();
  const totalPages = Math.max(1, Math.ceil(readLaterItems.length / UNREAD_PAGE_SIZE));
  readLaterPage = Math.min(readLaterPage, totalPages);
  const list = document.getElementById('settingsReadLaterList');
  const fragment = document.createDocumentFragment();
  for (const item of readLaterItems.slice((readLaterPage - 1) * UNREAD_PAGE_SIZE, readLaterPage * UNREAD_PAGE_SIZE)) {
    const row = document.createElement('li');
    const url = item.url || item.key || '';
    const valid = easyReadTools.isSupportedScheme(url);
    const title = document.createElement(valid ? 'a' : 'strong');
    title.textContent = item.title || url;
    if (valid) { title.href = url; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
    const address = document.createElement('small'); address.textContent = url;
    const content = document.createElement('div'); content.className = 'readLaterItemContent'; content.append(title, address);
    row.append(readLaterCheckbox(item), content); fragment.append(row);
  }
  list.replaceChildren(fragment);
  document.getElementById('settingsReadLaterEmpty').hidden = readLaterItems.length > 0;
  document.getElementById('readLaterPagination').hidden = readLaterItems.length === 0;
  document.getElementById('readLaterCount').textContent = message('setting_read_later_count', [String(readLaterItems.length), String(readLaterPage), String(totalPages)]);
  document.getElementById('readLaterPrevious').disabled = readLaterPage === 1;
  document.getElementById('readLaterNext').disabled = readLaterPage === totalPages;
}
async function refreshSettingsReadLater() {
  const revision = ++readLaterRevision;
  const data = await chrome.storage.local.get(easyReadTools.READ_LATERS_NAME);
  if (revision !== readLaterRevision) return;
  readLaterItems = (Array.isArray(data.readLaters) ? data.readLaters : []).filter(item => item && [undefined, easyReadTools.READ_STATUS_UNREAD, easyReadTools.READ_STATUS_READING].includes(item.status));
  completedItems = (Array.isArray(data.readLaters) ? data.readLaters : []).filter(item => item?.status === easyReadTools.READ_STATUS_READED);
  renderSettingsReadLater();
}
document.getElementById('readLaterPrevious').addEventListener('click', () => { readLaterPage = Math.max(1, readLaterPage - 1); renderSettingsReadLater(); });
document.getElementById('readLaterNext').addEventListener('click', () => { readLaterPage++; renderSettingsReadLater(); });

function notify(text, error = false) {
  output.hidden = false;
  output.textContent = text;
  output.dataset.state = error ? 'error' : 'success';
}
async function run(action, button) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('.settingsPanel button, .settingsPanel input, .settingsPanel textarea, .settingsPanel select')].map(control => [control, control.disabled]);
  controls.forEach(([control]) => { control.disabled = true; });
  if (button) button.disabled = true;
  try { await action(); }
  catch (error) {
    const fallback = message('ui_operation_failed');
    notify(error.message && error.message !== fallback ? `${fallback} ${error.message}` : fallback, true);
    globalThis.EasyReadDiagnostics?.record(error, { source: 'settings' }, output);
  } finally {
    busy = false;
    controls.forEach(([control, disabled]) => { control.disabled = disabled; });
    if (button) button.disabled = false;
    // Data may have changed while controls were locked; do not restore stale pager states.
    renderSettingsReadLater();
  }
}
let historyInitialized = false;
initializeTabs('.settingsTab', tab => {
  document.querySelectorAll('.settingsTab').forEach(item => item.classList.toggle('isActive', item === tab));
  document.querySelectorAll('.settingsPanel').forEach(panel => { panel.hidden = panel.id !== tab.dataset.panel; });
  if (tab.dataset.panel === 'dataPanel' && !historyInitialized) {
    historyInitialized = true;
    initializeRecords(document.getElementById('dataPanel'));
  }
});
const highlightsToggle = document.getElementById('settingHighlightsEnabled');
const annotationAuthorInput = document.getElementById('annotationAuthor');
const diagnosticsToggle = document.getElementById('diagnosticsEnabled');
const screenshotFormat = document.getElementById('screenshotFormat');
const mediaAutoplay = document.getElementById('mediaAutoplay');
const mediaMuted = document.getElementById('mediaMuted');
for (const control of [mediaAutoplay, mediaMuted]) control.addEventListener('change', () => run(async () => {
  try { await chrome.storage.local.set({ [control.id]: control === mediaMuted ? control.checked : control.value }); }
  catch (error) { await refreshPreferences(); throw error; }
}, control));
const diagnostics = globalThis.EasyReadDiagnosticStore;
async function refreshPreferences() {
  const media = await chrome.storage.local.get(['mediaAutoplay', 'mediaMuted']);
  mediaAutoplay.value = ['sequential', 'simultaneous'].includes(media.mediaAutoplay) ? media.mediaAutoplay : 'off';
  mediaMuted.checked = media.mediaMuted !== false;
  const stored = await chrome.storage.local.get([easyReadTools.HIGHLIGHTS_ENABLED_NAME, easyReadTools.ANNOTATION_AUTHOR_NAME, 'diagnosticsEnabled', 'captureImageFormat']);
  highlightsToggle.checked = stored[easyReadTools.HIGHLIGHTS_ENABLED_NAME] !== false;
  annotationAuthorInput.value = stored[easyReadTools.ANNOTATION_AUTHOR_NAME] ?? '';
  diagnosticsToggle.checked = stored.diagnosticsEnabled === true;
  screenshotFormat.value = stored.captureImageFormat === 'jpeg' ? 'jpeg' : 'png';
}
run(refreshPreferences);
diagnosticsToggle.addEventListener('change', () => run(async () => {
  try { await chrome.storage.local.set({ diagnosticsEnabled: diagnosticsToggle.checked }); }
  catch (error) { diagnosticsToggle.checked = !diagnosticsToggle.checked; throw error; }
}, diagnosticsToggle));
screenshotFormat.addEventListener('change', () => run(async () => {
  try { await chrome.storage.local.set({ captureImageFormat: screenshotFormat.value }); }
  catch (error) { await refreshPreferences(); throw error; }
}, screenshotFormat));
let reportRevision = 0;
async function refreshDiagnostics() {
  const revision = ++reportRevision;
  const data = await chrome.storage.local.get([diagnostics.storageKey, diagnostics.preferenceKey]);
  if (revision !== reportRevision) return;
  diagnosticsToggle.checked = data[diagnostics.preferenceKey] === true;
  const reports = Array.isArray(data[diagnostics.storageKey]) ? data[diagnostics.storageKey] : [];
  document.getElementById('diagnosticsCount').textContent = message('diagnostics_count', [String(reports.length)]);
  document.getElementById('diagnosticsEmpty').hidden = reports.length !== 0;
  const list = document.getElementById('diagnosticsList');
  list.replaceChildren();
  for (const report of [...reports].reverse()) {
    const row = document.createElement('li');
    const summary = document.createElement('div'); summary.className = 'diagnosticSummary';
    const title = document.createElement('strong'); title.textContent = report.error?.message || report.context?.operation || 'Error';
    const details = document.createElement('small');
    const date = new Date(report.at);
    details.textContent = [Number.isNaN(date.getTime()) ? report.at : date.toLocaleString(), report.page?.title, report.sender?.url || report.page?.url].filter(Boolean).join(' · ');
    summary.append(title, details);
    const download = document.createElement('button'); download.type = 'button'; download.className = 'secondaryButton';
    download.textContent = message('diagnostics_download');
    download.addEventListener('click', () => run(() => diagnostics.download([report]), download));
    row.append(summary, download); list.append(row);
  }
}
document.getElementById('clearDiagnostics').addEventListener('click', event => run(async () => {
  const result = await chrome.runtime.sendMessage({ command: 'easyreadDiagnosticClear' });
  if (!result?.ok) throw new Error(result?.error || message('ui_operation_failed'));
  await refreshDiagnostics();
}, event.currentTarget));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[easyReadTools.READ_LATERS_NAME]) refreshSettingsReadLater().catch(error => notify(error.message, true));
  if (changes.captureImageFormat) screenshotFormat.value = changes.captureImageFormat.newValue === 'jpeg' ? 'jpeg' : 'png';
  if (changes.mediaAutoplay || changes.mediaMuted) run(refreshPreferences);
  if (changes[diagnostics.storageKey] || changes[diagnostics.preferenceKey]) refreshDiagnostics().catch(error => notify(error.message, true));
});
refreshDiagnostics().catch(error => notify(error.message, true));
function openSettingsSection() {
  if (location.hash !== '#diagnostics') return;
  document.getElementById('setting_tab_general').click();
  const section = document.getElementById('diagnosticsSection');
  section.scrollIntoView({ block: 'start' });
  section.focus({ preventScroll: true });
}
window.addEventListener('hashchange', openSettingsSection);
highlightsToggle.addEventListener('change', () => run(async () => {
  try {
    await chrome.storage.local.set({ [easyReadTools.HIGHLIGHTS_ENABLED_NAME]: highlightsToggle.checked });
    notify(message(highlightsToggle.checked ? 'popup_page_highlights_enabled' : 'popup_page_highlights_disabled'));
  } catch (error) { highlightsToggle.checked = !highlightsToggle.checked; throw error; }
}, highlightsToggle));
document.getElementById('authorForm').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    await chrome.storage.local.set({ [easyReadTools.ANNOTATION_AUTHOR_NAME]: annotationAuthorInput.value.trim() });
    notify(message('setting_page_annotationAuthorSaved'));
  }, document.getElementById('btnSaveAnnotationAuthor'));
});

for (const [id, key] of [
  ['btnDownloadReadLatersAsJson', easyReadTools.READ_LATERS_NAME],
  ['btnDownloadNotesAsJson', easyReadTools.NOTES_NAME],
  ['btnDownloadStorageAsJson', null]
]) {
  const button = document.getElementById(id);
  button.addEventListener('click', () => run(async () => {
    const data = await chrome.storage.local.get(key);
    easyReadTools.exportToJsonFile(data, `EasyRead-${key || 'Storage'}-${easyReadTools.getNowDateTimeString()}.json`);
    output.hidden = true;
  }, button));
}
for (const [id, key, success] of [
  ['btnRemoveAllRecords', easyReadTools.ALL_RECORDS_NAME, 'setting_page_allRecordsRemoved'],
  ['btnRemoveReadLaters', easyReadTools.READ_LATERS_NAME, 'setting_page_readLatersRemoved'],
  ['btnRemoveNotes', easyReadTools.NOTES_NAME, 'setting_page_notesRemoved'],
  ['btnDropStorage', null, 'setting_page_storageDroped']
]) {
  const button = document.getElementById(id);
  button.addEventListener('click', () => run(async () => {
    const scope = key === easyReadTools.ALL_RECORDS_NAME ? message('setting_browsing_history') : key === easyReadTools.READ_LATERS_NAME ? message('popup_tab_read_later') : key === easyReadTools.NOTES_NAME ? message('setting_page_notice_notes') : null;
    if (!window.confirm(message('ui_confirm_remove', [scope ? message('setting_remove_scope', [scope]) : button.textContent]))) return;
    if (key === easyReadTools.NOTES_NAME) await notesCommand('clearAll');
    else if (key) await chrome.storage.local.remove(key);
    else await chrome.storage.local.clear();
    await refreshPreferences();
    easyReadTools.updateBudgeText();
    notify(message(success));
  }, button));
}
document.getElementById('btnDownloadNotesAsMarkdown').addEventListener('click', event => run(async () => {
  const data = await chrome.storage.local.get(easyReadTools.NOTES_NAME);
  const files = easyReadTools.convertNotesToMarkdownFiles(data[easyReadTools.NOTES_NAME],
    document.getElementById('txtMarkdownTemplate').value, document.getElementById('txtMarkdownNotesSectionTemplate').value);
  if (!files.length) { notify(message('popup_page_message_no_notes')); return; }
  const zip = new JSZip();
  const names = new Set();
  for (const [index, file] of files.entries()) {
    const name = names.has(file.name) ? file.name.replace(/\.md$/, `-${index + 1}.md`) : file.name;
    names.add(name);
    zip.file(name, file.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `EasyRead-notes-${easyReadTools.getNowDateTimeString()}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  output.hidden = true;
}, event.currentTarget));
for (const [id, replace] of [['btnMergeStorageJson', false], ['btnReplaceStorageJson', true]]) {
  const button = document.getElementById(id);
  button.addEventListener('click', () => run(async () => {
    const file = document.getElementById('fileInputStorageJson').files[0];
    if (!file) { notify(message('setting_page_fileInputNofiles'), true); return; }
    const data = JSON.parse(await file.text());
    if (replace && !window.confirm(message('ui_confirm_replace'))) return;
    await notesCommand('import', { data, replace });
    await refreshPreferences();
    easyReadTools.updateBudgeText();
    notify(message(replace ? 'setting_page_storageReplacedSuccessfully' : 'setting_page_storageMergedSuccessfully'));
  }, button));
}
const labels = {
  btnDownloadReadLatersAsJson: 'allrecords_export',
  readLaterEmptyTitle: 'setting_read_later_empty', readLaterEmptyHint: 'setting_read_later_empty_hint', readLaterPrevious: 'allrecords_page_previous', readLaterNext: 'allrecords_page_next',
  languageLabel: 'setting_language', languageAuto: 'setting_language_auto',
  historyTitle: 'setting_browsing_history', setting_tab_read_later_list: 'popup_tab_read_later',
  settingHighlightsTitle: 'popup_page_show_highlights',
  settingHighlightsDescription: 'setting_page_highlights_description',
  annotationAuthorLabel: 'setting_page_annotationAuthorLabel',
  btnSaveAnnotationAuthor: 'setting_page_btnSaveAnnotationAuthor',
  markdownTemplateTitle: 'ui_markdown_template',
  markdownPageLabel: 'ui_markdown_page_template',
  markdownNoteLabel: 'ui_markdown_note_template',
  backupDescription: 'ui_backup_description',
  importTitle: 'ui_import_title',
  importFileLabel: 'ui_import_file',
  clearDescription: 'ui_clear_description', setting_tab_data: 'setting_browsing_history',
  setting_tab_read_later: 'popup_tab_read_later', setting_tab_save_page: 'popup_tab_save_page', setting_tab_media: 'popup_tab_media',
  diagnosticsTitle: 'diagnostics_title', diagnosticsDescription: 'diagnostics_description',
  diagnosticsEmpty: 'diagnostics_empty', clearDiagnostics: 'diagnostics_clear',
  screenshotSettingsTitle: 'capture_png_title', screenshotFormatLabel: 'screenshot_format_label',
  screenshotFormatDescription: 'screenshot_format_description', mediaSettingsDescription: 'media_settings_description',
  mediaAutoplayLabel: 'media_autoplay', mediaAutoplayOff: 'media_autoplay_off', mediaAutoplaySequential: 'media_autoplay_sequential', mediaAutoplaySimultaneous: 'media_autoplay_simultaneous', mediaMutedLabel: 'media_muted',
  readLaterUnreadTitle: 'read_later_unread', readLaterCompletedEmpty: 'read_later_completed_empty', readLaterCompletedPrevious: 'allrecords_page_previous', readLaterCompletedNext: 'allrecords_page_next'
};
for (const element of document.querySelectorAll('[id]')) {
  const key = labels[element.id] || (element.id.startsWith('setting_') ? element.id : element.id.startsWith('btn') ? 'setting_page_' + element.id : null);
  if (key) element.textContent = message(key);
}
document.title = message('setting_page_title');
document.getElementById('setting_tab_data').setAttribute('aria-label', message('setting_records_parent'));
refreshSettingsReadLater().catch(error => notify(error.message, true));
openSettingsSection();
