// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.18: Charles dropped on a page, a document or a mail reads that one thing.
//
// A move and a reading are told apart by holding still: only a Charles held for a moment over a
// window shows the frame of what he would read, and only a release inside that frame reads it.
// Nothing is read before the release, nothing is sent to an AI by the drop, and Esc undoes it.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');
const { defuse } = require('../core/untrusted.cjs');

const HOLD_MS = 450;
const STILL_PX = 24;
const MAX_TEXT = 120000;
const IDLE_MS = 45000;
const KINDS = { page: 'Web sayfası', document: 'Belge', mail: 'E-posta', app: 'Pencere' };
const APPS = { chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', winword: 'Word', outlook: 'Outlook', olk: 'Outlook', notepad: 'Not Defteri', powerpnt: 'PowerPoint', acrobat: 'Acrobat', acrord32: 'Acrobat Reader', thunderbird: 'Thunderbird' };
const REASONS = {
  gone: 'Pencere kapanmış; içerik okunmadı.',
  protected: 'Bu uygulama parola veya koruma içerdiği için okunmadı.',
  password: 'Parola alanı açık olduğu için bu pencere okunmadı.',
  unreadable: 'Bu pencere içeriğini okumaya izin vermiyor.',
  failed: 'İçerik okunamadı.',
};
const appName = (a) => APPS[String(a).toLowerCase()] || String(a || 'Uygulama');

/** What is read, in words: a card never says more than what really happened. */
function scopeOf(result) {
  if (result.image) return { scope: 'visible', label: 'Yalnızca görünen bölüm (görüntü)' };
  if (result.truncated) return { scope: 'partial', label: 'Boyut sınırı nedeniyle içeriğin başı okundu' };
  if (result.kind === 'page') return { scope: 'loaded', label: 'Sayfanın yüklenmiş metni' };
  return { scope: 'exposed', label: 'Uygulamanın paylaştığı metin' };
}

/** A pure step of the hold: { arm: true } once the pointer stayed still long enough. */
function holdStep(state, point, now) {
  if (!state.at || Math.hypot(point.x - state.at.x, point.y - state.at.y) > STILL_PX)
    return { at: point, since: now, blocked: false, moved: true };
  return { ...state, moved: false, arm: !state.blocked && now - state.since >= HOLD_MS };
}

class ContentDrop {
  constructor({ BrowserWindow, screen, globalShortcut, ownPid = process.pid, temp = os.tmpdir(), onCancel = () => {}, spawnHelper = null }) {
    Object.assign(this, { BrowserWindow, screen, globalShortcut, ownPid, temp, onCancel, spawnHelper });
    this.child = null;
    this.queue = [];
    this.hold = {};
    this.target = null;
    this.probing = false;
    this.overlay = null;
    this.ticket = 0;
    this.idle = null;
  }

  helper() {
    if (this.child) return this.child;
    const child = this.spawnHelper
      ? this.spawnHelper()
      : spawn(
          path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', fs.readFileSync(path.join(__dirname, 'content-reader.ps1'), 'utf8')],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
        );
    this.child = child;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let value = null;
      try {
        value = JSON.parse(line.replace(/^\uFEFF/, ''));
      } catch {}
      if (value?.ready) return;
      const w = this.queue.shift();
      if (w) {
        clearTimeout(w.timer);
        w.resolve(value);
      }
    });
    const closed = () => {
      if (this.child !== child) return;
      this.child = null;
      for (const w of this.queue.splice(0)) {
        clearTimeout(w.timer);
        w.resolve(null);
      }
    };
    child.on('error', closed);
    child.on('exit', closed);
    child.stdin.on('error', closed);
    return child;
  }

  ask(command, ms) {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), IDLE_MS);
    this.idle.unref?.();
    const child = this.helper();
    return new Promise((resolve) => {
      const waiter = {
        resolve,
        // a program that does not answer must not hold Charles up
        timer: setTimeout(() => {
          this.queue = this.queue.filter((w) => w !== waiter);
          resolve(null);
          this.stop();
        }, ms),
      };
      this.queue.push(waiter);
      child.stdin.write(JSON.stringify(command) + '\n');
    });
  }

  stop() {
    clearTimeout(this.idle);
    const c = this.child;
    this.child = null;
    for (const w of this.queue.splice(0)) {
      clearTimeout(w.timer);
      w.resolve(null);
    }
    try {
      c?.kill();
    } catch {}
  }

  /** A drag began: the helper starts now, so holding still answers at once. */
  begin() {
    this.hold = {};
    this.target = null;
    try {
      this.helper();
    } catch {}
  }

  /** The pointer moved (or stayed) during a drag, in Electron's screen coordinates. */
  move(point, now = Date.now()) {
    this.hold = holdStep(this.hold, point, now);
    if (this.hold.moved) return this.disarm();
    if (this.hold.arm && !this.target && !this.probing) void this.arm(point);
  }

  async arm(point) {
    this.probing = true;
    const ticket = ++this.ticket;
    try {
      const at = this.screen.dipToScreenPoint(point);
      const found = await this.ask({ cmd: 'probe', x: at.x, y: at.y, own: this.ownPid }, 4000);
      if (ticket !== this.ticket || !this.hold.arm) return;
      if (!found?.found) return;
      const rect = this.screen.screenToDipRect(null, found.rect);
      const name = appName(found.app);
      const off = !!found.blocked;
      const label = off ? 'Bu uygulama okunamaz' : 'Bırak: ' + (found.name || found.title || name).slice(0, 80) + ' · ' + name;
      this.show(rect, label, off);
      this.target = off ? null : { ...found, at };
      if (!off) this.listenEsc(true);
    } finally {
      this.probing = false;
    }
  }

  show(rect, label, off) {
    if (!this.overlay || this.overlay.isDestroyed()) {
      this.overlay = new this.BrowserWindow({
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: false,
        show: false,
        backgroundColor: '#00000000',
        title: 'Charles · Hedef',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      this.overlay.setAlwaysOnTop(true, 'screen-saver');
      this.overlay.setIgnoreMouseEvents(true);
      this.overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    }
    this.overlay.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(80, Math.round(rect.width)), height: Math.max(48, Math.round(rect.height)) });
    void this.overlay.loadURL('charles://app/drop-target.html#' + new URLSearchParams({ label, off: off ? '1' : '0' })).catch(() => {});
    this.overlay.showInactive();
  }

  hide() {
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.hide();
  }

  listenEsc(on) {
    if (on === !!this.esc) return;
    this.esc = on;
    try {
      if (on)
        this.globalShortcut.register('Escape', () => {
          this.hold = { ...this.hold, blocked: true, arm: false };
          this.disarm();
          this.onCancel();
        });
      else this.globalShortcut.unregister('Escape');
    } catch {}
  }

  disarm() {
    this.ticket++;
    this.target = null;
    this.hide();
    this.listenEsc(false);
  }

  /** The drag ended. Returns the armed target, or null for an ordinary move. */
  end() {
    const target = this.target;
    this.hold = {};
    this.disarm();
    return target;
  }

  /** Reads the target. Returns { text | image | candidates | error } with what the card shows. */
  async read(target, pick = -1) {
    const png = path.join(this.temp, 'charles-window-' + randomUUID() + '.png');
    const r = await this.ask({ cmd: 'read', hwnd: target.hwnd, x: target.at.x, y: target.at.y, pick, max: MAX_TEXT, png }, 15000);
    const source = { app: appName(r?.app || target.app), kind: KINDS[r?.kind || target.kind] || KINDS.app, title: defuse(r?.name || r?.title || target.title || '', 200) };
    if (!r) return { ...source, error: REASONS.failed };
    if (r.error) return { ...source, error: REASONS[r.error] || REASONS.failed };
    if (r.file) return { ...source, scope: 'file', scopeLabel: r.unsaved ? 'Dosyanın son kaydedilen hâli' : 'Kayıtlı dosyanın tamamı', file: r.file, target };
    if (r.candidates) return { ...source, candidates: r.candidates.map((c) => defuse(c, 100)), target };
    const { scope, label } = scopeOf(r);
    if (r.image) return { ...source, scope, scopeLabel: label, image: r.image, target };
    return { ...source, scope, scopeLabel: label, text: r.text, chars: r.text.length, truncated: !!r.truncated, target };
  }

  destroy() {
    this.stop();
    this.listenEsc(false);
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.destroy();
  }
}

module.exports = { ContentDrop, holdStep, scopeOf, HOLD_MS, STILL_PX };
