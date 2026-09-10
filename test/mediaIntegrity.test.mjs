import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";
import { URL } from "node:url";
import { downloadHls, parsePlaylist, aesIv, inspectMp4, remux } from "../src/scripts/mediaEngine.mjs";

const ffmpeg = process.env.EASYREAD_FFMPEG || "ffmpeg";
const ffprobe = process.env.EASYREAD_FFPROBE || "ffprobe";
const canDecode = spawnSync(ffmpeg, ["-version"]).status === 0 && spawnSync(ffprobe, ["-version"]).status === 0;

test("HLS parses audio renditions, quoted codecs, ranges and encryption sequence", () => {
  const master = parsePlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=12,CODECS="avc1.640028,mp4a.40.2",AUDIO="a"\nv.m3u8', "https://example.com/root/master.m3u8");
  assert.equal(master.variants[0].codecs, "avc1.640028,mp4a.40.2");
  assert.equal(master.audio[0].url, "https://example.com/root/audio.m3u8");
  const media = parsePlaylist('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:73\n#EXT-X-MAP:URI="data.mp4",BYTERANGE="100@0"\n#EXTINF:1,\n#EXT-X-BYTERANGE:20@100\ndata.mp4\n#EXTINF:1,\n#EXT-X-BYTERANGE:30\ndata.mp4\n#EXT-X-ENDLIST', "https://example.com/v.m3u8");
  assert.equal(media.segments[1].range.start, 120);
  assert.equal(media.segments[1].sequence, 74);
  assert.equal(new DataView(aesIv(null, 73).buffer).getUint32(12), 73);
  assert.throws(() => parsePlaylist("<html>Error</html>", "https://example.com"), /media_invalid_playlist/);
  assert.throws(() => parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"', "https://example.com"), /drm_unsupported/);
});

test("VOD downloader rejects a live window and retains diagnostic context", async () => {
  await assert.rejects(downloadHls("https://example.com/live", { request: async () => ({ text: "#EXTM3U\n#EXTINF:1,\na.ts" }) }), error => error.code === "media_live_unsupported" && error.debug.trace.length === 1);
});

test("real HLS tracks produce decodable MP4: independent audio, byte ranges, AES and TS", { skip: !canDecode }, async t => {
  const folder = mkdtempSync(join(tmpdir(), "easyread-media-test-"));
  t.after(() => {
    const target = resolve(folder);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("easyread-media-test-"));
    rmSync(target, { recursive: true, force: true });
  });
  const run = args => {
    const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", ...args], { cwd: folder, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  const videoArgs = ["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=24", "-t", "3", "-an", "-c:v", "libx264", "-g", "24", "-pix_fmt", "yuv420p"];
  run([...videoArgs, "-f", "hls", "-hls_time", "1", "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "video-init.mp4", "video.m3u8"]);
  run(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "3", "-vn", "-c:a", "aac", "-f", "hls", "-hls_time", "1", "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "audio-init.mp4", "audio.m3u8"]);
  run([...videoArgs, "-f", "hls", "-hls_time", "1", "ts.m3u8"]);
  const resources = new Map(readdirSync(folder).map(name => [name, new Uint8Array(readFileSync(join(folder, name)))]));
  const encoder = new TextEncoder();
  const text = name => new TextDecoder().decode(resources.get(name));
  resources.set("master.m3u8", encoder.encode('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100,CODECS="avc1.640028,mp4a.40.2",AUDIO="a"\nvideo.m3u8'));
  const requests = [];
  const request = async (url, options = {}) => {
    const name = new URL(url).pathname.slice(1);
    requests.push({ name, ...options });
    let bytes = resources.get(name);
    if (!bytes) throw new Error(`Unknown fixture ${name}`);
    if (options.range) bytes = bytes.slice(options.range.start, options.range.start + options.range.length);
    return { url, status: options.range ? 206 : 200, bytes: options.text ? undefined : bytes, text: options.text ? new TextDecoder().decode(bytes) : undefined };
  };
  const probe = bytes => {
    const result = spawnSync(ffprobe, ["-v", "error", "-show_streams", "-of", "json", "pipe:0"], { input: bytes, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const decode = spawnSync(ffmpeg, ["-v", "error", "-xerror", "-i", "pipe:0", "-f", "null", "-"], { input: bytes, encoding: "utf8" });
    assert.equal(decode.status, 0, decode.stderr);
    assert.equal(decode.stderr, "");
    return JSON.parse(result.stdout);
  };
  await t.test("independent video/audio with colliding source track IDs", async () => {
    const result = await downloadHls("https://fixture/master.m3u8", { request });
    const info = probe(result.bytes);
    assert.deepEqual(info.streams.map(stream => stream.codec_name).sort(), ["aac", "h264"]);
    assert.equal(new Set(info.streams.map(stream => stream.id)).size, 2);
    for (const track of result.tracks) assert.ok(Math.abs(track.duration - 3) < 0.2);
  });
  await t.test("byte ranges fetch exactly the init and each media fragment", async () => {
    const playlist = parsePlaylist(text("video.m3u8"), "https://fixture/video.m3u8");
    const names = ["video-init.mp4", ...playlist.segments.map(segment => new URL(segment.url).pathname.slice(1))];
    resources.set("range.mp4", Buffer.concat(names.map(name => resources.get(name))));
    let offset = resources.get(names[0]).length;
    const lines = ["#EXTM3U", `#EXT-X-MAP:URI="range.mp4",BYTERANGE="${offset}@0"`];
    for (const [index, segment] of playlist.segments.entries()) {
      const size = resources.get(names[index + 1]).length;
      lines.push(`#EXTINF:${segment.duration},`, `#EXT-X-BYTERANGE:${size}@${offset}`, "range.mp4"); offset += size;
    }
    lines.push("#EXT-X-ENDLIST"); resources.set("range.m3u8", encoder.encode(lines.join("\n")));
    probe((await downloadHls("https://fixture/range.m3u8", { request })).bytes);
    assert.ok(requests.some(item => item.range?.start > 0));
  });
  await t.test("AES-128 implicit IV uses media sequence, and TS becomes MP4", async () => {
    const playlist = parsePlaylist(text("ts.m3u8"), "https://fixture/ts.m3u8");
    const rawKey = new Uint8Array(16).fill(7);
    const key = await webcrypto.subtle.importKey("raw", rawKey, "AES-CBC", false, ["encrypt"]);
    resources.set("key", rawKey);
    const lines = ['#EXTM3U', '#EXT-X-MEDIA-SEQUENCE:73', '#EXT-X-KEY:METHOD=AES-128,URI="key"'];
    for (const [index, segment] of playlist.segments.entries()) {
      const encrypted = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-CBC", iv: aesIv(null, 73 + index) }, key, resources.get(new URL(segment.url).pathname.slice(1))));
      resources.set(`encrypted${index}`, encrypted); lines.push(`#EXTINF:${segment.duration},`, `encrypted${index}`);
    }
    lines.push("#EXT-X-ENDLIST"); resources.set("encrypted.m3u8", encoder.encode(lines.join("\n")));
    assert.equal(probe((await downloadHls("https://fixture/encrypted.m3u8", { request, crypto: webcrypto })).bytes).streams[0].codec_name, "h264");
  });
  await t.test("missing initialization and truncated payloads are rejected", async () => {
    const segment = resources.get(new URL(parsePlaylist(text("video.m3u8"), "https://fixture/video.m3u8").segments[0].url).pathname.slice(1));
    assert.throws(() => inspectMp4(segment), /incomplete_mp4/);
    const result = await downloadHls("https://fixture/master.m3u8", { request });
    assert.throws(() => inspectMp4(result.bytes.slice(0, -10)), /incomplete_mp4/);
    await assert.rejects(remux([{ bytes: segment }]), /incomplete_mp4/);
  });
});
