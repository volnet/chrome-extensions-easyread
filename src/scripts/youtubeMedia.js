(() => {
  "use strict";

  function isYouTubePage(hostname) {
    return /(^|\.)youtube\.com$/i.test(hostname || "");
  }

  function isGoogleVideoPlayback(url) {
    try { return /(^|\.)googlevideo\.com$/i.test(new URL(url).hostname) && /\/videoplayback$/i.test(new URL(url).pathname); }
    catch { return false; }
  }

  function formatSize(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** unit)).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
  }

  function formatContainer(mimeType) {
    const mime = String(mimeType || "").split(";")[0].toLowerCase();
    return ({ "video/mp4": "MP4", "audio/mp4": "M4A", "video/webm": "WebM", "audio/webm": "WebM" })[mime] || mime;
  }

  function buildCandidates(response, { poster = "", labels = {} } = {}) {
    const formats = [...(response?.streamingData?.formats || []), ...(response?.streamingData?.adaptiveFormats || [])];
    const title = response?.videoDetails?.title || "YouTube";
    const candidates = new Map();
    for (const format of formats) {
      if (!format?.url || !/^https?:/i.test(format.url)) continue;
      const mimeType = String(format.mimeType || "").split(";")[0];
      const hasVideo = mimeType.startsWith("video/");
      const hasAudio = mimeType.startsWith("audio/") || Boolean(format.audioQuality || format.audioSampleRate || format.audioChannels);
      if (!hasVideo && !hasAudio) continue;
      if (hasVideo && !hasAudio) continue;
      const trackLabel = hasVideo && hasAudio ? labels.muxed || "Video + audio" : hasAudio ? labels.audio || "Audio" : labels.video || "Video only";
      const quality = format.qualityLabel || format.audioQuality?.replace("AUDIO_QUALITY_", "").toLowerCase();
      const description = [quality, formatContainer(format.mimeType), trackLabel, formatSize(format.contentLength)].filter(Boolean).join(" · ");
      const key = `${format.itag || ""}:${format.url}`;
      if (candidates.has(key)) continue;
      candidates.set(key, {
        url: format.url,
        kind: hasVideo ? "video" : "audio",
        mimeType,
        poster,
        name: title,
        description,
        source: "youtube-player",
        itag: format.itag,
        hasAudio,
        hasVideo,
        quality: format.qualityLabel || "",
        width: Number(format.width) || 0,
        height: Number(format.height) || 0,
        duration: Number(response?.videoDetails?.lengthSeconds) || 0,
        contentLength: Number(format.contentLength) || 0
      });
    }
    return [...candidates.values()].sort((left, right) => {
      const leftComplete = left.hasVideo && left.hasAudio ? 1 : 0;
      const rightComplete = right.hasVideo && right.hasAudio ? 1 : 0;
      return rightComplete - leftComplete || right.contentLength - left.contentLength;
    });
  }

  globalThis.EasyReadYouTubeMedia = Object.freeze({ buildCandidates, isGoogleVideoPlayback, isYouTubePage });
})();
