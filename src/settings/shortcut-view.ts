// v0.9.27: how a shortcut and its answer are shown in Settings → Shortcuts.
//
// Keys: one label per key ("Ctrl" "Alt" "D") that wraps to a second line when the row is narrow.
// The read-only text field used before cut a three-key combination at its right edge, so
// Ctrl + Alt + D read as Ctrl + Alt: a wrong shortcut on screen. Nothing here is ever clipped.
//
// Answers: "saved" leaves by itself after a moment; an error stays until the next action. Each
// message has a number, so the timer of an older message can never close a newer one.
import { shownKey } from './key-names';

export const OK_MS = 3200;

/** The keys of a stored shortcut as they are shown: 'CommandOrControl+Alt+D' → ['Ctrl', 'Alt', 'D']. */
export function keyParts(key: string): string[] {
  return shownKey(String(key || ''))
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p === 'Super' ? 'Win' : p));
}

/** The element that shows a shortcut. `set('')` shows "Atanmadı". */
export function keyChips(labelledBy = '') {
  const el = document.createElement('span');
  el.className = 'shortcut-keys';
  el.setAttribute('role', 'group');
  if (labelledBy) el.setAttribute('aria-labelledby', labelledBy);
  let shown = '\u0000';
  const set = (key: string) => {
    const parts = keyParts(key);
    const next = parts.join('+');
    if (next === shown) return;
    shown = next;
    el.dataset.keys = next;
    if (!parts.length) {
      const none = document.createElement('span');
      none.className = 'shortcut-none';
      none.textContent = 'Atanmadı';
      el.replaceChildren(none);
      return;
    }
    el.replaceChildren(
      ...parts.flatMap((p, i) => {
        const cap = document.createElement('kbd');
        // a key's name is what is printed on the keyboard, in every interface language
        cap.setAttribute('translate', 'no');
        cap.textContent = p;
        if (!i) return [cap];
        const plus = document.createElement('span');
        plus.className = 'shortcut-plus';
        plus.setAttribute('translate', 'no');
        plus.textContent = '+';
        return [plus, cap];
      }),
    );
  };
  set('');
  return { el, set, invalid: (on: boolean) => el.classList.toggle('invalid', on) };
}

export type StatusKind = 'ok' | 'error' | 'wait' | '';

/**
 * A row's own answer line (role="status": announced, never focused). The element stays in the
 * page while empty, so a screen reader hears the change; `ok` messages leave after OK_MS.
 */
export function statusLine(
  el: HTMLElement,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (id: any) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id),
  },
) {
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.dataset.kind = '';
  el.classList.add('is-empty');
  let turn = 0;
  let timer: unknown = null;
  const write = (kind: StatusKind, parts: string[]) => {
    el.replaceChildren(
      ...parts.flatMap((p, i) => {
        // separate pieces, so each one is translated by itself
        const span = document.createElement('span');
        span.textContent = p;
        return i ? [document.createTextNode(' '), span] : [span];
      }),
    );
    el.dataset.kind = parts.length ? kind : '';
    el.classList.toggle('is-empty', !parts.length);
  };
  const say = (kind: StatusKind, ...parts: string[]) => {
    const mine = ++turn;
    if (timer !== null) timers.clear(timer);
    timer = null;
    write(kind, parts.filter(Boolean));
    if (kind === 'ok' && parts.length)
      timer = timers.set(() => {
        timer = null;
        // only the message this timer belongs to; a newer one has its own
        if (mine === turn) write('', []);
      }, OK_MS);
  };
  return { say, clear: () => say(''), kind: () => (el.dataset.kind || '') as StatusKind };
}
