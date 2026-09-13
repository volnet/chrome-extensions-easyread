import "../scripts/diagnostics.js";
import * as easyReadTools from "../scripts/easyReadTools.js";
import { initializeTabs } from '../scripts/ui.js';
import { sendPageMessage } from '../scripts/pageConnection.mjs';
import { initializePopupAnnotations, renderPopupAnnotations } from './popupAnnotations.mjs';
import { MediaPlayback } from './mediaPlayback.mjs';
const mediaPlayback = new MediaPlayback();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.mediaAutoplay || changes.mediaMuted)) {
    chrome.storage.local.get(['mediaAutoplay', 'mediaMuted']).then(stored => mediaPlayback.configure(stored)).catch(console.error);
  }
});
window.addEventListener('message', event => {
  if (event.origin !== 'https://player.vimeo.com') return;
  const player = [...document.querySelectorAll('.mediaPlayer')].find(element => element.querySelector('iframe')?.contentWindow === event.source);
  if (!player) return;
  let data = event.data;
  try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
  const send = message => event.source.postMessage(message, event.origin);
  if (data?.event === 'ready') {
    send({ method: 'addEventListener', value: 'ended' });
    send({ method: 'addEventListener', value: 'volumechange' });
    player.__mediaAdapter?.mute(mediaPlayback.muted);
    if (document.getElementById('panelMedia').hidden) player.__mediaAdapter?.pause();
  }
  if (data?.event === 'ended') mediaPlayback.ended(player.__mediaAdapter);
  if (data?.event === 'volumechange' && mediaPlayback.preferences.mode === 'simultaneous' && data.data?.volume > 0) send({ method: 'setVolume', value: 0 });
});
await globalThis.EasyReadLocale?.ready;
// A one-shot entrance must not restart when keyboard/pointer modality changes.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const entrance = document.querySelector('.popupShell').animate(
    [{ opacity: .25, transform: 'translateY(-5px) scale(.98)' }, { opacity: 1, transform: 'none' }],
    { duration: 150, easing: 'cubic-bezier(.23,1,.32,1)' }
  );
  document.addEventListener('keydown', () => entrance.cancel(), { once: true });
}

const diagnosticStore = globalThis.EasyReadDiagnosticStore;
const diagnosticButton = document.getElementById('btnDiagnostics');
let diagnosticRevision = 0;
async function refreshDiagnosticIndicator() {
  const revision = ++diagnosticRevision;
  const data = await chrome.storage.local.get([diagnosticStore.storageKey, diagnosticStore.preferenceKey]);
  if (revision !== diagnosticRevision) return;
  const reports = Array.isArray(data[diagnosticStore.storageKey]) ? data[diagnosticStore.storageKey] : [];
  diagnosticButton.hidden = data[diagnosticStore.preferenceKey] !== true || reports.length === 0;
  diagnosticButton.title = easyReadTools.getMessageForLocales(reports.length === 1 ? 'diagnostics_single' : 'diagnostics_multiple', [String(reports.length)]);
  diagnosticButton.setAttribute('aria-label', diagnosticButton.title);
}
diagnosticButton.addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get([diagnosticStore.storageKey, diagnosticStore.preferenceKey]);
    if (data[diagnosticStore.preferenceKey] !== true) return;
    const reports = Array.isArray(data[diagnosticStore.storageKey]) ? data[diagnosticStore.storageKey] : [];
    if (reports.length === 1) diagnosticStore.download(reports);
    else if (reports.length > 1) await chrome.tabs.create({ url: chrome.runtime.getURL('setting/setting.html#diagnostics') });
  } catch (error) { showMessages(error.message); }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[diagnosticStore.preferenceKey]?.newValue !== true && changes[diagnosticStore.preferenceKey]) mediaDebugStages.clear();
  if (changes[diagnosticStore.storageKey] || changes[diagnosticStore.preferenceKey]) refreshDiagnosticIndicator().catch(() => {});
});
refreshDiagnosticIndicator().catch(() => {});

/* showMessages to notify users */
let messageTimer;
function showMessages(message) {
  clearTimeout(messageTimer);
  document.getElementById("outputMesssages").textContent = message;
  messageTimer = setTimeout(function () {
    document.getElementById("outputMesssages").textContent = "";
  }, 3000);
}

/* -------- Popup Title -------- */

function onPageLoad_InitTitle() {
  document.getElementById("popupTitle").textContent = easyReadTools.getMessageForLocales("popup_page_title");
  document.title = 'EasyRead';
  const labels = { btnReadedAndRemove: 'ui_remove_page_records' };
  for (const [id, key] of Object.entries(labels)) {
    const button = document.getElementById(id);
    button.title = easyReadTools.getMessageForLocales(key);
    button.setAttribute('aria-label', button.title);
  }
}

let activeTab;
let captureBusy = false;
function setCaptureBusy(value) {
  captureBusy = value;
  document.querySelectorAll('[data-capture], [data-copy]').forEach(button => button.disabled = value);
}
let mediaItems = [];
let mediaFilter = 'all';
function mediaCategory(item) {
  if (item.kind === 'image' || /^image\//i.test(item.mimeType || '')) return 'image';
  if (item.kind === 'audio' || item.trackType === 'audio' || /^audio\//i.test(item.mimeType || '') || /\.(mp3|m4a|aac|wav|oga|flac)(?:[?#]|$)/i.test(item.url)) return 'audio';
  return 'video';
}
function applyMediaFilter() {
  mediaPlayback.reset();
  let visible = 0;
  document.querySelectorAll('#mediaList .popupMediaItem').forEach(row => {
    row.hidden = mediaFilter !== 'all' && row.dataset.category !== mediaFilter;
    if (!row.hidden) { visible++; if (row.__mediaAdapter) mediaPlayback.register(row.__mediaAdapter); }
  });
  document.getElementById('mediaEmptyState').hidden = visible > 0;
  document.getElementById('mediaEmptyTitle').textContent = easyReadTools.getMessageForLocales(mediaItems.length && !visible ? 'media_filter_empty' : 'capture_media_none');
  document.getElementById('mediaList').hidden = visible === 0;
  document.querySelectorAll('[data-media-filter]').forEach(button => { button.setAttribute('aria-selected', String(button.dataset.mediaFilter === mediaFilter)); button.tabIndex = button.dataset.mediaFilter === mediaFilter ? 0 : -1; });
  mediaPlayback.activate(!document.getElementById('panelMedia').hidden);
}
const mediaDebugStages = new Map();
const mediaProgressStats = new Map();

function addMediaDebugStage(index, stage, details = {}) {
  if (!globalThis.EasyReadDiagnostics) return;
  const stages = mediaDebugStages.get(index) ?? [];
  stages.push({ at: new Date().toISOString(), stage: String(stage || ""), ...details });
  mediaDebugStages.set(index, stages.slice(-250));
}


async function getActiveSupportedTab() {
  if (!activeTab) [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab?.id && easyReadTools.isSupportedScheme(activeTab.url) ? activeTab : null;
}

function selectPopupTab(tabButton) {
  mediaPlayback.activate(tabButton.id === 'tabMedia');
  document.querySelectorAll(".popupTab").forEach((button) => {
    const selected = button === tabButton;
    button.classList.toggle("isActive", selected);
    button.setAttribute("aria-selected", String(selected));
    document.getElementById(button.getAttribute("aria-controls")).hidden = !selected;
  });
  if (activeTab?.url) chrome.storage.session.set({ popupLastTab: { page: easyReadTools.getKey(activeTab.url), tab: tabButton.id } }).catch(console.error);
  if (tabButton.id === 'tabAnnotations') renderPopupAnnotations().catch(error => showMessages(error.message));
}

function renderTaskProgress(message) {
  globalThis.EasyReadDiagnostics?.stage(message);
  const task = document.getElementById("captureTask");
  task.hidden = false;
  document.getElementById("captureTaskTitle").textContent = message.title || easyReadTools.getMessageForLocales("capture_task_title");
  document.getElementById("captureTaskPercent").textContent = `${Math.round(message.percent || 0)}%`;
  document.getElementById("captureProgress").value = message.percent || 0;
  document.getElementById("captureTaskStage").textContent = message.stage || "";
}

async function startCapture(type, options = {}) {
  if (captureBusy) return;
  const tab = await getActiveSupportedTab();
  if (!tab) return;
  setCaptureBusy(true);
  renderTaskProgress({ percent: 2, stage: easyReadTools.getMessageForLocales("capture_stage_starting") });
  try {
    if (type === "html") {
      renderTaskProgress({ percent: 3, stage: easyReadTools.getMessageForLocales("capture_stage_permission") });
      options.crossOriginAccess = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
    }
    const result = await sendPageMessage(tab.id, {
      command: "startCapture",
      type,
      options
    });
    if (!result?.ok) throw Object.assign(new Error(result?.error || easyReadTools.getMessageForLocales("capture_status_failed")), { debug: result?.debug });
  } catch (error) {
    renderTaskProgress({ percent: 100, title: easyReadTools.getMessageForLocales("capture_status_failed"), stage: error.message });
    globalThis.EasyReadDiagnostics?.record(error, { operation: "save", type, options, page: tab }, document.getElementById("captureTask"));
  } finally { setCaptureBusy(false); }
}

async function copyCapture(type, options = {}) {
  if (captureBusy) return;
  const tab = await getActiveSupportedTab();
  if (!tab) return;
  setCaptureBusy(true);
  renderTaskProgress({ percent: 2, stage: easyReadTools.getMessageForLocales("capture_stage_starting") });
  const mimeType = type === "image" ? "image/png" : "text/plain";
  const contentPromise = sendPageMessage(tab.id, {
    command: "startCapture",
    type,
    options: { ...options, action: "prepareCopy" }
  }).then(async (result) => {
    if (!result?.ok || !result.clipboard) throw Object.assign(new Error(result?.error || easyReadTools.getMessageForLocales("capture_status_failed")), { debug: result?.debug });
    if (result.clipboard.encoding === "text") return new Blob([result.clipboard.data], { type: mimeType });
    return (await fetch(result.clipboard.data)).blob();
  });
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mimeType]: contentPromise })]);
    renderTaskProgress({ percent: 100, stage: easyReadTools.getMessageForLocales("capture_status_copied") });
  } catch (error) {
    renderTaskProgress({ percent: 100, title: easyReadTools.getMessageForLocales("capture_status_failed"), stage: error.message });
    globalThis.EasyReadDiagnostics?.record(error, { operation: "clipboard", type, page: tab }, document.getElementById("captureTask"));
  } finally { setCaptureBusy(false); }
}

function mediaName(item, index) {
  try {
    const name = new URL(item.url).pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(name || `${item.kind} ${index + 1}`);
  } catch { return `${item.kind} ${index + 1}`; }
}

function cleanFileNameBase(value) {
  return String(value || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function isUsefulMediaName(value) {
  const base = cleanFileNameBase(value).replace(/\.(mp4|m4a|webm|mp3|aac|ogg|ogv|ts|mov|wav)$/i, "").trim();
  if (!base || base.length < 3) return false;
  if (/^(?:x|twitter|vimeo|video|audio|media|stream|playlist|master|index|chunk|segment|videoplayback)(?:[\s._·-]*\d*)?$/i.test(base)) return false;
  if (/^\d{6,}$/.test(base) || /^[a-f0-9_-]{20,}$/i.test(base)) return false;
  const compact = base.replace(/[\s._-]/g, "");
  const looksLikeOpaqueId = compact.length >= 20
    && /^[A-Za-z0-9]+$/.test(compact)
    && /[A-Z]/.test(compact)
    && /[a-z]/.test(compact)
    && /\d/.test(compact);
  if (looksLikeOpaqueId) return false;
  if (compact.length > 36 && !/\s/.test(base) && /\d/.test(base)) return false;
  return true;
}

function mediaExtension(item) {
  const mime = (item.mimeType || "").split(";")[0].toLowerCase();
  const byMime = {
    "video/mp4": "mp4", "audio/mp4": "m4a", "video/webm": "webm", "audio/webm": "webm",
    "audio/mpeg": "mp3", "audio/aac": "aac", "audio/ogg": "ogg", "video/ogg": "ogv", "video/mp2t": "ts"
  };
  if (byMime[mime]) return byMime[mime];
  if (mediaCategory(item) === 'image') {
    const parsed = new URL(item.url);
    const format = mime.replace(/^image\//, '').replace('svg+xml', 'svg') || parsed.pathname.match(/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i)?.[1] || parsed.searchParams.get('format');
    return /^(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(format || '') ? format.toLowerCase() : 'image';
  }
  try {
    const extension = new URL(item.url).pathname.split(".").pop().toLowerCase();
    if (/^(mp4|m4a|webm|mp3|aac|ogg|ogv|ts|mov|wav)$/.test(extension)) return extension;
  } catch { /* Use the media-kind fallback. */ }
  return item.kind === "audio" ? "mp3" : "mp4";
}

function safeMediaFileName(item, index) {
  const candidate = item.name || mediaName(item, index);
  const pageTitle = cleanFileNameBase(activeTab?.title).replace(/\s*[-|·]\s*(?:YouTube|Vimeo|X|Twitter|哔哩哔哩).*$/i, "");
  const fallback = pageTitle ? `${pageTitle}-${index + 1}` : `EasyRead-media-${index + 1}`;
  const base = cleanFileNameBase(isUsefulMediaName(candidate) ? candidate : fallback).replace(/\.(mp4|m4a|webm|mp3|aac|ogg|ogv|ts|mov|wav|png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i, "").trim().slice(0, 120) || `EasyRead-media-${index + 1}`;
  return `${base}.${mediaExtension(item)}`;
}

async function downloadDirectMedia(item, index, task) {
  const isBilibiliDash = item.source === "bilibili-playinfo" && /(?:^|\.)(?:bilivideo\.(?:com|cn)|hdslb\.com)$/i.test(new URL(item.url).hostname);
  let referrer = "";
  if (isBilibiliDash) {
    const granted = await chrome.permissions.request({ origins: ["https://*.bilivideo.com/*", "https://*.bilivideo.cn/*", "https://*.hdslb.com/*"] });
    if (!granted) throw new Error(easyReadTools.getMessageForLocales("capture_download_permission_missing"));
    referrer = (await getActiveSupportedTab())?.url || "";
  }
  const candidateUrls = [...new Set([item.url, ...(isBilibiliDash && Array.isArray(item.backupUrls) ? item.backupUrls : [])])];
  const attempts = [];
  for (const [attemptIndex, url] of candidateUrls.entries()) {
    addMediaDebugStage(index, "direct-download-request", { url, attempt: attemptIndex + 1, totalAttempts: candidateUrls.length });
    const started = await chrome.runtime.sendMessage({ command: "startDirectDownload", url, filename: safeMediaFileName(item, index), referrer, source: item.source });
    if (!started?.ok) {
      attempts.push({ url, stage: "start", error: started?.error || "Download did not start" });
      addMediaDebugStage(index, "direct-download-attempt-failed", attempts.at(-1));
      continue;
    }
    const downloadId = started.downloadId;
    addMediaDebugStage(index, "direct-download-started", { downloadId, attempt: attemptIndex + 1, ruleId: started.ruleId || null, referrerApplied: Boolean(started.referrerApplied) });
    try {
      await new Promise((resolve, reject) => {
    const poll = async () => {
      try {
      const status = await chrome.runtime.sendMessage({ command: "getDirectDownloadStatus", downloadId });
      if (!status?.ok) throw new Error(status?.error || "Download status unavailable");
      const download = status.download;
      if (!download) throw new Error("Download no longer available");
      const percent = download.totalBytes > 0 ? Math.min(100, download.bytesReceived / download.totalBytes * 100) : 0;
      if (download.totalBytes > 0) setExactMediaFileSize(task.closest(".popupMediaItem").querySelector(".mediaFileSize"), download.totalBytes);
      updateMediaTaskProgress(task, index, percent, easyReadTools.getMessageForLocales("capture_status_working"), download.bytesReceived, download.totalBytes);
      if (download.state === "complete") { task.querySelector("progress").value = 100; addMediaDebugStage(index, "direct-download-complete", { download }); resolve(); return; }
      if (download.state === "interrupted") { const error = new Error(download.error || "Download interrupted"); error.debug = { download }; throw error; }
      setTimeout(poll, 350);
      } catch (error) { reject(error); }
    };
    poll();
      });
      return;
    } catch (error) {
      attempts.push({ url, stage: "download", error: error.message, details: error.debug || null });
      addMediaDebugStage(index, "direct-download-attempt-failed", attempts.at(-1));
      await chrome.runtime.sendMessage({ command: "removeFailedDirectDownload", downloadId }).catch(() => {});
    }
  }
  const error = new Error(attempts.at(-1)?.error || "All media download routes failed");
  error.debug = { attempts };
  throw error;
}

async function requestMediaHostPermission(item, index, allowPrompt = true) {
  const mediaUrl = new URL(item.url);
  if (!/^https?:$/.test(mediaUrl.protocol)) return;
  const origin = `${mediaUrl.origin}/*`;
  const origins = [...new Set([origin, ...(item.mediaOrigins || []), ...(item.requiredOrigins || [])])].filter(origin => { try { return /^https?:$/.test(new URL(origin).protocol); } catch { return false; } });
  addMediaDebugStage(index, "media-host-permission-request", { origin });
  const granted = allowPrompt ? await chrome.permissions.request({ origins }) : await chrome.permissions.contains({ origins });
  addMediaDebugStage(index, "media-host-permission-result", { origin, granted });
  if (!granted) throw new Error(easyReadTools.getMessageForLocales("capture_download_permission_missing"));
}

function mediaDurationText(seconds) {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remainder = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function updateMediaDimensions(label, width, height) {
  label.textContent = width > 0 && height > 0 ? `${Math.round(width)} × ${Math.round(height)}` : easyReadTools.getMessageForLocales("capture_media_size_unknown");
}

function mediaFileSizeText(bytes) {
  const size = Number(bytes);
  if (!(size > 0) || !Number.isFinite(size)) return easyReadTools.getMessageForLocales("capture_media_file_size_pending");
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / (1024 ** unit)).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

function mediaTransferSpeedText(bytesPerSecond) {
  if (!(bytesPerSecond > 0) || !Number.isFinite(bytesPerSecond)) return "";
  return `${mediaFileSizeText(bytesPerSecond)}/s`;
}

function mediaRemainingTimeText(seconds) {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return "";
  const total = Math.ceil(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remainder = total % 60;
  if (hours) return easyReadTools.getMessageForLocales("capture_media_eta_hours", [String(hours), String(minutes)]);
  if (minutes) return easyReadTools.getMessageForLocales("capture_media_eta_minutes", [String(minutes), String(remainder)]);
  return easyReadTools.getMessageForLocales("capture_media_eta_seconds", [String(remainder)]);
}

function mediaProgressDetailText(index, loadedBytes, totalBytes) {
  const loaded = Number(loadedBytes) || 0;
  const total = Number(totalBytes) || 0;
  const now = performance.now();
  const previous = mediaProgressStats.get(index);
  const deltaBytes = previous ? loaded - previous.loaded : 0;
  const deltaSeconds = previous ? (now - previous.at) / 1000 : 0;
  let speed = previous?.speed || 0;
  if (deltaBytes > 0 && deltaSeconds > 0) {
    const instantSpeed = deltaBytes / deltaSeconds;
    speed = speed > 0 ? speed * 0.55 + instantSpeed * 0.45 : instantSpeed;
  }
  mediaProgressStats.set(index, { at: now, loaded, speed });
  const speedText = mediaTransferSpeedText(speed);
  const amountText = total > 0
    ? easyReadTools.getMessageForLocales("capture_media_progress_amount_total", [mediaFileSizeText(loaded), mediaFileSizeText(total)])
    : easyReadTools.getMessageForLocales("capture_media_progress_amount", [mediaFileSizeText(loaded)]);
  const etaText = total > loaded && speed > 0 ? mediaRemainingTimeText((total - loaded) / speed) : "";
  const leading = [speedText, amountText].filter(Boolean).join(" - ");
  return etaText && leading ? easyReadTools.getMessageForLocales("capture_media_progress_detail", [leading, etaText]) : leading || etaText;
}

function updateMediaTaskProgress(task, index, percent, stage, loadedBytes, totalBytes) {
  const progress = task.querySelector("progress");
  const detail = task.querySelector("small");
  const total = Number(totalBytes) || 0;
  if (total > 0 || Number(percent) > 0) {
    progress.value = Number(percent) || 0;
  } else {
    progress.removeAttribute("value");
  }
  const transferText = Number(loadedBytes) > 0 ? mediaProgressDetailText(index, loadedBytes, totalBytes) : "";
  detail.textContent = transferText || stage || easyReadTools.getMessageForLocales("capture_status_working");
}

function updateEstimatedMediaFileSize(label, bytes) {
  if (!(bytes > 0) || !Number.isFinite(bytes) || itemHasExactFileSize(label)) return;
  label.textContent = easyReadTools.getMessageForLocales("capture_media_file_size_estimated", [mediaFileSizeText(bytes)]);
  label.dataset.estimated = "true";
}

function itemHasExactFileSize(label) {
  return label.dataset.estimated !== "true" && label.dataset.known === "true";
}

function setExactMediaFileSize(label, bytes) {
  if (!(bytes > 0) || !Number.isFinite(Number(bytes))) return;
  label.textContent = mediaFileSizeText(bytes);
  label.dataset.known = "true";
  delete label.dataset.estimated;
}

async function probeMediaFileSize(item, label) {
  if (itemHasExactFileSize(label)) return;
  const estimatedBytes = Number(item.bandwidth) * Number(item.duration) / 8;
  if (estimatedBytes > 0) updateEstimatedMediaFileSize(label, estimatedBytes);
  if (item.kind === "hls" || item.source === "vimeo-player") return;
  try {
    const tab = await getActiveSupportedTab();
    if (!tab) return;
    const result = await sendPageMessage(tab.id, { command: "probeMediaSize", url: item.url });
    if (result?.size > 0) {
      item.contentLength = result.size;
      setExactMediaFileSize(label, result.size);
    }
  } catch { /* Some media servers intentionally block metadata probes. */ }
}

async function loadMediaSources(item, index) {
  const tab = await getActiveSupportedTab();
  if (!tab) throw new Error(easyReadTools.getMessageForLocales("capture_media_sources_failed"));
  if (item.kind === "hls" || item.source === "vimeo-player") await requestMediaHostPermission(item, index);
  const grantedOrigins = new Set();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await sendPageMessage(tab.id, { command: "inspectMediaSources", media: item });
    if (result?.ok) return result.sources || [];
    if (!result?.requiredOrigin || grantedOrigins.has(result.requiredOrigin)) throw Object.assign(new Error(result?.error || easyReadTools.getMessageForLocales("capture_media_sources_failed")), { debug: result?.debug });
    grantedOrigins.add(result.requiredOrigin);
    item.requiredOrigins = [...new Set([...(item.requiredOrigins || []), result.requiredOrigin])];
    await requestMediaHostPermission(item, index);
  }
  throw new Error(easyReadTools.getMessageForLocales("capture_media_sources_failed"));
}

function sourceTypeText(type) {
  return easyReadTools.getMessageForLocales(`capture_media_source_${type}`) || String(type || "URL").toUpperCase();
}

function createMediaPlayer(item, index, dimensions, fileSize) {
  const player = document.createElement("div");
  player.className = "mediaPlayer";
  if (mediaCategory(item) === 'image') {
    const image = document.createElement('img'); image.src = item.url; image.alt = item.name || ''; image.loading = 'lazy';
    image.addEventListener('load', () => updateMediaDimensions(dimensions, image.naturalWidth, image.naturalHeight));
    player.classList.add('isImage'); player.append(image); return player;
  }
  const isAudio = mediaCategory(item) === 'audio';
  if (isAudio) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.defaultMuted = mediaPlayback.muted;
    audio.muted = mediaPlayback.muted;
    audio.src = item.url;
    player.classList.add("isAudio");
    player.appendChild(audio);
    return player;
  }
  if (item.source === "vimeo-player") {
    if (item.poster) {
      const poster = document.createElement("img");
      poster.className = "mediaPlayerPoster";
      poster.src = item.poster;
      poster.alt = "";
      player.appendChild(poster);
    }
    const play = document.createElement("button");
    play.type = "button";
    play.className = "mediaPreviewPlay";
    play.setAttribute("aria-label", easyReadTools.getMessageForLocales("capture_media_preview"));
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.5v9l7-4.5-7-4.5Z"/></svg>';
    play.addEventListener("click", () => {
      const frame = document.createElement("iframe");
      const source = new URL(item.url);
      source.searchParams.set("controls", "1");
      source.searchParams.set("autoplay", "1");
      source.searchParams.set('autopause', mediaPlayback.preferences.mode === 'simultaneous' ? '0' : '1');
      source.searchParams.set("muted", mediaPlayback.muted ? "1" : "0");
      source.searchParams.set("title", "0");
      source.searchParams.set("byline", "0");
      frame.src = source.href;
      frame.title = item.name || "Vimeo";
      frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
      frame.allowFullscreen = true;
      player.replaceChildren(frame);
    });
    player.appendChild(play);
    return player;
  }
  const video = document.createElement("video");
  video.controls = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.defaultMuted = mediaPlayback.muted;
  video.muted = mediaPlayback.muted;
  if (item.poster) video.poster = item.poster;
  const isHls = item.kind === "hls" || /mpegurl/i.test(item.mimeType || "") || /\.m3u8?(?:$|[?#])/i.test(item.url);
  if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
    const play = document.createElement("button");
    play.type = "button";
    play.className = "mediaPreviewPlay";
    play.setAttribute("aria-label", easyReadTools.getMessageForLocales("capture_media_preview"));
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.5v9l7-4.5-7-4.5Z"/></svg>';
    play.addEventListener("click", async event => {
      play.disabled = true;
      try {
        await requestMediaHostPermission(item, index, event.isTrusted);
        if (!globalThis.Hls?.isSupported()) throw new Error(easyReadTools.getMessageForLocales("capture_media_preview_unsupported"));
        const hls = new globalThis.Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 15 });
        let selectedBitrate = 0;
        hls.on(globalThis.Hls.Events.MANIFEST_PARSED, (_event, data) => {
          const level = data.levels?.slice().sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
          if (level) {
            updateMediaDimensions(dimensions, level.width, level.height);
            selectedBitrate = Number(level.averageBitrate || level.bitrate) || 0;
            updateEstimatedMediaFileSize(fileSize, selectedBitrate * Number(item.duration || 0) / 8);
          }
          if (player.isConnected && !document.getElementById('panelMedia').hidden && (event.isTrusted || mediaPlayback.preferences.mode !== 'off')) video.play().catch(() => {});
        });
        hls.on(globalThis.Hls.Events.LEVEL_LOADED, (_event, data) => {
          const level = hls.levels?.[data.level];
          const bitrate = Number(level?.averageBitrate || level?.bitrate) || selectedBitrate;
          const duration = Number(data.details?.totalduration || item.duration) || 0;
          updateEstimatedMediaFileSize(fileSize, bitrate * duration / 8);
        });
        hls.on(globalThis.Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            player.dataset.error = easyReadTools.getMessageForLocales("capture_media_preview_failed");
            globalThis.EasyReadDiagnostics?.record(data.error || new Error(data.details || data.type), { operation: "hls-preview", media: item, details: data });
            hls.destroy();
          }
        });
        hls.attachMedia(video);
        hls.loadSource(item.url);
        play.remove();
      } catch (error) {
        player.dataset.error = error.message;
        globalThis.EasyReadDiagnostics?.record(error, { operation: "media-preview", media: item });
        play.disabled = false;
      }
    });
    player.append(video, play);
  } else {
    video.src = item.url;
    player.appendChild(video);
  }
  video.addEventListener("loadedmetadata", () => updateMediaDimensions(dimensions, video.videoWidth, video.videoHeight), { once: true });
  video.addEventListener("error", () => globalThis.EasyReadDiagnostics?.record(
    new Error(video.error?.message || "Media preview failed"), { operation: "media-preview", code: video.error?.code, media: item }
  ));
  return player;
}

function renderMediaItems() {
  mediaPlayback.reset();
  const list = document.getElementById("mediaList");
  const emptyState = document.getElementById("mediaEmptyState");
  list.replaceChildren();
  if (!mediaItems.length) {
    emptyState.hidden = false;
    list.hidden = true;
    return;
  }
  emptyState.hidden = true;
  list.hidden = false;
  mediaItems.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "popupMediaItem";
    row.dataset.category = mediaCategory(item);
    const dimensions = document.createElement("span");
    dimensions.className = "mediaDimensions";
    updateMediaDimensions(dimensions, item.width, item.height);
    const fileSize = document.createElement("span");
    fileSize.className = "mediaFileSize";
    fileSize.textContent = mediaFileSizeText(item.contentLength);
    if (Number(item.contentLength) > 0) fileSize.dataset.known = "true";
    const plannedFileName = safeMediaFileName(item, index);
    item.fileName = plannedFileName;
    const player = createMediaPlayer(item, index, dimensions, fileSize);
    if (mediaCategory(item) !== 'image') probeMediaFileSize(item, fileSize);
    const copy = document.createElement("div");
    copy.className = "mediaCopy";
    const title = document.createElement("strong");
    title.textContent = plannedFileName;
    title.title = plannedFileName;
    const description = document.createElement("small");
    description.textContent = item.url || item.description || String(item.kind || "media").toUpperCase();
    description.title = item.url;
    const metadata = document.createElement("div");
    metadata.className = "mediaMetadata";
    metadata.appendChild(dimensions);
    metadata.appendChild(fileSize);
    const duration = mediaDurationText(item.duration);
    if (duration) {
      const durationLabel = document.createElement("span");
      durationLabel.textContent = duration;
      metadata.appendChild(durationLabel);
    }
    copy.append(title, description, metadata);
    const actions = document.createElement("div");
    actions.className = "mediaActions";
    const sourceButton = document.createElement("button");
    sourceButton.className = "mediaSource";
    sourceButton.setAttribute('aria-expanded', 'false');
    sourceButton.textContent = easyReadTools.getMessageForLocales("capture_action_sources");
    const button = document.createElement("button");
    button.className = "mediaDownload";
    button.textContent = easyReadTools.getMessageForLocales("capture_action_download");
    const task = document.createElement("div");
    task.className = "mediaTask";
    task.hidden = true;
    task.innerHTML = "<progress max=\"100\" value=\"0\"></progress><small></small>";
    const sourcePanel = document.createElement("div");
    sourcePanel.className = "mediaSourcePanel";
    sourcePanel.hidden = true;
    sourceButton.addEventListener("click", async () => {
      if (!sourcePanel.hidden) {
        sourcePanel.hidden = true;
        sourceButton.setAttribute("aria-expanded", "false");
        return;
      }
      sourceButton.disabled = true;
      sourceButton.textContent = easyReadTools.getMessageForLocales("capture_media_sources_loading");
      try {
        const sources = await loadMediaSources(item, index);
        const toolbar = document.createElement("div");
        toolbar.className = "mediaSourceToolbar";
        const summary = document.createElement("strong");
        summary.textContent = easyReadTools.getMessageForLocales("capture_media_sources_count", [String(sources.length)]);
        const copyAll = document.createElement("button");
        copyAll.type = "button";
        copyAll.textContent = easyReadTools.getMessageForLocales("capture_media_sources_copy");
        copyAll.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(sources.map(source => source.url).join("\n"));
            copyAll.textContent = easyReadTools.getMessageForLocales('capture_status_copied');
          } catch (error) {
            globalThis.EasyReadDiagnostics?.record(error, { operation: 'copy-media-sources' }, sourcePanel);
            showMessages(easyReadTools.getMessageForLocales('ui_operation_failed'));
          }
        });
        toolbar.append(summary, copyAll);
        const list = document.createElement("ol");
        for (const source of sources) {
          const entry = document.createElement("li");
          const type = document.createElement("span");
          type.textContent = sourceTypeText(source.type);
          const link = document.createElement("a");
          if (easyReadTools.isSupportedScheme(source.url)) link.href = source.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = source.url;
          link.title = source.url;
          entry.append(type, link);
          list.appendChild(entry);
        }
        sourcePanel.replaceChildren(toolbar, list);
        sourcePanel.hidden = false;
        sourceButton.setAttribute("aria-expanded", "true");
      } catch (error) {
        sourcePanel.textContent = error.message;
        sourcePanel.hidden = false;
        globalThis.EasyReadDiagnostics?.record(error, { operation: "media-sources", media: item }, sourcePanel);
      } finally {
        sourceButton.disabled = false;
        sourceButton.textContent = easyReadTools.getMessageForLocales("capture_action_sources");
      }
    });
    button.addEventListener("click", async () => {
      const tab = await getActiveSupportedTab();
      if (!tab) return;
      task.hidden = false;
      task.dataset.state = 'working';
      button.disabled = true;
      mediaDebugStages.set(index, []);
      mediaProgressStats.delete(index);
      addMediaDebugStage(index, "download-clicked", { media: item });
      try {
        const mediaHost = new URL(item.url).hostname;
        if (mediaCategory(item) === 'image' && mediaExtension(item) === 'image') {
          const metadata = await sendPageMessage(tab.id, { command: 'probeMediaSize', url: item.url });
          if (/^image\//i.test(metadata?.mimeType || '')) item.mimeType = metadata.mimeType;
          item.fileName = safeMediaFileName(item, index); title.textContent = item.fileName; title.title = item.fileName;
          if (metadata?.size > 0) setExactMediaFileSize(fileSize, metadata.size);
        }
        // Bilibili DASH resources reject content-script fetches through CORS.
        // chrome.downloads can retrieve their signed URLs without that page-fetch restriction.
        const needsPageContext = item.kind === "hls" || item.source === "vimeo-player" || item.source === "youtube-player" || /(?:^|\.)(?:video\.twimg\.com|video\.weibocdn\.com)$/i.test(mediaHost);
        if (needsPageContext) {
          if (item.kind === "hls" || item.source === "vimeo-player") await requestMediaHostPermission(item, index);
          let result = await sendPageMessage(tab.id, { command: "downloadMedia", media: item, taskId: item.id });
          const requiredOrigin = result?.debug?.details?.requiredOrigin;
          if (!result?.ok && requiredOrigin) {
            item.requiredOrigins = [...new Set([...(item.requiredOrigins || []), requiredOrigin])];
            await requestMediaHostPermission(item, index);
            result = await sendPageMessage(tab.id, { command: "downloadMedia", media: item, taskId: item.id });
          }
          if (!result?.ok) {
            const error = new Error(result?.error || "Download failed");
            error.debug = result?.debug || null;
            throw error;
          }
        } else {
          await downloadDirectMedia(item, index, task);
          task.querySelector("small").textContent = easyReadTools.getMessageForLocales("capture_status_saved");
          button.disabled = false;
        }
      } catch (error) {
        addMediaDebugStage(index, "download-failed", { error: { name: error.name, message: error.message, stack: error.stack || "", details: error.debug || null } });
        task.dataset.state = 'error';
        task.querySelector("small").textContent = error.message;
        globalThis.EasyReadDiagnostics?.record(error, { operation: "media-download", media: item, stages: mediaDebugStages.get(index) }, false);
        button.disabled = false;
      }
    });
    const details = document.createElement("div");
    details.className = "mediaDetails";
    actions.append(sourceButton, button);
    details.append(copy, actions);
    row.append(player, details, sourcePanel, task);
    list.appendChild(row);
    const native = player.querySelector('video, audio');
    const frameMessage = message => player.querySelector('iframe')?.contentWindow?.postMessage(message, 'https://player.vimeo.com');
    const adapter = {
      play: async () => {
        if (!player.isConnected || document.getElementById('panelMedia').hidden) return;
        const button = player.querySelector('.mediaPreviewPlay');
        if (button) {
          // Automatic preview must never open optional host-permission prompts.
          const origin = `${new URL(item.url).origin}/*`;
          if (!(await chrome.permissions.contains({ origins: [origin] }))) return;
          if (document.getElementById('panelMedia').hidden || !player.isConnected || mediaPlayback.preferences.mode === 'off') return;
          button.click();
        } else if (native) await native.play().catch(() => {});
        else frameMessage({ method: 'play' });
      },
      pause: () => { native?.pause(); frameMessage({ method: 'pause' }); },
      mute: muted => { if (native) native.muted = muted; frameMessage({ method: 'setVolume', value: muted ? 0 : 1 }); frameMessage({ method: 'setAutopause', value: mediaPlayback.preferences.mode !== 'simultaneous' }); }
    };
    native?.addEventListener('ended', () => mediaPlayback.ended(adapter));
    native?.addEventListener('volumechange', () => { if (mediaPlayback.preferences.mode === 'simultaneous' && !native.muted) native.muted = true; });
    player.__mediaAdapter = adapter;
    if (mediaCategory(item) !== 'image') row.__mediaAdapter = adapter;
  });
  applyMediaFilter();
}

async function initializeWorkspaceTabs() {
  const filters = [...document.querySelectorAll('[data-media-filter]')];
  filters.forEach((button, index) => {
    button.textContent = easyReadTools.getMessageForLocales(`media_filter_${button.dataset.mediaFilter}`);
    button.onclick = () => { mediaFilter = button.dataset.mediaFilter; applyMediaFilter(); };
    button.onkeydown = event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % 4 : event.key === 'ArrowLeft' ? (index + 3) % 4 : event.key === 'Home' ? 0 : event.key === 'End' ? 3 : -1;
      if (next >= 0) { event.preventDefault(); filters[next].focus(); filters[next].click(); }
    };
  });
  const labels = [
    ["tabReadLater", "popup_tab_read_later"],
    ["tabSavePage", "popup_tab_save_page"]
  ];
  labels.forEach(([id, key]) => { document.getElementById(id).textContent = easyReadTools.getMessageForLocales(key); });
  document.querySelector("#tabMedia .tabLabel").textContent = easyReadTools.getMessageForLocales("popup_tab_media");
  document.querySelector('#tabAnnotations .tabLabel').textContent = easyReadTools.getMessageForLocales('annotation_sidebar_title');
  mediaPlayback.configure(await chrome.storage.local.get(['mediaAutoplay', 'mediaMuted']));
  await getActiveSupportedTab();
  const { popupLastTab } = await chrome.storage.session.get('popupLastTab');
  if (activeTab?.url && popupLastTab?.page === easyReadTools.getKey(activeTab.url)) {
    const remembered = document.getElementById(popupLastTab.tab);
    if (remembered?.classList.contains('popupTab')) {
      document.querySelectorAll('.popupTab').forEach(button => button.classList.toggle('isActive', button === remembered));
    }
  }
  initializePopupAnnotations(getActiveSupportedTab, showMessages);
  renderPopupAnnotations().catch(error => showMessages(error.message));
  initializeTabs('.popupTab', selectPopupTab);
  document.getElementById("mediaEmptyTitle").textContent = easyReadTools.getMessageForLocales("capture_media_none");
  document.getElementById("mediaEmptyDescription").textContent = easyReadTools.getMessageForLocales("capture_media_none_description");
  const copy = {
    saveHtmlTitle: "capture_html_title",
    savePdfTitle: "capture_pdf_title",
    saveImageTitle: "capture_png_title",
    saveMarkdownTitle: "capture_markdown_title",
    copyMarkdownAction: "capture_action_copy"
  };
  Object.entries(copy).forEach(([id, key]) => { document.getElementById(id).textContent = easyReadTools.getMessageForLocales(key); });
  document.querySelectorAll("[data-capture], [data-label]").forEach(button => {
    button.textContent = easyReadTools.getMessageForLocales(button.dataset.label || 'capture_action_save');
  });
  let imageFormat = 'png';
  const preferences = await chrome.storage.local.get('captureImageFormat');
  imageFormat = preferences.captureImageFormat === 'jpeg' ? 'jpeg' : 'png';
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.captureImageFormat) imageFormat = changes.captureImageFormat.newValue === 'jpeg' ? 'jpeg' : 'png';
  });
  document.querySelectorAll("[data-capture]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.capture;
    if (type === "image") {
      startCapture(type, {
        scope: button.dataset.scope,
        format: imageFormat
      });
    } else startCapture(type);
  }));
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.copy;
    if (type === "image") {
      copyCapture("image", {
        scope: button.dataset.scope,
        format: 'png'
      });
    } else copyCapture(type);
  }));
  const tab = await getActiveSupportedTab();
  const badge = document.getElementById("mediaBadge");
  if (!tab) {
    badge.hidden = true;
    badge.textContent = "";
    document.querySelectorAll('[data-capture], [data-copy], #btnReadLater').forEach(button => button.disabled = true);
    renderMediaItems();
    return;
  }
  try {
    mediaItems = await sendPageMessage(tab.id, { command: "getMediaCandidates" }) || [];
    badge.hidden = mediaItems.length === 0;
    badge.textContent = mediaItems.length > 0 ? String(mediaItems.length) : "";
    renderMediaItems();
  } catch {
    mediaItems = [];
    badge.hidden = true;
    badge.textContent = "";
    renderMediaItems();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.command === "captureProgress") renderTaskProgress(message);
  if (message?.command === "mediaProgress") {
    addMediaDebugStage(message.index, message.stage, { percent: message.percent, done: Boolean(message.done), error: Boolean(message.error), debug: message.debug || null });
    const task = [...document.querySelectorAll(".popupMediaItem")][message.index]?.querySelector(".mediaTask");
    if (!task) return;
    task.hidden = false;
    task.dataset.state = message.error ? 'error' : 'working';
    updateMediaTaskProgress(task, message.index, message.percent, message.stage, message.loadedBytes, message.totalBytes || message.fileSize);
    if (message.fileSize > 0) setExactMediaFileSize(task.closest(".popupMediaItem").querySelector(".mediaFileSize"), message.fileSize);
    if (message.done || message.error) task.closest(".popupMediaItem").querySelector(".mediaDownload").disabled = false;
  }
});

/* -------- Top Menu bar -------- */

function onPageLoad_InitTopMenuBar() {

  const btnSetting = document.getElementById("btnSetting");
  btnSetting.setAttribute("title", easyReadTools.getMessageForLocales("popup_page_top_menu_bar_setting_title"));
  btnSetting.setAttribute('aria-label', btnSetting.title);
  btnSetting.addEventListener('click', async () => {
    chrome.tabs.create({ active: true, url: '/setting/setting.html' });
  });
}

/* -------- ReadLaters -------- */

async function renderReadLaters(queryValue, context) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentKey = easyReadTools.getKey(tab?.url);
  document.querySelector('#outputReadLaters ol').replaceChildren();
  let lists = queryValue[context.key];
  let unreadCount = 0;
  if (lists && lists.length > 0) {
    const template = document.getElementById('templateReadLater');
    const elements = new Set();

    for (let i = 0; i < lists.length; ++i) {
      let item = lists[i];
      if (item["status"] === easyReadTools.READ_STATUS_UNREAD
        || item["status"] === easyReadTools.READ_STATUS_READING) {
        ++unreadCount;
        const element = template.content.firstElementChild.cloneNode(true);

        const ckId = "checkbox_" + i;
        const checkBox = element.querySelector('input[type=checkbox]');
        checkBox.id = ckId;
        checkBox.value = item["key"];
        checkBox.addEventListener('change', async (e) => {
          if (e.target.checked) {
            const key = e.target.value;
            if (key) {
              await easyReadTools.updateStorageJsonData(
                easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
                updateStorageCallback_ReadLaterRemove,
                {
                  key: easyReadTools.READ_LATERS_NAME,
                  pageKey: key,
                  checkBoxId: e.target.id
                });
              setTimeout(()=>{
                easyReadTools.updateBudgeText();
              }, 1000);
            }
          }
        });

        const isHighlightItem = item.key === currentKey;

        element.querySelector('label').setAttribute('for', ckId);
        element.querySelector('a').textContent = (isHighlightItem ? "👀 " : "") + item["title"];
        if (easyReadTools.isSupportedScheme(item.url)) element.querySelector('a').href = item.url;
        else element.querySelector('a').removeAttribute('href');
        element.querySelector('a').setAttribute('title', item["title"]);

        const position = item["position"];
        if(Number.isFinite(position?.progress)) {
          element.querySelector('.progress').textContent = " (" + position.progress.toFixed(2) + "%)";
        }
        

        if (isHighlightItem) {
          element.classList.add('highlightLi');
        }

        elements.add(element);
      }
    }
    let olElement = document.querySelector('#outputReadLaters ol')
    olElement.innerHTML = '';
    olElement.append(...elements);
  }
  document.getElementById('readLaterEmpty').hidden = unreadCount > 0;
  document.getElementById("titleReadLaters").textContent = easyReadTools.getMessageForLocales("popup_page_total_pages", [unreadCount]);
  easyReadTools.updateBudgeText();
}

function addReadLatersStorageUpdated(updateStatus, updateData) {
  if (updateStatus) {
    renderReadLaters(updateData, { key: easyReadTools.READ_LATERS_NAME })
  }
}

function removeReadLatersStorageUpdated(updateStatus, updateData, context) {
  if (updateStatus) {
    setTimeout(() => {
      const liElement = document.getElementById(context.checkBoxId)?.parentElement;
      if (liElement) {
        const olElement = liElement.parentElement;
        olElement.removeChild(liElement);
        document.getElementById("titleReadLaters").textContent = easyReadTools.getMessageForLocales("popup_page_total_pages", [olElement.childNodes.length]);
        document.getElementById('readLaterEmpty').hidden = olElement.childElementCount > 0;
      }
    }, 500);
  }
}

function updateStorageCallback_ReadLaterRemove(queryValue, context) {
  var result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "", callback_onUpdated: removeReadLatersStorageUpdated };
  // queryValue == {} or {context.key: it's value}
  // console.log(queryValue);
  // console.log(context.key);
  const oldValue = queryValue[context.key];
  // console.log(oldValue);

  if (!oldValue) {
    showMessages(easyReadTools.getMessageForLocales("popup_page_message_readlaters_remove_null"));
    console.log("the readLaters json object is not exists, may be delete by other thread.");
  } else {
    // exists "readLaters json object"

    // the url is in the read later list.
    // assert the oldValue is Array.

    let isFound = false;
    for (let i = 0; i < oldValue.length; ++i) {
      if (context.pageKey === oldValue[i].key && [easyReadTools.READ_STATUS_UNREAD, easyReadTools.READ_STATUS_READING].includes(oldValue[i].status)) {
        oldValue[i]["status"] = easyReadTools.READ_STATUS_READED;
        oldValue[i]["endReadDateTime"] = Date.now();
        result.status = easyReadTools.UPDATE_STATUS_YES;
        result.value = oldValue;
        result.message = "Mark the page as READED.";
        isFound = true;
        break;
      }
    }

    if (!isFound) {
      result.message = easyReadTools.getMessageForLocales("popup_page_message_readlaters_remove_null");
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_readlaters_remove_null"));
    }

    return result;
  }
}

function onPageLoad_InitReadLaters() {
  document.getElementById("btnReadLaterText").textContent = easyReadTools.getMessageForLocales("popup_btn_read_later_text");
  document.getElementById('readLaterEmpty').textContent = easyReadTools.getMessageForLocales('popup_page_message_no_readlaters');

  const btnReadLater = document.getElementById("btnReadLater");
  btnReadLater.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      if (easyReadTools.isSupportedScheme(tab.url)) {
        easyReadTools.updateStorageJsonData(
          easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
          easyReadTools.updateStorageCallbackReadLaterAdd,
          {
            tab: tab,
            callbackOnUpdated: addReadLatersStorageUpdated,
            onMessage: showMessages
          });
      };
    }
  });

  const btnReadedAndRemove = document.getElementById("btnReadedAndRemove");
  btnReadedAndRemove.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      const pageUrl = easyReadTools.getKey(tab.url);
      easyReadTools.removeStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]), () => {
        document.getElementById("pageRecordContent").textContent = easyReadTools.getMessageForLocales("popup_page_message_records_removed");
        btnReadedAndRemove.hidden = true;
      });
    }
  });

  easyReadTools.getStorageJsonData(
    easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
    renderReadLaters, { key: easyReadTools.READ_LATERS_NAME });
}

/* -------- AutoRecords -------- */

function renderPageRecords(queryValue, context) {
  document.getElementById('pageRecordContent').replaceChildren();
  document.getElementById('btnReadedAndRemove').hidden = !queryValue[context.key];
  let readedPage = queryValue[context.key];
  if (readedPage) {
    if (readedPage.datetimes && readedPage.datetimes.length > 0) {
      const readTimes = readedPage.datetimes.length;
      const message = easyReadTools.getMessageForLocales("popup_page_read_times", [readTimes]);
      const readTimesToString = easyReadTools.sortDateTimeList(readedPage.datetimes).map((datetime) => easyReadTools.formatDate(datetime) + '<br />').join('');

      const template = document.getElementById('templateAllRecords');
      const elements = new Set();
      const element = template.content.cloneNode(true);

      element.querySelector('.titleAllRecords').textContent = readedPage.title;
      const title = element.querySelector('.titleAllRecords');
      const favicon = document.createElement('img');
      favicon.className = 'pageFavicon'; favicon.alt = ''; favicon.referrerPolicy = 'no-referrer';
      const fallback = chrome.runtime.getURL('assets/logo/icon-32.png');
      favicon.src = /^(https?:|data:image\/)/i.test(activeTab?.favIconUrl || '') ? activeTab.favIconUrl : fallback;
      favicon.addEventListener('error', () => { if (favicon.src !== fallback) favicon.src = fallback; });
      title.prepend(favicon);
      element.querySelector('.url').textContent = readedPage.url;
      element.querySelector('.message').textContent = message;
      element.querySelector('.readedTimes').innerHTML = readTimesToString;

      elements.add(element);
      document.getElementById('pageRecordContent').append(...elements);
    }
    else {
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_records_no_datetimes"));
    }
  }
  else {
    document.getElementById('pageRecordContent').textContent = easyReadTools.getMessageForLocales("popup_page_message_no_records_text");
  }
}

async function onPageLoad_InitAllRecords() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    if (easyReadTools.isSupportedScheme(pageUrl)) {
      easyReadTools.getStorageJsonData(
        easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]),
        renderPageRecords,
        { key: pageUrl });
    }
    else {
      document.getElementById("pageRecordContent").textContent = easyReadTools.getMessageForLocales("popup_page_message_records_not_supported");
      document.getElementById('btnReadedAndRemove').hidden = true;
    }
  }
}

(function onPageLoad() {
  onPageLoad_InitTitle();
  onPageLoad_InitTopMenuBar();
  onPageLoad_InitReadLaters();

  onPageLoad_InitAllRecords();
  initializeWorkspaceTabs();
})();

// Keep the open popup current when the background records a visit after it loads.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[easyReadTools.ALL_RECORDS_NAME]) onPageLoad_InitAllRecords();
});
