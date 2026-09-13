// Repair only a missing receiver, never retry a task whose response port closed.
const connections = new Map();
const missingReceiver = error => /Receiving end does not exist/i.test(error?.message || '');
async function connect(tabId) {
  try {
    const reply = await chrome.tabs.sendMessage(tabId, { command: 'easyreadPing' });
    if (reply?.ok) return;
  } catch (error) { if (!missingReceiver(error)) throw error; }
  const target = { tabId, frameIds: [0] };
  const present = await chrome.scripting.executeScript({ target, func: () => Boolean(globalThis.__easyreadContentReady) });
  if (!present[0]?.result) {
    await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['scripts/snapshotHook.js'] });
    await chrome.scripting.insertCSS({ target, files: ['styles/highlights.css', 'styles/annotations.css', 'styles/capture.css'] });
    await chrome.scripting.executeScript({ target, files: ['scripts/locale.js', 'scripts/diagnostics.js', 'scripts/youtubeMedia.js', 'scripts/snapshotEngine.js', 'scripts/annotationView.js', 'scripts/content.js'] });
  }
  const reply = await chrome.tabs.sendMessage(tabId, { command: 'easyreadPing' });
  if (!reply?.ok) throw new Error((globalThis.EasyReadLocale || chrome.i18n).getMessage('capture_page_reconnect_failed'));
}
export async function sendPageMessage(tabId, message) {
  try { return await chrome.tabs.sendMessage(tabId, message); }
  catch (error) {
    if (!missingReceiver(error)) throw error;
    if (!connections.has(tabId)) {
      const pending = connect(tabId).finally(() => connections.delete(tabId));
      connections.set(tabId, pending);
    }
    try { await connections.get(tabId); }
    catch (cause) { throw new Error((globalThis.EasyReadLocale || chrome.i18n).getMessage('capture_page_reconnect_failed'), { cause }); }
    return chrome.tabs.sendMessage(tabId, message);
  }
}
