import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import vm from "node:vm";

test("encoded local SVG filter references are preserved without fetching a nonexistent asset", async () => {
  const requests = [];
  const context = vm.createContext({ URL, document: { getElementById: id => id === "noise" ? { namespaceURI: "http://www.w3.org/2000/svg", localName: "filter" } : null },
    chrome: { i18n: { getMessage: () => "" }, runtime: { sendMessage: async request => { requests.push(request.url); return { ok: true, dataUrl: "data:image/png;base64,AA==" }; } } } });
  vm.runInContext(readFileSync(new URL("../src/scripts/snapshotEngine.js", import.meta.url), "utf8"), context);
  const engine = new context.EasyReadSnapshotEngine();
  for (const reference of ["%23noise", "./%23noise", "/_next/static/immutable/chunks/%23noise"]) {
    assert.equal(await engine.processCss(`.x{filter:url("${reference}")}`, "https://example.com/style.css"), '.x{filter:url("#noise")}');
  }
  assert.equal(requests.length, 0);
  // The live page has no document-level filter: it belongs only to the data SVG.
  context.document.getElementById = () => null;
  const svgCss = `.hero { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3C/filter%3E%3Crect filter='url(%23noise)'/%3E%3C/svg%3E"); }`;
  assert.equal(await engine.processCss(svgCss, "https://example.com/style.css"), svgCss);
  assert.equal(requests.length, 0);
  assert.equal(await engine.processCss('.x{filter:url("#noise")}', "https://example.com/style.css"), '.x{filter:url("#noise")}');
  await engine.processCss('.x{background:url("%23photo.png")}', "https://example.com/style.css");
  assert.deepEqual(requests, ["https://example.com/%23photo.png"]);
  const mixedCss = `${svgCss}\n.photo{background:url("photo.png")}`;
  assert.equal(await engine.processCss(mixedCss, "https://example.com/style.css"), `${svgCss}\n.photo{background:url("data:image/png;base64,AA==")}`);
  assert.deepEqual(requests, ["https://example.com/%23photo.png", "https://example.com/photo.png"]);
});
