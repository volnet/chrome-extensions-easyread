// Local MV3/UI regression. Uses an isolated Edge profile, never a personal profile.
/* global chrome, document, window, navigator */
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import assert from 'node:assert/strict';

const playwrightPath = process.env.EASYREAD_PLAYWRIGHT || 'C:/Users/gongcen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath));
const fixtureDirectory = mkdtempSync(join(tmpdir(), 'easyread-ui-media-'));
const videoPath = join(fixtureDirectory, 'preview.mp4');
const generated = spawnSync(process.env.EASYREAD_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath]);
assert.equal(generated.status, 0, 'ffmpeg is required for the local preview fixture');
const videoBytes = readFileSync(videoPath);
const server = createServer((request, response) => {
  if (request.url === '/picture.png') {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=', 'base64');
    response.setHeader('Content-Type', 'image/png'); response.setHeader('Content-Length', png.length); response.end(request.method === 'HEAD' ? undefined : png); return;
  }
  if (request.url === '/preview.mp4') {
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Content-Length', videoBytes.length);
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end(request.method === 'HEAD' ? undefined : videoBytes);
    return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('<!doctype html><html><head><title>A calmer way to read · EasyRead</title><style>body{font:18px/1.9 system-ui;max-width:760px;margin:80px auto;background:#fff;color:#25252a}h1{font-size:36px}p{margin:30px 0}</style></head><body><h1>A calmer way to read</h1><p>First passage to highlight in a thoughtful reading workspace.</p><p>Second passage with a useful idea worth remembering.</p><p>Third passage completes this short article.</p></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const pageUrl = `http://127.0.0.1:${server.address().port}/article`;
const profile = mkdtempSync(join(tmpdir(), 'easyread-ui-check-'));
const build = process.env.EASYREAD_TEST_BUILD || 'development';
assert.ok(['development', 'production'].includes(build));
const extension = resolve('dist', build);
const locale = process.env.EASYREAD_UI_LOCALE || 'zh-CN';
const screenshotDir = resolve('output/quality-review', build, locale);
mkdirSync(screenshotDir, { recursive: true });
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.EASYREAD_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    downloadsPath: join(profile, 'downloads'),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run', `--lang=${locale}`],
    locale,
    viewport: { width: 1280, height: 900 }
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  console.log(`MV3 worker loaded: ${extensionId}`);
  console.log('UI locale: ' + await worker.evaluate(() => chrome.i18n.getUILanguage()));
  const records = Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`https://example.com/read/${index}`, {
    title: `Reading collection ${index + 1} — Small details make a difference`, url: `https://example.com/read/${index}`,
    datetimes: [1788960000000 + index * 60000], position: { progress: index % 101 }
  }]));
  records[pageUrl] = { title: 'A calmer way to read', url: pageUrl, datetimes: [1788960000000], position: { progress: 38 } };
  await worker.evaluate(async ({ pageUrl, records }) => {
    await chrome.storage.local.set({
      allRecords: records,
      readLaters: [{ key: pageUrl, url: pageUrl, title: 'A calmer way to read', status: 1, createDateTime: 1 }],
      notes: { [pageUrl]: { title: 'A calmer way to read', url: pageUrl, createDateTime: 1, notes: [{ id: 1, selectionText: '100% useful', createDateTime: 1 }] } },
      annotations: { [pageUrl]: { title: 'A calmer way to read', url: pageUrl, annotations: [
        { id: 1, selectionText: encodeURIComponent('First passage'), comment: 'Keep this idea in mind.', author: 'Eric', createDateTime: 1 },
        { id: 2, selectionText: encodeURIComponent('Third passage'), comment: 'A second thought.', author: 'Eric', createDateTime: 2 }
      ] } }, annotationAuthor: 'Eric'
    });
  }, { pageUrl, records });
  const article = await context.newPage();
  await article.goto(pageUrl);
  await article.locator('#easyread-annotation-sidebar').waitFor();
  await article.waitForFunction(() => document.querySelectorAll('.easyread-annotation-item').length === 3);
  await article.screenshot({ animations: 'disabled', path: join(screenshotDir, 'annotations.png') });
  await article.locator('.easyread-annotation-collapse').click();
  await article.locator('#easyread-annotation-reopen').waitFor({ state: 'visible' });
  await article.locator('#easyread-annotation-reopen').click();
  await article.locator('.easyread-annotation-edit').first().click();
  await article.locator('.easyread-annotation-inline-editor textarea').fill('Edited annotation');
  await article.locator('.easyread-annotation-inline-editor textarea').press('Enter');
  await article.locator('.easyread-annotation-comment', { hasText: 'Edited annotation' }).waitFor();
  await article.reload();
  await article.locator('.easyread-annotation-comment', { hasText: 'Edited annotation' }).waitFor();
  console.log('PASS annotation collapse, reopen, edit, Enter save and reload persistence');
  const articleTab = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url), pageUrl);
  await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { command: 'openAnnotationComposer', selectionText: 'Second passage' }), articleTab.id);
  await article.locator('.easyread-annotation-draft-input').waitFor();
  assert.deepEqual(await article.locator('.easyread-annotation-quote').evaluateAll(items => items.map(item => item.firstChild.textContent)), ['First passage', 'Second passage', 'Third passage', '100% useful']);
  await article.locator('.easyread-annotation-draft-input').fill('Line one');
  await article.locator('.easyread-annotation-draft-input').press('Shift+Enter');
  await article.locator('.easyread-annotation-draft-input').pressSequentially('Line two');
  await article.locator('.easyread-annotation-draft-input').press('Enter');
  await article.locator('.easyread-annotation-comment', { hasText: 'Line two' }).waitFor();
  assert.deepEqual(await article.locator('.easyread-annotation-number').allTextContents(), ['1', '2', '3', '4']);
  await article.locator('.easyread-annotation-edit').nth(1).click();
  await article.locator('.easyread-annotation-inline-editor textarea').press('Escape');
  await article.locator('.easyread-annotation-inline-editor').waitFor({ state: 'detached' });
  await article.locator('.easyread-annotation-remove').nth(1).click();
  await article.waitForFunction(() => document.querySelectorAll('.easyread-annotation-item').length === 3);
  const beforeWidth = (await article.locator('#easyread-annotation-sidebar').boundingBox()).width;
  await article.locator('.easyread-annotation-resize').focus();
  await article.keyboard.press('ArrowLeft');
  assert.equal((await article.locator('#easyread-annotation-sidebar').boundingBox()).width, beforeWidth + 20);
  console.log('PASS annotation draft ordering, numbering, Shift+Enter, Escape, removal and resize');
  // Unified Notes: migration, highlight promotion, page-note tail and no data loss.
  const migrated = await worker.evaluate(() => chrome.storage.local.get(['notes', 'annotations', 'notesMigrationBackupV1']));
  assert.deepEqual(migrated.annotations, {});
  assert.equal(migrated.notes[pageUrl].notes.length, 3);
  assert.equal(migrated.notesMigrationBackupV1.annotations[pageUrl].annotations.length, 2);
  await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { command: 'openAnnotationComposer', noteId: 1 }), articleTab.id);
  await article.locator('.easyread-annotation-inline-editor textarea').fill('A thought added to an existing highlight');
  await article.locator('.easyread-annotation-inline-editor textarea').press('Enter');
  await article.locator('.easyread-annotation-comment', { hasText: 'A thought added' }).waitFor();
  assert.equal(await worker.evaluate(async pageUrl => (await chrome.storage.local.get('notes')).notes[pageUrl].notes.length, pageUrl), 3);
  const upgraded = await worker.evaluate(async pageUrl => (await chrome.storage.local.get('notes')).notes[pageUrl].notes.find(n => n.id === 1), pageUrl);
  assert.equal(upgraded.selectionText, '100% useful'); assert.equal(upgraded.createDateTime, 1);
  await article.locator('.easyread-page-note-add').click();
  await article.locator('.easyread-annotation-draft-input').fill('My whole-page reflection');
  await article.locator('.easyread-annotation-draft-input').press('Enter');
  await article.locator('.easyread-page-note .easyread-annotation-comment', { hasText: 'My whole-page reflection' }).waitFor();
  assert.equal(await article.locator('.easyread-annotation-list > :last-child').getAttribute('class'), 'easyread-page-drawer');
  assert.equal(await article.locator('.easyread-page-note-toggle span').textContent(), '1');
  await article.locator('.easyread-page-note-toggle').click();
  await article.locator('.easyread-page-drawer').waitFor({ state: 'hidden' });
  await article.locator('.easyread-page-note-toggle').click();
  await article.locator('.easyread-page-drawer').waitFor({ state: 'visible' });
  await article.locator('.easyread-page-note .easyread-annotation-edit').click();
  assert.equal(await article.locator('.easyread-annotation-list > :last-child textarea').count(), 1);
  await article.locator('.easyread-annotation-inline-editor textarea').press('Escape');
  await article.reload();
  await article.locator('.easyread-page-note .easyread-annotation-comment', { hasText: 'My whole-page reflection' }).waitFor();
  await worker.evaluate(() => chrome.storage.local.set({ highlightsEnabled: false }));
  await article.waitForFunction(() => document.querySelectorAll('.easyread-annotation-marker').length === 0);
  assert.equal(await article.locator('.easyread-annotation-item').count(), 4);
  await worker.evaluate(() => chrome.storage.local.set({ highlightsEnabled: true }));
  await article.waitForFunction(() => document.querySelectorAll('.easyread-annotation-marker').length === 2);
  await worker.evaluate(() => {
    globalThis.notesMenuState = {};
    const original = chrome.contextMenus.update.bind(chrome.contextMenus);
    chrome.contextMenus.update = (id, properties, ...rest) => { globalThis.notesMenuState[id] = properties; return original(id, properties, ...rest); };
  });
  const selectSecond = async selected => article.evaluate(selected => {
    const paragraph = document.querySelectorAll('body > p')[1];
    const selection = window.getSelection(); selection.removeAllRanges();
    if (selected) { const range = document.createRange(); range.selectNodeContents(paragraph); selection.addRange(range); }
    const rect = paragraph.getBoundingClientRect();
    paragraph.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 5, clientY: rect.top + 10 }));
  }, selected);
  await selectSecond(false);
  await article.waitForTimeout(100);
  assert.equal(await worker.evaluate(() => globalThis.notesMenuState['selection-add-highlight'].visible), false);
  await selectSecond(true);
  await article.waitForTimeout(100);
  assert.equal(await worker.evaluate(() => globalThis.notesMenuState['selection-add-highlight'].visible), true);
  const selectedAnchor = await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { command: 'getSelectionContext' }), articleTab.id);
  const notesClient = await context.newPage();
  await notesClient.goto(`chrome-extension://${extensionId}/records/allRecords.html`);
  const addedNote = await notesClient.evaluate(async ({ url, anchor }) => chrome.runtime.sendMessage({ command: 'easyreadNotes', action: 'add', url, selectionText: 'Second passage with a useful idea worth remembering.', ...anchor }), { url: pageUrl, anchor: selectedAnchor });
  assert.equal(addedNote.ok, true);
  await notesClient.close();
  await article.waitForFunction(() => document.querySelectorAll('.easyread-annotation-item').length === 5);
  const secondNote = article.locator('.easyread-annotation-item', { hasText: 'Second passage with' });
  assert.equal(await secondNote.locator('.easyread-note-add-thought').count(), 1);
  assert.equal(await article.locator('.easyread-annotation-list > :last-child .easyread-annotation-comment').textContent(), 'My whole-page reflection');
  await secondNote.locator('.easyread-note-add-thought').click();
  await article.locator('.easyread-annotation-inline-editor textarea').fill('Quote promoted in place');
  await article.locator('.easyread-annotation-inline-editor textarea').press('Enter');
  await secondNote.locator('.easyread-annotation-comment', { hasText: 'Quote promoted in place' }).waitFor();
  assert.equal(await article.locator('.easyread-annotation-item').count(), 5);
  await secondNote.locator('.easyread-annotation-remove').click();
  await article.waitForFunction(() => document.querySelectorAll('.easyread-annotation-item').length === 4);
  await article.evaluate(() => window.getSelection().removeAllRanges());
  await article.screenshot({ animations: 'disabled', path: join(screenshotDir, 'notes-unified.png') });
  console.log('PASS legacy migration, non-destructive promotion, page notes last through editing/reload, visual toggle');
  const initialDiagnostics = await worker.evaluate(async () => (await chrome.storage.local.get('easyreadDevelopmentErrors')).easyreadDevelopmentErrors || []);
  assert.deepEqual(initialDiagnostics, [], 'Normal annotation/highlight operations should not log errors');
  await worker.evaluate(() => chrome.storage.local.remove('easyreadDevelopmentErrors'));

  const settings = await context.newPage();
  const errors = [];
  settings.on('pageerror', error => errors.push(error.message));
  await settings.goto(`chrome-extension://${extensionId}/setting/setting.html`);
  await settings.locator('#setting_tab_read_later').click();
  await settings.locator('#settingsReadLaterList li').waitFor();
  assert.equal(await settings.locator('#readLaterPrevious').isDisabled(), true);
  assert.equal(await settings.locator('#readLaterNext').isDisabled(), true);
  assert.equal(await settings.locator('#readLaterPanel #btnRemoveNotes').count(), 0);
  assert.equal(await settings.locator('#annotationsPanel #btnRemoveNotes').count(), 1);
  const savedReadLater = await worker.evaluate(async () => (await chrome.storage.local.get('readLaters')).readLaters);
  await settings.locator('#settingsReadLaterList input[type=checkbox]').first().click();
  await settings.locator('#settingsReadLaterEmpty').waitFor({ state: 'visible' });
  await settings.locator('#readLaterCompleted summary').click();
  assert.equal(await settings.locator('#settingsReadLaterCompletedList input[type=checkbox]').first().isChecked(), true);
  await settings.locator('#settingsReadLaterCompletedList input[type=checkbox]').first().click();
  await settings.locator('#settingsReadLaterList input[type=checkbox]').first().waitFor();
  await settings.waitForFunction(() => !document.querySelector('#settingsReadLaterList input').disabled);
  assert.equal(await settings.locator('#settingsReadLaterList input').evaluate(el => window.getComputedStyle(el).borderRadius), '50%');
  await settings.locator('#readLaterCompleted summary').click();
  await worker.evaluate(items => chrome.storage.local.set({ readLaters: items }), savedReadLater);
  await worker.evaluate(() => chrome.storage.local.set({ readLaters: Array.from({ length: 101 }, (_, i) => ({ key: `https://example.com/later/${i}`, title: `Later ${i}`, status: 0 })) }));
  await settings.waitForFunction(() => document.querySelectorAll('#settingsReadLaterList li').length === 10);
  for (let page = 0; page < 10; page++) await settings.locator('#readLaterNext').click();
  assert.equal(await settings.locator('#settingsReadLaterList li').count(), 1);
  assert.equal(await settings.locator('#readLaterNext').isDisabled(), true);
  let deletePrompt = '';
  settings.once('dialog', dialog => { deletePrompt = dialog.message(); dialog.accept(); });
  await settings.locator('#btnRemoveReadLaters').click();
  await settings.locator('#settingsReadLaterEmpty').waitFor({ state: 'visible' });
  assert.ok(deletePrompt.includes(locale.startsWith('zh') ? '稍后阅读' : 'Read Later'));
  assert.ok(await worker.evaluate(async () => Boolean((await chrome.storage.local.get('notes')).notes)), 'Deleting Read Later preserves highlights');
  await settings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-read-later-empty.png') });
  await worker.evaluate(items => chrome.storage.local.set({ readLaters: items }), savedReadLater);
  await worker.evaluate(async () => { const { readLaters } = await chrome.storage.local.get('readLaters'); await chrome.storage.local.set({ readLaters: [...readLaters, ...Array.from({ length: 101 }, (_, i) => ({ key: `https://example.com/completed/${i}`, title: `Completed ${i}`, status: 2 }))] }); });
  assert.equal(await settings.locator('#readLaterCompleted').getAttribute('open'), null);
  await settings.locator('#readLaterCompleted summary').click();
  await settings.waitForFunction(() => document.querySelectorAll('#settingsReadLaterCompletedList li').length === 100);
  await settings.locator('#readLaterCompletedNext').click();
  assert.equal(await settings.locator('#settingsReadLaterCompletedList li').count(), 1);
  assert.equal(await settings.locator('#readLaterCompletedNext').isDisabled(), true);
  await worker.evaluate(items => chrome.storage.local.set({ readLaters: items }), savedReadLater);
  await settings.locator('#settingsReadLaterList li').waitFor();
  assert.equal(await settings.locator('#setting_tab_data').getAttribute('data-parent'), 'setting_tab_read_later');
  assert.equal(await settings.locator('#setting_tab_read_later + #setting_tab_read_later_list + #setting_tab_data').count(), 1);
  await settings.locator('#setting_tab_read_later_list').click();
  assert.equal(await settings.locator('#readLaterPanel').isVisible(), true);
  await settings.locator('#setting_tab_data').click();
  await settings.locator('#recordsBody tr').first().waitFor();
  assert.equal(await settings.locator('#recordsBody tr').count(), 500);
  assert.equal(await settings.locator('#setting_tab_data').textContent(), locale.startsWith('zh') ? '浏览历史' : 'Browsing History');
  assert.equal(await settings.locator('#openAllRecords, #btnDownloadAllRecordsAsJson').count(), 0);
  const historyBounds = await settings.evaluate(() => ['recordSummary', 'exportRecords', 'outputTable'].map(id => {
    const rect = document.getElementById(id).getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom };
  }));
  historyBounds.slice(1).forEach((rect, index) => assert.ok(rect.top >= historyBounds[index].bottom, 'History controls are vertically ordered'));
  const historyActionAlignment = await settings.evaluate(() => {
    const row = document.querySelector('.historyActions').getBoundingClientRect(), button = document.getElementById('exportRecords').getBoundingClientRect(), remove = document.getElementById('btnRemoveAllRecords').getBoundingClientRect(), pages = document.querySelector('.historyPagination').getBoundingClientRect();
    return { left: Math.abs(row.left - button.left), right: Math.abs(row.right - remove.right), center: Math.abs((button.top + button.bottom) / 2 - (remove.top + remove.bottom) / 2), below: pages.top >= row.bottom };
  });
  assert.ok(historyActionAlignment.left < 1 && historyActionAlignment.right < 1 && historyActionAlignment.center < 1 && historyActionAlignment.below, 'Export and delete share one row, pagination below');
  await settings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-history.png') });
  await settings.locator('#nextPage').click();
  await settings.locator('#nextPage').click();
  assert.equal(await settings.locator('#recordsBody tr').count(), 2);
  assert.equal(await settings.locator('#nextPage').isDisabled(), true);
  const historyDownload = settings.waitForEvent('download');
  await settings.locator('#exportRecords').click();
  const exportedHistory = JSON.parse(readFileSync(await (await historyDownload).path(), 'utf8'));
  const savedHistory = await worker.evaluate(async () => (await chrome.storage.local.get('allRecords')).allRecords);
  assert.deepEqual(exportedHistory, { allRecords: savedHistory }, 'Export includes all pages with the original storage contract');
  settings.once('dialog', dialog => dialog.dismiss());
  await settings.locator('#btnRemoveAllRecords').click();
  await settings.waitForFunction(() => !document.getElementById('btnRemoveAllRecords').disabled);
  assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get('allRecords')).allRecords), savedHistory);
  settings.once('dialog', dialog => dialog.accept());
  await settings.locator('#btnRemoveAllRecords').click();
  await settings.locator('#recordsEmpty').waitFor({ state: 'visible' });
  assert.equal(await settings.locator('#recordsBody tr').count(), 0);
  await worker.evaluate(allRecords => chrome.storage.local.set({ allRecords }), savedHistory);
  await settings.waitForFunction(() => document.querySelectorAll('#recordsBody tr').length === 500);
  await settings.locator('#setting_tab_read_later_list').click();
  console.log('PASS embedded history: 500 rows, three pages, full export, live clear/restore and vertical controls');
  const deleteStyles = await settings.locator('#clearDiagnostics, #btnRemoveReadLaters, #btnRemoveNotes').evaluateAll(buttons => buttons.map(button => {
    const style = window.getComputedStyle(button); return [button.textContent, style.backgroundColor, style.color, style.borderRadius, style.padding];
  }));
  assert.deepEqual(deleteStyles[0], deleteStyles[1]); assert.deepEqual(deleteStyles[1], deleteStyles[2]);
  console.log('PASS Read Later list/pagination/empty state, scoped deletion and nested All Records');
  await settings.locator('#setting_tab_annotations').click();
  await settings.locator('#annotationAuthor').fill('EasyRead reviewer');
  await settings.locator('#annotationAuthor').press('Enter');
  await settings.waitForFunction(() => !document.querySelector('#output').hidden);
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('annotationAuthor')).annotationAuthor), 'EasyRead reviewer');
  await settings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-general.png') });
  await settings.locator('#setting_tab_general').focus();
  await settings.keyboard.press('ArrowDown');
  assert.equal(await settings.locator('#setting_tab_read_later').getAttribute('aria-selected'), 'true');
  await settings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-data.png') });
  await settings.locator('#setting_tab_backup').click();
  const backupDownload = settings.waitForEvent('download');
  await settings.locator('#btnDownloadStorageAsJson').click();
  const backupPath = await (await backupDownload).path();
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  await worker.evaluate(() => chrome.storage.local.clear());
  await settings.locator('#fileInputStorageJson').setInputFiles(backupPath);
  settings.once('dialog', dialog => dialog.accept());
  await settings.locator('#btnReplaceStorageJson').click();
  await settings.waitForFunction(() => !document.querySelector('#btnReplaceStorageJson').disabled);
  const restored = await worker.evaluate(() => chrome.storage.local.get(['allRecords', 'notes', 'annotations', 'readLaters', 'annotationAuthor']));
  for (const key of Object.keys(restored)) assert.deepEqual(restored[key], backup[key]);
  console.log('PASS exported full backup, clear and actual UI import round-trip');
  await settings.locator('#fileInputStorageJson').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"notes":{"bad":{"notes":"invalid"}}}') });
  await settings.locator('#btnMergeStorageJson').click();
  await settings.waitForFunction(() => document.querySelector('#output').dataset.state === 'error');
  if (build === 'production') assert.equal(await settings.evaluate(() => typeof globalThis.EasyReadDiagnostics), 'undefined');
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('notes')).notes.bad), undefined);
  await worker.evaluate(() => chrome.storage.local.remove('easyreadDevelopmentErrors'));
  await settings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-backup.png') });
  console.log('PASS settings author save, keyboard tabs and invalid backup safety');

  const recordsPage = await context.newPage();
  recordsPage.on('pageerror', error => errors.push(error.message));
  await recordsPage.goto(`chrome-extension://${extensionId}/records/allRecords.html`);
  await recordsPage.locator('#recordsBody tr').first().waitFor();
  assert.equal(await recordsPage.locator('#recordsBody tr').count(), 500);
  await recordsPage.screenshot({ animations: 'disabled', path: join(screenshotDir, 'records.png') });
  await recordsPage.locator('#nextPage').click();
  await recordsPage.locator('#nextPage').click();
  assert.equal(await recordsPage.locator('#recordsBody tr').count(), 2);
  assert.equal(await recordsPage.locator('#nextPage').isDisabled(), true);
  console.log('PASS 500-row pagination, 1002 records across three pages');

  // A normal extension tab is not an action popup. Override only active-tab lookup
  // so the actual popup module targets the real article/content script in this test.
  const tab = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url), pageUrl);
  const popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  await popup.setViewportSize({ width: 450, height: 600 });
  await popup.addInitScript(tab => { chrome.tabs.query = async () => [tab]; window.close = () => { window.popupCloseRequested = true; }; }, tab);
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.locator('#outputReadLaters li').waitFor();
  await popup.locator('#tabAnnotations').click();
  await popup.locator('#popupAnnotationList .easyread-annotation-item').first().waitFor();
  for (const seconds of [3, 2, 1]) await popup.waitForFunction(expected => document.querySelector('.easyread-page-note-toggle span')?.textContent === expected, `${seconds}${locale.startsWith('zh') ? '秒' : 's'}`);
  await popup.locator('.easyread-page-drawer').waitFor({ state: 'hidden' });
  assert.equal(await popup.locator('.easyread-page-note-toggle span').textContent(), '1');
  await popup.locator('.easyread-page-note-toggle').click();
  await popup.locator('.easyread-page-drawer').waitFor({ state: 'visible' });
  console.log('PASS first popup drawer appearance, 3-2-1 countdown, automatic collapse and manual reopen');
  const cardView = element => {
    const style = window.getComputedStyle(element);
    return { text: element.textContent, font: style.font, padding: style.padding, borderRadius: style.borderRadius, grid: style.gridTemplateColumns.split(' ')[0] };
  };
  assert.deepEqual(await popup.locator('#popupAnnotationList .easyread-annotation-item').first().evaluate(cardView), await article.locator('.easyread-annotation-item').first().evaluate(cardView));
  for (const surface of [popup, article]) {
    const spacing = await surface.locator('.easyread-annotation-item-actions').first().evaluate(element => {
      const rects = [...element.children].map(button => button.getBoundingClientRect());
      return rects.length === 3 && rects.every(rect => rect.width === 24 && rect.height === 24 && rect.top === rects[0].top)
        && Math.abs((rects[1].left - rects[0].right) - (rects[2].left - rects[1].right)) < .1;
    });
    assert.equal(spacing, true, 'Note action buttons have equal dimensions, baseline and gaps');
  }
  assert.equal(await popup.locator('.easyread-annotation-download').count(), 1);
  assert.equal(Number(await popup.locator('#notesBadge').textContent()), await popup.locator('#popupAnnotationList [data-note-id]').count());
  assert.equal(await popup.locator('.easyread-annotation-collapse').count(), 0);
  await popup.locator('body').screenshot({ animations: 'disabled', path: join(screenshotDir, 'popup-annotations.png') });
  assert.equal(await popup.locator('.easyread-page-note .easyread-annotation-locate').count(), 0);
  await article.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 1500); });
  await popup.locator('#popupAnnotationList .easyread-annotation-locate').first().click();
  await article.waitForFunction(() => window.scrollY < 500);
  await article.evaluate(() => window.scrollTo(0, 1500));
  await article.locator('.easyread-annotation-locate').first().click();
  await article.waitForFunction(() => window.scrollY < 500);
  await article.evaluate(() => { document.body.style.minHeight = ''; });
  await popup.locator('#popupAnnotationList .easyread-annotation-edit').first().click();
  await popup.locator('#popupAnnotationList textarea').fill('Popup edited annotation');
  await popup.locator('#popupAnnotationList textarea').press('Enter');
  await popup.locator('#popupAnnotationList .easyread-annotation-comment', { hasText: 'Popup edited annotation' }).waitFor();
  await article.locator('.easyread-annotation-comment', { hasText: 'Popup edited annotation' }).waitFor();
  await popup.locator('.easyread-page-note-add').click();
  await popup.locator('#popupAnnotationList textarea').fill('Page note from popup');
  await popup.locator('#popupAnnotationList textarea').press('Enter');
  await popup.locator('.easyread-page-note .easyread-annotation-comment', { hasText: 'Page note from popup' }).waitFor();
  await article.locator('.easyread-page-note .easyread-annotation-comment', { hasText: 'Page note from popup' }).waitFor();
  const popupPageNote = popup.locator('.easyread-page-note', { hasText: 'Page note from popup' });
  await popupPageNote.locator('.easyread-annotation-remove').click();
  await popupPageNote.waitFor({ state: 'detached' });
  console.log('PASS popup page-note add/delete after typing, without replaying the entrance animation');
  const drawerBackup = await worker.evaluate(async () => (await chrome.storage.local.get('notes')).notes);
  await worker.evaluate(() => chrome.storage.local.set({ notes: {} }));
  await popup.locator('.easyread-annotation-empty').waitFor();
  assert.equal(await popup.locator('#notesBadge').isVisible(), false);
  await popup.evaluate(() => {
    window.noteDrawerEntries = [];
    document.addEventListener('transitionrun', event => {
      if (event.propertyName === 'transform' && event.target.matches('.easyread-page-drawer')) {
        window.noteDrawerEntries.push(event.target.getAnimations().flatMap(animation => animation.effect.getKeyframes()).map(frame => frame.transform).filter(Boolean));
      }
    });
  });
  await popup.locator('.easyread-page-note-add').click();
  await popup.waitForFunction(() => window.noteDrawerEntries.length > 0);
  assert.ok((await popup.evaluate(() => window.noteDrawerEntries.flat())).some(value => value === 'translateY(100%)'));
  assert.equal(await popup.locator('.easyread-annotation-empty').count(), 0);
  await popup.locator('#popupAnnotationList textarea').fill('Unsaved drawer text');
  await popup.locator('.easyread-page-note-toggle').click();
  await popup.locator('.easyread-page-drawer').waitFor({ state: 'hidden' });
  await popup.locator('.easyread-page-note-toggle').press('Enter');
  await popup.locator('.easyread-page-drawer').waitFor({ state: 'visible' });
  assert.equal(await popup.locator('#popupAnnotationList textarea').inputValue(), 'Unsaved drawer text');
  await popup.screenshot({ animations: 'disabled', path: join(screenshotDir, 'notes-empty-drawer.png') });
  await popup.locator('#popupAnnotationList textarea').press('Escape');
  await popup.locator('.easyread-annotation-empty').waitFor();
  await worker.evaluate(notes => chrome.storage.local.set({ notes }), drawerBackup);
  await popup.locator('#popupAnnotationList .easyread-annotation-item').first().waitFor();
  console.log('PASS empty-state draft, reversible drawer, keyboard toggle and unsaved text preservation');
  await popup.locator('#annotationDock').click();
  await popup.waitForFunction(() => window.popupCloseRequested === true);
  await article.locator('#easyread-annotation-sidebar').waitFor({ state: 'visible' });
  const popupProtocol = await context.browser().newBrowserCDPSession();
  const observedPopups = [];
  popupProtocol.on('Target.targetInfoChanged', event => {
    if (event.targetInfo.url.endsWith('/popup/popup.html')) observedPopups.push(event.targetInfo);
  });
  await popupProtocol.send('Target.setDiscoverTargets', { discover: true });
  await article.bringToFront();
  await article.locator('.easyread-annotation-popup').click();
  await article.locator('#easyread-annotation-sidebar').waitFor({ state: 'hidden' });
  const normalPopupSession = await context.newCDPSession(popup);
  const normalPopupInfo = await normalPopupSession.send('Target.getTargetInfo');
  let toolbarPopup;
  for (let attempt = 0; attempt < 20 && !toolbarPopup; attempt++) {
    const popupTargets = await popupProtocol.send('Target.getTargets');
    toolbarPopup = popupTargets.targetInfos.find(target => target.targetId !== normalPopupInfo.targetInfo.targetId && target.url.endsWith('/popup/popup.html'));
    if (!toolbarPopup) await popup.waitForTimeout(50);
  }
  toolbarPopup ||= observedPopups.find(target => target.targetId !== normalPopupInfo.targetInfo.targetId);
  assert.ok(toolbarPopup, 'Sidebar return opens the actual toolbar popup');
  await popupProtocol.send('Target.closeTarget', { targetId: toolbarPopup.targetId }).catch(() => {});
  await popup.bringToFront();
  await popup.locator('#tabMedia').click();
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('tabMedia').getAttribute('aria-selected') === 'true');
  await worker.evaluate(() => chrome.storage.session.set({ popupLastTab: { page: 'https://different.example/', tab: 'tabMedia' } }));
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('saveHtmlTitle').textContent);
  assert.equal(await popup.locator('#tabReadLater').getAttribute('aria-selected'), 'true');
  assert.equal(await popup.locator('.saveOption small, .saveOptionHeading small').count(), 0);
  console.log('PASS popup annotation editing, same-page tab memory and different-page reset');
  await popup.locator('#tabAnnotations').click();
  await popup.locator('.easyread-annotation-quote', { hasText: '100% useful' }).waitFor();
  await popup.locator('#tabReadLater').click();
  await popup.locator('.titleAllRecords').waitFor();
  assert.equal(await popup.locator('.titleAllRecords .pageFavicon').count(), 1);
  const historyLayout = await popup.evaluate(() => {
    const list = document.querySelector('.readedTimes');
    const original = list.innerHTML;
    list.innerHTML = '2026/09/13 10:00:00<br>'.repeat(100);
    const card = document.getElementById('outputAllRecords').getBoundingClientRect();
    const rect = list.getBoundingClientRect();
    list.scrollTop = list.scrollHeight;
    const result = { bottomGap: card.bottom - rect.bottom, scrolled: list.scrollTop > 0 };
    list.innerHTML = original;
    return result;
  });
  assert.ok(historyLayout.bottomGap >= 14 && historyLayout.bottomGap <= 16, 'History viewport reaches the card bottom padding');
  assert.equal(historyLayout.scrolled, true, 'Long history scrolls within its available viewport');
  await popup.locator('body').screenshot({ animations: 'disabled', path: join(screenshotDir, 'popup-reading.png') });
  await popup.locator('#outputReadLaters input').check();
  await popup.locator('#outputReadLaters li').waitFor({ state: 'detached' });
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('readLaters')).readLaters[0].status), 2);
  await popup.locator('#tabSavePage').click();
  await popup.locator('body').screenshot({ animations: 'disabled', path: join(screenshotDir, 'popup-save.png') });
  assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await popup.locator('#tabMedia').click();
  await popup.locator('#mediaEmptyState').waitFor();
  assert.equal(await popup.locator('#mediaBadge').isVisible(), false);
  await popup.locator('body').screenshot({ animations: 'disabled', path: join(screenshotDir, 'popup-media-empty.png') });
  // Add a real local video, so detection, preview and metadata cross the content-script boundary.
  await article.evaluate(() => {
    const video = document.createElement('video');
    video.src = '/preview.mp4'; video.controls = true; video.muted = true; video.preload = 'metadata';
    document.body.append(video);
  });
  await article.waitForFunction(() => document.querySelector('video')?.videoWidth === 320);
  await popup.reload();
  await popup.locator('#tabMedia').click();
  await popup.locator('.mediaPlayer video').waitFor();
  await popup.waitForFunction(() => document.querySelector('.mediaPlayer video').videoWidth === 320 && document.querySelector('.mediaFileSize').dataset.known === 'true');
  const media = await popup.evaluate(() => {
    const video = document.querySelector('.mediaPlayer video');
    const player = document.querySelector('.mediaPlayer').getBoundingClientRect();
    const info = document.querySelector('.mediaDetails').getBoundingClientRect();
    return { muted: video.muted, width: video.videoWidth, ratio: player.width / player.height, column: player.width / (player.width + info.width), name: document.querySelector('.mediaCopy strong').textContent };
  });
  assert.equal(media.muted, true);
  assert.equal(await popup.locator('.mediaPlayer video').evaluate(video => video.paused), true);
  await settings.locator('#setting_tab_media').click();
  const mediaAlignment = await settings.evaluate(() => ({ select: document.getElementById('mediaAutoplay').getBoundingClientRect().right, toggle: document.querySelector('#mediaPanel .modernSwitch').getBoundingClientRect().right }));
  assert.ok(Math.abs(mediaAlignment.select - mediaAlignment.toggle) < 1);
  const footerAlignment = await settings.evaluate(() => {
    const menu = document.querySelector('.settingsTabs').getBoundingClientRect();
    return [...document.querySelector('.settingsSidebar .copyright').children].map(element => { const rect = element.getBoundingClientRect(); return Math.abs((rect.left + rect.right) / 2 - (menu.left + menu.right) / 2); });
  });
  assert.ok(footerAlignment.every(offset => offset < 1));
  for (const id of ['setting_tab_read_later', 'setting_tab_data', 'setting_tab_save_page', 'setting_tab_backup']) {
    await settings.locator(`#${id}`).click();
    await settings.evaluate(() => window.scrollTo(0, 0));
    const offset = await settings.evaluate(() => document.querySelector('.settingsPanel:not([hidden]) > h2').getBoundingClientRect().top - document.querySelector('.settingsTabs').getBoundingClientRect().top);
    assert.ok(Math.abs(offset) < 1, `${id} first heading aligns with sidebar top`);
  }
  await settings.locator('#setting_tab_media').click();
  await settings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-alignment.png') });
  assert.equal(await settings.locator('#mediaAutoplay').inputValue(), 'off');
  assert.equal(await settings.locator('#mediaMuted').isChecked(), true);
  await settings.locator('#mediaMuted').uncheck();
  await settings.locator('#mediaMuted').check();
  await popup.waitForFunction(() => document.querySelector('.mediaPlayer video').muted);
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('mediaMuted')).mediaMuted), true);
  await settings.locator('#mediaAutoplay').selectOption('simultaneous');
  await popup.waitForFunction(() => !document.querySelector('.mediaPlayer video').paused);
  await settings.locator('#mediaMuted').uncheck();
  assert.equal(await popup.locator('.mediaPlayer video').evaluate(video => video.muted), true);
  await popup.locator('#tabReadLater').click();
  await popup.waitForFunction(() => document.querySelector('.mediaPlayer video').paused);
  await settings.locator('#mediaAutoplay').selectOption('off');
  await popup.locator('#tabMedia').click();
  await popup.waitForFunction(() => !document.querySelector('.mediaPlayer video').muted);
  assert.ok(Math.abs(media.ratio - 16 / 9) < .02);
  assert.ok(Math.abs(media.column - 1 / 3) < .02);
  assert.match(media.name, /\.mp4$/);
  await popup.locator('body').screenshot({ animations: 'disabled', path: join(screenshotDir, 'popup-media.png') });
  await popup.locator('.mediaSource').click();
  await popup.locator('.mediaSourcePanel a').waitFor();
  assert.ok((await popup.locator('.mediaSourcePanel a').first().getAttribute('href')).endsWith('/preview.mp4'));
  await popup.locator('.mediaDownload').click();
  await popup.waitForFunction(() => !document.querySelector('.mediaDownload').disabled);
  const download = await worker.evaluate(async () => (await chrome.downloads.search({ limit: 1, orderBy: ['-startTime'] }))[0]);
  assert.equal(download?.state, 'complete', await popup.locator('.mediaTask small').textContent());
  assert.equal(download.totalBytes, videoBytes.length);
  console.log('PASS real local MP4 detection, muted preview, exact size, 1/3 layout, sources and download');
  await article.evaluate(() => {
    for (let i = 0; i < 2; i++) { const image = document.createElement('img'); image.src = '/picture.png'; image.alt = 'Picture fixture'; document.body.append(image); }
  });
  await article.waitForFunction(() => [...document.images].filter(image => image.src.endsWith('/picture.png')).every(image => image.complete));
  await popup.reload();
  await popup.locator('#tabMedia').click();
  await popup.locator('[data-media-filter="image"]').click();
  await popup.locator('.popupMediaItem[data-category="image"]').waitFor();
  assert.equal(await popup.locator('.popupMediaItem:visible').count(), 1);
  assert.match(await popup.locator('.popupMediaItem:visible .mediaCopy strong').textContent(), /\.png$/);
  await popup.locator('.popupMediaItem:visible .mediaDownload').click();
  await popup.waitForFunction(() => !document.querySelector('.popupMediaItem[data-category="image"] .mediaDownload').disabled);
  assert.notEqual(await popup.locator('.popupMediaItem[data-category="image"] .mediaTask').getAttribute('data-state'), 'error');
  await popup.locator('[data-media-filter="video"]').click();
  assert.equal(await popup.locator('.popupMediaItem:visible').count(), 1);
  await popup.locator('[data-media-filter="audio"]').click();
  assert.equal(await popup.locator('#mediaEmptyState').isVisible(), true);
  await popup.locator('[data-media-filter="all"]').click();
  assert.equal(await popup.locator('.popupMediaItem:visible').count(), 2);
  await popup.screenshot({ animations: 'disabled', path: join(screenshotDir, 'media-images.png') });
  console.log('PASS image discovery/deduplication/download and All/Video/Audio/Images filtering');
  // Real action popups have a fixed preferred width. Test a constrained height
  // instead of imposing an artificial width the toolbar popup never uses.
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.setViewportSize({ width: 560, height: 480 });
  await popup.locator('#tabSavePage').click();
  assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await popup.locator('[data-capture="markdown"]').scrollIntoViewIfNeeded();
  assert.equal(await popup.evaluate(() => {
    const button = document.querySelector('[data-capture="markdown"]').getBoundingClientRect();
    const panel = document.querySelector('#panelSavePage').getBoundingClientRect();
    return button.top >= panel.top - 1 && button.bottom <= panel.bottom + 1 && panel.bottom <= window.innerHeight;
  }), true);
  await popup.locator('body').screenshot({ animations: 'disabled', path: join(screenshotDir, 'popup-short.png') });

  // Runtime diagnostics: default-off, cross-context collection, one report vs many.
  assert.equal(await popup.locator('.copyright a').count(), 0);
  assert.equal(await popup.locator('.copyrightSpan').textContent(), 'v2.0.0');
  assert.equal(await settings.locator('.copyright a').count(), 3);
  await settings.locator('#setting_tab_general').click();
  assert.equal(await settings.locator('#diagnosticsEnabled').isChecked(), false);
  await settings.locator('#diagnosticsEnabled').check();
  await popup.waitForFunction(() => Boolean(globalThis.EasyReadDiagnostics));
  await popup.evaluate(() => {
    globalThis.EasyReadDiagnostics.stage({ stage: 'test-download' });
    globalThis.EasyReadDiagnostics.record(new Error('Single diagnostic fixture', { cause: new Error('Original cause') }), { source: 'popup-test' }, document.body);
  });
  await settings.waitForFunction(() => document.querySelectorAll('#diagnosticsList li').length === 1);
  await popup.locator('#btnDiagnostics').waitFor();
  assert.equal(await popup.locator('[data-easyread-error-details]').count(), 0);
  const singleDownload = popup.waitForEvent('download');
  await popup.locator('#btnDiagnostics').click();
  const reportFile = await (await singleDownload).path();
  const singleReport = JSON.parse(readFileSync(reportFile, 'utf8'));
  assert.equal(singleReport.reports.length, 1);
  assert.match(singleReport.reports[0].error.stack, /Single diagnostic fixture/);
  assert.match(singleReport.reports[0].error.cause.stack, /Original cause/);
  assert.equal(singleReport.reports[0].stages.at(-1).stage, 'test-download');
  // The same extension's isolated content-script world uses the worker writer.
  const articleSession = await context.newCDPSession(article);
  const worlds = [];
  articleSession.on('Runtime.executionContextCreated', event => worlds.push(event.context));
  await articleSession.send('Runtime.enable');
  const contentWorld = worlds.find(world => world.name.includes(extensionId) || world.origin === `chrome-extension://${extensionId}`);
  assert.ok(contentWorld, JSON.stringify(worlds));
  const contentResult = await articleSession.send('Runtime.evaluate', { contextId: contentWorld.id,
    expression: "globalThis.EasyReadDiagnostics.record(new Error('Content diagnostic fixture'), {source:'content-test'})", returnByValue: true });
  assert.equal(contentResult.exceptionDetails, undefined);
  await settings.waitForFunction(() => document.querySelectorAll('#diagnosticsList li').length === 2);
  const settingsOpened = context.waitForEvent('page');
  await popup.locator('#btnDiagnostics').click();
  const diagnosticSettings = await settingsOpened;
  await diagnosticSettings.waitForURL('**/setting/setting.html#diagnostics');
  await diagnosticSettings.locator('#diagnosticsSection').waitFor();
  assert.equal(await diagnosticSettings.locator('#setting_tab_general').getAttribute('aria-selected'), 'true');
  await diagnosticSettings.waitForFunction(() => document.querySelectorAll('#diagnosticsList li').length === 2);
  const perErrorDownload = diagnosticSettings.waitForEvent('download');
  await diagnosticSettings.locator('#diagnosticsList button').first().click();
  const individual = JSON.parse(readFileSync(await (await perErrorDownload).path(), 'utf8'));
  assert.equal(individual.reports.length, 1);
  assert.match(individual.reports[0].error.stack, /Content diagnostic fixture/);
  await diagnosticSettings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-diagnostics.png') });
  await diagnosticSettings.locator('#diagnosticsEnabled').uncheck();
  await popup.waitForFunction(() => !globalThis.EasyReadDiagnostics);
  await popup.locator('#btnDiagnostics').waitFor({ state: 'hidden' });
  await popup.evaluate(() => chrome.runtime.sendMessage({ command: 'easyreadDiagnosticRecord', report: { error: { message: 'disabled' } } }));
  assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('easyreadDevelopmentErrors')).easyreadDevelopmentErrors)).length, 2);
  await diagnosticSettings.reload();
  await diagnosticSettings.waitForFunction(() => document.querySelectorAll('#diagnosticsList li').length === 2);
  assert.equal(await diagnosticSettings.locator('#diagnosticsEnabled').isChecked(), false);
  await diagnosticSettings.locator('#clearDiagnostics').click();
  await diagnosticSettings.waitForFunction(() => document.querySelectorAll('#diagnosticsList li').length === 0);
  await diagnosticSettings.waitForFunction(() => !document.querySelector('#clearDiagnostics').disabled);
  assert.notEqual(await diagnosticSettings.locator('#output').getAttribute('data-state'), 'error');
  console.log('PASS opt-in diagnostics, original stacks, no overlay, single download, multiple reports deep link, live disable and retained history');

  // Validate persistent format and the four direct actions without substituting
  // fake pixels for a screenshot-engine test: only message/clipboard routing is stubbed.
  await settings.locator('#setting_tab_save_page').click();
  await settings.locator('#screenshotFormat').selectOption('jpeg');
  await settings.waitForFunction(() => !document.querySelector('#screenshotFormat').disabled);
  await settings.reload();
  await settings.locator('#setting_tab_save_page').click();
  await settings.waitForFunction(() => document.querySelector('#screenshotFormat').value === 'jpeg');
  await settings.screenshot({ animations: 'disabled', path: join(screenshotDir, 'settings-save-page.png') });
  await popup.reload();
  await popup.locator('.mediaPlayer video').waitFor({ state: 'attached' });
  await popup.locator('#tabSavePage').click();
  assert.equal(await popup.locator('#imageScope, #imageFormat').count(), 0);
  assert.equal(await popup.locator('.screenshotActions button').count(), 4);
  await popup.evaluate(() => {
    globalThis.__captureRequests = [];
    globalThis.__clipboardTypes = [];
    const send = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = async (id, message) => {
      if (message.command !== 'startCapture') return send(id, message);
      globalThis.__captureRequests.push(message);
      return { ok: true, clipboard: { encoding: 'text', data: 'routing fixture' } };
    };
    navigator.clipboard.write = async items => {
      for (const item of items) { const blob = await item.getType('image/png'); globalThis.__clipboardTypes.push(blob.type); }
    };
  });
  for (const button of await popup.locator('.screenshotActions button').all()) {
    await button.click();
    await popup.waitForFunction(() => !document.querySelector('.screenshotActions button').disabled);
  }
  const routed = await popup.evaluate(() => globalThis.__captureRequests.map(request => request.options));
  assert.deepEqual(routed, [
    { scope: 'viewport', format: 'png', action: 'prepareCopy' },
    { scope: 'fullPage', format: 'png', action: 'prepareCopy' },
    { scope: 'viewport', format: 'jpeg' }, { scope: 'fullPage', format: 'jpeg' }
  ]);
  assert.deepEqual(await popup.evaluate(() => globalThis.__clipboardTypes), ['image/png', 'image/png']);
  assert.deepEqual(await settings.locator('.settingsTab').allTextContents(), await worker.evaluate(() => [
    'setting_tab_general','popup_tab_read_later','popup_tab_read_later','setting_browsing_history','popup_tab_save_page','popup_tab_media','setting_tab_annotations','setting_tab_backup'
  ].map(key => chrome.i18n.getMessage(key))));
  console.log('PASS settings naming/order, contacts only in settings, persistent JPG and four screenshot action routes');
  assert.equal(await popup.locator('#btnAnnotations, #btnAllRecords').count(), 0);
  const heights = await popup.locator('.saveOptions > div').evaluateAll(items => items.map(item => item.getBoundingClientRect().height));
  assert.ok(Math.max(...heights) - Math.min(...heights) < 1, 'Save cards have equal heights');
  const alignment = await popup.evaluate(() => Math.abs(document.querySelector('.copyrightSpan').getBoundingClientRect().right - document.querySelector('.saveOptions').getBoundingClientRect().right));
  assert.ok(alignment < 1, 'Version aligns with cards');
  assert.equal(await settings.locator('.settingsSidebar .copyright > *').count(), 3);
  assert.equal(await settings.locator('.settingsSidebar .copyright > :last-child').textContent(), '©i-whimsy');
  for (const preference of ['en', 'zh-CN', 'auto']) {
    await settings.locator('#setting_tab_general').click();
    await settings.locator('#uiLanguage').selectOption(preference);
    await settings.waitForFunction(value => document.getElementById('uiLanguage')?.value === value && document.getElementById('languageLabel')?.textContent, preference);
    const expectedLanguage = preference === 'auto' ? locale : preference;
    const expectedTitle = expectedLanguage.startsWith('zh') ? '笔记' : 'Notes';
    await popup.reload();
    await popup.locator('#tabAnnotations', { hasText: expectedTitle }).waitFor();
    await article.waitForFunction(title => document.querySelector('.easyread-annotation-header strong')?.textContent === title, expectedTitle);
    assert.equal(await settings.locator('#languageLabel').textContent(), expectedLanguage.startsWith('zh') ? '显示语言' : 'Display Language');
    await settings.locator('#setting_tab_general').click();
    assert.equal(await settings.evaluate(() => {
      const label = window.getComputedStyle(document.getElementById('languageLabel'));
      const diagnostic = window.getComputedStyle(document.getElementById('diagnosticsTitle'));
      const select = document.getElementById('uiLanguage').getBoundingClientRect();
      const block = document.querySelector('.languageRow');
      const right = block.getBoundingClientRect().right - parseFloat(window.getComputedStyle(block).paddingRight) - 1;
      return label.fontSize === diagnostic.fontSize && label.fontWeight === diagnostic.fontWeight && Math.abs(select.right - right) < 1;
    }), true);
  }
  await settings.locator('#setting_tab_data').click();
  await settings.locator('#recordsBody tr').first().waitFor();
  assert.equal(await settings.locator('#recordsBody tr').count(), 500);
  console.log('PASS equal cards, aligned version, sidebar footer, records entry and en/zh/auto language switching');
  assert.deepEqual(errors, []);
  console.log('PASS popup legacy note rendering, complete reading item, empty media badge and save layout');
  console.log(`Screenshots: ${screenshotDir}`);
} finally {
  await context?.close();
  server.close();
}
