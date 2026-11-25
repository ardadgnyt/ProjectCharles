'use strict';
// v1.0.0 (taskbar): what Charles does by himself waits while another program covers its screen (a
// film, a game). Taking the focus or restoring a window, flashing the taskbar button and a native toast
// can each make Windows bring the taskbar up over that program. A deliberate
// action of the user (a shortcut, a click on Charles) is never held. Whether a program is full screen
// comes from the full-screen guard in main.cjs (fullscreenOther); this module only keeps the work
// that waits and runs it when that program is left.

/**
 * Actions that wait: activate (focus, show, restore), flash, toast. (The 4 s ITaskbarList pass was
 * held too until a live run showed it never brought the taskbar up: it runs as before.)
 */
const WAITS = new Set(['activate', 'flash', 'toast', 'bubble']);
const MAX_PENDING = 100;

/** Pure: does `action` wait now? */
function waits(action, { fullscreen = false, deliberate = false } = {}) {
  return !!fullscreen && !deliberate && WAITS.has(action);
}

/**
 * v1.0.0 (taskbar): the guard's reading of one helper report (pure).
 * report: { full, pid, mon?: [left, top, right, bottom] in physical pixels } from the helper's fg channel.
 * charlesDisplays: ids of the displays that hold a visible Charles window (island, app window, Slime,
 * cards); displayOf(mon): the display id of that monitor, or null.
 * Returns null when the report says nothing about full screen (no boolean `full`): the guard keeps its
 * last state. Otherwise { front, here, known }:
 *   front  the window in front is full screen (on any display): focus, flashes and toasts wait;
 *   here   it is on a display that holds Charles: the island leaves the topmost band, cards wait;
 *   known  the helper said which monitor. An older helper does not: then `here` is `front`, as before.
 */
function decide(report, { ownPid = 0, charlesDisplays = new Set(), displayOf = () => null } = {}) {
  if (!report || typeof report.full !== 'boolean') return null;
  const front = report.full && Number(report.pid) !== ownPid;
  const m = report.mon;
  const mon = Array.isArray(m) && m.length === 4 && m.every((n) => Number.isFinite(n)) && m[2] > m[0] && m[3] > m[1] ? m : null;
  if (!front) return { front: false, here: false, known: !!mon };
  let display = null;
  try { display = mon ? displayOf(mon) : null; } catch {}
  if (display === null || display === undefined) return { front, here: true, known: false };
  return { front, here: charlesDisplays.has(display), known: true };
}

/** `fullscreen()`: the guard's state now. */
function createGate(fullscreen) {
  const pending = new Map();
  return {
    waits: (action, deliberate = false) => waits(action, { fullscreen: fullscreen(), deliberate }),
    /** Runs `fn` now, or keeps it under `key` (a newer one with the same key replaces it). */
    run(action, key, fn, { deliberate = false } = {}) {
      if (!waits(action, { fullscreen: fullscreen(), deliberate })) {
        fn();
        return true;
      }
      pending.delete(key);
      pending.set(key, fn);
      while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value);
      return false;
    },
    /** Forgets what waits under keys starting with `prefix` (it was answered meanwhile). */
    drop(prefix) {
      for (const k of [...pending.keys()]) if (k.startsWith(prefix)) pending.delete(k);
    },
    /** The full-screen program was left: what waited runs, in the order it came. */
    flush() {
      if (fullscreen()) return 0;
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) {
        try {
          fn();
        } catch {}
      }
      return fns.length;
    },
    size: () => pending.size,
    active: () => !!fullscreen(),
  };
}

module.exports = { waits, createGate, decide, WAITS };
