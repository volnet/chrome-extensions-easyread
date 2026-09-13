import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers';

const source = readFileSync(new URL('../src/scripts/diagnostics.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('generic background listener never acknowledges diagnostic RPCs', () => {
  const background = readFileSync(new URL('../src/scripts/background.js', import.meta.url), 'utf8');
  const listenerSource = background.slice(background.indexOf('chrome.runtime.onMessage.addListener((message, sender, respond)'), background.indexOf('function updateStorageCallbackVideoProgress'));
  let handler;
  vm.runInNewContext(listenerSource, {
    chrome: { runtime: { onMessage: { addListener(fn) { handler = fn; } } } },
    easyReadTools: { getKey: () => 'page' }
  });
  const replies = [];
  for (const command of ['easyreadDiagnosticClear', 'easyreadDiagnosticRecord']) handler({ command }, { tab: { url: 'https://example.com' } }, value => replies.push(value));
  assert.deepEqual(replies, []);
});
async function environment(enabled = false) {
  const data = { diagnosticsEnabled: enabled };
  const listeners = {};
  let storageListener, messageListener;
  const context = vm.createContext({
    console: { log() {}, error() {} }, crypto: { randomUUID },
    navigator: { userAgent: 'test' }, location: { href: 'chrome-extension://test/background.js' },
    chrome: { runtime: { id: 'test', getManifest: () => ({ version: '2.0.0' }), onMessage: { addListener(fn) { messageListener = fn; } } },
      storage: { onChanged: { addListener(fn) { storageListener = fn; } }, local: {
        get: async () => ({ ...data }), set: async value => Object.assign(data, value)
      } } },
    addEventListener: (name, handler) => { listeners[name] = handler; },
    removeEventListener: name => { delete listeners[name]; }
  });
  vm.runInContext(source, context);
  await context.EasyReadDiagnosticStore.ready;
  return { context, data, listeners,
    toggle(value) { data.diagnosticsEnabled = value; storageListener({ diagnosticsEnabled: { newValue: value } }, 'local'); },
    receive(report, sender = { id: 'test', tab: { id: 1 } }) { messageListener({ command: 'easyreadDiagnosticRecord', report }, sender); }
  };
}
test('diagnostics default off: no error hooks, console interception or recorded errors', async () => {
  const { context, listeners, data } = await environment();
  assert.equal(context.EasyReadDiagnostics, undefined);
  assert.deepEqual(listeners, {});
  assert.equal(data.easyreadDevelopmentErrors, undefined);
});
test('opt-in diagnostics preserve stacks, causes, context and circular values without UI', async () => {
  const { context, data } = await environment(true);
  vm.runInContext(`const failure = new Error('capture failed', { cause: new Error('underlying') });
    failure.details = { password:'secret' }; failure.details.self = failure.details;
    EasyReadDiagnostics.stage({stage:'cloning'}); EasyReadDiagnostics.record(failure,{operation:'html'});`, context);
  await tick();
  const report = data.easyreadDevelopmentErrors[0];
  assert.match(report.error.stack, /capture failed/);
  assert.match(report.error.cause.stack, /underlying/);
  assert.equal(report.error.details.password, '[Redacted]');
  assert.equal(report.error.details.self, '[Circular]');
  assert.equal(report.stages[0].stage, 'cloning');
  assert.ok(report.id);
  assert.doesNotMatch(source, /attachShadow|position:fixed|createElement\('details'\)/);
});
test('disabling removes hooks immediately, retains reports, rejects stale recording handles', async () => {
  const env = await environment();
  const originalConsole = env.context.console.error;
  env.toggle(true);
  const api = env.context.EasyReadDiagnostics;
  api.record('first'); await tick();
  env.toggle(false);
  api.record('late'); api.stage({ stage: 'late' });
  env.receive({ error: { message: 'late child' } }); await tick();
  assert.equal(env.context.EasyReadDiagnostics, undefined);
  assert.equal(env.context.console.error, originalConsole);
  assert.deepEqual(env.listeners, {});
  assert.equal(env.data.easyreadDevelopmentErrors.length, 1);
  env.toggle(true);
  env.context.EasyReadDiagnostics.record('second'); await tick();
  assert.equal(env.data.easyreadDevelopmentErrors.length, 2);
  assert.equal(env.data.easyreadDevelopmentErrors[1].stages.length, 0);
});
test('worker serializes simultaneous reports, rejects foreign senders and bounds history', async () => {
  const env = await environment(true);
  env.receive({ error: { message: 'foreign' } }, { id: 'other' });
  for (let i = 0; i < 105; i++) env.receive({ error: { message: String(i) } });
  await tick();
  assert.equal(env.data.easyreadDevelopmentErrors.length, 100);
  assert.equal(env.data.easyreadDevelopmentErrors[0].error.message, '5');
  assert.equal(new Set(env.data.easyreadDevelopmentErrors.map(r => r.id)).size, 100);
});
