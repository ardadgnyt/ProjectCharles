// v0.8.8: WhatsApp messages in Charles (Ayarlar → Eklentiler → WhatsApp → "Mesajlar Charles'ta").
//
// WhatsApp has no API for personal accounts. Charles uses GOWA, the open-source WhatsApp Web
// multi-device gateway (github.com/aldinokemal/go-whatsapp-web-multidevice, MIT): on the user's
// click Charles downloads GOWA's Windows build from its GitHub release, checks it against the
// SHA-256 GOWA publishes, keeps it in %APPDATA%\Charles\whatsapp and starts it on this computer
// only (127.0.0.1, a random port, a random password). The user links it like WhatsApp Web, by
// scanning a QR code. New messages come back to Charles through a signed webhook, also on
// 127.0.0.1. Messages are kept in memory only: nothing about them is written to disk or a log.
//
// Unofficial: WhatsApp may restrict accounts that automate. Charles only answers chats that wrote
// to the user, only when the user presses send, a few messages a minute at most.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const RELEASE_API = 'https://api.github.com/repos/aldinokemal/go-whatsapp-web-multidevice/releases/latest';
const EXE = 'charles-whatsapp-gateway.exe';
const MAX_ZIP = 150 * 1024 * 1024;
const MAX_BODY = 4 * 1024 * 1024;
// v0.8.11: photos are fetched from the gateway (base64) and kept in memory only
const MAX_PHOTO = 24 * 1024 * 1024;
const PHOTO_KINDS = ['image', 'sticker'];

function photoType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// GOWA 9.x returns file_url/file_path, not inline Base64. Never fetch a CDN or
// arbitrary URL with the local bridge credentials, and never read a disk path.
function localPhotoRoute(metadata, port) {
  const base = new URL(`http://127.0.0.1:${port}`);
  for (const value of [metadata?.file_url, metadata?.file_path]) {
    if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) continue;
    let input = value.replace(/\\/g, '/');
    if (input.startsWith('statics/')) input = '/' + input;
    try {
      const url = new URL(input, base);
      if (url.origin !== base.origin || url.username || url.password || !url.pathname.startsWith('/statics/')) continue;
      const parts = url.pathname.split('/').map(decodeURIComponent);
      if (parts.some(p => p === '.' || p === '..' || /[\\/\x00-\x1f\x7f]/.test(p))) continue;
      return url.pathname + url.search;
    } catch {}
  }
  return null;
}

async function limitedBody(res, max) {
  if (Number(res.headers?.get?.('content-length') || 0) > max) throw Error('WhatsApp köprüsünün yanıtı çok büyük.');
  if (!res.body?.getReader) {
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > max) throw Error('WhatsApp köprüsünün yanıtı çok büyük.');
    return bytes;
  }
  const reader = res.body.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw Error('WhatsApp köprüsünün yanıtı çok büyük.'); }
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts, size);
  } finally { reader.releaseLock(); }
}
const DEVICE = 'charles';
const SEND_LIMIT = [8, 60000]; // messages per minute
const DEFAULT_REPLIES = ['Tamam, bakıyorum', 'Birazdan döneceğim', 'Teşekkürler', 'Şimdi müsait değilim'];
const MEDIA = {
  image: 'Fotoğraf',
  video: 'Video',
  video_note: 'Video',
  audio: 'Sesli mesaj',
  ptt: 'Sesli mesaj',
  document: 'Belge',
  sticker: 'Çıkartma',
  location: 'Konum',
  live_location: 'Konum',
  contact: 'Kişi',
  contacts_array: 'Kişi',
  poll: 'Anket',
};

const isGroup = (jid) => /@g\.us$/.test(jid) || /@(newsletter|broadcast)$/.test(jid);
const isPerson = (jid) => /^[0-9A-Za-z.:_-]{3,64}@(s\.whatsapp\.net|lid|c\.us)$/.test(jid);
const now = () => Date.now();

/** The GOWA zip for Windows x64 and its checksums file in a release's asset list. */
function pickAssets(assets, os = 'windows', arch = process.arch === 'arm64' ? 'arm64' : 'amd64') {
  const list = Array.isArray(assets) ? assets : [];
  const zip = list.find((a) => typeof a?.name === 'string' && a.name.startsWith('whatsapp_') && a.name.endsWith(`_${os}_${arch}.zip`));
  const sums = list.find((a) => a?.name === `checksums-${os}.txt`) || list.find((a) => a?.name === 'checksums.txt');
  return zip ? { zip, sums: sums || null } : null;
}
/** SHA-256 (lowercase hex) of `name` in a "<hex>  <name>" checksums file, else GitHub's digest. */
function expectedHash(name, checksums, digest) {
  for (const line of String(checksums || '').split(/\r?\n/)) {
    const [hash, file] = line.trim().split(/\s+/);
    if (file === name && /^[0-9a-f]{64}$/i.test(hash || '')) return hash.toLowerCase();
  }
  const m = /^sha256:([0-9a-f]{64})$/i.exec(String(digest || ''));
  return m ? m[1].toLowerCase() : null;
}
/** The binary inside GOWA's zip: "windows-amd64.exe" (or a whatsapp.exe), never anything else. */
function binaryEntry(names, os = 'windows', arch = 'amd64') {
  const base = (n) => n.split('/').pop();
  const wanted = [`${os}-${arch}.exe`, `${os}-${arch}`, 'whatsapp.exe'];
  for (const w of wanted) {
    const hit = names.find((n) => !n.endsWith('/') && base(n) === w);
    if (hit) return hit;
  }
  return null;
}

/** A GOWA "message" webhook → { id, chat, from, name, text, media, at, mine } or null. */
function parseWebhook(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json || json.event !== 'message' || !json.payload || typeof json.payload !== 'object') return null;
  const p = json.payload;
  const id = typeof p.id === 'string' ? p.id : '';
  const chat = typeof p.chat_id === 'string' ? p.chat_id : '';
  if (!id || !chat) return null;
  const media = Object.keys(MEDIA).find((k) => p[k] !== undefined && p[k] !== null) || null;
  const caption = media && p[media] && typeof p[media] === 'object' ? String(p[media].caption || '') : '';
  const at = Date.parse(p.timestamp);
  // v0.8.9: a group message is recognised by every hint the gateway gives, not only chat_id
  const group =
    /@g\.us$/.test(chat) ||
    p.is_group === true ||
    /@g\.us$/.test(String(p.chat_jid || p.group_jid || '')) ||
    / in \S+@g\.us$/.test(String(p.from || ''));
  return {
    group,
    id: id.slice(0, 128),
    chat: (group && !/@g\.us$/.test(chat) ? String(p.chat_jid || p.group_jid || String(p.from || '').split(' in ')[1] || chat) : chat).slice(0, 128),
    from: String(p.from || chat).slice(0, 128),
    name: String(p.sender_display_name || p.from_name || '').slice(0, 80),
    text: String(p.body || caption || '').slice(0, 4000),
    media: media ? MEDIA[media] : null,
    kind: media || null,
    at: Number.isFinite(at) ? at : now(),
    mine: p.is_from_me === true,
  };
}
/** Stored messages of a chat (GET /chat/{jid}/messages) → the same shape, oldest first. */
function parseMessages(results) {
  const list = Array.isArray(results?.data) ? results.data : [];
  return list
    .filter((m) => m && typeof m.id === 'string' && typeof m.chat_jid === 'string')
    .map((m) => ({
      id: m.id.slice(0, 128),
      chat: m.chat_jid.slice(0, 128),
      from: String(m.sender_jid || m.chat_jid).slice(0, 128),
      name: String(m.sender_display_name || '').slice(0, 80),
      text: String(m.content || '').slice(0, 4000),
      media: m.media_type ? MEDIA[m.media_type] || 'Ek' : null,
      kind: m.media_type || null,
      at: Date.parse(m.timestamp) || 0,
      mine: m.is_from_me === true,
    }))
    .sort((a, b) => a.at - b.at);
}
function signature(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}
function sameSignature(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cleanReplies(list) {
  if (!Array.isArray(list)) throw Error('Hızlı yanıtlar bir liste olmalı.');
  if (list.length > 8) throw Error('En fazla 8 hızlı yanıt olabilir.');
  return list.map((r) => {
    const t = String(r || '').trim();
    if (!t || t.length > 120) throw Error('Her hızlı yanıt 1–120 karakter olmalı.');
    return t;
  });
}
const freePort = () =>
  new Promise((resolve, reject) => {
    const s = require('node:net').createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

class WhatsAppLive extends EventEmitter {
  /**
   * dir: %APPDATA%\Charles\whatsapp. fetch: global fetch (tests pass a fake). spawn: child_process.spawn.
   * unzip: (bytes) → { name: Uint8Array } (fflate.unzipSync).
   */
  constructor({ dir, fetch = globalThis.fetch, spawn = require('node:child_process').spawn, unzip = (b) => require('fflate').unzipSync(b), platform = process.platform, thumbnail = null }) {
    super();
    this.thumbnail = thumbnail; // v0.8.11: (bytes, type) → small data URL or null
    this.photoJobs = new Map();
    this.photoGeneration = 0;
    this.dir = dir;
    this.fetchImpl = fetch;
    this.spawnImpl = spawn;
    this.unzip = unzip;
    this.platform = platform;
    this.file = path.join(dir, 'settings.json');
    this.settings = { enabled: false, groups: false, quickReplies: [...DEFAULT_REPLIES], version: null };
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved && typeof saved === 'object') {
        this.settings.enabled = saved.enabled === true;
        this.settings.groups = saved.groups === true;
        if (typeof saved.version === 'string') this.settings.version = saved.version.slice(0, 40);
        try {
          this.settings.quickReplies = cleanReplies(saved.quickReplies);
        } catch {}
      }
    } catch {}
    this.link = 'off'; // off | installing | starting | qr | connecting | connected | error
    this.error = '';
    this.progress = '';
    this.qr = null; // data:image/png;base64,…
    this.me = '';
    this.child = null;
    this.port = 0;
    this.auth = '';
    this.secret = '';
    this.server = null;
    this.chats = new Map(); // jid → { jid, name, messages: [], unread, wrote }
    this.sent = [];
    this.pollTimer = null;
  }
  get binary() {
    return path.join(this.dir, 'gateway', EXE);
  }
  installed() {
    try {
      return fs.statSync(this.binary).isFile();
    } catch {
      return false;
    }
  }
  saveSettings() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2));
  }
  state() {
    return {
      enabled: this.settings.enabled,
      installed: this.installed(),
      version: this.settings.version,
      link: this.link,
      error: this.error,
      progress: this.progress,
      qr: this.link === 'qr' ? this.qr : null,
      me: this.me,
      groups: this.settings.groups,
      quickReplies: [...this.settings.quickReplies],
    };
  }
  changed() {
    this.emit('state', this.state());
  }
  configure(v) {
    if (!v || typeof v !== 'object') throw Error('Geçersiz WhatsApp ayarı.');
    if ('groups' in v) {
      this.settings.groups = v.groups === true;
      // turned off: the groups' messages go away at once
      if (!this.settings.groups) for (const jid of [...this.chats.keys()]) if (isGroup(jid)) this.chats.delete(jid);
    }
    if ('quickReplies' in v) this.settings.quickReplies = cleanReplies(v.quickReplies);
    this.saveSettings();
    this.changed();
    return this.state();
  }

  // ── install ─────────────────────────────────────────────────────────────────
  async get(url, accept, limit) {
    const res = await this.fetchImpl(url, { headers: { Accept: accept, 'User-Agent': 'Charles-WhatsApp' }, redirect: 'follow' });
    if (!res.ok) throw Error(`İndirme başarısız (${res.status}).`);
    const len = Number(res.headers?.get?.('content-length') || 0);
    if (len > limit) throw Error('İndirilen dosya beklenenden büyük.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > limit) throw Error('İndirilen dosya beklenenden büyük.');
    return buf;
  }
  async install() {
    if (this.platform !== 'win32') throw Error('WhatsApp köprüsü şimdilik yalnızca Windows’ta kurulabiliyor.');
    if (this.installing) return this.installing;
    this.installing = (async () => {
      const before = this.link;
      this.link = 'installing';
      this.error = '';
      this.progress = 'Sürüm bilgisi alınıyor…';
      this.changed();
      try {
        const meta = JSON.parse((await this.get(RELEASE_API, 'application/vnd.github+json', MAX_BODY)).toString('utf8'));
        const picked = pickAssets(meta.assets);
        if (!picked) throw Error('Bu bilgisayar için WhatsApp köprüsü bulunamadı.');
        const sums = picked.sums ? (await this.get(picked.sums.browser_download_url, 'application/octet-stream', 256 * 1024)).toString('utf8') : '';
        const expected = expectedHash(picked.zip.name, sums, picked.zip.digest);
        if (!expected) throw Error('WhatsApp köprüsünün doğrulama özeti bulunamadı; kurulum yapılmadı.');
        if (picked.zip.size > MAX_ZIP) throw Error('İndirilen dosya beklenenden büyük.');
        this.progress = `İndiriliyor (${Math.max(1, Math.round((picked.zip.size || 0) / 1e6))} MB)…`;
        this.changed();
        const zip = await this.get(picked.zip.browser_download_url, 'application/octet-stream', picked.zip.size || MAX_ZIP);
        this.progress = 'Doğrulanıyor…';
        this.changed();
        if ((picked.zip.size && zip.length !== picked.zip.size) || crypto.createHash('sha256').update(zip).digest('hex') !== expected)
          throw Error('İndirilen dosya doğrulanamadı (SHA-256 uyuşmuyor); kurulum yapılmadı.');
        const files = this.unzip(new Uint8Array(zip));
        const entry = binaryEntry(Object.keys(files));
        if (!entry) throw Error('WhatsApp köprüsünün paketinde program bulunamadı.');
        const dir = path.dirname(this.binary);
        fs.mkdirSync(dir, { recursive: true });
        await this.stop();
        const temp = this.binary + '.download';
        fs.writeFileSync(temp, Buffer.from(files[entry]));
        try {
          fs.rmSync(this.binary, { force: true });
        } catch {}
        fs.renameSync(temp, this.binary);
        this.settings.version = String(meta.tag_name || '').replace(/^v/, '').slice(0, 40) || null;
        this.saveSettings();
        this.progress = '';
        this.link = before === 'installing' ? 'off' : before;
        this.changed();
        return this.settings.version;
      } catch (e) {
        this.link = 'error';
        this.error = e.message;
        this.progress = '';
        this.changed();
        throw e;
      } finally {
        this.installing = null;
      }
    })();
    return this.installing;
  }

  // ── run ─────────────────────────────────────────────────────────────────────
  async enable(on) {
    this.settings.enabled = !!on;
    this.saveSettings();
    if (on) await this.start();
    else await this.stop();
    return this.state();
  }
  async start() {
    if (!this.settings.enabled) return this.state();
    if (this.child) return this.state();
    if (!this.installed()) await this.install();
    this.link = 'starting';
    this.error = '';
    this.changed();
    this.killStale();
    this.secret = crypto.randomBytes(24).toString('hex');
    this.auth = 'charles:' + crypto.randomBytes(18).toString('hex');
    await this.listen();
    this.port = await freePort();
    const cwd = path.dirname(this.binary);
    const env = {
      ...process.env,
      APP_UI_ENABLED: 'false',
      APP_BASIC_AUTH: this.auth,
      WHATSAPP_WEBHOOK: `http://127.0.0.1:${this.server.address().port}/whatsapp`,
      WHATSAPP_WEBHOOK_SECRET: this.secret,
      WHATSAPP_WEBHOOK_EVENTS: 'message',
      // channels and status updates never reach Charles
      WHATSAPP_WEBHOOK_IGNORE_JIDS: '@newsletter,status@broadcast',
    };
    const child = this.spawnImpl(this.binary, ['rest', '--host=127.0.0.1', `--port=${this.port}`, '--auto-download-media=false'], {
      cwd,
      env,
      windowsHide: true,
      stdio: 'ignore', // the gateway's own output may quote messages: it goes nowhere
    });
    this.child = child;
    try {
      fs.writeFileSync(path.join(cwd, 'gateway.pid'), String(child.pid || ''));
    } catch {}
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      if (this.settings.enabled && this.link !== 'off') {
        this.link = 'error';
        this.error = 'WhatsApp köprüsü kapandı. Yeniden bağlanmak için “Yeniden başlat”a bas.';
        this.changed();
      }
    });
    child.on('error', (e) => {
      this.link = 'error';
      this.error = 'WhatsApp köprüsü başlatılamadı: ' + e.message;
      this.changed();
    });
    try {
      await this.waitHealthy();
      await this.ensureDevice();
      await this.poll();
    } catch (e) {
      this.link = 'error';
      this.error = e.message;
      this.changed();
    }
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => void this.poll().catch(() => {}), 4000);
    this.pollTimer.unref?.();
    return this.state();
  }
  /** A gateway left running by a Charles that did not close properly holds its database. */
  killStale() {
    if (this.platform !== 'win32') return;
    const file = path.join(path.dirname(this.binary), 'gateway.pid');
    let pid = 0;
    try {
      pid = Number(fs.readFileSync(file, 'utf8')) || 0;
    } catch {}
    if (!pid) return;
    try {
      const out = require('node:child_process').execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (out.toLowerCase().includes(EXE)) process.kill(pid);
    } catch {}
  }
  async stop() {
    ++this.photoGeneration;
    this.photoJobs.clear();
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.kill();
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.link = 'off';
    this.qr = null;
    this.chats.clear(); // messages are never kept beyond this
    this.changed();
  }
  listen() {
    if (this.server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/whatsapp') {
          res.writeHead(404).end();
          return;
        }
        const parts = [];
        let size = 0;
        req.on('data', (c) => {
          size += c.length;
          if (size > MAX_BODY) req.destroy();
          else parts.push(c);
        });
        req.on('end', () => {
          const body = Buffer.concat(parts);
          if (!sameSignature(req.headers['x-hub-signature-256'], signature(body, this.secret))) {
            res.writeHead(401).end();
            return;
          }
          res.writeHead(200).end('ok');
          const m = parseWebhook(body.toString('utf8'));
          if (m) this.receive(m);
        });
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        this.server = server;
        resolve();
      });
    });
  }
  async api(method, route, body, { raw = false, timeout = 15000, max = MAX_BODY } = {}) {
    if (!this.port) throw Error('WhatsApp köprüsü çalışmıyor.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await this.fetchImpl(`http://127.0.0.1:${this.port}${route}`, {
        method,
        headers: {
          Authorization: 'Basic ' + Buffer.from(this.auth).toString('base64'),
          'X-Device-Id': DEVICE,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        redirect: 'error',
      });
      const buf = await limitedBody(res, max);
      if (raw) return { ok: res.ok, status: res.status, buf, type: res.headers?.get?.('content-type') || '' };
      let json = null;
      try {
        json = JSON.parse(buf.toString('utf8'));
      } catch {}
      if (!res.ok) {
        const e = Error(json?.message || `WhatsApp köprüsü hata verdi (${res.status}).`);
        e.code = json?.code;
        e.status = res.status;
        throw e;
      }
      return json?.results ?? json;
    } finally {
      clearTimeout(timer);
    }
  }
  async waitHealthy() {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await this.api('GET', '/health', null, { raw: true, timeout: 2000 });
        if (r.ok) return;
      } catch {}
      if (!this.child) throw Error('WhatsApp köprüsü başlatılamadı.');
      await new Promise((r) => setTimeout(r, 500));
    }
    throw Error('WhatsApp köprüsü yanıt vermedi.');
  }
  async ensureDevice() {
    const list = await this.api('GET', '/devices');
    const devices = Array.isArray(list) ? list : [];
    if (!devices.some((d) => d?.id === DEVICE)) {
      try {
        await this.api('POST', '/devices', { device_id: DEVICE });
      } catch (e) {
        if (e.status !== 409 && !/already exists/i.test(e.message)) throw e;
      }
    }
  }
  async poll() {
    if (!this.child || this.polling) return;
    this.polling = true;
    try {
      const s = await this.api('GET', `/devices/${DEVICE}/status`);
      if (s?.is_logged_in) {
        const was = this.link;
        this.link = s.is_connected ? 'connected' : 'connecting';
        this.qr = null;
        if (!this.me) {
          try {
            const st = await this.api('GET', '/app/status');
            this.me = String(st?.jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
          } catch {}
        }
        if (was !== this.link) this.changed();
        return;
      }
      // not linked: a fresh QR code (they last ~30 s)
      if (this.link !== 'qr' || !this.qrUntil || now() > this.qrUntil) {
        const r = await this.api('GET', `/devices/${DEVICE}/login`, null, { timeout: 45000 });
        let pathName = '';
        try {
          pathName = new URL(String(r?.qr_link || '')).pathname; // the gateway's own path only
        } catch {}
        if (pathName && pathName !== '/') {
          const img = await this.api('GET', pathName, null, { raw: true });
          if (img.ok && img.buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
            this.qr = 'data:image/png;base64,' + img.buf.toString('base64');
        }
        this.qrUntil = now() + Math.max(10, Math.min(120, Number(r?.qr_duration) || 30)) * 1000 - 2000;
        this.link = 'qr';
        this.changed();
      }
    } catch (e) {
      if (e.code === 'ALREADY_LOGGED_IN') return;
      if (this.link !== 'error') {
        this.error = e.message;
        this.changed();
      }
    } finally {
      this.polling = false;
    }
  }
  async logout() {
    try {
      await this.api('POST', `/devices/${DEVICE}/logout`);
    } catch {}
    this.me = '';
    this.chats.clear();
    await this.stop();
    // the gateway's session of this account goes too
    try {
      fs.rmSync(path.join(path.dirname(this.binary), 'storages'), { recursive: true, force: true });
    } catch {}
    this.settings.enabled = false;
    this.saveSettings();
    this.changed();
    return this.state();
  }

  // ── messages ────────────────────────────────────────────────────────────────
  receive(m) {
    // v0.8.9: groups (and channels / status) only when "Grup mesajlarını da göster" is on
    if (m.group || isGroup(m.chat) || !isPerson(m.chat)) {
      if (!this.settings.groups || !/@g\.us$/.test(m.chat)) return;
    }
    let c = this.chats.get(m.chat);
    if (!c) {
      c = { jid: m.chat, name: '', messages: [], unread: 0, wrote: false };
      this.chats.set(m.chat, c);
    }
    if (c.messages.some((x) => x.id === m.id)) return;
    c.messages.push(m);
    c.messages = c.messages.slice(-20);
    // v0.8.11: a photo shows in the card once the gateway hands it over
    // v0.8.13: these later refreshes are marked `update`: they never reopen a card the user closed
    if (!m.mine && PHOTO_KINDS.includes(m.kind)) void this.photo(c, m).then((ok) => ok && this.emit('message', { ...this.preview(c), update: true }));
    if (!m.mine) {
      if (!isGroup(m.chat) && m.name) c.name = m.name;
      c.unread++;
      c.wrote = true;
      // v0.8.9: a group shows as the group (its name), with who wrote in the line below
      if (isGroup(m.chat) && !c.name) void this.groupName(m.chat).then((name) => {
        if (name && !c.name) {
          c.name = name;
          this.emit('message', { ...this.preview(c), update: true });
        }
      });
      this.emit('message', this.preview(c));
    } else c.unread = 0; // answered on the phone
  }
  /**
   * v0.8.11: the picture of a photo (or sticker) message as a small data URL, kept in memory
   * with the message. GOWA may store the original in its own statics directory;
   * Charles reads only the authenticated loopback URL and keeps the preview in memory.
   */
  async photo(c, m) {
    if (m.image) return true;
    if (m.photoRetryAt > now()) return false;
    const generation = this.photoGeneration;
    const key = `${c.jid}\n${m.id}`;
    let job = this.photoJobs.get(key);
    if (!job) {
      job = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (generation !== this.photoGeneration) return null;
          try {
            const response = await this.api('GET', `/message/${encodeURIComponent(m.id)}/download?phone=${encodeURIComponent(c.jid)}`, null, { raw: true, timeout: 30000, max: MAX_PHOTO });
            if (!response.ok) throw Error('Fotoğraf henüz hazır değil.');
            let bytes = response.buf;
            if (!photoType(bytes)) {
              const json = JSON.parse(bytes.toString('utf8'));
              const metadata = json?.results ?? json;
              if (typeof metadata?.data === 'string') {
                const data = metadata.data.replace(/^data:[^,]*,/, '');
                if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) return null;
                bytes = Buffer.from(data, 'base64');
              } else {
                if (Number(metadata?.file_size || 0) > MAX_PHOTO) return null;
                const route = localPhotoRoute(metadata, this.port);
                if (!route) return null;
                const file = await this.api('GET', route, null, { raw: true, timeout: 30000, max: MAX_PHOTO });
                if (!file.ok) throw Error('Fotoğraf henüz hazır değil.');
                bytes = file.buf;
              }
            }
            const type = photoType(bytes);
            if (!type || bytes.length > MAX_PHOTO) return null;
            let small = null;
            try { small = this.thumbnail?.(bytes, type); } catch {}
            return small || (bytes.length <= 1.5 * 1024 * 1024 ? `data:${type};base64,${bytes.toString('base64')}` : null);
          } catch {
            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
        return null;
      })();
      this.photoJobs.set(key, job);
      job.finally(() => { if (this.photoJobs.get(key) === job) this.photoJobs.delete(key); });
    }
    const image = await job;
    if (generation !== this.photoGeneration) return false;
    if (image) {
      m.image = image;
      // The conversation can have refreshed its stored-message objects while
      // downloading. Update that canonical copy as well as the webhook object.
      const current = c.messages?.find(x => x.id === m.id);
      if (current) current.image = image;
    } else m.photoRetryAt = now() + 5000;
    return Boolean(image);
  }
  /** v0.8.9: a group's subject (GOWA's group info), remembered while Charles runs. */
  async groupName(jid) {
    this.groups ||= new Map();
    if (this.groups.has(jid)) return this.groups.get(jid);
    let name = '';
    try {
      const r = await this.api('GET', `/group/info?group_id=${encodeURIComponent(jid)}`);
      name = String(r?.Name || r?.GroupName?.Name || r?.name || r?.subject || '').trim().slice(0, 80);
    } catch {}
    if (name) this.groups.set(jid, name);
    return name;
  }
  preview(c) {
    const last = [...c.messages].reverse().find((m) => !m.mine) || c.messages.at(-1);
    const group = isGroup(c.jid);
    const body = last ? last.text || last.media || '' : '';
    return {
      chat: c.jid,
      last: last?.id || null,
      name: c.name || (group ? 'WhatsApp grubu' : (last?.name ?? '') || '+' + c.jid.split('@')[0]),
      group,
      sender: group && last && !last.mine ? last.name || '+' + String(last.from || '').split('@')[0].split(':')[0] : '',
      text: group && last && !last.mine && (last.name || last.from) ? `${last.name || '+' + String(last.from).split('@')[0].split(':')[0]}: ${body}` : body,
      media: last?.media || null,
      image: last?.image || null,
      at: last?.at || now(),
      unread: c.unread,
    };
  }
  async conversation(jid) {
    const c = this.chats.get(jid);
    if (!c) throw Error('Sohbet bulunamadı.');
    try {
      const r = await this.api('GET', `/chat/${encodeURIComponent(jid)}/messages?limit=10`);
      const list = parseMessages(r);
      if (list.length) {
        // photos already fetched stay with their messages
        const old = new Map(c.messages.map((x) => [x.id, x]));
        for (const x of list) {
          const o = old.get(x.id);
          if (o?.image) x.image = o.image;
          if (o?.photoRetryAt) x.photoRetryAt = o.photoRetryAt;
        }
        c.messages = list.slice(-20);
      }
    } catch {}
    if (isGroup(jid) && !c.name) c.name = await this.groupName(jid);
    // the photos of the last messages shown in the card (at most three new downloads)
    const shown = c.messages.slice(-10);
    await Promise.all(shown.filter((x) => !x.mine && PHOTO_KINDS.includes(x.kind) && !x.image).slice(-3).map((x) => this.photo(c, x)));
    return { ...this.preview(c), messages: shown.map(({ id, text, media, image, at, mine, name }) => ({ id, text, media, image: image || null, at, mine, name })) };
  }
  async markRead(jid) {
    const c = this.chats.get(jid);
    if (!c) return false;
    c.unread = 0;
    const last = [...c.messages].reverse().find((m) => !m.mine);
    if (last)
      try {
        await this.api('POST', `/message/${encodeURIComponent(last.id)}/read`, { phone: jid });
      } catch {}
    return true;
  }
  /** Sends `text` to a chat that wrote to the user (a reply), when the user pressed send. */
  async reply(jid, text) {
    const c = this.chats.get(jid);
    if (!c || !c.wrote) throw Error('Yalnızca sana yazan bir sohbete yanıt verilebilir.');
    return this.send(jid, text);
  }
  /** "WhatsApp'tan Ahmet'e … at" with a saved number: straight through the gateway. */
  async sendTo(phone, text) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!/^\d{8,16}$/.test(digits)) throw Error('Geçersiz telefon numarası.');
    return this.send(digits + '@s.whatsapp.net', text);
  }
  async send(jid, text) {
    if (this.link !== 'connected') throw Error('WhatsApp bağlı değil.');
    text = String(text || '').trim();
    if (!text) throw Error('Mesaj boş.');
    if (text.length > 4000) throw Error('Mesaj en fazla 4000 karakter olabilir.');
    const t = now();
    this.sent = this.sent.filter((x) => t - x < SEND_LIMIT[1]);
    if (this.sent.length >= SEND_LIMIT[0]) throw Error('Çok hızlı mesaj gönderiliyor; bir dakika bekle.');
    this.sent.push(t);
    const r = await this.api('POST', '/send/message', { phone: jid, message: text });
    const c = this.chats.get(jid);
    if (c) {
      c.unread = 0;
      c.messages.push({ id: String(r?.message_id || 'me-' + t), chat: jid, from: 'me', name: '', text, media: null, at: t, mine: true });
      c.messages = c.messages.slice(-20);
    }
    return { id: r?.message_id || null };
  }
}

module.exports = {
  WhatsAppLive,
  pickAssets,
  expectedHash,
  binaryEntry,
  parseWebhook,
  parseMessages,
  signature,
  cleanReplies,
  isPerson,
  isGroup,
  DEFAULT_REPLIES,
  EXE,
};
