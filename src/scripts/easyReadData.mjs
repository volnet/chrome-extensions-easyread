export const ALL_RECORDS_NAME = "allRecords";
export const READ_LATERS_NAME = "readLaters";
export const READ_STATUS_UNREAD = 0;
export const READ_STATUS_READING = 1;
export const READ_STATUS_READED = 2;
export const NOTES_NAME = "notes";
export const ANNOTATIONS_NAME = "annotations";
export const ANNOTATION_AUTHOR_NAME = "annotationAuthor";
export const HIGHLIGHTS_ENABLED_NAME = "highlightsEnabled";
export const ARTIFACTS_NAME = "artifacts";

export const UPDATE_STATUS_YES = 0;
export const UPDATE_STATUS_NO = 1;
export const KEYCHAIN_SEPARATOR = "__EasyReadSeparator__";

export function createArtifactRecord({
  id,
  pageKey,
  sourceUrl,
  title,
  format,
  fileName,
  mimeType,
  size,
  integrity = "complete",
  details = {},
  now = Date.now
}) {
  return {
    id,
    pageKey,
    sourceUrl,
    title,
    format,
    fileName,
    mimeType,
    size: Number.isFinite(size) ? Math.max(0, size) : 0,
    status: "completed",
    integrity,
    details,
    createdAt: now()
  };
}

export function parseHlsPlaylist(text, playlistUrl) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  let pendingVariant = null;
  let currentKey = null;
  let initSegment = null;

  const resolveUrl = (value) => new URL(value, playlistUrl).href;
  const parseAttributes = (value) => Object.fromEntries(
    value.split(/,(?=[A-Z0-9-]+=)/).map((part) => {
      const [key, ...rest] = part.split("=");
      return [key, rest.join("=").replace(/^"|"$/g, "")];
    })
  );

  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      pendingVariant = parseAttributes(line.slice(18));
      continue;
    }
    if (line.startsWith("#EXT-X-KEY:")) {
      const attrs = parseAttributes(line.slice(11));
      currentKey = attrs.METHOD === "NONE" ? null : {
        method: attrs.METHOD,
        uri: attrs.URI ? resolveUrl(attrs.URI) : null,
        iv: attrs.IV ?? null
      };
      continue;
    }
    if (line.startsWith("#EXT-X-MAP:")) {
      const attrs = parseAttributes(line.slice(11));
      initSegment = attrs.URI ? resolveUrl(attrs.URI) : null;
      continue;
    }
    if (line.startsWith("#")) continue;
    const url = resolveUrl(line);
    if (pendingVariant) {
      variants.push({ url, bandwidth: Number(pendingVariant.BANDWIDTH) || 0 });
      pendingVariant = null;
    } else {
      segments.push({ url, key: currentKey });
    }
  }

  return { variants, segments, initSegment };
}

export function normalizePageUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.split("#")[0].toLowerCase().trim();
}

export function decodeStoredText(value) {
  const text = String(value ?? '');
  try { return decodeURIComponent(text); } catch { return text; }
}

export function validateStorageImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
    throw new Error('Invalid backup: expected a non-empty storage object.');
  }
  const collections = { allRecords: 'datetimes', notes: 'notes', annotations: 'annotations', artifacts: 'artifacts' };
  for (const [key, field] of Object.entries(collections)) {
    if (!(key in data)) continue;
    const pages = data[key];
    if (!pages || typeof pages !== 'object' || (Array.isArray(pages) && pages.length)) throw new Error(`Invalid backup: ${key}`);
    for (const [pageKey, page] of Object.entries(pages)) {
      if (['__proto__', 'constructor', 'prototype'].includes(normalizePageUrl(pageKey))) throw new Error('Invalid backup: unsafe page key');
      if (!page || typeof page !== 'object' || Array.isArray(page) || !Array.isArray(page[field])) throw new Error(`Invalid backup: ${key}.${pageKey}.${field}`);
    }
  }
  if ('readLaters' in data && (!Array.isArray(data.readLaters) || data.readLaters.some(item => !item || typeof item !== 'object' || typeof item.key !== 'string'))) {
    throw new Error('Invalid backup: readLaters');
  }
  // Settings and unknown future keys remain untouched for backup compatibility.
  return data;
}

export function latestRecordTime(item) {
  let latest = Number(item?.videoProgress?.updatedAt) || 0;
  for (const value of Array.isArray(item?.datetimes) ? item.datetimes : []) {
    const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
    if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp);
  }
  return latest;
}

export function indexRecords(records) {
  return Object.entries(records ?? {}).filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => ({ ...value, key, latestRead: latestRecordTime(value) }))
    .sort((left, right) => right.latestRead - left.latestRead);
}

export function createNoteItem(selectionText, context = {}) {
  const item = {
    id: context.id,
    selectionText: encodeURIComponent(selectionText),
    createDateTime: context.now()
  };

  if (context.prefix) item.prefix = encodeURIComponent(context.prefix);
  if (context.suffix) item.suffix = encodeURIComponent(context.suffix);
  return item;
}

export function removeNoteById(notesByPage, pageKey, noteId) {
  const page = notesByPage?.[pageKey];
  if (!page?.notes) return { notesByPage, removed: false };

  const remainingNotes = page.notes.filter((note) => String(note.id) !== String(noteId));
  if (remainingNotes.length === page.notes.length) {
    return { notesByPage, removed: false };
  }

  const nextNotesByPage = { ...notesByPage };
  if (remainingNotes.length === 0) {
    delete nextNotesByPage[pageKey];
  } else {
    nextNotesByPage[pageKey] = { ...page, notes: remainingNotes };
  }
  return { notesByPage: nextNotesByPage, removed: true };
}

export function createAnnotation(selectionText, comment, context = {}) {
  const annotation = {
    id: context.id,
    selectionText: encodeURIComponent(selectionText),
    comment,
    author: context.author ?? "",
    createDateTime: context.now()
  };
  if (context.prefix) annotation.prefix = encodeURIComponent(context.prefix);
  if (context.suffix) annotation.suffix = encodeURIComponent(context.suffix);
  return annotation;
}

export function paginateRecords(allRecords, page, pageSize = 500) {
  const items = indexRecords(allRecords);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startIndex: start
  };
}

export function applyVideoProgress(record, progress) {
  if (!progress || !Number.isFinite(progress.currentTime) || !Number.isFinite(progress.duration) || progress.duration <= 0) {
    return record ?? {};
  }
  return {
    ...(record ?? {}),
    videoProgress: {
      currentTime: Math.max(0, progress.currentTime),
      duration: progress.duration,
      progress: Math.min(100, Math.max(0, progress.currentTime / progress.duration * 100)),
      updatedAt: progress.updatedAt
    }
  };
}

export function createReadLaterUpdate(queryValue, context) {
  const oldValue = queryValue[context.storageKey];
  const key = normalizePageUrl(context.tab.url);
  const result = {
    status: UPDATE_STATUS_NO,
    value: null,
    message: "",
    callback_onUpdated: context.callbackOnUpdated
  };

  if (!oldValue) {
    result.value = [{
      key,
      url: context.tab.url,
      title: context.tab.title,
      createDateTime: context.now(),
      status: READ_STATUS_UNREAD
    }];
    result.status = UPDATE_STATUS_YES;
    result.message = context.messages.first;
    return result;
  }

  const alreadyUnread = oldValue.some((item) =>
    key === item.key && [READ_STATUS_UNREAD, READ_STATUS_READING].includes(item.status)
  );
  if (alreadyUnread) {
    result.message = context.messages.duplicate;
    return result;
  }

  result.value = [...oldValue, {
    key,
    url: context.tab.url,
    title: context.tab.title,
    createDateTime: context.now(),
    status: READ_STATUS_UNREAD
  }];
  result.status = UPDATE_STATUS_YES;
  result.message = context.messages.added;
  return result;
}

export function createTabNavigationTracker() {
  const states = new Map();

  return {
    markActivated(tabId, url) {
      states.set(tabId, { pageKey: normalizePageUrl(url), recordOnComplete: false });
    },

    markLoading(tabId, url) {
      const state = states.get(tabId);
      const nextPageKey = normalizePageUrl(url);
      const isAnchorOnly = Boolean(state && nextPageKey && state.pageKey === nextPageKey);
      states.set(tabId, {
        pageKey: state?.pageKey ?? nextPageKey,
        recordOnComplete: !isAnchorOnly
      });
    },

    shouldRecordOnComplete(tabId, url) {
      const currentPageKey = normalizePageUrl(url);
      const state = states.get(tabId);
      const shouldRecord = !state || state.recordOnComplete || state.pageKey !== currentPageKey;
      states.set(tabId, { pageKey: currentPageKey, recordOnComplete: false });
      return shouldRecord;
    },

    remove(tabId) {
      states.delete(tabId);
    }
  };
}
