import { decodeStoredText, normalizePageUrl } from './easyReadData.mjs';

export const isPageNote = note => note.scope === 'page' || !decodeStoredText(note.selectionText).trim();

// Preserve legacy fields and namespace annotation IDs: the old stores may share IDs.
export function unifyNotes(notes = {}, annotations = {}) {
  const pages = {};
  for (const [source, field] of [[notes, 'notes'], [annotations, 'annotations']]) {
    for (const [rawKey, page] of Object.entries(source || {})) {
      const key = normalizePageUrl(rawKey);
      if (!key || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid Notes page key');
      if (!page || !Array.isArray(page[field])) throw new Error('Invalid Notes collection');
      const target = pages[key] ||= { ...page, notes: [] };
      delete target.annotations;
      for (const [index, value] of page[field].entries()) {
        if (!value || typeof value !== 'object') throw new Error('Invalid Note');
        const note = { ...value };
        if (field === 'annotations') {
          note.id = `annotation:${value.id ?? index}`;
          note.legacyAnnotationId = value.id ?? index;
        } else if (note.id === undefined) note.id = `legacy:${index}`;
        const duplicate = target.notes.find(item => String(item.id) === String(note.id));
        if (duplicate && JSON.stringify(duplicate) === JSON.stringify(note)) continue;
        if (duplicate) {
          // Never discard two different historical records with the same ID.
          const base = String(note.id); let suffix = 1;
          while (target.notes.some(item => String(item.id) === String(note.id))) note.id = `${base}:copy${suffix++}`;
        }
        target.notes.push(note);
      }
    }
  }
  for (const [key, page] of Object.entries(pages)) {
    if (!page.notes.some(note => note.legacyAnnotationId !== undefined)) continue;
    page.url ||= key;
    if (!Number.isFinite(page.createDateTime)) {
      let earliest = Infinity;
      for (const note of page.notes) if (Number.isFinite(note.createDateTime)) earliest = Math.min(earliest, note.createDateTime);
      page.createDateTime = Number.isFinite(earliest) ? earliest : 0;
    }
  }
  return pages;
}

export function normalizeNotesImport(data) {
  if (!('notes' in data) && !('annotations' in data)) return data;
  return { ...data, notes: unifyNotes(data.notes, data.annotations), annotations: {} };
}

export function orderNotes(notes, position = note => note.textPosition) {
  return notes.map((note, index) => ({ note, index, position: position(note) }))
    .sort((a, b) => {
      const scope = Number(isPageNote(a.note)) - Number(isPageNote(b.note));
      if (scope) return scope;
      if (!isPageNote(a.note)) {
        const left = Number.isFinite(a.position) ? a.position : Number.POSITIVE_INFINITY;
        const right = Number.isFinite(b.position) ? b.position : Number.POSITIVE_INFINITY;
        if (left !== right) return left - right;
      }
      return (a.note.createDateTime || 0) - (b.note.createDateTime || 0) || a.index - b.index;
    }).map(item => item.note);
}
