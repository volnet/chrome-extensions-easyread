import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaPlayback, mediaPreferences } from '../src/popup/mediaPlayback.mjs';
test('preview defaults to muted with autoplay off, preserving explicit unmute', () => {
  assert.deepEqual(mediaPreferences(), { mode: 'off', muted: true });
  assert.deepEqual(mediaPreferences({ mediaAutoplay: 'invalid', mediaMuted: 'true' }), { mode: 'off', muted: true });
  assert.deepEqual(mediaPreferences({ mediaMuted: false }), { mode: 'off', muted: false });
});
test('ordered preview advances once; simultaneous forces mute; leaving pauses all', async () => {
  const controller = new MediaPlayback();
  const items = Array.from({ length: 3 }, () => ({ plays: 0, pauses: 0, muted: false, play() { this.plays++; }, pause() { this.pauses++; }, mute(value) { this.muted = value; } }));
  items.forEach(item => controller.register(item));
  controller.activate(true); await Promise.resolve();
  assert.deepEqual(items.map(item => item.plays), [0, 0, 0]);
  controller.configure({ mediaAutoplay: 'sequential' }); await Promise.resolve();
  assert.deepEqual(items.map(item => item.plays), [1, 0, 0]);
  controller.ended(items[0]); controller.ended(items[0]); await Promise.resolve();
  assert.deepEqual(items.map(item => item.plays), [1, 1, 0]);
  controller.configure({ mediaAutoplay: 'simultaneous' }); await Promise.resolve();
  assert.ok(items.every(item => item.muted));
  assert.deepEqual(items.map(item => item.plays), [2, 2, 1]);
  controller.activate(false); const before = items.map(item => item.plays);
  controller.ended(items[1]); await Promise.resolve();
  assert.deepEqual(items.map(item => item.plays), before);
  controller.configure({ mediaMuted: false });
  assert.ok(items.every(item => !item.muted));
});
