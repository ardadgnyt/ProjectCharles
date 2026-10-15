// Global keyboard shortcuts: record, register, conflict messages.
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
function validate(value) {
  if (!value || typeof value !== 'object') throw Error('Invalid shortcuts');
  const result = {},
    used = new Set();
  for (const id of Object.keys(DEFAULTS)) {
    const key = value[id] ?? '';
    if (
      typeof key !== 'string' ||
      key.length > 80 ||
      (key &&
        !/^(?:(?:CommandOrControl|Control|Ctrl|Alt|Shift|Super|Meta)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Left|Right|Up|Down|Space|Enter)$/i.test(
          key,
        ))
    )
      throw Error('Invalid shortcut: ' + id);
    const normalized = key
      .toLowerCase()
      .replace(/commandorcontrol|control/g, 'ctrl')
      .split('+')
      .sort()
      .join('+');
    if (key && used.has(normalized)) throw Error('Duplicate shortcut: ' + key);
    if (key) used.add(normalized);
    result[id] = key;
  }
  return result;
}
class Shortcuts {
  constructor(dir, registrar, run) {
    this.file = path.join(dir, 'shortcuts.json');
    this.registrar = registrar;
    this.run = run;
    this.registered = [];
    this.errors = {};
    let data = readStore(this.file, (v) => v && typeof v === 'object').value;
    try {
      this.data = validate({ ...DEFAULTS, ...data });
    } catch {
      this.data = { ...DEFAULTS };
    }
    this.install(this.data);
  }
  install(data) {
    for (const key of this.registered) this.registrar.unregister(key);
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
  recording(active) {
    clearTimeout(this.recordTimer);
    if (active) {
      for (const key of this.registered) this.registrar.unregister(key);
      this.registered = [];
      this.recordTimer = setTimeout(() => this.recording(false), 30000);
    } else this.install(this.data);
  }
  read() {
    return { values: this.data, defaults: DEFAULTS, errors: this.errors };
  }
  save(value) {
    const next = validate(value);
    clearTimeout(this.recordTimer);
    this.install(next);
    if (Object.keys(this.errors).length) {
      const errors = { ...this.errors };
      this.install(this.data);
      throw Error(
        Object.keys(errors)
          .map(
            (id) =>
              ({
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
              })[id] || id,
          )
          .join(', ') +
          ': Bu kısayol başka bir uygulama tarafından kullanılıyor veya Windows tarafından engelleniyor. Farklı bir tuş birleşimi seç.',
      );
    }
    this.data = next;
    writeStore(this.file, next);
    return this.read();
  }
}
module.exports = { Shortcuts, DEFAULTS, validate };
