// Local-only HLS demux/remux pipeline. Never infer completeness from a filename.
import { createFile, Log } from "mp4box";
import mux from "mux.js/lib/mp4/index.js";

Log.setLogLevel(Log.error);
const fail = (code, details = {}) => { const error = new Error(code); error.code = code; error.details = details; throw error; };
const bytesOf = value => value instanceof Uint8Array ? value : new Uint8Array(value);
const concat = parts => {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(bytesOf(part), offset); offset += part.byteLength; }
  return result;
};

export function parsePlaylist(text, baseUrl) {
  if (!text.trimStart().startsWith("#EXTM3U")) fail("media_invalid_playlist");
  const attrs = value => Object.fromEntries([...value.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)].map(match => [match[1], match[2].replace(/^"|"$/g, "")]));
  const result = { variants: [], audio: [], segments: [], endList: false, duration: 0 };
  let variant, key = null, map = null, duration = 0, sequence = 0, period = 0, pendingRange = null;
  let lastRange = null, lastMapRange = null;
  const range = (value, url, previous) => {
    if (!value) return null;
    const [length, explicitStart] = value.split("@").map(Number);
    const start = explicitStart ?? (previous?.url === url ? previous.start + previous.length : NaN);
    if (!Number.isSafeInteger(length) || length <= 0 || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(start + length)) fail("media_invalid_range");
    return { start, length, url };
  };
  for (const line of text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) variant = attrs(line.slice(18));
    else if (line.startsWith("#EXT-X-MEDIA:")) {
      const value = attrs(line.slice(13));
      if (value.TYPE === "AUDIO" && value.URI) result.audio.push({ group: value["GROUP-ID"], url: new URL(value.URI, baseUrl).href, default: value.DEFAULT === "YES", language: value.LANGUAGE });
    } else if (line.startsWith("#EXT-X-KEY:")) {
      const value = attrs(line.slice(11));
      if (value.METHOD !== "NONE" && (value.METHOD !== "AES-128" || (value.KEYFORMAT && value.KEYFORMAT !== "identity"))) fail("capture_media_drm_unsupported");
      key = value.METHOD === "NONE" ? null : { url: new URL(value.URI, baseUrl).href, iv: value.IV };
    } else if (line.startsWith("#EXT-X-MAP:")) {
      const value = attrs(line.slice(11));
      const url = new URL(value.URI, baseUrl).href;
      const byteRange = range(value.BYTERANGE, url, lastMapRange);
      lastMapRange = byteRange;
      if (key && !key.iv) fail("media_invalid_iv");
      map = { url, range: byteRange, key };
    } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) sequence = Number(line.slice(22));
    else if (line.startsWith("#EXTINF:")) duration = Number(line.slice(8).split(",")[0]);
    else if (line.startsWith("#EXT-X-BYTERANGE:")) pendingRange = line.slice(17);
    else if (line === "#EXT-X-DISCONTINUITY") period += 1;
    else if (line === "#EXT-X-ENDLIST") result.endList = true;
    else if (line === "#EXT-X-GAP") fail("media_missing_segment");
    else if (!line.startsWith("#")) {
      const url = new URL(line, baseUrl).href;
      if (variant) {
        result.variants.push({ url, bandwidth: Number(variant.BANDWIDTH) || 0, codecs: variant.CODECS || "", audioGroup: variant.AUDIO });
        variant = null;
      } else {
        if (!(duration > 0) || !Number.isSafeInteger(sequence) || sequence < 0) fail("media_invalid_playlist");
        const byteRange = range(pendingRange, url, lastRange);
        result.segments.push({ url, range: byteRange, key, map, duration, sequence: sequence++, period, start: result.duration });
        result.duration += duration;
        lastRange = byteRange; pendingRange = null; duration = 0;
      }
    }
  }
  return result;
}

export function aesIv(hex, sequence) {
  if (hex) {
    if (!/^0x[0-9a-f]{1,32}$/i.test(hex)) fail("media_invalid_iv");
    return Uint8Array.from(hex.slice(2).padStart(32, "0").match(/../g), value => parseInt(value, 16));
  }
  const result = new Uint8Array(16);
  const view = new DataView(result.buffer);
  view.setUint32(8, Math.floor(sequence / 4294967296));
  view.setUint32(12, sequence % 4294967296);
  return result;
}

// Check framing before asking a parser to follow sample offsets from untrusted files.
export function mp4Boxes(input) {
  const bytes = bytesOf(input), boxes = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length;) {
    if (bytes.length - offset < 8) fail("capture_media_incomplete_mp4");
    let size = view.getUint32(offset), header = 8;
    if (size === 1) {
      if (bytes.length - offset < 16) fail("capture_media_incomplete_mp4");
      size = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12); header = 16;
    } else if (!size) size = bytes.length - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > bytes.length) fail("capture_media_incomplete_mp4");
    boxes.push({ type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), offset, size, header });
    offset += size;
  }
  return boxes;
}

function parseMp4(input) {
  const bytes = bytesOf(input);
  const boxes = mp4Boxes(bytes);
  const moov = boxes.find(box => box.type === "moov");
  if (!moov || boxes.some(box => box.type === "moof" && box.offset < moov.offset) || !boxes.some(box => box.type === "mdat")) fail("capture_media_incomplete_mp4", { byteLength: bytes.length, boxes: JSON.stringify(boxes.slice(0, 8)) });
  const file = createFile(true);
  let parseError;
  file.onError = (...args) => { parseError = args.map(String).join(" "); };
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  buffer.fileStart = 0;
  try { file.appendBuffer(buffer); file.flush(); } catch (error) { fail("capture_media_incomplete_mp4", { reason: error.message }); }
  if (parseError || !file.moov) fail("capture_media_incomplete_mp4", { reason: parseError });
  const tracks = file.moov.traks.filter(track => ["vide", "soun"].includes(track.mdia.hdlr.handler));
  if (!tracks.length) fail("capture_media_incomplete_mp4");
  const mediaBoxes = boxes.filter(box => box.type === "mdat");
  for (const track of tracks) {
    if (!track.samples.length) fail("media_empty_track");
    if (track.mdia.minf.stbl.stsd.entries.some(entry => ["encv", "enca"].includes(entry.type))) fail("capture_media_drm_unsupported");
    for (const sample of track.samples) {
      if (!Number.isSafeInteger(sample.offset) || sample.size <= 0 || !mediaBoxes.some(box => sample.offset >= box.offset + box.header && sample.offset + sample.size <= box.offset + box.size)) fail("capture_media_incomplete_mp4");
      if (!(sample.duration > 0) || !Number.isFinite(sample.dts) || !Number.isFinite(sample.cts)) fail("media_invalid_timeline");
    }
  }
  return { file, tracks };
}

export function inspectMp4(input) {
  const { tracks } = parseMp4(input);
  return tracks.map(track => ({ type: track.mdia.hdlr.handler === "vide" ? "video" : "audio", samples: track.samples.length, codec: track.mdia.minf.stbl.stsd.entries[0].type, duration: (track.samples.reduce((end, sample) => Math.max(end, sample.dts + sample.duration), 0) - track.samples[0].dts) / track.mdia.mdhd.timescale }));
}

function transmux(parts) {
  const stream = new mux.Transmuxer({ keepOriginalTimestamps: true });
  const result = [];
  stream.on("data", segment => {
    if (!result.length) result.push(segment.initSegment);
    result.push(segment.data);
  });
  for (const part of parts) { stream.push(bytesOf(part)); stream.flush(); }
  stream.dispose();
  if (!result.length) fail("media_empty_track");
  return concat(result);
}

// Rebuild track IDs, decoder descriptions and sample tables through MP4Box.
// The output is fragmented MP4 with one shared initialization and both tracks.
export async function remux(inputs, onProgress = () => {}) {
  const output = createFile();
  output.init({ brands: ["isom", "iso6", "mp41"], timescale: 1000 });
  const parsed = inputs.map(input => ({ ...input, ...parseMp4(input.bytes) }));
  const timelines = new Map();
  for (const input of parsed) {
    const start = Math.min(...input.tracks.map(track => track.samples[0].dts / track.mdia.mdhd.timescale));
    const periodKey = input.period ?? 0;
    timelines.set(periodKey, Math.min(timelines.get(periodKey) ?? Infinity, start));
  }
  const trackByType = new Map(), jobs = [];
  for (const input of parsed) {
    for (const track of input.tracks) {
      const handler = track.mdia.hdlr.handler;
      const description = track.mdia.minf.stbl.stsd.entries[0];
      const timescale = track.mdia.mdhd.timescale;
      let target = trackByType.get(handler);
      if (!target) {
        const id = output.addTrack({ type: description.type, hdlr: handler, timescale, language: track.mdia.mdhd.languageString || "und", width: description.width, height: description.height, channel_count: description.channel_count, samplerate: description.samplerate });
        if (!id) fail("media_unsupported_codec", { codec: description.type });
        target = output.getTrackById(id);
        target.mdia.minf.stbl.stsd.entries = track.mdia.minf.stbl.stsd.entries;
        target.tkhd.matrix = track.tkhd.matrix;
        target.tkhd.width = track.tkhd.width; target.tkhd.height = track.tkhd.height;
        target.tkhd.volume = handler === "soun" ? 256 : 0;
        target.first_dts = 0;
        trackByType.set(handler, target);
      } else if (target.mdia.mdhd.timescale !== timescale || target.mdia.minf.stbl.stsd.entries[0].getCodec() !== description.getCodec()) fail("media_codec_changed");
      const origin = timelines.get(input.period ?? 0);
      for (let index = 0; index < track.samples.length; index++) {
        const sample = track.samples[index];
        const shift = Math.round(((input.start ?? 0) - origin) * timescale);
        jobs.push({ input, track, target, index, sample, dts: sample.dts + shift, cts: sample.cts + shift, time: (sample.dts + shift) / timescale });
      }
    }
  }
  jobs.sort((a, b) => a.time - b.time || a.target.tkhd.track_id - b.target.tkhd.track_id);
  let duration = 0;
  const ends = new Map();
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index], { target, sample } = job;
    const id = target.tkhd.track_id;
    if (job.dts < 0 || job.dts < (ends.get(id) ?? 0) - 1) fail("media_invalid_timeline");
    const extracted = job.input.file.getTrackSample(job.track.tkhd.track_id, job.index);
    if (!extracted?.data || extracted.data.length !== sample.size) fail("capture_media_incomplete_mp4");
    output.addSample(id, extracted.data, { ...sample, sample_description_index: sample.description_index + 1, dts: job.dts, cts: job.cts });
    ends.set(id, job.dts + sample.duration);
    duration = Math.max(duration, (job.cts + sample.duration) / target.mdia.mdhd.timescale);
    job.input.file.releaseSample(job.track, job.index);
    if (index % 300 === 0) { onProgress(index, jobs.length); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  output.moov.mvhd.duration = Math.ceil(duration * 1000);
  for (const track of output.moov.traks) {
    track.tkhd.duration = Math.ceil((ends.get(track.tkhd.track_id) / track.mdia.mdhd.timescale) * 1000);
    track.mdia.mdhd.duration = ends.get(track.tkhd.track_id);
  }
  const bytes = new Uint8Array(output.getBuffer().buffer);
  const tracks = inspectMp4(bytes);
  return { bytes, tracks, duration };
}

export async function downloadHls(url, { request, progress = () => {}, crypto = globalThis.crypto, maxBytes = 512 * 1024 * 1024 } = {}) {
  const trace = [], keys = new Map(), maps = new Map();
  let loaded = 0;
  const get = async (url, options = {}) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await request(url, options);
        trace.push({ url, range: options.range, status: response.status, bytes: response.bytes?.byteLength, attempt });
        if (trace.length > 1000) trace.shift();
        if (response.bytes) { loaded += response.bytes.byteLength; if (loaded > maxBytes) fail("media_size_limit"); }
        return response;
      } catch (error) {
        trace.push({ url, attempt, error: error.message });
        if (attempt === 3 || error.code || [400, 401, 403, 404].includes(error.status)) throw error;
        await new Promise(resolve => setTimeout(resolve, attempt * 250));
      }
    }
  };
  const load = async url => { const response = await get(url, { text: true }); return parsePlaylist(response.text, response.url || url); };
  const decode = async (resource, sequence) => {
    let bytes = bytesOf((await get(resource.url, { range: resource.range })).bytes);
    if (resource.key) {
      if (!keys.has(resource.key.url)) {
        const key = bytesOf((await get(resource.key.url)).bytes);
        if (key.length !== 16) fail("capture_media_key_missing");
        keys.set(resource.key.url, await crypto.subtle.importKey("raw", key, "AES-CBC", false, ["decrypt"]));
      }
      bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: aesIv(resource.key.iv, sequence) }, keys.get(resource.key.url), bytes));
    }
    return bytes;
  };
  try {
    progress({ stage: "media_stage_playlists", percent: 2 });
    let playlist = await load(url), audioUrl, depth = 0;
    while (playlist.variants.length) {
      if (++depth > 5) fail("media_invalid_playlist");
      // Prefer broadly playable AVC/AAC over AV1/HEVC/Opus when alternatives exist.
      const score = variant => (/avc1|avc3/i.test(variant.codecs) ? 1e12 : 0) + variant.bandwidth;
      const selected = playlist.variants.sort((a, b) => score(b) - score(a))[0];
      const audio = playlist.audio.filter(item => item.group === selected.audioGroup).sort((a, b) => Number(b.default) - Number(a.default))[0];
      if (audio) audioUrl = audio.url;
      playlist = await load(selected.url);
    }
    const playlists = [playlist];
    if (audioUrl) playlists.push(await load(audioUrl));
    if (playlists.some(item => !item.endList)) fail("media_live_unsupported");
    if (playlists.some(item => !item.segments.length || item.variants.length)) fail("capture_media_no_segments");
    const total = playlists.reduce((sum, item) => sum + item.segments.length, 0);
    const inputs = [];
    let completed = 0;
    for (const [trackIndex, item] of playlists.entries()) {
      let group = null;
      for (const segment of item.segments) {
        const mapKey = segment.map ? JSON.stringify(segment.map) : "ts";
        if (!group || group.period !== segment.period || group.mapKey !== mapKey) {
          group = { period: segment.period, start: segment.start, duration: 0, parts: [], mapKey, trackIndex };
          inputs.push(group);
          if (segment.map) {
            if (!maps.has(mapKey)) maps.set(mapKey, await decode(segment.map, segment.sequence));
            group.parts.push(maps.get(mapKey));
          }
        }
        group.parts.push(await decode(segment, segment.sequence));
        group.duration += segment.duration;
        progress({ stage: "media_stage_segments", percent: 5 + ++completed / total * 72, current: completed, total, bytes: loaded });
      }
    }
    for (const input of inputs) {
      input.bytes = input.mapKey === "ts" ? transmux(input.parts) : concat(input.parts);
      input.parts = null;
      const tracks = inspectMp4(input.bytes);
      const expectedType = input.trackIndex === 1 ? "audio" : null;
      if (expectedType && !tracks.some(track => track.type === expectedType)) fail("media_empty_track");
      if (tracks.some(track => Math.abs(track.duration - input.duration) > Math.max(2, input.duration * 0.03))) fail("media_duration_mismatch", { expected: input.duration, tracks });
    }
    const result = await remux(inputs, (current, total) => progress({ stage: "media_stage_merging", percent: 78 + current / total * 17 }));
    if (audioUrl && (!result.tracks.some(track => track.type === "audio") || !result.tracks.some(track => track.type === "video"))) fail("media_empty_track");
    progress({ stage: "media_stage_validating", percent: 96 });
    return { ...result, trace };
  } catch (error) { error.debug = { ...(error.details || {}), trace, loadedBytes: loaded }; throw error; }
}

globalThis.EasyReadMediaEngine = { downloadHls, remux, inspectMp4 };
