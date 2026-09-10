import "../scripts/diagnostics.js";
import * as easyReadTools from "../scripts/easyReadTools.js";

/* showMessages to notify users */
function showMessages(message) {
  document.getElementById("outputMesssages").textContent = message;
  setTimeout(function () {
    document.getElementById("outputMesssages").textContent = "";
  }, 3000);
}

/* -------- Popup Title -------- */

function onPageLoad_InitTitle() {
  document.getElementById("popupTitle").textContent = easyReadTools.getMessageForLocales("popup_page_title");
}

let activeTab;
let mediaItems = [];
const mediaDebugStages = new Map();
const mediaProgressStats = new Map();

function addMediaDebugStage(index, stage, details = {}) {
  const stages = mediaDebugStages.get(index) ?? [];
  stages.push({ at: new Date().toISOString(), stage: String(stage || ""), ...details });
  mediaDebugStages.set(index, stages.slice(-250));
}

async function downloadMediaDebugReport(item, index, error) {
  if (!globalThis.EasyReadDiagnostics) return;
  const tab = await getActiveSupportedTab();
  const manifest = chrome.runtime.getManifest();
  const report = {
    schema: "easyread-media-debug-v1",
    capturedAt: new Date().toISOString(),
    extension: { name: manifest.name, version: manifest.version, manifestVersion: manifest.manifest_version },
    environment: { userAgent: navigator.userAgent, language: navigator.language, platform: navigator.platform },
    page: tab ? { id: tab.id, title: tab.title, url: tab.url } : null,
    selectedMedia: item,
    detectedMedia: mediaItems,
    stages: mediaDebugStages.get(index) ?? [],
    error: {
      name: error?.name || "Error",
      message: error?.message || String(error),
      stack: error?.stack || "",
      details: error?.debug || null
    }
  };
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  const host = (() => { try { return new URL(tab?.url || item?.url).hostname.replace(/[^a-z0-9.-]/gi, "-"); } catch { return "page"; } })();
  link.href = blobUrl;
  link.download = `EasyRead-media-error-${host}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
}

async function getActiveSupportedTab() {
  if (activeTab?.id) return activeTab;
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab?.id && easyReadTools.isSupportedScheme(activeTab.url) ? activeTab : null;
}

function selectPopupTab(tabButton) {
  document.querySelectorAll(".popupTab").forEach((button) => {
    const selected = button === tabButton;
    button.classList.toggle("isActive", selected);
    button.setAttribute("aria-selected", String(selected));
    document.getElementById(button.getAttribute("aria-controls")).hidden = !selected;
  });
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
  const tab = await getActiveSupportedTab();
  if (!tab) return;
  document.querySelector("#captureTask [data-easyread-error-details]")?.remove();
  renderTaskProgress({ percent: 2, stage: easyReadTools.getMessageForLocales("capture_stage_starting") });
  try {
    if (type === "html") {
      renderTaskProgress({ percent: 3, stage: easyReadTools.getMessageForLocales("capture_stage_permission") });
      options.crossOriginAccess = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
    }
    const result = await chrome.tabs.sendMessage(tab.id, {
      command: "startCapture",
      type,
      options
    });
    if (!result?.ok) throw Object.assign(new Error(result?.error || easyReadTools.getMessageForLocales("capture_status_failed")), { debug: result?.debug });
  } catch (error) {
    renderTaskProgress({ percent: 100, title: easyReadTools.getMessageForLocales("capture_status_failed"), stage: error.message });
    globalThis.EasyReadDiagnostics?.record(error, { operation: "save", type, options, page: tab }, document.getElementById("captureTask"));
  }
}

async function copyCapture(type, options = {}) {
  const tab = await getActiveSupportedTab();
  if (!tab) return;
  renderTaskProgress({ percent: 2, stage: easyReadTools.getMessageForLocales("capture_stage_starting") });
  const mimeType = type === "image" ? "image/png" : "text/plain";
  const contentPromise = chrome.tabs.sendMessage(tab.id, {
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
  }
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
  const base = cleanFileNameBase(isUsefulMediaName(candidate) ? candidate : fallback).replace(/\.(mp4|m4a|webm|mp3|aac|ogg|ogv|ts|mov|wav)$/i, "").trim().slice(0, 120) || `EasyRead-media-${index + 1}`;
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
    const timer = setInterval(async () => {
      const status = await chrome.runtime.sendMessage({ command: "getDirectDownloadStatus", downloadId });
      if (!status?.ok) { clearInterval(timer); reject(new Error(status?.error || "Download status unavailable")); return; }
      const download = status.download;
      if (!download) return;
      const percent = download.totalBytes > 0 ? Math.min(100, download.bytesReceived / download.totalBytes * 100) : 0;
      if (download.totalBytes > 0) setExactMediaFileSize(task.closest(".popupMediaItem").querySelector(".mediaFileSize"), download.totalBytes);
      updateMediaTaskProgress(task, index, percent, easyReadTools.getMessageForLocales("capture_status_working"), download.bytesReceived, download.totalBytes);
      if (download.state === "complete") { clearInterval(timer); task.querySelector("progress").value = 100; addMediaDebugStage(index, "direct-download-complete", { download }); resolve(); }
      if (download.state === "interrupted") { const error = new Error(download.error || "Download interrupted"); error.debug = { download }; clearInterval(timer); reject(error); }
    }, 350);
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

async function requestMediaHostPermission(item, index) {
  const mediaUrl = new URL(item.url);
  if (!/^https?:$/.test(mediaUrl.protocol)) return;
  const origin = `${mediaUrl.origin}/*`;
  const origins = [...new Set([origin, ...(item.mediaOrigins || []), ...(item.requiredOrigins || [])])].filter(origin => { try { return /^https?:$/.test(new URL(origin).protocol); } catch { return false; } });
  addMediaDebugStage(index, "media-host-permission-request", { origin });
  const granted = await chrome.permissions.request({ origins });
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
    const result = await chrome.tabs.sendMessage(tab.id, { command: "probeMediaSize", url: item.url });
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
    const result = await chrome.tabs.sendMessage(tab.id, { command: "inspectMediaSources", media: item });
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
  const isAudio = item.kind === "audio" || String(item.mimeType || "").startsWith("audio/");
  if (isAudio) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.defaultMuted = true;
    audio.muted = true;
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
      source.searchParams.set("muted", "1");
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
  video.defaultMuted = true;
  video.muted = true;
  if (item.poster) video.poster = item.poster;
  const isHls = item.kind === "hls" || /mpegurl/i.test(item.mimeType || "") || /\.m3u8?(?:$|[?#])/i.test(item.url);
  if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
    const play = document.createElement("button");
    play.type = "button";
    play.className = "mediaPreviewPlay";
    play.setAttribute("aria-label", easyReadTools.getMessageForLocales("capture_media_preview"));
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.5v9l7-4.5-7-4.5Z"/></svg>';
    play.addEventListener("click", async () => {
      play.disabled = true;
      try {
        await requestMediaHostPermission(item, index);
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
          video.play().catch(() => {});
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
    probeMediaFileSize(item, fileSize);
    const copy = document.createElement("div");
    copy.className = "mediaCopy";
    const title = document.createElement("strong");
    title.textContent = plannedFileName;
    title.title = plannedFileName;
    const description = document.createElement("small");
    description.textContent = item.description || String(item.kind || "media").toUpperCase();
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
    sourceButton.textContent = easyReadTools.getMessageForLocales("capture_action_sources");
    const button = document.createElement("button");
    button.className = "mediaDownload";
    button.textContent = easyReadTools.getMessageForLocales("capture_action_download");
    const task = document.createElement("div");
    task.className = "mediaTask";
    task.hidden = true;
    task.innerHTML = "<progress max=\"100\" value=\"0\"></progress><small></small><button type=\"button\" class=\"mediaDebugDownload\" hidden></button>";
    const debugButton = task.querySelector(".mediaDebugDownload");
    debugButton.textContent = easyReadTools.getMessageForLocales("capture_media_debug_download");
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
        copyAll.addEventListener("click", async () => navigator.clipboard.writeText(sources.map(source => source.url).join("\n")));
        toolbar.append(summary, copyAll);
        const list = document.createElement("ol");
        for (const source of sources) {
          const entry = document.createElement("li");
          const type = document.createElement("span");
          type.textContent = sourceTypeText(source.type);
          const link = document.createElement("a");
          link.href = source.url;
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
      debugButton.hidden = true;
      debugButton.onclick = null;
      button.disabled = true;
      mediaDebugStages.set(index, []);
      mediaProgressStats.delete(index);
      addMediaDebugStage(index, "download-clicked", { media: item });
      try {
        const mediaHost = new URL(item.url).hostname;
        // Bilibili DASH resources reject content-script fetches through CORS.
        // chrome.downloads can retrieve their signed URLs without that page-fetch restriction.
        const needsPageContext = item.kind === "hls" || item.source === "vimeo-player" || item.source === "youtube-player" || /(?:^|\.)(?:video\.twimg\.com|video\.weibocdn\.com)$/i.test(mediaHost);
        if (needsPageContext) {
          if (item.kind === "hls" || item.source === "vimeo-player") await requestMediaHostPermission(item, index);
          let result = await chrome.tabs.sendMessage(tab.id, { command: "downloadMedia", media: item, taskId: item.id });
          const requiredOrigin = result?.debug?.details?.requiredOrigin;
          if (!result?.ok && requiredOrigin) {
            item.requiredOrigins = [...new Set([...(item.requiredOrigins || []), requiredOrigin])];
            await requestMediaHostPermission(item, index);
            result = await chrome.tabs.sendMessage(tab.id, { command: "downloadMedia", media: item, taskId: item.id });
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
        task.querySelector("small").textContent = error.message;
        globalThis.EasyReadDiagnostics?.record(error, { operation: "media-download", media: item, stages: mediaDebugStages.get(index) }, false);
        debugButton.hidden = !globalThis.EasyReadDiagnostics;
        debugButton.onclick = async () => {
          try {
            await downloadMediaDebugReport(item, index, error);
          } catch (debugError) {
            task.querySelector("small").textContent = `${error.message} · ${debugError.message}`;
          }
        };
        button.disabled = false;
      }
    });
    const details = document.createElement("div");
    details.className = "mediaDetails";
    actions.append(sourceButton, button);
    details.append(copy, actions);
    row.append(player, details, sourcePanel, task);
    list.appendChild(row);
  });
}

async function initializeWorkspaceTabs() {
  const labels = [
    ["tabReadLater", "popup_tab_read_later"],
    ["tabSavePage", "popup_tab_save_page"]
  ];
  labels.forEach(([id, key]) => { document.getElementById(id).textContent = easyReadTools.getMessageForLocales(key); });
  document.querySelector("#tabMedia .tabLabel").textContent = easyReadTools.getMessageForLocales("popup_tab_media");
  document.querySelectorAll(".popupTab").forEach((button) => button.addEventListener("click", () => selectPopupTab(button)));
  document.getElementById("savePageIntro").textContent = easyReadTools.getMessageForLocales("capture_save_page_intro");
  document.getElementById("mediaEmptyTitle").textContent = easyReadTools.getMessageForLocales("capture_media_none");
  document.getElementById("mediaEmptyDescription").textContent = easyReadTools.getMessageForLocales("capture_media_none_description");
  const copy = {
    saveHtmlTitle: "capture_html_title", saveHtmlDescription: "capture_html_description",
    savePdfTitle: "capture_pdf_title", savePdfDescription: "capture_pdf_description",
    saveImageTitle: "capture_png_title", saveImageDescription: "capture_image_description",
    saveMarkdownTitle: "capture_markdown_title", saveMarkdownDescription: "capture_markdown_description",
    saveImageAction: "capture_action_save", copyImageAction: "capture_action_copy", copyMarkdownAction: "capture_action_copy"
  };
  Object.entries(copy).forEach(([id, key]) => { document.getElementById(id).textContent = easyReadTools.getMessageForLocales(key); });
  document.querySelectorAll("[data-capture]").forEach((button) => { button.textContent = easyReadTools.getMessageForLocales("capture_action_save"); });
  document.querySelector("#imageScope [data-value='viewport']").textContent = easyReadTools.getMessageForLocales("capture_scope_viewport");
  document.querySelector("#imageScope [data-value='fullPage']").textContent = easyReadTools.getMessageForLocales("capture_scope_full_page");
  document.querySelectorAll(".segmentedControl").forEach((control) => control.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    control.querySelectorAll("button").forEach((item) => item.classList.toggle("isActive", item === button));
  }));
  document.querySelectorAll("[data-capture]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.capture;
    if (type === "image") {
      startCapture(type, {
        scope: document.querySelector("#imageScope .isActive").dataset.value,
        format: document.querySelector("#imageFormat .isActive").dataset.value
      });
    } else startCapture(type);
  }));
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.copy;
    if (type === "image") {
      copyCapture("image", {
        scope: document.querySelector("#imageScope .isActive").dataset.value,
        format: document.querySelector("#imageFormat .isActive").dataset.value
      });
    } else copyCapture(type);
  }));
  const tab = await getActiveSupportedTab();
  const badge = document.getElementById("mediaBadge");
  if (!tab) {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }
  try {
    mediaItems = await chrome.tabs.sendMessage(tab.id, { command: "getMediaCandidates" }) || [];
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
    updateMediaTaskProgress(task, message.index, message.percent, message.stage, message.loadedBytes, message.totalBytes || message.fileSize);
    if (message.fileSize > 0) setExactMediaFileSize(task.closest(".popupMediaItem").querySelector(".mediaFileSize"), message.fileSize);
    if (message.done || message.error) task.closest(".popupMediaItem").querySelector(".mediaDownload").disabled = false;
  }
});

/* -------- Top Menu bar -------- */

function onPageLoad_InitTopMenuBar() {
  const btnAnnotations = document.getElementById("btnAnnotations");
  btnAnnotations.setAttribute("title", easyReadTools.getMessageForLocales("popup_page_top_menu_bar_annotations_title"));
  btnAnnotations.setAttribute("aria-label", btnAnnotations.title);
  chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab?.id || !easyReadTools.isSupportedScheme(tab.url)) {
      btnAnnotations.disabled = true;
      return;
    }
    try {
      const state = await chrome.tabs.sendMessage(tab.id, { command: "getAnnotationSidebarState" });
      btnAnnotations.setAttribute("aria-pressed", String(Boolean(state?.visible)));
    } catch {
      btnAnnotations.disabled = true;
    }
  });
  btnAnnotations.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const state = await chrome.tabs.sendMessage(tab.id, { command: "toggleAnnotationSidebar" });
    btnAnnotations.setAttribute("aria-pressed", String(Boolean(state?.visible)));
  });

  const btnAllRecords = document.getElementById("btnAllRecords");
  btnAllRecords.setAttribute("title", easyReadTools.getMessageForLocales("popup_page_top_menu_bar_all_records_title"));
  btnAllRecords.addEventListener('click', async () => {
    chrome.tabs.create({ active: true, url: '/records/allRecords.html' });
  });

  const btnSetting = document.getElementById("btnSetting");
  btnSetting.setAttribute("title", easyReadTools.getMessageForLocales("popup_page_top_menu_bar_setting_title"));
  btnSetting.addEventListener('click', async () => {
    chrome.tabs.create({ active: true, url: '/setting/setting.html' });
  });
}

/* -------- ReadLaters -------- */

async function renderReadLaters(queryValue, context) {
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

        const isHighlightItem = await isNeedHighlightCurrentPageInReadLaters(item["key"]);

        element.querySelector('label').setAttribute('for', ckId);
        element.querySelector('a').textContent = (isHighlightItem ? "👀 " : "") + item["title"];
        element.querySelector('a').href = item["url"];
        element.querySelector('a').setAttribute('title', item["title"]);

        const position = item["position"];
        if(position && position.progress) {
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
  else {
    showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_readlaters"));
  }
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
      const liElement = document.getElementById(context.checkBoxId).parentElement;
      if (liElement) {
        const olElement = liElement.parentElement;
        olElement.removeChild(liElement);
        document.getElementById("titleReadLaters").textContent = easyReadTools.getMessageForLocales("popup_page_total_pages", [olElement.childNodes.length]);
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
      if (context.pageKey === oldValue[i].key && oldValue[i].status === easyReadTools.READ_STATUS_UNREAD) {
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

async function isNeedHighlightCurrentPageInReadLaters(key) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    if (key === pageUrl) {
      return true;
    }
  }
  return false;
}

function onPageLoad_InitReadLaters() {
  document.getElementById("btnReadLaterText").textContent = easyReadTools.getMessageForLocales("popup_btn_read_later_text");

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
        document.getElementById("outputAllRecords").innerHTML = easyReadTools.getMessageForLocales("popup_page_message_records_removed");
      });
    }
  });

  easyReadTools.getStorageJsonData(
    easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]),
    renderReadLaters, { key: easyReadTools.READ_LATERS_NAME });
}

/* -------- Notes -------- */

async function onPageLoad_InitNotes() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    if (easyReadTools.isSupportedScheme(pageUrl)) {
      easyReadTools.getStorageJsonData(
        easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageUrl]),
        renderPageNotes,
        { key: pageUrl });
    }
  }
}

function renderPageNotes(queryValue, context) {
  let notesPage = queryValue[context.key];
  if (notesPage) {
    if (notesPage.notes && notesPage.notes.length > 0) {
      // display the outputNotes
      const outputNotesSeperator = document.getElementById("outputNotesSeperator");
      const outputNotes = document.getElementById("outputNotes");
      outputNotesSeperator.classList.remove("outputNotesSeperatorDefault");
      outputNotesSeperator.classList.add("outputNotesSeperator");
      outputNotes.classList.remove("outputNotesDefault");
      outputNotes.classList.add("outputNotes");

      const elements = new Set();
      for(var i = 0; i < notesPage.notes.length; i++) {
        const template = document.getElementById('templateNotes');
        const element = template.content.cloneNode(true);

        const noteItem = element.querySelector('.noteItem');
        noteItem.textContent = decodeURIComponent(notesPage.notes[i].selectionText);
        noteItem.setAttribute("title", easyReadTools.formatDate(notesPage.notes[i].createDateTime));

        elements.add(element);
      }
      document.getElementById("titleNotes").textContent = easyReadTools.getMessageForLocales("popup_page_notes_title");
      document.getElementById('outputNotes').querySelector("ol").append(...elements);
    }
    else {
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_notes"));
    }
  }
  else {
    // hidden the outputNotes
    const outputNotesSeperator = document.getElementById("outputNotesSeperator");
    const outputNotes = document.getElementById("outputNotes");
    
    outputNotesSeperator.classList.remove("outputNotesSeperator");
    outputNotesSeperator.classList.add("outputNotesSeperatorDefault");

    outputNotes.classList.remove("outputNotes");
    outputNotes.classList.add("outputNotesDefault");
  }
}

const btnDownloadNotes = document.getElementById("btnDownloadNotes");
btnDownloadNotes.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    easyReadTools.getStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageUrl]), (result) => {
      var txtMarkdownTemplate = `  
# $title$

- Tags: #EasyRead
- CreateDateTime: $createDateTime$
- Link: [$title$]($url$)

---

## ${easyReadTools.getMessageForLocales("popup_page_notes_title")}
{notes_section}`;
      var txtMarkdownNotesSectionTemplate = `
### $createDateTime$

$selectionText$
`;
      const files = easyReadTools.convertNotesToMarkdownFiles(result, txtMarkdownTemplate, txtMarkdownNotesSectionTemplate);
      if(files && files.length > 0) {
        easyReadTools.exportToMarkdownFile(files[0].content, files[0].name);
      }
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_notes_downloaded"));
    });
  }
});

const btnRemoveNotes = document.getElementById("btnRemoveNotes");
btnRemoveNotes.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    easyReadTools.removeStorageJsonData(easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageUrl]), () => {
      onPageLoad_InitNotes();
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_notes_removed"));
    });
  }
});

/* -------- AutoRecords -------- */

function renderPageRecords(queryValue, context) {
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
      element.querySelector('.url').textContent = readedPage.url;
      element.querySelector('.message').textContent = message;
      element.querySelector('.readedTimes').innerHTML = readTimesToString;

      elements.add(element);
      document.getElementById('outputAllRecords').append(...elements);
    }
    else {
      showMessages(easyReadTools.getMessageForLocales("popup_page_message_no_records_no_datetimes"));
    }
  }
  else {
    document.getElementById('outputAllRecords').innerHTML = easyReadTools.getMessageForLocales("popup_page_message_no_records_text");
  }
}

async function onPageLoad_InitAllRecords() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    const pageUrl = easyReadTools.getKey(tab.url);
    if (easyReadTools.isSupportedScheme(pageUrl)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      easyReadTools.getStorageJsonData(
        easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageUrl]),
        renderPageRecords,
        { key: pageUrl });
    }
    else {
      document.getElementById("outputAllRecords").textContent = easyReadTools.getMessageForLocales("popup_page_message_records_not_supported");
    }
  }
}

(function onPageLoad() {
  onPageLoad_InitTitle();
  onPageLoad_InitTopMenuBar();
  onPageLoad_InitReadLaters();
  onPageLoad_InitNotes();
  onPageLoad_InitAllRecords();
  initializeWorkspaceTabs();
})();
