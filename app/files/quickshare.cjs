// SPDX-License-Identifier: GPL-3.0-or-later
// MultiDrop protocol adaptation; see THIRD-PARTY-NOTICES.md.
// v0.9.2: Quick Share / Nearby Share (Google & Samsung) implementation for Windows.
// Modeled 1-to-1 after digitaldanis/multidrop:
// - mDNS discovery & advertising (_FC9F5ED42C8A._tcp.local.) with unicast + multicast responses
// - BLE 0xFE2C Fast Pair / Nearby wake-up advertisement on Windows (WinRT BluetoothLEAdvertisementPublisher)
// - EndpointInfo encoding/decoding + QR Code (https://quickshare.google/qrcode#key=...)
// - UKEY2 handshake (P-256 ECDH + SHA-512 commitment + HKDF-SHA256 + mutual ConnectionResponse)
// - D2D SecureMessage framing (AES-256-CBC + HMAC-SHA256 with separate send/recv sequence numbers)
// - Two-chunk BYTES payloads + 64 KB FILE payload streaming + KeepAlive handling
const dgram = require('node:dgram');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const MDNS_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const QS_SERVICE = '_FC9F5ED42C8A._tcp.local.';
const QS_SERVICE_ID_HASH = Buffer.from([0xfc, 0x9f, 0x5e]);
const QR_BASE_URL = 'https://quickshare.google/qrcode#key=';
const FILE_CHUNK_SIZE = 65536;

// ── Minimal Protobuf Wire Codec ─────────────────────────────────────────────
function encodeVarint(val) {
  let v = BigInt(val);
  if (v < 0n) v = (1n << 64n) + v;
  const out = [];
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Buffer.from(out);
}

function decodeVarint(buf, offset = 0) {
  let res = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const b = buf[pos++];
    res |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: res, offset: pos };
    shift += 7n;
    if (shift > 70n) throw Error('Protobuf varint overflow');
  }
  throw Error('Truncated varint');
}

function pbTag(fieldNo, wireType) {
  return encodeVarint((fieldNo << 3) | wireType);
}

function pbVarint(fieldNo, val) {
  if (val === undefined || val === null) return Buffer.alloc(0);
  return Buffer.concat([pbTag(fieldNo, 0), encodeVarint(val)]);
}

function pbBytes(fieldNo, buf) {
  if (!buf) return Buffer.alloc(0);
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8');
  return Buffer.concat([pbTag(fieldNo, 2), encodeVarint(b.length), b]);
}

function decodeFields(buf) {
  const fields = new Map();
  if (!Buffer.isBuffer(buf) || !buf.length) return fields;
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    try {
      tag = decodeVarint(buf, pos);
    } catch {
      break;
    }
    pos = tag.offset;
    const fieldNo = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 7n);
    if (fieldNo <= 0) break;
    let val;
    if (wireType === 0) {
      try {
        const v = decodeVarint(buf, pos);
        pos = v.offset;
        val = v.value;
      } catch {
        break;
      }
    } else if (wireType === 1) {
      if (pos + 8 > buf.length) break;
      val = buf.subarray(pos, pos + 8);
      pos += 8;
    } else if (wireType === 2) {
      let len;
      try {
        len = decodeVarint(buf, pos);
      } catch {
        break;
      }
      pos = len.offset;
      const n = Number(len.value);
      if (n < 0 || pos + n > buf.length) break;
      val = buf.subarray(pos, pos + n);
      pos += n;
    } else if (wireType === 3 || wireType === 4) {
      // Deprecated start/end group wire types: skip safely
      continue;
    } else if (wireType === 5) {
      if (pos + 4 > buf.length) break;
      val = buf.subarray(pos, pos + 4);
      pos += 4;
    } else {
      break;
    }
    if (!fields.has(fieldNo)) fields.set(fieldNo, []);
    fields.get(fieldNo).push(val);
  }
  return fields;
}

function pbFirst(fields, num) {
  const arr = fields.get(num);
  return arr ? arr[0] : undefined;
}

// ── Base64url helpers ───────────────────────────────────────────────────────
function b64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64UrlDecode(str) {
  let s = String(str || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// ── EndpointInfo & mDNS Name Codec (mdns.py / frames.py) ───────────────────
function buildMdnsEndpointName(endpointId) {
  const idBuf = Buffer.from(String(endpointId || 'CHRL').slice(0, 4).padEnd(4, '0'), 'ascii');
  // 10-byte raw format required by Android Quick Share:
  // [0x23 (PCP)] + 4-byte ASCII endpoint_id + 3-byte SERVICE_ID_HASH (FC 9F 5E) + 2 zero bytes (\x00\x00)
  const header = Buffer.from([0x23]);
  const raw = Buffer.concat([header, idBuf, QS_SERVICE_ID_HASH, Buffer.from([0x00, 0x00])]);
  return b64UrlEncode(raw);
}

function parseMdnsEndpointName(instancePrefix) {
  try {
    const raw = b64UrlDecode(instancePrefix);
    if (raw.length < 10 || raw[0] !== 0x23) return null;
    if (raw[5] !== 0xfc || raw[6] !== 0x9f || raw[7] !== 0x5e) return null;
    const endpointId = raw.subarray(1, 5).toString('ascii');
    return { endpointId };
  } catch {
    return null;
  }
}

function buildEndpointInfo(deviceName, deviceType = 3, qrData = null) {
  const nameBytes = Buffer.from(String(deviceName || 'Charles PC').slice(0, 60), 'utf8');
  // Byte 0: version=0 (bits 5-7), visible=0 meaning visible (bit 4), deviceType (bits 1-3)
  const byte0 = (deviceType & 0x07) << 1;
  const rand16 = crypto.randomBytes(16);
  const lenByte = Buffer.from([nameBytes.length]);
  const parts = [Buffer.from([byte0]), rand16, lenByte, nameBytes];
  if (Buffer.isBuffer(qrData) && qrData.length > 0 && qrData.length <= 255) {
    parts.push(Buffer.from([1, qrData.length]), qrData);
  }
  return Buffer.concat(parts);
}

function parseEndpointInfo(b64OrBuf) {
  try {
    const buf = Buffer.isBuffer(b64OrBuf) ? b64OrBuf : b64UrlDecode(String(b64OrBuf));
    if (buf.length < 17) return null;
    const byte0 = buf[0];
    const visible = (byte0 & 0x10) === 0;
    const typeCode = (byte0 >> 1) & 0x07;
    const types = ['unknown', 'phone', 'tablet', 'laptop'];
    const deviceType = types[typeCode] || 'phone';

    let name = '';
    let offset = 17;
    if (visible) {
      if (buf.length < 18) return null;
      const nameLen = buf[17];
      if (buf.length < 18 + nameLen) return null;
      name = buf.subarray(18, 18 + nameLen).toString('utf8').trim();
      offset = 18 + nameLen;
    }

    let qrData = null;
    while (offset + 2 <= buf.length) {
      const tlvType = buf[offset];
      const tlvLen = buf[offset + 1];
      offset += 2;
      if (offset + tlvLen > buf.length) break;
      if (tlvType === 1) {
        qrData = buf.subarray(offset, offset + tlvLen);
      }
      offset += tlvLen;
    }

    return { name: name || '', deviceType, visible, qrData };
  } catch {
    return null;
  }
}

// ── Quick Share QR Code (qr.py) ─────────────────────────────────────────────
class QrKeySession {
  constructor() {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    this.ecdh = ecdh;
    this.uncompressedPub = ecdh.getPublicKey(); // 65 bytes: 0x04 || X(32) || Y(32)
    this.privKeyBytes = ecdh.getPrivateKey();
    const x = this.uncompressedPub.subarray(1, 33);
    const y = this.uncompressedPub.subarray(33, 65);
    const prefix = (y[31] & 1) !== 0 ? 0x03 : 0x02;
    this.compressedPub = Buffer.concat([Buffer.from([prefix]), x]); // 33 bytes (02/03 + X)
    // Exact 35-byte payload (qr.py: KEY_VERSION = b"\x00\x00" + 33-byte compressed P-256 point)
    this.qrBytes = Buffer.concat([Buffer.from([0x00, 0x00]), this.compressedPub]);
    this.advertisingToken = hkdfSha256(
      this.qrBytes,
      Buffer.alloc(0),
      Buffer.from('advertisingContext', 'utf8'),
      16,
    );
    this.nameKey = hkdfSha256(
      this.qrBytes,
      Buffer.alloc(0),
      Buffer.from('encryptionKey', 'utf8'),
      16,
    );
    this.keyB64 = b64UrlEncode(this.qrBytes);
    this.url = `${QR_BASE_URL}${this.keyB64}`;
    this.svg = renderQrSvg(this.url);
    this.#privKeyObject = this.#buildPrivateKeyObject(x, y, this.privKeyBytes);
  }

  #privKeyObject = null;

  #buildPrivateKeyObject(x, y, d) {
    try {
      return crypto.createPrivateKey({
        key: {
          kty: 'EC',
          crv: 'P-256',
          x: b64UrlEncode(x),
          y: b64UrlEncode(y),
          d: b64UrlEncode(d),
        },
        format: 'jwk',
      });
    } catch {
      return null;
    }
  }

  /**
   * Matches an EndpointInfo's TLV type 1 (qrData) against this QR code's advertisingToken
   * or decrypts a hidden device's AES-128-GCM name (qr.py: QrSender.match).
   */
  matchEndpointInfo(epInfo) {
    const qr = epInfo?.qrData;
    if (!Buffer.isBuffer(qr) || !qr.length) return null;
    if (qr.equals(this.advertisingToken)) {
      return epInfo.name || 'QR Cihazı';
    }
    if (qr.length > 28) {
      try {
        const iv = qr.subarray(0, 12);
        const ctWithTag = qr.subarray(12);
        const tag = ctWithTag.subarray(ctWithTag.length - 16);
        const ct = ctWithTag.subarray(0, ctWithTag.length - 16);
        const decipher = crypto.createDecipheriv('aes-128-gcm', this.nameKey, iv);
        decipher.setAAD(this.advertisingToken);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
        return plain.toString('utf8').trim() || 'QR Cihazı';
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Signs the 32-byte UKEY2 auth_string with ECDSA P-256 SHA-256 in raw 64-byte IEEE-P1363 (r || s) format.
   * Sent in PairedKeyEncryptionFrame field 4 (qr_code_handshake_data).
   */
  signAuthString(authString) {
    if (!this.#privKeyObject || !Buffer.isBuffer(authString)) return null;
    try {
      return crypto.sign('sha256', authString, {
        key: this.#privKeyObject,
        dsaEncoding: 'ieee-p1363',
      });
    } catch {
      return null;
    }
  }
}

// ── Self-contained ISO/IEC 18004 QR Code SVG Generator (Byte Mode, ECC L) ───
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  let r = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) r ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>= 1;
  }
  return r;
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
    root = gfMul(root, 2);
  }
  return poly;
}

function rsRemainder(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const msg = [...data, ...new Array(ecLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

function renderQrSvg(text) {
  const bytes = Buffer.from(String(text), 'utf8');
  // Version 4-L: 33x33 modules, 80 data codewords, 20 EC codewords (1 block), alignment at [6, 26]
  // Version 5-L: 37x37 modules, 108 data codewords, 26 EC codewords (1 block), alignment at [6, 30]
  const ver = bytes.length <= 78 ? 4 : 5;
  const size = 17 + ver * 4;
  const dataCap = ver === 4 ? 80 : 108;
  const ecCap = ver === 4 ? 20 : 26;
  const alignCenter = ver === 4 ? 26 : 30;

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  pushBits(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (codewords.length < dataCap) {
    codewords.push(padBytes[padIdx++ % 2]);
  }

  const ecWords = rsRemainder(codewords, ecCap);
  const allWords = [...codewords, ...ecWords];
  const allBits = [];
  for (const w of allWords) {
    for (let i = 7; i >= 0; i--) allBits.push((w >> i) & 1);
  }

  const grid = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  const setFixed = (r, c, val) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      grid[r][c] = val ? 1 : 0;
      reserved[r][c] = 1;
    }
  };

  const placeFinder = (row, col) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFixed(r, c, inOuter || inInner ? 1 : 0);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment pattern at (alignCenter, alignCenter)
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      setFixed(alignCenter + dr, alignCenter + dc, dist === 2 || dist === 0 ? 1 : 0);
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFixed(6, i, i % 2 === 0 ? 1 : 0);
    setFixed(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module & reserve format areas
  setFixed(size - 8, 8, 1);
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = 1;
    if (!reserved[i][8]) reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = 1;
    reserved[size - 1 - i][8] = 1;
  }

  // Data bits placement (up/down 2-column zig-zag)
  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!reserved[r][c]) {
          const rawBit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Mask 0: (r + c) % 2 === 0
          const masked = ((r + c) % 2 === 0) ? rawBit ^ 1 : rawBit;
          grid[r][c] = masked;
        }
      }
    }
    upward = !upward;
  }

  // Format information for ECC Level L (01) + Mask 0 (000) -> 0x77c4 (15 bits, MSB=bit 14, LSB=bit 0)
  // Coordinates ordered from bit 14 (MSB) down to bit 0 (LSB):
  const fmt = 0x77c4;
  const fmtCoordsA = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const fmtCoordsB = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> (14 - i)) & 1;
    grid[fmtCoordsA[i][0]][fmtCoordsA[i][1]] = bit;
    grid[fmtCoordsB[i][0]][fmtCoordsB[i][1]] = bit;
  }

  const margin = 4;
  const total = size + margin * 2;
  let pathData = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 1) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" rx="2" fill="#ffffff"/><path d="${pathData}" fill="#0c0e12"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

// ── UKEY2 + D2D Crypto (`crypto.py`, `ukey.proto`) ──────────────────────────
function encodeSignedCoord(buf32) {
  let start = 0;
  while (start < buf32.length - 1 && buf32[start] === 0) start++;
  const stripped = buf32.subarray(start);
  if (stripped[0] & 0x80) {
    return Buffer.concat([Buffer.from([0x00]), stripped]);
  }
  return stripped;
}

function decodeSignedCoord(buf) {
  if (!Buffer.isBuffer(buf)) throw Error('Invalid EC coordinate');
  let b = buf;
  while (b.length > 32 && b[0] === 0x00) b = b.subarray(1);
  if (b.length > 32) throw Error('EC coordinate > 32 bytes');
  if (b.length < 32) {
    const padded = Buffer.alloc(32, 0);
    b.copy(padded, 32 - b.length);
    return padded;
  }
  return b;
}

function encodeGenericPublicKey(uncompressedPubKey) {
  const x = encodeSignedCoord(uncompressedPubKey.subarray(1, 33));
  const y = encodeSignedCoord(uncompressedPubKey.subarray(33, 65));
  const ecKey = Buffer.concat([pbBytes(1, x), pbBytes(2, y)]);
  return Buffer.concat([pbVarint(1, 1), pbBytes(2, ecKey)]);
}

function decodeGenericPublicKey(buf) {
  const f = decodeFields(buf);
  const ecBytes = pbFirst(f, 2);
  if (!ecBytes) throw Error('Missing EcP256PublicKey in GenericPublicKey');
  const ec = decodeFields(ecBytes);
  const x = decodeSignedCoord(pbFirst(ec, 1));
  const y = decodeSignedCoord(pbFirst(ec, 2));
  return Buffer.concat([Buffer.from([0x04]), x, y]);
}

function wrapUkey2Message(type, data) {
  return Buffer.concat([pbVarint(1, type), pbBytes(2, data)]);
}

function unwrapUkey2Message(buf) {
  const f = decodeFields(buf);
  return {
    type: Number(pbFirst(f, 1) || 0),
    data: pbFirst(f, 2) || Buffer.alloc(0),
  };
}

function hkdfSha256(ikm, salt, info, len = 32) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
}

function derivePin(authString) {
  const b = Buffer.isBuffer(authString) ? authString : Buffer.from(authString || '');
  if (!b.length) return '0000';
  let h = 0;
  let mult = 1;
  for (let i = 0; i < b.length; i++) {
    const signed = b[i] > 127 ? b[i] - 256 : b[i];
    h = (h + signed * mult) % 9973;
    mult = (mult * 31) % 9973;
  }
  return String(Math.abs(h)).padStart(4, '0');
}

function deriveUkey2Session(ecdh, peerUncompressedPub, clientInitMsgBytes, serverInitMsgBytes, isClient) {
  const rawDh = ecdh.computeSecret(peerUncompressedPub);
  const ikm = crypto.createHash('sha256').update(rawDh).digest();
  const info = Buffer.concat([clientInitMsgBytes, serverInitMsgBytes]);

  const authString = hkdfSha256(ikm, Buffer.from('UKEY2 v1 auth', 'utf8'), info, 32);
  const nextSecret = hkdfSha256(ikm, Buffer.from('UKEY2 v1 next', 'utf8'), info, 32);

  // crypto.py: D2D_SALT = sha256("D2D"), SECUREMESSAGE_SALT = sha256("SecureMessage")
  const d2dSalt = crypto.createHash('sha256').update(Buffer.from('D2D', 'utf8')).digest();
  const secMsgSalt = crypto.createHash('sha256').update(Buffer.from('SecureMessage', 'utf8')).digest();

  const d2dClientKey = hkdfSha256(nextSecret, d2dSalt, Buffer.from('client', 'utf8'), 32);
  const d2dServerKey = hkdfSha256(nextSecret, d2dSalt, Buffer.from('server', 'utf8'), 32);

  const clientEncKey = hkdfSha256(d2dClientKey, secMsgSalt, Buffer.from('ENC:2', 'utf8'), 32);
  const clientHmacKey = hkdfSha256(d2dClientKey, secMsgSalt, Buffer.from('SIG:1', 'utf8'), 32);
  const serverEncKey = hkdfSha256(d2dServerKey, secMsgSalt, Buffer.from('ENC:2', 'utf8'), 32);
  const serverHmacKey = hkdfSha256(d2dServerKey, secMsgSalt, Buffer.from('SIG:1', 'utf8'), 32);

  // Separate sequence counters for outgoing and incoming DeviceToDeviceMessage frames
  let sendSeq = 0;
  let recvSeq = 0;
  const sendEncKey = isClient ? clientEncKey : serverEncKey;
  const sendHmacKey = isClient ? clientHmacKey : serverHmacKey;
  const recvEncKey = isClient ? serverEncKey : clientEncKey;
  const recvHmacKey = isClient ? serverHmacKey : clientHmacKey;
  // GcmMetadata(type = DEVICE_TO_DEVICE_MESSAGE(13), version = 1)
  const gcmMetadata = Buffer.concat([pbVarint(1, 13), pbVarint(2, 1)]);

  return {
    authString,
    nextSecret,
    pin: derivePin(authString),
    encryptAndSign(plaintext) {
      sendSeq += 1;
      // DeviceToDeviceMessage: 1=message(bytes), 2=sequence_number(int32)
      const d2dPlain = Buffer.concat([pbBytes(1, plaintext), pbVarint(2, sendSeq)]);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', sendEncKey, iv);
      const body = Buffer.concat([cipher.update(d2dPlain), cipher.final()]);
      // SecureMessage Header: 1=signature_scheme(1=HMAC_SHA256), 2=encryption_scheme(2=AES_256_CBC), 5=iv, 6=public_metadata
      const header = Buffer.concat([
        pbVarint(1, 1),
        pbVarint(2, 2),
        pbBytes(5, iv),
        pbBytes(6, gcmMetadata),
      ]);
      const headerAndBody = Buffer.concat([pbBytes(1, header), pbBytes(2, body)]);
      const sig = crypto.createHmac('sha256', sendHmacKey).update(headerAndBody).digest();
      return Buffer.concat([pbBytes(1, headerAndBody), pbBytes(2, sig)]);
    },
    verifyAndDecrypt(secureMsgBuf) {
      const sm = decodeFields(secureMsgBuf);
      const headerAndBody = pbFirst(sm, 1);
      const sig = pbFirst(sm, 2);
      if (!headerAndBody || !sig) throw Error('Invalid SecureMessage frame');
      const expectedSig = crypto.createHmac('sha256', recvHmacKey).update(headerAndBody).digest();
      if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
        throw Error('SecureMessage HMAC verification failed');
      }
      const hb = decodeFields(headerAndBody);
      const headerBytes = pbFirst(hb, 1);
      const body = pbFirst(hb, 2);
      if (!headerBytes || !body) throw Error('Missing HeaderAndBody fields');
      const hdr = decodeFields(headerBytes);
      const iv = pbFirst(hdr, 5);
      if (!iv || iv.length !== 16) throw Error('Invalid AES-256-CBC IV');
      const decipher = crypto.createDecipheriv('aes-256-cbc', recvEncKey, iv);
      const d2dPlain = Buffer.concat([decipher.update(body), decipher.final()]);
      const d2d = decodeFields(d2dPlain);
      const msgPayload = pbFirst(d2d, 1) || Buffer.alloc(0);
      const seq = Number(pbFirst(d2d, 2) || 0);
      if (seq !== recvSeq + 1) {
        throw Error(`D2D sıra numarası uyuşmazlığı: gelen ${seq}, beklenen ${recvSeq}`);
      }
      recvSeq = seq;
      return msgPayload;
    },
  };
}

function createUkey2Client() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const pubKeyProto = encodeGenericPublicKey(ecdh.getPublicKey());
  // Ukey2ClientFinished: 1=public_key
  const clientFinishedData = pbBytes(1, pubKeyProto);
  // Ukey2Message(CLIENT_FINISH = 4)
  const clientFinishMsgBytes = wrapUkey2Message(4, clientFinishedData);
  const commitment = crypto.createHash('sha512').update(clientFinishMsgBytes).digest();

  // CipherCommitment: 1=handshake_cipher(100=P256_SHA512), 2=commitment
  const cipherCommitment = Buffer.concat([pbVarint(1, 100), pbBytes(2, commitment)]);
  // Ukey2ClientInit: 1=version(1), 2=random(32B), 3=cipher_commitments, 4=next_protocol
  const clientInitData = Buffer.concat([
    pbVarint(1, 1),
    pbBytes(2, crypto.randomBytes(32)),
    pbBytes(3, cipherCommitment),
    pbBytes(4, Buffer.from('AES_256_CBC-HMAC_SHA256', 'utf8')),
  ]);
  const clientInitMsgBytes = wrapUkey2Message(2, clientInitData);

  return {
    clientInitMsgBytes,
    clientFinishMsgBytes,
    processServerInit(serverInitMsgBytes) {
      const msg = unwrapUkey2Message(serverInitMsgBytes);
      if (msg.type !== 3) throw Error(`Beklenmeyen UKEY2 mesajı: ${msg.type}`);
      const si = decodeFields(msg.data);
      if (Number(pbFirst(si, 1)) !== 1 || pbFirst(si, 2)?.length !== 32 || Number(pbFirst(si, 3)) !== 100) throw Error('Geçersiz UKEY2 ServerInit.');
      const pubKeyBytes = pbFirst(si, 4);
      if (!pubKeyBytes) throw Error('Ukey2ServerInit public_key eksik');
      const peerPub = decodeGenericPublicKey(pubKeyBytes);
      return deriveUkey2Session(ecdh, peerPub, clientInitMsgBytes, serverInitMsgBytes, true);
    },
  };
}

function createUkey2Server(clientInitMsgBytes) {
  const msg = unwrapUkey2Message(clientInitMsgBytes);
  if (msg.type !== 2) throw Error(`UKEY2 CLIENT_INIT bekleniyordu (gelen: ${msg.type})`);

  const ci = decodeFields(msg.data);
  if (Number(pbFirst(ci, 1)) !== 1 || pbFirst(ci, 2)?.length !== 32 ||
      pbFirst(ci, 4)?.toString() !== 'AES_256_CBC-HMAC_SHA256') throw Error('Geçersiz UKEY2 ClientInit.');
  const commitment = (ci.get(3) || []).map(decodeFields).find(f => Number(pbFirst(f, 1)) === 100);
  const expected = commitment && pbFirst(commitment, 2);
  if (expected?.length !== 64) throw Error('UKEY2 commitment eksik.');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const pubKeyProto = encodeGenericPublicKey(ecdh.getPublicKey());
  // Ukey2ServerInit: 1=version(1), 2=random(32B), 3=handshake_cipher(100), 4=public_key
  const serverInitData = Buffer.concat([
    pbVarint(1, 1),
    pbBytes(2, crypto.randomBytes(32)),
    pbVarint(3, 100),
    pbBytes(4, pubKeyProto),
  ]);
  const serverInitMsgBytes = wrapUkey2Message(3, serverInitData);

  return {
    serverInitMsgBytes,
    processClientFinish(clientFinishMsgBytes) {
      const actual = crypto.createHash('sha512').update(clientFinishMsgBytes).digest();
      if (!crypto.timingSafeEqual(expected, actual)) throw Error('UKEY2 commitment doğrulanamadı.');
      const fin = unwrapUkey2Message(clientFinishMsgBytes);
      if (fin.type !== 4) throw Error(`UKEY2 CLIENT_FINISH bekleniyordu (gelen: ${fin.type})`);
      const cf = decodeFields(fin.data);
      const pubKeyBytes = pbFirst(cf, 1);
      if (!pubKeyBytes) throw Error('Ukey2ClientFinished public_key eksik');
      const peerPub = decodeGenericPublicKey(pubKeyBytes);
      return deriveUkey2Session(ecdh, peerPub, clientInitMsgBytes, serverInitMsgBytes, false);
    },
  };
}

function validateConnectionResponse(raw) {
  const v1 = decodeFields(pbFirst(decodeFields(raw), 2));
  const cr = decodeFields(pbFirst(v1, 3));
  if (Number(pbFirst(v1, 1)) !== 2 || Number(pbFirst(cr, 1) || 0) !== 0 || Number(pbFirst(cr, 3)) !== 1)
    throw Error('Karşı cihaz bağlantı isteğini kabul etmedi.');
}

// ── Nearby Connections OfflineFrame & Sharing Frame Builders (`frames.py`) ──
function buildOfflineFrame(v1Type, innerFieldNo, innerBuf) {
  const v1 = Buffer.concat([pbVarint(1, v1Type), pbBytes(innerFieldNo, innerBuf)]);
  return Buffer.concat([pbVarint(1, 1), pbBytes(2, v1)]);
}

function buildConnectionRequestFrame(endpointId, endpointName, endpointInfo) {
  // ConnectionRequestFrame (offline_wire_formats.proto):
  // 1=endpoint_id, 2=endpoint_name, 4=nonce(0), 5=mediums(5=WIFI_LAN), 6=endpoint_info
  const req = Buffer.concat([
    pbBytes(1, String(endpointId || 'CHRL')),
    pbBytes(2, String(endpointName || 'Charles PC')),
    pbVarint(4, 0),
    pbVarint(5, 5),
    pbBytes(6, endpointInfo),
  ]);
  return buildOfflineFrame(1, 2, req);
}

function buildConnectionResponseFrame(accept = true) {
  // ConnectionResponseFrame (offline_wire_formats.proto / frames.py):
  // 1=status(0=OK, 1=REJECT), 3=response(1=ACCEPT, 2=REJECT), 4=os_info(OsInfo{1=type(100=LINUX)})
  const osInfo = pbVarint(1, 100);
  const resp = Buffer.concat([
    pbVarint(1, accept ? 0 : 1),
    pbVarint(3, accept ? 1 : 2),
    pbBytes(4, osInfo),
  ]);
  return buildOfflineFrame(2, 3, resp);
}

function buildPayloadTransferFrame({
  id,
  type = 1, // 1=BYTES, 2=FILE
  totalSize = 0,
  offset = 0,
  body = Buffer.alloc(0),
  flags = 0, // 1=LAST_CHUNK
  index = 0,
  fileName = '',
}) {
  // PayloadHeader: 1=id, 2=type, 3=total_size, 4=is_sensitive(false), 5=file_name
  const header = Buffer.concat([
    pbVarint(1, id),
    pbVarint(2, type),
    pbVarint(3, totalSize),
    pbVarint(4, 0),
    ...(fileName ? [pbBytes(5, fileName)] : []),
  ]);
  // PayloadChunk: 1=flags, 2=offset, 3=body, 4=index
  const chunk = Buffer.concat([
    pbVarint(1, flags),
    pbVarint(2, offset),
    ...(body && body.length > 0 ? [pbBytes(3, body)] : []),
    // Chunk index is absent on Wi-Fi LAN, as in Nearby Connections.
  ]);
  // PayloadTransferFrame: 1=packet_type(1=DATA), 2=payload_header, 3=payload_chunk
  const transfer = Buffer.concat([
    pbVarint(1, 1),
    pbBytes(2, header),
    pbBytes(3, chunk),
  ]);
  return buildOfflineFrame(3, 4, transfer);
}

function buildKeepAliveFrame(ack = true, seqNum = 0) {
  const ka = Buffer.concat([pbVarint(1, ack ? 1 : 0), pbVarint(2, seqNum)]);
  return buildOfflineFrame(5, 6, ka);
}

function buildDisconnectionFrame() {
  // multidrop frames.disconnection(): empty DisconnectionFrame
  return buildOfflineFrame(6, 7, Buffer.alloc(0));
}

// Sharing Frame (wire_format.proto) sent inside BYTES PayloadTransferFrames:
function buildSharingFrame(v1Type, innerFieldNo, innerBuf) {
  const v1 = Buffer.concat([pbVarint(1, v1Type), pbBytes(innerFieldNo, innerBuf)]);
  return Buffer.concat([pbVarint(1, 1), pbBytes(2, v1)]);
}

function buildPairedKeyEncryptionFrame(qrSignature = null) {
  // PairedKeyEncryptionFrame: 1=signed_data(72B), 2=secret_id_hash(6B), 4=qr_code_handshake_data(optional 64B)
  const pke = Buffer.concat([
    pbBytes(1, crypto.randomBytes(72)),
    pbBytes(2, crypto.randomBytes(6)),
    ...(qrSignature ? [pbBytes(4, qrSignature)] : []),
  ]);
  return buildSharingFrame(3, 4, pke);
}

function buildPairedKeyResultFrame(status = 3) {
  // PairedKeyResultFrame: 1=status (1=SUCCESS, 2=FAIL, 3=UNABLE)
  const pkr = pbVarint(1, status);
  return buildSharingFrame(4, 5, pkr);
}

function inferQuickShareFileType(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 1; // IMAGE
  if (m.startsWith('video/')) return 2; // VIDEO
  if (m.startsWith('audio/')) return 4; // AUDIO
  if (m === 'application/vnd.android.package-archive') return 3; // ANDROID_APP
  return 0; // UNKNOWN / general file
}

function buildIntroductionFrame(files) {
  // IntroductionFrame (wire_format.proto):
  // repeated FileMetadata (field 1):
  //   1=name, 2=type, 3=payload_id, 4=size, 5=mime_type, 6=id
  const entries = files.map((f, idx) => {
    const fileType = inferQuickShareFileType(f.mime);
    const meta = Buffer.concat([
      pbBytes(1, f.name),
      pbVarint(2, fileType),
      pbVarint(3, f.payloadId),
      pbVarint(4, f.size),
      pbBytes(5, f.mime || 'application/octet-stream'),
      pbVarint(6, f.id || idx + 1),
    ]);
    return pbBytes(1, meta);
  });
  return buildSharingFrame(1, 2, Buffer.concat(entries));
}

function buildSharingResponseFrame(accept = true) {
  // ConnectionResponseFrame (wire_format.proto): 1=status (1=ACCEPT, 2=REJECT)
  const resp = pbVarint(1, accept ? 1 : 2);
  return buildSharingFrame(2, 3, resp);
}

// ── Length-Prefixed TCP Frame Stream Reader ─────────────────────────────────
function createFrameQueue(socket) {
  let acc = Buffer.alloc(0);
  const queue = [];
  const waiters = [];
  let closedErr = null;

  const pushOrWake = (frame, err) => {
    if (waiters.length > 0) {
      const w = waiters.shift();
      clearTimeout(w.timer);
      if (err) w.reject(err);
      else w.resolve(frame);
    } else if (frame) {
      queue.push(frame);
    }
  };

  socket.on('data', (chunk) => {
    acc = Buffer.concat([acc, chunk]);
    while (acc.length >= 4) {
      const len = acc.readUInt32BE(0);
      if (len > 32 * 1024 * 1024) {
        closedErr = Error('Quick Share paket boyutu sınırı aşıldı');
        socket.destroy();
        while (waiters.length) pushOrWake(null, closedErr);
        return;
      }
      if (acc.length < 4 + len) break;
      const frame = acc.subarray(4, 4 + len);
      acc = acc.subarray(4 + len);
      pushOrWake(frame, null);
    }
  });

  const onEndOrError = (err) => {
    closedErr = err || Error('Bağlantı karşı cihaz tarafından kapatıldı');
    while (waiters.length) pushOrWake(null, closedErr);
  };
  socket.once('error', onEndOrError);
  socket.once('close', () => onEndOrError(closedErr));

  return {
    nextFrame(timeoutMs = 20000) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      if (closedErr) return Promise.reject(closedErr);
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            const idx = waiters.indexOf(waiter);
            if (idx >= 0) waiters.splice(idx, 1);
            reject(Error('Quick Share yanıt zaman aşımı'));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
    writeFrame(buf, callback) {
      const hdr = Buffer.alloc(4);
      hdr.writeUInt32BE(buf.length, 0);
      return socket.write(Buffer.concat([hdr, buf]), callback);
    },
  };
}

// ── mDNS Wire Packet Helpers ────────────────────────────────────────────────
function encodeDnsName(name) {
  const parts = String(name).replace(/\.$/, '').split('.').filter(Boolean);
  const buffers = [];
  for (const p of parts) {
    const b = Buffer.from(p, 'utf8');
    buffers.push(Buffer.from([b.length]), b);
  }
  buffers.push(Buffer.from([0]));
  return Buffer.concat(buffers);
}

function decodeDnsName(buf, offset) {
  const labels = [];
  let pos = offset;
  let jumped = false;
  let nextOffset = offset;
  let hops = 0;
  while (pos < buf.length && hops++ < 40) {
    const len = buf[pos];
    if (len === 0) {
      if (!jumped) nextOffset = pos + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= buf.length) break;
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1];
      if (!jumped) nextOffset = pos + 2;
      pos = ptr;
      jumped = true;
      continue;
    }
    pos++;
    if (pos + len > buf.length) break;
    labels.push(buf.subarray(pos, pos + len).toString('utf8'));
    pos += len;
  }
  return { name: labels.join('.'), offset: nextOffset };
}

function buildMdnsQuery(serviceNames) {
  const names = Array.isArray(serviceNames) ? serviceNames : [serviceNames];
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0, 2);
  header.writeUInt16BE(names.length, 4);
  const qBufs = [];
  for (const q of names) {
    const qName = typeof q === 'string' ? q : q.name;
    const qType = typeof q === 'object' && q.type ? q.type : 12; // 12=PTR, 255=ANY
    const qTail = Buffer.alloc(4);
    qTail.writeUInt16BE(qType, 0);
    qTail.writeUInt16BE(0x0001, 2); // IN
    qBufs.push(encodeDnsName(qName), qTail);
  }
  return Buffer.concat([header, ...qBufs]);
}

function buildDnsRecord(name, type, ttl, rdata, flush = false) {
  const dname = encodeDnsName(name);
  const meta = Buffer.alloc(10);
  meta.writeUInt16BE(type, 0);
  meta.writeUInt16BE(flush ? 0x8001 : 0x0001, 2);
  meta.writeUInt32BE(ttl, 4);
  meta.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([dname, meta, rdata]);
}

function buildMdnsAnnouncement({
  serviceType,
  service,
  instanceName,
  hostName,
  ip,
  port,
  txtMap,
  txtEntries,
  ttl = 120,
  queryId = 0,
  questions = [],
  legacy = false,
}) {
  const svc = String(serviceType || service || QS_SERVICE).replace(/\.$/, '');
  const rawInst = String(instanceName || 'Charles').replace(/\.$/, '');
  const fullInstance = rawInst.toLowerCase().endsWith(svc.toLowerCase()) ? rawInst : `${rawInst}.${svc}`;
  const rawHost = String(hostName || 'Charles-PC.local').replace(/\.$/, '');
  const fullHost = rawHost.toLowerCase().endsWith('.local') ? rawHost : `${rawHost}.local`;

  const qList = Array.isArray(questions) ? questions : [];
  const header = Buffer.alloc(12);
  header.writeUInt16BE(legacy ? queryId & 0xffff : 0, 0);
  header.writeUInt16BE(0x8400, 2); // QR=1, AA=1
  header.writeUInt16BE(legacy ? qList.length : 0, 4);
  header.writeUInt16BE(4, 6); // 4 Answer RRs

  const qBufs = [];
  if (legacy && qList.length) {
    for (const q of qList) {
      const qTail = Buffer.alloc(4);
      qTail.writeUInt16BE(q.type || 12, 0);
      qTail.writeUInt16BE(q.cls || 1, 2);
      qBufs.push(encodeDnsName(q.name), qTail);
    }
  }

  const flush = !legacy;
  const effTtl = legacy ? Math.min(ttl, 10) : ttl;

  const ptrData = encodeDnsName(fullInstance);
  const ptrRec = buildDnsRecord(svc, 12, effTtl, ptrData, false);

  const hostEncoded = encodeDnsName(fullHost);
  const srvPre = Buffer.alloc(6);
  srvPre.writeUInt16BE(0, 0);
  srvPre.writeUInt16BE(0, 2);
  srvPre.writeUInt16BE(port, 4);
  const srvRec = buildDnsRecord(fullInstance, 33, effTtl, Buffer.concat([srvPre, hostEncoded]), flush);

  const txtChunks = [];
  if (Array.isArray(txtEntries)) {
    for (const entry of txtEntries) {
      const b = Buffer.from(String(entry), 'utf8');
      if (b.length <= 255) txtChunks.push(Buffer.from([b.length]), b);
    }
  }
  for (const [k, v] of Object.entries(txtMap || {})) {
    const b = Buffer.from(`${k}=${v}`, 'utf8');
    if (b.length <= 255) txtChunks.push(Buffer.from([b.length]), b);
  }
  const txtData = txtChunks.length ? Buffer.concat(txtChunks) : Buffer.from([0]);
  const txtRec = buildDnsRecord(fullInstance, 16, effTtl, txtData, flush);

  const ipParts = String(ip || '127.0.0.1').split('.').map((x) => Number(x) & 0xff);
  const aData = Buffer.from(ipParts.length === 4 ? ipParts : [127, 0, 0, 1]);
  const aRec = buildDnsRecord(fullHost, 1, effTtl, aData, flush);

  return Buffer.concat([header, ...qBufs, ptrRec, srvRec, txtRec, aRec]);
}

function parseMdnsPacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const id = buf.readUInt16BE(0);
  const flags = buf.readUInt16BE(2);
  const qdCount = buf.readUInt16BE(4);
  const anCount = buf.readUInt16BE(6);
  const nsCount = buf.readUInt16BE(8);
  const arCount = buf.readUInt16BE(10);
  let pos = 12;
  const questions = [];
  for (let i = 0; i < qdCount && pos < buf.length; i++) {
    const { name, offset } = decodeDnsName(buf, pos);
    pos = offset;
    if (pos + 4 > buf.length) break;
    const type = buf.readUInt16BE(pos);
    const cls = buf.readUInt16BE(pos + 2) & 0x7fff;
    pos += 4;
    questions.push({ name, type, cls });
  }
  const records = [];
  const totalRr = anCount + nsCount + arCount;
  for (let i = 0; i < totalRr && pos < buf.length; i++) {
    const { name, offset } = decodeDnsName(buf, pos);
    pos = offset;
    if (pos + 10 > buf.length) break;
    const type = buf.readUInt16BE(pos);
    const cls = buf.readUInt16BE(pos + 2) & 0x7fff;
    const ttl = buf.readUInt32BE(pos + 4);
    const rdLen = buf.readUInt16BE(pos + 8);
    pos += 10;
    if (pos + rdLen > buf.length) break;
    const rdata = buf.subarray(pos, pos + rdLen);
    const rPos = pos;
    pos += rdLen;

    const rec = { name, type, cls, ttl, parsed: null };
    if (type === 12) {
      // PTR
      rec.ptr = decodeDnsName(buf, rPos).name;
      rec.parsed = rec.ptr;
    } else if (type === 33 && rdLen >= 6) {
      // SRV
      const port = rdata.readUInt16BE(4);
      const target = decodeDnsName(buf, rPos + 6).name;
      rec.port = port;
      rec.target = target;
      rec.parsed = { port, target };
    } else if (type === 16) {
      // TXT
      const txt = {};
      let tPos = 0;
      while (tPos < rdata.length) {
        const l = rdata[tPos++];
        if (tPos + l > rdata.length) break;
        const s = rdata.subarray(tPos, tPos + l).toString('utf8');
        tPos += l;
        const eq = s.indexOf('=');
        if (eq > 0) txt[s.slice(0, eq)] = s.slice(eq + 1);
      }
      rec.txt = txt;
      rec.parsed = txt;
    } else if (type === 1 && rdLen === 4) {
      // A
      rec.ip = `${rdata[0]}.${rdata[1]}.${rdata[2]}.${rdata[3]}`;
      rec.parsed = rec.ip;
    }
    records.push(rec);
  }
  return { id, isResponse: (flags & 0x8000) !== 0, questions, records };
}

function getLocalIPv4Interfaces() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(nets)) {
    if (!Array.isArray(addrs)) continue;
    if (/vethernet|wsl|hyper-v|docker|vmware|virtualbox|loopback|tailscale|tun|tap/i.test(name)) continue;
    for (const a of addrs) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.')) {
        list.push(a.address);
      }
    }
  }
  if (!list.length) {
    for (const addrs of Object.values(nets)) {
      for (const a of addrs || []) {
        if ((a.family === 'IPv4' || a.family === 4) && !a.internal) list.push(a.address);
      }
    }
  }
  return list.length ? list : ['127.0.0.1'];
}

function getLocalIPv4() {
  return getLocalIPv4Interfaces()[0] || '127.0.0.1';
}

async function getRoutedIPv4() {
  // UDP connect selects a route without transmitting any packet. Advertising a
  // host-only adapter (e.g. VirtualBox "Ethernet 3") overwrites our mDNS A record.
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    let done = false;
    const finish = address => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve(address || getLocalIPv4());
    };
    const timer = setTimeout(() => finish(), 1500);
    socket.once('error', () => finish());
    try { socket.connect(9, '192.0.2.1', () => finish(socket.address().address)); }
    catch { finish(); }
  });
}

function guessMime(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.apk': 'application/vnd.android.package-archive',
  };
  return map[ext] || 'application/octet-stream';
}

function uniqueDestPath(dir, rawName) {
  const safe = path.basename(String(rawName || 'dosya').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')) || 'dosya';
  const ext = path.extname(safe);
  const stem = path.basename(safe, ext);
  let candidate = path.join(dir, safe);
  let idx = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${idx++})${ext}`);
  }
  return candidate;
}

// ── Windows BLE Fast Pair / Nearby 0xFE2C Wake-Up Advertiser (`ble.py`) ─────
function startWindowsBleWakeAdvertiser() {
  if (process.platform !== 'win32') return null;
  try {
    const randHex = crypto.randomBytes(10).toString('hex');
    const payloadHex = 'fc128e0142' + '00'.repeat(9) + randHex;
    const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
[void][Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementPublisher, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]
[void][Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementDataSection, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType=WindowsRuntime]
$hex = '2cfe' + '${payloadHex}'
$bytes = New-Object byte[] ($hex.Length / 2)
for ($i = 0; $i -lt $hex.Length; $i += 2) {
  $bytes[$i / 2] = [Convert]::ToByte($hex.Substring($i, 2), 16)
}
$writer = [Windows.Storage.Streams.DataWriter]::new()
$writer.WriteBytes($bytes)
$section = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementDataSection]::new(0x16, $writer.DetachBuffer())
$pub = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementPublisher]::new()
$pub.Advertisement.DataSections.Add($section)
$pub.Start()
while ($true) { Start-Sleep -Seconds 30 }
`.trim();
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
      { stdio: 'ignore', windowsHide: true },
    );
    child.on('error', () => {});
    child.unref();
    return child;
  } catch {
    return null;
  }
}

// ── Main QuickShareEngine Class ─────────────────────────────────────────────
class QuickShareEngine extends EventEmitter {
  #tcpServer = null;
  #mdnsSocket = null;
  #tcpPort = 0;
  #advertiseIp = null;
  #endpointId = crypto.randomBytes(2).toString('hex').toUpperCase();
  #deviceName = 'Charles PC';
  #receiveMode = 'everyone'; // 'everyone' | 'auto' | 'off'
  #downloadDir = '';
  #qrSession = null;
  #peers = new Map(); // id -> { id, name, deviceType, host, port, protocol: 'quickshare', updatedAt, instanceName }
  #hostCache = new Map(); // hostname -> ip
  #srvCache = new Map(); // instanceName -> { port, target }
  #txtCache = new Map(); // instanceName -> txtMap
  #pendingOffers = new Map(); // offerId -> { resolve }
  #activeSockets = new Set();
  #announceTimer = null;
  #networkTimer = null;
  #bleProcess = null;

  constructor(opts = {}) {
    super();
    this.logFile = opts.logFile || null;
    this.discoveryEnabled = opts.discovery !== false;
    this.#deviceName = opts.deviceName || os.hostname() || 'Charles PC';
    this.#downloadDir = opts.downloadDir || path.join(os.homedir(), 'Downloads');
    this.#receiveMode = opts.receiveMode || 'everyone';
    this.#qrSession = new QrKeySession();
  }

  get port() {
    return this.#tcpPort;
  }

  get qr() {
    return {
      url: this.#qrSession.url,
      key: this.#qrSession.keyB64,
      svg: this.#qrSession.svg,
    };
  }

  getQr() {
    return this.qr;
  }

  refreshQr() {
    this.#qrSession = new QrKeySession();
    return this.qr;
  }

  get peers() {
    const now = Date.now();
    for (const [id, p] of this.#peers) {
      if (now - p.updatedAt > 90000) this.#peers.delete(id);
    }
    return [...this.#peers.values()];
  }

  setReceiveMode(mode) {
    if (['everyone', 'auto', 'off'].includes(mode)) {
      this.#receiveMode = mode;
      if (mode !== 'off') {
        this.#ensureBleWake();
        this.#announce();
      } else {
        this.#stopBleWake();
      }
    }
    return this.#receiveMode;
  }

  setVisible(vis) {
    if (vis) {
      if (this.#receiveMode === 'off') this.#receiveMode = 'everyone';
      this.#ensureBleWake();
      this.#announce();
    } else {
      this.#receiveMode = 'off';
      this.#stopBleWake();
    }
    return vis;
  }

  scan() {
    this.discover();
  }

  announce() {
    this.#announce();
  }

  get receiveMode() {
    return this.#receiveMode;
  }

  async start() {
    if (this.#tcpServer) return this.#tcpPort;
    fs.mkdirSync(this.#downloadDir, { recursive: true });
    this.#advertiseIp = await getRoutedIPv4();

    await new Promise((resolve, reject) => {
      const srv = net.createServer((socket) => {
        this.#handleIncoming(socket).catch(() => {
          try {
            socket.destroy();
          } catch {}
        });
      });
      srv.once('error', reject);
      srv.listen(0, '0.0.0.0', () => {
        this.#tcpServer = srv;
        this.#tcpPort = srv.address().port;
        resolve();
      });
    });

    this.#log('listen', `${this.#advertiseIp}:${this.#tcpPort}`);
    if (this.discoveryEnabled) this.#startMdns();
    if (this.discoveryEnabled) {
      this.#networkTimer = setInterval(() => void this.refreshNetwork().catch(() => {}), 15000);
      this.#networkTimer.unref?.();
    }
    if (this.#receiveMode !== 'off') this.#ensureBleWake();
    return this.#tcpPort;
  }

  #ensureBleWake() {
    if (this.discoveryEnabled && this.#tcpServer && !this.#bleProcess && process.platform === 'win32') {
      this.#bleProcess = startWindowsBleWakeAdvertiser();
      const child = this.#bleProcess;
      child?.once('exit', () => { if (this.#bleProcess === child) this.#bleProcess = null; });
    }
  }

  #stopBleWake() {
    if (this.#bleProcess) {
      try {
        this.#bleProcess.kill();
      } catch {}
      this.#bleProcess = null;
    }
  }

  stop() {
    clearInterval(this.#networkTimer);
    this.#networkTimer = null;
    this.cancelAll();
    clearInterval(this.#announceTimer);
    this.#announceTimer = null;
    this.#stopBleWake();
    for (const s of this.#activeSockets) {
      try {
        s.destroy();
      } catch {}
    }
    this.#activeSockets.clear();
    if (this.#mdnsSocket) {
      try {
        this.#mdnsSocket.close();
      } catch {}
      this.#mdnsSocket = null;
    }
    if (this.#tcpServer) {
      try {
        this.#tcpServer.close();
      } catch {}
      this.#tcpServer = null;
      this.#tcpPort = 0;
    }
  }

  discover() {
    if (!this.#mdnsSocket) return;
    try {
      const q = buildMdnsQuery([
        { name: QS_SERVICE, type: 12 },
        { name: QS_SERVICE, type: 255 },
      ]);
      this.#mdnsSocket.send(q, 0, q.length, MDNS_PORT, MDNS_ADDR);
    } catch {}
    this.#announce();
  }

  async refreshNetwork() {
    if (!this.#tcpServer) return;
    const ip = await getRoutedIPv4();
    if (!this.#tcpServer) return;
    if (ip !== this.#advertiseIp) {
      this.#advertiseIp = ip;
      try { this.#mdnsSocket?.addMembership(MDNS_ADDR, ip); } catch {}
      try { this.#mdnsSocket?.setMulticastInterface(ip); } catch {}
      this.#log('network-changed', ip);
    }
    if (this.#receiveMode !== 'off') this.#ensureBleWake();
    this.discover();
  }

  respondOffer(offerId, accept) {
    const p = this.#pendingOffers.get(offerId);
    if (!p) return false;
    this.#pendingOffers.delete(offerId);
    p.resolve(Boolean(accept));
    return true;
  }

  cancelAll() {
    for (const [, p] of this.#pendingOffers) p.resolve(false);
    this.#pendingOffers.clear();
    for (const s of this.#activeSockets) {
      try {
        s.destroy();
      } catch {}
    }
    this.#activeSockets.clear();
  }

  #buildAnnouncePackets(ttl = 120, legacyQuery = null) {
    const endpointName = buildMdnsEndpointName(this.#endpointId);
    const instanceName = `${endpointName}.${QS_SERVICE}`;
    const hostBase = os.hostname().replace(/[^a-zA-Z0-9-]/g, '') || 'Charles-PC';
    const hostName = `${hostBase}-charles-${this.#endpointId.toLowerCase()}.local.`;
    const epInfo = b64UrlEncode(buildEndpointInfo(this.#deviceName, 3));
    return [this.#advertiseIp || getLocalIPv4()].map((ip) =>
      buildMdnsAnnouncement({
        serviceType: QS_SERVICE,
        instanceName,
        hostName,
        ip,
        port: this.#tcpPort,
        txtMap: { n: epInfo },
        ttl,
        legacy: Boolean(legacyQuery),
        queryId: legacyQuery?.id || 0,
        questions: legacyQuery?.questions || [],
      }),
    );
  }

  #announce(unicastTarget = null, legacyQuery = null) {
    if (!this.#mdnsSocket || !this.#tcpPort || this.#receiveMode === 'off') return;
    try {
      const packets = this.#buildAnnouncePackets(120);
      for (const pkt of packets) {
        this.#mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_ADDR);
        if (unicastTarget?.address) {
          // RFC 6762 §5.4: unicast reply to the querier's 5353 (passes through mDNS-filtering routers)
          this.#mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, unicastTarget.address);
        }
      }
      // RFC 6762 §6.7 legacy unicast: querier port != 5353 → same id, questions repeated, TTL<=10, to its port
      if (unicastTarget?.address && unicastTarget.port && unicastTarget.port !== MDNS_PORT && legacyQuery) {
        for (const pkt of this.#buildAnnouncePackets(10, legacyQuery)) {
          this.#mdnsSocket.send(pkt, 0, pkt.length, unicastTarget.port, unicastTarget.address);
        }
      }
    } catch {}
  }

  #startMdns() {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.#mdnsSocket = sock;
    sock.on('error', () => {});
    sock.on('message', (msg, rinfo) => this.#onMdnsMessage(msg, rinfo));
    sock.bind(MDNS_PORT, '0.0.0.0', () => {
      for (const ip of getLocalIPv4Interfaces()) {
        try {
          sock.addMembership(MDNS_ADDR, ip);
        } catch {}
      }
      try {
        sock.addMembership(MDNS_ADDR);
      } catch {}
      try {
        sock.setMulticastTTL(255);
        if (this.#advertiseIp) sock.setMulticastInterface(this.#advertiseIp);
        sock.setMulticastLoopback(true);
      } catch {}
      this.discover();
      this.#announceTimer = setInterval(() => {
        this.#announce();
        this.discover();
      }, 6000);
      this.#announceTimer.unref?.();
    });
  }

  #onMdnsMessage(msg, rinfo) {
    const parsed = parseMdnsPacket(msg);
    if (!parsed) return;

    const myIps = new Set(getLocalIPv4Interfaces());
    const myEndpointPrefix = buildMdnsEndpointName(this.#endpointId);

    if (!parsed.isResponse && parsed.questions.length) {
      const asksQs = parsed.questions.some((q) => {
        const qn = q.name.toUpperCase();
        return (
          qn.includes('_FC9F5ED42C8A') ||
          qn.includes('_SERVICES._DNS-SD._UDP') ||
          qn.startsWith(myEndpointPrefix.toUpperCase())
        );
      });
      if (asksQs) {
        this.#announce(rinfo, parsed);
      }
    }

    if (!parsed.records.length) return;
    if (rinfo?.address && myIps.has(rinfo.address)) {
      const isSelf = parsed.records.some((r) => String(r.name || '').startsWith(myEndpointPrefix));
      if (isSelf) return;
    }

    let removed = false;
    for (const r of parsed.records) {
      if (r.ttl === 0) for (const [id, peer] of this.#peers) {
        if (peer.instanceName === r.name || peer.instanceName === r.parsed) { this.#peers.delete(id); removed = true; }
      }
    }
    const ptrTargetsToQuery = [];
    for (const r of parsed.records) {
      if (r.type === 1 && typeof r.parsed === 'string') {
        this.#hostCache.set(r.name.toLowerCase(), r.parsed);
      } else if (r.type === 33 && r.parsed) {
        if (r.ttl === 0) {
          this.#srvCache.delete(r.name);
        } else {
          this.#srvCache.set(r.name, { ...r.parsed, fromIp: rinfo?.address, seenAt: Date.now(), expiresAt: Date.now() + Math.min(r.ttl, 120) * 1000 });
        }
      } else if (r.type === 16 && r.parsed) {
        this.#txtCache.set(r.name, r.parsed);
      } else if (r.type === 12 && typeof r.parsed === 'string') {
        if (r.name.toUpperCase().includes('_FC9F5ED42C8A')) {
          if (r.ttl === 0) {
            this.#srvCache.delete(r.parsed);
          } else if (!this.#srvCache.has(r.parsed) || !this.#txtCache.has(r.parsed)) {
            ptrTargetsToQuery.push(r.parsed);
          }
        }
      }
    }

    // Actively query SRV + TXT + ANY for newly discovered PTR service instances
    if (ptrTargetsToQuery.length > 0 && this.#mdnsSocket) {
      try {
        const queries = [];
        for (const inst of ptrTargetsToQuery) {
          queries.push({ name: inst, type: 33 }, { name: inst, type: 16 }, { name: inst, type: 255 });
        }
        const pkt = buildMdnsQuery(queries);
        this.#mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_ADDR);
        if (rinfo?.address) {
          this.#mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, rinfo.address);
        }
      } catch {}
    }

    let changed = removed;
    for (const [instName, srv] of this.#srvCache.entries()) {
      if (srv.expiresAt <= Date.now()) {
        this.#srvCache.delete(instName);
        for (const [id, peer] of this.#peers) if (peer.instanceName === instName) { this.#peers.delete(id); changed = true; }
        continue;
      }
      if (!instName.toUpperCase().includes('_FC9F5ED42C8A')) continue;
      const prefix = instName.split('._')[0] || instName.split('.')[0];
      if (prefix === myEndpointPrefix) continue;

      const epMeta = parseMdnsEndpointName(prefix);
      const txt = this.#txtCache.get(instName) || {};
      const epInfo = txt.n ? parseEndpointInfo(txt.n) : null;
      const hostIp =
        (srv.target && this.#hostCache.get(srv.target.toLowerCase())) ||
        srv.fromIp ||
        rinfo?.address;

      if (!hostIp || myIps.has(hostIp) || !srv.port) continue;

      const peerId = `qs:${epMeta?.endpointId || hostIp}`;
      const existing = this.#peers.get(peerId);
      const qrName = epInfo ? this.#qrSession?.matchEndpointInfo(epInfo) : null;
      const resolvedName =
        qrName ||
        epInfo?.name ||
        existing?.name ||
        (epMeta?.endpointId ? `Quick Share (${epMeta.endpointId})` : `Quick Share (${hostIp})`);

      const nextPeer = {
        id: peerId,
        endpointId: epMeta?.endpointId || 'QS01',
        instanceName: instName,
        name: resolvedName,
        deviceType: epInfo?.deviceType || existing?.deviceType || 'phone',
        host: hostIp,
        port: srv.port,
        protocol: 'quickshare',
        qrMatched: Boolean(qrName),
        updatedAt: srv.seenAt,
      };
      if (qrName && !existing?.qrMatched) {
        this.emit('qr-scanned', nextPeer);
      }
      if (
        !existing ||
        existing.name !== nextPeer.name ||
        existing.port !== nextPeer.port ||
        existing.host !== nextPeer.host ||
        existing.qrMatched !== nextPeer.qrMatched
      ) {
        changed = true;
      }
      this.#peers.set(peerId, nextPeer);
    }

    if (changed) {
      this.emit('peers', this.peers);
    }
  }

  async #refreshPeerEndpoint(peer) {
    if (!this.#mdnsSocket) return peer;
    try {
      const queries = [{ name: QS_SERVICE, type: 12 }, { name: QS_SERVICE, type: 255 }];
      if (peer.instanceName) {
        queries.push({ name: peer.instanceName, type: 33 }, { name: peer.instanceName, type: 16 });
      }
      const pkt = buildMdnsQuery(queries);
      this.#mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_ADDR);
      if (peer.host) {
        this.#mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, peer.host);
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 350));
    return this.#peers.get(peer.id) || peer;
  }

  async #connectTcpWithRetry(peer, signal) {
    const attemptConnect = (host, port) =>
      new Promise((resolve, reject) => {
        const sock = net.createConnection({ host, port, signal }, () => {
          sock.setTimeout(0);
          resolve(sock);
        });
        sock.setTimeout(12000);
        sock.once('timeout', () => {
          sock.destroy();
          reject(Error('Quick Share bağlantı zaman aşımı'));
        });
        sock.once('error', (err) => {
          sock.destroy();
          reject(err);
        });
      });

    try {
      return await attemptConnect(peer.host, peer.port);
    } catch (err) {
      if (err && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')) {
        const refreshed = await this.#refreshPeerEndpoint(peer);
        try { return await attemptConnect(refreshed.host, refreshed.port); }
        catch (retryError) {
          if (signal?.aborted) throw Error('Aktarım iptal edildi.');
          throw Error('Cihaza bağlanılamadı. Telefonda Quick Share alım ekranını açıp cihaz listesini yenile. (' + retryError.code + ')');
        }
      }
      throw err;
    }
  }

  #channel(socket, fq, session) {
    return require('./quickshare-channel.cjs')(socket, fq, session, {
      decodeFields, pbFirst, buildKeepAliveFrame, buildPayloadTransferFrame, buildDisconnectionFrame,
    }, (stage, detail) => this.#log(stage, detail));
  }

  #log(stage, detail = '') {
    this.emit('diagnostic', { stage, detail, at: new Date().toISOString() });
    if (!this.logFile) return;
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      if (fs.existsSync(this.logFile) && fs.statSync(this.logFile).size > 1024 * 1024) fs.renameSync(this.logFile, this.logFile + '.previous');
      fs.appendFileSync(this.logFile, JSON.stringify({ at: new Date().toISOString(), stage, detail }) + '\n');
    } catch {}
  }

  async sendFiles(peerOrOpts, filePathsArg, onProgressArg) {
    const opts = Array.isArray(peerOrOpts?.files) ? peerOrOpts : {};
    const peer = opts.files ? { ...opts, id: opts.id || opts.peerId || `qs:${opts.host}` } : peerOrOpts;
    const onProgress = opts.onProgress || onProgressArg || (() => {});
    const signal = opts.signal;
    const checkAbort = () => { if (signal?.aborted) throw Error('Aktarım iptal edildi.'); };
    checkAbort();
    if (!peer?.host || !peer?.port) throw Error('Geçersiz Quick Share hedefi.');
    const files = (opts.files || filePathsArg || []).map((item, i) => {
      const filePath = typeof item === 'string' ? item : item.path;
      const st = fs.statSync(filePath);
      if (!st.isFile()) throw Error('Yalnızca dosya gönderilebilir.');
      return { path: filePath, name: path.basename(filePath), size: st.size,
        mime: guessMime(filePath), payloadId: BigInt(i + 1000), id: i + 1 };
    });
    if (!files.length) throw Error('Gönderilecek dosya yok.');
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    onProgress({ status: 'connecting', transferred: 0, total: totalBytes });
    this.#log('send-connect', `${peer.host}:${peer.port}`);
    const socket = await this.#connectTcpWithRetry(peer, signal);
    this.#activeSockets.add(socket);
    let channel;
    const abort = () => socket.destroy(Error('Aktarım iptal edildi.'));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const fq = createFrameQueue(socket);
      checkAbort();
      const client = createUkey2Client();
      fq.writeFrame(buildConnectionRequestFrame(this.#endpointId, this.#deviceName, buildEndpointInfo(this.#deviceName, 3)));
      fq.writeFrame(client.clientInitMsgBytes);
      const session = client.processServerInit(await fq.nextFrame(15000));
      fq.writeFrame(client.clientFinishMsgBytes);
      fq.writeFrame(buildConnectionResponseFrame(true));
      validateConnectionResponse(await fq.nextFrame(15000));
      this.#log('send-secure-ready');
      channel = this.#channel(socket, fq, session);
      opts.onPin?.(session.pin);
      onProgress({ status: 'connecting', pin: session.pin, transferred: 0, total: totalBytes });
      await channel.sendSharing(buildPairedKeyEncryptionFrame(this.#qrSession?.signAuthString(session.authString)));
      await channel.expect(3);
      await channel.sendSharing(buildPairedKeyResultFrame(3));
      await channel.expect(4);
      await channel.sendSharing(buildIntroductionFrame(files));
      this.#log('send-waiting-for-consent');
      const response = await channel.expect(2, 120000);
      const status = Number(pbFirst(decodeFields(pbFirst(response.v1Fields, 3)), 1) || 0);
      if (status !== 1) throw Error(({2: 'Karşı cihaz aktarımı reddetti.', 3: 'Karşı cihazda yeterli alan yok.',
        4: 'Karşı cihaz dosya türünü desteklemiyor.', 5: 'Karşı cihaz zamanında yanıt vermedi.'})[status] || 'Aktarım kabul edilmedi.');
      let sent = 0;
      for (const f of files) {
        const handle = await fs.promises.open(f.path, 'r');
        try {
          const buffer = Buffer.alloc(FILE_CHUNK_SIZE);
          let offset = 0;
          while (offset < f.size) {
            checkAbort();
            const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, f.size - offset), offset);
            if (!bytesRead) throw Error('Gönderilen dosyanın boyutu değişti.');
            await channel.send(buildPayloadTransferFrame({ id: f.payloadId, type: 2, totalSize: f.size,
              offset, body: buffer.subarray(0, bytesRead) }));
            offset += bytesRead; sent += bytesRead;
            onProgress({ status: 'sending', fileName: f.name, transferred: sent, total: totalBytes });
          }
          await channel.send(buildPayloadTransferFrame({ id: f.payloadId, type: 2, totalSize: f.size,
            offset: f.size, flags: 1 }));
        } finally { await handle.close(); }
      }
      // The receiving endpoint disconnects after persisting all files.
      // A timeout or an explicit cancellation is never reported as success.
      const deadline = Date.now() + 30000;
      while (true) {
        checkAbort();
        const event = await channel.next(Math.max(1, deadline - Date.now()));
        if (event.kind === 'closed') {
          if (!/Karşı cihaz bağlantıyı sonlandırdı|Bağlantı karşı cihaz tarafından kapatıldı/.test(event.error.message)) throw event.error;
          break;
        }
        if (event.kind === 'bytes') channel.parseSharing(event.body);
        if (Date.now() >= deadline) throw Error('Dosyalar gönderildi ancak alıcı tamamlandığını doğrulamadı.');
      }
      this.#log('send-done');
      onProgress({ status: 'done', transferred: totalBytes, total: totalBytes });
      return { ok: true, files: files.map(f => ({ name: f.name, path: f.path, size: f.size })) };
    } catch (error) {
      this.#log('send-error', error.message);
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      this.#activeSockets.delete(socket);
      if (channel) channel.close(); else socket.destroy();
    }
  }

  async #handleIncoming(socket) {
    if (this.#receiveMode === 'off') { socket.destroy(); return; }
    this.#activeSockets.add(socket);
    const fq = createFrameQueue(socket);
    const id = crypto.randomUUID();
    let channel, peerName = 'Quick Share Cihazı', pendingId;
    const files = [];
    this.#log('receive-connect', socket.remoteAddress);
    try {
      const first = decodeFields(await fq.nextFrame(15000));
      const v1 = decodeFields(pbFirst(first, 2));
      if (Number(pbFirst(v1, 1)) !== 1) throw Error('Quick Share bağlantı isteği bekleniyordu.');
      const request = decodeFields(pbFirst(v1, 2));
      peerName = parseEndpointInfo(pbFirst(request, 6))?.name || pbFirst(request, 2)?.toString('utf8') || peerName;
      const server = createUkey2Server(pbFirst(request, 3) || await fq.nextFrame(15000));
      fq.writeFrame(server.serverInitMsgBytes);
      const session = server.processClientFinish(await fq.nextFrame(15000));
      validateConnectionResponse(await fq.nextFrame(15000));
      fq.writeFrame(buildConnectionResponseFrame(true));
      this.#log('receive-secure-ready');
      channel = this.#channel(socket, fq, session);
      await channel.sendSharing(buildPairedKeyEncryptionFrame());
      await channel.expect(3);
      await channel.sendSharing(buildPairedKeyResultFrame(3));
      await channel.expect(4);
      const intro = await channel.expect(1);
      const meta = decodeFields(pbFirst(intro.v1Fields, 2));
      for (const raw of meta.get(1) || []) {
        const f = decodeFields(raw);
        files.push({ name: pbFirst(f, 1)?.toString('utf8') || 'dosya',
          payloadId: String(pbFirst(f, 3) ?? 0n), size: Number(pbFirst(f, 4) || 0),
          mime: pbFirst(f, 5)?.toString('utf8') || 'application/octet-stream', received: 0, complete: false, fd: null });
      }
      if (!files.length || files.length > 1000) { await channel.sendSharing(buildSharingResponseFrame(false)); return; }
      if (new Set(files.map(f => f.payloadId)).size !== files.length || files.some(f => !Number.isSafeInteger(f.size) || f.size < 0)) throw Error('Geçersiz dosya listesi.');
      const total = files.reduce((sum, f) => sum + f.size, 0);
      this.#log('receive-offer', `${files.length} files, ${total} bytes`);
      let accepted = this.#receiveMode === 'auto';
      if (!accepted) {
        pendingId = id;
        const decision = new Promise(resolve => {
          const timer = setTimeout(() => this.respondOffer(id, false), 45000);
          this.#pendingOffers.set(id, { resolve: value => { clearTimeout(timer); resolve(value); } });
          this.emit('offer', { id, protocol: 'quickshare', peerName, pin: session.pin,
            files: files.map(f => ({ name: f.name, size: f.size, mime: f.mime })),
            respond: value => this.respondOffer(id, value) });
        });
        accepted = await Promise.race([decision, channel.ended.then(e => { throw e.error; })]);
      }
      if (this.#receiveMode === 'off') accepted = false;
      await channel.sendSharing(buildSharingResponseFrame(accepted));
      if (!accepted) return;
      for (const f of files) {
        // Reserve final names exclusively so duplicate filenames cannot overwrite.
        for (;;) {
          f.destPath = uniqueDestPath(this.#downloadDir, f.name);
          try { f.fd = fs.openSync(f.destPath, 'wx'); f.created = true; break; }
          catch (e) { if (e.code !== 'EEXIST') throw e; }
        }
      }
      const byId = new Map(files.map(f => [f.payloadId, f]));
      let completed = 0, transferred = 0;
      while (completed < files.length) {
        const event = await channel.next(60000);
        if (event.kind === 'closed') throw Error('Dosya aktarımı tamamlanmadan bağlantı kesildi: ' + event.error.message);
        if (event.kind === 'bytes') { channel.parseSharing(event.body); continue; }
        const f = byId.get(event.id);
        if (!f || f.complete) throw Error('Bilinmeyen veya tamamlanmış dosya için veri geldi.');
        if (event.total !== f.size || event.offset !== f.received || f.received + event.body.length > f.size) throw Error('Dosya parçalarının boyutu veya sırası uyuşmuyor.');
        if (event.body.length) {
          fs.writeSync(f.fd, event.body, 0, event.body.length, f.received);
          f.received += event.body.length; transferred += event.body.length;
        }
        if (event.last) {
          if (f.received !== f.size) throw Error('Dosya eksik alındı.');
          fs.closeSync(f.fd); f.fd = null; f.complete = true; completed++;
        }
        this.emit('progress', { id, direction: 'receive', protocol: 'quickshare', peerName,
          pin: session.pin, fileName: f.name, transferred, total });
      }
      this.#log('receive-done');
      this.emit('received', { id, protocol: 'quickshare', peerName,
        files: files.map(f => ({ name: path.basename(f.destPath), path: f.destPath, size: f.size })) });
    } catch (error) {
      this.#log('receive-error', error.message);
      this.emit('transfer-error', { id, protocol: 'quickshare', peerName, error: error.message });
    } finally {
      if (pendingId) this.respondOffer(pendingId, false);
      for (const f of files) {
        if (f.fd !== null) { try { fs.closeSync(f.fd); } catch {} }
        if (f.created && !f.complete) { try { fs.unlinkSync(f.destPath); } catch {} }
      }
      this.#activeSockets.delete(socket);
      if (channel) channel.close(); else socket.destroy();
    }
  }

}

module.exports = {
  QuickShareEngine,
  QrKeySession,
  buildEndpointInfo,
  encodeEndpointInfo: buildEndpointInfo,
  parseEndpointInfo,
  buildMdnsEndpointName,
  parseMdnsEndpointName,
  buildMdnsQuery,
  buildMdnsAnnouncement,
  parseMdnsPacket,
  derivePin,
  computePin: derivePin,
  renderQrSvg,
  getLocalIPv4,
  getRoutedIPv4,
};
