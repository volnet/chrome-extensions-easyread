import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateNotes, notesOperation, withNotesLock } from '../src/scripts/notesStore.mjs';
import { normalizePageUrl, decodeStoredText, indexRecords } from '../src/scripts/easyReadData.mjs';
const { structuredClone } = globalThis;

// Schema verified against tag v1.0.1 (3b044c9), background.js and easyReadTools.js.
test('v1.0.1 upgrade keeps history, positions, all read states, quotes and preferences; retry is lossless', async () => {
  const url = 'https://example.com/article?lang=zh';
  const legacy = {
    allRecords: { [url]: { title: '旧文章', url, datetimes: [1, 2, 3], position: { scrollX: 0, scrollY: 360, progress: 35 } } },
    readLaters: [0, 1, 2].map(status => ({ key: url, title: '旧文章', status, createDateTime: status + 1, position: { scrollY: 123, progress: 10 }, ...(status === 2 ? { endReadDateTime: 9 } : {}) })),
    notes: { [url]: { title: '旧文章', url, createDateTime: 1, notes: [
      { id: 'original-id', selectionText: encodeURIComponent('原文\n100% $&'), createDateTime: 1 },
      { selectionText: '100% raw', createDateTime: 2 }
    ] } },
    isAutoRecordEnabled: false, highlightsEnabled: false, annotationAuthor: 'Eric', customFutureSetting: { untouched: true }
  };
  let storage = structuredClone(legacy), fail = true, writes = 0;
  globalThis.chrome = { storage: { local: {
    async get(keys) { return structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, storage[key]]))); },
    async set(update) { if (fail) throw new Error('quota exceeded'); writes++; Object.assign(storage, structuredClone(update)); }
  } } };
  try {
    assert.equal(normalizePageUrl(' HTTPS://EXAMPLE.COM/article?lang=zh#part '), url);
    await assert.rejects(withNotesLock(migrateNotes));
    assert.deepEqual(storage, legacy);
    fail = false;
    await withNotesLock(migrateNotes);
    for (const key of Object.keys(legacy).filter(key => key !== 'notes')) assert.deepEqual(storage[key], legacy[key]);
    assert.deepEqual(storage.notesMigrationBackupV1.notes, legacy.notes);
    assert.equal(storage.notes[url].notes[0].id, 'original-id');
    assert.equal(decodeStoredText(storage.notes[url].notes[0].selectionText), '原文\n100% $&');
    assert.equal(storage.notes[url].notes[1].id, 'legacy:1');
    assert.equal(indexRecords(storage.allRecords).length, 1);
    const migrated = structuredClone(storage);
    await withNotesLock(migrateNotes);
    assert.deepEqual(storage, migrated); assert.equal(writes, 1);
    await withNotesLock(() => notesOperation({ action: 'edit', url, id: 'original-id', comment: '升级后的评论' }));
    assert.equal(storage.notes[url].notes[0].selectionText, legacy.notes[url].notes[0].selectionText);
    await withNotesLock(() => notesOperation({ action: 'remove', url, id: 'legacy:1' }));
    await withNotesLock(migrateNotes);
    assert.equal(storage.notes[url].notes.length, 1, 'Migration must not resurrect removed records');
  } finally { delete globalThis.chrome; }
});
