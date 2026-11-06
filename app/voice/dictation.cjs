// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.18: Bas-konuş. Hold a key in any app, speak, let go: the words are typed where the cursor
// was. Speech is turned into text by the local Whisper model; nothing leaves the computer, no
// command is run and no Enter is pressed. Off until the user turns it on (Ayarlar → Kısayollar).
const path = require('node:path');
const readline = require('node:readline');
const { readStore, writeStore } = require('../core/store.cjs');
const { bubbleSpot } = require('../plugins/mail-bubble.cjs');

// v0.9.22: Right + Up means the two arrow keys together, each still an arrow key alone
const DEFAULTS = { enabled: false, key: 'Right+Up' };
// dictation.json from before v0.9.22 kept the old default as if it had been chosen
const OLD_DEFAULT = 'Right';
const KEY_SCHEME = 2;
const MAX_WAVE = 3840044; // 120 s of 16 kHz mono
const VK = { Left: 0x25, Up: 0x26, Right: 0x27, Down: 0x28, Space: 0x20, Enter: 0x0d, Tab: 0x09, Insert: 0x2d, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22, Pause: 0x13, ScrollLock: 0x91, CapsLock: 0x14 };
// a key that types or confirms something cannot work alone: its tap would only be delayed
const ALONE = new Set(['Left', 'Up', 'Right', 'Down', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Pause', 'ScrollLock', 'CapsLock']);
const norm = (s) => String(s).toLowerCase().replace(/commandorcontrol|control/g, 'ctrl').split('+').sort().join('+');

function vkOf(name) {
  if (VK[name]) return VK[name];
  if (/^[A-Z0-9]$/.test(name)) return name.charCodeAt(0);
  const f = /^F([1-9]|1[0-9]|2[0-4])$/.exec(name);
  return f ? 0x6f + Number(f[1]) : 0;
}

const MODS = { ctrl: 'ctrl', control: 'ctrl', commandorcontrol: 'ctrl', alt: 'alt', shift: 'shift', super: 'win', win: 'win', meta: 'win' };
const quiet = (key) => ALONE.has(key) || /^F\d+$/.test(key);

/**
 * 'Down', 'F8', 'Ctrl+Alt+Space', 'Right+Up' → what the hook needs; throws a message the user can
 * act on. Two keys with no modifier are a chord: they must be pressed together (vk and vk2).
 */
function parseKey(value, others = {}) {
  const parts = String(value || '').split('+').map((p) => p.trim()).filter(Boolean);
  const mods = { ctrl: false, alt: false, shift: false, win: false };
  const keys = [];
  for (const p of parts) {
    const m = MODS[p.toLowerCase()];
    if (m) mods[m] = true;
    else keys.push(p);
  }
  const held = Object.values(mods).some(Boolean);
  if (!keys.length || keys.some((k) => !vkOf(k))) throw Error('Bu tuş desteklenmiyor. Ok, F veya Ctrl/Alt ile bir birleşim seç.');
  if (keys.length > 2) throw Error('Bir kısayolda en fazla iki tuş olabilir.');
  if (keys.length === 2) {
    if (held) throw Error('İki tuşlu birleşime Ctrl, Alt veya Shift eklenemez.');
    if (keys[0] === keys[1] || !keys.every(quiet)) throw Error('İki tuşlu birleşimde yalnızca ok, gezinme ve F tuşları kullanılabilir.');
  } else if (!held && !quiet(keys[0])) throw Error('Bu tuş tek başına kullanılamaz; yazmayı bozardı. Ok, F veya Ctrl/Alt ile bir birleşim seç.');
  for (const [name, other] of Object.entries(others))
    if (other && norm(other) === norm(value)) throw Error(`Bu kısayol zaten kullanılıyor: ${name}. Başka bir tuş seç.`);
  return keys.length === 2 ? { vk: vkOf(keys[0]), vk2: vkOf(keys[1]), ...mods } : { vk: vkOf(keys[0]), ...mods };
}

/** Up+Right and Right+Up are one chord; it is kept and shown in one order. */
function keyName(value) {
  const parts = String(value || '').split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2 || parts.some((p) => MODS[p.toLowerCase()])) return parts.join('+');
  const rank = (k) => {
    const i = ['Left', 'Right', 'Up', 'Down'].indexOf(k);
    return i < 0 ? 4 : i;
  };
  return [...parts].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join('+');
}

/** Whether the words may be typed now, or must wait for the user's choice. */
function canType(before, now) {
  if (!now) return { ok: false, reason: 'unknown' };
  if (now.password) return { ok: false, reason: 'password' };
  if (now.elevated) return { ok: false, reason: 'elevated' };
  if (now.readonly) return { ok: false, reason: 'readonly' };
  if (!before || before.hwnd !== now.hwnd || before.focus !== now.focus || (before.element && now.element && before.element !== now.element))
    return { ok: false, reason: 'moved' };
  return { ok: true };
}
const WHY = {
  moved: 'Odak değişti; metin eklenmedi.',
  password: 'Parola alanına yazılmaz.',
  elevated: 'Bu uygulama yönetici olarak çalışıyor; Charles yazamaz.',
  readonly: 'Bu alan yazmaya kapalı.',
  unknown: 'Hedef okunamadı; metin eklenmedi.',
};

const CLOSE_MS = 30000;

/**
 * v0.9.19: the indicator stands where notifications stand: under the island or panel, under the
 * cards when some are showing, and beside or above where there is no room (bubbleSpot).
 */
function indicatorSpot(anchor, cards, area, width, height) {
  return bubbleSpot(cards || anchor, area, width, height);
}

class Dictation {
  // voice: a Voice of its own; send(channel, value): to the page; mic: { blocked(), arm(), off() }
  // anchor(): the island's bounds, as for the notification cards; cards(): the cards' bounds or null
  constructor({ dir, voice, send, mic, BrowserWindow, screen, clipboard, shortcuts = () => ({}), language = () => 'tr', spawnHelper = null, preload, anchor = () => null, cards = () => null }) {
    Object.assign(this, { voice, send, mic, BrowserWindow, screen, clipboard, shortcuts, language, spawnHelper, preload, anchor, cards });
    this.file = path.join(dir, 'dictation.json');
    const saved = readStore(this.file, (v) => v && typeof v === 'object').value || {};
    const chosen = typeof saved.key === 'string' && !(saved.keyScheme !== KEY_SCHEME && saved.key === OLD_DEFAULT);
    this.data = { enabled: saved.enabled === true, key: chosen ? saved.key : DEFAULTS.key, keyScheme: KEY_SCHEME };
    // only a file that exists is brought up to date; on or off stays what it was
    if (Object.keys(saved).length && saved.keyScheme !== KEY_SCHEME) writeStore(this.file, this.data);
    this.phase = 'idle';
    this.ticket = 0;
    this.target = null;
    this.result = '';
    this.child = null;
    this.waiters = [];
    this.error = '';
    this.fails = 0;
  }

  read() {
    return { ...this.data, defaultKey: DEFAULTS.key, error: this.error, available: this.voice.available() };
  }

  save(value) {
    const next = { enabled: value?.enabled === true, key: keyName(value?.key || this.data.key), keyScheme: KEY_SCHEME };
    const parsed = parseKey(next.key, this.shortcuts());
    this.data = next;
    this.error = '';
    writeStore(this.file, next);
    if (next.enabled) {
      this.start();
      // one hook, one key: the running hook takes the new key and the old one is an ordinary key again
      this.configure(parsed);
      if (this.mic.blocked()) this.pause(true);
    } else this.stop();
    return this.read();
  }

  /** Called once at start-up. */
  begin() {
    if (this.data.enabled)
      try {
        this.start();
        this.configure(parseKey(this.data.key, this.shortcuts()));
      } catch (e) {
        this.error = e.message;
      }
  }

  start() {
    if (this.child) return;
    const child = this.spawnHelper ? this.spawnHelper() : require('../system/helper-hub.cjs').open('keys');
    this.child = child;
    readline.createInterface({ input: child.stdout }).on('line', (line) => this.line(line));
    const closed = () => {
      if (this.child !== child) return;
      this.child = null;
      for (const w of this.waiters.splice(0)) w(null);
      // a helper that fell over comes back, a few times
      if (this.data.enabled && this.fails++ < 4) setTimeout(() => this.begin(), 3000).unref?.();
    };
    child.on('error', closed);
    child.on('exit', closed);
    child.stdin.on('error', closed);
    this.write({ cmd: 'on' });
  }

  stop() {
    this.cancel(true);
    const c = this.child;
    this.child = null;
    for (const w of this.waiters.splice(0)) w(null);
    try {
      c?.kill();
    } catch {}
    this.hide();
  }

  write(value) {
    try {
      this.child?.stdin.write(JSON.stringify(value) + '\n');
    } catch {}
  }

  ask(value) {
    if (!this.child) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.write(value);
    });
  }

  configure(parsed) {
    this.write({ cmd: 'config', ...parsed });
    this.fails = 0;
  }

  /** Settings is recording a key, or the microphone is off: the key is an ordinary key meanwhile. */
  pause(on) {
    this.write({ cmd: 'set', what: 'pause', value: !!on });
  }

  line(text) {
    let v;
    try {
      v = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      return;
    }
    if ('r' in v) return this.waiters.shift()?.(v.r);
    if (v.e === 'hold' || v.e === 'free') void this.begun(v.e);
    else if (v.e === 'stop') this.finish();
    else if (v.e === 'cancel') this.cancel();
    else if (v.e === 'hook-failed') this.error = 'Klavye kısayolu Windows tarafından engellendi.';
  }

  async begun(mode) {
    if (this.phase !== 'idle') return this.indicator({ state: 'error', text: 'Önceki metin bitmeden yeni kayıt başlamaz.' });
    if (this.mic.blocked()) return this.fail('Mikrofon kapalı. Charles’taki mikrofon simgesinden açabilirsin.');
    if (!this.voice.available()) return this.fail('Yerel ses modeli bulunamadı. Ses kurulumunu çalıştır.');
    const ticket = ++this.ticket;
    this.phase = 'recording';
    this.result = '';
    this.write({ cmd: 'set', what: 'esc', value: true });
    this.target = await this.ask({ cmd: 'target' });
    if (ticket !== this.ticket) return;
    if (!this.mic.arm()) return this.fail('Önce etkin ses işlemini bitir.');
    this.indicator({ state: 'recording', mode });
    this.send('dictate-record', { ticket });
  }

  finish() {
    if (this.phase !== 'recording') return;
    this.phase = 'processing';
    this.indicator({ state: 'processing' });
    this.send('dictate-stop', { ticket: this.ticket });
  }

  /** The recording's bytes from the page. */
  async audio(ticket, bytes) {
    if (ticket !== this.ticket || this.phase === 'idle') return false;
    this.mic.off();
    this.phase = 'processing';
    this.indicator({ state: 'processing' });
    this.write({ cmd: 'set', what: 'reset', value: true });
    let text;
    try {
      this.voice.language = ['en', 'de', 'fr', 'es', 'zh'].includes(this.language()) ? this.language() : 'tr';
      text = await this.voice.transcribe(bytes, { max: MAX_WAVE });
    } catch (e) {
      if (ticket === this.ticket) this.fail(e.message);
      return false;
    }
    if (ticket !== this.ticket) return false; // cancelled meanwhile: a late result is never typed
    text = text.replace(/\s*\r?\n\s*/g, ' ').trim();
    this.result = text;
    const now = await this.ask({ cmd: 'target' });
    if (ticket !== this.ticket) return false;
    const check = canType(this.target, now);
    if (!check.ok) {
      this.phase = 'idle';
      this.write({ cmd: 'set', what: 'esc', value: false });
      this.indicator({ state: 'choice', text, why: WHY[check.reason], canInsert: check.reason === 'moved' });
      return true;
    }
    return this.insert(text);
  }

  async insert(text) {
    const r = await this.ask({ cmd: 'type', text: Buffer.from(text, 'utf8').toString('base64') });
    this.phase = 'idle';
    this.write({ cmd: 'set', what: 'esc', value: false });
    if (r?.typed) this.indicator({ state: 'done', text: text.slice(0, 80) });
    else this.indicator({ state: 'choice', text, why: 'Bu uygulama metni kabul etmedi.' });
    return !!r?.typed;
  }

  cancel(quiet = false) {
    if (this.phase === 'idle') {
      if (this.result) this.hide();
      return;
    }
    this.ticket++;
    this.phase = 'idle';
    this.mic.off();
    this.voice.stop();
    this.send('dictate-cancel', {});
    this.write({ cmd: 'set', what: 'esc', value: false });
    this.write({ cmd: 'set', what: 'reset', value: true });
    if (!quiet) this.indicator({ state: 'cancelled' });
  }

  /** The page could not record (no microphone, permission…). */
  failed(ticket, message) {
    if (ticket === this.ticket && this.phase !== 'idle') this.fail(message);
  }

  fail(message) {
    this.ticket++;
    this.phase = 'idle';
    this.mic.off();
    this.send('dictate-cancel', {});
    this.write({ cmd: 'set', what: 'esc', value: false });
    this.write({ cmd: 'set', what: 'reset', value: true });
    this.indicator({ state: 'error', text: message });
  }

  /** A button on the indicator. */
  async action(name) {
    if (name === 'copy' && this.result) {
      await this.clipboard.writeText(this.result);
      this.indicator({ state: 'done', text: 'Panoya kopyalandı.' });
    } else if (name === 'insert' && this.result) await this.insert(this.result);
    else this.hide();
  }

  indicator(value) {
    clearTimeout(this.hideTimer);
    const w = this.window();
    if (!w) return;
    const send = () => !w.isDestroyed() && w.webContents.send('dictation-state', { ...value, language: this.language() });
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send);
    else send();
    this.size = value.state === 'choice' ? { width: 420, height: 132 } : { width: 300, height: 52 };
    this.place();
    w.setIgnoreMouseEvents(value.state !== 'choice');
    w.setAlwaysOnTop(true, 'screen-saver');
    if (!w.isVisible()) w.showInactive();
    w.moveTop?.();
    if (['done', 'cancelled', 'error'].includes(value.state)) this.hideTimer = setTimeout(() => this.hide(), value.state === 'error' ? 5000 : 1600);
  }

  /** Follows the island and the cards while it is on screen. */
  place() {
    const w = this.win;
    if (!w || w.isDestroyed() || !this.size) return;
    const a = this.anchor();
    const point = a ? { x: Math.round(a.x + a.width / 2), y: Math.round(a.y) } : this.screen.getCursorScreenPoint();
    const area = this.screen.getDisplayNearestPoint(point).workArea;
    const width = Math.min(this.size.width, area.width);
    const { height } = this.size;
    // nothing to stand next to: the old place at the bottom of the screen
    const spot = a ? indicatorSpot(a, this.cards(), area, width, height) : { x: area.x + (area.width - width) / 2, y: area.y + area.height - height - 24 };
    const next = { x: Math.round(spot.x), y: Math.round(spot.y), width, height };
    const now = w.getBounds?.();
    if (!now || ['x', 'y', 'width', 'height'].some((k) => now[k] !== next[k])) w.setBounds(next);
  }

  /** After the island raised itself: all windows here share one topmost band. */
  raise() {
    const w = this.win;
    if (w && !w.isDestroyed() && w.isVisible()) w.moveTop?.();
  }

  window() {
    clearTimeout(this.closeTimer);
    if (this.win && !this.win.isDestroyed()) return this.win;
    if (!this.BrowserWindow) return null;
    this.win = new this.BrowserWindow({
      width: 300,
      height: 52,
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false, // the app being typed into keeps the keyboard
      show: false,
      backgroundColor: '#00000000',
      title: 'Charles · Bas-konuş',
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    void this.win.loadURL('charles://app/dictation.html').catch(() => {});
    return this.win;
  }

  hide() {
    clearTimeout(this.hideTimer);
    if (!this.win || this.win.isDestroyed()) return;
    this.win.hide();
    // v0.9.19: a page of its own stays in memory only around a dictation, not for the whole day
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      if (this.phase === 'idle' && this.win && !this.win.isDestroyed()) this.win.destroy();
      this.win = null;
    }, CLOSE_MS);
    this.closeTimer.unref?.();
  }

  destroy() {
    this.data = { ...this.data, enabled: false };
    this.stop();
    clearTimeout(this.closeTimer);
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
  }
}

module.exports = { Dictation, indicatorSpot, parseKey, keyName, canType, vkOf, DEFAULTS, MAX_WAVE };
