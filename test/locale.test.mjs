import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
const source = readFileSync(new URL('../src/scripts/locale.js', import.meta.url), 'utf8');
test('explicit language uses packaged dictionary and substitutes named placeholders', async () => {
  let changed;
  const native = { getUILanguage: () => 'zh-CN', getMessage: key => `native:${key}` };
  const context = vm.createContext({
    chrome: { i18n: native, runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({ uiLanguage: 'en' }) }, onChanged: { addListener: callback => { changed = callback; } } } },
    fetch: async url => {
      assert.ok(url.endsWith('/_locales/en/messages.json'));
      return { ok: true, json: async () => ({ greeting: { message: 'Hello $NAME$: $2', placeholders: { name: { content: '$1' } } } }) };
    }
  });
  vm.runInContext(source, context);
  const api = context.EasyReadLocale;
  await api.ready;
  assert.equal(api.getMessage('greeting', ['reader', '2']), 'Hello reader: 2');
  assert.equal(api.getUILanguage(), 'en');
  assert.equal(api.getMessage('missing'), 'native:missing');
  assert.equal(native.getUILanguage(), 'zh-CN', 'Native browser API remains unchanged');
  changed({ uiLanguage: { newValue: 'auto' } }, 'local');
  await api.ready;
  assert.equal(api.getUILanguage(), 'zh-CN');
  assert.equal(api.getMessage('greeting'), 'native:greeting');
});
