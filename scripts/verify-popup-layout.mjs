// Exercise the actual MV3 action popup, including the browser's automatic sizing.
/* global chrome */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';

const { chromium } = await import(pathToFileURL(process.env.EASYREAD_PLAYWRIGHT || 'C:/Users/gongcen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const build = process.env.EASYREAD_TEST_BUILD || 'development';
assert.ok(['development', 'production'].includes(build));
const locale = process.env.EASYREAD_UI_LOCALE || 'zh-CN';
const extension = resolve('dist', build);
const screenshots = resolve('output/popup-layout', build, locale);
mkdirSync(screenshots, { recursive: true });
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'easyread-popup-layout-')), {
  executablePath: process.env.EASYREAD_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, viewport: null, locale,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run', '--window-size=1200,900', `--lang=${locale}`]
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.action.openPopup());
  const browserSession = await context.browser().newBrowserCDPSession();
  const targets = await browserSession.send('Target.getTargets');
  const target = targets.targetInfos.find(item => item.url.endsWith('/popup/popup.html'));
  assert.ok(target, 'chrome.action.openPopup must create a real popup target');
  // Action popups are deliberately not exposed as Playwright Pages. Attach to
  // their real target without overriding viewport size or tab lookup.
  const { sessionId } = await browserSession.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  const pending = new Map();
  let sequence = 0;
  browserSession.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Popup protocol timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    browserSession.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
      clearTimeout(timer); pending.delete(id); reject(error);
    });
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const measure = `JSON.stringify({viewport:[innerWidth,innerHeight],body:[document.body.offsetWidth,document.body.offsetHeight],root:[document.documentElement.clientWidth,document.documentElement.scrollHeight],tabs:document.querySelector('.popupTabs').getBoundingClientRect().toJSON()})`;
  await evaluate(`(async () => {
    for(let i=0;i<120 && !document.getElementById('saveHtmlTitle').textContent;i++) await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().map(animation => animation.finished));
  })()`);
  const baseline = JSON.parse(await evaluate(measure));
  const sample = async action => {
    const frames = await evaluate(`(async () => {
      const frames = [${measure}];
      ${action}
      for(let i=0;i<12;i++) {
        await new Promise(requestAnimationFrame);
        frames.push(${measure});
      }
      return frames.map(JSON.parse);
    })()`);
    for (const frame of frames) assert.deepEqual(frame, baseline, 'Popup size/header must stay stable on every frame, not just settle later');
    return frames.length;
  };
  let frameCount = 0;
  for (const id of ['tabReadLater', 'tabSavePage', 'tabMedia', 'tabAnnotations', 'tabReadLater', 'tabSavePage']) {
    frameCount += await sample(`document.getElementById('${id}').click();`);
    if (id === 'tabMedia') {
      const emptyBounds = await evaluate(`(() => {
        const panel = document.getElementById('panelMedia');
        const empty = document.getElementById('mediaEmptyState');
        return { hidden: empty.hidden, bottom: empty.getBoundingClientRect().bottom, panelBottom: panel.getBoundingClientRect().bottom };
      })()`);
      if (!emptyBounds.hidden) assert.ok(Math.abs(emptyBounds.bottom - emptyBounds.panelBottom) <= 1, 'Empty media border fills the panel down to the shared footer gap');
    }
    const screenshot = await send('Page.captureScreenshot');
    writeFileSync(join(screenshots, `${id}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  // Long progress/error feedback must scroll inside the panel, not resize the window.
  frameCount += await sample(`document.getElementById('captureTask').hidden = false;
    document.getElementById('captureTaskStage').textContent = 'Local test feedback. '.repeat(80);`);
  const scrollState = await evaluate(`(() => {
    const panel = document.getElementById('panelSavePage');
    panel.scrollTop = panel.scrollHeight;
    const button = document.querySelector('[data-capture="markdown"]');
    button.scrollIntoView({block:'nearest'});
    const rect = button.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    return {scrollable:panel.scrollHeight>panel.clientHeight, scrolled:panel.scrollTop>0,
      visible:rect.top>=bounds.top-1 && rect.bottom<=bounds.bottom+1, panelVisible:bounds.bottom<=innerHeight};
  })()`);
  assert.deepEqual(scrollState, { scrollable: true, scrolled: true, visible: true, panelVisible: true });
  frameCount += await sample(`document.getElementById('tabMedia').click(); document.getElementById('tabSavePage').click();`);
  await evaluate(`document.getElementById('tabReadLater').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  assert.equal(await evaluate(`document.getElementById('tabSavePage').getAttribute('aria-selected')`), 'true');
  frameCount += await sample('');
  console.log(`PASS actual ${build}/${locale} action popup: ${frameCount} stable frames, ${baseline.viewport.join(' × ')}, scroll access, long feedback and keyboard tabs`);
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await context.close();
}
