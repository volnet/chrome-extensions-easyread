(async () => {
await globalThis.EasyReadLocale?.ready;
if (globalThis.__easyreadContentReady) return;

const EASYREAD_ANNOTATION_HIGHLIGHT_NAME = "easyread-annotations";
const EASYREAD_HIGHLIGHT_SETTING = "highlightsEnabled";
const EASYREAD_NOTES_KEY = "notes";

const EASYREAD_ANNOTATION_WIDTH_KEY = "annotationSidebarWidth";
const EASYREAD_CONTEXT_LENGTH = 32;

const EASYREAD_VIDEO_REPORT_INTERVAL = 5000;

let userHasScrolled = false;
let scrollTimer;
let highlightTimer;
let highlightObserver;

let annotationTargets = [];
let notesRenderRevision = 0;
let notesHighlightRevision = 0;
let captureScrollInProgress = false;
const videoReportTimes = new WeakMap();
let extensionContextStopped = false;

function extensionContextAvailable() {
    if (extensionContextStopped) return false;
    try { return Boolean(chrome.runtime?.id); } catch { return false; }
}

function stopInvalidatedExtensionContext() {
    if (extensionContextStopped) return;
    extensionContextStopped = true;
    clearTimeout(scrollTimer);
    clearTimeout(highlightTimer);
    highlightObserver?.disconnect();
    highlightObserver = null;

    clearAnnotationHighlights();
}

async function sendRuntimeMessage(message) {
    if (!extensionContextAvailable()) {
        stopInvalidatedExtensionContext();
        return null;
    }
    try { return await chrome.runtime.sendMessage(message); }
    catch (error) {
        if (/Extension context invalidated/i.test(error?.message || "")) {
            stopInvalidatedExtensionContext();
            return null;
        }
        throw error;
    }
}

function normalizePageUrl(url) {
    if (!url || typeof url !== "string") return "";
    return url.split("#")[0].toLowerCase().trim();
}

function decodeStoredText(value) {
    if (!value) return "";
    try {
        return decodeURIComponent(value);
    } catch {
        // Legacy notes can contain plain percent signs; this is a supported fallback.
        return value;
    }
}

function isHighlightableTextNode(node) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue) return false;
    if (parent.isContentEditable) return false;
    return !parent.closest("script, style, noscript, textarea, input, select, option, [data-easyread-ui]");
}

function createTextIndex() {
    const nodes = [];
    let text = "";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (!isHighlightableTextNode(node)) continue;
        const start = text.length;
        text += node.nodeValue;
        nodes.push({ node, start, end: text.length });
    }
    return { text, nodes };
}

function findOccurrences(text, exact) {
    const occurrences = [];
    let offset = 0;
    while (offset <= text.length - exact.length) {
        const index = text.indexOf(exact, offset);
        if (index < 0) break;
        occurrences.push({ start: index, end: index + exact.length });
        offset = index + Math.max(exact.length, 1);
    }
    return occurrences;
}

function selectOccurrences(text, note) {
    const exact = decodeStoredText(note.selectionText);
    if (!exact) return [];

    const occurrences = findOccurrences(text, exact);
    const prefix = decodeStoredText(note.prefix);
    const suffix = decodeStoredText(note.suffix);
    const closest = matches => Number.isFinite(note.textPosition) && matches.length > 1
        ? [...matches].sort((a, b) => Math.abs(a.start - note.textPosition) - Math.abs(b.start - note.textPosition)).slice(0, 1) : matches;
    if (!prefix && !suffix) return closest(occurrences);

    const contextualMatches = occurrences.filter((occurrence) => {
        const prefixMatches = !prefix || text.slice(Math.max(0, occurrence.start - prefix.length), occurrence.start) === prefix;
        const suffixMatches = !suffix || text.slice(occurrence.end, occurrence.end + suffix.length) === suffix;
        return prefixMatches && suffixMatches;
    });

    if (contextualMatches.length > 0) return closest(contextualMatches);
    return occurrences.length === 1 ? occurrences : [];
}

function findBoundary(nodes, offset, preferNextNode) {
    for (let index = 0; index < nodes.length; index += 1) {
        const entry = nodes[index];
        if (offset < entry.end || (offset === entry.end && !preferNextNode)) {
            return { node: entry.node, offset: offset - entry.start };
        }
    }
    const last = nodes[nodes.length - 1];
    return last ? { node: last.node, offset: last.node.nodeValue.length } : null;
}

function createRange(nodes, occurrence) {
    const start = findBoundary(nodes, occurrence.start, true);
    const end = findBoundary(nodes, occurrence.end, false);
    if (!start || !end) return null;
    const range = new Range();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
}

function clearAnnotationHighlights() {
    if (typeof CSS !== "undefined" && CSS.highlights) {
        CSS.highlights.delete(EASYREAD_ANNOTATION_HIGHLIGHT_NAME);
    }
    document.querySelectorAll(".easyread-annotation-marker").forEach((element) => element.remove());
    annotationTargets = [];
}

async function refreshAnnotationHighlights() {
    const revision = ++notesHighlightRevision;
    clearAnnotationHighlights();
    if (!extensionContextAvailable() || !document.body || typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
    const settings = await chrome.storage.local.get(EASYREAD_HIGHLIGHT_SETTING);
    if (settings[EASYREAD_HIGHLIGHT_SETTING] === false) return;
    const annotations = await getOrderedPageAnnotations();
    if (revision !== notesHighlightRevision) return;
    if (annotations.length === 0) return;

    const index = createTextIndex();
    const ranges = [];
    annotations.forEach((annotation, annotationIndex) => {
        const occurrence = selectOccurrences(index.text, annotation)[0];
        const range = occurrence ? createRange(index.nodes, occurrence) : null;
        if (!range) return;
        ranges.push(range);
        annotationTargets.push({ annotationId: annotation.id, range, length: occurrence.end - occurrence.start });
        const rects = range.getClientRects();
        const rect = rects[rects.length - 1];
        if (!rect) return;
        const marker = document.createElement("span");
        marker.className = "easyread-annotation-marker";
        marker.dataset.easyreadUi = "true";
        marker.textContent = String(annotationIndex + 1);
        marker.dataset.annotationId = String(annotation.id);
        marker.tabIndex = 0;
        marker.setAttribute('role', 'button');
        marker.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); marker.click(); } });
        marker.addEventListener("click", () => openAnnotationComposer({ noteId: annotation.id }).catch(console.error));
        marker.title = `${(globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_sidebar_title")} ${annotationIndex + 1}`;
        marker.style.left = `${Math.max(2, rect.right + window.scrollX - 8)}px`;
        marker.style.top = `${Math.max(2, rect.top + window.scrollY - 10)}px`;
        document.documentElement.appendChild(marker);
    });
    if (ranges.length > 0) CSS.highlights.set(EASYREAD_ANNOTATION_HIGHLIGHT_NAME, new Highlight(...ranges));
}

async function refreshHighlights() { await refreshAnnotationHighlights(); }

function getDocumentPoint(clientX, clientY) {
    if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(clientX, clientY);
        return position ? { node: position.offsetNode, offset: position.offset } : null;
    }
    if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(clientX, clientY);
        return range ? { node: range.startContainer, offset: range.startOffset } : null;
    }
    return null;
}

function findAnnotationAtPoint(clientX, clientY) {
    const point = getDocumentPoint(clientX, clientY);
    if (!point) return null;
    return annotationTargets.filter((target) => {
        try { return target.range.isPointInRange(point.node, point.offset); }
        catch { return false; }
    }).sort((left, right) => left.length - right.length)[0] ?? null;
}

function hasTextSelection() {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

document.addEventListener("contextmenu", (event) => {
    if (!extensionContextAvailable()) { stopInvalidatedExtensionContext(); return; }

    const markerId = event.target.closest?.(".easyread-annotation-marker")?.dataset.annotationId;
    const annotationTarget = markerId ? { annotationId: markerId } : findAnnotationAtPoint(event.clientX, event.clientY);
    sendRuntimeMessage({
        command: "updateHighlightContextMenu",
        noteId: annotationTarget?.annotationId ?? null,
        annotationId: annotationTarget?.annotationId ?? null,
        hasSelection: hasTextSelection()
    }).catch(() => {});
}, true);

function scheduleHighlightRefresh() {
    if (!extensionContextAvailable()) { stopInvalidatedExtensionContext(); return; }
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
        refreshHighlights().catch(console.log);
        renderAnnotationList().catch(console.log);
    }, 400);
}

function observeDynamicContent() {
    if (!document.body || highlightObserver) return;
    highlightObserver = new MutationObserver((mutations) => {
        if (mutations.every((mutation) => mutation.target.parentElement?.closest?.("[data-easyread-ui]") || mutation.target.closest?.("[data-easyread-ui]"))) return;
        scheduleHighlightRefresh();

        observeVideos();
    });
    highlightObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

}

function reportVideoProgress(video, force = false) {
    if (!extensionContextAvailable()) { stopInvalidatedExtensionContext(); return; }
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !Number.isFinite(video.currentTime)) return;
    const now = Date.now();
    if (!force && now - (videoReportTimes.get(video) ?? 0) < EASYREAD_VIDEO_REPORT_INTERVAL) return;
    videoReportTimes.set(video, now);
    sendRuntimeMessage({
        videoProgress: {
            currentTime: video.currentTime,
            duration: video.duration,
            updatedAt: now
        }
    }).catch(() => {});
}

function observeVideos() {
    for (const video of document.querySelectorAll("video:not([data-easyread-video-observed])")) {
        video.dataset.easyreadVideoObserved = "true";
        video.addEventListener("timeupdate", () => reportVideoProgress(video));
        video.addEventListener("pause", () => reportVideoProgress(video, true));
        video.addEventListener("ended", () => reportVideoProgress(video, true));
    }
}

function getSelectionContext() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !document.body) return {};
    const range = selection.getRangeAt(0);
    const index = createTextIndex();
    const start = index.nodes.find(entry => entry.node === range.startContainer);
    const end = index.nodes.find(entry => entry.node === range.endContainer);
    if (!start || !end) return {};
    const offset = start.start + range.startOffset;
    const finish = end.start + range.endOffset;
    return { textPosition: offset, prefix: index.text.slice(Math.max(0, offset - EASYREAD_CONTEXT_LENGTH), offset), suffix: index.text.slice(finish, finish + EASYREAD_CONTEXT_LENGTH) };
}

function createAnnotationId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function notesRequest(action, data = {}) {
    const reply = await sendRuntimeMessage({ command: 'easyreadNotes', action, url: location.href, title: document.title, ...data });
    if (!reply || reply.error) throw new Error(reply?.error || 'Notes unavailable');
    return reply;
}
async function getPageAnnotations() { return (await notesRequest('get')).notes; }

async function getOrderedPageAnnotations() {
    const notes = await getPageAnnotations();
    const textIndex = document.body ? createTextIndex() : { text: '' };
    const positions = {};
    const ordered = notes.map((note, index) => {
        const page = note.scope === 'page' || !decodeStoredText(note.selectionText).trim();
        const found = page ? undefined : selectOccurrences(textIndex.text, note)[0]?.start;
        if (Number.isFinite(found) && note.textPosition !== found) positions[String(note.id)] = found;
        return { ...note, scope: page ? 'page' : 'text', anchored: !page && Number.isFinite(found), documentPosition: found ?? note.textPosition ?? Infinity, storageIndex: index };
    }).sort((a, b) => {
        if (a.scope !== b.scope) return a.scope === 'page' ? 1 : -1;
        if (a.scope !== 'page' && a.documentPosition !== b.documentPosition) return a.documentPosition - b.documentPosition;
        return (a.createDateTime || 0) - (b.createDateTime || 0) || a.storageIndex - b.storageIndex;
    });
    if (Object.keys(positions).length) await notesRequest('positions', { positions });
    return ordered;
}

function annotationDocumentPosition(annotation, textIndex) {
    return selectOccurrences(textIndex.text, annotation)[0]?.start ?? Number.POSITIVE_INFINITY;
}

async function locatePageAnnotation(id, smooth = true) {
    const note = (await getPageAnnotations()).find(item => String(item.id) === String(id));
    const index = document.body ? createTextIndex() : { text: '', nodes: [] };
    const matches = note && note.scope !== 'page' ? selectOccurrences(index.text, note) : [];
    const range = matches.length === 1 ? createRange(index.nodes, matches[0]) : null;
    if (!range || !range.getClientRects().length) {
        throw new Error((globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_unlocated'));
    }
    range.startContainer.parentElement.scrollIntoView({
        block: 'center', inline: 'nearest',
        behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant'
    });
}

function formatAnnotationDate(timestamp) {
    return new Date(timestamp).toLocaleString((globalThis.EasyReadLocale || chrome.i18n).getUILanguage());
}

function createIconButton(className, title, iconMarkup) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `easyread-annotation-icon-button ${className}`;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = iconMarkup;
    return button;
}

function setAnnotationExpanded(sidebar, expanded) {
    const reopen = document.getElementById("easyread-annotation-reopen");
    sidebar.hidden = !expanded;
    if (reopen) reopen.dataset.visible = String(!expanded);
    document.documentElement.toggleAttribute("data-easyread-annotation-expanded", expanded);
    setTimeout(() => refreshAnnotationHighlights().catch(console.log), 180);
}

function sanitizeDownloadName(value) {
    return (value || "page")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100) || "page";
}

async function downloadPageAnnotations() {
    const annotations = await getOrderedPageAnnotations();
    if (annotations.length === 0) return;
    const lines = [
        `# ${document.title}`,
        "",
        "- Tags: #EasyRead",
        `- Link: [${document.title}](${location.href})`,
        "",
        "---",
        "",
        `## ${(globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_sidebar_title")}`,
        ""
    ];
    for (const [index, annotation] of annotations.entries()) {
        lines.push(
            `### ${index + 1}. ${annotation.author || (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_author_anonymous")} · ${formatAnnotationDate(annotation.createDateTime)}`,
            "",
            decodeStoredText(annotation.selectionText).trim() ? `> ${decodeStoredText(annotation.selectionText).replace(/\r\n?/g, '\n').replace(/\n/g, "\n> ")}` : '',
            "",
            annotation.comment || "",
            ""
        );
    }
    const blobUrl = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${sanitizeDownloadName(document.title)}-notes.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function installAnnotationResize(sidebar) {
    const handle = sidebar.querySelector(".easyread-annotation-resize");
    const resize = (clientX) => {
        const width = Math.min(720, Math.max(280, window.innerWidth - clientX));
        document.documentElement.style.setProperty("--easyread-annotation-width", `${width}px`);
        return width;
    };
    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        document.documentElement.toggleAttribute("data-easyread-annotation-resizing", true);
    });
    handle.addEventListener("pointermove", (event) => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        resize(event.clientX);
    });
    const finishResize = async (event) => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        const width = resize(event.clientX);
        handle.releasePointerCapture(event.pointerId);
        document.documentElement.removeAttribute("data-easyread-annotation-resizing");
        await chrome.storage.local.set({ [EASYREAD_ANNOTATION_WIDTH_KEY]: width });
    };
    handle.addEventListener("pointerup", (event) => finishResize(event).catch(console.log));
    handle.addEventListener("pointercancel", () => {
        document.documentElement.removeAttribute("data-easyread-annotation-resizing");
    });
    handle.addEventListener("keydown", async (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const current = sidebar.getBoundingClientRect().width;
        const width = Math.min(720, Math.max(280, current + (event.key === "ArrowLeft" ? 20 : -20)));
        document.documentElement.style.setProperty("--easyread-annotation-width", `${width}px`);
        await chrome.storage.local.set({ [EASYREAD_ANNOTATION_WIDTH_KEY]: width });
    });
}

async function renderAnnotationList() {
    const list = document.querySelector("#easyread-annotation-sidebar .easyread-annotation-list");
    if (!list || list.querySelector('textarea')) return;
    const revision = ++notesRenderRevision;
    const annotations = await getOrderedPageAnnotations();
    if (revision !== notesRenderRevision || list.querySelector('textarea')) return;
    globalThis.EasyReadAnnotationView.render(list, annotations.map(item => ({ ...item, quote: decodeStoredText(item.selectionText) })), startInlineAnnotationEdit, id => removePageAnnotation(id).catch(console.log), locatePageAnnotation);
}

async function removePageAnnotation(annotationId) {
    const result = await notesRequest('remove', { id: annotationId });
    await renderAnnotationList();
    await refreshAnnotationHighlights();
    return result.removed;
}

function startInlineAnnotationEdit(item, annotation, commentElement, editButton) {
    item.parentElement.__notesSignature = null;
    const activeEditor = document.querySelector("#easyread-annotation-sidebar .easyread-annotation-inline-editor");
    activeEditor?.querySelector(".easyread-annotation-inline-cancel")?.click();

    const editor = document.createElement("div");
    editor.className = "easyread-annotation-inline-editor";
    const textarea = document.createElement("textarea");
    textarea.value = annotation.comment ?? "";
    textarea.placeholder = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_comment_placeholder");
    const actions = document.createElement("div");
    actions.className = "easyread-annotation-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "easyread-annotation-inline-cancel";
    cancelButton.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_action_cancel");
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_action_save");
    actions.append(cancelButton, saveButton);
    editor.append(textarea, actions);

    const cancel = () => {
        editor.replaceWith(commentElement);
        editButton.disabled = false;
        editButton.focus();
        renderAnnotationList().catch(console.error);
    };
    cancelButton.addEventListener("click", cancel);
    saveButton.addEventListener("click", async () => {
        const comment = textarea.value.trim();
        if (!comment && annotation.scope === "page") return;
        saveButton.disabled = true;
        try {
        await notesRequest('edit', { id: annotation.id, comment });
        editor.replaceWith(commentElement);
        await renderAnnotationList();
        } catch (error) {
            let feedback = editor.querySelector('[role="status"]');
            if (!feedback) { feedback = document.createElement('p'); feedback.setAttribute('role', 'status'); editor.append(feedback); }
            feedback.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage('ui_operation_failed');
            globalThis.EasyReadDiagnostics?.record(error, { operation: 'edit-annotation' }, feedback);
        } finally { saveButton.disabled = false; }
    });
    textarea.addEventListener("keydown", (event) => {
        if (event.isComposing) return;
        if (event.key === "Escape") {
            event.preventDefault();
            cancel();
        } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            saveButton.click();
        }
    });

    editButton.disabled = true;
    commentElement.replaceWith(editor);
    item.scrollIntoView({ block: "nearest" });
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function ensureAnnotationSidebar() {
    let sidebar = document.getElementById("easyread-annotation-sidebar");
    if (sidebar) return sidebar;

    sidebar = document.createElement("aside");
    sidebar.id = "easyread-annotation-sidebar";
    sidebar.dataset.easyreadUi = "true";
    sidebar.hidden = true;
    sidebar.innerHTML = `
      <div class="easyread-annotation-resize" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <header class="easyread-annotation-header">
        <strong></strong><div class="easyread-annotation-toolbar"></div>
      </header>
      <div class="easyread-annotation-list"></div>`;

    const reopen = document.createElement("button");
    reopen.id = "easyread-annotation-reopen";
    reopen.dataset.easyreadUi = "true";
    reopen.title = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_sidebar_expand");
    reopen.setAttribute("aria-label", reopen.title);
    const reopenLogo = document.createElement("img");
    reopenLogo.src = chrome.runtime.getURL("assets/logo/icon-32.png");
    reopenLogo.alt = "EasyRead";
    reopen.appendChild(reopenLogo);
    sidebar.querySelector("strong").textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_sidebar_title");
    const toolbar = sidebar.querySelector(".easyread-annotation-toolbar");
    const downloadButton = createIconButton(
        "easyread-annotation-download",
        (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_sidebar_download"),
        `<img src="${chrome.runtime.getURL("assets/download-file.png")}" alt="">`
    );
    const collapseButton = createIconButton(
        "easyread-annotation-collapse",
        (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_sidebar_collapse"),
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`
    );
    const popupButton = createIconButton('easyread-annotation-popup', (globalThis.EasyReadLocale || chrome.i18n).getMessage('annotation_move_popup'),
        `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="10" y="8" width="9" height="9" rx="1"/></svg>`);
    popupButton.addEventListener('click', async () => {
        const editor = sidebar.querySelector('textarea');
        if (editor) { editor.focus(); return; }
        try {
            const reply = await chrome.runtime.sendMessage({ command: 'openAnnotationPopup' });
            if (reply?.ok) setAnnotationExpanded(sidebar, false);
            else throw new Error(reply?.error || (globalThis.EasyReadLocale || chrome.i18n).getMessage('ui_operation_failed'));
        } catch (error) { globalThis.EasyReadDiagnostics?.record(error, { operation: 'open-annotation-popup' }); }
    });
    toolbar.append(downloadButton, popupButton, collapseButton);
    downloadButton.addEventListener("click", () => downloadPageAnnotations().catch(console.log));
    collapseButton.addEventListener("click", () => setAnnotationExpanded(sidebar, false));
    reopen.addEventListener("click", () => {
        setAnnotationExpanded(sidebar, true);
        renderAnnotationList().catch(console.log);
    });
    const pageNote = document.createElement('button');
    pageNote.className = 'easyread-page-note-add';
    pageNote.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_add_page');
    pageNote.onclick = () => openAnnotationComposer({ selectionText: '' }).catch(console.error);
    sidebar.append(pageNote);
    globalThis.EasyReadAnnotationView.attachPageDrawer(sidebar.querySelector('.easyread-annotation-list'), pageNote);
    document.documentElement.append(sidebar, reopen);
    installAnnotationResize(sidebar);
    chrome.storage.local.get([EASYREAD_ANNOTATION_WIDTH_KEY]).then((stored) => {
        const width = stored[EASYREAD_ANNOTATION_WIDTH_KEY];
        if (Number.isFinite(width)) {
            document.documentElement.style.setProperty("--easyread-annotation-width", `${Math.min(720, Math.max(280, width))}px`);
        }
    }).catch(console.log);
    return sidebar;
}

async function openAnnotationComposer(context) {
    const sidebar = ensureAnnotationSidebar();
    setAnnotationExpanded(sidebar, true);
    const selectionText = context.selectionText || '';
    const existing = (await getOrderedPageAnnotations()).find(note => context.noteId !== null && context.noteId !== undefined
        ? String(note.id) === String(context.noteId)
        : selectionText && decodeStoredText(note.selectionText) === selectionText && decodeStoredText(note.prefix) === (context.prefix || '') && decodeStoredText(note.suffix) === (context.suffix || ''));
    const currentEditor = sidebar.querySelector('textarea');
    if (currentEditor) { globalThis.EasyReadAnnotationView.syncPageDrawer(sidebar.querySelector('.easyread-annotation-list'), true); currentEditor.focus(); return; }
    await renderAnnotationList();
    const list = sidebar.querySelector(".easyread-annotation-list");
    if (existing) {
        if (existing.scope === 'page') globalThis.EasyReadAnnotationView.syncPageDrawer(list, true);
        const item = [...list.querySelectorAll('[data-note-id]')].find(row => row.dataset.noteId === String(existing.id));
        item?.querySelector('.easyread-annotation-edit')?.click();
        return;
    }
    list.querySelector(".easyread-annotation-draft")?.remove();
    list.querySelector(".easyread-annotation-empty")?.remove();
    list.classList.remove("is-empty");
    list.__notesSignature = null;

    const storedAnnotations = await getOrderedPageAnnotations();
    const textIndex = createTextIndex();
    const draftAnchor = {
        selectionText: encodeURIComponent(selectionText),
        prefix: context.prefix ? encodeURIComponent(context.prefix) : undefined,
        suffix: context.suffix ? encodeURIComponent(context.suffix) : undefined
    };
    const draftPosition = annotationDocumentPosition(draftAnchor, textIndex);
    const insertionIndex = selectionText ? storedAnnotations.findIndex(annotation => annotation.scope === 'page' || annotationDocumentPosition(annotation, textIndex) > draftPosition) : -1;
    const targetIndex = insertionIndex < 0 ? storedAnnotations.length : insertionIndex;

    const draft = document.createElement("article");
    draft.className = "easyread-annotation-item easyread-annotation-draft" + (selectionText ? "" : " easyread-page-note");
    const draftMarker = document.createElement("span");
    draftMarker.className = "easyread-annotation-number easyread-annotation-draft-marker";
    draftMarker.textContent = "+";
    if (!selectionText) draftMarker.style.display = "none";
    const content = document.createElement("div");
    content.className = "easyread-annotation-content";
    const quote = document.createElement("div");
    quote.className = "easyread-annotation-quote";
    quote.textContent = selectionText || (globalThis.EasyReadLocale || chrome.i18n).getMessage("notes_page");
    const textarea = document.createElement("textarea");
    textarea.className = "easyread-annotation-draft-input";
    textarea.placeholder = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_comment_placeholder");
    const actions = document.createElement("div");
    actions.className = "easyread-annotation-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_action_cancel");
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_action_save");
    actions.append(cancelButton, saveButton);
    content.append(quote, textarea, actions);
    draft.append(draftMarker, content);
    const nextRow = [...list.querySelectorAll('[data-note-id]')][targetIndex];
    list.insertBefore(draft, nextRow?.parentElement === list ? nextRow : list.querySelector('.easyread-page-drawer'));
    if (!selectionText) globalThis.EasyReadAnnotationView.syncPageDrawer(list, true);
    textarea.value = "";
    textarea.focus();

    const cancel = () => {
        draft.remove();
        renderAnnotationList().catch(console.log);
    };
    cancelButton.addEventListener("click", cancel);
    saveButton.addEventListener("click", async () => {
        const comment = textarea.value.trim();
        if (!comment) return;
        saveButton.disabled = true;
        try {
        await notesRequest('add', { selectionText, comment, prefix: context.prefix, suffix: context.suffix, textPosition: Number.isFinite(draftPosition) ? draftPosition : context.textPosition });
        draft.remove();
        await renderAnnotationList();
        await refreshAnnotationHighlights();
        } catch (error) {
            let feedback = draft.querySelector('[role="status"]');
            if (!feedback) { feedback = document.createElement('p'); feedback.setAttribute('role', 'status'); content.append(feedback); }
            feedback.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage('ui_operation_failed');
            globalThis.EasyReadDiagnostics?.record(error, { operation: 'add-annotation' }, feedback);
        } finally { saveButton.disabled = false; }
    });
    textarea.onkeydown = (event) => {
        if (event.isComposing) return;
        if (event.key === "Escape") {
            event.preventDefault();
            cancel();
        } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            saveButton.click();
        }
    };
    draft.scrollIntoView({ block: "nearest" });
}

function captureFileName(extension) {
    const base = (document.title || "EasyRead")
        .replace(/[\p{Cf}\p{Cc}]/gu, "")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || "EasyRead";
    return `${base}.${extension}`;
}

function downloadCaptureBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function saveValidatedMedia(blob, filename) {
    const url = URL.createObjectURL(blob);
    try {
        const result = await chrome.runtime.sendMessage({ command: "saveMediaBlob", url, filename });
        if (!result?.ok) throw new Error(result?.error || "Download failed");
    } finally { URL.revokeObjectURL(url); }
}

async function recordArtifact(format, fileName, blob, integrity = "complete", details = {}) {
    const pageKey = normalizePageUrl(location.href);
    const stored = await chrome.storage.local.get(["artifacts"]);
    const artifactsByPage = stored.artifacts ?? {};
    const page = artifactsByPage[pageKey] ?? { title: document.title, url: location.href, artifacts: [] };
    const artifact = {
        id: createAnnotationId(),
        pageKey,
        sourceUrl: location.href,
        title: document.title,
        format,
        fileName,
        mimeType: blob.type,
        size: blob.size,
        status: "completed",
        integrity,
        details,
        createdAt: Date.now()
    };
    page.artifacts = [...(page.artifacts ?? []), artifact].slice(-100);
    await chrome.storage.local.set({ artifacts: { ...artifactsByPage, [pageKey]: page } });
}

function absoluteUrl(value) {
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) return value;
    try { return new URL(value, location.href).href; } catch { return value; }
}

function markdownFromNode(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\s+/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "noscript", "template", "svg", "button", "nav"].includes(tag)) return "";
    const children = Array.from(node.childNodes).map((child) => markdownFromNode(child, depth + 1)).join("");
    const clean = children.trim();
    if (!clean && !["img", "br", "hr"].includes(tag)) return "";
    if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${clean}\n\n`;
    if (tag === "p" || tag === "section" || tag === "article" || tag === "div") return `\n\n${clean}\n\n`;
    if (tag === "br") return "\n";
    if (tag === "hr") return "\n\n---\n\n";
    if (tag === "strong" || tag === "b") return `**${clean}**`;
    if (tag === "em" || tag === "i") return `*${clean}*`;
    if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") return `\`${clean}\``;
    if (tag === "pre") return `\n\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
    if (tag === "blockquote") return `\n\n${clean.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    if (tag === "a") return clean ? `[${clean}](${absoluteUrl(node.getAttribute("href"))})` : "";
    if (tag === "img") {
        const src = absoluteUrl(node.currentSrc || node.getAttribute("src"));
        return src ? `![${node.getAttribute("alt") || ""}](${src})` : "";
    }
    if (tag === "li") return `\n${node.parentElement?.tagName === "OL" ? "1." : "-"} ${clean}`;
    return children;
}

async function buildMarkdownCapture() {
    const main = document.querySelector("article, main, [role='main']") || document.body;
    const notes = await getOrderedPageAnnotations();
    const description = document.querySelector('meta[name="description"]')?.content || '';
    const author = document.querySelector('meta[name="author"]')?.content || '';
    let markdown = `---\ntitle: ${JSON.stringify(document.title)}\nsource: ${JSON.stringify(location.href)}\nauthor: ${JSON.stringify(author)}\ndescription: ${JSON.stringify(description)}\nnotes_count: ${notes.length}\n---\n\n# ${document.title}\n\n`;
    markdown += markdownFromNode(main).replace(/\n{3,}/g, "\n\n").trim();
    if (notes.length) markdown += '\n\n## Notes\n' + notes.map(note => `\n### ${note.scope === 'page' ? (globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_page') : (notes.indexOf(note) + 1)}\n\n${note.selectionText ? '> ' + decodeStoredText(note.selectionText).replace(/\n/g, '\n> ') + '\n\n' : ''}${note.comment || ''}\n`).join('\n');
    return markdown + '\n';
}

async function createHtmlCapture(reportProgress = () => {}) {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script, noscript, #easyread-capture-dialog, #easyread-annotation-sidebar, #easyread-annotation-reopen").forEach((element) => element.remove());
    clone.querySelectorAll("[onload], [onclick], [onerror], [onmouseover], [onfocus]").forEach((element) => {
        for (const name of element.getAttributeNames()) if (name.startsWith("on")) element.removeAttribute(name);
    });
    clone.querySelectorAll("a[href]").forEach((element) => element.setAttribute("href", absoluteUrl(element.getAttribute("href"))));
    clone.querySelectorAll("img[src], source[src], video[src], audio[src]").forEach((element) => element.setAttribute("src", absoluteUrl(element.getAttribute("src"))));
    clone.querySelectorAll("[srcset]").forEach((element) => element.removeAttribute("srcset"));
    const sourceSnapshotElements = Array.from(document.querySelectorAll("html, body, body *")).filter((element) => {
        return !element.matches("script, noscript, #easyread-capture-dialog, #easyread-annotation-sidebar, #easyread-annotation-reopen") && !element.closest("#easyread-capture-dialog, #easyread-annotation-sidebar");
    });
    const clonedSnapshotElements = Array.from(clone.querySelectorAll("html, body, body *"));
    const computedRules = new Map();
    let nextComputedRule = 0;
    const snapshotLimit = Math.min(sourceSnapshotElements.length, clonedSnapshotElements.length, 10000);
    const serializeComputedStyle = (style) => Array.from(style).filter((property) => !property.startsWith("animation") && !property.startsWith("transition")).map((property) => `${property}:${style.getPropertyValue(property)}${style.getPropertyPriority(property) ? " !important" : ""}`).join(";");
    for (let index = 0; index < snapshotLimit; index += 1) {
        const source = sourceSnapshotElements[index];
        const target = clonedSnapshotElements[index];
        const cssText = serializeComputedStyle(window.getComputedStyle(source));
        let className = computedRules.get(cssText)?.className;
        if (!className) {
            className = `easyread-snapshot-${nextComputedRule++}`;
            computedRules.set(cssText, { className, cssText, pseudo: new Map() });
        }
        target.classList.add(className);
        for (const pseudo of ["::before", "::after"]) {
            const pseudoStyle = window.getComputedStyle(source, pseudo);
            if (!pseudoStyle.content || pseudoStyle.content === "none" || pseudoStyle.content === "normal") continue;
            const pseudoCssText = serializeComputedStyle(pseudoStyle);
            computedRules.get(cssText).pseudo.set(`${pseudo}:${pseudoCssText}`, { className, pseudo, cssText: pseudoCssText });
        }
        if (index > 0 && index % 250 === 0) {
            reportProgress(25 + Math.round(index / snapshotLimit * 25), (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_styles", [index, snapshotLimit]));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    const computedCss = [...computedRules.values()].map((rule) => {
        const pseudos = [...rule.pseudo.values()].map((pseudo) => `.${pseudo.className}${pseudo.pseudo}{${pseudo.cssText}}`).join("\n");
        return `.${rule.className}{${rule.cssText}}${pseudos ? `\n${pseudos}` : ""}`;
    }).join("\n");
    const unprocessedComputedElements = Math.max(0, sourceSnapshotElements.length - snapshotLimit);
    const sourceControls = Array.from(document.querySelectorAll("input, textarea, select"));
    const clonedControls = Array.from(clone.querySelectorAll("input, textarea, select"));
    sourceControls.forEach((control, index) => {
        const target = clonedControls[index];
        if (!target) return;
        if (control instanceof HTMLInputElement) {
            if (control.type !== "password") target.setAttribute("value", control.value);
            target.toggleAttribute("checked", control.checked);
        } else if (control instanceof HTMLTextAreaElement) target.textContent = control.value;
        else if (control instanceof HTMLSelectElement) {
            [...target.options].forEach((option, optionIndex) => option.toggleAttribute("selected", control.options[optionIndex]?.selected));
        }
    });
    let inaccessibleFrames = 0;
    const sourceFrames = Array.from(document.querySelectorAll("iframe"));
    const clonedFrames = Array.from(clone.querySelectorAll("iframe"));
    sourceFrames.forEach((frame, index) => {
        try {
            const frameDocument = frame.contentDocument;
            if (!frameDocument?.documentElement) throw new Error("frame unavailable");
            const frameHtml = frameDocument.documentElement.cloneNode(true);
            frameHtml.querySelectorAll("script, noscript").forEach((element) => element.remove());
            clonedFrames[index]?.setAttribute("srcdoc", `<!doctype html>${frameHtml.outerHTML}`);
            clonedFrames[index]?.removeAttribute("src");
        } catch { inaccessibleFrames += 1; }
    });
    const clonedImages = Array.from(clone.querySelectorAll("img"));
    const sourceCanvases = Array.from(document.querySelectorAll("canvas"));
    const clonedCanvases = Array.from(clone.querySelectorAll("canvas"));
    sourceCanvases.forEach((canvas, index) => {
        try {
            const image = document.createElement("img");
            image.src = canvas.toDataURL("image/png");
            image.width = canvas.width;
            image.height = canvas.height;
            clonedCanvases[index]?.replaceWith(image);
        } catch { /* A tainted canvas remains as an empty canvas in the snapshot. */ }
    });
    let inaccessibleImages = 0;
    let embeddedBytes = 0;
    const sourceImages = Array.from(document.images);
    for (let index = 0; index < sourceImages.length; index += 1) {
        const sourceUrl = sourceImages[index].currentSrc || sourceImages[index].src;
        if (!sourceUrl || sourceUrl.startsWith("data:")) continue;
        try {
            const response = await fetch(sourceUrl, { credentials: "include" });
            if (!response.ok) throw new Error(String(response.status));
            const blob = await response.blob();
            if (embeddedBytes + blob.size > 50 * 1024 * 1024) throw new Error("snapshot resource budget exceeded");
            embeddedBytes += blob.size;
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
            clonedImages[index]?.setAttribute("src", dataUrl);
        } catch { inaccessibleImages += 1; }
        if (index > 0 && index % 20 === 0) reportProgress(52 + Math.round(index / sourceImages.length * 10), (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_resources", [index, sourceImages.length]));
    }
    const style = document.createElement("style");
    let css = "";
    let inaccessibleStylesheets = 0;
    for (const sheet of document.styleSheets) {
        try {
            const baseUrl = sheet.href || location.href;
            const ruleText = Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n").replace(/url\(\s*(["']?)(?!data:)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
                try { return `url(${quote}${new URL(value.trim(), baseUrl).href}${quote})`; } catch { return _match; }
            });
            css += `${ruleText}\n`;
        }
        catch { inaccessibleStylesheets += 1; }
    }
    const cssUrls = [...css.matchAll(/url\(\s*(["']?)(?!data:)([^"')]+)\1\s*\)/gi)];
    let inaccessibleCssResources = 0;
    const embeddedCssUrls = new Map();
    for (const match of cssUrls) {
        const original = match[2].trim();
        if (embeddedCssUrls.has(original)) continue;
        try {
            const resourceUrl = absoluteUrl(original);
            const response = await fetch(resourceUrl, { credentials: "include" });
            if (!response.ok) throw new Error(String(response.status));
            const blob = await response.blob();
            if (embeddedBytes + blob.size > 50 * 1024 * 1024) throw new Error("snapshot resource budget exceeded");
            embeddedBytes += blob.size;
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
            embeddedCssUrls.set(original, dataUrl);
        } catch { inaccessibleCssResources += 1; }
    }
    for (const [original, dataUrl] of embeddedCssUrls) css = css.split(original).join(dataUrl);
    const externalCssResources = inaccessibleCssResources;
    clone.querySelectorAll("link[rel~='stylesheet']").forEach((element) => element.remove());
    style.textContent = `${css}\n${computedCss}`;
    clone.querySelector("head")?.appendChild(style);
    const meta = document.createElement("meta");
    meta.name = "generator";
    meta.content = "EasyRead 2.0 Save Copy";
    clone.querySelector("head")?.appendChild(meta);
    const html = `<!doctype html>\n${clone.outerHTML}`;
    return { blob: new Blob([html], { type: "text/html;charset=utf-8" }), inaccessibleStylesheets, inaccessibleImages, inaccessibleFrames, externalCssResources, unprocessedComputedElements };
}

function mediaCandidates() {
    const candidates = new Map();
    const hookedRequests = getHookedMediaRequests();
    const vimeoPlayers = new Map();
    const mediaOrigins = [...new Set(hookedRequests.map(item => item.url).filter(url => /(?:^|\.)vimeocdn\.com$/i.test(safeHostname(url))).map(url => `${new URL(url).origin}/*`))];
    for (const url of [...document.querySelectorAll("iframe[src]")].map(frame => frame.src).concat(hookedRequests.map(item => item.frameUrl))) {
        try {
            const parsed = new URL(url);
            const id = parsed.pathname.match(/^\/video\/(\d+)/)?.[1];
            if (parsed.hostname !== "player.vimeo.com" || !id) continue;
            const metadata = hookedRequests.find(item => {
                if (item.source !== "frame-player") return false;
                try { return new URL(item.frameUrl).pathname.match(/^\/video\/(\d+)/)?.[1] === id; } catch { return false; }
            }) || {};
            vimeoPlayers.set(id, { url: parsed.href, kind: "vimeo", source: "vimeo-player", name: `Vimeo · ${id}`, poster: metadata.poster || "", width: metadata.width || 0, height: metadata.height || 0, duration: metadata.duration || 0, mediaOrigins });
        } catch { /* Ignore unrelated or unloaded frames. */ }
    }
    for (const item of vimeoPlayers.values()) candidates.set(item.url, item);
    const youtubeResponse = getYouTubePlayerResponse();
    const isYouTubePage = globalThis.EasyReadYouTubeMedia?.isYouTubePage(location.hostname) === true;
    const youtubeCandidates = globalThis.EasyReadYouTubeMedia?.buildCandidates(youtubeResponse, {
        poster: document.querySelector('meta[property="og:image"]')?.content || "",
        labels: {
            muxed: (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_media_track_muxed"),
            video: (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_media_track_video"),
            audio: (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_media_track_audio")
        }
    }) || [];
    youtubeCandidates.forEach((item) => candidates.set(item.url, item));
    const add = (url, kind = "media", detail = {}) => {
        let absolute = absoluteUrl(url);
        if (!absolute || !/^https?:/i.test(absolute)) return;
        try {
            const parsed = new URL(absolute);
            if (location.protocol === "https:" && parsed.protocol === "http:" && /(?:^|\.)video\.weibocdn\.com$/i.test(parsed.hostname)) {
                parsed.protocol = "https:";
                absolute = parsed.href;
            }
        } catch { return; }
        if (isYouTubePage && globalThis.EasyReadYouTubeMedia?.isGoogleVideoPlayback(absolute)) return;
        // CDN fragments belong to the player, not to separate downloadable videos.
        if (/(?:^|\.)vimeocdn\.com$/i.test(safeHostname(absolute)) && (vimeoPlayers.size || !/\/progressive(?:_redirect)?\//i.test(new URL(absolute).pathname))) return;
        if (/\.m4s(?:[?#]|$)/i.test(absolute) && detail.source !== "bilibili-playinfo") return;
        if (candidates.has(absolute)) return;
        const lower = absolute.toLowerCase();
        const mediaPath = (() => { try { return new URL(absolute).pathname.toLowerCase(); } catch { return ""; } })();
        const isYouTubePlayback = /\.googlevideo\.com\/videoplayback(?:[?#]|$)/i.test(lower);
        const isKnownTwitterMedia = /(?:^|\.)video\.twimg\.com$/i.test(safeHostname(absolute)) || /\/(?:ext_tw_video|amplify_video|tweet_video)\//i.test(lower);
        const detailMimeType = String(detail.contentType || detail.mimeType || "").split(";")[0].toLowerCase();
        const frameHost = safeHostname(detail.frameUrl || "");
        const pathResolution = mediaPath.match(/(?:^|\/)(\d{2,5})x(\d{2,5})(?:\/|$)/i);
        const frameLabel = /(?:^|\.)vimeo\.com$/i.test(frameHost) ? "Vimeo" : "";
        const hasMediaExtension = /\.(m3u8|m3u|m4s|mp4|webm|mp3|m4a|ogg|wav)$/i.test(mediaPath);
        const hasHlsSignal = /\.(m3u8|m3u)$/i.test(mediaPath) || /mpegurl/i.test(detailMimeType);
        const hasDirectMediaSignal = /\.(m4s|mp4|webm|mp3|m4a|ogg|wav)$/i.test(mediaPath);
        const looksLikeMedia = hasMediaExtension || isYouTubePlayback || (!isKnownTwitterMedia && /^video\/|^audio\/|mpegurl/i.test(detailMimeType));
        if (isKnownTwitterMedia && !hasHlsSignal && !hasDirectMediaSignal) return;
        if (!looksLikeMedia && kind === "resource") return;
        let mimeType = detailMimeType;
        if (isYouTubePlayback) {
            try { mimeType = decodeURIComponent(new URL(absolute).searchParams.get("mime") || "").split(";")[0]; } catch { /* URL remains a generic media candidate. */ }
        }
        const media = [...document.querySelectorAll("video, audio")].find((element) => (element.currentSrc || element.src) === absolute);
        const isHls = hasHlsSignal || /mpegurl/i.test(mimeType);
        const inferredKind = isHls ? "hls" : mimeType.startsWith("audio/") ? "audio" : isYouTubePlayback ? "video" : kind;
        const twitterLabel = isKnownTwitterMedia ? "X" : "";
        const statusLabel = detail.status ? `HTTP ${detail.status}` : "";
        candidates.set(absolute, {
            url: absolute,
            kind: inferredKind,
            mimeType,
            poster: media?.poster || document.querySelector('meta[property="og:image"]')?.content || "",
            name: isYouTubePlayback ? [document.title.replace(/\s*-\s*YouTube\s*$/i, ""), mimeType.startsWith("audio/") ? "Audio" : "Video"].join(" · ") : detail.source === "bilibili-playinfo" ? `${document.title.replace(/_哔哩哔哩.*$/i, "")} · ${detail.trackType === "audio" ? "Audio" : "Video"}` : twitterLabel || frameLabel,
            description: [twitterLabel && inferredKind.toUpperCase(), frameLabel && inferredKind.toUpperCase(), detail.quality, detail.codecs, mimeType, statusLabel].filter(Boolean).join(" · "),
            source: detail.source || "",
            frameUrl: detail.frameUrl || "",
            trackType: detail.trackType || "",
            backupUrls: Array.isArray(detail.backupUrls) ? detail.backupUrls : [],
            width: Number(detail.width) || media?.videoWidth || Number(pathResolution?.[1]) || 0,
            height: Number(detail.height) || media?.videoHeight || Number(pathResolution?.[2]) || 0,
            duration: Number(detail.duration) || (Number.isFinite(media?.duration) ? media.duration : 0),
            bandwidth: Number(detail.bandwidth) || 0,
            contentLength: Number(detail.contentLength) || 0
        });
    };
    document.querySelectorAll("video, audio").forEach((media) => {
        add(media.currentSrc || media.src, media.tagName.toLowerCase());
        media.querySelectorAll("source[src]").forEach((source) => add(source.src, media.tagName.toLowerCase()));
    });
    performance.getEntriesByType("resource").forEach((entry) => add(entry.name, "resource"));
    hookedRequests.forEach((entry) => add(entry.url, "resource", entry));
    const images = new Map();
    document.querySelectorAll('img').forEach(image => {
        if (image.closest('[data-easyread-ui]')) return;
        const url = absoluteUrl(image.currentSrc || image.src || image.dataset.src);
        if (!/^https?:/i.test(url) || images.has(url)) return;
        images.set(url, { url, kind: 'image', source: 'page-image', name: image.alt || '', width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    });
    return [...refineMediaCandidates(Array.from(candidates.values())).slice(0, 12), ...images.values()].map((item, index) => ({ ...item, id: `media-${index}`, index }));
}

function safeHostname(url) {
    try { return new URL(url).hostname; } catch { return ""; }
}

function twitterMediaGroup(item) {
    try {
        const parsed = new URL(item.url);
        if (!/(?:^|\.)video\.twimg\.com$/i.test(parsed.hostname)) return "";
        const match = parsed.pathname.match(/\/(?:ext_tw_video|amplify_video|tweet_video)\/(\d+)\//i);
        if (match?.[1]) return match[1];
        const posterMatch = String(item.poster || "").match(/\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video)\/(\d+)\//i);
        return posterMatch?.[1] || "";
    } catch { return ""; }
}

function twitterMediaScore(item) {
    const lower = item.url.toLowerCase();
    const resolution = lower.match(/\/(\d{2,5})x(\d{2,5})\//);
    const pixels = resolution ? Number(resolution[1]) * Number(resolution[2]) : 0;
    const isHls = item.kind === "hls";
    const isDirectFile = /\.(mp4|webm)(?:$|[?#])/i.test(lower);
    const isMaster = /(?:master|playlist|adaptive|\.m3u8)(?:[?#]|$)/i.test(lower) && !resolution;
    return (isDirectFile ? 1_000_000_000 : 0) + pixels + (isMaster ? 100_000_000 : 0) + (isHls ? 10_000_000 : 0);
}

function refineMediaCandidates(items) {
    const hasBilibiliPlayInfo = items.some((item) => item.source === "bilibili-playinfo");
    if (hasBilibiliPlayInfo) {
        items = items.filter((item) => item.source === "bilibili-playinfo" || !/(?:^|\.)(?:bilivideo\.(?:com|cn)|hdslb\.com)$/i.test(safeHostname(item.url)));
    }
    const twitterGroups = new Map();
    const refined = [];
    for (const item of items) {
        const group = twitterMediaGroup(item);
        if (!group) {
            refined.push(item);
            continue;
        }
        const current = twitterGroups.get(group);
        if (!current || twitterMediaScore(item) > twitterMediaScore(current)) {
            twitterGroups.set(group, item);
        }
    }
    refined.push(...twitterGroups.values());
    return refined.sort((left, right) => {
        const leftTwitter = twitterMediaGroup(left) ? 1 : 0;
        const rightTwitter = twitterMediaGroup(right) ? 1 : 0;
        return rightTwitter - leftTwitter || twitterMediaScore(right) - twitterMediaScore(left);
    });
}

function getHookedMediaRequests() {
    const eventName = "easyread-media-requests-response";
    let requests = [];
    const receive = (event) => {
        try { requests = JSON.parse(event.detail || "[]"); } catch { requests = []; }
    };
    document.addEventListener(eventName, receive, { once: true });
    document.dispatchEvent(new globalThis.Event("easyread-media-requests-request"));
    document.removeEventListener(eventName, receive);
    return Array.isArray(requests) ? requests : [];
}

function getYouTubePlayerResponse() {
    if (!/(^|\.)youtube\.com$/i.test(location.hostname)) return null;
    for (const script of document.scripts) {
        const text = script.textContent || "";
        const marker = text.search(/(?:var\s+)?ytInitialPlayerResponse\s*=/);
        if (marker < 0) continue;
        const start = text.indexOf("{", marker);
        if (start < 0) continue;
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (let index = start; index < text.length; index += 1) {
            const character = text[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (character === "\\") escaped = true;
                else if (character === '"') quoted = false;
                continue;
            }
            if (character === '"') quoted = true;
            else if (character === "{") depth += 1;
            else if (character === "}" && --depth === 0) {
                try { return JSON.parse(text.slice(start, index + 1)); } catch { break; }
            }
        }
    }
    return null;
}

async function detectMediaExtension(blob, sourceUrl) {
    const mime = (blob.type || "").split(";")[0].toLowerCase();
    const mimeExtensions = {
        "video/mp4": "mp4", "audio/mp4": "m4a", "video/webm": "webm", "audio/webm": "webm",
        "audio/mpeg": "mp3", "audio/aac": "aac", "audio/ogg": "ogg", "video/ogg": "ogv",
        "video/mp2t": "ts", "application/vnd.apple.mpegurl": "m3u8", "application/x-mpegurl": "m3u8"
    };
    if (mimeExtensions[mime]) return mimeExtensions[mime];
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = String.fromCharCode(...bytes);
    if (ascii.slice(4, 8) === "ftyp") return mime.startsWith("audio/") ? "m4a" : "mp4";
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return mime.startsWith("audio/") ? "webm" : "webm";
    if (ascii.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "mp3";
    if (ascii.startsWith("OggS")) return mime.startsWith("video/") ? "ogv" : "ogg";
    if (bytes[0] === 0x47) return "ts";
    const pathExtension = new URL(sourceUrl).pathname.split(".").pop();
    return /^[a-z0-9]{2,5}$/i.test(pathExtension) ? pathExtension.toLowerCase() : "bin";
}

async function ensureMediaEngine() {
    if (!globalThis.EasyReadMediaEngine) {
        const result = await chrome.runtime.sendMessage({ command: "ensureMediaEngine" });
        if (!result?.ok || !globalThis.EasyReadMediaEngine) throw new Error(result?.error || "Media engine unavailable");
    }
    return globalThis.EasyReadMediaEngine;
}

async function requestMediaResource(url, options = {}, referrer = location.href) {
    const result = await chrome.runtime.sendMessage({ command: "mediaFetchResource", url, asText: Boolean(options.text), range: options.range, referrer });
    if (!result?.ok) {
        const error = new Error((globalThis.EasyReadLocale || chrome.i18n).getMessage(result?.code || result?.error || "") || result?.error || "Media request failed");
        error.code = result?.code;
        error.status = result?.status;
        error.details = { requiredOrigin: result?.requiredOrigin, url };
        throw error;
    }
    if (options.text) return result;
    const binary = globalThis.atob(result.base64 || "");
    return { ...result, bytes: Uint8Array.from(binary, char => char.charCodeAt(0)), base64: undefined };
}

async function validateMediaMp4(blob) {
    const engine = await ensureMediaEngine();
    return engine.inspectMp4(await blob.arrayBuffer());
}

async function downloadHls(url, updateStatus, referrer = location.href) {
    const engine = await ensureMediaEngine();
    const result = await engine.downloadHls(url, {
        request: (resource, options) => requestMediaResource(resource, options, referrer),
        progress: event => updateStatus((globalThis.EasyReadLocale || chrome.i18n).getMessage(event.stage, [String(event.current || 0), String(event.total || 0)]), event.percent, 100, event.bytes || 0)
    });
    return new Blob([result.bytes], { type: result.tracks.some(track => track.type === "video") ? "video/mp4" : "audio/mp4" });
}

async function resolveVimeoMedia(media) {
    const player = new URL(media.url);
    const id = player.pathname.match(/^\/video\/(\d+)/)?.[1];
    if (player.hostname !== "player.vimeo.com" || !id) throw new Error("Invalid Vimeo player URL");
    const configUrl = new URL(`https://player.vimeo.com/video/${id}/config`);
    if (player.searchParams.has("h")) configUrl.searchParams.set("h", player.searchParams.get("h"));
    const response = await requestMediaResource(configUrl.href, { text: true }, location.href);
    const config = JSON.parse(response.text);
    const files = config.request?.files;
    const progressive = (files?.progressive || []).filter(item => /^https?:/.test(item.url || "")).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    if (progressive) return { ...media, url: progressive.url, kind: "video", mimeType: "video/mp4", width: progressive.width || media.width, height: progressive.height || media.height, contentLength: Number(progressive.size) || media.contentLength, referrer: player.href };
    const hls = files?.hls;
    const cdns = Object.values(hls?.cdns || {});
    // Select the CDN already observed by this page when possible.
    const preferred = cdns.find(cdn => (media.mediaOrigins || []).includes(`${new URL(cdn.avc_url || cdn.url).origin}/*`)) || hls?.cdns?.[hls?.default_cdn] || cdns[0];
    const url = preferred?.avc_url || preferred?.url;
    if (!url) throw new Error((globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_media_no_segments"));
    return { ...media, url, kind: "hls", referrer: player.href };
}

function playlistResourceLinks(text, baseUrl) {
    const links = [];
    const add = (value, type) => {
        try {
            const url = new URL(value, baseUrl).href;
            if (/^https?:/i.test(url)) links.push({ url, type });
        } catch { /* Ignore malformed playlist entries. */ }
    };
    for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
        for (const match of line.matchAll(/(?:URI|KEYFORMATURI)="([^"]+)"/g)) add(match[1], /\.m3u8?(?:$|[?#])/i.test(match[1]) ? "playlist" : line.startsWith("#EXT-X-KEY") ? "key" : "resource");
        if (!line.startsWith("#")) add(line, /\.m3u8?(?:$|[?#])/i.test(line) ? "playlist" : "segment");
    }
    return links;
}

async function inspectMediaSources(input) {
    const sources = [];
    const seen = new Set();
    const add = (url, type) => {
        if (!url || seen.has(url) || !/^https?:/i.test(url)) return;
        seen.add(url);
        sources.push({ url, type });
    };
    add(input.url, input.source === "vimeo-player" ? "player" : input.kind === "hls" ? "playlist" : "media");
    (input.backupUrls || []).forEach(url => add(url, "backup"));
    let media = input;
    if (input.source === "vimeo-player") {
        media = await resolveVimeoMedia(input);
        add(media.url, media.kind === "hls" ? "playlist" : "media");
    }
    if (media.kind === "hls" || /mpegurl/i.test(media.mimeType || "") || /\.m3u8?(?:$|[?#])/i.test(media.url)) {
        const root = await requestMediaResource(media.url, { text: true }, media.referrer || media.frameUrl || location.href);
        const rootLinks = playlistResourceLinks(root.text, root.url || media.url);
        rootLinks.forEach(link => add(link.url, link.type));
        for (const playlist of rootLinks.filter(link => link.type === "playlist").slice(0, 12)) {
            const child = await requestMediaResource(playlist.url, { text: true }, media.referrer || media.frameUrl || location.href);
            playlistResourceLinks(child.text, child.url || playlist.url).forEach(link => add(link.url, link.type));
            if (sources.length >= 600) break;
        }
    }
    return sources.slice(0, 600);
}

async function captureFullPagePng(dialog, format = "png", reportProgress) {
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const originalScrollBehavior = document.documentElement.style.scrollBehavior;
    const hiddenElements = Array.from(document.querySelectorAll("[data-easyread-ui='true'], #easyread-annotation-sidebar, #easyread-annotation-reopen"));
    const displays = hiddenElements.map((element) => element.style.display);
    const viewportHeight = window.innerHeight;
    const pageHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    const positions = [];
    for (let y = 0; y < pageHeight; y += viewportHeight) positions.push(Math.min(y, Math.max(0, pageHeight - viewportHeight)));
    const uniquePositions = [...new Set(positions)];
    let canvas;
    let context;
    let scale;
    try {
        document.documentElement.style.scrollBehavior = "auto";
        hiddenElements.forEach((element) => { element.style.display = "none"; });
        for (let index = 0; index < uniquePositions.length; index += 1) {
            window.scrollTo(0, uniquePositions[index]);
            await new Promise((resolve) => setTimeout(resolve, index ? 550 : 120));
            const result = await chrome.runtime.sendMessage({ command: "captureVisibleTab", format });
            if (!result?.ok) throw new Error(result?.error || "capture failed");
            const bitmap = await createImageBitmap(await (await fetch(result.dataUrl)).blob());
            if (!canvas) {
                scale = bitmap.height / viewportHeight;
                const targetHeight = Math.ceil(pageHeight * scale);
                if (targetHeight > 32767 || bitmap.width > 32767) {
                    bitmap.close();
                    throw new Error((globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_png_too_long"));
                }
                canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = targetHeight;
                context = canvas.getContext("2d");
            }
            context.drawImage(bitmap, 0, Math.round(uniquePositions[index] * scale));
            bitmap.close();
            const progressMessage = (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_png_progress", [index + 1, uniquePositions.length]);
            if (dialog) setCaptureStatus(dialog, progressMessage);
            reportProgress?.(15 + Math.round((index + 1) / uniquePositions.length * 75), progressMessage);
        }
        const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
        const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image encoding failed")), mimeType, .9));
        return { blob, details: { scope: "fullPage", viewportCount: uniquePositions.length } };
    } finally {
        window.scrollTo(originalX, originalY);
        document.documentElement.style.scrollBehavior = originalScrollBehavior;
        hiddenElements.forEach((element, index) => { element.style.display = displays[index]; });
    }
}

async function prepareLazyPage(reportProgress) {
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const viewport = Math.max(window.innerHeight, 1);
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    const scrollTargets = [
        { element: window, viewport, extent: height, original: originalY },
        ...[...document.querySelectorAll("*")].filter((element) => {
            const style = window.getComputedStyle(element);
            return element.clientHeight >= 200 && element.clientWidth >= 300 && element.scrollHeight > element.clientHeight + 100 && /(auto|scroll|overlay)/.test(style.overflowY);
        }).map((element) => ({ element, viewport: element.clientHeight, extent: element.scrollHeight, original: element.scrollTop }))
    ];
    const routes = scrollTargets.map((target) => {
        const steps = Math.max(1, Math.ceil(target.extent / Math.max(target.viewport, 1)));
        const positions = Array.from({ length: steps }, (_, index) => Math.min(index * target.viewport, Math.max(0, target.extent - target.viewport)));
        return { ...target, positions: [...positions, ...positions.slice(0, -1).reverse()] };
    });
    const totalSteps = routes.reduce((total, target) => total + target.positions.length, 0);
    const originalBehavior = document.documentElement.style.scrollBehavior;
    let lastMutation = Date.now();
    const observer = new MutationObserver(() => { lastMutation = Date.now(); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    captureScrollInProgress = true;
    document.documentElement.style.scrollBehavior = "auto";
    try {
        let completedSteps = 0;
        for (const target of routes) {
            for (const position of target.positions) {
                if (target.element === window) window.scrollTo(0, position);
                else target.element.scrollTop = position;
                completedSteps += 1;
                reportProgress(5 + Math.round(completedSteps / Math.max(totalSteps, 1) * 13), (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_lazy", [completedSteps, totalSteps]));
                await new Promise((resolve) => setTimeout(resolve, 180));
            }
            if (target.element === window) window.scrollTo(0, target.original);
            else target.element.scrollTop = target.original;
        }
        const waitStarted = Date.now();
        while (Date.now() - lastMutation < 600 && Date.now() - waitStarted < 1500) {
            reportProgress(19, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_stabilizing"));
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    } finally {
        observer.disconnect();
        scrollTargets.forEach((target) => {
            if (target.element === window) return;
            target.element.scrollTop = target.original;
        });
        window.scrollTo(originalX, originalY);
        document.documentElement.style.scrollBehavior = originalBehavior;
        captureScrollInProgress = false;
    }
}

async function prepareCaptureForClipboard(blob, type) {
    if (type === "markdown") {
        return { encoding: "text", data: await blob.text(), mimeType: "text/plain" };
    }
    let pngBlob = blob;
    if (blob.type !== "image/png") {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        bitmap.close();
        pngBlob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Clipboard image encoding failed")), "image/png"));
    }
    const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(pngBlob);
    });
    return { encoding: "dataUrl", data, mimeType: "image/png" };
}

function sendCaptureProgress(percent, stage, title) {
    globalThis.EasyReadDiagnostics?.stage({ operation: "capture", percent, stage, title });
    sendRuntimeMessage({ command: "captureProgress", percent, stage, title }).catch(() => {});
}

async function runPopupCapture(type, options = {}) {
    const report = (percent, stage, title) => sendCaptureProgress(percent, stage, title);
    if (type === "html" || type === "markdown" || (type === "image" && options.scope === "fullPage")) await prepareLazyPage(report);
    let blob;
    let fileName;
    let integrity = "complete";
    let details = {};
    if (type === "html") {
        report(24, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_document"));
        if (!globalThis.EasyReadSnapshotEngine) throw new Error("EasyRead Snapshot Engine is unavailable");
        const engine = new globalThis.EasyReadSnapshotEngine({ progress: report });
        const result = await engine.capture();
        blob = result.blob;
        details = result.details;
        integrity = result.integrity;
        fileName = captureFileName("html");
    } else if (type === "markdown") {
        report(30, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_document"));
        blob = new Blob([await buildMarkdownCapture()], { type: "text/markdown;charset=utf-8" });
        fileName = captureFileName("md");
    } else if (type === "pdf") {
        report(35, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_print_dialog"));
        window.print();
        report(100, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_print_opened"));
        return;
    } else if (type === "image") {
        const format = options.format === "jpeg" ? "jpeg" : "png";
        if (options.scope === "fullPage") {
            const result = await captureFullPagePng(null, format, report);
            blob = result.blob;
            details = result.details;
        } else {
            report(45, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_viewport"));
            const result = await chrome.runtime.sendMessage({ command: "captureVisibleTab", format });
            if (!result?.ok) throw new Error(result?.error || "capture failed");
            blob = await (await fetch(result.dataUrl)).blob();
            details = { scope: "visibleViewport" };
        }
        fileName = captureFileName(format === "jpeg" ? "jpg" : "png");
    } else throw new Error("Unsupported capture type");
    if (options.action === "prepareCopy") {
        report(92, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_copying"));
        return prepareCaptureForClipboard(blob, type);
    } else {
        report(92, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_stage_downloading"));
        downloadCaptureBlob(blob, fileName);
        await recordArtifact(type, fileName, blob, integrity, details);
        report(100, (globalThis.EasyReadLocale || chrome.i18n).getMessage(integrity === "partial" ? "capture_status_partial" : "capture_status_saved"));
    }
}

async function downloadMediaFromPopup(media, onProgress) {
    const report = (percent, stage, extra = {}) => {
        onProgress?.(stage);
        return sendRuntimeMessage({ command: "mediaProgress", index: media.index, percent, stage, ...extra }).catch(() => {});
    };
    if (media.source === "vimeo-player") {
        report(2, (globalThis.EasyReadLocale || chrome.i18n).getMessage("media_stage_playlists"));
        media = await resolveVimeoMedia(media);
    }
    if (media.source === "youtube-player") {
        report(10, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_working"));
        const extension = ({ "video/mp4": "mp4", "audio/mp4": "m4a", "video/webm": "webm", "audio/webm": "webm" })[media.mimeType] || "mp4";
        const fileName = media.fileName || captureFileName(extension);
        const result = await sendRuntimeMessage({ command: "downloadYouTubeInPage", url: media.url, filename: fileName });
        if (!result?.ok) throw new Error(result?.error || "YouTube page download failed");
        await recordArtifact("media", fileName, { type: result.mimeType || media.mimeType, size: result.size || 0 }, "complete", { source: media.url, kind: media.kind, itag: media.itag });
        report(100, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_saved"), { done: true, fileSize: result.size || 0 });
        return;
    }
    let blob;
    if (media.kind === "hls") {
        blob = await downloadHls(media.url, (stage, current, total, bytes) => report(total ? Math.round(current / total * 100) : 45, stage, { loadedBytes: bytes || 0, totalBytes: media.contentLength || 0 }), media.referrer || media.frameUrl || location.href);
    } else if (media.source === "vimeo-player") {
        const result = await requestMediaResource(media.url, {}, media.referrer);
        blob = new Blob([result.bytes], { type: result.contentType || "video/mp4" });
    } else {
        const response = await fetch(media.url, {
            credentials: "include",
            cache: "no-store",
            headers: /(?:^|\.)bilivideo\.com$/i.test(safeHostname(media.url)) ? { Range: "bytes=0-" } : undefined,
            referrer: location.href,
            referrerPolicy: "strict-origin-when-cross-origin"
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const total = Number(response.headers.get("content-length")) || 0;
        if (!response.body) blob = await response.blob();
        else {
            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.byteLength;
                report(total ? Math.min(95, loaded / total * 95) : 45, total ? `${Math.round(loaded / total * 100)}%` : (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_working"), { loadedBytes: loaded, totalBytes: total });
            }
            blob = new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
        }
    }
    const extension = await detectMediaExtension(blob, media.url);
    if (extension === "mp4" || extension === "m4a") await validateMediaMp4(blob);
    const fileName = media.fileName || captureFileName(extension);
    report(97, (globalThis.EasyReadLocale || chrome.i18n).getMessage("media_stage_validating"), { fileSize: blob.size });
    await saveValidatedMedia(blob, fileName);
    await recordArtifact("media", fileName, blob, "complete", { source: media.url, kind: media.kind });
    report(100, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_saved"), { done: true });
}


function setCaptureStatus(dialog, message, state = "working") {
    const status = dialog.querySelector(".easyread-capture-status");
    status.textContent = message;
    status.dataset.state = state;
}

function renderMediaList(dialog) {
    const list = dialog.querySelector(".easyread-media-list");
    list.replaceChildren();
    const candidates = mediaCandidates();
    if (!candidates.length) {
        setCaptureStatus(dialog, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_media_none"), "error");
        return;
    }
    setCaptureStatus(dialog, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_media_found", [candidates.length]));
    for (const item of candidates) {
        const row = document.createElement("div");
        row.className = "easyread-media-item";
        const copy = document.createElement("div");
        copy.className = "easyread-media-copy";
        const name = document.createElement("strong");
        name.textContent = item.kind.toUpperCase();
        const url = document.createElement("span");
        url.textContent = item.url;
        copy.append(name, url);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "easyread-media-download";
        button.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_action_download");
        const errorArea = document.createElement("div");
        errorArea.className = "easyread-media-error";
        errorArea.hidden = true;
        const errorMessage = document.createElement("span");
        errorArea.append(errorMessage);
        button.addEventListener("click", async () => {
            try {
                button.disabled = true;
                errorArea.hidden = true;
                setCaptureStatus(dialog, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_working"));
                await downloadMediaFromPopup(item, message => setCaptureStatus(dialog, message));
                setCaptureStatus(dialog, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_saved"), "success");
            } catch (error) {
                setCaptureStatus(dialog, `${(globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_failed")}: ${error.message}`, "error");
                errorMessage.textContent = error.message;
                globalThis.EasyReadDiagnostics?.record(error, { operation: "media", media: item, detectedMedia: candidates }, false);
                errorArea.hidden = false;
            } finally { button.disabled = false; }
        });
        row.append(copy, button, errorArea);
        list.appendChild(row);
    }
}

function ensureCaptureDialog() {
    let dialog = document.getElementById("easyread-capture-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "easyread-capture-dialog";
    dialog.dataset.easyreadUi = "true";
    dialog.innerHTML = `
      <header class="easyread-capture-header"><strong></strong><button type="button" class="easyread-capture-close" aria-label=""><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8"/></svg></button></header>
      <div class="easyread-capture-grid">
        <button type="button" class="easyread-capture-option" data-format="markdown"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg><span><strong></strong><span></span></span></button>
        <button type="button" class="easyread-capture-option" data-format="html"><svg viewBox="0 0 24 24"><path d="M8 3h8l4 4v14H4V3h4M9 12l-2 2 2 2M15 12l2 2-2 2M13 11l-2 6"/></svg><span><strong></strong><span></span></span></button>
        <button type="button" class="easyread-capture-option" data-format="png"><svg viewBox="0 0 24 24"><path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3"/></svg><span><strong></strong><span></span></span></button>
        <button type="button" class="easyread-capture-option" data-format="media"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM10 9l5 3-5 3z"/></svg><span><strong></strong><span></span></span></button>
      </div><div class="easyread-capture-status" role="status"></div><div class="easyread-media-list"></div>`;
    dialog.querySelector(".easyread-capture-header strong").textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_title");
    const close = dialog.querySelector(".easyread-capture-close");
    close.setAttribute("aria-label", (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_close"));
    close.addEventListener("click", () => dialog.close());
    const labels = {
        markdown: ["capture_markdown_title", "capture_markdown_description"],
        html: ["capture_html_title", "capture_html_description"],
        png: ["capture_png_title", "capture_png_description"],
        media: ["capture_media_title", "capture_media_description"]
    };
    dialog.querySelectorAll(".easyread-capture-option").forEach((button) => {
        const [titleKey, descriptionKey] = labels[button.dataset.format];
        button.querySelector("strong").textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage(titleKey);
        button.querySelector("span span").textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage(descriptionKey);
        button.addEventListener("click", async () => {
            const format = button.dataset.format;
            if (format === "media") return renderMediaList(dialog);
            try {
                button.disabled = true;
                setCaptureStatus(dialog, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_working"));
                let blob;
                let fileName;
                let integrity = "complete";
                let details = {};
                if (format === "markdown") {
                    blob = new Blob([await buildMarkdownCapture()], { type: "text/markdown;charset=utf-8" });
                    fileName = captureFileName("md");
                } else if (format === "html") {
                    const result = await createHtmlCapture();
                    blob = result.blob;
                    details = { inaccessibleStylesheets: result.inaccessibleStylesheets, inaccessibleImages: result.inaccessibleImages, externalCssResources: result.externalCssResources };
                    integrity = result.inaccessibleStylesheets || result.inaccessibleImages || result.externalCssResources ? "partial" : "complete";
                    fileName = captureFileName("html");
                } else {
                    const result = await captureFullPagePng(dialog);
                    blob = result.blob;
                    fileName = captureFileName("png");
                    details = result.details;
                }
                downloadCaptureBlob(blob, fileName);
                await recordArtifact(format, fileName, blob, integrity, details);
                setCaptureStatus(dialog, (globalThis.EasyReadLocale || chrome.i18n).getMessage(integrity === "partial" ? "capture_status_partial" : "capture_status_saved"), integrity === "partial" ? "working" : "success");
            } catch (error) {
                setCaptureStatus(dialog, `${(globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_failed")}: ${error.message}`, "error");
                globalThis.EasyReadDiagnostics?.record(error, { operation: "capture", format }, dialog.querySelector(".easyread-capture-status"));
            } finally { button.disabled = false; }
        });
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    document.documentElement.appendChild(dialog);
    return dialog;
}

function openCaptureDialog() {
    const dialog = ensureCaptureDialog();
    dialog.querySelector(".easyread-media-list").replaceChildren();
    setCaptureStatus(dialog, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_ready"));
    if (!dialog.open) dialog.showModal();
}

function getScrollProgress() {
    const pageHeight = document.documentElement.scrollHeight;
    const windowHeight = window.innerHeight;
    const scrollableHeight = pageHeight - windowHeight;
    return scrollableHeight > 0 ? (window.scrollY / scrollableHeight) * 100 : 0;
}

function getScrollPosition() {
    return {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        progress: getScrollProgress()
    };
}

function setScrollPosition(position) {
    window.scroll({
        left: position.scrollX,
        top: position.scrollY,
        behavior: "smooth"
    });
}

async function sendMessagePagePosition(position) {
    await sendRuntimeMessage({ position });
}

window.addEventListener("scroll", () => {
    if (!extensionContextAvailable()) { stopInvalidatedExtensionContext(); return; }
    if (captureScrollInProgress) return;
    userHasScrolled = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(async () => {
        try {
            await sendMessagePagePosition(getScrollPosition());
        } catch (error) {
            console.log(error);
        }
    }, 3000);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.command === 'easyreadPing') { sendResponse({ ok: true }); return; }
    if (message?.command === "setScroll" && !userHasScrolled) {
        setScrollPosition(message.position);
    }
    if (message?.command === "refreshHighlights") {
        refreshHighlights().catch(console.log);
    }
    if (message?.command === "getSelectionContext") {
        sendResponse(getSelectionContext());
    }
    if (message?.command === "openAnnotationComposer") {
        openAnnotationComposer(message).then(() => sendResponse({ ok: true }), error => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.command === 'addPopupPageNote') {
        notesRequest('add', { comment: message.comment, selectionText: '' }).then(() => sendResponse({ ok: true }), error => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.command === 'getPopupAnnotations') {
        getOrderedPageAnnotations().then(annotations => sendResponse({ annotations: annotations.map(item => ({ ...item, quote: decodeStoredText(item.selectionText) })) }), error => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.command === 'locateAnnotation') {
        locatePageAnnotation(message.annotationId, message.smooth !== false).then(() => sendResponse({ ok: true }), error => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.command === 'downloadPopupAnnotations') {
        downloadPageAnnotations().then(() => sendResponse({ ok: true }), error => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.command === 'editPopupAnnotation') {
        (async () => {
            await notesRequest('edit', { id: message.annotationId, comment: message.comment });
            await renderAnnotationList();
            sendResponse({ ok: true });
        })().catch(error => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.command === 'showAnnotationSidebar') {
        const sidebar = ensureAnnotationSidebar();
        setAnnotationExpanded(sidebar, true);
        renderAnnotationList().then(() => sendResponse({ visible: true }), error => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.command === "removeAnnotation") {
        removePageAnnotation(message.annotationId).then(
            (removed) => sendResponse({ removed }),
            (error) => sendResponse({ removed: false, error: error.message })
        );
        return true;
    }
    if (message?.command === "toggleAnnotationSidebar") {
        const sidebar = ensureAnnotationSidebar();
        setAnnotationExpanded(sidebar, sidebar.hidden);
        if (!sidebar.hidden) renderAnnotationList().catch(console.log);
        sendResponse({ visible: !sidebar.hidden });
    }
    if (message?.command === "getAnnotationSidebarState") {
        const sidebar = document.getElementById("easyread-annotation-sidebar");
        sendResponse({ visible: Boolean(sidebar && !sidebar.hidden) });
    }
    if (message?.command === "openSaveCopy") {
        openCaptureDialog();
        sendResponse({ opened: true });
    }
    if (message?.command === "getMediaCandidates") {
        sendResponse(mediaCandidates());
    }
    if (message?.command === "probeMediaSize") {
        (async () => {
            try {
                const target = new URL(message.url, location.href);
                if (!/^https?:$/.test(target.protocol)) return { size: 0 };
                const options = { credentials: "include", cache: "no-store", referrer: location.href, referrerPolicy: "strict-origin-when-cross-origin" };
                let response = await fetch(target.href, { ...options, method: "HEAD" });
                const isMediaResponse = (candidate) => candidate.ok && !/^(?:text\/html|application\/(?:json|problem\+json))/i.test(candidate.headers.get("content-type") || "");
                let size = isMediaResponse(response) ? Number(response.headers.get("content-length")) || 0 : 0;
                if (!size) {
                    response = await fetch(target.href, { ...options, headers: { Range: "bytes=0-0" } });
                    const range = response.headers.get("content-range")?.match(/\/(\d+)$/);
                    size = isMediaResponse(response) ? Number(range?.[1]) || (response.status === 200 ? Number(response.headers.get("content-length")) || 0 : 0) : 0;
                    response.body?.cancel().catch(() => {});
                }
                sendResponse({ size, mimeType: isMediaResponse(response) ? response.headers.get('content-type') || '' : '' });
            } catch { sendResponse({ size: 0 }); }
        })();
        return true;
    }
    if (message?.command === "inspectMediaSources") {
        inspectMediaSources(message.media).then(
            sources => sendResponse({ ok: true, sources }),
            error => {
                const debug = globalThis.EasyReadDiagnostics?.record(error, { operation: "media-sources" }, false);
                sendResponse({ ok: false, error: error.message, requiredOrigin: error.details?.requiredOrigin || "", debug });
            }
        );
        return true;
    }
    if (message?.command === "startCapture") {
        runPopupCapture(message.type, message.options).then(
            (clipboard) => sendResponse({ ok: true, clipboard }),
            (error) => {
                sendCaptureProgress(100, error.message, (globalThis.EasyReadLocale || chrome.i18n).getMessage("capture_status_failed"));
                const debug = globalThis.EasyReadDiagnostics?.record(error, { operation: "capture", type: message.type }, false);
                sendResponse({ ok: false, error: error.message, debug });
            }
        );
        return true;
    }
    if (message?.command === "downloadMedia") {
        downloadMediaFromPopup(message.media).then(
            () => sendResponse({ ok: true }),
            (error) => {
                globalThis.EasyReadDiagnostics?.record(error, { operation: "media-download", media: message.media }, false);
                const debug = {
                    capturedAt: new Date().toISOString(),
                    source: "content-script",
                    page: { title: document.title, url: location.href },
                    media: message.media,
                    error: { name: error.name, message: error.message, stack: error.stack || "", code: error.code },
                    details: error.debug || error.details || null
                };
                const localizedError = (globalThis.EasyReadLocale || chrome.i18n).getMessage(error.code || error.message) || error.message;
                sendRuntimeMessage({ command: "mediaProgress", index: message.media.index, percent: 0, stage: localizedError, error: true, debug }).catch(() => {});
                sendResponse({ ok: false, error: localizedError, debug });
            }
        );
        return true;
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes[EASYREAD_NOTES_KEY] || changes[EASYREAD_HIGHLIGHT_SETTING])) {
        refreshHighlights().catch(console.log);
    }
    if (areaName === "local" && changes[EASYREAD_NOTES_KEY]) {
        renderAnnotationList().catch(console.log);
        refreshAnnotationHighlights().catch(console.log);
    }
});

function initializeHighlights() {
    refreshHighlights().catch(console.log);
    refreshAnnotationHighlights().catch(console.log);
    observeDynamicContent();
    observeVideos();
    getPageAnnotations().then((annotations) => {
        if (annotations.some(note => note.comment)) {
            const sidebar = ensureAnnotationSidebar();
            setAnnotationExpanded(sidebar, true);
            renderAnnotationList().catch(console.log);
        }
    }).catch(console.log);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHighlights, { once: true });
} else {
    initializeHighlights();
}
globalThis.__easyreadContentReady = true;
document.addEventListener('easyread-language-changed', () => {
    const sidebar = document.getElementById('easyread-annotation-sidebar');
    if (!sidebar) return;
    sidebar.querySelector('header strong').textContent = globalThis.EasyReadLocale.getMessage('annotation_sidebar_title');
    for (const [selector, key] of [['.easyread-annotation-download', 'annotation_sidebar_download'], ['.easyread-annotation-popup', 'annotation_move_popup'], ['.easyread-annotation-collapse', 'annotation_sidebar_collapse']]) {
        const button = sidebar.querySelector(selector);
        button.title = globalThis.EasyReadLocale.getMessage(key); button.setAttribute('aria-label', button.title);
    }
    sidebar.querySelector('.easyread-page-note-add').textContent = globalThis.EasyReadLocale.getMessage('notes_add_page');
    if (!sidebar.querySelector('textarea')) renderAnnotationList().catch(console.error);
});
})();
