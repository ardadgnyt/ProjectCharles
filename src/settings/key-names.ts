// v0.9.26: the name of a pressed key, from where it sits on the keyboard (KeyboardEvent.code), not
// from the character it types. On a Turkish keyboard Ctrl + Alt is AltGr, so Ctrl + Alt + Q typed
// "@" and Shift + 1 typed "!": `e.key` turned those shortcuts into something nothing accepts, and
// the keys looked as if they had been ignored. Windows registers a hotkey by the same key position.
const CODES: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Tab: 'Tab',
  Pause: 'Pause',
  ScrollLock: 'ScrollLock',
  CapsLock: 'CapsLock',
};
const KEYS: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ' ': 'Space',
  Enter: 'Enter',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Tab: 'Tab',
  Pause: 'Pause',
  ScrollLock: 'ScrollLock',
  CapsLock: 'CapsLock',
};
export const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS'];

/** 'A', '7', 'num7', 'F5', 'Left', 'Space' …, or '' for a key that has no usable name. */
export function keyName(e: Pick<KeyboardEvent, 'code' | 'key'>): string {
  const code = String(e.code || '');
  let m: RegExpExecArray | null;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit([0-9])$/.exec(code))) return m[1];
  if ((m = /^Numpad([0-9])$/.exec(code))) return 'num' + m[1];
  if ((m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code))) return 'F' + m[1];
  if (CODES[code]) return CODES[code];
  if (code && code !== 'Unidentified') return '';
  // no position reported (some synthetic events): the character, when it is a plain one
  const key = String(e.key || '');
  if (KEYS[key]) return KEYS[key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  return '';
}

/** How a stored shortcut is shown: "Ctrl + Alt + K". */
export const shownKey = (key: string) => key.replace(/CommandOrControl/g, 'Ctrl').replace(/\+/g, ' + ');
