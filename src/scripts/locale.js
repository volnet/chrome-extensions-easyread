// Local dictionaries only: no remote translation service or browser API mutation.
(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.storage?.local || !chrome.i18n) return;
  if (globalThis.EasyReadLocale) return;
  const native = chrome.i18n;
  let preference = 'auto', dictionary = null, revision = 0;
  const language = () => preference === 'auto' ? native.getUILanguage() : preference;
  async function load(value) {
    const current = ++revision;
    const selected = ['en', 'zh-CN'].includes(value) ? value : 'auto';
    let messages = null;
    if (selected !== 'auto') {
      const locale = selected === 'zh-CN' ? 'zh_CN' : 'en';
      if (typeof location !== 'undefined' && location.protocol !== 'chrome-extension:') {
        messages = await chrome.runtime.sendMessage({ command: 'easyreadLocaleDictionary', locale });
      } else {
        const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
        if (!response.ok) throw new Error('Unable to load local language dictionary');
        messages = await response.json();
      }
    }
    if (current !== revision) return;
    preference = selected; dictionary = messages;
    if (typeof document !== 'undefined') {
      if (location.protocol === 'chrome-extension:') document.documentElement.lang = language();
      document.dispatchEvent(new globalThis.Event('easyread-language-changed'));
    }
  }
  if (typeof document === 'undefined') chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.command !== 'easyreadLocaleDictionary' || sender.id !== chrome.runtime.id) return;
    if (!['en', 'zh_CN'].includes(message.locale)) { respond(null); return; }
    fetch(chrome.runtime.getURL(`_locales/${message.locale}/messages.json`)).then(response => response.json()).then(respond, () => respond(null));
    return true;
  });
  const api = {
    getUILanguage: language,
    getMessage(name, substitutions) {
      const entry = dictionary?.[name];
      if (!entry) return native.getMessage(name, substitutions);
      const values = Array.isArray(substitutions) ? substitutions : substitutions === undefined ? [] : [substitutions];
      return entry.message.replace(/\$([a-zA-Z_][\w]*)\$/g, (match, key) => {
        const placeholder = Object.entries(entry.placeholders || {}).find(([id]) => id.toLowerCase() === key.toLowerCase())?.[1];
        return placeholder?.content || match;
      }).replace(/\$(\d+)/g, (_, index) => String(values[Number(index) - 1] ?? '')).replace(/\$\$/g, '$');
    },
    ready: null
  };
  globalThis.EasyReadLocale = api;
  api.ready = chrome.storage.local.get('uiLanguage').then(data => load(data.uiLanguage)).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.uiLanguage) api.ready = load(changes.uiLanguage.newValue).catch(() => {});
  });
})();
