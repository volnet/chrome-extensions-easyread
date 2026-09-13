/* Local, explicitly opt-in diagnostics. No webpage UI or remote reporting. */
(() => {
  if (globalThis.EasyReadDiagnosticStore) return;
  const storageKey = 'easyreadDevelopmentErrors'; // Preserve existing reports.
  const preferenceKey = 'diagnosticsEnabled';
  const worker = typeof document === 'undefined';
  const stages = [];
  const originals = new Map();
  let enabled = false;
  let revision = 0;
  let writeQueue = Promise.resolve();

  function serialize(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map(item => serialize(item, seen));
    const result = {};
    const keys = new Set([...Object.keys(value), ...('message' in value ? ['name', 'message', 'stack', 'cause'] : [])]);
    for (const key of keys) {
      if (/^(cookie|authorization|password|access_token|refresh_token)$/i.test(key)) { result[key] = '[Redacted]'; continue; }
      try { result[key] = serialize(value[key], seen); } catch { result[key] = '[Unavailable]'; }
    }
    return result;
  }
  function download(reports) {
    if (worker || !reports.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'easyread-error-v1', reports }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `EasyRead-errors-${Date.now()}.json`;
    document.documentElement.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function persist(report) {
    // One worker writer prevents simultaneous pages overwriting one another.
    const capturedRevision = revision;
    writeQueue = writeQueue.then(async () => {
      const data = await chrome.storage.local.get([storageKey, preferenceKey]);
      if (!enabled || capturedRevision !== revision || data[preferenceKey] !== true) return;
      const previous = Array.isArray(data[storageKey]) ? data[storageKey] : [];
      await chrome.storage.local.set({ [storageKey]: [...previous, { ...report, id: crypto.randomUUID() }].slice(-100) });
    }).catch(() => {});
    return writeQueue;
  }
  function record(error, context = {}) {
    if (!enabled) return;
    let manifest = {};
    try { manifest = chrome.runtime.getManifest(); } catch { /* Context invalidated. */ }
    const report = serialize({ at: new Date().toISOString(), extensionVersion: manifest.version,
      userAgent: navigator.userAgent, page: { url: location.href, title: worker ? '' : document.title },
      error: error?.message ? error : { message: String(error) }, stages: [...stages], context });
    if (worker) persist(report);
    else {
      try { chrome.runtime.sendMessage({ command: 'easyreadDiagnosticRecord', report }).catch(() => {}); } catch { /* Context invalidated. */ }
    }
    return report;
  }
  function stage(detail) {
    if (!enabled) return;
    stages.push({ at: new Date().toISOString(), ...serialize(detail) });
    if (stages.length > 250) stages.shift();
  }
  function onError(event) {
    if (!worker && location.protocol !== 'chrome-extension:' && event.filename && !event.filename.startsWith('chrome-extension:')) return;
    if (event.error) record(event.error, { source: 'uncaught', filename: event.filename, line: event.lineno, column: event.colno });
  }
  function onRejection(event) { record(event.reason, { source: 'unhandledrejection' }); }
  function configure(value) {
    if (enabled === value) return;
    enabled = value;
    revision++;
    stages.length = 0;
    if (enabled) {
      // Existing callers may still pass a target; never inject diagnostic DOM.
      globalThis.EasyReadDiagnostics = { record, serialize, stage, download, attach() {} };
      globalThis.addEventListener('error', onError);
      globalThis.addEventListener('unhandledrejection', onRejection);
      for (const method of ['log', 'error']) {
        const original = console[method];
        const wrapper = (...args) => {
          original.apply(console, args);
          const error = args.find(value => value instanceof Error);
          if (error || method === 'error') record(error || args.join(' '), { source: `console.${method}` });
        };
        originals.set(method, { original, wrapper });
        console[method] = wrapper;
      }
    } else {
      delete globalThis.EasyReadDiagnostics;
      globalThis.removeEventListener('error', onError);
      globalThis.removeEventListener('unhandledrejection', onRejection);
      for (const [method, { original, wrapper }] of originals) if (console[method] === wrapper) console[method] = original;
      originals.clear();
    }
  }
  let preferenceRevision = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[preferenceKey]) return;
    preferenceRevision++;
    configure(changes[preferenceKey].newValue === true);
  });
  const ready = chrome.storage.local.get(preferenceKey).then(data => {
    if (preferenceRevision === 0) configure(data[preferenceKey] === true);
  }).catch(() => {});
  globalThis.EasyReadDiagnosticStore = { storageKey, preferenceKey, ready, download };
  if (worker) chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.command === 'easyreadDiagnosticClear') {
      // Clearing is ordered with writes so an in-flight report cannot restore old history.
      writeQueue = writeQueue.catch(() => {}).then(() => chrome.storage.local.remove(storageKey));
      writeQueue.then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
      return true;
    }
    if (message?.command !== 'easyreadDiagnosticRecord') return;
    ready.then(() => {
      if (enabled && message.report && typeof message.report === 'object')
        persist({ ...message.report, sender: { url: sender.url, tabId: sender.tab?.id } });
    });
  });
})();
