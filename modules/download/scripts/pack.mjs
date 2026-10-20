// npm run pack → frp-<version>.zip from dist/, checked with the same rules Charles uses when
// installing (app/modules/manifest.cjs + package.cjs). No dependencies: Node's own zlib.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const fail = (m) => {
  console.error('✖ ' + m);
  process.exit(1);
};

// ── the same checks as Charles ─────────────────────────────────────────────────
const FORBIDDEN = /\.(exe|dll|bat|cmd|com|ps1|psm1|psd1|vbs|vbe|wsf|wsh|ws|msi|msp|mst|node|sh|bash|lnk|url|scr|cpl|jar|reg|hta|sys|drv|ocx|appx|msix|appxbundle|msixbundle|application|gadget|inf|pif|chm|iso|img|vhd|vhdx)$/i;
const KEYS = new Set(['id', 'name', 'version', 'author', 'description', 'charlesApi', 'entry', 'icon', 'window', 'permissions']);
const m = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
for (const k of Object.keys(m)) if (!KEYS.has(k)) fail(`manifest: bilinmeyen alan “${k}”`);
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(m.id)) fail('manifest: geçersiz id');
if (m.charlesApi !== 1) fail('manifest: charlesApi 1 olmalı');
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,30})?$/.test(m.version)) fail('manifest: version 1.0.0 biçiminde olmalı');
for (const [k, max] of [
  ['name', 60],
  ['author', 60],
  ['description', 300],
])
  if (typeof m[k] !== 'string' || !m[k].trim() || m[k].length > max) fail(`manifest: “${k}” boş ya da ${max} karakterden uzun`);
for (const p of m.permissions ?? []) if (!['ai', 'image', 'voice', 'storage', 'slime', 'notify'].includes(p)) fail(`manifest: bilinmeyen izin ${p}`);
const w = m.window ?? {};
if ((w.minWidth ?? 480) > (w.width ?? 1100) || (w.minHeight ?? 360) > (w.height ?? 760)) fail('manifest: min boyut pencere boyutundan büyük');

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const a = join(d, e.name);
    if (e.isSymbolicLink()) fail('bağlantı/kısayol var: ' + a);
    if (e.isDirectory()) walk(a);
    else if (e.isFile() && !e.name.endsWith('.map')) files.push(relative(dist, a).split(sep).join('/'));
  }
};
walk(dist);
for (const f of files) {
  if (FORBIDDEN.test(f)) fail('çalıştırılabilir dosya: ' + f);
  if (f.split('/').some((p) => p === '..' || p === '.' || /[<>:"|?*]/.test(p) || /[. ]$/.test(p))) fail('geçersiz dosya adı: ' + f);
  if (f.length > 200) fail('çok uzun yol: ' + f);
}
if (!files.includes(m.entry)) fail('giriş dosyası yok: ' + m.entry);
if (m.icon && !files.includes(m.icon)) fail('simge yok: ' + m.icon);
const total = files.reduce((a, f) => a + statSync(join(dist, f)).size, 0);
if (files.length > 2000 || total > 100 * 1024 * 1024) fail('paket çok büyük');

// ── zip ──────────────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const parts = [];
const central = [];
let offset = 0;
for (const f of files.sort()) {
  const data = readFileSync(join(dist, f));
  const name = Buffer.from(f, 'utf8');
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0800, 6); // UTF-8 names
  lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(dosTime, 10);
  lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26);
  parts.push(lh, name, comp);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(dosTime, 12);
  ch.writeUInt16LE(dosDate, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, name);
  offset += 30 + name.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);
const out = join(root, `${m.id}-${m.version}.zip`);
writeFileSync(out, Buffer.concat([...parts, cd, end]));
console.log(`✔ ${relative(root, out)} · ${files.length} dosya · ${(statSync(out).size / 1024).toFixed(1)} KB`);
