(() => {
  "use strict";

  const RESOURCE_ATTRIBUTES = [
    ["img", "src"], ["input[type='image']", "src"], ["video", "poster"],
    ["object", "data"], ["embed", "src"], ["image", "href"], ["use", "href"],
    ["feImage", "href"], ["link[rel~='icon']", "href"], ["body[background]", "background"],
    ["table[background]", "background"], ["td[background]", "background"], ["th[background]", "background"]
  ];

  function absoluteUrl(value, baseUrl) {
    if (!value || /^(data:|blob:|about:|#)/i.test(value)) return value;
    try { return new URL(value, baseUrl).href; } catch { return value; }
  }

  function doctypeText(doc) {
    const type = doc.doctype;
    if (!type) return "<!doctype html>";
    let result = `<!DOCTYPE ${type.name}`;
    if (type.publicId) result += ` PUBLIC "${type.publicId}"`;
    if (type.systemId) result += `${type.publicId ? "" : " SYSTEM"} "${type.systemId}"`;
    return `${result}>`;
  }

  function snapshotRoots(root) {
    const roots = [root];
    for (let index = 0; index < roots.length; index += 1) {
      for (const template of roots[index].querySelectorAll?.("template[shadowrootmode]") || []) roots.push(template.content);
    }
    return roots;
  }

  function querySnapshot(root, selector) {
    return snapshotRoots(root).flatMap((entry) => [...(entry.querySelectorAll?.(selector) || [])]);
  }

  function sanitizeRoot(root) {
    querySnapshot(root, "script, noscript, [data-easyread-ui='true'], meta[http-equiv='Content-Security-Policy'], meta[http-equiv='content-security-policy'], meta[http-equiv='refresh'], base, link[rel~='preload'], link[rel~='modulepreload'], link[rel~='prefetch']").forEach((element) => element.remove());
    querySnapshot(root, "[integrity], [nonce], [crossorigin]").forEach((element) => {
      element.removeAttribute("integrity");
      element.removeAttribute("nonce");
      element.removeAttribute("crossorigin");
    });
    querySnapshot(root, "video[src], audio[src]").forEach((element) => element.removeAttribute("src"));
    querySnapshot(root, "video source, audio source, video track, audio track").forEach((element) => element.remove());
  }

  function cloneLiveDocument(doc) {
    let closedShadowRoots = [];
    const receiveClosedRoots = (event) => {
      try { closedShadowRoots = JSON.parse(event.detail || "[]"); } catch { closedShadowRoots = []; }
    };
    doc.addEventListener("easyread-snapshot-closed-shadow-response", receiveClosedRoots, { once: true });
    doc.dispatchEvent(new CustomEvent("easyread-snapshot-closed-shadow-request"));
    const clone = doc.documentElement.cloneNode(true);
    const sourceAllElements = [...doc.querySelectorAll("*")];
    const targetAllElements = [clone, ...clone.querySelectorAll("*")];
    function copyShadow(source, target) {
      if (!source.shadowRoot) return;
      const template = doc.createElement("template");
      template.setAttribute("shadowrootmode", "open");
      for (const child of source.shadowRoot.childNodes) template.content.append(child.cloneNode(true));
      const originals = source.shadowRoot.querySelectorAll("*");
      const copies = template.content.querySelectorAll("*");
      originals.forEach((child, index) => copyShadow(child, copies[index]));
      const css = [...(source.shadowRoot.adoptedStyleSheets || [])].flatMap((sheet) => {
        try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
      }).join("\n");
      if (css) {
        const style = doc.createElement("style");
        style.textContent = css;
        template.content.prepend(style);
      }
      target.prepend(template);
    }
    sourceAllElements.forEach((source, index) => {
      if (!source.shadowRoot || !targetAllElements[index]) return;
      copyShadow(source, targetAllElements[index]);
    });
    closedShadowRoots.forEach((snapshot) => {
      const host = targetAllElements[snapshot.hostIndex];
      if (!host || host.querySelector(":scope > template[shadowrootmode]")) return;
      const template = doc.createElement("template");
      template.setAttribute("shadowrootmode", "open");
      template.innerHTML = `${snapshot.adoptedCss ? `<style>${snapshot.adoptedCss}</style>` : ""}${snapshot.html}`;
      host.prepend(template);
    });
    const documentAdoptedCss = [...(doc.adoptedStyleSheets || [])].flatMap((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
    }).join("\n");
    if (documentAdoptedCss) {
      const style = doc.createElement("style");
      style.textContent = documentAdoptedCss;
      clone.querySelector("head")?.appendChild(style);
    }
    sanitizeRoot(clone);
    const sourceControls = doc.querySelectorAll("input, textarea, select, option, details, dialog");
    const targetControls = clone.querySelectorAll("input, textarea, select, option, details, dialog");
    sourceControls.forEach((source, index) => {
      const target = targetControls[index];
      if (!target) return;
      if (source.localName === "textarea") target.textContent = source.value;
      if (source.localName === "input" && source.type !== "password") target.setAttribute("value", source.value);
      for (const state of ["checked", "selected", "open"]) target.toggleAttribute(state, Boolean(source[state]));
    });
    const sourceImages = doc.querySelectorAll("img");
    const targetImages = clone.querySelectorAll("img");
    sourceImages.forEach((source, index) => {
      if (source.currentSrc) targetImages[index]?.setAttribute("src", source.currentSrc);
      targetImages[index]?.removeAttribute("srcset");
      targetImages[index]?.removeAttribute("sizes");
    });
    const sourceCanvases = doc.querySelectorAll("canvas");
    const targetCanvases = clone.querySelectorAll("canvas");
    sourceCanvases.forEach((source, index) => {
      try {
        const image = doc.createElement("img");
        for (const attribute of targetCanvases[index]?.attributes || []) image.setAttribute(attribute.name, attribute.value);
        image.src = source.toDataURL("image/png");
        image.setAttribute("data-easyread-canvas-snapshot", "true");
        targetCanvases[index]?.replaceWith(image);
      } catch { /* Cross-origin canvas pixels cannot be captured. */ }
    });
    return clone;
  }

  async function replaceAsync(value, expression, replacer) {
    const matches = [...value.matchAll(expression)];
    if (!matches.length) return value;
    const replacements = await Promise.all(matches.map((match) => replacer(...match)));
    let result = "";
    let cursor = 0;
    matches.forEach((match, index) => {
      result += value.slice(cursor, match.index) + replacements[index];
      cursor = match.index + match[0].length;
    });
    return result + value.slice(cursor);
  }

  function groupDuplicateCssImages(root, nextResourceId) {
    const cssTargets = [
      ...[...(root.querySelectorAll?.("style") || [])].map((element) => ({
        get value() { return element.textContent || ""; },
        set value(value) { element.textContent = value; }
      })),
      ...[...(root.querySelectorAll?.("[style]") || [])].map((element) => ({
        get value() { return element.getAttribute("style") || ""; },
        set value(value) { element.setAttribute("style", value); }
      }))
    ];
    const imageExpression = /url\(\s*(["']?)(data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+)\1\s*\)/gi;
    const occurrences = new Map();
    cssTargets.forEach((target) => {
      for (const match of target.value.matchAll(imageExpression)) {
        const dataUrl = match[2];
        if (!occurrences.has(dataUrl)) occurrences.set(dataUrl, []);
        occurrences.get(dataUrl).push(target);
      }
    });
    const duplicates = [...occurrences].filter(([, targets]) => targets.length > 1);
    if (!duplicates.length) return;
    const declarations = [];
    duplicates.forEach(([dataUrl]) => {
      const property = `--easyread-snapshot-resource-${nextResourceId()}`;
      declarations.push(`${property}:url("${dataUrl}")`);
      cssTargets.forEach((target) => {
        target.value = target.value.replace(imageExpression, (whole, _quote, candidate) => candidate === dataUrl ? `var(${property})` : whole);
      });
    });
    const definitions = document.createElement("style");
    definitions.setAttribute("data-easyread-snapshot-resources", "true");
    const isDocumentRoot = root.localName === "html";
    definitions.textContent = `${isDocumentRoot ? ":root" : ":host"}{${declarations.join(";")}}`;
    if (isDocumentRoot) (root.querySelector(":scope > head") || root).append(definitions);
    else root.prepend(definitions);
  }

  class SnapshotEngine {
    constructor({ progress = () => {} } = {}) {
      this.progress = progress;
      this.binaryCache = new Map();
      this.textCache = new Map();
      this.failures = [];
      this.processedResources = 0;
      this.resourceId = 0;
    }

    async fetchResource(url, { asText = false, referrer = location.href } = {}) {
      const cache = asText ? this.textCache : this.binaryCache;
      if (cache.has(url)) return cache.get(url);
      const promise = (url.startsWith("blob:") ? fetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const contentType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0];
        if (asText) return { ok: true, url, contentType, text: await response.text() };
        const blob = await response.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return { ok: true, url, contentType, dataUrl };
      }) : chrome.runtime.sendMessage({ command: "snapshotFetchResource", url, asText, referrer })).then((result) => {
        if (!result?.ok) throw new Error(result?.error || "resource fetch failed");
        return result;
      }).catch((error) => {
        globalThis.EasyReadDiagnostics?.record(error, { operation: "snapshot-resource", url }, false);
        this.failures.push({ url, reason: error.message });
        return null;
      });
      cache.set(url, promise);
      return promise;
    }

    async processCss(cssText, stylesheetUrl, importStack = new Set()) {
      let css = String(cssText || "");
      css = await replaceAsync(css, /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?([^;]*);/gi, async (whole, importUrl, media) => {
        const url = absoluteUrl(importUrl, stylesheetUrl);
        if (importStack.has(url)) return "";
        const response = await this.fetchResource(url, { asText: true, referrer: stylesheetUrl });
        if (!response) return whole;
        const nextStack = new Set(importStack);
        nextStack.add(url);
        const imported = await this.processCss(response.text, response.url || url, nextStack);
        return media?.trim() ? `@media ${media.trim()}{${imported}}` : imported;
      });
      // Consume the entire quoted URL before deciding whether to inline it.
      // A data SVG may itself contain url(%23noise); that is SVG content, not CSS.
      css = await replaceAsync(css, /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^\s)'"\\])+))\s*\)/gi, async (whole, doubleQuoted, singleQuoted, unquoted) => {
        const resourceValue = doubleQuoted ?? singleQuoted ?? unquoted;
        if (/^(data:|#)/i.test(resourceValue.trim())) return whole;
        // Some bundled styles encode an SVG fragment as an asset path (%23noise).
        // Repair only references backed by a real local SVG definition; an actual
        // filename containing an encoded hash must still be fetched normally.
        const encodedFragment = resourceValue.trim().match(/(?:^|\/)%23([^/?#]+)$/i);
        if (encodedFragment) {
          let id;
          try { id = decodeURIComponent(encodedFragment[1]); } catch { /* Keep malformed resource URLs unchanged. */ }
          const definition = id && document.getElementById(id);
          if (definition?.namespaceURI === "http://www.w3.org/2000/svg" &&
            /^(filter|clipPath|mask|linearGradient|radialGradient|pattern|marker|symbol)$/.test(definition.localName)) {
            return `url("#${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
          }
        }
        const url = absoluteUrl(resourceValue.trim(), stylesheetUrl);
        if (!/^(https?:|blob:)/i.test(url)) return whole;
        const response = await this.fetchResource(url, { referrer: stylesheetUrl });
        this.processedResources += 1;
        this.progress(Math.min(84, 35 + this.processedResources), chrome.i18n.getMessage("capture_stage_resource_url", [this.processedResources]));
        return response?.dataUrl ? `url("${response.dataUrl}")` : `url("${url}")`;
      });
      return css.replace(/@charset\s+[^;]+;/gi, "");
    }

    async inlineStyles(clone, pageUrl) {
      const links = querySnapshot(clone, "link[rel~='stylesheet'][href]");
      for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        const url = absoluteUrl(link.getAttribute("href"), pageUrl);
        this.progress(24 + Math.round((index + 1) / Math.max(links.length, 1) * 10), chrome.i18n.getMessage("capture_stage_stylesheet", [index + 1, links.length]));
        const response = await this.fetchResource(url, { asText: true, referrer: pageUrl });
        if (!response) { link.setAttribute("href", url); continue; }
        const style = document.createElement("style");
        style.textContent = await this.processCss(response.text, response.url || url);
        if (link.media) style.media = link.media;
        link.replaceWith(style);
      }
      const styles = querySnapshot(clone, "style");
      for (const style of styles) style.textContent = await this.processCss(style.textContent, pageUrl);
      const inlineStyles = querySnapshot(clone, "[style]");
      for (const element of inlineStyles) element.setAttribute("style", await this.processCss(element.getAttribute("style"), pageUrl));
    }

    async inlineAttributes(clone, pageUrl) {
      const targets = RESOURCE_ATTRIBUTES.flatMap(([selector, attribute]) => querySnapshot(clone, `${selector}[${attribute}]`).map((element) => ({ element, attribute })));
      for (let index = 0; index < targets.length; index += 1) {
        const { element, attribute } = targets[index];
        const value = element.getAttribute(attribute);
        const url = absoluteUrl(value, pageUrl);
        if (!/^(https?:|blob:)/i.test(url)) continue;
        const response = await this.fetchResource(url, { referrer: pageUrl });
        if (response?.dataUrl) element.setAttribute(attribute, response.dataUrl);
        else element.setAttribute(attribute, url);
        if (index % 5 === 0) this.progress(50 + Math.round((index + 1) / Math.max(targets.length, 1) * 30), chrome.i18n.getMessage("capture_stage_resources", [index + 1, targets.length]));
      }
      querySnapshot(clone, "a[href], area[href]").forEach((element) => element.setAttribute("href", absoluteUrl(element.getAttribute("href"), pageUrl)));
      querySnapshot(clone, "form[action]").forEach((element) => element.setAttribute("action", absoluteUrl(element.getAttribute("action"), pageUrl)));
      querySnapshot(clone, "[srcset]").forEach((element) => element.removeAttribute("srcset"));
    }

    async processRoot(root, pageUrl) {
      sanitizeRoot(root);
      await this.inlineStyles(root, pageUrl);
      await this.inlineAttributes(root, pageUrl);
      snapshotRoots(root).forEach((boundary) => groupDuplicateCssImages(boundary, () => this.resourceId += 1));
    }

    async inlineFrames(clone, frames, parentFrameId = 0, pageUrl = location.href) {
      this.progress(16, chrome.i18n.getMessage("capture_stage_frames"));
      const children = frames.filter((frame) => frame.parentFrameId === parentFrameId && frame.html);
      const used = new Set();
      for (const iframe of querySnapshot(clone, "iframe, frame")) {
        const sourceUrl = absoluteUrl(iframe.getAttribute("src"), pageUrl);
        const match = children.find((frame) => !used.has(frame.frameId) && frame.url === sourceUrl) || children.find((frame) => !used.has(frame.frameId));
        if (!match) continue;
        used.add(match.frameId);
        const frameDocument = new DOMParser().parseFromString(match.html, "text/html");
        const frameRoot = frameDocument.documentElement;
        await this.processRoot(frameRoot, match.url);
        await this.inlineFrames(frameRoot, frames, match.frameId, match.url);
        iframe.setAttribute("srcdoc", `${doctypeText(frameDocument)}${frameRoot.outerHTML}`);
        iframe.removeAttribute("src");
      }
    }

    async collectTabs() {
      const groups = [];
      const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
      const scroll = { x: window.scrollX, y: window.scrollY };
      const focus = document.activeElement;
      try {
        for (const list of document.querySelectorAll('[role="tablist"]')) {
          if (list.closest('[data-easyread-ui], [role="tabpanel"]')) continue;
          const tabs = [...list.querySelectorAll('[role="tab"]')].filter(tab => tab.closest('[role="tablist"]') === list);
          const original = tabs.find(tab => tab.getAttribute("aria-selected") === "true");
          // Only explicitly linked, in-page tabs. Never click navigation links or form submitters.
          if (!original || tabs.length < 2 || tabs.length > 30 || tabs.some(tab =>
            tab.localName !== "button" || (tab.closest("form") && tab.type !== "button") ||
            !tab.getAttribute("aria-controls") || /\s/.test(tab.getAttribute("aria-controls")))) continue;
          const panels = [];
          try {
            for (const initialTab of tabs) {
              const tab = (initialTab.id && document.getElementById(initialTab.id)) || initialTab;
              const title = tab.textContent.trim();
              const id = tab.getAttribute("aria-controls");
              this.progress(11, chrome.i18n.getMessage("capture_stage_tab", [String(panels.length + 1), String(tabs.length), title]));
              try {
                if (!tab.isConnected || tab.disabled || tab.getAttribute("aria-disabled") === "true") throw new Error("Tab is unavailable");
                tab.click();
                let panel;
                let previous = "";
                let stable = 0;
                for (let attempt = 0; attempt < 24; attempt += 1) {
                  await pause(125);
                  panel = document.getElementById(id);
                  const content = panel?.innerHTML || "";
                  if (content && content === previous && tab.getAttribute("aria-selected") === "true" &&
                    !panel.hidden && panel.getAttribute("aria-busy") !== "true") stable += 1;
                  else stable = 0;
                  previous = content;
                  if (stable >= 3) break;
                }
                if (!panel || stable < 3) throw new Error("Tab content did not become ready");
                panel.scrollIntoView({ block: "nearest", behavior: "instant" });
                const images = [...panel.querySelectorAll("img")].map(image => ({ image, loading: image.getAttribute("loading") }));
                try {
                  images.forEach(({ image }) => { image.loading = "eager"; });
                  await Promise.race([
                    Promise.all(images.map(({ image }) => image.decode?.().catch(() => {}))),
                    pause(2500)
                  ]);
                } finally {
                  images.forEach(({ image, loading }) => { if (loading === null) image.removeAttribute("loading"); else image.setAttribute("loading", loading); });
                }
                const snapshot = cloneLiveDocument(document);
                const copy = [...snapshot.querySelectorAll('[id]')].find(element => element.id === id);
                if (!copy) throw new Error("Tab content disappeared during capture");
                const navigation = [...snapshot.querySelectorAll('[role="tablist"]')].find(candidate =>
                  [...candidate.querySelectorAll('[role="tab"]')].some(button => button.getAttribute("aria-controls") === id));
                let region = navigation?.parentElement;
                while (region && !region.contains(copy)) region = region.parentElement;
                if (region && (region.matches("html, body, main, article") || region.querySelectorAll('[role="tablist"]').length !== 1)) region = null;
                // Keep the actual selected-state classes and the layout wrappers,
                // not a reconstructed text heading or a guessed selected style.
                panels.push({ title, id, copy, navigation, region });
              } catch (error) {
                this.failures.push({ url: location.href, reason: `Tab ${title}: ${error.message}` });
                globalThis.EasyReadDiagnostics?.record(error, { operation: "snapshot-tab", title, id }, false);
                panels.push({ title, id, copy: null });
              }
            }
          } finally {
            const restore = (original.id && document.getElementById(original.id)) || original;
            if (restore.isConnected) {
              restore.click();
              for (let attempt = 0; attempt < 24; attempt += 1) {
                await pause(125);
                const restoredPanel = document.getElementById(restore.getAttribute("aria-controls"));
                if (restoredPanel && restoredPanel.getAttribute("aria-busy") !== "true" && restoredPanel.innerHTML) break;
              }
            }
          }
          groups.push({ panelIds: tabs.map(tab => tab.getAttribute("aria-controls")), panels });
        }
      } finally {
        if (focus?.isConnected) focus.focus({ preventScroll: true });
        window.scrollTo({ left: scroll.x, top: scroll.y, behavior: "instant" });
      }
      return groups;
    }

    expandTabs(clone, groups) {
      for (const group of groups) {
        const targets = [...clone.querySelectorAll('[id]')].filter(element => group.panelIds.includes(element.id));
        const matchingList = [...clone.querySelectorAll('[role="tablist"]')].find(list => {
          const ids = [...list.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute("aria-controls"));
          return ids.length === group.panelIds.length && ids.every((id, index) => id === group.panelIds[index]);
        });
        if (!targets.length && !matchingList) continue;
        let originalRegion = matchingList?.parentElement;
        while (originalRegion && !targets.every(target => originalRegion.contains(target))) originalRegion = originalRegion.parentElement;
        const preserveRegion = targets.length && originalRegion && !originalRegion.matches("html, body, main, article") &&
          originalRegion.querySelectorAll('[role="tablist"]').length === 1 && group.panels.every(panel => panel.region);
        const expanded = document.createElement("div");
        expanded.setAttribute("data-easyread-expanded-tabs", "true");
        expanded.style.cssText = "display:block!important;height:auto!important;max-height:none!important;overflow:visible!important";
        const usedIds = new Set();
        group.panels.forEach(({ title, copy, navigation, region }, index) => {
          const section = document.createElement("section");
          section.style.cssText = "display:block!important;margin:24px 0!important;break-inside:avoid";
          section.setAttribute("aria-label", title);
          navigation?.setAttribute("inert", "");
          if (preserveRegion) {
            // Remove inactive, pre-rendered panels while retaining the selected
            // panel and its original grid/container geometry.
            for (const other of [...region.querySelectorAll('[id]')]) {
              if (other !== copy && group.panelIds.includes(other.id)) other.remove();
            }
            section.append(region);
          } else if (navigation) section.append(navigation);
          if (copy) {
            if (usedIds.has(copy.id)) copy.id = `${copy.id}-easyread-expanded-${index + 1}`;
            usedIds.add(copy.id);
            for (const attribute of ["hidden", "inert", "aria-hidden", "aria-labelledby", "role"]) copy.removeAttribute(attribute);
            for (const [property, value] of Object.entries({ display: "block", visibility: "visible", opacity: "1", position: "relative", height: "auto", "max-height": "none", overflow: "visible", transform: "none" })) copy.style.setProperty(property, value, "important");
            if (!preserveRegion) section.append(copy);
          } else {
            const warning = document.createElement("p");
            warning.textContent = chrome.i18n.getMessage("capture_tab_unavailable");
            section.append(warning);
          }
          expanded.append(section);
        });
        if (preserveRegion) originalRegion.replaceWith(expanded);
        else {
          if (targets.length) targets[0].before(expanded); else matchingList.after(expanded);
          targets.forEach(target => target.remove());
          matchingList?.remove();
        }
      }
    }

    async capture() {
      this.progress(10, chrome.i18n.getMessage("capture_stage_document"));
      const tabGroups = await this.collectTabs();
      const clone = cloneLiveDocument(document);
      this.expandTabs(clone, tabGroups);
      const frameResult = await chrome.runtime.sendMessage({ command: "snapshotCollectFrames" });
      const frames = frameResult?.ok ? frameResult.frames : [];
      if (!frameResult?.ok) this.failures.push({ url: location.href, reason: frameResult?.error || "frame collection failed" });
      await this.processRoot(clone, location.href);
      await this.inlineFrames(clone, frames);
      const generator = document.createElement("meta");
      generator.name = "generator";
      generator.content = "EasyRead Snapshot Engine 2.0";
      clone.querySelector("head")?.appendChild(generator);
      this.progress(90, chrome.i18n.getMessage("capture_stage_packaging"));
      const content = `${doctypeText(document)}\n${clone.outerHTML}`;
      return {
        blob: new Blob([content], { type: "text/html;charset=utf-8" }),
        integrity: this.failures.length ? "partial" : "complete",
        details: { failedResources: this.failures.slice(0, 100), failedResourceCount: this.failures.length, embeddedResourceCount: this.processedResources }
      };
    }
  }

  globalThis.EasyReadSnapshotEngine = SnapshotEngine;
})();
