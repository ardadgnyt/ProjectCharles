'use strict';
// v0.9.2: Charles Gönder — Unified Quick Share / Nearby Share & AirDrop Send/Receive Coordinator.
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { QuickShareEngine, getLocalIPv4 } = require('./quickshare.cjs');
const { AirDropEngine } = require('./airdrop.cjs');

class ShareService extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.userData = opts.userData || os.tmpdir();
    this.downloadDir = opts.downloadDir || path.join(os.homedir(), 'Downloads');
    this.settingsFile = path.join(this.userData, 'share-settings.json');
    const saved = this.#loadSettings();
    this.deviceName = saved.deviceName || os.hostname() || 'Charles PC';
    this.receiveMode = ['everyone', 'auto', 'off'].includes(saved.receiveMode)
      ? saved.receiveMode
      : 'everyone';

    this.qs = new QuickShareEngine({
      deviceName: this.deviceName,
      downloadDir: this.downloadDir,
      logFile: path.join(this.userData, 'logs', 'quickshare.log'),
    });
    this.ad = new AirDropEngine({
      deviceName: this.deviceName,
      downloadDir: this.downloadDir,
    });

    this.stagedFiles = [];
    this.transfer = null;
    this.activeAbort = null;
    this.pendingOffer = null;
    this.history = [];
    this.started = false;
    this.revision = 0;

    this.#bindEngines();
  }

  #loadSettings() {
    try {
      return JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')) || {};
    } catch {
      return {};
    }
  }

  #saveSettings() {
    try {
      fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true });
      fs.writeFileSync(
        this.settingsFile,
        JSON.stringify(
          {
            deviceName: this.deviceName,
            receiveMode: this.receiveMode,
          },
          null,
          2,
        ),
      );
    } catch {}
  }

  #bindEngines() {
    const emitChange = () => this.emit('state', this.state());
    this.qs.on('peers', emitChange);
    this.ad.on('peers', emitChange);

    const onOffer = (offer) => {
      if (this.receiveMode === 'off') {
        offer.respond(false);
        return;
      }
      if (this.receiveMode === 'auto') {
        this.transfer = {
          id: offer.id,
          status: 'receiving',
          direction: 'receive',
          protocol: offer.protocol,
          peerName: offer.peerName,
          pin: offer.pin || null,
          fileName: offer.files?.[0]?.name || 'Dosya',
          transferred: 0,
          total: (offer.files || []).reduce((s, f) => s + (Number(f.size) || 0), 0),
        };
        emitChange();
        offer.respond(true);
        return;
      }
      if (this.pendingOffer) {
        try {
          this.pendingOffer.respond(false);
        } catch {}
      }
      const timer = setTimeout(() => {
        if (this.pendingOffer?.id === offer.id) {
          this.respondOffer(offer.id, false);
        }
      }, 45000);
      this.pendingOffer = {
        id: offer.id,
        protocol: offer.protocol,
        peerName: offer.peerName,
        pin: offer.pin || null,
        files: offer.files || [],
        respond: (ok) => {
          clearTimeout(timer);
          offer.respond(ok);
        },
      };
      this.emit('offer', {
        id: offer.id,
        protocol: offer.protocol,
        peerName: offer.peerName,
        pin: offer.pin || null,
        files: offer.files || [],
      });
      emitChange();
    };

    this.qs.on('offer', onOffer);
    this.ad.on('offer', onOffer);

    const onProgress = (prog) => {
      this.transfer = {
        id: prog.id,
        status: prog.direction === 'receive' ? 'receiving' : 'sending',
        direction: prog.direction,
        protocol: prog.protocol,
        peerName: prog.peerName,
        fileName: prog.fileName,
        transferred: prog.transferred,
        total: prog.total,
        pin: this.transfer?.pin || null,
      };
      emitChange();
    };
    this.qs.on('progress', onProgress);
    this.ad.on('progress', onProgress);

    const onReceived = (rec) => {
      const entry = {
        id: rec.id,
        direction: 'receive',
        protocol: rec.protocol,
        peerName: rec.peerName,
        files: rec.files,
        at: Date.now(),
      };
      this.history.unshift(entry);
      if (this.history.length > 12) this.history.length = 12;
      this.transfer = {
        id: rec.id,
        status: 'done',
        direction: 'receive',
        protocol: rec.protocol,
        peerName: rec.peerName,
        fileName: rec.files.map((f) => f.name).join(', '),
        files: rec.files,
        transferred: rec.files.reduce((s, f) => s + (f.size || 0), 0),
        total: rec.files.reduce((s, f) => s + (f.size || 0), 0),
      };
      this.emit('received', entry);
      emitChange();
    };
    this.qs.on('received', onReceived);
    this.ad.on('received', onReceived);

    const onError = (err) => {
      if (this.pendingOffer?.id === err.id) {
        this.pendingOffer.respond(false);
        this.pendingOffer = null;
      }
      this.transfer = {
        id: err.id || 'err',
        status: 'error',
        direction: this.transfer?.direction || 'receive',
        protocol: err.protocol || 'quickshare',
        peerName: this.transfer?.peerName || '',
        error: err.error || 'Aktarım sırasında hata oluştu.',
      };
      emitChange();
    };
    this.qs.on('transfer-error', onError);
    this.ad.on('transfer-error', onError);
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    if (this.started) return this.state();
    this.startPromise = (async () => {
      this.qs.setReceiveMode(this.receiveMode);
      this.ad.setVisible(this.receiveMode !== 'off');
      await Promise.all([
        this.qs.start(),
        this.ad.start().catch(error => this.ad.emit('transfer-error', { protocol: 'airdrop', error: 'Dosya alımı başlatılamadı: ' + error.message })),
      ]);
      this.started = true;
      this.emit('state', this.state());
      return this.state();
    })();
    try { return await this.startPromise; }
    catch (error) {
      this.qs.emit('transfer-error', { protocol: 'quickshare', error: 'Quick Share başlatılamadı: ' + error.message });
      throw error;
    } finally { this.startPromise = null; }
  }

  async resume() {
    await this.start();
    await this.qs.refreshNetwork();
    this.ad.setVisible(this.receiveMode !== 'off');
    this.discover();
  }

  stop() {
    this.started = false;
    this.qs.stop();
    this.ad.stop();
  }

  peers() {
    const qsPeers = Array.isArray(this.qs.peers)
      ? this.qs.peers
      : Array.from(this.qs.peers.values());
    const adPeers = Array.isArray(this.ad.peers)
      ? this.ad.peers
      : Array.from(this.ad.peers.values());
    const list = [...qsPeers, ...adPeers];
    return list.sort((a, b) => (b.updatedAt || b.seenAt || 0) - (a.updatedAt || a.seenAt || 0));
  }

  state() {
    return {
      revision: ++this.revision,
      deviceName: this.deviceName,
      ip: getLocalIPv4(),
      qsPort: this.qs.port,
      adPort: this.ad.port,
      receiveMode: this.receiveMode,
      peers: this.peers(),
      stagedFiles: this.stagedFiles,
      transfer: this.transfer,
      offer: this.pendingOffer
        ? {
            id: this.pendingOffer.id,
            protocol: this.pendingOffer.protocol,
            peerName: this.pendingOffer.peerName,
            pin: this.pendingOffer.pin,
            files: this.pendingOffer.files,
          }
        : null,
      history: this.history.slice(0, 6),
    };
  }

  setReceiveMode(mode) {
    if (!['everyone', 'auto', 'off'].includes(mode)) throw Error('Geçersiz görünürlük modu.');
    this.receiveMode = mode;
    const vis = mode !== 'off';
    this.qs.setReceiveMode(mode);
    this.ad.setVisible(vis);
    this.#saveSettings();
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  discover() {
    this.qs.scan();
    this.ad.scan();
    this.qs.announce();
    this.ad.announce();
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  refreshQr() {
    this.qs.refreshQr();
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  stageFiles(rawPaths = []) {
    const next = [];
    const seen = new Set(this.stagedFiles.map((f) => f.path));
    for (const f of this.stagedFiles) next.push(f);
    for (const p of rawPaths) {
      if (typeof p !== 'string' || !p.trim()) continue;
      const resolved = path.resolve(p.trim());
      if (seen.has(resolved)) continue;
      try {
        const st = fs.statSync(resolved);
        if (!st.isFile()) continue;
        seen.add(resolved);
        next.push({
          path: resolved,
          name: path.basename(resolved),
          size: st.size,
          ext: path.extname(resolved).slice(1).toLowerCase(),
        });
      } catch {}
    }
    this.stagedFiles = next.slice(0, 24);
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  removeStagedFile(filePath) {
    if (!filePath) this.stagedFiles = [];
    else this.stagedFiles = this.stagedFiles.filter((f) => f.path !== filePath);
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  respondOffer(id, accept) {
    const offer = this.pendingOffer;
    if (!offer || (id && offer.id !== id)) return this.state();
    this.pendingOffer = null;
    if (accept) {
      this.transfer = {
        id: offer.id,
        status: 'receiving',
        direction: 'receive',
        protocol: offer.protocol,
        peerName: offer.peerName,
        pin: offer.pin || null,
        fileName: offer.files?.[0]?.name || 'Dosya',
        transferred: 0,
        total: (offer.files || []).reduce((s, f) => s + (Number(f.size) || 0), 0),
      };
    }
    offer.respond(Boolean(accept));
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  cancel() {
    this.qs.cancelAll();
    if (this.pendingOffer) {
      this.respondOffer(this.pendingOffer.id, false);
    }
    if (this.activeAbort) {
      try {
        this.activeAbort.abort();
      } catch {}
      this.activeAbort = null;
    }
    this.transfer = null;
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  async send(target = {}) {
    const files =
      Array.isArray(target.files) && target.files.length
        ? target.files
        : this.stagedFiles.map((f) => f.path);
    if (!files.length) throw Error('Önce gönderilecek en az bir dosya seç.');

    let peer = null;
    if (target.peerId) {
      peer = this.peers().find((p) => p.id === target.peerId);
    }
    const host = target.host || peer?.host;
    const port = Number(target.port || peer?.port);
    const protocol = target.protocol || peer?.protocol || 'quickshare';
    const subProtocol = target.subProtocol || peer?.subProtocol;
    const peerName = target.peerName || peer?.name || `${host}:${port}`;
    if (!host || !port) throw Error('Hedef cihaz bulunamadı. Listeyi yenileyip tekrar dene.');

    const jobId = 'send-' + Date.now();
    const ac = new AbortController();
    this.activeAbort = ac;
    const total = files.reduce((s, f) => {
      try {
        return s + fs.statSync(typeof f === 'string' ? f : f.path).size;
      } catch {
        return s;
      }
    }, 0);

    this.transfer = {
      id: jobId,
      status: 'connecting',
      direction: 'send',
      protocol,
      peerName,
      pin: null,
      fileName: path.basename(typeof files[0] === 'string' ? files[0] : files[0].path),
      transferred: 0,
      total,
    };
    this.emit('state', this.state());

    try {
      const onProgress = (p) => {
        if (ac.signal.aborted || this.transfer?.id !== jobId) return;
        this.transfer = {
          ...this.transfer,
          status: p.status === 'connecting' ? 'connecting' : 'sending',
          fileName: p.fileName || this.transfer.fileName,
          transferred: p.transferred,
          total: p.total || total,
        };
        this.emit('state', this.state());
      };
      let res;
      if (protocol === 'airdrop') {
        res = await this.ad.sendFiles({
          host,
          port,
          subProtocol,
          files,
          onProgress,
          signal: ac.signal,
        });
      } else {
        res = await this.qs.sendFiles({
          id: peer?.id,
          instanceName: peer?.instanceName,
          qrMatched: Boolean(peer?.qrMatched),
          name: peerName,
          host,
          port,
          files,
          onPin: (pin) => {
            if (this.transfer && this.transfer.id === jobId) {
              this.transfer.pin = pin;
              this.emit('state', this.state());
            }
          },
          onProgress,
          signal: ac.signal,
        });
      }
      const entry = {
        id: jobId,
        direction: 'send',
        protocol,
        peerName,
        files: res.files,
        at: Date.now(),
      };
      this.history.unshift(entry);
      if (this.history.length > 12) this.history.length = 12;
      this.transfer = {
        id: jobId,
        status: 'done',
        direction: 'send',
        protocol,
        peerName,
        fileName: res.files.map((f) => f.name).join(', '),
        transferred: total,
        total,
      };
      this.emit('state', this.state());
      return this.state();
    } catch (err) {
      if (ac.signal.aborted) return this.state();
      this.transfer = {
        id: jobId,
        status: 'error',
        direction: 'send',
        protocol,
        peerName,
        error: err.message || String(err),
      };
      this.emit('state', this.state());
      throw err;
    } finally {
      if (this.activeAbort === ac) this.activeAbort = null;
    }
  }
}

module.exports = { ShareService };
