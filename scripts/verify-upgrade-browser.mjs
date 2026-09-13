/* global chrome, document, setTimeout */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.EASYREAD_PLAYWRIGHT || 'C:/Users/gongcen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const directory = mkdtempSync(join(tmpdir(), 'easyread-v101-upgrade-'));
const archive = join(directory, 'legacy.tar');
execFileSync('git', ['archive', 'v1.0.1', 'src', '--output', archive]);
execFileSync('tar', ['-xf', archive, '-C', directory]);
const extension = join(directory, 'src'), profile = join(directory, 'profile');
// git archive contains LFS pointers: hydrate only images from the verified matching source artwork.
cpSync(resolve('src/assets/logo'), join(extension, 'assets/logo'), { recursive: true });
const launch = () => chromium.launchPersistentContext(profile, {
  executablePath: process.env.EASYREAD_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'],
  viewport: { width: 1280, height: 900 }
});
const workerFor = async context => context.serviceWorkers()[0] || context.waitForEvent('serviceworker', { timeout: 15000 });
const key = 'https://example.com/legacy?mode=reading';
const data = {
  allRecords: { [key]: { title: 'v1.0.1 历史文章', url: key, datetimes: [1684800000000, 1684900000000], position: { scrollX: 0, scrollY: 420, progress: 42 } } },
  readLaters: [0, 1, 2].map(status => ({ key: key + status, title: '历史稍后阅读 ' + status, status, createDateTime: 1684800000000 + status, position: { scrollY: 150, progress: 15 } })),
  notes: { [key]: { title: 'v1.0.1 历史文章', url: key, createDateTime: 1684800000000, notes: [
    { id: 'v101-original', selectionText: encodeURIComponent('原文\n100% retained'), createDateTime: 1684800000000 }
  ] } }, customSetting: { retain: true }
};
let context;
try {
  context = await launch();
  let worker = await workerFor(context);
  const oldId = new URL(worker.url()).host;
  assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), '1.0.1');
  await worker.evaluate(async data => { await chrome.storage.local.clear(); await chrome.storage.local.set(data); }, data);
  assert.deepEqual(await worker.evaluate(() => chrome.storage.local.get(null)), data);
  await context.close(); context = null;
  // Same unpacked path and profile preserve extension identity and its real Chrome storage.
  cpSync(resolve('dist/production'), extension, { recursive: true });
  context = await launch(); worker = await workerFor(context);
  // Updating unpacked files does not invalidate Chromium's cached worker scripts.
  // Explicit extension reload is the unpacked equivalent of applying the new package.
  const reloadedWorker = context.waitForEvent('serviceworker', { timeout: 15000 });
  await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
  worker = await reloadedWorker;
  assert.equal(new URL(worker.url()).host, oldId);
  assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), '2.0.0');
  // Do not invoke a Notes RPC: verify migration occurs automatically after updating.
  await worker.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      if ((await chrome.storage.local.get('notesSchemaVersion')).notesSchemaVersion === 2) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Upgrade did not migrate automatically');
  });
  const after = await worker.evaluate(() => chrome.storage.local.get(null));
  for (const name of Object.keys(data)) assert.deepEqual(after[name], data[name], `Upgrade changed ${name}`);
  assert.deepEqual(after.notesMigrationBackupV1.notes, data.notes);
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${oldId}/setting/setting.html`);
  await settings.locator('#setting_tab_read_later').click();
  await settings.waitForFunction(() => document.querySelectorAll('#settingsReadLaterList li').length === 2);
  await settings.locator('#readLaterCompleted summary').click();
  await settings.locator('#settingsReadLaterCompletedList li').waitFor();
  const output = resolve('output/release-upgrade'); mkdirSync(output, { recursive: true });
  await settings.screenshot({ path: join(output, 'v101-to-v200-production.png') });
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('notes'))).notes, data.notes);
  console.log('PASS actual v1.0.1 -> production 2.0.0, same extension ID/profile, automatic migration, exact legacy-data retention and read-state rendering');
} finally { await context?.close(); }
