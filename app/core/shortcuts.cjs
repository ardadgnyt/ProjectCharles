// Global keyboard shortcuts: record, register, conflict messages.
// v0.9.26: one shortcut is applied at a time (apply), right after it was recorded, and the answer
// says why a key was refused instead of throwing a Turkish sentence. A saved file with one bad
// entry keeps the user's other choices. Push to talk (app/voice/dictation.cjs) is checked too.
const path = require('node:path');
const { readStore, writeStore } = require('./store.cjs');
const DEFAULTS = {
  chat: 'CommandOrControl+Alt+C',
  alert: 'CommandOrControl+Alt+A',
  terminal: 'CommandOrControl+Alt+T',
  next: 'CommandOrControl+Alt+Right',
  previous: 'CommandOrControl+Alt+Left',
  voice: 'CommandOrControl+Alt+V',
  dictate: 'CommandOrControl+Alt+D',
  pet: 'CommandOrControl+Alt+M',
  wardrobe: 'CommandOrControl+Alt+W',
  capture: 'CommandOrControl+Shift+S',
};
const NAMES = {
  pet: 'Slime’ı masaüstüne gönder',
  chat: 'Sohbeti aç',
  alert: 'Uyarıya atla',
  terminal: 'Son terminal işlemi',
  next: 'Sonraki sohbet',
  previous: 'Önceki sohbet',
  voice: 'Sesli görüşme',
  dictate: 'Dikte et',
  wardrobe: 'Gardırop',
  capture: 'Ekrandan alan seç',
};
// v0.9.26: keys Windows can register as a hotkey and that the settings page can record
const KEY = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Left|Right|Up|Down|Space|Enter|Home|End|PageUp|PageDown|Insert|Delete|num[0-9])$/;
const MODIFIER = /^(?:CommandOrControl|Control|Ctrl|Alt|Shift|Super|Meta)$/i;
/** 'ctrl+alt+k' style, the same for every spelling and order. */
function normalize(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/commandorcontrol|control/g, 'ctrl')
    .replace(/meta/g, 'super')
    .split('+')
    .sort()
    .join('+');
}
/** Why one shortcut cannot be used ('' = it can), before Windows is asked. */
function problem(key) {
  if (key === '') return '';
  if (typeof key !== 'string' || key.length > 80) return 'invalid';
  const parts = key.split('+');
  const main = parts.pop();
  if (!parts.length || !KEY.test(main) || !parts.every((p) => MODIFIER.test(p))) return 'invalid';
  if (new Set(parts.map((p) => normalize(p))).size !== parts.length) return 'invalid';
  // Shift alone with a letter would take that capital letter away from typing
  if (!parts.some((p) => /^(?:CommandOrControl|Control|Ctrl|Alt|Super|Meta)$/i.test(p))) return 'modifier';
  return '';
}
function validate(value) {
  if (!value || typeof value !== 'object') throw Error('Invalid shortcuts');
  const result = {},
    used = new Set();
  for (const id of Object.keys(DEFAULTS)) {
    const key = value[id] ?? '';
    if (problem(key)) throw Error('Invalid shortcut: ' + id);
    const normalized = normalize(key);
    if (key && used.has(normalized)) throw Error('Duplicate shortcut: ' + key);
    if (key) used.add(normalized);
    result[id] = key;
  }
  return result;
}
/** A saved file → every valid choice kept; a bad or doubled one goes back to its default. */
function loadable(saved) {
  if (!saved || typeof saved !== 'object') return { ...DEFAULTS };
  const out = {};
  const used = new Set();
  // the user's own valid choices first ('' = turned off is a choice too)
  for (const id of Object.keys(DEFAULTS)) {
    const key = saved[id];
    if (typeof key !== 'string' || problem(key)) continue;
    if (key && used.has(normalize(key))) continue;
    out[id] = key;
    if (key) used.add(normalize(key));
  }
  // the rest take their default, unless a kept choice already uses it (then off, never twice)
  for (const id of Object.keys(DEFAULTS)) {
    if (id in out) continue;
    const n = normalize(DEFAULTS[id]);
    out[id] = used.has(n) ? '' : DEFAULTS[id];
    if (out[id]) used.add(n);
  }
  return Object.fromEntries(Object.keys(DEFAULTS).map((id) => [id, out[id]]));
}
class Shortcuts {
  /**
   * @param reserved () => ({ name: key }) other keys Charles already listens to (push to talk)
   * @param onRecording (active) called when a key is being recorded (push to talk pauses)
   */
  constructor(dir, registrar, run, { reserved = () => ({}), onRecording = () => {} } = {}) {
    this.file = path.join(dir, 'shortcuts.json');
    this.registrar = registrar;
    this.run = run;
    this.reserved = reserved;
    this.onRecording = onRecording;
    this.registered = [];
    this.errors = {};
    this.isRecording = false;
    const data = readStore(this.file, (v) => v && typeof v === 'object').value;
    this.data = loadable(data);
    this.install(this.data);
  }
  install(data) {
    // the old keys are given back to Windows first, so a key moved to another row registers
    for (const key of this.registered) {
      try {
        this.registrar.unregister(key);
      } catch {}
    }
    this.registered = [];
    this.errors = {};
    for (const [id, key] of Object.entries(data)) {
      if (!key) continue;
      try {
        if (!this.registrar.register(key, () => this.run(id))) throw Error();
        this.registered.push(key);
      } catch {
        this.errors[id] = 'Shortcut is in use or unavailable';
      }
    }
  }
  /** While a key is recorded, none of Charles' shortcuts fires (the keys only reach the page). */
  recording(active) {
    clearTimeout(this.recordTimer);
    const on = active === true;
    if (on) {
      for (const key of this.registered) {
        try {
          this.registrar.unregister(key);
        } catch {}
      }
      this.registered = [];
      this.recordTimer = setTimeout(() => this.recording(false), 30000);
      this.recordTimer.unref?.();
    } else if (this.isRecording || !this.registered.length) this.install(this.data);
    if (on !== this.isRecording) {
      this.isRecording = on;
      try {
        this.onRecording(on);
      } catch {}
    }
  }
  read() {
    return { values: this.data, defaults: DEFAULTS, errors: this.errors, recording: this.isRecording };
  }
  /**
   * v0.9.26: one row takes a new key ('' = off). Never throws for a key the user chose; the answer
   * names the reason, and on any refusal the shortcuts that worked before stay as they were.
   *   { ok: true, ...read() } | { ok: false, reason: 'invalid'|'modifier'|'duplicate'|'reserved'|'in-use', with?: id|name }
   */
  apply(id, key) {
    if (!Object.hasOwn(DEFAULTS, id)) throw Error('Geçersiz kısayol.');
    if (typeof key !== 'string') return { ok: false, reason: 'invalid' };
    const why = problem(key);
    if (why) return { ok: false, reason: why };
    if (key) {
      const n = normalize(key);
      const other = Object.keys(this.data).find((k) => k !== id && this.data[k] && normalize(this.data[k]) === n);
      if (other) return { ok: false, reason: 'duplicate', with: other };
      const taken = Object.entries(this.reserved() || {}).find(([, k]) => k && normalize(k) === n);
      if (taken) return { ok: false, reason: 'reserved', with: taken[0] };
    }
    const next = { ...this.data, [id]: key };
    clearTimeout(this.recordTimer);
    this.install(next);
    if (this.errors[id]) {
      // Windows refused it (another program holds it): the working set comes back
      this.install(this.data);
      this.finishRecording();
      return { ok: false, reason: 'in-use' };
    }
    this.data = next;
    writeStore(this.file, next);
    this.finishRecording();
    return { ok: true, ...this.read() };
  }
  finishRecording() {
    if (this.isRecording) {
      this.isRecording = false;
      try {
        this.onRecording(false);
      } catch {}
    }
  }
  /** Several rows at once (Varsayılana dön). Throws when one of them cannot be used. */
  save(value) {
    const next = validate(value);
    for (const [id, key] of Object.entries(next)) {
      const n = normalize(key);
      const taken = key && Object.entries(this.reserved() || {}).find(([, k]) => k && normalize(k) === n);
      if (taken) throw Error(`${NAMES[id] || id}: Bu kısayol zaten kullanılıyor: ${taken[0]}. Başka bir tuş seç.`);
    }
    clearTimeout(this.recordTimer);
    this.install(next);
    if (Object.keys(this.errors).length) {
      const errors = { ...this.errors };
      this.install(this.data);
      this.finishRecording();
      throw Error(
        Object.keys(errors)
          .map((id) => NAMES[id] || id)
          .join(', ') +
          ': Bu kısayol başka bir uygulama tarafından kullanılıyor veya Windows tarafından engelleniyor. Farklı bir tuş birleşimi seç.',
      );
    }
    this.data = next;
    writeStore(this.file, next);
    this.finishRecording();
    return this.read();
  }
}
module.exports = { Shortcuts, DEFAULTS, NAMES, validate, loadable, problem, normalize };
