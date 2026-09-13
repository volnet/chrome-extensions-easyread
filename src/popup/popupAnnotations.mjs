import { sendPageMessage } from '../scripts/pageConnection.mjs';
let getTab, notify, revision = 0;
const t = key => (globalThis.EasyReadLocale || chrome.i18n).getMessage(key);
async function request(command, data = {}) {
  const tab = await getTab();
  if (!tab) throw new Error(t('popup_page_message_records_not_supported'));
  const result = await sendPageMessage(tab.id, { command, ...data });
  if (result?.error) throw new Error(result.error);
  return result;
}
function action(key, callback) {
  const button = document.createElement('button'); button.textContent = t(key);
  button.onclick = () => Promise.resolve(callback()).catch(error => notify(error.message));
  return button;
}
export function initializePopupAnnotations(resolveTab, showError) {
  getTab = resolveTab; notify = showError;
  const panel = document.getElementById('panelAnnotations');
  panel.replaceChildren();
  const surface = document.createElement('aside'); surface.id = 'easyread-annotation-sidebar'; surface.dataset.easyreadUi = 'true';
  const header = document.createElement('header'); header.className = 'easyread-annotation-header';
  const title = document.createElement('strong'); title.textContent = t('annotation_sidebar_title');
  const toolbar = document.createElement('div'); toolbar.className = 'easyread-annotation-toolbar';
  const icon = globalThis.EasyReadAnnotationView.createIconButton;
  const download = icon('easyread-annotation-download', t('annotation_sidebar_download'), `<img src="${chrome.runtime.getURL('assets/download-file.png')}" alt="">`);
  download.onclick = () => request('downloadPopupAnnotations').catch(error => notify(error.message));
  const dock = icon('', t('annotation_move_sidebar'), '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M7 12h5m-2-2 2 2-2 2"/></svg>'); dock.id = 'annotationDock';
  dock.onclick = async () => {
    const editor = panel.querySelector('textarea');
    if (editor) { editor.focus(); return; }
    try { if ((await request('showAnnotationSidebar'))?.visible) window.close(); }
    catch (error) { notify(error.message); }
  };
  toolbar.append(download, dock); header.append(title, toolbar);
  const list = document.createElement('div'); list.id = 'popupAnnotationList'; list.className = 'easyread-annotation-list';
  const pageNote = document.createElement('button');
  pageNote.className = 'easyread-page-note-add'; pageNote.textContent = t('notes_add_page');
  pageNote.onclick = () => {
    if (list.querySelector('textarea')) { globalThis.EasyReadAnnotationView.syncPageDrawer(list, true); list.querySelector('textarea').focus(); return; }
    const draft = document.createElement('article'); draft.className = 'easyread-annotation-item easyread-page-note';
    const comment = document.createElement('div'); comment.className = 'easyread-annotation-comment';
    const label = document.createElement('strong'); label.className = 'easyread-annotation-quote'; label.textContent = t('notes_page');
    list.querySelector('.easyread-annotation-empty')?.remove();
    draft.append(label, comment); list.append(draft); list.classList.remove('is-empty');
    const editButton = document.createElement('button');
    editAnnotation(draft, { scope: 'page', isNew: true }, comment, editButton);
    globalThis.EasyReadAnnotationView.syncPageDrawer(list, true);
    draft.querySelector('textarea').focus();
  };
  surface.append(header, list, pageNote); panel.append(surface);
  globalThis.EasyReadAnnotationView.attachPageDrawer(list, pageNote);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.notes) renderPopupAnnotations().catch(error => notify(error.message));
  });
}
function editAnnotation(item, annotation, comment, editButton) {
  const list = document.getElementById('popupAnnotationList');
  list.__notesSignature = null;
  list.querySelector('.easyread-annotation-inline-cancel')?.click();
  const editor = document.createElement('div'); editor.className = 'easyread-annotation-inline-editor';
  const textarea = document.createElement('textarea'); textarea.value = annotation.comment || '';
  textarea.placeholder = t('annotation_comment_placeholder');
  const actions = document.createElement('div'); actions.className = 'easyread-annotation-actions';
  const cancel = action('annotation_action_cancel', () => {
    if (annotation.isNew) { item.remove(); renderPopupAnnotations().catch(error => notify(error.message)); }
    else { editor.replaceWith(comment); editButton.disabled = false; editButton.focus(); renderPopupAnnotations().catch(error => notify(error.message)); }
  });
  cancel.className = 'easyread-annotation-inline-cancel';
  const save = action('annotation_action_save', async () => {
    if (!textarea.value.trim() && annotation.scope === 'page') return;
    save.disabled = true;
    try { await request(annotation.isNew ? 'addPopupPageNote' : 'editPopupAnnotation', { annotationId: annotation.id, comment: textarea.value.trim() }); editor.replaceWith(comment); await renderPopupAnnotations(); }
    finally { save.disabled = false; }
  });
  actions.append(cancel, save); editor.append(textarea, actions); comment.replaceWith(editor); editButton.disabled = true;
  textarea.onkeydown = event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); cancel.click(); }
    else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save.click(); }
  };
  item.scrollIntoView({ block: 'nearest' }); textarea.focus();
}
export async function renderPopupAnnotations() {
  if (!getTab) return;
  const list = document.getElementById('popupAnnotationList');
  const supported = Boolean(await getTab());
  document.querySelector('#panelAnnotations .easyread-page-note-add').disabled = !supported;
  if (!supported) {
    document.getElementById('notesBadge').hidden = true;
    globalThis.EasyReadAnnotationView.render(list, [], editAnnotation, () => {});
    list.querySelector('.easyread-annotation-empty p').textContent = t('popup_page_message_records_not_supported');
    return;
  }
  const current = ++revision;
  const result = await request('getPopupAnnotations');
  if (current !== revision) return;
  const badge = document.getElementById('notesBadge');
  badge.textContent = String(result?.annotations?.length || 0);
  badge.hidden = !result?.annotations?.length;
  if (current !== revision || list.querySelector('textarea')) return;
  globalThis.EasyReadAnnotationView.render(list, result?.annotations || [], editAnnotation, async id => {
    try { await request('removeAnnotation', { annotationId: id }); await renderPopupAnnotations(); }
    catch (error) { notify(error.message); }
  }, (id, smooth) => request('locateAnnotation', { annotationId: id, smooth }));
}
