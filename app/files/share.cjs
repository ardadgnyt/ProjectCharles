'use strict';
// v0.9.5: Charles Gönder — Quick Share / LocalSend / AirDrop send & receive
// coordinator. The Quick Share engine owns discovery, the listener and the
// offer/transfer lifecycle; this service only maps events to UI state and must
// never tear down a newer transfer while cleaning up an older one.
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getLocalIPv4 } = require('./mdns-wire.cjs');
const { MultiDropEngine } = require('./quickshare-multidrop.cjs');
const { AirDropEngine } = require('./airdrop.cjs');

function clearOfferTimer(offer) {
  if (offer?.timer) {
    clearTimeout(offer.timer);
    offer.timer = null;
  }
}

class ShareService extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.userData = opts.userData || os.tmpdir();
    this.downloadDir = opts.downloadDir || path.join(os.homedir(), 'Downloads');
    this.settingsFile = path.join(this.userData, 'share-settings.json');
    const saved = this.#loadSettings();
    this.deviceName = saved.deviceName || os.hostname() || 'Charles PC';
    // Start visible, with explicit consent for every incoming offer. Never restore
    // the removed legacy automatic-accept mode from an older installation.
    this.receiveMode = 'everyone';
    this.receiveGeneration = 0;
    this.receiveStarting = false;

    this.qs = opts.quickShareEngine || new MultiDropEngine({
      deviceName: this.deviceName,
      downloadDir: this.downloadDir,
      logFile: path.join(this.userData, 'logs', 'quickshare.log'),
      identityFile: path.join(this.userData, 'quickshare-identity.json'),
    });
    this.ad = new AirDropEngine({
      deviceName: this.deviceName,
      downloadDir: this.downloadDir,
    });
    // The two engines share UDP/5353. Windows may hand a unicast mDNS query to
    // only one socket, so let the Quick Share responder see every packet.
    this.ad.onMdnsPacket = (msg, rinfo) => this.qs.handleMdnsPacket(msg, rinfo);

    this.stagedFiles = [];
    this.transfer = null;
    this.activeAbort = null;
    this.pendingOffer = null;
    this.currentJobId = null;
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
      if (this.pendingOffer) {
        clearOfferTimer(this.pendingOffer);
        try {
          this.pendingOffer.respond(false);
        } catch {}
        this.pendingOffer = null;
      }
      // Quick Share owns its own 120 s consent deadline. AirDrop/LocalSend
      // offers wait for this service, so every protocol gets a hard deadline
      // here as well; otherwise an ignored HTTP upload never ends.
      const pending = {
        id: offer.id,
        protocol: offer.protocol,
        peerName: offer.peerName,
        pin: offer.pin || null,
        files: offer.files || [],
        timer: null,
        respond: (ok) => {
          clearOfferTimer(pending);
          offer.respond(ok);
        },
      };
      pending.timer = setTimeout(() => {
        if (this.pendingOffer === pending) this.respondOffer(pending.id, false);
      }, 125000);
      pending.timer.unref?.();
      this.pendingOffer = pending;
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
    this.qs.on('offer-closed', ({ id }) => {
      if (this.pendingOffer?.id !== id) return;
      clearOfferTimer(this.pendingOffer);
      this.pendingOffer = null;
      emitChange();
    });

    const onProgress = (prog) => {
      // A late event from the previous transfer must not repaint the new one.
      if (this.currentJobId && prog.id !== this.currentJobId) return;
      if (!this.currentJobId) this.currentJobId = prog.id || null;
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
      if (!this.currentJobId || rec.id === this.currentJobId) {
        this.currentJobId = rec.id;
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
      }
      this.emit('received', entry);
      emitChange();
    };
    this.qs.on('received', onReceived);
    this.ad.on('received', onReceived);

    const onError = (err) => {
      if (this.pendingOffer && this.pendingOffer.id === err.id) {
        clearOfferTimer(this.pendingOffer);
        try {
          this.pendingOffer.respond(false);
        } catch {}
        this.pendingOffer = null;
      }
      // Never replace the state of a newer transfer with an old failure.
      if (this.currentJobId && err.id && err.id !== this.currentJobId) return;
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
    // A failed startup must recover without opening the share sheet.
    if (!this.retryTimer) {
      this.retryTimer = setInterval(() => {
        if (!this.started && !this.startPromise) void this.start().catch(() => {});
        else if (this.started) void this.maintainReceiving().catch(() => {});
      }, 10000);
      this.retryTimer.unref?.();
    }
    if (this.startPromise) return this.startPromise;
    if (this.started) return this.state();
    this.startPromise = (async () => {
      this.qs.setReceiveMode(this.receiveMode);
      this.ad.setVisible(this.receiveMode !== 'off');
      await Promise.all([
        this.qs.start(),
        this.ad.start().catch((error) =>
          this.ad.emit('transfer-error', {
            protocol: 'airdrop',
            error: 'Dosya alımı başlatılamadı: ' + error.message,
          }),
        ),
      ]);
      // Apply visibility again with live listeners, just as the receive-mode
      // control does. Use the current setting, including changes during startup.
      this.qs.setReceiveMode(this.receiveMode);
      this.ad.setVisible(this.receiveMode !== 'off');
      this.discover();
      this.started = true;
      this.emit('state', this.state());
      return this.state();
    })();
    try {
      return await this.startPromise;
    } catch (error) {
      this.qs.emit('transfer-error', {
        protocol: 'quickshare',
        error: 'Quick Share başlatılamadı: ' + error.message,
      });
      throw error;
    } finally {
      this.startPromise = null;
    }
  }

  async resume() {
    await this.start();
    await this.qs.refreshNetwork({ force: true });
    await this.ad.refreshNetwork({ force: true }).catch(() => {});
    this.qs.setReceiveMode(this.receiveMode);
    this.ad.setVisible(this.receiveMode !== 'off');
    this.discover();
  }

  async maintainReceiving() {
    // Owned by the main process, independent of the island/renderer sleep state.
    // Restore listeners and visibility without cycling Off/On or changing identity.
    if (
      !this.started ||
      this.receiveStarting ||
      this.receiveMode === 'off' ||
      this.maintenancePromise
    )
      return;
    const generation = this.receiveGeneration;
    const current = () =>
      this.started &&
      !this.receiveStarting &&
      this.receiveMode !== 'off' &&
      generation === this.receiveGeneration;
    this.maintenancePromise = (async () => {
      await Promise.all([this.qs.start(), this.ad.start()]);
      if (!current()) return;
      let repaired = false;
      if (this.qs.receiveMode !== this.receiveMode) {
        this.qs.setReceiveMode(this.receiveMode);
        repaired = true;
      }
      if (!this.ad.visible) {
        this.ad.setVisible(true);
        repaired = true;
      }
      const health = this.qs.health || {};
      if (repaired || health.listening === false || health.mdns === false) {
        await this.qs.refreshNetwork({ force: repaired });
        await this.ad.refreshNetwork().catch(() => {});
        if (!current()) return;
        this.qs.announce();
        this.ad.announce();
      }
    })();
    try {
      await this.maintenancePromise;
    } finally {
      this.maintenancePromise = null;
    }
  }

  stop() {
    ++this.receiveGeneration;
    clearInterval(this.retryTimer);
    this.retryTimer = null;
    this.started = false;
    if (this.pendingOffer) {
      clearOfferTimer(this.pendingOffer);
      this.pendingOffer = null;
    }
    this.currentJobId = null;
    this.qs.stop();
    this.ad.stop();
  }

  health() {
    return {
      ...(this.qs.health || {}),
      started: this.started,
      receiveMode: this.receiveMode,
      receiveStarting: this.receiveStarting,
      pendingOffer: this.pendingOffer?.id || null,
      transfer: this.transfer
        ? { id: this.transfer.id, status: this.transfer.status, direction: this.transfer.direction }
        : null,
    };
  }

  note(stage, detail = '') {
    this.qs.note?.(stage, detail);
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
      receiveStarting: this.receiveStarting,
      // Ground truth for the UI: "Açık" must mean the backend is really
      // listening and announcing, not merely that the switch was set.
      health: {
        listening: !!(this.qs.health || {}).listening,
        mdns: !!(this.qs.health || {}).mdns,
        engine: (this.qs.health || {}).engine || null,
        port: (this.qs.health || {}).port ?? this.qs.port,
      },
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
    if (!['everyone', 'off'].includes(mode))
      throw Error('Dosya alımı yalnızca açık veya kapalı olabilir.');
    this.receiveMode = mode;
    const vis = mode !== 'off';
    this.qs.setReceiveMode(mode);
    this.ad.setVisible(vis);
    this.#saveSettings();
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  async setReceiving(enabled) {
    if (typeof enabled !== 'boolean') throw Error('Geçersiz dosya alım seçimi.');
    const generation = ++this.receiveGeneration;
    this.receiveStarting = enabled;
    // One desired state, one serialized backend transition. Never cycle a
    // healthy receiver Off/On just because the user selected On again.
    this.setReceiveMode(enabled ? 'everyone' : 'off');
    if (!enabled && this.pendingOffer) this.respondOffer(this.pendingOffer.id, false);
    if (!enabled && this.transfer?.direction === 'receive' && this.transfer.status === 'receiving')
      this.cancelTransfer(this.transfer.id);
    try {
      await this.start();
      if (generation !== this.receiveGeneration) return this.state();
      await this.qs.modePromise;
      if (generation !== this.receiveGeneration) return this.state();
      if (enabled) this.discover();
    } catch (error) {
      if (generation === this.receiveGeneration) this.setReceiveMode('off');
      throw error;
    } finally {
      if (generation === this.receiveGeneration) {
        this.receiveStarting = false;
        this.emit('state', this.state());
      }
    }
    return this.state();
  }

  discover({ wake = false } = {}) {
    this.qs.scan({ wake });
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
    if (this.stagedFiles.length) this.qs.scan({ wake: true });
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  removeStagedFile(filePath) {
    if (!filePath) this.stagedFiles = [];
    else this.stagedFiles = this.stagedFiles.filter((f) => f.path !== filePath);
    if (!this.stagedFiles.length) this.qs.stopDiscoveryWake();
    const st = this.state();
    this.emit('state', st);
    return st;
  }

  respondOffer(id, accept) {
    const offer = this.pendingOffer;
    if (!offer || (id && offer.id !== id)) return this.state();
    clearOfferTimer(offer);
    this.pendingOffer = null;
    if (accept) {
      this.currentJobId = offer.id;
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

  cancelTransfer(id) {
    const job = String(id || '');
    if (!job) return false;
    const found = this.qs.cancelTransfer ? Boolean(this.qs.cancelTransfer(job)) : false;
    if (this.transfer?.id === job) this.transfer = null;
    if (this.currentJobId === job) this.currentJobId = null;
    const st = this.state();
    this.emit('state', st);
    return found;
  }

  cancel() {
    if (this.pendingOffer) this.respondOffer(this.pendingOffer.id, false);
    const tr = this.transfer;
    if (tr && ['connecting', 'sending', 'receiving'].includes(tr.status)) {
      if (tr.direction === 'receive') this.qs.cancelTransfer?.(tr.id);
      else if (tr.direction === 'send' && this.activeAbort) {
        try {
          this.activeAbort.abort();
        } catch {}
        this.activeAbort = null;
      }
    }
    this.transfer = null;
    this.currentJobId = null;
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

    if (this.transfer && ['connecting', 'sending', 'receiving'].includes(this.transfer.status))
      throw Error('Devam eden aktarımın bitmesini bekle.');
    const jobId = 'send-' + require('node:crypto').randomUUID();
    const ac = new AbortController();
    this.activeAbort = ac;
    this.currentJobId = jobId;
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
        if (ac.signal.aborted || this.currentJobId !== jobId) return;
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
      if (protocol === 'airdrop' || protocol === 'localsend') {
        res = await this.ad.sendFiles({
          host,
          port,
          subProtocol,
          https: peer?.https !== false,
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
      if (this.currentJobId === jobId) {
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
      }
      this.emit('state', this.state());
      return this.state();
    } catch (err) {
      if (ac.signal.aborted) return this.state();
      if (this.currentJobId === jobId) {
        this.transfer = {
          id: jobId,
          status: 'error',
          direction: 'send',
          protocol,
          peerName,
          error: err.message || String(err),
        };
      }
      this.emit('state', this.state());
      throw err;
    } finally {
      this.qs.stopDiscoveryWake();
      if (this.activeAbort === ac) this.activeAbort = null;
    }
  }
}

module.exports = { ShareService };
