(() => {
function createIconButton(className, title, iconMarkup) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `easyread-annotation-icon-button ${className}`;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = iconMarkup;
    return button;
}


function formatAnnotationDate(timestamp) { return new Date(timestamp).toLocaleString((globalThis.EasyReadLocale || chrome.i18n).getUILanguage()); }
function cancelDrawerIntro(list) {
 const intro = list.__drawerIntro;
 if (!intro) return;
 clearTimeout(intro.delay); clearInterval(intro.clock);
 intro.done = true; intro.remaining = null;
}
function scheduleDrawerIntro(list, count) {
 const intro = list.__drawerIntro;
 if (!intro || intro.done || intro.delay || !count || !list.getClientRects().length) return;
 intro.delay = setTimeout(() => {
   intro.delay = null;
   if (!list.isConnected || !list.getClientRects().length) return;
   intro.done = true;
   syncPageDrawer(list, true, true);
   if (!list.closest('#panelAnnotations')) return;
   intro.remaining = 3;
   syncPageDrawer(list);
   intro.clock = setInterval(() => {
     if (!list.isConnected || !list.getClientRects().length || list.querySelector('textarea')) { cancelDrawerIntro(list); if (list.isConnected) syncPageDrawer(list); return; }
     intro.remaining--;
     if (intro.remaining > 0) { syncPageDrawer(list); return; }
     cancelDrawerIntro(list);
     const drawer = list.querySelector('.easyread-page-drawer');
     if (!globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) {
       const animation = drawer.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 140, easing: 'ease-out' });
       intro.closing = animation;
       animation.onfinish = () => { intro.closing = null; syncPageDrawer(list, false, true); };
     } else syncPageDrawer(list, false, true);
   }, 1000);
 }, 1000);
}
function syncPageDrawer(list, open, automatic = false) {
 if (open !== undefined && !automatic) {
   list.__drawerIntro?.closing?.cancel();
   cancelDrawerIntro(list);
 }
 const surface = list.closest('#easyread-annotation-sidebar');
 let drawer = list.querySelector('.easyread-page-drawer');
 if (!drawer) {
   drawer = document.createElement('section'); drawer.className = 'easyread-page-drawer';
   drawer.id = `${list.id || 'easyread-notes'}-page-drawer`;
   list.append(drawer);
 }
 for (const item of [...list.children]) if (item.classList.contains('easyread-page-note')) drawer.append(item);
 const count = drawer.querySelectorAll('[data-note-id]').length;
 const hasDraft = Boolean(drawer.querySelector('textarea'));
 if (list.__notesLoaded && !count && !hasDraft) cancelDrawerIntro(list);
 if (list.__drawerIntro && !list.__drawerIntro.done && count) {
   list.__pageDrawerOpen = false;
   scheduleDrawerIntro(list, count);
 }
 if (open !== undefined) list.__pageDrawerOpen = open;
 if (list.__pageDrawerOpen === undefined) list.__pageDrawerOpen = true;
 drawer.hidden = !drawer.children.length || !list.__pageDrawerOpen;
 drawer.inert = drawer.hidden;
 const toggle = surface.querySelector('.easyread-page-note-toggle');
 if (toggle) {
   toggle.hidden = count === 0 && !hasDraft;
   const remaining = list.__drawerIntro?.remaining;
   toggle.querySelector('span').textContent = remaining != null
     ? (globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_countdown_seconds', [String(remaining)])
     : String(count);
   toggle.querySelector('span').hidden = count === 0;
   toggle.setAttribute('aria-expanded', String(!drawer.hidden));
   toggle.setAttribute('aria-controls', drawer.id);
   toggle.title = (globalThis.EasyReadLocale || chrome.i18n).getMessage(drawer.hidden ? 'notes_page_expand' : 'notes_page_collapse');
   toggle.setAttribute('aria-label', toggle.title);
 }
 list.classList.toggle('has-page-drawer', !drawer.hidden);
}
function attachPageDrawer(list, addButton) {
 list.__drawerIntro = { done: false, remaining: null, delay: null, clock: null };
 const observer = new globalThis.IntersectionObserver(entries => {
   if (!list.isConnected) { cancelDrawerIntro(list); observer.disconnect(); return; }
   if (entries.some(entry => entry.isIntersecting)) syncPageDrawer(list);
   else if (list.__drawerIntro.remaining !== null) { cancelDrawerIntro(list); syncPageDrawer(list, false, true); }
 });
 observer.observe(list);
 const interact = () => { list.__drawerIntro.closing?.cancel(); cancelDrawerIntro(list); syncPageDrawer(list); };
 list.addEventListener('pointerdown', interact);
 list.addEventListener('focusin', interact);
 const footer = document.createElement('div'); footer.className = 'easyread-page-note-footer';
 addButton.replaceWith(footer); footer.append(addButton);
 const toggle = createIconButton('easyread-page-note-toggle', '', '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>');
 toggle.onclick = event => {
   cancelDrawerIntro(list);
   const drawer = list.querySelector('.easyread-page-drawer');
   const opening = !list.__pageDrawerOpen;
   drawer.getAnimations().forEach(animation => animation.cancel());
   list.__pageDrawerOpen = opening;
   const animate = event.detail && !globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (opening || !animate) syncPageDrawer(list, opening);
   if (animate && !opening) {
     const frames = [{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }];
     const animation = drawer.animate(opening ? frames : frames.reverse(), { duration: opening ? 200 : 140, easing: 'cubic-bezier(.32,.72,0,1)' });
     animation.onfinish = () => syncPageDrawer(list, list.__pageDrawerOpen);
   }
 };
 footer.append(toggle); syncPageDrawer(list);
}
globalThis.EasyReadAnnotationView = { createIconButton, attachPageDrawer, syncPageDrawer, render(list, annotations, onEdit, onRemove, onLocate) {
 const signature = JSON.stringify([(globalThis.EasyReadLocale || chrome.i18n).getUILanguage(), annotations]);
 if (list.__notesSignature === signature && !list.querySelector('textarea')) return;
 list.__notesSignature = signature;
 const fragment = document.createDocumentFragment();
 list.classList.toggle('is-empty', annotations.length === 0);
    if (annotations.length === 0) {
        const empty = document.createElement("div");
        empty.className = "easyread-annotation-empty";
        empty.innerHTML = `
          <div class="easyread-annotation-empty-visual" aria-hidden="true">
            <span class="easyread-annotation-empty-sheet"></span>
            <span class="easyread-annotation-empty-line easyread-annotation-empty-line-long"></span>
            <span class="easyread-annotation-empty-line easyread-annotation-empty-line-short"></span>
            <span class="easyread-annotation-empty-mark"></span>
          </div>
          <strong>${(globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_empty_title")}</strong>
          <p>${(globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_empty_description")}</p>`;
        fragment.appendChild(empty);
    }
    for (const [index, annotation] of annotations.entries()) {
        const item = document.createElement("article");
        item.className = "easyread-annotation-item" + (annotation.scope === 'page' ? ' easyread-page-note' : '');
        item.dataset.noteId = String(annotation.id);
        const number = document.createElement("span");
        number.className = "easyread-annotation-number";
        number.textContent = annotation.scope === 'page' ? '' : String(index + 1);
        if (annotation.scope === 'page') number.hidden = true;
        const meta = document.createElement("div");
        meta.className = "easyread-annotation-meta";
        meta.textContent = `${annotation.author || (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_author_anonymous")} · ${formatAnnotationDate(annotation.createDateTime)}`;
        const editButton = createIconButton(
            "easyread-annotation-edit",
            (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_action_edit"),
            `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg>`
        );
        const removeButton = createIconButton(
            "easyread-annotation-remove",
            (globalThis.EasyReadLocale || chrome.i18n).getMessage("annotation_action_remove"),
            `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="m9 7 1-3h4l1 3"></path><path d="m7 7 1 13h8l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>`
        );
        const itemActions = document.createElement("div");
        itemActions.className = "easyread-annotation-item-actions";
        if (annotation.scope !== 'page' && onLocate) {
            const locate = createIconButton('easyread-annotation-locate',
                (globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_locate'),
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7"></path></svg>');
            locate.addEventListener('click', async event => {
                locate.disabled = true;
                item.querySelector('.easyread-note-locate-status')?.remove();
                try { await onLocate(annotation.id, event.detail !== 0); }
                catch (error) {
                    const status = document.createElement('small');
                    status.className = 'easyread-note-unlocated easyread-note-locate-status';
                    status.setAttribute('role', 'status');
                    status.textContent = error.message;
                    item.append(status);
                } finally { locate.disabled = false; }
            });
            itemActions.append(locate);
        }
        itemActions.append(editButton, removeButton);
        const metaRow = document.createElement("div");
        metaRow.className = "easyread-annotation-meta-row";
        metaRow.append(meta, itemActions);
        const quote = document.createElement("div");
        quote.className = "easyread-annotation-quote";
        quote.textContent = annotation.scope === 'page' ? (globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_page') : annotation.quote;
        if (annotation.scope !== 'page' && annotation.anchored === false) {
            const missing = document.createElement('small');
            missing.className = 'easyread-note-unlocated';
            missing.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_unlocated');
            quote.append(missing);
        }
        const comment = document.createElement("div");
        comment.className = "easyread-annotation-comment";
        comment.textContent = annotation.comment || '';
        if (!annotation.comment) {
            const addThought = document.createElement('button');
            addThought.className = 'easyread-note-add-thought';
            addThought.textContent = (globalThis.EasyReadLocale || chrome.i18n).getMessage('notes_add_thought');
            addThought.onclick = () => editButton.click();
            comment.append(addThought);
        }
        editButton.addEventListener("click", () => onEdit(item, annotation, comment, editButton));
        removeButton.addEventListener("click", () => onRemove(annotation.id));
        const content = document.createElement("div");
        content.className = "easyread-annotation-content";
        content.append(metaRow, quote, comment);
        if (annotation.scope !== "page") item.append(number);
        item.append(content);
        fragment.appendChild(item);
    }
 list.replaceChildren(fragment);
 list.__notesLoaded = true;
 syncPageDrawer(list);
} };
})();
