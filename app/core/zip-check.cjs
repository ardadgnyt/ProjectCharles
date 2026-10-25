'use strict';
// fflate inflates entries without CRC checks. Invalid metadata must fail closed.
function crc32(data) {
  const z = require('node:zlib');
  if (typeof z.crc32 === 'function') return z.crc32(data) >>> 0;
  let c = ~0;
  for (const byte of data) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function zipChecksums(bytes) {
  const b = Buffer.from(bytes);
  const bad = () => { throw Error('Arşiv bozuk: ZIP dizini doğrulanamadı.'); };
  const range = (p, n, end = b.length) => {
    if (!Number.isSafeInteger(p) || !Number.isSafeInteger(n) || p < 0 || n < 0 || p > end - n) bad();
  };
  const u64 = p => { range(p, 8); const n = b.readBigUInt64LE(p); if (n > BigInt(Number.MAX_SAFE_INTEGER)) bad(); return Number(n); };
  let end = -1;
  for (let p = b.length - 22; p >= Math.max(0, b.length - 65557); p--) {
    if (b.readUInt32LE(p) === 0x06054b50 && p + 22 + b.readUInt16LE(p + 20) === b.length) { end = p; break; }
  }
  if (end < 0 || b.readUInt16LE(end + 4) || b.readUInt16LE(end + 6)) bad();
  let count = b.readUInt16LE(end + 10), size = b.readUInt32LE(end + 12), offset = b.readUInt32LE(end + 16), directoryEnd = end;
  if (count === 65535 || size === 0xffffffff || offset === 0xffffffff) {
    range(end - 20, 20);
    if (b.readUInt32LE(end - 20) !== 0x07064b50 || b.readUInt32LE(end - 16) || b.readUInt32LE(end - 4) !== 1) bad();
    const z = u64(end - 12); range(z, 56, end - 20);
    if (b.readUInt32LE(z) !== 0x06064b50 || u64(z + 4) < 44 || z + 12 + u64(z + 4) !== end - 20 || b.readUInt32LE(z + 16) || b.readUInt32LE(z + 20)) bad();
    count = u64(z + 32); size = u64(z + 40); offset = u64(z + 48); directoryEnd = z;
    if (u64(z + 24) !== count) bad();
  } else if (b.readUInt16LE(end + 8) !== count) bad();
  range(offset, size, directoryEnd);
  if (count > Math.floor(size / 46) || offset + size !== directoryEnd) bad();
  const out = new Map(), sizes = new Map(), names = new Map();
  let p = offset;
  for (let i = 0; i < count; i++) {
    range(p, 46, directoryEnd);
    if (b.readUInt32LE(p) !== 0x02014b50 || (b.readUInt16LE(p + 8) & 1)) bad();
    const n = b.readUInt16LE(p + 28), x = b.readUInt16LE(p + 30), c = b.readUInt16LE(p + 32);
    range(p + 46, n + x + c, directoryEnd);
    const name = b.toString(b.readUInt16LE(p + 8) & 2048 ? 'utf8' : 'latin1', p + 46, p + 46 + n);
    if (!name) bad();
    const key = name.replace(/\\/g, '/').split('/').filter(part => part && part !== '.').join('/').toLowerCase();
    if (names.has(key)) throw Error('Arşivde aynı adlı veya büyük/küçük harfi çakışan iki yol var: ' + name);
    names.set(key, name.endsWith('/'));
    let unpacked = b.readUInt32LE(p + 24), packed = b.readUInt32LE(p + 20), local = b.readUInt32LE(p + 42);
    const disk = b.readUInt16LE(p + 34);
    if (disk !== 0 && disk !== 65535) bad();
    if (unpacked === 0xffffffff || packed === 0xffffffff || local === 0xffffffff || disk === 65535) {
      let found = false;
      for (let e = p + 46 + n, limit = e + x; e < limit;) {
        range(e, 4, limit);
        const tag = b.readUInt16LE(e), len = b.readUInt16LE(e + 2); range(e + 4, len, limit);
        if (tag === 1) {
          let a = e + 4;
          const next = () => { range(a, 8, e + 4 + len); const value = u64(a); a += 8; return value; };
          if (unpacked === 0xffffffff) unpacked = next();
          if (packed === 0xffffffff) packed = next();
          if (local === 0xffffffff) local = next();
          if (disk === 65535) { range(a, 4, e + 4 + len); if (b.readUInt32LE(a)) bad(); }
          found = true; break;
        }
        e += 4 + len;
      }
      if (!found) bad();
    }
    range(local, 30, offset);
    if (b.readUInt32LE(local) !== 0x04034b50) bad();
    const data = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    range(data, packed, offset);
    out.set(name, b.readUInt32LE(p + 16)); sizes.set(name, unpacked);
    p += 46 + n + x + c;
  }
  if (p !== directoryEnd) bad();
  for (const key of names.keys()) {
    const parts = key.split('/'); parts.pop();
    while (parts.length) {
      if (names.get(parts.join('/')) === false) throw Error('Arşivde dosya ve klasör yolları çakışıyor: ' + key);
      parts.pop();
    }
  }
  out.sizes = sizes;
  return out;
}
function verifyZipFiles(sums, files) {
  for (const [name, bytes] of Object.entries(files)) {
    if (!sums.has(name) || bytes.length !== sums.sizes.get(name) || crc32(bytes) !== sums.get(name)) throw Error('Arşiv bozuk: ' + name + ' doğrulanamadı (CRC/boyut).');
  }
  for (const name of sums.keys()) {
    if (!name.endsWith('/') && !Object.hasOwn(files, name)) throw Error('Arşiv bozuk: eksik dosya ' + name);
  }
}
module.exports = { crc32, zipChecksums, verifyZipFiles };
