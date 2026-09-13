export function mediaPreferences(stored = {}) {
  return { mode: ['sequential', 'simultaneous'].includes(stored.mediaAutoplay) ? stored.mediaAutoplay : 'off', muted: stored.mediaMuted !== false };
}
export class MediaPlayback {
  constructor() { this.items = []; this.preferences = mediaPreferences(); this.active = false; this.index = 0; }
  get muted() { return this.preferences.muted || this.preferences.mode === 'simultaneous'; }
  configure(stored) { this.pause(); const next = mediaPreferences(stored); if (next.mode !== this.preferences.mode) this.index = 0; this.preferences = next; this.items.forEach(item => item.mute(this.muted)); this.start(); }
  register(item) { this.items.push(item); item.mute(this.muted); }
  reset() { this.pause(); this.items = []; this.index = 0; }
  pause() { this.items.forEach(item => item.pause()); }
  activate(active) { this.pause(); this.active = active; if (active && this.index >= this.items.length) this.index = 0; this.start(); }
  start() {
    if (!this.active || this.preferences.mode === 'off') return;
    const play = item => { if (item) Promise.resolve().then(() => { if (this.active && this.items.includes(item)) return item.play(); }).catch(() => {}); };
    if (this.preferences.mode === 'simultaneous') this.items.forEach(play);
    else play(this.items[this.index]);
  }
  ended(item) {
    if (!this.active || this.preferences.mode !== 'sequential' || this.items[this.index] !== item) return;
    this.index += 1; this.start();
  }
}
