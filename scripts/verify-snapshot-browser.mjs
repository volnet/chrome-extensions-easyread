import { createServer } from "node:http";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { URL } from "node:url";

const engine = readFileSync(new URL("../src/scripts/snapshotEngine.js", import.meta.url), "utf8");
const background = readFileSync(new URL("../src/scripts/background.js", import.meta.url), "utf8");
const section = background.slice(background.indexOf('message?.command === "snapshotCollectFrames"'));
const frameFunction = section.slice(section.indexOf("func: () => {") + 6, section.indexOf("\n    }, async (results)"));
const fixture = `<!doctype html><html><head><title>Shadow regression</title></head><body>
<script>window.chrome = { i18n: { getMessage: key => key }, runtime: { sendMessage: async () => ({ok:true,frames:[]}) } };</script>
<div id="before">before</div><div id="host"></div><div id="after">after</div><div id="closed"></div>
<script src="/engine.js"></script><script src="/frame.js"></script><script>
(async () => {
  try {
    const root = document.querySelector('#host').attachShadow({mode:'open'});
    root.innerHTML = '<p>outer text</p><div id="nested"></div>';
    const sheet = new CSSStyleSheet(); sheet.replaceSync('p { color: red; }'); root.adoptedStyleSheets = [sheet];
    root.querySelector('#nested').attachShadow({mode:'open'}).innerHTML = '<b>nested text</b>';
    document.querySelector('#closed').attachShadow({mode:'closed'}).innerHTML = 'closed text';
    const tabs = document.createElement('div');
    tabs.innerHTML = '<div role="tablist">' + [1,2,3,4,5].map(n => '<button type="button" role="tab" aria-selected="' + (n===3) + '" aria-controls="panel-' + n + '">Tab ' + n + '</button>').join('') + '</div><div id="slot"><div role="tabpanel" id="panel-3">Content 3</div></div>';
    document.body.append(tabs);
    tabs.querySelector('[role="tablist"]').style.cssText = 'border:1px solid #ddd;border-radius:999px';
    tabs.querySelectorAll('button').forEach((button,index) => button.onclick = () => {
      tabs.querySelectorAll('button').forEach(other => other.setAttribute('aria-selected', String(other===button)));
      tabs.querySelector('#slot').innerHTML = '<div role="tabpanel" id="panel-' + (index+1) + '" aria-busy="true"></div>';
      setTimeout(() => { tabs.querySelector('#slot').innerHTML = '<div role="tabpanel" id="panel-' + (index+1) + '">Content ' + (index+1) + '</div>'; }, 60);
    });
    document.addEventListener('easyread-snapshot-closed-shadow-request', () => document.dispatchEvent(new CustomEvent('easyread-snapshot-closed-shadow-response', { detail: JSON.stringify([{hostIndex: [...document.querySelectorAll('*')].indexOf(document.querySelector('#closed')), html:'closed text'}]) })));
    const result = await new EasyReadSnapshotEngine().capture();
    const html = await result.blob.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const savedTabs = [...parsed.querySelectorAll('[data-easyread-expanded-tabs] > section')];
    const savedTabBar = parsed.querySelector('[role="tablist"]');
    if (!savedTabBar?.hasAttribute('inert') || savedTabBar.style.borderRadius !== '999px' || savedTabBar.querySelectorAll('button').length !== 5) throw new Error('original tab bar styling lost');
    if (savedTabs.length !== 5 || savedTabs.some((section,index) => !section.textContent.includes('Content ' + (index+1)))) throw new Error('dynamic tab content/order lost');
    if (savedTabs.some((section,index) => section.querySelector('[role="tablist"] [aria-selected="true"]')?.textContent !== 'Tab ' + (index+1))) throw new Error('per-section selected tab lost');
    if (savedTabs.some(section => section.querySelector('h3'))) throw new Error('unexpected synthetic heading');
    if (parsed.querySelectorAll('[role="tablist"]').length !== 5) throw new Error('extra standalone tab bar');
    if (tabs.querySelector('[aria-selected="true"]').textContent !== 'Tab 3' || !tabs.querySelector('#panel-3')) throw new Error('original tab not restored');
    const template = parsed.querySelector('#host > template');
    if (!template?.content.querySelector('#nested > template')?.content.textContent.includes('nested text')) throw new Error('nested shadow lost');
    if (!template.content.querySelector('style')?.textContent.includes('color: red')) throw new Error('adopted CSS lost');
    if (parsed.querySelector('#after > template') || !parsed.querySelector('#closed > template')?.content.textContent.includes('closed text')) throw new Error('host alignment wrong');
    const frame = new DOMParser().parseFromString(collectFrame().html, 'text/html');
    if (!frame.querySelector('#host > template')?.content.querySelector('#nested > template')?.content.textContent.includes('nested text')) throw new Error('frame shadow lost');
    document.body.textContent = 'PASS: main and frame nested shadows, adopted CSS, closed host alignment';
  } catch(error) { document.body.textContent = 'FAIL: ' + error.stack; }
})();</script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url.endsWith(".js") ? "text/javascript" : "text/html");
  response.end(request.url === "/engine.js" ? engine : request.url === "/frame.js" ? `window.collectFrame = ${frameFunction};` : fixture);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const profile = mkdtempSync(join(tmpdir(), "easyread-shadow-check-"));
  const browser = process.env.EASYREAD_TEST_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const { stdout } = await promisify(execFile)(browser, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, "--dump-dom", "--virtual-time-budget=15000", `http://127.0.0.1:${server.address().port}`], { timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.match(stdout, /PASS: main and frame/);
  assert.doesNotMatch(stdout, /FAIL:/);
  console.log("Chrome snapshot regression passed: nested roots, adopted styles, host alignment, iframe path, five dynamic tabs in order and original selection restored.");
} finally { server.close(); }
