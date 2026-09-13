import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPageMessage } from '../src/scripts/pageConnection.mjs';

test('missing page receiver is bootstrapped once for concurrent callers', async () => {
  let ready = false;
  const injections = [];
  globalThis.chrome = {
    i18n: { getMessage: () => 'Refresh this page' },
    tabs: { sendMessage: async (_id, message) => {
      if (!ready) throw new Error('Could not establish connection. Receiving end does not exist.');
      return { ok: true, command: message.command };
    } },
    scripting: {
      insertCSS: async () => {},
      executeScript: async options => {
        if (options.func) return [{ result: false }];
        injections.push(options.files);
        if (options.files.includes('scripts/content.js')) ready = true;
      }
    }
  };
  const results = await Promise.all([sendPageMessage(42, { command: 'startCapture' }), sendPageMessage(42, { command: 'getMediaCandidates' })]);
  assert.ok(results.every(result => result.ok));
  assert.equal(injections.filter(files => files.includes('scripts/content.js')).length, 1);
});
test('a closed response port must not retry a potentially started download', async () => {
  let calls = 0;
  globalThis.chrome = { tabs: { sendMessage: async () => { calls++; throw new Error('The message port closed before a response was received.'); } } };
  await assert.rejects(sendPageMessage(43, { command: 'startCapture' }), /port closed/);
  assert.equal(calls, 1);
});
test('site access denial surfaces a localized message with the original cause', async () => {
  globalThis.chrome = {
    tabs: { sendMessage: async () => { throw new Error('Receiving end does not exist.'); } },
    i18n: { getMessage: () => 'Refresh this page and check access' },
    scripting: { executeScript: async () => { throw new Error('Cannot access contents of url'); } }
  };
  await assert.rejects(sendPageMessage(44, { command: 'startCapture' }), error => error.message.includes('Refresh') && error.cause.message.includes('Cannot access'));
});
