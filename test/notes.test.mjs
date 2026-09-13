/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { unifyNotes, normalizeNotesImport, orderNotes } from '../src/scripts/notesModel.mjs';
import { migrateNotes, notesOperation, withNotesLock } from '../src/scripts/notesStore.mjs';

const url = 'https://example.com/article';
const legacy = {
  notes: { [url]: { title: 'Article', notes: [{ id: 1, selectionText: '100% useful', createDateTime: 1 }] } },
  annotations: { [url]: { title: 'Article', annotations: [{ id: 1, selectionText: '%E5%8E%9F%E6%96%87', comment: 'Thought', author: 'Eric', createDateTime: 2, prefix: 'before' }] } }
};
test('unifies colliding legacy IDs without changing quotes, authors or anchors', () => {
  const copy = structuredClone(legacy);
  const notes = unifyNotes(copy.notes, copy.annotations)[url].notes;
  assert.equal(notes.length, 2);
  assert.equal(notes[0].id, 1);
  assert.equal(notes[1].id, 'annotation:1');
  assert.equal(notes[1].comment, 'Thought');
  assert.equal(notes[1].prefix, 'before');
  assert.deepEqual(copy, legacy);
  const converted = normalizeNotesImport(copy);
  assert.deepEqual(normalizeNotesImport(converted), converted);
});
test('different legacy records with duplicate IDs remain separate', () => {
  const input = { [url]: { notes: [{ id: 1, selectionText: 'a' }, { id: 1, selectionText: 'b' }] } };
  assert.equal(unifyNotes(input)[url].notes.length, 2);
});
test('text positions determine order, unlocated text precedes all page notes', () => {
  const notes = [{ id: 'page', scope: 'page', comment: 'Summary', createDateTime: 0 },
    { id: 'end', selectionText: 'end', textPosition: 90 },
    { id: 'missing', selectionText: 'missing' },
    { id: 'first', selectionText: 'first', textPosition: 1 }];
  assert.deepEqual(orderNotes(notes).map(n => n.id), ['first', 'end', 'missing', 'page']);
});
test('migration snapshot, concurrent saves, promotion, deletion and failed writes', async () => {
  let storage = structuredClone(legacy);
  let fail = false;
  globalThis.chrome = { storage: { local: {
    async get(keys) { return structuredClone(Object.fromEntries(keys.map ? keys.map(key => [key, storage[key]]) : [[keys, storage[keys]]])); },
    async set(data) { if (fail) throw new Error('disk full'); Object.assign(storage, structuredClone(data)); }
  } } };
  const first = await withNotesLock(migrateNotes);
  assert.equal(first[url].notes.length, 2);
  assert.deepEqual(storage.annotations, {});
  assert.deepEqual(storage.notesMigrationBackupV1.notes, legacy.notes);
  await withNotesLock(migrateNotes);
  assert.equal(storage.notes[url].notes.length, 2);
  await Promise.all(Array.from({ length: 12 }, (_, i) => withNotesLock(() => notesOperation({ action: 'add', url, selectionText: 'quote' + i }))));
  assert.equal(storage.notes[url].notes.length, 14);
  await withNotesLock(() => notesOperation({ action: 'edit', url, id: 1, comment: 'New thought' }));
  assert.equal(storage.notes[url].notes[0].id, 1);
  assert.equal(storage.notes[url].notes[0].selectionText, '100% useful');
  await withNotesLock(() => notesOperation({ action: 'edit', url, id: 1, comment: '' }));
  assert.equal(storage.notes[url].notes[0].comment, '');
  await withNotesLock(() => notesOperation({ action: 'add', url, comment: 'Whole page' }));
  const pageId = storage.notes[url].notes.at(-1).id;
  await assert.rejects(withNotesLock(() => notesOperation({ action: 'edit', url, id: pageId, comment: '' })));
  await withNotesLock(() => notesOperation({ action: 'remove', url, id: 'annotation:1' }));
  await withNotesLock(migrateNotes);
  assert.ok(!storage.notes[url].notes.some(n => n.id === 'annotation:1'));
  const before = structuredClone(storage);
  fail = true;
  await assert.rejects(withNotesLock(() => notesOperation({ action: 'add', url, comment: 'Will fail' })));
  assert.deepEqual(storage, before);
  storage = structuredClone(legacy);
  await assert.rejects(withNotesLock(migrateNotes));
  assert.deepEqual(storage, legacy, 'failed migration keeps both original collections');
  delete globalThis.chrome;
});
