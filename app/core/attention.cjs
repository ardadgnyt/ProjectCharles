'use strict';
// v0.9.16: asking for attention on the taskbar.
//
// The island has no taskbar button on purpose. FlashWindowEx brings one back anyway, and the
// regular offTaskbar() pass removes it a few seconds later, so every approval, reminder or offer
// made the taskbar blink by itself while the user worked in the panel. The island shows these
// things itself (it opens, a card appears), so only the app window, which really has a button
// and is not in front, flashes. One event flashes once.
const REPEAT = 60000;

function createAttention(appWindow, now = Date.now) {
  const seen = new Map();
  return {
    /** `key`: the event; → true when the taskbar was asked. */
    ask(key) {
      const w = appWindow();
      if (!w || w.isDestroyed?.() || w.isFocused()) return false;
      const t = now();
      for (const [k, at] of seen) if (t - at > REPEAT) seen.delete(k);
      if (seen.has(key)) return false;
      seen.set(key, t);
      w.flashFrame(true);
      return true;
    },
    clear() {
      const w = appWindow();
      if (w && !w.isDestroyed?.()) w.flashFrame(false);
    },
  };
}

module.exports = { createAttention };