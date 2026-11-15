// v1.0.0: brings a newer Electron with an in-place update. The update zip never carries
// node_modules (scripts/release-pack.cjs), so package.json names the runtime this version wants
// (`charlesRuntime`: Electron's official win32-x64 zip, its size and SHA-256). This module downloads
// that zip into <root>\_update\runtime, checks it and writes pending.json; Charles.exe
// (setup/CharlesLauncher.cs) swaps node_modules\electron\dist on the next start, before Electron runs.
// The pinned hash arrives inside the SHA-verified update zip, so trust never comes from the network.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const NAME = /^electron-v(\d+\.\d+\.\d+)-win32-x64\.zip$/;
const PLAIN = /^(\d+)\.(\d+)\.(\d+)$/;
// the apply step keeps the zip, the new dist, the old dist and the branded host copy for a moment
const NEED_BYTES = 1024 * 1024 * 1024;
const RETRY_MS = 6 * 3600 * 1000;
// a download that receives nothing for this long is given up (updater.download has no timeout)
const STALL_MS = 60000;
const STATES = ['idle', 'not-needed', 'downloading', 'ready', 'failed', 'applied'];

class RuntimeError extends Error {
  constructor(code, message, detail = '') {
    super(message || code);
    this.code = code;
    this.detail = detail;
  }
}

/** "44.11.3" vs "44.5.1" → -1, 0, 1; null for anything that is not a plain x.y.z. */
function compare(a, b) {
  const x = PLAIN.exec(String(a || '').trim());
  const y = PLAIN.exec(String(b || '').trim());
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++) if (+x[i] !== +y[i]) return +x[i] < +y[i] ? -1 : 1;
  return 0;
}

/** package.json's charlesRuntime, checked field by field → { electron, url, sha256, bytes, name } or null. */
function runtimeConfig(pkg) {
  const c = pkg?.charlesRuntime;
  if (!c || typeof c !== 'object') return null;
  const electron = String(c.electron || '');
  const sha256 = String(c.sha256 || '').toLowerCase();
  const bytes = Number(c.bytes);
  if (!PLAIN.test(electron) || !/^[a-f0-9]{64}$/.test(sha256)) return null;
  if (!Number.isSafeInteger(bytes) || bytes < 1024 * 1024 || bytes > 400 * 1024 * 1024) return null;
  let name = '';
  try {
    const u = new URL(String(c.url || ''));
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com') return null;
    name = decodeURIComponent(u.pathname.split('/').pop() || '');
  } catch {
    return null;
  }
  const m = NAME.exec(name);
  if (!m || m[1] !== electron) return null;
  return { electron, url: String(c.url), sha256, bytes, name };
}

const dirOf = (root) => path.join(root, '_update', 'runtime');

function readJson(file, max = 16384) {
  try {
    if (fs.statSync(file).size > max) return null;
    const v = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

/** _update\runtime\pending.json when it is well formed → { electron, zip, sha256, ... } or null. */
function readPending(root) {
  const p = readJson(path.join(dirOf(root), 'pending.json'));
  if (!p || !PLAIN.test(String(p.electron || '')) || !/^[a-f0-9]{64}$/.test(String(p.sha256 || ''))) return null;
  const m = NAME.exec(String(p.zip || ''));
  if (!m || m[1] !== p.electron) return null;
  return p;
}

/**
 * The very top of app/main.cjs: a host started without Charles.exe (an older updater's restart, a
 * shortcut to the host) while a newer runtime waits. Charles.exe sets CHARLES_RUNTIME_TRIED for the
 * host whenever it left the runtime where it was, so this cannot loop.
 */
function shouldHandOver({ root, running, app, env = process.env, argv = process.argv, platform = process.platform }) {
  if (platform !== 'win32' || argv.includes('--demo') || env.CHARLES_RUNTIME_TRIED) return false;
  const p = readPending(root);
  if (!p || compare(p.electron, running) !== 1) return false;
  if (p.app && app && p.app !== app) return false;
  return fs.existsSync(path.join(root, 'Charles.exe'));
}

/** _update\runtime\result.json (written by Charles.exe), read once. */
function takeResult(root) {
  const file = path.join(dirOf(root), 'result.json');
  const v = readJson(file, 8192);
  if (!v) return null;
  try {
    fs.rmSync(file, { force: true });
  } catch {}
  return { ok: v.ok === true, version: String(v.version || '').slice(0, 20), code: String(v.code || '').slice(0, 40), message: String(v.message || '').slice(0, 300) };
}

/** Free bytes on the drive of `dir` (the nearest folder that exists), or Infinity when unknown. */
function freeBytes(dir) {
  let d = path.resolve(dir);
  for (;;) {
    try {
      const s = fs.statfsSync(d);
      return Number(s.bavail) * Number(s.bsize);
    } catch {
      const up = path.dirname(d);
      if (up === d) return Infinity;
      d = up;
    }
  }
}

/** A failure of the download → { code, message } the Settings line shows. */
function classify(e) {
  if (e instanceof RuntimeError) return e;
  const msg = String(e?.message || e);
  const detail = String(e?.detail || '');
  if (/GitHub dışından|yönlendirildi/.test(msg)) return new RuntimeError('host', msg, detail);
  if (/HTTP 404/.test(detail) || e?.status === 404) return new RuntimeError('notfound', msg, 'HTTP 404');
  if (/beklenenden büyük/.test(msg)) return new RuntimeError('size', msg, detail);
  if (/^HTTP /.test(detail)) return new RuntimeError('failed', msg, detail);
  // fetch() itself failed: no connection, DNS, a reset, our stall timeout
  return new RuntimeError('offline', msg, String(e?.cause?.code || e?.name || ''));
}

/**
 * Downloads, verifies and announces the runtime → { file, pending }. Throws RuntimeError
 * (code: disk, host, notfound, offline, size, hash, failed).
 */
async function fetchRuntime({ root, config, app = '', text = '', fetchImpl = globalThis.fetch, onProgress = () => {}, free = freeBytes, stallMs = STALL_MS }) {
  const { download, sha256File } = require('./updater.cjs');
  const dir = dirOf(root);
  const file = path.join(dir, config.name);
  const pendingFile = path.join(dir, 'pending.json');
  const announce = () => {
    const pending = { electron: config.electron, zip: config.name, sha256: config.sha256, bytes: config.bytes, app, text: String(text).slice(0, 200), tries: 0 };
    writeJson(pendingFile, pending);
    return { file, pending };
  };
  const have = readPending(root);
  const sized = (f) => {
    try {
      return fs.statSync(f).size === config.bytes;
    } catch {
      return false;
    }
  };
  if (have && have.electron === config.electron && have.sha256 === config.sha256 && (have.app || '') === app && sized(file)) return { file, pending: have };
  const left = free(root);
  if (left < NEED_BYTES) throw new RuntimeError('disk', 'Diskte yeterli boş yer yok.', Math.floor(left / 1048576) + ' MB');
  fs.mkdirSync(dir, { recursive: true });
  // a verified zip from an earlier run (the update's own prepare(), an old pending.json)
  if (sized(file) && sha256File(file) === config.sha256) return announce();
  // leftovers: a partial file, another version's zip, a pending.json that no longer fits
  for (const n of fs.readdirSync(dir)) if (/\.part$/i.test(n) || (NAME.test(n) && n !== config.name) || n === config.name || n === 'pending.json') fs.rmSync(path.join(dir, n), { force: true });
  const part = file + '.part';
  const controller = new AbortController();
  let stall = setTimeout(() => controller.abort(new Error('stalled')), stallMs);
  try {
    await download(config.url, part, {
      fetchImpl,
      maxBytes: config.bytes + 1024 * 1024,
      signal: controller.signal,
      onProgress: (received) => {
        clearTimeout(stall);
        stall = setTimeout(() => controller.abort(new Error('stalled')), stallMs);
        onProgress(received, config.bytes);
      },
    });
  } catch (e) {
    fs.rmSync(part, { force: true });
    throw classify(e);
  } finally {
    clearTimeout(stall);
  }
  const size = fs.statSync(part).size;
  if (size !== config.bytes) {
    fs.rmSync(part, { force: true });
    throw new RuntimeError('size', 'İndirilen dosyanın boyutu beklenenle aynı değil.', size + ' B');
  }
  const actual = sha256File(part);
  if (actual !== config.sha256) {
    fs.rmSync(part, { force: true });
    throw new RuntimeError('hash', 'İndirilen dosya doğrulanamadı (SHA-256 uyuşmuyor).', actual.slice(0, 12) + '…');
  }
  fs.renameSync(part, file);
  return announce();
}

/**
 * The runtime step while Charles runs: the state for Settings, the retry rhythm (once shortly after
 * start, then at most every six hours) and nothing at all when the running Electron is already
 * the one package.json asks for.
 */
class RuntimeUpdate {
  constructor({
    root,
    pkg = null,
    running = process.versions.electron,
    app = '',
    platform = process.platform,
    arch = process.arch,
    fetchImpl = (...a) => globalThis.fetch(...a),
    now = () => Date.now(),
    free = freeBytes,
    text = () => '',
    onState = () => {},
    retryMs = RETRY_MS,
  }) {
    this.root = root;
    this.pkg = pkg || readJson(path.join(root, 'package.json'), 1 << 20) || {};
    this.config = runtimeConfig(this.pkg);
    this.running = String(running || '');
    this.app = app || String(this.pkg.version || '');
    this.platform = platform;
    this.arch = arch;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.free = free;
    this.text = text;
    this.onState = onState;
    this.retryMs = retryMs;
    this.timer = null;
    this.busy = null;
    this.lastTry = 0;
    this.lastEmit = 0;
    this.current = { status: 'idle' };
  }

  get state() {
    return { ...this.current, version: this.config?.electron || '', running: this.running, bytes: this.config?.bytes || 0 };
  }
  set(status, extra = {}) {
    if (!STATES.includes(status)) status = 'failed';
    this.current = { status, ...extra };
    this.lastEmit = this.now();
    try {
      this.onState(this.state);
    } catch {}
  }

  /** win32 x64 only, and only up: the running Electron is older than charlesRuntime.electron. */
  needed() {
    if (this.platform !== 'win32' || this.arch !== 'x64' || !this.config) return false;
    return compare(this.running, this.config.electron) === -1;
  }

  /** Startup: the launcher's result, a waiting pending.json, or nothing to do. */
  init() {
    const result = takeResult(this.root);
    const memo = this.memo();
    if (result?.ok && compare(this.running, result.version) !== -1) {
      this.set('applied', { applied: result.version });
      this.saveMemo({});
      return this.state;
    }
    if (result && !result.ok) {
      // three failed starts: no automatic download for this version until the user asks
      this.saveMemo({ paused: result.version || this.config?.electron || '', reason: 'apply', at: this.now() });
      this.set('failed', { reason: 'apply', detail: result.message || result.code });
      return this.state;
    }
    if (!this.needed()) {
      this.cleanStale();
      this.set('not-needed');
      return this.state;
    }
    if (this.isReady()) this.set('ready');
    else if (memo.paused === this.config.electron) this.set('failed', { reason: 'apply', detail: '' });
    return this.state;
  }

  /** pending.json for this runtime and this app version, with its zip in place. */
  isReady() {
    const p = readPending(this.root);
    if (!p || !this.config || p.electron !== this.config.electron || p.sha256 !== this.config.sha256) return false;
    if (p.app && p.app !== this.app) return false;
    try {
      return fs.statSync(path.join(dirOf(this.root), p.zip)).size === this.config.bytes;
    } catch {
      return false;
    }
  }

  /** A pending runtime that is not newer than the running one (Setup installed a newer one) goes. */
  cleanStale() {
    const p = readPending(this.root);
    if (!p || compare(p.electron, this.running) === 1) return;
    for (const n of ['pending.json', p.zip]) fs.rmSync(path.join(dirOf(this.root), n), { force: true });
  }

  memo() {
    return readJson(path.join(dirOf(this.root), 'state.json'), 4096) || {};
  }
  saveMemo(value) {
    try {
      writeJson(path.join(dirOf(this.root), 'state.json'), value);
    } catch {}
  }

  /** Downloads now (manual: also after a failed apply or a refused file). → the state. */
  fetch({ manual = false } = {}) {
    if (this.busy) return this.busy;
    if (!this.needed()) {
      this.set('not-needed');
      return Promise.resolve(this.state);
    }
    if (this.isReady()) {
      this.set('ready');
      return Promise.resolve(this.state);
    }
    if (manual) this.saveMemo({});
    this.lastTry = this.now();
    this.set('downloading', { received: 0, total: this.config.bytes });
    this.busy = fetchRuntime({
      root: this.root,
      config: this.config,
      app: this.app,
      text: this.text(),
      fetchImpl: this.fetchImpl,
      free: this.free,
      onProgress: (received, total) => {
        // the page hears at most a few updates a second
        if (this.now() - this.lastEmit < 400 && received < total) return;
        this.set('downloading', { received, total });
      },
    })
      .then(() => {
        this.saveMemo({});
        this.set('ready');
        return this.state;
      })
      .catch((e) => {
        const err = classify(e);
        // costly failures (a whole download) wait for the next six-hour window even across restarts
        if (['hash', 'size'].includes(err.code)) this.saveMemo({ reason: err.code, at: this.now() });
        this.set('failed', { reason: err.code, detail: err.detail || '', free: err.code === 'disk' ? this.free(this.root) : undefined });
        return this.state;
      })
      .finally(() => {
        this.busy = null;
      });
    return this.busy;
  }

  /** Whether an automatic attempt may run now. */
  due() {
    if (!this.needed() || this.busy || this.isReady()) return false;
    const memo = this.memo();
    if (memo.paused && memo.paused === this.config.electron) return false;
    if (memo.at && ['hash', 'size'].includes(memo.reason) && this.now() - memo.at < this.retryMs) return false;
    return !this.lastTry || this.now() - this.lastTry >= this.retryMs;
  }

  /** The automatic rhythm: one attempt after `delay`, then a look every `retryMs`. */
  start(delay = 45000) {
    this.stop();
    if (!this.needed()) return false;
    const tick = () => {
      if (this.due()) void this.fetch();
      this.timer = setTimeout(tick, this.retryMs);
      this.timer.unref?.();
    };
    this.timer = setTimeout(tick, delay);
    this.timer.unref?.();
    return true;
  }
  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = {
  NEED_BYTES,
  RETRY_MS,
  STATES,
  RuntimeError,
  RuntimeUpdate,
  compare,
  runtimeConfig,
  dirOf,
  readPending,
  shouldHandOver,
  takeResult,
  freeBytes,
  classify,
  fetchRuntime,
};
