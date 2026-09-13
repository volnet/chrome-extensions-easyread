import { normalizePageUrl, decodeStoredText } from './easyReadData.mjs';
import { unifyNotes, isPageNote } from './notesModel.mjs';

// Service-worker-owned serial queue: tabs and popup must not race read/modify/write.
let queue = Promise.resolve();
export function withNotesLock(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
export async function migrateNotes() {
  const stored = await chrome.storage.local.get(['notes', 'annotations', 'notesMigrationBackupV1', 'notesSchemaVersion']);
  if (stored.notesSchemaVersion === 2 && !Object.keys(stored.annotations || {}).length) return stored.notes || {};
  const notes = unifyNotes(stored.notes, stored.annotations);
  const update = { notes, annotations: {}, notesSchemaVersion: 2 };
  if (!stored.notesMigrationBackupV1 && (Object.keys(stored.notes || {}).length || Object.keys(stored.annotations || {}).length)) update.notesMigrationBackupV1 = {
    at: Date.now(), notes: stored.notes || {}, annotations: stored.annotations || {}
  };
  // Snapshot, converted records and legacy-store retirement commit together.
  await chrome.storage.local.set(update);
  return notes;
}
export async function notesOperation(message) {
  const pages = await migrateNotes();
  const key = normalizePageUrl(message.url);
  if (message.action === 'all') return { notes: pages };
  if (message.action === 'clearAll') {
    await chrome.storage.local.set({ notes: {}, annotations: {} });
    return { ok: true };
  }
  if (!/^https?:\/\//i.test(key)) throw new Error('Unsupported Notes page');
  const page = pages[key] || { title: message.title || message.url, url: message.url, createDateTime: Date.now(), notes: [] };
  if (message.action === 'get') return { notes: page.notes || [] };
  const index = page.notes.findIndex(note => String(note.id) === String(message.id));
  if (message.action === 'remove') {
    if (index < 0) return { removed: false };
    page.notes.splice(index, 1);
  } else if (message.action === 'edit') {
    if (index < 0) throw new Error('Note no longer exists');
    const comment = String(message.comment || '').trim();
    if (!comment && isPageNote(page.notes[index])) throw new Error('A page note cannot be empty');
    page.notes[index] = { ...page.notes[index], comment, updatedAt: Date.now() };
  } else if (message.action === 'add') {
    const quote = String(message.selectionText || '');
    const comment = String(message.comment || '').trim();
    if (!quote.trim() && !comment) throw new Error('A Note needs a quote or a thought');
    const { annotationAuthor = '' } = await chrome.storage.local.get('annotationAuthor');
    const note = {
      id: crypto.randomUUID(), scope: quote.trim() ? 'text' : 'page',
      selectionText: encodeURIComponent(quote), comment, author: annotationAuthor,
      createDateTime: Date.now(), updatedAt: Date.now()
    };
    if (message.prefix) note.prefix = encodeURIComponent(message.prefix);
    if (message.suffix) note.suffix = encodeURIComponent(message.suffix);
    if (Number.isFinite(message.textPosition)) note.textPosition = message.textPosition;
    page.notes.push(note);
  } else if (message.action === 'positions') {
    let changed = false;
    for (const note of page.notes) {
      const pos = message.positions?.[String(note.id)];
      if (decodeStoredText(note.selectionText) && Number.isFinite(pos) && pos >= 0 && note.textPosition !== pos) { note.textPosition = pos; changed = true; }
    }
    if (!changed) return { ok: true };
  } else throw new Error('Unknown Notes action');
  if (page.notes.length) pages[key] = page; else delete pages[key];
  await chrome.storage.local.set({ notes: pages });
  return { ok: true, removed: message.action === 'remove', notes: page.notes };
}
