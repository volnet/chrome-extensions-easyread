/* Enabled only by the development build. No remote reporting. */
(() => {
  const DEVELOPMENT_DIAGNOSTICS = false;
  if (!DEVELOPMENT_DIAGNOSTICS || globalThis.EasyReadDiagnostics) return;
  const storageKey = "easyreadDevelopmentErrors";
  const worker = typeof document === "undefined";
  const recent = [];
  const stages = [];
  const labels = Object.fromEntries(["diagnostics_details", "diagnostics_dismiss", "diagnostics_download_all", "capture_media_debug_download"].map(key => [key, chrome.i18n.getMessage(key)]));
  let writeQueue = Promise.resolve();
  let panel;

  function serialize(value, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") return typeof value === "bigint" ? String(value) : value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.map(item => serialize(item, seen));
    const result = {};
    const keys = new Set([...Object.keys(value), ...("message" in value ? ["name", "message", "stack", "cause"] : [])]);
    for (const key of keys) {
      if (/^(cookie|authorization|password|access_token|refresh_token)$/i.test(key)) { result[key] = "[Redacted]"; continue; }
      try { result[key] = serialize(value[key], seen); } catch { result[key] = "[Unavailable]"; }
    }
    return result;
  }

  function label(key) { return labels[key]; }
  function download(reports) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: "easyread-error-v1", reports }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `EasyRead-errors-${Date.now()}.json`;
    document.documentElement.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function attach(target, report) {
    if (!target || !report) return;
    target.querySelector("[data-easyread-error-details]")?.remove();
    const details = document.createElement("details");
    details.dataset.easyreadErrorDetails = "true";
    details.dataset.easyreadUi = "true";
    const summary = document.createElement("summary");
    summary.textContent = label("diagnostics_details");
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(report, null, 2);
    pre.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-size:11px";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label("capture_media_debug_download");
    button.onclick = () => download([report]);
    details.append(summary, pre, button);
    target.append(details);
  }

  function show(report) {
    if (worker || !document.documentElement) return;
    recent.push(report);
    if (recent.length > 30) recent.shift();
    if (!panel) {
      const host = document.createElement("div");
      host.dataset.easyreadUi = "true";
      host.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:2147483647;max-width:min(380px,90vw)";
      panel = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = ":host{font:12px/1.5 system-ui;color:#252525}section{padding:8px 12px;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 4px 20px #0002;max-height:45vh;overflow:auto}button{font:inherit;color:inherit;background:#f3f4f6;border:1px solid #ddd;border-radius:6px;padding:5px 9px;cursor:pointer}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}";
      panel.append(style, document.createElement("section"));
      document.documentElement.append(host);
    }
    const section = panel.querySelector("section");
    section.replaceChildren();
    const dismiss = document.createElement("button");
    dismiss.textContent = label("diagnostics_dismiss");
    dismiss.onclick = () => { panel.host.remove(); panel = null; };
    const all = document.createElement("button");
    all.textContent = label("diagnostics_download_all");
    all.onclick = () => download(recent);
    section.append(dismiss, all);
    attach(section, report);
  }

  function persist(report) {
    writeQueue = writeQueue.then(async () => {
      const data = await chrome.storage.local.get(storageKey);
      const list = [...(data[storageKey] || []), report].slice(-30);
      await chrome.storage.local.set({ [storageKey]: list });
    }).catch(() => {});
  }

  function record(error, context = {}, target) {
    let manifest = {};
    try { manifest = chrome.runtime.getManifest(); } catch { /* Context may have been invalidated. */ }
    const report = serialize({ at: new Date().toISOString(), extensionVersion: manifest.version,
      userAgent: navigator.userAgent, page: { url: location.href, title: worker ? "" : document.title },
      error: error?.message ? error : { message: String(error) }, stages: [...stages], context });
    if (worker) persist(report);
    else {
      try { chrome.runtime.sendMessage({ command: "easyreadDiagnosticRecord", report }).catch(() => {}); } catch { /* Keep the in-page report after extension reload. */ }
      if (target) attach(target, report); else if (target !== false) show(report);
    }
    return report;
  }
  function stage(detail) {
    stages.push({ at: new Date().toISOString(), ...serialize(detail) });
    if (stages.length > 250) stages.shift();
  }
  globalThis.EasyReadDiagnostics = { record, serialize, attach, download, stage };
  globalThis.addEventListener("error", event => {
    if (!worker && location.protocol !== "chrome-extension:" && event.filename && !event.filename.startsWith("chrome-extension:")) return;
    if (event.error) record(event.error, { source: "uncaught", filename: event.filename, line: event.lineno, column: event.colno });
  });
  globalThis.addEventListener("unhandledrejection", event => record(event.reason, { source: "unhandledrejection" }));
  for (const method of ["log", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      const error = args.find(value => value instanceof Error);
      if (error || method === "error") record(error || args.join(" "), { source: `console.${method}` });
    };
  }
  if (worker) chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.command === "easyreadDiagnosticRecord" && sender.id === chrome.runtime.id) {
      persist({ ...message.report, sender: { url: sender.url, tabId: sender.tab?.id } });
    }
  });
  else if (location.protocol === "chrome-extension:") {
    const restore = () => chrome.storage.local.get(storageKey).then(data => {
      const reports = data[storageKey] || [];
      recent.push(...reports.slice(-29, -1));
      if (reports.length) show(reports.at(-1));
    }).catch(() => {});
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restore, { once: true }); else restore();
  }
})();
