// v0.9.9: the chat follows a running answer only while you are at its end. Scroll up to read an
// earlier part and it stays where you are; scroll back down (or send a message) and it follows
// again. Each streamed piece used to pull the list to the bottom.
//
// v0.9.27: one owner for where the chat is. Until now three places kept a number of their own (this
// file a distance from the end, panel-motion.ts a raw scrollTop, workspace.ts another distance) and
// each put it back at its own moment. Docking the island left or right sent only "layout done", so
// panel-motion restored a scrollTop it had read long before; the app window forced the end every
// time it showed the chat; and a list that had been hidden reported scrollTop 0 as if the reader had
// gone there. The reader lost their place, often to the very top.
//
// What is remembered now is what the reader sees: the first message on screen and how far into it
// the top edge is. A width change wraps the text differently, so a pixel count means another place;
// the message is the same one. "At the end" is kept apart from that and always wins.
const NEAR = 80;
/** How long after the reader's last wheel, key or press a jump to the top can be theirs. */
const INPUT_MS = 700;
/** While the list is moved between layouts nothing is recorded; this is the longest that may take. */
const HOLD_MS = 3000;
/** How long after a move the place is kept true while row heights settle. */
const SETTLE_MS = 500;

type State = {
  pinned: boolean;
  /** the first message on screen and the part of it above the top edge (0 … 1) */
  node: HTMLElement | null;
  ratio: number;
  /** fallback when that message is gone: the distance from the end */
  gap: number;
  lastTop: number;
  /** the size the remembered place belongs to */
  width: number;
  height: number;
  inputAt: number;
  pressed: boolean;
  /** who is moving the list right now (docking, island ↔ app window, …) */
  held: Set<string>;
  holdTimer: number;
  /** it had no size the last time it was looked at */
  hidden: boolean;
  changedAt: number;
  again: number;
  later: number;
};
const states = new WeakMap<HTMLElement, State>();

/** A child's top inside the list's scrolled content, whatever their offset parent is. */
function topIn(list: HTMLElement, node: HTMLElement) {
  return node.offsetParent === list ? node.offsetTop : node.offsetTop - list.offsetTop;
}

/** The first child that reaches below the top edge of what is on screen. */
function firstShown(list: HTMLElement): { node: HTMLElement; ratio: number } | null {
  const top = list.scrollTop;
  for (let node = list.firstElementChild as HTMLElement | null; node; node = node.nextElementSibling as HTMLElement | null) {
    const height = node.offsetHeight;
    if (!height) continue; // hidden rows have no place
    const start = topIn(list, node);
    if (start + height > top + 0.5) return { node, ratio: Math.min(1, Math.max(0, (top - start) / height)) };
  }
  return null;
}

function remember(list: HTMLElement, s: State) {
  const top = list.scrollTop;
  s.gap = Math.max(0, list.scrollHeight - top - list.clientHeight);
  s.lastTop = top;
  s.width = list.clientWidth;
  s.height = list.clientHeight;
  if (s.pinned) {
    s.node = null;
    return;
  }
  const first = firstShown(list);
  s.node = first?.node || null;
  s.ratio = first?.ratio || 0;
}

function state(list: HTMLElement): State {
  let s = states.get(list);
  if (s) return s;
  s = {
    pinned: true,
    node: null,
    ratio: 0,
    gap: 0,
    lastTop: list.scrollTop,
    width: list.clientWidth,
    height: list.clientHeight,
    inputAt: 0,
    pressed: false,
    held: new Set(),
    holdTimer: 0,
    hidden: !list.clientHeight,
    changedAt: 0,
    again: 0,
    later: 0,
  };
  states.set(list, s);
  const st = s;
  // what counts as the reader's own doing: a wheel, a key, a press (the scrollbar, a selection drag)
  const input = () => (st.inputAt = performance.now());
  list.addEventListener('wheel', input, { passive: true });
  list.addEventListener('touchmove', input, { passive: true });
  // a key anywhere in the window (find in chat, Home, a shortcut that jumps to a message)
  window.addEventListener('keydown', input, true);
  list.addEventListener(
    'pointerdown',
    () => {
      st.pressed = true;
      input();
    },
    { passive: true },
  );
  const released = () => {
    if (!st.pressed) return;
    st.pressed = false;
    input();
  };
  window.addEventListener('pointerup', released, { passive: true });
  window.addEventListener('pointercancel', released, { passive: true });
  list.addEventListener(
    'scroll',
    () => {
      // hidden, just shown again or being moved: its position means nothing
      if (!list.clientHeight || st.hidden || st.held.size) return;
      const top = list.scrollTop;
      // The size changed since the place was remembered: this event is the layout's, not the
      // reader's (the resize observer below puts the place back).
      if (list.clientWidth !== st.width || list.clientHeight !== st.height) return;
      const theirs = st.pressed || performance.now() - st.inputAt < INPUT_MS;
      // A list that was hidden, moved in the page or re-laid starts again at 0. Nobody scrolled
      // there: go back instead of taking it for the new place.
      if (top === 0 && !theirs && st.lastTop > Math.max(40, list.clientHeight / 2)) {
        apply(list, st);
        return;
      }
      // Still settling after a move: what the list reports is this file putting it in place, not
      // a new place. The remembered message stays the one the reader chose.
      if (!theirs && performance.now() - st.changedAt < SETTLE_MS) {
        st.lastTop = top;
        return;
      }
      const gap = list.scrollHeight - top - list.clientHeight;
      // v0.9.16: any step upwards is the user's (the code only moves down): follow stops at once,
      // also inside the last few lines, where the next piece used to pull the list back. Coming
      // back near the end follows again.
      if (top < st.lastTop - 1 && gap > 1) st.pinned = false;
      else if (gap < NEAR) st.pinned = true;
      remember(list, st);
      // Messages that just came on screen get their real height in this frame (until then they
      // are an estimate), so the message at the top edge is read once more after it.
      if (!st.later)
        st.later = requestAnimationFrame(() => {
          // the frame after: the layout this frame is about to do has been done by then
          st.later = requestAnimationFrame(() => {
            st.later = 0;
            if (steady(list, st)) remember(list, st);
          });
        });
    },
    { passive: true },
  );
  // A picture or a file card that gets its height late: the end stays the end. (For a reader
  // further up the browser's own scroll anchoring keeps the message in place.)
  list.addEventListener(
    'load',
    () => {
      if (st.pinned && list.clientHeight && !st.hidden && !st.held.size) toEnd(list, st);
    },
    true,
  );
  new ResizeObserver(() => {
    if (!list.clientHeight) {
      st.hidden = true;
      return;
    }
    const shown = st.hidden;
    st.hidden = false;
    if (st.held.size) return;
    // shown again, or another width or height: the same message, not the same number of pixels
    if (shown || list.clientWidth !== st.width || list.clientHeight !== st.height) apply(list, st);
  }).observe(list);
  return s;
}

/**
 * The list is on screen at the size its remembered place belongs to, nobody is moving it and it
 * is not still settling: only then is what it shows the reader's place.
 */
function steady(list: HTMLElement, s: State) {
  return (
    !!list.clientHeight &&
    !s.hidden &&
    !s.held.size &&
    list.clientWidth === s.width &&
    list.clientHeight === s.height &&
    performance.now() - s.changedAt >= SETTLE_MS
  );
}

function toEnd(list: HTMLElement, s: State) {
  list.scrollTop = list.scrollHeight;
  s.lastTop = list.scrollTop;
  s.gap = 0;
  s.width = list.clientWidth;
  s.height = list.clientHeight;
}

/** Puts the list where the reader was. No place known (a first opening): the latest messages. */
function apply(list: HTMLElement, s: State, sure = false) {
  if (!list.clientHeight) return;
  s.changedAt = performance.now();
  place(list, s);
  // Messages off screen are laid out with an estimated height (content-visibility), and the panel
  // may still be growing into its new size. For a short while after the move the place is checked
  // each frame and set again when the rows above changed height. It ends by itself; nothing runs
  // while the chat is at rest.
  cancelAnimationFrame(s.again);
  const until = s.changedAt + SETTLE_MS;
  const applied = s.changedAt;
  const pass = () => {
    s.again = 0;
    if (!list.clientHeight || s.held.size || s.changedAt !== applied) return;
    // the reader is scrolling right now: their hand wins, unless the rows above were just redrawn
    if (s.pressed || performance.now() - s.inputAt < (sure ? 120 : INPUT_MS)) return;
    place(list, s);
    if (performance.now() < until) s.again = requestAnimationFrame(pass);
  };
  s.again = requestAnimationFrame(pass);
}

function place(list: HTMLElement, s: State) {
  if (s.pinned) return toEnd(list, s);
  const max = Math.max(0, list.scrollHeight - list.clientHeight);
  const node = s.node;
  let top: number;
  if (node && node.parentElement === list && node.offsetHeight) top = topIn(list, node) + s.ratio * node.offsetHeight;
  else top = max - s.gap;
  list.scrollTop = Math.min(max, Math.max(0, Math.round(top)));
  s.lastTop = list.scrollTop;
  s.width = list.clientWidth;
  s.height = list.clientHeight;
  // the end is the end, however it was reached
  if (max - list.scrollTop < 1 && max > 0 && !node) s.pinned = true;
}

/** Puts the list back at its remembered place (its end while following). */
export function restore(list: HTMLElement) {
  apply(list, state(list));
}

/**
 * The list is about to be moved, hidden or resized by the interface (docking, island ↔ app window,
 * closing and opening). Nothing it reports until `release` is taken for the reader's doing.
 */
export function hold(list: HTMLElement, who = 'move') {
  const s = state(list);
  // what is on screen right now, read while the list still has the size it belongs to
  if (steady(list, s)) remember(list, s);
  s.held.add(who);
  window.clearTimeout(s.holdTimer);
  // a move that never reports its end must not leave the list deaf
  s.holdTimer = window.setTimeout(() => {
    s.held.clear();
    apply(list, s);
  }, HOLD_MS);
}

/** The move is over: back to the same message (or the end), once the new layout stands. */
export function release(list: HTMLElement, who = 'move') {
  const s = state(list);
  s.held.delete(who);
  if (s.held.size) return;
  window.clearTimeout(s.holdTimer);
  if (list.clientHeight) s.hidden = false;
  apply(list, s);
}

/**
 * Runs `work`, which adds or removes rows above what is on screen, and keeps the reader on the
 * message they were looking at. Measured before anything moves: the older-messages loader used to
 * measure after it had emptied the list, and the reader ended up at the end of the chat.
 */
export function keepPlace(list: HTMLElement, work: () => void) {
  const s = state(list);
  const first = list.clientHeight ? firstShown(list) : null;
  s.held.add('keep');
  try {
    work();
  } finally {
    s.held.delete('keep');
  }
  if (!list.clientHeight) return;
  if (first && first.node.parentElement === list) {
    s.pinned = false;
    s.node = first.node;
    s.ratio = first.ratio;
  }
  apply(list, s, true);
}

/** Scrolls `list` to its end if it was there already (or always, with `force`). */
export function stickToBottom(list: HTMLElement | null | undefined, force = false) {
  if (!list) return;
  const s = state(list);
  if (force) {
    s.pinned = true;
    s.node = null;
    // a chat that was just drawn, or the user's own message: rows get their real height in the
    // next frames, and the end has to stay the end while they do
    apply(list, s, true);
    return;
  }
  if (s.pinned) toEnd(list, s);
}

/** v0.9.16: live output: only the new part is added, so a selection in it survives. */
export function liveText(box: HTMLElement, text: string) {
  const old = box.textContent || '';
  if (old === text) return;
  const last = box.lastChild;
  if (old && text.startsWith(old) && last?.nodeType === Node.TEXT_NODE) (last as Text).appendData(text.slice(old.length));
  else box.textContent = text;
}

/** Whether the list currently follows new content. */
export function following(list: HTMLElement) {
  return state(list).pinned !== false;
}

/**
 * Whether the reader themself is at the top right now: not during a move, not right after the place
 * was put back. The "older messages" row loads only then (a list that was just re-laid passes the
 * top for a moment and loaded them unasked).
 */
export function readerAtTop(list: HTMLElement, within = 4) {
  const s = state(list);
  if (s.held.size || s.hidden || !list.clientHeight || s.pinned) return false;
  if (performance.now() - s.changedAt < 500) return false;
  return list.scrollTop <= within;
}
