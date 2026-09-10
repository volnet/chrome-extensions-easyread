(() => {
  "use strict";
  const mediaRequests = [];
  const mediaPattern = /\.(m3u8|m3u|m4s|mp4|webm|mp3|m4a|ogg|wav)(?:$|[?#])|\/(?:ext_tw_video|amplify_video|tweet_video|video)(?:\/|$)|video\.twimg\.com|twitter\.com\/i\/api\/.*(?:video|media)|x\.com\/i\/api\/.*(?:video|media)/i;
  const contentTypePattern = /^(application\/(?:vnd\.apple\.mpegurl|x-mpegurl|mpegurl|octet-stream)|video\/|audio\/)/i;

  function normalizeMediaUrl(input) {
    try {
      if (typeof globalThis.Request === "function" && input instanceof globalThis.Request) return input.url;
      if (input instanceof URL) return input.href;
      return String(input || "");
    } catch {
      return "";
    }
  }

  function rememberMediaRequest(url, detail = {}) {
    if (!url || !/^https?:/i.test(url)) return;
    const contentType = String(detail.contentType || "").split(";")[0].toLowerCase();
    if (!mediaPattern.test(url) && !contentTypePattern.test(contentType)) return;
    const existing = mediaRequests.find((item) => item.url === url);
    const item = existing || { url, firstSeenAt: Date.now() };
    item.lastSeenAt = Date.now();
    item.contentType = contentType || item.contentType || "";
    item.method = detail.method || item.method || "GET";
    item.source = detail.source || item.source || "network";
    item.status = detail.status || item.status || 0;
    item.referrer = detail.referrer || location.href;
    item.frameUrl = detail.frameUrl || item.frameUrl || "";
    item.trackType = detail.trackType || item.trackType || "";
    item.quality = detail.quality || item.quality || "";
    item.codecs = detail.codecs || item.codecs || "";
    item.bandwidth = detail.bandwidth || item.bandwidth || 0;
    item.width = Number(detail.width) || item.width || 0;
    item.height = Number(detail.height) || item.height || 0;
    item.duration = Number(detail.duration) || item.duration || 0;
    item.contentLength = Number(detail.contentLength) || item.contentLength || 0;
    item.poster = detail.poster || item.poster || "";
    if (Array.isArray(detail.backupUrls)) {
      item.backupUrls = [...new Set(detail.backupUrls.filter((candidate) => /^https?:/i.test(candidate) && candidate !== url))];
    }
    if (!existing) {
      mediaRequests.push(item);
      if (mediaRequests.length > 80) mediaRequests.shift();
    }
    if (!detail.fromFrame && globalThis !== globalThis.top) {
      globalThis.top.postMessage({
        type: "easyread-media-frame-request",
        request: { ...item, frameUrl: location.href, referrer: location.href }
      }, "*");
    }
  }

  function reportFramePlayerMetadata(media) {
    if (globalThis === globalThis.top || !media?.videoWidth || !media?.videoHeight) return;
    globalThis.top.postMessage({
      type: "easyread-media-frame-request",
      request: {
        url: location.href,
        frameUrl: location.href,
        referrer: location.href,
        source: "frame-player",
        contentType: "video/player",
        width: media.videoWidth,
        height: media.videoHeight,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        poster: media.poster || ""
      }
    }, "*");
  }

  document.addEventListener("loadedmetadata", (event) => {
    if (event.target instanceof HTMLVideoElement) reportFramePlayerMetadata(event.target);
  }, true);
  globalThis.setTimeout(() => document.querySelectorAll("video").forEach(reportFramePlayerMetadata), 1500);

  if (globalThis === globalThis.top) {
    globalThis.addEventListener("message", (event) => {
      const payload = event.data;
      if (event.source === globalThis || payload?.type !== "easyread-media-frame-request") return;
      const request = payload.request;
      try {
        const frameUrl = new URL(request?.frameUrl || "");
        if (frameUrl.origin !== event.origin || !/^https?:$/.test(frameUrl.protocol)) return;
      } catch { return; }
      rememberMediaRequest(request.url, {
        ...request,
        source: `frame-${request.source || "network"}`,
        fromFrame: true
      });
    });
  }

  function collectBilibiliDash() {
    if (!/(?:^|\.)bilibili\.com$/i.test(location.hostname)) return;
    const dash = globalThis.__playinfo__?.data?.dash || globalThis.__playinfo__?.result?.dash;
    if (!dash) return;
    const chooseVideo = (dash.video || []).slice().sort((left, right) => {
      const leftCompatible = /avc1|h264/i.test(left.codecs || "") ? 1 : 0;
      const rightCompatible = /avc1|h264/i.test(right.codecs || "") ? 1 : 0;
      return (right.id || 0) - (left.id || 0) || rightCompatible - leftCompatible || (right.bandwidth || 0) - (left.bandwidth || 0);
    })[0];
    const chooseAudio = (dash.audio || []).slice().sort((left, right) => (right.bandwidth || 0) - (left.bandwidth || 0))[0];
    for (const [trackType, track] of [["video", chooseVideo], ["audio", chooseAudio]]) {
      const backupUrls = [...new Set([...(track?.backupUrl || []), ...(track?.backup_url || [])].filter(Boolean))];
      const url = track?.baseUrl || track?.base_url || backupUrls.shift();
      if (!url) continue;
      rememberMediaRequest(url, {
        source: "bilibili-playinfo",
        contentType: track.mimeType || track.mime_type || `${trackType}/mp4`,
        trackType,
        quality: trackType === "video" ? `${track.width || ""}×${track.height || ""}` : `${Math.round((track.bandwidth || 0) / 1000)} kbps`,
        codecs: track.codecs || "",
        bandwidth: track.bandwidth || 0,
        contentLength: track.size || 0,
        width: track.width || 0,
        height: track.height || 0,
        backupUrls,
        status: 200
      });
    }
  }

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === "function") {
    globalThis.fetch = async function easyReadFetch(input, init) {
      const url = normalizeMediaUrl(input);
      const method = String(init?.method || input?.method || "GET").toUpperCase();
      rememberMediaRequest(url, { method, source: "fetch" });
      const response = await originalFetch.apply(this, arguments);
      rememberMediaRequest(response.url || url, {
        method,
        source: "fetch",
        status: response.status,
        contentType: response.headers?.get("content-type") || "",
        contentLength: response.headers?.get("content-length") || 0
      });
      return response;
    };
  }

  if (globalThis.XMLHttpRequest?.prototype) {
    const originalOpen = globalThis.XMLHttpRequest.prototype.open;
    const originalSend = globalThis.XMLHttpRequest.prototype.send;
    globalThis.XMLHttpRequest.prototype.open = function easyReadXhrOpen(method, url) {
      this.__easyReadMediaRequest = { method: String(method || "GET").toUpperCase(), url: normalizeMediaUrl(url) };
      return originalOpen.apply(this, arguments);
    };
    globalThis.XMLHttpRequest.prototype.send = function easyReadXhrSend() {
      const request = this.__easyReadMediaRequest;
      if (request) {
        rememberMediaRequest(request.url, { method: request.method, source: "xhr" });
        this.addEventListener("loadstart", () => rememberMediaRequest(this.responseURL || request.url, { method: request.method, source: "xhr" }), { once: true });
        this.addEventListener("load", () => rememberMediaRequest(this.responseURL || request.url, {
          method: request.method,
          source: "xhr",
          status: this.status,
          contentType: this.getResponseHeader("content-type") || "",
          contentLength: this.getResponseHeader("content-length") || 0
        }), { once: true });
      }
      return originalSend.apply(this, arguments);
    };
  }

  document.addEventListener("easyread-media-requests-request", () => {
    collectBilibiliDash();
    document.dispatchEvent(new CustomEvent("easyread-media-requests-response", { detail: JSON.stringify(mediaRequests.slice(-80)) }));
  });

  const closedRoots = new Map();
  const originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attachShadow(options) {
    const root = originalAttachShadow.call(this, options);
    if (options?.mode === "closed") closedRoots.set(this, root);
    return root;
  };
  document.addEventListener("easyread-snapshot-closed-shadow-request", () => {
    const elements = [...document.querySelectorAll("*")];
    const snapshots = [];
    for (const [host, root] of closedRoots) {
      const hostIndex = elements.indexOf(host);
      if (hostIndex < 0) continue;
      const adoptedCss = [...(root.adoptedStyleSheets || [])].flatMap((sheet) => {
        try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
      }).join("\n");
      snapshots.push({ hostIndex, html: root.innerHTML, adoptedCss });
    }
    document.dispatchEvent(new CustomEvent("easyread-snapshot-closed-shadow-response", { detail: JSON.stringify(snapshots) }));
  });
})();
