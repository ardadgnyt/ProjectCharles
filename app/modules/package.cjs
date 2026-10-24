// v0.8.0: reading a module package (.zip, or a folder in developer mode) safely.
// Nothing is written here: the result is checked file data that registry.cjs installs.
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync } = require('fflate');
const { parseManifest } = require('./manifest.cjs');

const LIMITS = { totalBytes: 100 * 1024 * 1024, files: 2000, pathLength: 200 };
// programs and scripts Windows (or a shell) could run; a module is web content only
const FORBIDDEN = /\.(exe|dll|bat|cmd|com|ps1|psm1|psd1|vbs|vbe|wsf|wsh|ws|msi|msp|mst|node|sh|bash|lnk|url|scr|cpl|jar|reg|hta|sys|drv|ocx|appx|msix|appxbundle|msixbundle|application|gadget|inf|pif|chm|iso|img|vhd|vhdx)$/i;

const fail = (m) => {
  throw Error(m);
};

/** A path from a zip or folder → a clean "a/b.txt" path, or an error. */
function cleanPath(name) {
  if (typeof name !== 'string' || !name) fail('Pakette adı olmayan bir dosya var.');
  if (/[\u0000-\u001f]/.test(name)) fail('Pakette geçersiz karakterli bir dosya adı var.');
  if (name.includes('\\')) fail(`Pakette ters bölü işaretli yol var: ${name.slice(0, 80)}`);
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) fail(`Pakette mutlak yol var (izin verilmez): ${name.slice(0, 80)}`);
  const parts = name.split('/').filter((p) => p !== '');
  if (parts.some((p) => p === '..')) fail(`Pakette klasör dışına çıkan yol var (zip-slip): ${name.slice(0, 80)}`);
  if (parts.some((p) => p === '.' || /[<>:"|?*]/.test(p) || /[. ]$/.test(p))) fail(`Pakette Windows’ta geçersiz bir dosya adı var: ${name.slice(0, 80)}`);
  // v0.9.1: Windows device names (CON, NUL, COM1…, also with an extension) are no files
  if (parts.some((p) => /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i.test(p))) fail(`Pakette Windows’ta ayrılmış bir dosya adı var: ${name.slice(0, 80)}`);
  const clean = parts.join('/');
  if (clean.length > LIMITS.pathLength) fail(`Pakette çok uzun bir dosya yolu var: ${clean.slice(0, 80)}…`);
  return clean;
}

function checkFiles(entries) {
  // entries: [name, size][]
  if (entries.length > LIMITS.files) fail(`Pakette çok fazla dosya var (${entries.length}; en fazla ${LIMITS.files}).`);
  let total = 0;
  const seen = new Set();
  for (const [name, bytes] of entries) {
    if (FORBIDDEN.test(name)) fail(`Pakette çalıştırılabilir dosya var, modüllerde izin verilmez: ${name}`);
    const key = name.toLowerCase();
    if (seen.has(key)) fail(`Pakette aynı adlı iki dosya var: ${name}`);
    seen.add(key);
    total += bytes;
    if (total > LIMITS.totalBytes) fail('Paket çok büyük (açılmış hali en fazla 100 MB olabilir).');
  }
}

/** Files with a single top folder ("hello-module/manifest.json") are moved to the root. */
function stripTopFolder(names) {
  if (names.includes('manifest.json')) return '';
  const tops = new Set(names.map((n) => n.split('/')[0]));
  if (tops.size === 1) {
    const top = [...tops][0];
    if (names.includes(top + '/manifest.json')) return top + '/';
  }
  return null;
}

function finish(files) {
  const names = [...files.keys()];
  const prefix = stripTopFolder(names);
  if (prefix === null) fail('Paketin kökünde manifest.json bulunamadı.');
  const out = new Map();
  for (const [n, data] of files) if (n.startsWith(prefix)) out.set(n.slice(prefix.length), data);
  const manifest = parseManifest(Buffer.from(out.get('manifest.json')).toString('utf8'));
  if (!out.has(manifest.entry)) fail(`Modülün giriş dosyası pakette yok: ${manifest.entry}`);
  if (manifest.icon && !out.has(manifest.icon)) fail(`Modülün simgesi pakette yok: ${manifest.icon}`);
  return { manifest, files: out };
}

/** A .zip (bytes) → { manifest, files: Map<path, Uint8Array> } or a Turkish error. */
function readZip(bytes) {
  if (!bytes || bytes.length < 22) fail('Bu dosya geçerli bir .zip değil.');
  if (bytes.length > LIMITS.totalBytes) fail('Paket çok büyük (en fazla 100 MB).');
  const declared = [];
  let raw;
  try {
    raw = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      filter(file) {
        if (file.name.endsWith('/')) return false; // folder entries
        declared.push([cleanPath(file.name), file.originalSize]);
        // checked as the list grows: too many / too large stops before anything is unpacked
        checkFiles(declared);
        return true;
      },
    });
  } catch (e) {
    if (/^Pakette|^Paket |^Bu dosya/.test(e.message)) throw e;
    fail('Zip açılamadı: dosya bozuk ya da desteklenmeyen bir sıkıştırma kullanıyor.');
  }
  const files = new Map();
  let total = 0;
  for (const [name, data] of Object.entries(raw)) {
    if (name.endsWith('/')) continue;
    total += data.length; // the real size, not what the zip claims
    if (total > LIMITS.totalBytes) fail('Paket çok büyük (açılmış hali en fazla 100 MB olabilir).');
    files.set(cleanPath(name), data);
  }
  return finish(files);
}

/** A folder (developer mode) → the same result; links and special files are refused. */
function readFolder(dir) {
  const st = fs.lstatSync(dir);
  if (!st.isDirectory()) fail('Seçilen yol bir klasör değil.');
  const entries = [];
  const walk = (abs, rel) => {
    for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
      if (rel === '' && (d.name === '.git' || d.name === 'node_modules')) continue;
      const r = rel ? rel + '/' + d.name : d.name;
      const a = path.join(abs, d.name);
      if (d.isSymbolicLink()) fail(`Klasörde kısayol/bağlantı var, izin verilmez: ${r}`);
      if (d.isDirectory()) walk(a, r);
      else if (d.isFile()) entries.push([cleanPath(r), a]);
      else fail(`Klasörde desteklenmeyen bir öğe var: ${r}`);
      if (entries.length > LIMITS.files) fail(`Klasörde çok fazla dosya var (en fazla ${LIMITS.files}).`);
    }
  };
  walk(dir, '');
  checkFiles(entries.map(([n, a]) => [n, fs.statSync(a).size]));
  const files = new Map(entries.map(([n, a]) => [n, fs.readFileSync(a)]));
  return finish(files);
}

module.exports = { readZip, readFolder, cleanPath, checkFiles, LIMITS, FORBIDDEN };
