// v0.9.9: the chat follows a running answer only while you are at its end. Scroll up to read an
// earlier part and it stays where you are; scroll back down (or send a message) and it follows
// again. Each streamed piece used to pull the list to the bottom.
const pinned = new WeakMap<HTMLElement, boolean>();
const NEAR = 80;

// v0.9.10: where the list was, as a distance from its end. Moving the chat between the island
// and the app window (or hiding it while the island shows its card shelf) resets a list to its
// top: going back to the island from the app window showed the start of the conversation. When
// the list gets its size again it returns to the same distance from the end.
const gapFromEnd = new WeakMap<HTMLElement, number>();

function watch(list: HTMLElement) {
  if (pinned.has(list)) return;
  pinned.set(list, true);
  gapFromEnd.set(list, 0);
  let lastTop = list.scrollTop;
  list.addEventListener(
    'scroll',
    () => {
      if (!list.clientHeight) return; // hidden: its scroll position means nothing
      const top = list.scrollTop;
      const gap = list.scrollHeight - top - list.clientHeight;
      // v0.9.16: any step upwards is the user's (the code only moves down): follow stops at once,
      // also inside the last few lines, where the next piece used to pull the list back. Coming
      // back near the end follows again.
      if (top < lastTop - 1 && gap > 1) pinned.set(list, false);
      else if (gap < NEAR) pinned.set(list, true);
      lastTop = top;
      gapFromEnd.set(list, Math.max(0, gap));
    },
    { passive: true },
  );
  let height = list.clientHeight;
  new ResizeObserver(() => {
    const was = height;
    height = list.clientHeight;
    if (!height) return;
    // shown again, or moved to a panel of another size: back to the same place
    if (!was || list.scrollTop === 0 || pinned.get(list)) restore(list);
  }).observe(list);
}

/** Puts the list back at its remembered distance from the end (its end while following). */
export function restore(list: HTMLElement) {
  watch(list);
  const gap = pinned.get(list) ? 0 : gapFromEnd.get(list) || 0;
  list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight - gap);
}

/** Scrolls `list` to its end if it was there already (or always, with `force`). */
export function stickToBottom(list: HTMLElement | null | undefined, force = false) {
  if (!list) return;
  watch(list);
  if (force) pinned.set(list, true);
  if (pinned.get(list)) list.scrollTop = list.scrollHeight;
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
  watch(list);
  return pinned.get(list) !== false;
}
