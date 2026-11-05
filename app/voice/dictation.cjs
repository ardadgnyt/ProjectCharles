// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.18: Bas-konuş. Hold a key in any app, speak, let go: the words are typed where the cursor
// was. Speech is turned into text by the local Whisper model; nothing leaves the computer, no
// command is run and no Enter is pressed. Off until the user turns it on (Ayarlar → Kısayollar).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { readStore, writeStore } = require('../core/store.cjs');

const DEFAULTS = { enabled: false, key: 'Right' };
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

/** 'Down', 'F8', 'Ctrl+Alt+Space' → what the hook needs; throws a message the user can act on. */
function parseKey(value, others = {}) {
  const parts = String(value || '').split('+').map((p) => p.trim()).filter(Boolean);
  const key = parts.pop();
  const mods = { ctrl: false, alt: false, shift: false, win: false };
  for (const p of parts) {
    const m = { ctrl: 'ctrl', control: 'ctrl', commandorcontrol: 'ctrl', alt: 'alt', shift: 'shift', super: 'win', win: 'win', meta: 'win' }[p.toLowerCase()];
    if (!m) throw Error('Geçersiz kısayol: ' + value);
    mods[m] = true;
  }
  const vk = key ? vkOf(key) : 0;
  if (!vk) throw Error('Geçersiz kısayol: ' + value);
  if (!parts.length && !ALONE.has(key) && !/^F\d+$/.test(key))
    throw Error('Bu tuş tek başına kullanılamaz; yazmayı bozardı. Ok, F veya Ctrl/Alt ile bir birleşim seç.');
  for (const [name, other] of Object.entries(others))
    if (other && norm(other) === norm(value)) throw Error(`Bu kısayol zaten kullanılıyor: ${name}. Başka bir tuş seç.`);
  return { vk, ...mods };
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

class Dictation {
  // voice: a Voice of its own; send(channel, value): to the page; mic: { blocked(), arm(), off() }
  constructor({ dir, voice, send, mic, BrowserWindow, screen, clipboard, shortcuts = () => ({}), language = () => 'tr', spawnHelper = null, preload }) {
    Object.assign(this, { voice, send, mic, BrowserWindow, screen, clipboard, shortcuts, language, spawnHelper, preload });
    this.file = path.join(dir, 'dictation.json');
    const saved = readStore(this.file, (v) => v && typeof v === 'object').value || {};
    this.data = { enabled: saved.enabled === true, key: typeof saved.key === 'string' ? saved.key : DEFAULTS.key };
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
    const next = { enabled: value?.enabled === true, key: String(value?.key || this.data.key) };
    const parsed = parseKey(next.key, this.shortcuts());
    this.data = next;
    writeStore(this.file, next);
    if (next.enabled) {
      this.start();
      this.configure(parsed);
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
    const child = this.spawnHelper
      ? this.spawnHelper()
      : spawn(
          path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', fs.readFileSync(path.join(__dirname, '../system/dictation-keys.ps1'), 'utf8')],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
        );
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
    const area = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint()).workArea;
    const height = value.state === 'choice' ? 132 : 52;
    const width = value.state === 'choice' ? 420 : 300;
    w.setBounds({ x: Math.round(area.x + (area.width - width) / 2), y: area.y + area.height - height - 24, width, height });
    w.setIgnoreMouseEvents(value.state !== 'choice');
    w.setAlwaysOnTop(true, 'screen-saver');
    if (!w.isVisible()) w.showInactive();
    w.moveTop?.();
    if (['done', 'cancelled', 'error'].includes(value.state)) this.hideTimer = setTimeout(() => this.hide(), value.state === 'error' ? 5000 : 1600);
  }

  window() {
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
    if (this.win && !this.win.isDestroyed()) this.win.hide();
  }

  destroy() {
    this.data = { ...this.data, enabled: false };
    this.stop();
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
  }
}

module.exports = { Dictation, parseKey, canType, vkOf, DEFAULTS, MAX_WAVE };
