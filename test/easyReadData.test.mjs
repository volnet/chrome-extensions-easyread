import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import vm from "node:vm";

import {
  createArtifactRecord,
  parseHlsPlaylist,
  READ_STATUS_READED,
  READ_STATUS_UNREAD,
  UPDATE_STATUS_NO,
  UPDATE_STATUS_YES,
  applyVideoProgress,
  createAnnotation,
  createNoteItem,
  createReadLaterUpdate,
  createTabNavigationTracker,
  normalizePageUrl,
  paginateRecords,
  removeNoteById
} from "../src/scripts/easyReadData.mjs";

const youtubeContext = { globalThis: {}, URL };
vm.runInNewContext(await readFile(new URL("../src/scripts/youtubeMedia.js", import.meta.url), "utf8"), youtubeContext);
const youtubeMedia = youtubeContext.globalThis.EasyReadYouTubeMedia;

const messages = { first: "first", duplicate: "duplicate", added: "added" };
const tab = { url: "https://Example.com/article#section", title: "Article" };

function update(existing, now = () => 1234) {
  return createReadLaterUpdate({ readLaters: existing }, {
    storageKey: "readLaters",
    tab,
    now,
    messages
  });
}

test("normalizePageUrl ignores fragments and casing", () => {
  assert.equal(normalizePageUrl(tab.url), "https://example.com/article");
});

test("new notes keep the legacy fields and add optional selection context", () => {
  assert.deepEqual(createNoteItem("重点内容", {
    id: 42,
    now: () => 1234,
    prefix: "前文",
    suffix: "后文"
  }), {
    id: 42,
    selectionText: encodeURIComponent("重点内容"),
    createDateTime: 1234,
    prefix: encodeURIComponent("前文"),
    suffix: encodeURIComponent("后文")
  });
});

test("notes without context remain compatible with the original schema", () => {
  assert.deepEqual(createNoteItem("legacy", { id: 7, now: () => 99 }), {
    id: 7,
    selectionText: "legacy",
    createDateTime: 99
  });
});

test("creates an annotation with author and optional text anchors", () => {
  assert.deepEqual(createAnnotation("selected", "comment", {
    id: "a1", author: "Alice", now: () => 10, prefix: "before", suffix: "after"
  }), {
    id: "a1",
    selectionText: "selected",
    comment: "comment",
    author: "Alice",
    createDateTime: 10,
    prefix: "before",
    suffix: "after"
  });
});

test("paginates records at the requested size and sorts newest first", () => {
  const records = Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [
    `page-${index}`,
    { title: `Page ${index}`, datetimes: [index] }
  ]));
  const page = paginateRecords(records, 2, 500);
  assert.equal(page.totalPages, 3);
  assert.equal(page.items.length, 500);
  assert.equal(page.items[0].key, "page-500");
  assert.equal(page.items[499].key, "page-1");
});

test("stores bounded video progress without changing other record fields", () => {
  const record = applyVideoProgress({ title: "Video" }, {
    currentTime: 75,
    duration: 100,
    updatedAt: 123
  });
  assert.deepEqual(record, {
    title: "Video",
    videoProgress: { currentTime: 75, duration: 100, progress: 75, updatedAt: 123 }
  });
});

test("removes exactly one highlight by page key and note id", () => {
  const original = {
    "https://example.com/article": {
      title: "Article",
      notes: [{ id: 1, selectionText: "one" }, { id: 2, selectionText: "same text" }]
    },
    "https://example.com/other": {
      notes: [{ id: 2, selectionText: "same text" }]
    }
  };

  const result = removeNoteById(original, "https://example.com/article", 2);
  assert.equal(result.removed, true);
  assert.deepEqual(result.notesByPage["https://example.com/article"].notes, [
    { id: 1, selectionText: "one" }
  ]);
  assert.equal(result.notesByPage["https://example.com/other"].notes.length, 1);
  assert.equal(original["https://example.com/article"].notes.length, 2);
});

test("removing the final highlight removes only that page entry", () => {
  const result = removeNoteById({ page: { notes: [{ id: "last" }] }, other: { notes: [] } }, "page", "last");
  assert.equal(result.removed, true);
  assert.equal(result.notesByPage.page, undefined);
  assert.deepEqual(result.notesByPage.other, { notes: [] });
});

test("creates the first read-later item without changing the storage schema", () => {
  assert.deepEqual(update(undefined), {
    status: UPDATE_STATUS_YES,
    value: [{
      key: "https://example.com/article",
      url: tab.url,
      title: tab.title,
      createDateTime: 1234,
      status: READ_STATUS_UNREAD
    }],
    message: "first",
    callback_onUpdated: undefined
  });
});

test("does not add a duplicate unread item", () => {
  const existing = [{ key: "https://example.com/article", status: READ_STATUS_UNREAD }];
  const result = update(existing);
  assert.equal(result.status, UPDATE_STATUS_NO);
  assert.equal(result.value, null);
  assert.equal(result.message, "duplicate");
  assert.deepEqual(existing, [{ key: "https://example.com/article", status: READ_STATUS_UNREAD }]);
});

test("allows a previously completed page to be added again", () => {
  const existing = [{ key: "https://example.com/article", status: READ_STATUS_READED }];
  const result = update(existing);
  assert.equal(result.status, UPDATE_STATUS_YES);
  assert.equal(result.value.length, 2);
  assert.equal(result.value[1].status, READ_STATUS_UNREAD);
});

test("anchor-only updates do not count as a new page visit", () => {
  const tracker = createTabNavigationTracker();
  tracker.markActivated(7, "https://example.com/article");
  tracker.markLoading(7, "https://example.com/article#details");
  assert.equal(tracker.shouldRecordOnComplete(7, "https://example.com/article#details"), false);
});

test("reloads and real navigations still count as visits", () => {
  const tracker = createTabNavigationTracker();
  tracker.markActivated(7, "https://example.com/article");

  tracker.markLoading(7);
  assert.equal(tracker.shouldRecordOnComplete(7, "https://example.com/article"), true);

  tracker.markLoading(7, "https://example.com/other");
  assert.equal(tracker.shouldRecordOnComplete(7, "https://example.com/other"), true);
});

test("the first observed completed page counts and removed tabs lose state", () => {
  const tracker = createTabNavigationTracker();
  assert.equal(tracker.shouldRecordOnComplete(8, "https://example.com/one"), true);
  assert.equal(tracker.shouldRecordOnComplete(8, "https://example.com/one"), false);
  tracker.remove(8);
  assert.equal(tracker.shouldRecordOnComplete(8, "https://example.com/one"), true);
});

test("creates a bounded artifact metadata record without storing file bytes", () => {
  assert.deepEqual(createArtifactRecord({
    id: "artifact-1",
    pageKey: "https://example.com/article",
    sourceUrl: "https://example.com/article#part",
    title: "Article",
    format: "html",
    fileName: "article.html",
    mimeType: "text/html",
    size: -10,
    integrity: "partial",
    details: { inaccessibleImages: 2 },
    now: () => 123
  }), {
    id: "artifact-1",
    pageKey: "https://example.com/article",
    sourceUrl: "https://example.com/article#part",
    title: "Article",
    format: "html",
    fileName: "article.html",
    mimeType: "text/html",
    size: 0,
    status: "completed",
    integrity: "partial",
    details: { inaccessibleImages: 2 },
    createdAt: 123
  });
});

test("parses HLS master variants and encrypted media segments with resolved URLs", () => {
  const master = parseHlsPlaylist("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8", "https://cdn.example.com/master.m3u8");
  assert.deepEqual(master.variants, [{ url: "https://cdn.example.com/low/index.m3u8", bandwidth: 800000 }]);

  const media = parseHlsPlaylist("#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXT-X-MAP:URI=\"init.mp4\"\nseg-1.m4s", "https://cdn.example.com/v/index.m3u8");
  assert.equal(media.initSegment, "https://cdn.example.com/v/init.mp4");
  assert.equal(media.segments[0].url, "https://cdn.example.com/v/seg-1.m4s");
  assert.equal(media.segments[0].key.uri, "https://cdn.example.com/v/key.bin");
  assert.equal(media.segments[0].key.method, "AES-128");
});

test("YouTube adapter exposes complete direct media and ignores unavailable or video-only tracks", () => {
  const items = youtubeMedia.buildCandidates({
    videoDetails: { title: "Example" },
    streamingData: {
      formats: [{
        itag: 18,
        url: "https://r.example.googlevideo.com/videoplayback?itag=18",
        mimeType: "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"",
        qualityLabel: "360p",
        width: 640,
        height: 360,
        audioQuality: "AUDIO_QUALITY_LOW",
        contentLength: "68801519"
      }],
      adaptiveFormats: [
        { itag: 137, url: "https://r.example.googlevideo.com/videoplayback?itag=137", mimeType: "video/mp4", qualityLabel: "1080p" },
        { itag: 140, mimeType: "audio/mp4", audioQuality: "AUDIO_QUALITY_MEDIUM" }
      ]
    }
  }, { labels: { muxed: "Video + audio" } });

  assert.equal(items.length, 1);
  assert.equal(items[0].itag, 18);
  assert.equal(items[0].hasVideo, true);
  assert.equal(items[0].hasAudio, true);
  assert.equal(items[0].width, 640);
  assert.equal(items[0].height, 360);
  assert.match(items[0].description, /360p.*MP4.*Video \+ audio.*65\.6 MB/);
});

test("YouTube adapter recognizes playback URLs without accepting lookalike hosts", () => {
  assert.equal(youtubeMedia.isYouTubePage("www.youtube.com"), true);
  assert.equal(youtubeMedia.isGoogleVideoPlayback("https://rr1.googlevideo.com/videoplayback?range=0-99"), true);
  assert.equal(youtubeMedia.isGoogleVideoPlayback("https://googlevideo.example/videoplayback"), false);
});
