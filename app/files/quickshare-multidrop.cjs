// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Charles UI adapter. The actual Windows DNS-SD and transfer implementation is
// tools/quickshare/vendor/multidrop, not the former JavaScript QuickShareEngine.
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseMdnsPacket } = require('./mdns-wire.cjs');
const { QuickShareNames } = require('./quickshare-names.cjs');
const { migrateQuickShareRuntime } = require('./quickshare-runtime.cjs');

// v0.9.16: how the engine ended, in words. On Windows a null exit code means Node itself ended the
// process with child.kill() (any other ending has a number). That is what a failed start did, so
// "motoru kapandı (null)" hid the real error: the only thing it ever said was "Charles stopped it".
const NT_STATUS = {
  0xc0000135: 'Bir sistem kitaplığı eksik.',
  0xc0000142: 'Çalışma ortamı Windows tarafından başlatılamadı.',
  0xc000007b: 'Çalışma ortamının dosyaları bozuk veya uyumsuz.',
  0xc0000005: 'Çalışma ortamı beklenmedik biçimde durdu.',
  0xc0000409: 'Çalışma ortamı beklenmedik biçimde durdu.',
};
function exitText(code, signal) {
  if (code === 0) return 'Quick Share motoru beklenmedik biçimde kapandı.';
  if (code === null) return `Quick Share motoru durduruldu (${signal || 'sinyal yok'}).`;
  return `Quick Share motoru kapandı (kod ${code}). ${NT_STATUS[code >>> 0] || ''}`.trim();
}
/** The reason for the user; the technical part stays in quickshare.log. */
function startProblem(error, { booted, stderr = '' } = {}) {
  const text = `${error?.code || ''} ${error?.message || ''} ${stderr}`;
  if (/^(ENOENT|EACCES|EPERM|UNKNOWN|EBUSY)\b/.test(text.trim()))
    return 'Quick Share motoru çalıştırılamadı. Güvenlik yazılımı tools\\quickshare\\python\\python.exe dosyasını engelliyor olabilir ya da dosya eksik.';
  if (/zaman aşımı/.test(text))
    return booted
      ? 'Quick Share ağ hazırlığı zaman aşımına uğradı. Ağ bağdaştırıcıları veya VPN yanıt vermiyor olabilir.'
      : 'Quick Share motoru iki dakikada açılamadı. Güvenlik yazılımı taraması bilgisayarı yavaşlatıyor olabilir.';
  if (/WinError 100(13|48)|EADDRINUSE|address already in use/i.test(text))
    return 'Quick Share için ağ bağlantı noktası açılamadı. Başka bir uygulama kullanıyor veya Windows ayırmış olabilir.';
  if (/ModuleNotFoundError|ImportError|DLL load failed/i.test(text))
    return 'Quick Share çalışma dosyaları eksik veya bozuk. Charles Setup paketiyle yeniden kurmak bunu düzeltir.';
  return error?.message || 'Quick Share başlatılamadı.';
}
/** stderr without user folders: Windows paths are cut down to the file name. */
function scrub(text) {
  return String(text).replace(/[A-Za-z]:\\[^\s"'<>|]*/g, (p) => '…\\' + p.split('\\').pop()).replace(/\/(?:Users|home)\/[^\s"']*/g, '…').slice(-1500);
}

class MultiDropEngine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = opts;
    this.root = opts.runtimeRoot || path.resolve(__dirname, '../../tools/quickshare');
    this.receiveMode = 'everyone';
    this.peers = [];
    this.names = new QuickShareNames();
    this.port = 0;
    this.health = { listening: false, mdns: false, engine: 'multidrop-python' };
    this.child = null;
    this.pending = new Map();
    this.sends = new Map();
    this.offers = new Set();
    this.sequence = 0;
    this.generation = 0;
    this.startPromise = null;
    this.stopPromise = null;
    this.modePromise = Promise.resolve();
    this.scanPromise = null;
    this.spawnProcess = opts.spawnProcess || spawn;
  }

  note(stage, detail = '') {
    if (!this.opts.logFile) return;
    try {
      fs.mkdirSync(path.dirname(this.opts.logFile), { recursive: true });
      fs.appendFileSync(this.opts.logFile, JSON.stringify({ at: new Date().toISOString(), stage, detail }) + '\n');
    } catch {}
  }

  request(method, data = {}, timeout = 20000) {
    const child = this.child;
    if (!child || !child.stdin.writable) return Promise.reject(Error('Quick Share motoru çalışmıyor.'));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error('Quick Share işlemi zaman aşımına uğradı: ' + method));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, data }) + '\n', error => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  message(message) {
    if (message.event === 'response') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(Error(message.error || 'Quick Share işlemi başarısız.'));
    } else if (message.event === 'health') {
      this.health = message.value;
      this.port = message.value.port;
      this.endpointId = message.value.endpointId;
      this.emit('health', this.health);
    } else if (message.event === 'peers') {
      this.peers = message.value.map(peer => this.names.resolve(peer));
      this.emit('peers', this.peers);
    } else if (message.event === 'offer') {
      if (this.receiveMode === 'off') {
        this.request('answer', { id: message.id, accept: false }).catch(() => {});
        return;
      }
      this.offers.add(message.id);
      this.emit('offer', { ...message, respond: accepted => this.respondOffer(message.id, accepted) });
    } else if (message.event === 'offer-closed') {
      this.offers.delete(message.id);
      this.emit('offer-closed', message);
    } else if (['progress', 'received', 'transfer-error'].includes(message.event)) {
      if (message.event === 'received' && this.names.rememberAddress(message.peerAddress, message.peerName)) {
        this.peers = this.peers.map(peer => this.names.resolve(peer));
        this.emit('peers', this.peers);
      }
      this.emit(message.event, message);
    } else if (message.event === 'send-pin') {
      this.sends.get(message.id)?.onPin?.(message.pin);
    } else if (message.event === 'send-progress') {
      this.sends.get(message.id)?.onProgress?.(message);
    }
  }

  async start() {
    if (this.stopPromise) await this.stopPromise;
    if (this.startPromise) return this.startPromise;
    if (this.child && this.ready) return this.port;
    const generation = this.generation;
    this.startPromise = (async () => {
      if (!this.opts.runtimeRoot) this.root = migrateQuickShareRuntime(path.resolve(__dirname, '../..'));
      const exe = path.join(this.root, 'python', 'python.exe');
      const script = path.join(this.root, 'bridge.py');
      if (!fs.existsSync(exe) || !fs.existsSync(script)) throw Error('Charles Quick Share çalışma dosyaları eksik.');
      const env = { ...process.env };
      delete env.PYTHONPATH;
      delete env.PYTHONHOME;
      let child;
      try {
        child = this.spawnProcess(exe, ['-B', '-u', script], {
          cwd: this.root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        this.note('bridge-spawn-error', error.code || error.message);
        throw Error(startProblem(error));
      }
      this.child = child;
      this.ready = false;
      const started = Date.now();
      // what this start knows about itself; `ending` is set when Charles ends the process
      const run = { booted: false, stderr: '', ending: '' };
      this.note('bridge-spawn', JSON.stringify({ pid: child.pid ?? null }));
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', line => {
        if (this.child !== child) return;
        let message;
        try { message = JSON.parse(line); }
        catch { this.note('bridge-invalid-message'); return; }
        if (message.event === 'booted') {
          run.booted = true;
          this.note('bridge-booted', `${Date.now() - started}ms`);
        } else this.message(message);
      });
      // v0.9.16: the tail is kept for the reason of a failure; only a scrubbed copy reaches the log
      child.stderr.on('data', (data) => {
        run.stderr = (run.stderr + data).slice(-4000);
      });
      const failed = error => {
        if (this.child !== child) return;
        this.child = null;
        this.ready = false;
        this.port = 0;
        this.health = { listening: false, mdns: false, engine: 'multidrop-python' };
        this.peers = [];
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pending.clear();
        for (const id of this.offers) this.emit('offer-closed', { id });
        this.offers.clear();
        lines.close();
        this.emit('peers', []);
        // a failed start reports its own reason through start()
        if (!this.stopping && !run.ending) this.emit('transfer-error', { protocol: 'quickshare', error: error.message });
      };
      const gone = new Promise((resolve) => {
        child.once('exit', resolve);
        child.once('error', resolve);
      });
      child.on('error', error => {
        this.note('bridge-spawn-error', error.code || error.message);
        failed(error);
      });
      child.on('exit', (code, signal) => {
        this.note('bridge-exit', JSON.stringify({ code, signal, by: run.ending || null, stopping: !!this.stopping, ms: Date.now() - started }));
        if (run.stderr) this.note('bridge-stderr', scrub(run.stderr));
        failed(Error(startProblem(Error(exitText(code, signal)), { booted: run.booted, stderr: run.stderr })));
      });
      child.stdin.on('error', () => {});
      try {
        await this.request('init', {
          deviceName: this.opts.deviceName || os.hostname(),
          downloadDir: this.opts.downloadDir || path.join(os.homedir(), 'Downloads'),
          identityFile: this.opts.identityFile,
          logFile: this.opts.logFile,
          port: this.opts.port ?? 53318,
          receiving: this.receiveMode !== 'off',
          discovery: this.opts.discovery !== false,
          bind: this.opts.bind || '0.0.0.0', addresses: this.opts.addresses,
        // v0.9.16: this clock includes the interpreter's own start. Its files are read for the
        // first time here, and on a slow disk with a virus scan 30 s was not always enough.
        }, this.opts.initTimeout ?? 120000);
        if (generation !== this.generation) throw Error('Quick Share başlatma iptal edildi.');
        this.ready = true;
        // A mode change made while init was in flight must be applied before
        // reporting startup complete. Commands already queued keep pipe order.
        await this.request('receiving', { enabled: this.receiveMode !== 'off' });
        return this.port;
      } catch (error) {
        const reason = startProblem(error, { booted: run.booted, stderr: run.stderr });
        this.note('start-failed', JSON.stringify({ code: error.code || null, booted: run.booted, reason: scrub(error.message) }));
        run.ending = 'start-failed';
        child.stdin.end();
        child.kill();
        // the next attempt must not race this process for the port
        await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 3000))]);
        if (this.child === child) failed(Error(reason));
        throw Error(reason);
      }
    })();
    try { return await this.startPromise; }
    finally { this.startPromise = null; }
  }

  setReceiveMode(mode) {
    if (!['everyone', 'off'].includes(mode)) throw Error('Dosya alımı yalnızca açık veya kapalı olabilir.');
    this.receiveMode = mode;
    if (this.child) {
      this.modePromise = this.request('receiving', { enabled: mode !== 'off' });
      this.modePromise.catch(error => this.emit('transfer-error', { protocol: 'quickshare', error: error.message }));
    }
    return mode;
  }

  async setReceiving(enabled) {
    this.setReceiveMode(enabled ? 'everyone' : 'off');
    await this.start();
    await this.modePromise;
    return this.health;
  }

  refreshNetwork({ force = false } = {}) {
    // MultiDrop owns address changes. An idle UI or a healthy maintenance tick
    // never recreates a working DNS-SD publisher; `force` (resume from sleep, a
    // receiver found unhealthy) publishes again from fresh sockets, same identity.
    if (!this.child) return this.start();
    return this.request(force ? 'refresh' : 'health', {}, 30000);
  }

  scan() {
    if (!this.child || this.scanPromise) return;
    this.scanPromise = this.request('discover', {}, 15000).catch(error => {
      this.note('discovery-error');
    }).finally(() => { this.scanPromise = null; });
    return this.scanPromise;
  }
  announce() {} // The upstream publisher/responder owns registration/answers.
  stopDiscoveryWake() {} // Windows upstream has no BLE advertiser.
  refreshQr() { return null; }

  handleMdnsPacket(packet, rinfo) {
    if (!this.ready || packet.length > 9000 || this.receiveMode === 'off') return;
    const parsed = parseMdnsPacket(packet);
    if (!parsed) return;
    // v0.9.6: any host that speaks mDNS (a phone asking for Chromecast, AirPlay…) also gets the
    // announcement sent to it directly; at most once a minute per address
    const ip = rinfo?.address;
    this.neighborSeen ||= new Map();
    if (ip && Date.now() - (this.neighborSeen.get(ip) || 0) > 60000) {
      this.neighborSeen.set(ip, Date.now());
      if (this.neighborSeen.size > 256) this.neighborSeen.clear();
      this.request('mdns-neighbor', { address: ip }).catch(() => {});
    }
    if (parsed.isResponse || !parsed.questions.some(q => /_FC9F5ED42C8A\._tcp/i.test(q.name))) return;
    // Windows may give a unicast query to LocalSend's shared UDP/5353 socket.
    // Forward it to MultiDrop's unmodified UnicastResponder, not a second engine.
    this.request('mdns-query', { packet: packet.toString('base64'), address: rinfo.address, port: rinfo.port })
      .catch(() => {});
  }

  respondOffer(id, accept) {
    if (!this.offers.has(id)) return false;
    this.offers.delete(id);
    this.request('answer', { id, accept: Boolean(accept) }).catch(() => {});
    return true;
  }

  cancelTransfer(id) {
    if (!this.child) return false;
    this.request('cancel', { id }).catch(() => {});
    return true;
  }
  cancelAll() {
    for (const id of this.offers) this.respondOffer(id, false);
    for (const id of this.sends.keys()) this.cancelTransfer(id);
  }

  async sendFiles(opts) {
    if (opts.signal?.aborted) throw Error('Aktarım iptal edildi.');
    await this.start();
    if (opts.signal?.aborted) throw Error('Aktarım iptal edildi.');
    const id = 'send-' + crypto.randomUUID();
    this.sends.set(id, opts);
    const abort = () => this.cancelTransfer(id);
    opts.signal?.addEventListener('abort', abort, { once: true });
    try {
      return await this.request('send', {
        jobId: id, host: opts.host, port: opts.port, name: opts.name,
        endpointId: opts.id?.replace(/^qs:/, ''),
        files: opts.files.map(f => typeof f === 'string' ? f : f.path),
      }, 24 * 60 * 60 * 1000);
    } finally {
      opts.signal?.removeEventListener('abort', abort);
      this.sends.delete(id);
    }
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    ++this.generation;
    const child = this.child;
    this.ready = false;
    if (!child) return Promise.resolve();
    this.stopping = true;
    this.stopPromise = new Promise(resolve => {
      const timer = setTimeout(() => child.kill(), 7000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      // EOF lets the backend unregister services and finish cancellations.
      child.stdin.end();
      if (child.exitCode !== null) { clearTimeout(timer); resolve(); }
    }).finally(() => { this.stopping = false; this.stopPromise = null; });
    return this.stopPromise;
  }
}

module.exports = { MultiDropEngine };
