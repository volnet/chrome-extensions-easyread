// Explicit, opt-in network acceptance check. Never runs as part of npm test/build.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";
import { downloadHls } from "../src/scripts/mediaEngine.mjs";

const player = new URL(process.argv[2]);
if (player.hostname !== "player.vimeo.com" || !/^\/video\/\d+$/.test(player.pathname)) throw new Error("Provide the observed Vimeo embed URL");
const configUrl = new URL(`${player.origin}${player.pathname}/config`);
if (player.searchParams.has("h")) configUrl.searchParams.set("h", player.searchParams.get("h"));
const configResponse = await fetch(configUrl, { headers: { Referer: "https://openai.com/" } });
if (!configResponse.ok) throw new Error(`Config HTTP ${configResponse.status}`);
const config = await configResponse.json();
const hls = config.request.files.hls;
const cdn = hls.cdns[hls.default_cdn];
let lastProgress = -1;
const result = await downloadHls(cdn.avc_url || cdn.url, {
  request: async (url, options = {}) => {
    const headers = { Referer: player.href };
    if (options.range) headers.Range = `bytes=${options.range.start}-${options.range.start + options.range.length - 1}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
    if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
    if (options.text) return { url: response.url, status: response.status, text: await response.text() };
    let bytes = new Uint8Array(await response.arrayBuffer());
    if (options.range && response.status === 200) bytes = bytes.slice(options.range.start, options.range.start + options.range.length);
    return { url: response.url, status: response.status, bytes };
  },
  progress: event => {
    const step = Math.floor(event.percent / 10);
    if (step !== lastProgress) { lastProgress = step; console.log(`${Math.round(event.percent)}% ${event.stage}`); }
  }
});
const folder = resolve("output", "media-verification");
mkdirSync(folder, { recursive: true });
const file = join(folder, `Vimeo-${config.video.id}-verified.mp4`);
writeFileSync(file, result.bytes);
const probe = spawnSync(process.env.EASYREAD_FFPROBE || "ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
if (probe.status !== 0) throw new Error(probe.stderr);
const decode = spawnSync(process.env.EASYREAD_FFMPEG || "ffmpeg", ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
const summary = { file, title: config.video.title, expectedDuration: config.video.duration, packagedDuration: result.duration, tracks: result.tracks, size: result.bytes.length, ffprobe: JSON.parse(probe.stdout), decodeExitCode: decode.status, decodeErrors: decode.stderr, checkedAt: new Date().toISOString() };
writeFileSync(join(folder, "verification.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, ffprobe: undefined }, null, 2));
if (decode.status !== 0 || decode.stderr || Math.abs(result.duration - config.video.duration) > 2) throw new Error("Media acceptance failed");
