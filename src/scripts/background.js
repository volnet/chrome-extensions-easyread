import './diagnostics.js';
import * as easyReadTools from './easyReadTools.js';
import { applyVideoProgress, createNoteItem, createTabNavigationTracker, removeNoteById } from './easyReadData.mjs';

const tabNavigationTracker = createTabNavigationTracker();
const highlightContextByTab = new Map();
const bilibiliDownloadRules = new Map();
let nextBilibiliRuleId = 120000;

async function removeBilibiliDownloadRule(downloadId) {
  const ruleId = bilibiliDownloadRules.get(downloadId);
  if (!ruleId) return;
  bilibiliDownloadRules.delete(downloadId);
  try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }); } catch { /* Session cleanup is best effort. */ }
}

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current === "complete" || delta.state?.current === "interrupted") {
    removeBilibiliDownloadRule(delta.id);
  }
});

/*
(function () {
  console.log(easyReadTools.configs.getConfigs().IsAutoRecordedEnabled);
})()
*/

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.status === 'complete') {
      console.log("chrome.tabs.onActivated.callback = " + tab.url);
      if (easyReadTools.isSupportedScheme(tab.url)) {
        autoRecordCurrentPage(tab);
        tabNavigationTracker.markActivated(tab.id, tab.url);
      }
    }
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo?.status === 'loading') {
    tabNavigationTracker.markLoading(tabId, changeInfo.url);
  }
  if (changeInfo && changeInfo.status === 'complete') {
    if (easyReadTools.isSupportedScheme(tab.url)) {
      if (tabNavigationTracker.shouldRecordOnComplete(tabId, tab.url)) {
        autoRecordCurrentPage(tab);
      }
      if (!easyReadTools.hasAnchor(tab.url)) {
        setTabScroll(tab);
      }
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabNavigationTracker.remove(tabId);
  highlightContextByTab.delete(tabId);
});

chrome.runtime.onStartup.addListener(() => {
  easyReadTools.updateBudgeText();
});
chrome.runtime.onInstalled.addListener(async () => {
  easyReadTools.updateBudgeText();
  await installContextMenus();
});

function updateStorageCallback_AllRecordsURLDateTimes(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  let newValue = {};
  // queryValue == {} or {thePageKey : it's value}
  // console.log(queryValue);
  let oldValue = queryValue[context.key];
  if (oldValue) {
    const datetimes = queryValue[context.key]["datetimes"];
    if (datetimes && datetimes.length > 0 && easyReadTools.isByHuman(datetimes)) {
      // newValue = { title: context.tab.title, url: context.tab.url, datetimes: [...datetimes, Date.now()] };
      oldValue["datetimes"] = [...datetimes, Date.now()];
      result.value = oldValue;
      result.status = easyReadTools.UPDATE_STATUS_YES;
    } else {
      result.status = easyReadTools.UPDATE_STATUS_NO;
      result.message = "No update reason: The last datetime is too closely.";
    }
  } else {
    // create new
    newValue = { title: context.tab.title, url: context.tab.url, datetimes: [Date.now()] };
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  return result;
}

function autoRecordCurrentPage(tab) {
  const pageKey = easyReadTools.getKey(tab.url);
  if (easyReadTools.isSupportedScheme(tab.url)) {
    const keyChain = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
    easyReadTools.updateStorageJsonData(keyChain, updateStorageCallback_AllRecordsURLDateTimes, {
      key: pageKey,
      tab: tab
    });
  }
}

function updateStorageCallback_ReadLatersPosition(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  // queryValue == {} or {thePageKey : it's value}
  // console.log("updateStorageCallback_ReadLatersPosition");
  // console.log(queryValue);
  let oldValue = queryValue[context.key];
  if (oldValue && oldValue.length > 0) {
    for (let i = 0; i < oldValue.length; ++i) {
      if (oldValue[i].key === context.pageKey) {
        oldValue[i]["position"] = context.position;
        result.value = oldValue;
        result.status = easyReadTools.UPDATE_STATUS_YES;
        result.message = "position is updated";
      }
    }
  }
  return result;
}

function updateStorageCallback_AllRecordsPosition(queryValue, context) {
  let result = { status: easyReadTools.UPDATE_STATUS_NO, value: null, message: "" };
  // queryValue == {} or {thePageKey : it's value}
  // console.log(queryValue);
  let oldValue = queryValue[context.key];
  if (oldValue) {
    oldValue["position"] = context.position;
    result.value = oldValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
    result.message = "position is updated";
  }
  return result;
}

// add a Listener to add
// receive the page position.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const sendResponse = (result) => {
    if (result?.ok === false && result.error) {
      globalThis.EasyReadDiagnostics?.record(new Error(result.error), {
        operation: message.command, source: "background-response", original: result.debug,
        page: sender.tab ? { url: sender.tab.url, title: sender.tab.title } : null
      }, false);
    }
    respond(result);
  };
  const tab = sender.tab;
  if (message?.command === "saveMediaBlob" && tab) {
    (async () => {
      try {
        const blobUrl = new URL(message.url);
        if (blobUrl.protocol !== "blob:" || blobUrl.origin !== new URL(sender.url || tab.url).origin) throw new Error("Invalid media blob origin");
        const downloadId = await chrome.downloads.download({ url: blobUrl.href, filename: message.filename, saveAs: false });
        for (let poll = 0; poll < 1200; poll++) {
          const [download] = await chrome.downloads.search({ id: downloadId });
          if (download?.state === "complete") { sendResponse({ ok: true, downloadId }); return; }
          if (!download || download.state === "interrupted") throw new Error(download?.error || "Download interrupted");
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        await chrome.downloads.cancel(downloadId);
        throw new Error("Download timed out");
      } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false); sendResponse({ ok: false, error: error.message }); }
    })();
    return true;
  }
  if (message?.command === "ensureMediaEngine" && tab) {
    chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [sender.frameId ?? 0] }, files: ["scripts/mediaEngine.js"] }).then(
      () => sendResponse({ ok: true }), error => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message?.command === "ensureMediaTransmuxer" && tab) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [sender.frameId ?? 0] },
      files: ["scripts/mux-mp4.min.js"]
    }).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message?.command === "mediaFetchResource" && tab) {
    (async () => {
      try {
        const resourceUrl = new URL(message.url);
        if (!/^https?:$/.test(resourceUrl.protocol)) throw new Error("Unsupported media URL");
        const headers = {};
        const range = message.range;
        if (range) {
          if (!Number.isSafeInteger(range.start) || range.start < 0 || !Number.isSafeInteger(range.length) || range.length <= 0 || !Number.isSafeInteger(range.start + range.length)) throw new Error("Invalid media byte range");
          headers.Range = `bytes=${range.start}-${range.start + range.length - 1}`;
        }
        if (!(await chrome.permissions.contains({ origins: [`${resourceUrl.origin}/*`] }))) {
          sendResponse({ ok: false, error: "capture_download_permission_missing", code: "capture_download_permission_missing", requiredOrigin: `${resourceUrl.origin}/*` });
          return;
        }
        const response = await fetch(resourceUrl.href, {
          headers,
          signal: AbortSignal.timeout(25000),
          credentials: "include",
          cache: "no-store",
          referrer: message.referrer || tab.url || undefined,
          referrerPolicy: "strict-origin-when-cross-origin"
        });
        if (!response.ok) { sendResponse({ ok: false, error: `${response.status} ${response.statusText}`, status: response.status }); return; }
        if (message.asText) {
          sendResponse({ ok: true, status: response.status, url: response.url, contentType: response.headers.get("content-type") || "", text: await response.text() });
          return;
        }
        let bytes = new Uint8Array(await response.arrayBuffer());
        if (range) {
          if (response.status === 206) {
            const contentRange = response.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(?:\d+|\*)$/);
            if (!contentRange || Number(contentRange[1]) !== range.start || Number(contentRange[2]) !== range.start + range.length - 1 || bytes.length !== range.length) throw new Error("Invalid media range response");
          } else if (response.status === 200 && bytes.length >= range.start + range.length) bytes = bytes.slice(range.start, range.start + range.length);
          else throw new Error("Incomplete media range response");
        } else if (response.status === 206) {
          const contentRange = response.headers.get("content-range")?.match(/^bytes 0-(\d+)\/(\d+)$/);
          if (!contentRange || Number(contentRange[1]) + 1 !== Number(contentRange[2]) || bytes.length !== Number(contentRange[2])) throw new Error("capture_media_incomplete_mp4");
        }
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        sendResponse({ ok: true, status: response.status, url: response.url, contentType: response.headers.get("content-type") || "", base64: btoa(binary), byteLength: bytes.length });
      } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }
  if (message?.command === "snapshotFetchResource") {
    (async () => {
      try {
        let response;
        try {
          response = await fetch(message.url, { credentials: "include", cache: "force-cache", referrer: message.referrer || undefined, referrerPolicy: "strict-origin-when-cross-origin" });
          if ([401, 403, 404].includes(response.status)) throw new Error(String(response.status));
        } catch {
          response = await fetch(message.url, { credentials: "include", cache: "force-cache", referrerPolicy: "no-referrer" });
        }
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        let contentType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0];
        if (message.asText) {
          sendResponse({ ok: true, url: response.url, contentType, text: await response.text() });
          return;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!contentType || contentType === "application/octet-stream") {
          const ascii = String.fromCharCode(...bytes.subarray(0, 16));
          if (bytes[0] === 0x89 && ascii.slice(1, 4) === "PNG") contentType = "image/png";
          else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) contentType = "image/jpeg";
          else if (ascii.startsWith("GIF8")) contentType = "image/gif";
          else if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") contentType = "image/webp";
          else if (ascii.startsWith("wOFF")) contentType = "font/woff";
          else if (ascii.startsWith("wOF2")) contentType = "font/woff2";
          else if (ascii.slice(4, 8) === "ftyp") contentType = "video/mp4";
          else if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) contentType = "video/webm";
          else {
            const extension = new URL(response.url || message.url).pathname.split(".").pop().toLowerCase();
            const extensionTypes = { svg: "image/svg+xml", avif: "image/avif", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" };
            contentType = extensionTypes[extension] || contentType;
          }
        }
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        sendResponse({ ok: true, url: response.url, contentType, dataUrl: `data:${contentType};base64,${btoa(binary)}` });
      } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false); sendResponse({ ok: false, error: error.message }); }
    })();
    return true;
  }
  if (message?.command === "snapshotCollectFrames" && tab) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const clone = document.documentElement.cloneNode(true);
        const adoptedCss = [...(document.adoptedStyleSheets || [])].flatMap((sheet) => {
          try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
        }).join("\n");
        if (adoptedCss) {
          const style = document.createElement("style");
          style.textContent = adoptedCss;
          clone.querySelector("head")?.appendChild(style);
        }
        const sourceControls = document.querySelectorAll("input, textarea, select, option, details, dialog");
        const clonedControls = clone.querySelectorAll("input, textarea, select, option, details, dialog");
        sourceControls.forEach((source, index) => {
          const target = clonedControls[index];
          if (!target) return;
          if (source.localName === "textarea") target.textContent = source.value;
          if (source.localName === "input" && source.type !== "password") target.setAttribute("value", source.value);
          for (const state of ["checked", "selected", "open"]) target.toggleAttribute(state, Boolean(source[state]));
        });
        const sources = document.querySelectorAll("canvas");
        const targets = clone.querySelectorAll("canvas");
        sources.forEach((source, index) => {
          try {
            const image = document.createElement("img");
            image.src = source.toDataURL();
            targets[index]?.replaceWith(image);
          } catch { /* Tainted canvases remain empty. */ }
        });
        const sourceImages = document.querySelectorAll("img");
        const clonedImages = clone.querySelectorAll("img");
        sourceImages.forEach((source, index) => {
          if (source.currentSrc) clonedImages[index]?.setAttribute("src", source.currentSrc);
          clonedImages[index]?.removeAttribute("srcset");
          clonedImages[index]?.removeAttribute("sizes");
        });
        const sourceElements = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
        const clonedElements = [clone, ...clone.querySelectorAll("*")];
        function copyShadow(source, target) {
          if (!source.shadowRoot || !target) return;
          const template = document.createElement("template");
          template.setAttribute("shadowrootmode", "open");
          for (const child of source.shadowRoot.childNodes) template.content.append(child.cloneNode(true));
          const originals = source.shadowRoot.querySelectorAll("*");
          const copies = template.content.querySelectorAll("*");
          originals.forEach((child, index) => copyShadow(child, copies[index]));
          const shadowCss = [...(source.shadowRoot.adoptedStyleSheets || [])].flatMap((sheet) => {
            try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
          }).join("\n");
          if (shadowCss) {
            const style = document.createElement("style");
            style.textContent = shadowCss;
            template.content.prepend(style);
          }
          target.prepend(template);
        }
        sourceElements.forEach((source, index) => copyShadow(source, clonedElements[index]));
        clone.querySelectorAll("script, noscript").forEach((element) => element.remove());
        return { url: location.href, html: `<!doctype html>${clone.outerHTML}`, title: document.title };
      }
    }, async (results) => {
      const error = chrome.runtime.lastError;
      if (error) { sendResponse({ ok: false, error: error.message }); return; }
      let navigationFrames = [];
      try { navigationFrames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }) || []; } catch { /* Injection results remain usable without hierarchy metadata. */ }
      const hierarchy = new Map(navigationFrames.map((frame) => [frame.frameId, frame]));
      sendResponse({
        ok: true,
        frames: results.map((item) => ({
          frameId: item.frameId,
          parentFrameId: hierarchy.get(item.frameId)?.parentFrameId ?? -1,
          documentId: item.documentId,
          ...item.result
        }))
      });
    });
    return true;
  }
  if (message?.command === "downloadYouTubeInPage" && tab) {
    (async () => {
      try {
        const pageUrl = new URL(tab.url);
        const mediaUrl = new URL(message.url);
        if (!/(^|\.)youtube\.com$/i.test(pageUrl.hostname) || !/(^|\.)googlevideo\.com$/i.test(mediaUrl.hostname) || mediaUrl.pathname !== "/videoplayback") {
          throw new Error("Untrusted YouTube media URL");
        }
        const fileName = String(message.filename || "EasyRead-video.mp4").replace(/[\\/:*?"<>|]/g, "-").slice(0, 180);
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          args: [mediaUrl.href, fileName],
          func: async (url, name) => {
            try {
              const response = await fetch(url, {
                credentials: "include",
                cache: "no-store",
                headers: { Range: "bytes=0-" },
                referrer: location.href,
                referrerPolicy: "strict-origin-when-cross-origin"
              });
              if (!response.ok) return { ok: false, error: `${response.status} ${response.statusText}` };
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = blobUrl;
              link.download = name;
              link.hidden = true;
              document.documentElement.appendChild(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
              return { ok: true, size: blob.size, mimeType: blob.type };
            } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false); return { ok: false, error: error.message }; }
          }
        });
        const result = results?.[0]?.result;
        sendResponse(result?.ok ? result : { ok: false, error: result?.error || "YouTube page download failed" });
      } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false); sendResponse({ ok: false, error: error.message }); }
    })();
    return true;
  }
  if (message?.command === "startDirectDownload") {
    if (!chrome.downloads?.download) {
      sendResponse({ ok: false, error: chrome.i18n.getMessage("capture_download_permission_missing") });
      return false;
    }
    (async () => {
      let ruleId = null;
      try {
        const mediaUrl = new URL(message.url);
        const referrerUrl = message.referrer ? new URL(message.referrer) : null;
        const isBilibiliDash = message.source === "bilibili-playinfo"
          && /(?:^|\.)(?:bilivideo\.(?:com|cn)|hdslb\.com)$/i.test(mediaUrl.hostname)
          && /(?:^|\.)bilibili\.com$/i.test(referrerUrl?.hostname || "");
        if (isBilibiliDash) {
          ruleId = nextBilibiliRuleId++;
          await chrome.declarativeNetRequest.updateSessionRules({
            addRules: [{
              id: ruleId,
              priority: 1,
              action: {
                type: "modifyHeaders",
                requestHeaders: [
                  { header: "Referer", operation: "set", value: "https://www.bilibili.com/" },
                  { header: "Origin", operation: "remove" }
                ]
              },
              condition: {
                urlFilter: mediaUrl.href,
                requestDomains: [mediaUrl.hostname],
                resourceTypes: ["other"]
              }
            }]
          });
        }
        chrome.downloads.download({ url: mediaUrl.href, filename: message.filename, saveAs: false }, async (downloadId) => {
          const error = chrome.runtime.lastError;
          if (error || !downloadId) {
            if (ruleId) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }).catch(() => {});
            sendResponse({ ok: false, error: error?.message || "Download did not start" });
            return;
          }
          if (ruleId) bilibiliDownloadRules.set(downloadId, ruleId);
          sendResponse({ ok: true, downloadId, ruleId, referrerApplied: Boolean(ruleId) });
        });
      } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false);
        if (ruleId) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }).catch(() => {});
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }
  if (message?.command === "getDirectDownloadStatus") {
    if (!chrome.downloads?.search) {
      sendResponse({ ok: false, error: chrome.i18n.getMessage("capture_download_permission_missing") });
      return false;
    }
    chrome.downloads.search({ id: message.downloadId }, (downloads) => {
      const error = chrome.runtime.lastError;
      sendResponse(error ? { ok: false, error: error.message } : { ok: true, download: downloads?.[0] ?? null });
    });
    return true;
  }
  if (message?.command === "removeFailedDirectDownload") {
    chrome.downloads.search({ id: message.downloadId }, async (downloads) => {
      const error = chrome.runtime.lastError;
      const download = downloads?.[0];
      if (error || !download) { sendResponse({ ok: false, error: error?.message || "Download not found" }); return; }
      const removable = download.byExtensionId === chrome.runtime.id
        && download.state === "interrupted"
        && download.exists
        && download.fileSize >= 0
        && download.fileSize <= 65536
        && /text\/html/i.test(download.mime || "");
      if (!removable) { sendResponse({ ok: true, removed: false }); return; }
      try {
        await chrome.downloads.removeFile(download.id);
        await chrome.downloads.erase({ id: download.id });
        sendResponse({ ok: true, removed: true });
      } catch (cleanupError) { globalThis.EasyReadDiagnostics?.record(cleanupError, { source: "src/scripts/background.js" }, false); sendResponse({ ok: false, error: cleanupError.message }); }
    });
    return true;
  }
  if (message?.command === "captureVisibleTab" && tab) {
    const format = message.format === "jpeg" ? "jpeg" : "png";
    chrome.tabs.captureVisibleTab(tab.windowId, { format, quality: format === "jpeg" ? 90 : undefined }, (dataUrl) => {
      sendResponse(chrome.runtime.lastError
        ? { ok: false, error: chrome.runtime.lastError.message }
        : { ok: true, dataUrl });
    });
    return true;
  }
  if (tab) {
    const pageKey = easyReadTools.getKey(tab.url);
    if (message?.command === "updateHighlightContextMenu") {
      updateHighlightContextMenu(tab.id, {
        noteId: message.noteId,
        annotationId: message.annotationId,
        pageKey,
        hasSelection: message.hasSelection === true
      });
    }
    if (message && message.position) {
      // update readLaters's position.
      if (easyReadTools.isSupportedScheme(tab.url)) {
        // console.log("easyReadTools.updateStorageJsonData(keyChainReadLaters")
        const keyChainReadLaters = easyReadTools.keyChainGenerate([easyReadTools.READ_LATERS_NAME]);
        easyReadTools.updateStorageJsonData(keyChainReadLaters, updateStorageCallback_ReadLatersPosition, {
          key: easyReadTools.READ_LATERS_NAME,
          tab: tab,
          pageKey: pageKey,
          position: message.position
        });

        // update autoRecord's position.
        const keyChainAllRecords = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
        easyReadTools.updateStorageJsonData(keyChainAllRecords, updateStorageCallback_AllRecordsPosition, {
          key: pageKey,
          tab: tab,
          position: message.position
        });
      }
    }
    if (message?.videoProgress && easyReadTools.isSupportedScheme(tab.url)) {
      const keyChain = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
      easyReadTools.updateStorageJsonData(keyChain, updateStorageCallbackVideoProgress, {
        key: pageKey,
        tab,
        videoProgress: message.videoProgress
      });
    }
    if (sendResponse) {
      sendResponse("success");
    }
  }
  // https://developer.chrome.com/docs/extensions/mv3/messaging/
  // If you want to asynchronously use sendResponse(), add return true; to the onMessage event handler.
  // return true;
});

function updateStorageCallbackVideoProgress(queryValue, context) {
  const oldValue = queryValue[context.key] ?? {
    title: context.tab.title,
    url: context.tab.url,
    datetimes: [Date.now()]
  };
  return {
    status: easyReadTools.UPDATE_STATUS_YES,
    value: applyVideoProgress(oldValue, context.videoProgress),
    message: "video progress updated"
  };
}

async function setTabScroll(tab) {
  try {
    // console.log("query the tab's position and send message to content.js to set it.");
    if (tab) {
      const pageKey = easyReadTools.getKey(tab.url);
      const keyChainAllRecords = easyReadTools.keyChainGenerate([easyReadTools.ALL_RECORDS_NAME, pageKey]);
      await easyReadTools.getStorageJsonData(keyChainAllRecords, async (queryValue) => {
        let dataValue = queryValue[pageKey];
        if (dataValue && dataValue.position) {
          let msg = {
            "command": "setScroll",
            "position": dataValue.position
          };
          // console.log("Relocate the page at the position: ");
          try {
            chrome
            await chrome.tabs.sendMessage(tab.id, msg);
          } catch (e) { globalThis.EasyReadDiagnostics?.record(e, { source: "src/scripts/background.js" }, false);
            console.log(e);
          }
        }
      });
    }
  }
  catch (e) { globalThis.EasyReadDiagnostics?.record(e, { source: "src/scripts/background.js" }, false);
    console.log(e);
  }
}

async function installContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    title: easyReadTools.getMessageForLocales("contextMenus_title_page_addReadLater"),
    contexts: ["page"],
    id: "page"
  });

  chrome.contextMenus.create({
    title: easyReadTools.getMessageForLocales("contextMenus_title_selection_addNote"),
    contexts: ["selection"],
    id: "selection-add-highlight"
  });

  chrome.contextMenus.create({
    title: easyReadTools.getMessageForLocales("contextMenus_title_selection_addAnnotation"),
    contexts: ["selection"],
    id: "selection-add-annotation"
  });

  chrome.contextMenus.create({
    title: easyReadTools.getMessageForLocales("contextMenus_title_selection_removeHighlight"),
    contexts: ["all"],
    id: "selection-remove-highlight",
    visible: false
  });
  chrome.contextMenus.create({
    title: easyReadTools.getMessageForLocales("contextMenus_title_selection_removeAnnotation"),
    contexts: ["all"],
    id: "selection-remove-annotation",
    visible: false
  });
}

async function updateHighlightContextMenu(tabId, context) {
  highlightContextByTab.set(tabId, context);
  const isHighlight = context.noteId !== null && context.noteId !== undefined;
  const isAnnotation = context.annotationId !== null && context.annotationId !== undefined;
  try {
    await Promise.all([
      chrome.contextMenus.update("selection-add-highlight", { visible: context.hasSelection && !isHighlight && !isAnnotation }),
      chrome.contextMenus.update("selection-add-annotation", { visible: context.hasSelection && !isAnnotation }),
      chrome.contextMenus.update("selection-remove-highlight", { visible: isHighlight }),
      chrome.contextMenus.update("selection-remove-annotation", { visible: isAnnotation })
    ]);
  } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false);
    console.log("Could not update EasyRead highlight context menus.", error);
  }
}

chrome.contextMenus.onClicked.addListener(contextMenusOnClick);
function contextMenusOnClick(info, tab) {
  switch (info.menuItemId) {
    case 'page':
      addReadLater();
      break;
    case 'selection-add-highlight':
      addNotesSelection(info.selectionText, tab);
      break;
    case 'selection-add-annotation':
      openAnnotationComposer(info.selectionText, tab);
      break;
    case 'selection-remove-highlight':
      removeHighlightForTab(tab);
      break;
    case 'selection-remove-annotation':
      removeAnnotationForTab(tab);
      break;
    default:
      console.log('No match context menus.');
  }
}

async function addReadLater() {
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
}

function addReadLatersStorageUpdated(updateStatus) {
  if (updateStatus) {
    easyReadTools.updateBudgeText();
  }
}

/* showMessages to notify users */
function showMessages(message) {
  console.log("background.js: " + message);
}

function updateStorageCallback_addNotes(queryValue, context) {
  let result = {
    status: easyReadTools.UPDATE_STATUS_NO,
    value: null,
    message: "",
    callback_onUpdated: context.callbackOnUpdated
  };
  // queryValue == {} or {thePageKey : it's value}
  // console.log(queryValue);
  let oldValue = queryValue[context.key];
  const note = createNoteItem(context.selectionText, {
    id: easyReadTools.generateRandomId(),
    now: Date.now,
    prefix: context.prefix,
    suffix: context.suffix
  });
  if (oldValue && oldValue["notes"] && oldValue["notes"].length > 0) {
      oldValue["notes"] = [...oldValue["notes"], note];
      result.value = oldValue;
      result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  else {
    // create new
    let newValue = { title: context.tab.title, url: context.tab.url, "createDateTime": Date.now(),
      notes: [note] };
    result.value = newValue;
    result.status = easyReadTools.UPDATE_STATUS_YES;
  }
  return result;
}

async function addNotesSelection(selectionText, contextMenuTab) {
  if(selectionText && selectionText.length > 0) {
    const tabs = contextMenuTab ? [contextMenuTab] : await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      const pageKey = easyReadTools.getKey(tab.url);
      if (easyReadTools.isSupportedScheme(tab.url)) {
        let selectionContext = {};
        try {
          selectionContext = await chrome.tabs.sendMessage(tab.id, { command: "getSelectionContext" }) ?? {};
        } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false);
          console.log("Could not capture selection context; saving the selected text only.", error);
        }
        const keyChain = easyReadTools.keyChainGenerate([easyReadTools.NOTES_NAME, pageKey]);
        easyReadTools.updateStorageJsonData(keyChain, updateStorageCallback_addNotes, {
          key: pageKey,
          tab: tab,
          selectionText,
          prefix: selectionContext.prefix,
          suffix: selectionContext.suffix,
          callbackOnUpdated(updateStatus) {
            if (updateStatus) {
              chrome.tabs.sendMessage(tab.id, { command: "refreshHighlights" }).catch(() => {});
            }
          }
        });
      }
    }
  }
}

async function removeAnnotationForTab(tab) {
  const context = tab ? highlightContextByTab.get(tab.id) : null;
  if (!tab?.id || context?.annotationId === null || context?.annotationId === undefined) return;
  const currentPageKey = easyReadTools.getKey(tab.url);
  if (context.pageKey !== currentPageKey) return;
  await chrome.tabs.sendMessage(tab.id, { command: "removeAnnotation", annotationId: context.annotationId }).catch(() => {});
  highlightContextByTab.delete(tab.id);
  await updateHighlightContextMenu(tab.id, { noteId: null, annotationId: null, pageKey: currentPageKey, hasSelection: false });
}

async function openAnnotationComposer(selectionText, tab) {
  if (!selectionText || !tab?.id) return;
  let selectionContext = {};
  try {
    selectionContext = await chrome.tabs.sendMessage(tab.id, { command: "getSelectionContext" }) ?? {};
  } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { source: "src/scripts/background.js" }, false);
    console.log("Could not capture annotation context.", error);
  }
  chrome.tabs.sendMessage(tab.id, {
    command: "openAnnotationComposer",
    selectionText,
    prefix: selectionContext.prefix,
    suffix: selectionContext.suffix
  }).catch(() => {});
}

async function removeHighlightForTab(tab) {
  const context = tab ? highlightContextByTab.get(tab.id) : null;
  if (!tab || context?.noteId === null || context?.noteId === undefined) return;

  const currentPageKey = easyReadTools.getKey(tab.url);
  if (context.pageKey !== currentPageKey) return;

  const stored = await chrome.storage.local.get([easyReadTools.NOTES_NAME]);
  const result = removeNoteById(stored[easyReadTools.NOTES_NAME] ?? {}, currentPageKey, context.noteId);
  if (!result.removed) return;

  await chrome.storage.local.set({ [easyReadTools.NOTES_NAME]: result.notesByPage });
  highlightContextByTab.delete(tab.id);
  await updateHighlightContextMenu(tab.id, { noteId: null, annotationId: null, pageKey: currentPageKey, hasSelection: false });
  chrome.tabs.sendMessage(tab.id, { command: "refreshHighlights" }).catch(() => {});
}
