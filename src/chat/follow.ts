// v0.9.9: the chat follows a running answer only while you are at its end. Scroll up to read an
// earlier part and it stays where you are; scroll back down (or send a message) and it follows
// again. Each streamed piece used to pull the list to the bottom.
const pinned = new WeakMap<HTMLElement, boolean>();
const NEAR = 80;

function watch(list: HTMLElement) {
  if (pinned.has(list)) return;
  pinned.set(list, true);
  list.addEventListener(
    'scroll',
    () => pinned.set(list, list.scrollHeight - list.scrollTop - list.clientHeight < NEAR),
    { passive: true },
  );
}

/** Scrolls `list` to its end if it was there already (or always, with `force`). */
export function stickToBottom(list: HTMLElement | null | undefined, force = false) {
  if (!list) return;
  watch(list);
  if (force) pinned.set(list, true);
  if (pinned.get(list)) list.scrollTop = list.scrollHeight;
}

/** Whether the list currently follows new content. */
export function following(list: HTMLElement) {
  watch(list);
  return pinned.get(list) !== false;
}
