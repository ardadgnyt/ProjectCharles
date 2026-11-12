'use strict';
// v0.9.26: archives, apart from document and media conversion. Windows' own tar.exe (libarchive,
// Windows 10 1803 and newer; RAR and 7z reading come with it) packs and unpacks ZIP, 7z, TAR,
// TAR.GZ / TGZ and TAR.XZ and unpacks RAR. Before anything is unpacked the archive's list is checked:
// no absolute paths, no "..", no drive letters, no links, a limit on files and size. It always goes
// into a new, empty folder; nothing that exists is overwritten. Moving from one archive format to
// another is unpacking safely into a temporary folder and packing that again.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const MAX_FILES = 50000;
const MAX_BYTES = 8 * 1024 * 1024 * 1024; // what may come out of one archive
const READS = /\.(zip|7z|tar|tgz|tar\.gz|tar\.xz|txz|tar\.bz2|tbz2?|rar|cab|iso)$/i;
const WRITES = { zip: 'zip', '7z': '7z', tar: 'tar', 'tar.gz': 'tar.gz', 'tar.xz': 'tar.xz' };

function available() {
  return process.platform === 'win32' && fs.existsSync(TAR);
}

function run(args, { cwd, signal, timeout = 3600000, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(TAR, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return reject(e);
    }
    const out = [];
    let size = 0;
    let err = '';
    child.stdout.on('data', (d) => {
      size += d.length;
      if (size < 64 * 1024 * 1024) out.push(d);
    });
    child.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener?.('abort', stop, { once: true });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', stop);
      if (signal?.aborted) return reject(Object.assign(Error('İptal edildi.'), { cancelled: true }));
      if (code !== 0) {
        const msg = err.split(/\r?\n/).find((l) => l.trim()) || 'çıkış kodu ' + code;
        if (/encrypt|password|passphrase/i.test(err)) return reject(Error('Arşiv parolayla korunuyor; açılamıyor.'));
        return reject(Error('Arşiv okunamadı: ' + msg.replace(/^tar\.exe:\s*/, '').slice(0, 200)));
      }
      resolve(Buffer.concat(out).toString('utf8'));
    });
  });
}

/** One entry of the list is safe to unpack: a plain relative path inside the folder. */
function safeEntry(name) {
  const n = String(name).replace(/\\/g, '/');
  if (!n || n.includes('\0')) return false;
  if (n.startsWith('/') || /^[a-z]:/i.test(n) || n.startsWith('//')) return false;
  if (n.split('/').some((p) => p === '..')) return false;
  if (/[<>:"|?*\u0000-\u001f]/.test(n.replace(/\/$/, ''))) return false;
  return true;
}

/** The archive's entries (tar -tv), checked before anything is unpacked. */
async function check(file, { signal } = {}) {
  const list = await run(['-tvf', file], { signal });
  const lines = list.split(/\r?\n/).filter(Boolean);
  if (lines.length > MAX_FILES) throw Error(`Arşivde çok fazla dosya var (en fazla ${MAX_FILES}).`);
  let total = 0;
  const names = [];
  for (const line of lines) {
    // "-rw-r--r--  0 user group   1234 Jan  1 00:00 name" (bsdtar -tv)
    const m = /^([-dlhcbp])\S*\s+\d+\s+\S*\s+\S*\s+(\d+)\s+\S+\s+\S+\s+\S+\s(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] === 'l' || m[1] === 'h') throw Error('Arşivde bağlantı (link) var; güvenlik için açılmadı.');
    if (!safeEntry(m[3].replace(/ -> .*$/, ''))) throw Error('Arşivde klasör dışına yazmaya çalışan bir yol var; güvenlik için açılmadı.');
    total += +m[2];
    names.push(m[3]);
  }
  if (total > MAX_BYTES) throw Error('Arşivin içi çok büyük (8 GB’den fazla).');
  return { files: names.length, bytes: total };
}

/** Unpacks into a new folder beside `dir` named after the archive; returns that folder. */
async function extract(file, dir, { signal, freePath } = {}) {
  if (!READS.test(file)) throw Error('Bu arşiv biçimi açılamıyor.');
  const info = await check(file, { signal });
  const base = path.basename(file).replace(READS, '') || 'Arşiv';
  const target = freePath(dir, base);
  const tmp = target + '.part';
  fs.mkdirSync(tmp);
  try {
    // no -P: tar itself also refuses absolute paths and ".."; no owners or permissions are copied
    await run(['-xf', file, '-C', tmp, '--no-same-owner', '--no-same-permissions'], { signal });
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { folder: target, ...info };
}

/** Packs files and folders into a new archive (format: zip, 7z, tar, tar.gz, tar.xz). */
async function create(paths, target, format, { signal } = {}) {
  if (!WRITES[format]) throw Error('Bu arşiv biçimi oluşturulamıyor.');
  if (fs.existsSync(target)) throw Error('Bu adla bir dosya zaten var.');
  const dirs = [...new Set(paths.map((p) => path.dirname(p)))];
  const tmp = target + '.part';
  try {
    if (dirs.length === 1) {
      await run(['-a', '-cf', tmp + '.' + format, '-C', dirs[0], ...paths.map((p) => path.basename(p))], { signal });
    } else {
      // files from several folders: each goes in under its own name
      const args = ['-a', '-cf', tmp + '.' + format];
      for (const p of paths) args.push('-C', path.dirname(p), path.basename(p));
      await run(args, { signal });
    }
    fs.renameSync(tmp + '.' + format, target);
  } finally {
    fs.rmSync(tmp + '.' + format, { force: true });
  }
  return target;
}

/** One archive into another format: unpacked safely into a temporary folder, packed again. */
async function repack(file, target, format, { signal } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-archive-'));
  try {
    const { folder } = await extract(file, work, { signal, freePath: (d, n) => path.join(d, n) });
    const names = fs.readdirSync(folder).map((n) => path.join(folder, n));
    if (!names.length) throw Error('Arşivde dosya yok.');
    return await create(names, target, format, { signal });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { available, check, extract, create, repack, safeEntry, READS, WRITES, TAR };
