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
// v0.9.19: the first answer comes from the window list alone (milliseconds). The exact area comes
// from UI Automation, which can take seconds on a large page the first time: the frame does not
// wait for it, and a slow answer no longer kills the helper (the next drags then started it again
// and again, and the frame "sometimes" never came).
const PROBE_MS = 2500;
const START_MS = 15000; // only the helper's own start may take long (a virus scan of the compile)
const REFINE_WAIT_MS = 220;
const REFINE_MS = 12000;
const RETRY_MS = 700; // nothing to read here: asked again this rarely, not on every pointer tick
const OVERLAY_MS = 8000; // the frame's window, as big as the page it marks, does not stay around
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
    this.triedAt = 0;
    this.refused = null;
    this.cancelled = false;
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
    this.started = false;
    // v0.9.19: a helper started for a drag that asked nothing used to stay for ever
    this.touch();
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let value = null;
      try {
        value = JSON.parse(line.replace(/^\uFEFF/, ''));
      } catch {}
      if (value?.ready) {
        this.started = true;
        return;
      }
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

  touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), IDLE_MS);
    this.idle.unref?.();
  }

  ask(command, ms) {
    this.touch();
    const child = this.helper();
    return new Promise((resolve) => {
      const waiter = { resolve, timer: null };
      // a program that does not answer must not hold Charles up
      // behind a question in progress its time starts when that one ends
      const limit = (this.started ? ms : Math.max(ms, START_MS)) + (this.queue.length ? REFINE_MS : 0);
      waiter.timer = setTimeout(() => {
        this.queue = this.queue.filter((w) => w !== waiter);
        resolve(null);
        this.stop();
      }, limit);
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
    this.refused = null;
    this.cancelled = false;
    this.triedAt = 0;
    this.ticket++; // whatever the last drag still waits for is no longer wanted
    clearTimeout(this.overlayTimer);
    try {
      this.helper();
    } catch {}
  }

  /** The pointer moved (or stayed) during a drag, in Electron's screen coordinates. */
  move(point, now = Date.now()) {
    this.hold = holdStep(this.hold, point, now);
    if (this.hold.moved) {
      this.cancelled = false;
      return this.disarm();
    }
    if (this.hold.arm && !this.target && !this.refused && !this.probing && now - this.triedAt >= RETRY_MS) {
      this.triedAt = now;
      void this.arm(point);
    }
  }

  /** The label over the frame. */
  label(found, off) {
    const name = appName(found.app);
    return off ? 'Bu uygulama okunamaz' : 'Bırak: ' + (found.name || found.title || name).slice(0, 80) + ' · ' + name;
  }

  async arm(point) {
    this.probing = true;
    const ticket = ++this.ticket;
    const live = () => ticket === this.ticket && this.hold.arm;
    try {
      const at = this.screen.dipToScreenPoint(point);
      const found = await this.ask({ cmd: 'probe', x: at.x, y: at.y, own: this.ownPid }, PROBE_MS);
      if (!live() || !found?.found) return;
      const off = !!found.blocked;
      if (off) {
        this.refused = { error: REASONS.protected };
        return await this.show(this.screen.screenToDipRect(null, found.rect), this.label(found, true), true, live);
      }
      const target = { ...found, at };
      // the exact area usually arrives within a moment, and then the frame opens once, in place
      const exact = this.ask({ cmd: 'refine', hwnd: found.hwnd, x: at.x, y: at.y }, REFINE_MS);
      const first = await Promise.race([exact, new Promise((r) => setTimeout(r, REFINE_WAIT_MS, undefined))]);
      if (!live()) return;
      const place = (v) => {
        if (v?.name) target.name = v.name;
        return this.screen.screenToDipRect(null, v?.rect || found.rect);
      };
      await this.show(place(first), this.label(target, false), false, live);
      if (!live()) return;
      // only a release inside a frame the user could see reads anything
      this.target = target;
      this.listenEsc(true);
      // the next hold may begin while this page is still answering
      if (first === undefined)
        void exact.then((later) => {
          if (live() && later?.rect) return this.show(place(later), this.label(target, false), false, live);
        });
    } finally {
      this.probing = false;
    }
  }

  overlayWindow() {
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
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
      });
      this.overlay.setIgnoreMouseEvents(true);
      this.overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.overlayReady = this.overlay.loadURL('charles://app/drop-target.html').catch(() => {});
    }
    return this.overlay;
  }

  /**
   * The frame is drawn first and shown after: a hidden window keeps its last picture, and a
   * loadURL for every target could be cancelled by the next one, which left an empty window.
   */
  async show(rect, label, off, live = () => true) {
    clearTimeout(this.overlayTimer);
    const w = this.overlayWindow();
    await this.overlayReady;
    if (!live() || w.isDestroyed()) return;
    await w.webContents.executeJavaScript('window.charlesFrame(' + JSON.stringify({ label, off }) + ')').catch(() => {});
    if (!live() || w.isDestroyed()) return;
    w.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(80, Math.round(rect.width)), height: Math.max(48, Math.round(rect.height)) });
    // each time: Windows may drop a hidden window out of the topmost band
    w.setAlwaysOnTop(true, 'screen-saver');
    if (!w.isVisible()) w.showInactive();
    w.moveTop?.();
  }

  hide() {
    if (!this.overlay || this.overlay.isDestroyed()) return;
    this.overlay.hide();
    clearTimeout(this.overlayTimer);
    this.overlayTimer = setTimeout(() => this.closeOverlay(), OVERLAY_MS);
    this.overlayTimer.unref?.();
  }

  closeOverlay() {
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.destroy();
    this.overlay = null;
  }

  listenEsc(on) {
    if (on === !!this.esc) return;
    this.esc = on;
    try {
      if (on)
        this.globalShortcut.register('Escape', () => {
          this.hold = { ...this.hold, blocked: true, arm: false };
          this.cancelled = true;
          this.disarm();
          this.onCancel();
        });
      else this.globalShortcut.unregister('Escape');
    } catch {}
  }

  disarm() {
    this.ticket++;
    this.target = null;
    this.refused = null;
    this.triedAt = 0;
    this.hide();
    this.listenEsc(false);
  }

  /**
   * The drag ended. Returns the armed target, { refused } over a window that may not be read,
   * { cancelled } after Esc, or null for an ordinary move.
   */
  end() {
    const result = this.target || (this.refused ? { refused: this.refused } : this.cancelled ? { cancelled: true } : null);
    this.hold = {};
    this.cancelled = false;
    this.disarm();
    return result;
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
    clearTimeout(this.overlayTimer);
    this.closeOverlay();
  }
}

module.exports = { ContentDrop, holdStep, scopeOf, HOLD_MS, STILL_PX, PROBE_MS, RETRY_MS };
