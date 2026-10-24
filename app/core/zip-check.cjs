// v0.9.1: checks the files unpacked from a zip against the checksums the zip records (the unzip
// library does not): used for updates and for the converter's "extract".
/** CRC-32 of a buffer (zlib's when there is one). */
function crc32(data) {
  const z = require('node:zlib');
  if (typeof z.crc32 === 'function') return z.crc32(data) >>> 0;
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
/** The zip's central directory: file name → CRC-32 (null when it cannot be read). */
function zipChecksums(bytes) {
  try {
    const b = Buffer.from(bytes.buffer ? bytes.buffer : bytes, bytes.byteOffset || 0, bytes.length);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
      if (b.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    if (eocd < 0) return null;
    let count = b.readUInt16LE(eocd + 10),
      p = b.readUInt32LE(eocd + 16);
    if (count === 0xffff || p === 0xffffffff) return null; // zip64: left to the unzip step
    const out = new Map();
    while (count-- > 0) {
      if (b.readUInt32LE(p) !== 0x02014b50) return null;
      const crc = b.readUInt32LE(p + 16);
      const n = b.readUInt16LE(p + 28),
        x = b.readUInt16LE(p + 30),
        c = b.readUInt16LE(p + 32);
      out.set(b.toString('utf8', p + 46, p + 46 + n), crc);
      p += 46 + n + x + c;
    }
    return out;
  } catch {
    return null;
  }
}

module.exports = { crc32, zipChecksums };
