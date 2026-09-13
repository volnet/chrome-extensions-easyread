import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeStoredText, indexRecords, validateStorageImport, createReadLaterUpdate } from '../src/scripts/easyReadData.mjs';

let stored = {};
let failure = false;
globalThis.chrome = {
  i18n: { getUILanguage: () => 'en', getMessage: key => key },
  storage: { local: {
    get: async () => { if (failure) throw new Error('Storage unavailable'); return globalThis.structuredClone(stored); },
    set: async value => { stored = globalThis.structuredClone(value); }
  } }
};
const tools = await import('../src/scripts/easyReadTools.js');

test('legacy raw percent text and encoded notes remain readable', () => {
  assert.equal(decodeStoredText('100% useful'), '100% useful');
  assert.equal(decodeStoredText('%E9%87%8D%E7%82%B9'), '重点');
  const [file] = tools.convertNotesToMarkdownFiles({ page: { title: '$& is literal', url: 'https://example.com', createDateTime: 1, notes: [{ selectionText: '100% useful $&', createDateTime: 1 }] } }, '$title$ {notes_section}', '$selectionText$');
  assert.equal(file.content, '$& is literal \n\n> 100% useful $&\n\n');
});
test('large visit histories are indexed once without spread argument overflow', () => {
  const rows = indexRecords({ old: { datetimes: Array(180000).fill(1) }, newest: { datetimes: [2] } });
  assert.equal(rows[0].key, 'newest');
  assert.equal(rows[1].latestRead, 1);
});
test('only valid HTTP and HTTPS links are navigable', () => {
  for (const value of [undefined, 'javascript:alert(1)', 'http-malformed', 'data:text/html,x']) assert.equal(tools.isSupportedScheme(value), false);
  assert.equal(tools.isSupportedScheme('HTTPS://example.com'), true);
});
test('malformed imports fail before storage is changed', async () => {
  stored = { highlightsEnabled: false };
  let result;
  await tools.replaceStorageJsonData({ notes: { page: { notes: 'not an array' } } }, value => { result = value; });
  assert.equal(result.status, false);
  assert.deepEqual(stored, { highlightsEnabled: false });
  assert.throws(() => validateStorageImport([]));
  assert.doesNotThrow(() => validateStorageImport({ notes: [], futureSetting: true }));
});
test('merging mixed-case URL keys keeps highlights, visits, and video progress', async () => {
  stored = { allRecords: { 'https://example.com/page': { title: 'Old', datetimes: [1], videoProgress: { updatedAt: 1 } } } };
  const incoming = {
    allRecords: { 'HTTPS://Example.com/Page#part': { title: 'New', datetimes: [2], videoProgress: { updatedAt: 2 } } },
    notes: { 'HTTPS://Example.com/Page#part': { title: 'Page', notes: [{ id: 1, selectionText: '100%' }] } }
  };
  let result;
  await tools.mergeStorageJsonData(incoming, value => { result = value; });
  assert.equal(result.status, true);
  assert.deepEqual(stored.allRecords['https://example.com/page'].datetimes, [1, 2]);
  assert.equal(stored.allRecords['https://example.com/page'].videoProgress.updatedAt, 2);
  assert.equal(stored.notes['https://example.com/page'].notes[0].selectionText, '100%');
  assert.equal(Array.isArray(stored.notes), false);
});
test('re-importing read-later items does not duplicate them', async () => {
  stored = {};
  const data = { readLaters: [{ key: 'https://example.com', status: 1, createDateTime: 1 }] };
  await tools.mergeStorageJsonData(data);
  await tools.mergeStorageJsonData(data);
  assert.equal(stored.readLaters.length, 1);
});

test('old annotation backups import into Notes and re-import without duplication or loss of edits', async () => {
  stored = {};
  const legacy = { annotations: { 'https://example.com/page': { title: 'Page', annotations: [
    { id: 1, selectionText: 'Quote', comment: 'Original thought', author: 'Eric', createDateTime: 10 }
  ] } } };
  await tools.mergeStorageJsonData(legacy);
  await tools.mergeStorageJsonData(legacy);
  const notes = stored.notes['https://example.com/page'].notes;
  assert.equal(notes.length, 1);
  assert.deepEqual(stored.annotations, {});
  notes[0].comment = 'Later thought'; notes[0].updatedAt = 20;
  await tools.mergeStorageJsonData(legacy);
  assert.equal(stored.notes['https://example.com/page'].notes[0].comment, 'Later thought');
  const [file] = tools.convertNotesToMarkdownFiles(stored.notes, '$title$ {notes_section}', '$selectionText$');
  assert.ok(file.content.includes('Later thought'), 'Legacy export templates must retain thoughts');
  assert.ok(!file.name.includes('NaN'), 'Annotation-only pages get a valid export date');
  await tools.replaceStorageJsonData(legacy);
  assert.equal(stored.notes['https://example.com/page'].notes[0].comment, 'Original thought');
  assert.deepEqual(stored.annotations, {});
});

test('Notes Markdown keeps article order and page reflection last', () => {
  const data = { page: { title: 'Page', createDateTime: 1, notes: [
    { id: 3, scope: 'page', comment: 'Summary', createDateTime: 1 },
    { id: 2, selectionText: 'Second', comment: 'Thought', textPosition: 20, createDateTime: 2 },
    { id: 1, selectionText: 'First', textPosition: 1, createDateTime: 3 }
  ] } };
  const [file] = tools.convertNotesToMarkdownFiles(data, '{notes_section}', '$selectionText$\n\n$comment$\n\n');
  assert.ok(file.content.includes('> First\n\n'));
  assert.ok(file.content.includes('> Second\n\n'));
  assert.ok(file.content.indexOf('> First') < file.content.indexOf('> Second'));
  assert.ok(file.content.indexOf('Thought') < file.content.indexOf('Summary'));
  assert.ok(!file.content.includes('> Summary'));
});

test('Markdown quotes every original line, keeps comments separate and supports older quoted templates', () => {
  const data = { page: { title: 'Page', createDateTime: 1, notes: [
    { selectionText: encodeURIComponent('Line 1\r\n\r\nLine 2 $100'), comment: 'My comment\nSecond thought', createDateTime: 1 }
  ] } };
  for (const template of ['$selectionText$\n\n$comment$', '> $selectionText$\n\n$comment$', '$selectionText$']) {
    const text = tools.convertNotesToMarkdownFiles(data, '{notes_section}', template)[0].content;
    assert.ok(text.includes('> Line 1\n> \n> Line 2 $100\n\n'));
    assert.ok(text.includes('My comment\nSecond thought'));
    assert.ok(!text.includes('> > Line 1'));
    assert.ok(!text.includes('> My comment'));
  }
});
test('storage failures reach the import callback', async () => {
  failure = true;
  let result;
  await tools.mergeStorageJsonData({ readLaters: [] }, value => { result = value; });
  failure = false;
  assert.equal(result.status, false);
  assert.equal(result.error.message, 'Storage unavailable');
});
test('awaiting a storage update waits for persistence and callback completion', async () => {
  stored = {};
  let notified = false;
  await tools.updateStorageJsonData('readLaters', () => ({ status: 0, value: [{ key: 'https://example.com' }], callback_onUpdated: () => { notified = true; } }));
  assert.equal(stored.readLaters.length, 1);
  assert.equal(notified, true);
});
test('category overwrite preserves unrelated settings and restores complete content', async () => {
  stored = { annotationAuthor: 'Local author', allRecords: { old: { datetimes: [1] } } };
  // chrome.storage.set merges top-level keys, as in MV3.
  const originalSet = globalThis.chrome.storage.local.set;
  globalThis.chrome.storage.local.set = async value => { stored = { ...stored, ...globalThis.structuredClone(value) }; };
  const backup = { allRecords: { restored: { datetimes: [2] } }, notes: { restored: { notes: [{ id: 1, selectionText: '100%' }] } } };
  await tools.replaceStorageJsonData(JSON.parse(JSON.stringify(backup)));
  globalThis.chrome.storage.local.set = originalSet;
  assert.equal(stored.annotationAuthor, 'Local author');
  assert.deepEqual(stored.allRecords, backup.allRecords);
  assert.deepEqual(stored.notes, backup.notes);
});
test('reading items cannot be added again until completed', () => {
  const result = createReadLaterUpdate({ readLaters: [{ key: 'https://example.com', status: 1 }] }, {
    storageKey: 'readLaters', tab: { url: 'https://example.com', title: 'Page' }, now: () => 1,
    messages: { duplicate: 'duplicate' }
  });
  assert.equal(result.message, 'duplicate');
});
