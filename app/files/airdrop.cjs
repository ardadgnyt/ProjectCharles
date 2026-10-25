'use strict';
// v0.9.2: AirDrop (_airdrop._tcp.local HTTPS /Discover, /Ask, /Upload with bplist00 + CPIO/gzip)
// plus LocalSend v2 compatibility over Wi-Fi LAN for iPhone / iPad / Mac / PC.
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  buildMdnsQuery,
  buildMdnsAnnouncement,
  parseMdnsPacket,
  getLocalIPv4,
} = require('./quickshare.cjs');

const MDNS_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const AIRDROP_SERVICE = '_airdrop._tcp.local';
const LOCALSEND_SERVICE = '_localsend._tcp.local';
const LOCALSEND_MCAST = '224.0.0.167';
const LOCALSEND_PORT = 53317;
const AIRDROP_FLAGS = '139'; // 0x8b: URL + DVZip + MixedTypes + Discover

// --- Pure Node ASN.1 DER Self-Signed X.509 TLS Certificate Generator ---
function derLen(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function derTag(tag, content) {
  const b = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([Buffer.from([tag]), derLen(b.length), b]);
}
function derSeq(...items) {
  return derTag(0x30, Buffer.concat(items));
}
function derSet(...items) {
  return derTag(0x31, Buffer.concat(items));
}
function derInt(bufOrNum) {
  let b = Buffer.isBuffer(bufOrNum) ? bufOrNum : Buffer.from([bufOrNum]);
  while (b.length > 1 && b[0] === 0) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return derTag(0x02, b);
}
function derOid(oidStr) {
  const parts = oidStr.split('.').map(Number);
  const out = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const tmp = [v & 0x7f];
    v >>= 7;
    while (v > 0) {
      tmp.unshift((v & 0x7f) | 0x80);
      v >>= 7;
    }
    out.push(...tmp);
  }
  return derTag(0x06, Buffer.from(out));
}
function derUtf8(str) {
  return derTag(0x0c, Buffer.from(String(str), 'utf8'));
}
function derUtcTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const s =
    pad(date.getUTCFullYear() % 100) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z';
  return derTag(0x17, Buffer.from(s, 'ascii'));
}
function derBitString(buf) {
  return derTag(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function generateSelfSignedCert(commonName = 'Charles-AirDrop') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  // sha256WithRSAEncryption = 1.2.840.113549.1.1.11
  const sigAlg = derSeq(derOid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00]));
  // CN = 2.5.4.3
  const name = derSeq(derSet(derSeq(derOid('2.5.4.3'), derUtf8(commonName))));
  const now = new Date(Date.now() - 3600 * 1000);
  const exp = new Date(Date.now() + 3650 * 24 * 3600 * 1000);
  const validity = derSeq(derUtcTime(now), derUtcTime(exp));
  const serial = derInt(crypto.randomBytes(12));
  const version = derTag(0xa0, derInt(2)); // v3
  const tbs = derSeq(version, serial, sigAlg, name, validity, name, publicKey);
  const sig = crypto.sign('sha256', tbs, privateKey);
  const certDer = derSeq(tbs, sigAlg, derBitString(sig));
  const b64 = certDer.toString('base64').replace(/(.{64})/g, '$1\n').trim();
  const certPem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
  const fingerprint = crypto.createHash('sha256').update(certDer).digest('hex');
  return { key: privateKey, cert: certPem, fingerprint };
}

// --- Binary Property List (bplist00) Encoder & Decoder ---
function encodeBplist(rootObj) {
  const objects = [];
  function intern(val) {
    if (val === null || val === undefined) {
      const idx = objects.length;
      objects.push({ type: 'null' });
      return idx;
    }
    if (typeof val === 'boolean') {
      const idx = objects.length;
      objects.push({ type: 'bool', value: val });
      return idx;
    }
    if (typeof val === 'number') {
      const idx = objects.length;
      objects.push({ type: Number.isInteger(val) ? 'int' : 'real', value: val });
      return idx;
    }
    if (typeof val === 'string') {
      const idx = objects.length;
      objects.push({ type: 'string', value: val });
      return idx;
    }
    if (Buffer.isBuffer(val)) {
      const idx = objects.length;
      objects.push({ type: 'data', value: val });
      return idx;
    }
    if (Array.isArray(val)) {
      const idx = objects.length;
      const node = { type: 'array', refs: [] };
      objects.push(node);
      node.refs = val.map((item) => intern(item));
      return idx;
    }
    if (typeof val === 'object') {
      const idx = objects.length;
      const node = { type: 'dict', krefs: [], vrefs: [] };
      objects.push(node);
      for (const [k, v] of Object.entries(val)) {
        if (v === undefined) continue;
        node.krefs.push(intern(String(k)));
        node.vrefs.push(intern(v));
      }
      return idx;
    }
    return intern(String(val));
  }
  intern(rootObj);
  const numObjects = objects.length;
  const refSize = numObjects < 256 ? 1 : 2;
  const writeRef = (r) => {
    const b = Buffer.alloc(refSize);
    if (refSize === 1) b.writeUInt8(r, 0);
    else b.writeUInt16BE(r, 0);
    return b;
  };
  const writeLenHeader = (markerHi, len) => {
    if (len < 15) return Buffer.from([(markerHi << 4) | len]);
    const lenBuf = encodeIntBody(len);
    return Buffer.concat([Buffer.from([(markerHi << 4) | 0x0f]), lenBuf]);
  };
  function encodeIntBody(n) {
    if (n >= 0 && n <= 0xff) return Buffer.from([0x10, n]);
    if (n >= 0 && n <= 0xffff) {
      const b = Buffer.alloc(3);
      b[0] = 0x11;
      b.writeUInt16BE(n, 1);
      return b;
    }
    if (n >= 0 && n <= 0xffffffff) {
      const b = Buffer.alloc(5);
      b[0] = 0x12;
      b.writeUInt32BE(n, 1);
      return b;
    }
    const b = Buffer.alloc(9);
    b[0] = 0x13;
    b.writeBigInt64BE(BigInt(n), 1);
    return b;
  }

  const chunks = [Buffer.from('bplist00', 'ascii')];
  let offset = 8;
  const offsets = [];
  for (const obj of objects) {
    offsets.push(offset);
    let encoded;
    if (obj.type === 'null') encoded = Buffer.from([0x00]);
    else if (obj.type === 'bool') encoded = Buffer.from([obj.value ? 0x09 : 0x08]);
    else if (obj.type === 'int') encoded = encodeIntBody(obj.value);
    else if (obj.type === 'real') {
      const b = Buffer.alloc(9);
      b[0] = 0x23;
      b.writeDoubleBE(obj.value, 1);
      encoded = b;
    } else if (obj.type === 'data') {
      encoded = Buffer.concat([writeLenHeader(0x4, obj.value.length), obj.value]);
    } else if (obj.type === 'string') {
      const isAscii = /^[\x00-\x7f]*$/.test(obj.value);
      if (isAscii) {
        const b = Buffer.from(obj.value, 'ascii');
        encoded = Buffer.concat([writeLenHeader(0x5, b.length), b]);
      } else {
        const u16 = Buffer.alloc(obj.value.length * 2);
        for (let i = 0; i < obj.value.length; i++) u16.writeUInt16BE(obj.value.charCodeAt(i), i * 2);
        encoded = Buffer.concat([writeLenHeader(0x6, obj.value.length), u16]);
      }
    } else if (obj.type === 'array') {
      encoded = Buffer.concat([writeLenHeader(0xa, obj.refs.length), ...obj.refs.map(writeRef)]);
    } else if (obj.type === 'dict') {
      encoded = Buffer.concat([
        writeLenHeader(0xd, obj.krefs.length),
        ...obj.krefs.map(writeRef),
        ...obj.vrefs.map(writeRef),
      ]);
    } else {
      encoded = Buffer.from([0x00]);
    }
    chunks.push(encoded);
    offset += encoded.length;
  }
  const offsetTableOffset = offset;
  const maxOffset = Math.max(offset, 1);
  const offsetIntSize = maxOffset <= 0xff ? 1 : maxOffset <= 0xffff ? 2 : 4;
  const offsetTable = Buffer.alloc(offsets.length * offsetIntSize);
  for (let i = 0; i < offsets.length; i++) {
    if (offsetIntSize === 1) offsetTable.writeUInt8(offsets[i], i);
    else if (offsetIntSize === 2) offsetTable.writeUInt16BE(offsets[i], i * 2);
    else offsetTable.writeUInt32BE(offsets[i], i * 4);
  }
  chunks.push(offsetTable);
  const trailer = Buffer.alloc(32);
  trailer.writeUInt8(offsetIntSize, 6);
  trailer.writeUInt8(refSize, 7);
  trailer.writeBigUInt64BE(BigInt(numObjects), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);
  chunks.push(trailer);
  return Buffer.concat(chunks);
}

function decodeBplist(buf) {
  if (!buf || buf.length < 40) return {};
  const magic = buf.subarray(0, 6).toString('ascii');
  if (magic !== 'bplist') {
    const str = buf.toString('utf8');
    if (str.includes('<plist')) return parseXmlPlistSimple(str);
    return {};
  }
  const trailer = buf.subarray(buf.length - 32);
  const offsetIntSize = trailer.readUInt8(6);
  const objectRefSize = trailer.readUInt8(7);
  const numObjects = Number(trailer.readBigUInt64BE(8));
  const topObject = Number(trailer.readBigUInt64BE(16));
  const offsetTableOffset = Number(trailer.readBigUInt64BE(24));

  const readUIntBE = (pos, bytes) => {
    let v = 0n;
    for (let i = 0; i < bytes; i++) v = (v << 8n) | BigInt(buf[pos + i]);
    return Number(v);
  };
  const offsets = [];
  for (let i = 0; i < numObjects; i++) {
    offsets.push(readUIntBE(offsetTableOffset + i * offsetIntSize, offsetIntSize));
  }
  const visited = new Map();
  function readLen(pos, lowNibble) {
    if (lowNibble !== 0x0f) return { len: lowNibble, next: pos };
    const intMarker = buf[pos];
    const byteCount = 1 << (intMarker & 0x0f);
    return { len: readUIntBE(pos + 1, byteCount), next: pos + 1 + byteCount };
  }
  function parseAt(objIdx) {
    if (visited.has(objIdx)) return visited.get(objIdx);
    const pos = offsets[objIdx];
    if (pos === undefined || pos >= buf.length) return null;
    const marker = buf[pos];
    const hi = (marker & 0xf0) >> 4;
    const lo = marker & 0x0f;
    if (hi === 0x0) {
      if (lo === 0x08) return false;
      if (lo === 0x09) return true;
      return null;
    }
    if (hi === 0x1) {
      const n = 1 << lo;
      return readUIntBE(pos + 1, n);
    }
    if (hi === 0x2) {
      if (lo === 2) return buf.readFloatBE(pos + 1);
      if (lo === 3) return buf.readDoubleBE(pos + 1);
      return 0;
    }
    if (hi === 0x4) {
      const { len, next } = readLen(pos + 1, lo);
      return Buffer.from(buf.subarray(next, next + len));
    }
    if (hi === 0x5) {
      const { len, next } = readLen(pos + 1, lo);
      return buf.subarray(next, next + len).toString('ascii');
    }
    if (hi === 0x6) {
      const { len, next } = readLen(pos + 1, lo);
      const raw = buf.subarray(next, next + len * 2);
      let s = '';
      for (let i = 0; i + 1 < raw.length; i += 2) s += String.fromCharCode(raw.readUInt16BE(i));
      return s;
    }
    if (hi === 0xa) {
      const { len, next } = readLen(pos + 1, lo);
      const arr = [];
      visited.set(objIdx, arr);
      for (let i = 0; i < len; i++) {
        const ref = readUIntBE(next + i * objectRefSize, objectRefSize);
        arr.push(parseAt(ref));
      }
      return arr;
    }
    if (hi === 0xd) {
      const { len, next } = readLen(pos + 1, lo);
      const dict = {};
      visited.set(objIdx, dict);
      const vStart = next + len * objectRefSize;
      for (let i = 0; i < len; i++) {
        const kRef = readUIntBE(next + i * objectRefSize, objectRefSize);
        const vRef = readUIntBE(vStart + i * objectRefSize, objectRefSize);
        const k = parseAt(kRef);
        if (k !== null && k !== undefined) dict[String(k)] = parseAt(vRef);
      }
      return dict;
    }
    return null;
  }
  return parseAt(topObject) || {};
}

function parseXmlPlistSimple(xml) {
  const out = {};
  const re = /<key>([^<]+)<\/key>\s*<(string|integer|true|false)>([^<]*)<\/\2>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, k, type, val] = m;
    if (type === 'true') out[k] = true;
    else if (type === 'false') out[k] = false;
    else if (type === 'integer') out[k] = Number(val);
    else out[k] = val;
  }
  return out;
}

// --- CPIO (070707 odc & 070701 newc) + Gzip Archive Codec for AirDrop /Upload ---
function packCpioGzip(files) {
  const entries = [];
  let ino = 1;
  const mtime = Math.floor(Date.now() / 1000);
  const writeOdcEntry = (name, mode, bodyBuf) => {
    const nameBuf = Buffer.concat([Buffer.from(name, 'utf8'), Buffer.from([0])]);
    const oct6 = (v) => (v & 0o777777).toString(8).padStart(6, '0');
    const oct11 = (v) => Math.max(0, Number(v)).toString(8).padStart(11, '0');
    const hdr =
      '070707' +
      oct6(1) + // dev
      oct6(ino++) + // ino
      oct6(mode) + // mode
      oct6(501) + // uid
      oct6(20) + // gid
      oct6(1) + // nlink
      oct6(0) + // rdev
      oct11(mtime) + // mtime
      oct6(nameBuf.length) + // namesize
      oct11(bodyBuf.length); // filesize
    return Buffer.concat([Buffer.from(hdr, 'ascii'), nameBuf, bodyBuf]);
  };
  entries.push(writeOdcEntry('.', 0o040755, Buffer.alloc(0)));
  for (const f of files) {
    const filePath = typeof f === 'string' ? f : f.path;
    const baseName = path.basename(filePath);
    const data = fs.readFileSync(filePath);
    entries.push(writeOdcEntry('./' + baseName, 0o100644, data));
  }
  entries.push(writeOdcEntry('TRAILER!!!', 0, Buffer.alloc(0)));
  return zlib.gzipSync(Buffer.concat(entries));
}

function safeRelPath(rawName) {
  const norm = String(rawName || '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
  const parts = norm.split('/').filter((p) => p && p !== '.' && p !== '..');
  if (!parts.length) return '';
  return parts.map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, '_')).join('/');
}

function extractCpioGzip(rawBuf, destDir) {
  let buf = rawBuf;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    buf = zlib.gunzipSync(buf);
  }
  const saved = [];
  let pos = 0;
  while (pos + 6 <= buf.length) {
    const magic = buf.subarray(pos, pos + 6).toString('ascii');
    if (magic === '070707') {
      if (pos + 76 > buf.length) break;
      const hdr = buf.subarray(pos, pos + 76).toString('ascii');
      const mode = parseInt(hdr.slice(18, 24), 8);
      const namesize = parseInt(hdr.slice(59, 65), 8);
      const filesize = parseInt(hdr.slice(65, 76), 8);
      pos += 76;
      if (pos + namesize > buf.length) break;
      const name = buf
        .subarray(pos, pos + namesize)
        .toString('utf8')
        .replace(/\0+$/, '');
      pos += namesize;
      if (pos + filesize > buf.length) break;
      const fileData = buf.subarray(pos, pos + filesize);
      pos += filesize;
      if (name === 'TRAILER!!!') break;
      const rel = safeRelPath(name);
      if (!rel) continue;
      const isDir = (mode & 0o170000) === 0o040000;
      const isFile = (mode & 0o170000) === 0o100000;
      if (isDir) {
        fs.mkdirSync(path.join(destDir, rel), { recursive: true });
      } else if (isFile) {
        const outPath = uniqueFile(destDir, path.basename(rel));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, fileData);
        saved.push({ name: path.basename(outPath), path: outPath, size: fileData.length });
      }
    } else if (magic === '070701' || magic === '070702') {
      if (pos + 110 > buf.length) break;
      const hdr = buf.subarray(pos, pos + 110).toString('ascii');
      const mode = parseInt(hdr.slice(14, 22), 16);
      const filesize = parseInt(hdr.slice(54, 62), 16);
      const namesize = parseInt(hdr.slice(94, 102), 16);
      pos += 110;
      const name = buf
        .subarray(pos, pos + namesize)
        .toString('utf8')
        .replace(/\0+$/, '');
      pos += namesize;
      while (pos % 4 !== 0) pos++;
      const fileData = buf.subarray(pos, pos + filesize);
      pos += filesize;
      while (pos % 4 !== 0) pos++;
      if (name === 'TRAILER!!!') break;
      const rel = safeRelPath(name);
      if (!rel) continue;
      const isFile = (mode & 0o170000) === 0o100000;
      if (isFile) {
        const outPath = uniqueFile(destDir, path.basename(rel));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, fileData);
        saved.push({ name: path.basename(outPath), path: outPath, size: fileData.length });
      }
    } else {
      break;
    }
  }
  return saved;
}

function uniqueFile(dir, rawName) {
  const safe = path.basename(String(rawName || 'dosya')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'dosya';
  const ext = path.extname(safe);
  const stem = path.basename(safe, ext);
  let out = path.join(dir, safe);
  let i = 2;
  while (fs.existsSync(out)) out = path.join(dir, `${stem} (${i++})${ext}`);
  return out;
}

function fileUti(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const map = {
    '.jpg': 'public.jpeg',
    '.jpeg': 'public.jpeg',
    '.png': 'public.png',
    '.gif': 'com.compuserve.gif',
    '.heic': 'public.heic',
    '.webp': 'org.webmproject.webp',
    '.mp4': 'public.mpeg-4',
    '.mov': 'com.apple.quicktime-movie',
    '.mp3': 'public.mp3',
    '.m4a': 'com.apple.m4a-audio',
    '.wav': 'com.microsoft.waveform-audio',
    '.pdf': 'com.adobe.pdf',
    '.zip': 'public.zip-archive',
    '.txt': 'public.plain-text',
    '.json': 'public.json',
  };
  return map[ext] || 'public.data';
}

class AirDropEngine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.deviceName = opts.deviceName || os.hostname() || 'Charles PC';
    this.downloadDir = opts.downloadDir || path.join(os.homedir(), 'Downloads');
    this.senderId = crypto.randomBytes(6).toString('hex');
    this.tls = generateSelfSignedCert(this.deviceName);
    this.server = null;
    this.port = 0;
    this.mdns = null;
    this.lsSocket = null;
    this.announceTimer = null;
    this.visible = true;
    this.peers = new Map();
    this.serviceRecords = new Map();
    this.hostAddresses = new Map();
    this.pendingSessions = new Map();
    this.lastAirDropPeer = null;
  }

  async start() {
    if (this.server) return this.port;
    this.server = https.createServer(
      { key: this.tls.key, cert: this.tls.cert, requestCert: false, rejectUnauthorized: false },
      (req, res) => {
        this.#handleRequest(req, res).catch((err) => {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end();
          }
          this.emit('error', err);
        });
      },
    );
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '0.0.0.0', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
    this.#startDiscovery();
    return this.port;
  }

  stop() {
    clearInterval(this.announceTimer);
    this.announceTimer = null;
    for (const s of [this.mdns, this.lsSocket]) {
      if (s) {
        try {
          s.close();
        } catch {}
      }
    }
    this.mdns = null;
    this.lsSocket = null;
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
    }
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.announce();
  }

  scan() {
    if (this.mdns) {
      try {
        const q = buildMdnsQuery([AIRDROP_SERVICE, LOCALSEND_SERVICE]);
        this.mdns.send(q, 0, q.length, MDNS_PORT, MDNS_ADDR);
      } catch {}
    }
    if (this.lsSocket && this.port) {
      try {
        const msg = Buffer.from(
          JSON.stringify({
            alias: this.deviceName,
            version: '2.1',
            deviceModel: 'Windows PC',
            deviceType: 'desktop',
            fingerprint: this.tls.fingerprint,
            port: this.port,
            protocol: 'https',
            download: false,
            announce: true,
          }),
          'utf8',
        );
        this.lsSocket.send(msg, 0, msg.length, LOCALSEND_PORT, LOCALSEND_MCAST);
      } catch {}
    }
  }

  announce() {
    if (!this.port || !this.visible) return;
    const ip = getLocalIPv4();
    if (this.mdns) {
      try {
        const adPkt = buildMdnsAnnouncement({
          service: AIRDROP_SERVICE,
          instanceName: this.senderId,
          hostName: `charles-ad-${this.senderId.slice(0, 6)}`,
          ip,
          port: this.port,
          txtEntries: [`flags=${AIRDROP_FLAGS}`],
        });
        this.mdns.send(adPkt, 0, adPkt.length, MDNS_PORT, MDNS_ADDR);
      } catch {}
    }
  }

  #startDiscovery() {
    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.unref();
      this.mdns = sock;
      sock.on('error', () => {});
      sock.on('message', (msg, rinfo) => this.#onMdns(msg, rinfo));
      sock.bind(MDNS_PORT, '0.0.0.0', () => {
        if (this.mdns !== sock) return;
        try {
          const ip = getLocalIPv4();
          sock.addMembership(MDNS_ADDR, ip !== '127.0.0.1' ? ip : undefined);
          sock.setMulticastTTL(255);
          sock.setMulticastLoopback(true);
        } catch {}
        this.announce();
        this.scan();
        this.announceTimer = setInterval(() => {
          if (this.visible) this.announce();
        }, 8000);
        this.announceTimer.unref?.();
      });
    } catch {}

    try {
      const ls = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      ls.unref();
      this.lsSocket = ls;
      ls.on('error', () => {});
      ls.on('message', (msg, rinfo) => this.#onLocalSendUdp(msg, rinfo));
      ls.bind(LOCALSEND_PORT, '0.0.0.0', () => {
        if (this.lsSocket !== ls) return;
        try {
          const ip = getLocalIPv4();
          ls.addMembership(LOCALSEND_MCAST, ip !== '127.0.0.1' ? ip : undefined);
          ls.setMulticastLoopback(true);
        } catch {}
      });
    } catch {}
  }

  #onLocalSendUdp(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString('utf8'));
      if (!data || data.fingerprint === this.tls.fingerprint) return;
      const ip = rinfo?.address;
      const port = Number(data.port) || LOCALSEND_PORT;
      if (!ip) return;
      const key = `ls:${ip}:${port}`;
      const peer = {
        id: 'ad:' + key,
        protocol: 'airdrop',
        subProtocol: 'localsend',
        name: data.alias || data.deviceModel || 'iPhone / AirDrop',
        host: ip,
        port,
        https: data.protocol !== 'http',
        deviceType: data.deviceType === 'mobile' ? 'phone' : 'laptop',
        seenAt: Date.now(),
      };
      this.peers.set(key, peer);
      this.emit('peers', Array.from(this.peers.values()));
    } catch {}
  }

  #onMdns(msg, rinfo) {
    const parsed = parseMdnsPacket(msg);
    if (!parsed) return;
    if (
      this.visible &&
      parsed.questions.some((q) => {
        const low = q.name.toLowerCase();
        return low.includes('_airdrop._tcp') || low.includes('_localsend._tcp');
      })
    ) {
      this.announce();
    }
    let changed = false;
    for (const r of parsed.records) {
      if (r.type === 1 && r.ip) {
        this.hostAddresses.set(r.name.toLowerCase(), r.ip);
      }
      const low = r.name.toLowerCase();
      if (low.endsWith(AIRDROP_SERVICE) || low.endsWith(LOCALSEND_SERVICE)) {
        if (r.name.startsWith(this.senderId)) continue;
        const cur = this.serviceRecords.get(r.name) || {
          key: r.name,
          isLocalSend: low.endsWith(LOCALSEND_SERVICE),
          rinfoIp: rinfo?.address,
        };
        if (rinfo?.address) cur.rinfoIp = rinfo.address;
        if (r.type === 33) {
          cur.port = r.port;
          cur.target = r.target;
        }
        if (r.type === 16 && r.txt) {
          cur.txt = { ...(cur.txt || {}), ...r.txt };
        }
        if (r.ttl === 0) {
          this.serviceRecords.delete(r.name);
          if (this.peers.delete(r.name)) changed = true;
          continue;
        }
        this.serviceRecords.set(r.name, cur);
      }
    }
    for (const [key, rec] of this.serviceRecords.entries()) {
      if (!rec.port) continue;
      const ip = (rec.target && this.hostAddresses.get(rec.target.toLowerCase())) || rec.rinfoIp;
      if (!ip) continue;
      if (ip === getLocalIPv4() && rec.port === this.port) continue;
      const rawInstance = key.split('.')[0];
      const peer = {
        id: 'ad:' + key,
        protocol: 'airdrop',
        subProtocol: rec.isLocalSend ? 'localsend' : 'airdrop',
        name: rec.txt?.alias || (rec.isLocalSend ? rawInstance : `AirDrop (${rawInstance})`),
        host: ip,
        port: rec.port,
        https: true,
        deviceType: 'phone',
        seenAt: Date.now(),
      };
      const prev = this.peers.get(key);
      if (!prev || prev.host !== peer.host || prev.port !== peer.port) {
        changed = true;
        if (!rec.isLocalSend) {
          this.#probeAirDropName(key, peer).catch(() => {});
        }
      }
      this.peers.set(key, peer);
    }
    if (changed) this.emit('peers', Array.from(this.peers.values()));
  }

  async #probeAirDropName(key, peer) {
    const body = encodeBplist({});
    const resp = await this.#httpsPost(peer.host, peer.port, '/Discover', body, 'application/octet-stream');
    if (resp.statusCode === 200 && resp.body.length) {
      const plist = decodeBplist(resp.body);
      if (plist?.ReceiverComputerName) {
        peer.name = String(plist.ReceiverComputerName);
        peer.model = String(plist.ReceiverModelName || '');
        this.peers.set(key, peer);
        this.emit('peers', Array.from(this.peers.values()));
      }
    }
  }

  async #handleRequest(req, res) {
    const urlObj = new URL(req.url || '/', 'https://localhost');
    const pathname = urlObj.pathname;

    // --- Apple AirDrop HTTP Endpoints (/Discover, /Ask, /Upload) ---
    if (req.method === 'POST' && pathname === '/Discover') {
      await this.#readBody(req, 256 * 1024);
      const capabilities = Buffer.from(JSON.stringify({ Version: 1 }), 'utf8');
      const reply = encodeBplist({
        ReceiverComputerName: this.deviceName,
        ReceiverModelName: 'Windows PC',
        ReceiverMediaCapabilities: capabilities,
      });
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(reply.length),
      });
      res.end(reply);
      return;
    }

    if (req.method === 'POST' && pathname === '/Ask') {
      const raw = await this.#readBody(req, 2 * 1024 * 1024);
      const plist = decodeBplist(raw);
      const peerName = String(plist.SenderComputerName || plist.SenderModelName || 'iPhone / Mac');
      const rawFiles = Array.isArray(plist.Files) ? plist.Files : [];
      const summaryFiles = rawFiles.map((f) => ({
        name: String(f?.FileName || 'Dosya'),
        size: Number(f?.FileSize || 0),
      }));
      const sessionId = 'ad-in-' + crypto.randomBytes(4).toString('hex');
      let allow = this.visible;
      if (allow && this.listenerCount('offer') > 0) {
        allow = await new Promise((resolve) => {
          this.emit('offer', {
            id: sessionId,
            protocol: 'airdrop',
            peerName,
            files: summaryFiles.length ? summaryFiles : [{ name: 'AirDrop Dosyası', size: 0 }],
            respond: (ok) => resolve(Boolean(ok)),
          });
        });
      }
      if (!allow) {
        res.writeHead(403);
        res.end();
        return;
      }
      this.lastAirDropPeer = { id: sessionId, peerName };
      const reply = encodeBplist({
        ReceiverModelName: 'Windows PC',
        ReceiverComputerName: this.deviceName,
      });
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(reply.length),
      });
      res.end(reply);
      return;
    }

    if (req.method === 'POST' && pathname === '/Upload') {
      const peerInfo = this.lastAirDropPeer || {
        id: 'ad-in-' + crypto.randomBytes(4).toString('hex'),
        peerName: 'AirDrop Cihazı',
      };
      const raw = await this.#readBody(req, 1024 * 1024 * 1024, (transferred, total) => {
        this.emit('progress', {
          id: peerInfo.id,
          direction: 'receive',
          protocol: 'airdrop',
          peerName: peerInfo.peerName,
          fileName: 'AirDrop Paketi',
          transferred,
          total: total || transferred,
        });
      });
      fs.mkdirSync(this.downloadDir, { recursive: true });
      const saved = extractCpioGzip(raw, this.downloadDir);
      res.writeHead(200);
      res.end();
      if (saved.length) {
        this.emit('received', {
          id: peerInfo.id,
          protocol: 'airdrop',
          peerName: peerInfo.peerName,
          files: saved,
        });
      }
      return;
    }

    // --- LocalSend v2 Endpoints (Wi-Fi iOS / Android / Desktop Compatibility) ---
    if (req.method === 'GET' && pathname === '/api/localsend/v2/info') {
      const info = JSON.stringify({
        alias: this.deviceName,
        version: '2.1',
        deviceModel: 'Windows PC',
        deviceType: 'desktop',
        fingerprint: this.tls.fingerprint,
        download: false,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(info);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/localsend/v2/prepare-upload') {
      const raw = await this.#readBody(req, 1024 * 1024);
      const body = JSON.parse(raw.toString('utf8'));
      const peerName = body?.info?.alias || 'Cihaz';
      const filesObj = body?.files || {};
      const entries = Object.values(filesObj);
      const summaryFiles = entries.map((f) => ({
        id: String(f.id),
        name: path.basename(String(f.fileName || 'dosya')),
        size: Number(f.size || 0),
      }));
      const sessionId = 'ad-ls-' + crypto.randomBytes(4).toString('hex');
      let allow = this.visible;
      if (allow && this.listenerCount('offer') > 0) {
        allow = await new Promise((resolve) => {
          this.emit('offer', {
            id: sessionId,
            protocol: 'airdrop',
            peerName,
            files: summaryFiles,
            respond: (ok) => resolve(Boolean(ok)),
          });
        });
      }
      if (!allow) {
        res.writeHead(403);
        res.end();
        return;
      }
      const tokens = {};
      const fileMap = new Map();
      for (const f of summaryFiles) {
        const tok = crypto.randomBytes(12).toString('hex');
        tokens[f.id] = tok;
        fileMap.set(f.id, { ...f, token: tok });
      }
      this.pendingSessions.set(sessionId, { id: sessionId, peerName, files: fileMap, saved: [] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, files: tokens }));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/localsend/v2/upload') {
      const sessionId = urlObj.searchParams.get('sessionId') || '';
      const fileId = urlObj.searchParams.get('fileId') || '';
      const token = urlObj.searchParams.get('token') || '';
      const session = this.pendingSessions.get(sessionId);
      const fMeta = session?.files?.get(fileId);
      if (!session || !fMeta || fMeta.token !== token) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.mkdirSync(this.downloadDir, { recursive: true });
      const finalPath = uniqueFile(this.downloadDir, fMeta.name);
      const partPath = finalPath + '.part';
      const raw = await this.#readBody(req, 1024 * 1024 * 1024, (transferred) => {
        this.emit('progress', {
          id: sessionId,
          direction: 'receive',
          protocol: 'airdrop',
          peerName: session.peerName,
          fileName: path.basename(finalPath),
          transferred,
          total: fMeta.size || transferred,
        });
      });
      fs.writeFileSync(partPath, raw);
      fs.renameSync(partPath, finalPath);
      session.saved.push({ name: path.basename(finalPath), path: finalPath, size: raw.length });
      session.files.delete(fileId);
      res.writeHead(200);
      res.end();
      if (session.files.size === 0) {
        this.pendingSessions.delete(sessionId);
        this.emit('received', {
          id: sessionId,
          protocol: 'airdrop',
          peerName: session.peerName,
          files: session.saved,
        });
      }
      return;
    }

    res.writeHead(404);
    res.end();
  }

  #readBody(req, maxBytes = 64 * 1024 * 1024, onChunk) {
    const contentLength = Number(req.headers['content-length'] || 0);
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      req.on('data', (c) => {
        total += c.length;
        if (total > maxBytes) {
          req.destroy(Error('Payload too large'));
          return;
        }
        chunks.push(c);
        onChunk?.(total, contentLength);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  #httpsPost(host, port, reqPath, bodyBuf, contentType = 'application/octet-stream', signal) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host,
          port: Number(port),
          path: reqPath,
          method: 'POST',
          rejectUnauthorized: false,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(bodyBuf.length),
            'User-Agent': 'AirDrop/1.0',
            Connection: 'close',
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks) }));
        },
      );
      if (signal) signal.addEventListener('abort', () => req.destroy(Error('Aktarım iptal edildi.')), { once: true });
      req.on('error', reject);
      req.write(bodyBuf);
      req.end();
    });
  }

  // --- Outbound Sender (AirDrop /Discover -> /Ask -> /Upload, or LocalSend v2) ---
  async sendFiles({ host, port, subProtocol, files, onProgress, signal }) {
    const fileList = (files || []).map((f, idx) => {
      const filePath = typeof f === 'string' ? f : f.path;
      const stat = fs.statSync(filePath);
      return {
        id: 'f' + (idx + 1),
        path: filePath,
        name: path.basename(filePath),
        size: stat.size,
      };
    });
    if (!fileList.length) throw Error('Gönderilecek dosya seçilmedi.');

    if (subProtocol === 'localsend') {
      return this.#sendLocalSend({ host, port, fileList, onProgress, signal });
    }

    // 1. AirDrop /Discover
    const discoverBody = encodeBplist({});
    await this.#httpsPost(host, port, '/Discover', discoverBody, 'application/octet-stream', signal).catch(() => {});

    // 2. AirDrop /Ask
    const askFiles = fileList.map((f) => ({
      FileName: f.name,
      FileType: fileUti(f.name),
      FileBomPath: './' + f.name,
      FileIsDirectory: false,
      ConvertMediaFormats: false,
    }));
    const askBody = encodeBplist({
      SenderComputerName: this.deviceName,
      SenderModelName: 'Windows PC',
      SenderID: this.senderId,
      BundleID: 'com.apple.finder',
      ConvertMediaFormats: false,
      Files: askFiles,
    });
    const askResp = await this.#httpsPost(host, port, '/Ask', askBody, 'application/octet-stream', signal);
    if (askResp.statusCode !== 200) {
      throw Error('Alıcı AirDrop isteğini reddetti (' + askResp.statusCode + ').');
    }

    // 3. AirDrop /Upload (CPIO + Gzip stream)
    const archive = packCpioGzip(fileList);
    onProgress?.({
      fileName: fileList[0].name,
      transferred: Math.round(archive.length * 0.35),
      total: archive.length,
    });
    const upResp = await this.#httpsPost(host, port, '/Upload', archive, 'application/x-cpio', signal);
    if (upResp.statusCode < 200 || upResp.statusCode >= 300) {
      throw Error('AirDrop yüklemesi başarısız oldu (' + upResp.statusCode + ').');
    }
    onProgress?.({
      fileName: fileList[fileList.length - 1].name,
      transferred: archive.length,
      total: archive.length,
    });
    return { ok: true, files: fileList.map((f) => ({ name: f.name, size: f.size })) };
  }

  async #sendLocalSend({ host, port, fileList, onProgress, signal }) {
    const filesMeta = {};
    for (const f of fileList) {
      filesMeta[f.id] = {
        id: f.id,
        fileName: f.name,
        size: f.size,
        fileType: 'application/octet-stream',
      };
    }
    const prepPayload = Buffer.from(
      JSON.stringify({
        info: {
          alias: this.deviceName,
          version: '2.1',
          deviceModel: 'Windows PC',
          deviceType: 'desktop',
          fingerprint: this.tls.fingerprint,
        },
        files: filesMeta,
      }),
      'utf8',
    );
    const prepResp = await this.#httpsPost(
      host,
      port,
      '/api/localsend/v2/prepare-upload',
      prepPayload,
      'application/json',
      signal,
    );
    if (prepResp.statusCode !== 200) {
      throw Error('Alıcı dosya aktarımını reddetti.');
    }
    const prep = JSON.parse(prepResp.body.toString('utf8'));
    const sessionId = prep.sessionId;
    const tokens = prep.files || {};
    const totalBytes = fileList.reduce((s, f) => s + f.size, 0);
    let sentBytes = 0;

    for (const f of fileList) {
      const tok = tokens[f.id];
      if (!tok) continue;
      const data = fs.readFileSync(f.path);
      const q = `/api/localsend/v2/upload?sessionId=${encodeURIComponent(sessionId)}&fileId=${encodeURIComponent(f.id)}&token=${encodeURIComponent(tok)}`;
      const up = await this.#httpsPost(host, port, q, data, 'application/octet-stream', signal);
      if (up.statusCode < 200 || up.statusCode >= 300) {
        throw Error('Dosya yüklenemedi (' + up.statusCode + ').');
      }
      sentBytes += data.length;
      onProgress?.({
        fileName: f.name,
        transferred: sentBytes,
        total: totalBytes,
      });
    }
    return { ok: true, files: fileList.map((f) => ({ name: f.name, size: f.size })) };
  }
}

module.exports = {
  AirDropEngine,
  encodeBplist,
  decodeBplist,
  packCpioGzip,
  extractCpioGzip,
  generateSelfSignedCert,
};
