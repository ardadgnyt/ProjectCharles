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
// v1.0.0: tar.exe works in the ANSI code page (1254 on Turkish Windows; LC_ALL, LANG and
// hdrcharset change nothing). A name outside it (Chinese, Japanese, Korean, Greek, Russian, emoji)
// crashes packing (0xC0000005) and makes reading a UTF-8 ZIP or pax TAR fail ("unreadable
// filename"). ZIP, TAR and TAR.GZ then go through Charles' own readers and writers (fflate and
// zlib, which ship already); 7z, TAR.XZ and RAR say so plainly.
const NAME_WRITE = 'Bazı dosya adlarında Windows’un arşiv aracının (tar.exe) işleyemediği karakterler var (ör. Çince, Japonca, Rusça); bu biçimde paketlenemiyor. ZIP ya da TAR seçin.';
const NAME_READ = 'Arşivdeki bazı dosya adlarında Windows’un arşiv aracının (tar.exe) okuyamadığı karakterler var (ör. Çince, Japonca, Rusça); bu biçimdeki arşiv açılamıyor. Böyle adlar ZIP, TAR ve TAR.GZ arşivlerinde açılabiliyor.';
const SPECIAL = 'Arşivde aygıt ya da özel bir dosya türü var; güvenlik için açılmadı.';
const CHANGED = 'Bir dosya paketlenirken değişti; yeniden deneyin.';
const LINK = 'Arşivde bağlantı (link) var; güvenlik için açılmadı.';
const TARS = /\.(tar|tar\.gz|tgz)$/i;
const ZIP_BROKEN = 'Arşiv bozuk; açılamıyor.';
const ZIP_METHOD = 'Bu ZIP arşivi desteklenmeyen bir sıkıştırma yöntemi kullanıyor; açılamıyor.';
const ZIP_DUP = 'Arşivde aynı adı taşıyan iki kayıt var; güvenlik için açılmadı.';
const ZIP_LIMIT = 'Bu dosyalar ZIP olarak paketlenemiyor: toplam 4 GB’den büyük ya da 65.000’den fazla dosya var.';
const PATH_OUT = 'Arşivde klasör dışına yazmaya çalışan bir yol var; güvenlik için açılmadı.';
const CRASH = 0xc0000005;
const ANSI = ['windows-1254', 'windows-1252', 'windows-1250', 'windows-1251', 'windows-1253', 'windows-1255',
  'windows-1256', 'windows-1257', 'windows-1258', 'windows-874', 'shift_jis', 'gbk', 'big5', 'euc-kr', 'utf-8'];

function available() {
  return process.platform === 'win32' && fs.existsSync(TAR);
}

function run(args, { cwd, signal, timeout = 3600000, spawnFn = spawn, raw = false } = {}) {
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
        if (/unreadable filename/i.test(err)) return reject(Object.assign(Error(NAME_READ), { unreadableName: true }));
        if (code === CRASH) return reject(Object.assign(Error(NAME_WRITE), { crashed: true }));
        return reject(Error('Arşiv okunamadı: ' + msg.replace(/^tar\.exe:\s*/, '').slice(0, 200)));
      }
      resolve(raw ? Buffer.concat(out) : Buffer.concat(out).toString('utf8'));
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
  return (await inspect(file, { signal })).info;
}

/** check() plus how to unpack: `zip` holds the checked entries when Charles reads the ZIP itself. */
async function inspect(file, { signal, also = [] } = {}) {
  // v1.0.0: --numeric-owner: an owner or group name with spaces ("Domain Users") cannot shift the
  // columns, so every line of an ordinary archive reads and any other line is refused below
  let list;
  try {
    // v1.0.0 (bughunt): tar.exe cannot open a path (the archive's own, or the folder it unpacks
    // into: `also`) that leaves the ANSI code page either ("Failed to open"): Charles' own readers then
    if (!(await tarCanHold(pathParts(file, ...also), { signal }))) throw Object.assign(Error(NAME_READ), { unreadableName: true });
    list = await run(['--numeric-owner', '-tvf', file], { signal, raw: true });
  } catch (e) {
    // v1.0.0: a name tar.exe cannot read: a ZIP is read and checked by Charles instead (that same
    // checked list is what gets unpacked); any other format keeps the plain error
    // (v1.0.0: TAR and TAR.GZ too, by Charles' own TAR reader)
    if (!e.unreadableName) throw e;
    if (TARS.test(file)) {
      const tar = await tarEntries(file, { signal });
      return { tar, info: { files: tar.length, bytes: tar.reduce((s, z) => s + z.size, 0) } };
    }
    if (!isZip(file)) throw e;
    const zip = await zipEntries(file);
    return { zip, info: { files: zip.length, bytes: zip.reduce((s, z) => s + z.size, 0) } };
  }
  // v1.0.0: lines are split on the raw bytes, then bsdtar's \ooo escapes are undone and the name is
  // read in tar.exe's own code page, so the name check below sees what tar.exe will write
  const cp = await listCodePage({ signal });
  const lines = list.toString('latin1').split(/\r?\n/).filter(Boolean).map((l) => new TextDecoder(cp).decode(unescapeList(l)));
  const seen = nameSet();
  if (lines.length > MAX_FILES) throw Error(`Arşivde çok fazla dosya var (en fazla ${MAX_FILES}).`);
  let total = 0;
  const names = [];
  for (const line of lines) {
    // "-rw-r--r--  0 user group   1234 Jan  1 00:00 name" (bsdtar -tv)
    // v1.0.0 (bughunt): a device line has "major,minor" where the size goes: named as special first
    if (/^[cbps]/.test(line)) throw Error(SPECIAL);
    const m = /^([-dlhcbp])\S*\s+\d+\s+\d+\s+\d+\s+(\d+)\s+\S+\s+\S+\s+\S+\s(.+)$/.exec(line);
    // v1.0.0: a line that cannot be read is refused, not skipped: an entry the check cannot see
    // could still be unpacked
    if (!m) throw Error('Arşivdeki bir kayıt okunamadı; güvenlik için açılmadı.');
    if (m[1] === 'l' || m[1] === 'h') throw Error('Arşivde bağlantı (link) var; güvenlik için açılmadı.');
    // v1.0.0 (bughunt): devices, FIFOs and the rest: refused as Charles' own TAR reader refuses them
    if (m[1] !== '-' && m[1] !== 'd') throw Error(SPECIAL);
    // v1.0.0: the same name rules as Charles' own readers (CON, NUL …, a trailing dot or space,
    // two entries on one path)
    vetName(m[3].replace(/ -> .*$/, ''), m[1] === 'd', seen);
    total += +m[2];
    names.push(m[3]);
  }
  if (total > MAX_BYTES) throw Error('Arşivin içi çok büyük (8 GB’den fazla).');
  return { info: { files: names.length, bytes: total } };
}

/** Unpacks into a new folder beside `dir` named after the archive; returns that folder. */
async function extract(file, dir, { signal, freePath } = {}) {
  if (!READS.test(file)) throw Error('Bu arşiv biçimi açılamıyor.');
  const base = path.basename(file).replace(READS, '') || 'Arşiv';
  const { zip, tar, info } = await inspect(file, { signal, also: [path.join(dir, base + '.part')] });
  const target = freePath(dir, base);
  const tmp = target + '.part';
  fs.mkdirSync(tmp);
  try {
    // no -P: tar itself also refuses absolute paths and ".."; no owners or permissions are copied
    if (zip) await zipExtract(file, zip, tmp, { signal });
    else if (tar) await tarExtract(file, tar, tmp, { signal });
    else await run(['-xf', file, '-C', tmp, '--no-same-owner', '--no-same-permissions'], { signal });
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
    // v1.0.0: names tar.exe cannot hold are found before it runs (it would crash and leave an
    // empty file); ZIP is then written by Charles, the other formats refuse plainly
    // v1.0.0: for ZIP also when two items from different folders share a name (tar.exe would
    // store both under it; Charles' writer names the second "name (2)")
    const same = new Set(paths.map((p) => path.basename(p).toLowerCase())).size !== paths.length;
    // v1.0.0 (bughunt): the new archive's path and the folders tar.exe is sent into (-C) count too:
    // a folder named outside the ANSI code page made tar.exe fail ("Failed to open")
    const held = (await tarCanHold(pathParts(target, ...dirs), { signal })) && (await tarCanHold(await namesIn(paths), { signal }));
    if (!held || (format === 'zip' && same)) {
      if (format === 'tar' || format === 'tar.gz') await tarWrite(paths, tmp + '.' + format, { signal, gzip: format === 'tar.gz' });
      else if (format !== 'zip') throw Error(NAME_WRITE);
      else await zipWrite(paths, tmp + '.' + format, { signal });
    } else {
      const args = ['-a', '-cf', tmp + '.' + format];
      // files from several folders: each goes in under its own name
      if (dirs.length === 1) args.push('-C', dirs[0], ...paths.map((p) => path.basename(p)));
      else for (const p of paths) args.push('-C', path.dirname(p), path.basename(p));
      try {
        await run(args, { signal });
      } catch (e) {
        // a crash the name check did not foresee: ZIP is written by Charles instead
        if (!e.crashed || !['zip', 'tar', 'tar.gz'].includes(format)) throw e;
        fs.rmSync(tmp + '.' + format, { force: true });
        if (format === 'zip') await zipWrite(paths, tmp + '.' + format, { signal });
        else await tarWrite(paths, tmp + '.' + format, { signal, gzip: format === 'tar.gz' });
      }
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

// ── names tar.exe cannot hold (v1.0.0) ─────────────────────────────────────────────────────────

const cancelled = () => Object.assign(Error('İptal edildi.'), { cancelled: true });

/** v1.0.0 (bughunt): the folder and file names of full paths, as tarCanHold() checks them. */
function pathParts(...files) {
  return files.flatMap((f) => path.resolve(String(f)).split(/[\\/]/).filter(Boolean));
}

/** Every file and folder name that packing these paths would put into the archive. */
async function namesIn(paths) {
  const out = [];
  for (const p of paths) {
    out.push(path.basename(p));
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) for (const rel of await fs.promises.readdir(p, { recursive: true })) out.push(...rel.split(path.sep));
  }
  return out;
}

/** One line of tar.exe's list as bytes, with bsdtar's escapes undone (\ooo, \\, \n …). */
function unescapeList(line) {
  const esc = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };
  return Buffer.from(line.replace(/\\([0-7]{3}|.)/g, (m, c) => (c.length === 3 ? String.fromCharCode(parseInt(c, 8) & 255) : esc[c] ?? m)), 'latin1');
}

/** The code page tar.exe writes its list in, asked once: it lists a ZIP of letters from many code
 *  pages, and the page that reads most of them back unchanged wins (UTF-8 if none does). */
const PROBE = ['ş', 'ğ', 'İ', 'é', 'ß', 'ð', 'þ', 'ą', 'ő', 'Ж', 'α', 'א', 'ع', 'ų', 'ạ', 'ก', 'あ', '中', '한', '臺'];
let codePage = null;
async function listCodePage({ signal } = {}) {
  if (codePage) return codePage;
  const { zipSync } = require('fflate');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-cp-'));
  try {
    const probe = path.join(dir, 'cp.zip');
    fs.writeFileSync(probe, zipSync(Object.fromEntries(PROBE.map((c, i) => [i + '/' + c, new Uint8Array(0)]))));
    // tar.exe exits 1 when it skips letters it cannot read; the readable ones are still listed
    const list = (await runAll(['-tf', probe])) || Buffer.alloc(0);
    if (signal?.aborted) throw cancelled();
    const lines = list.toString('latin1').split(/\r?\n/).filter(Boolean).map(unescapeList);
    let best = 'utf-8';
    let score = 0;
    for (const enc of ANSI) {
      let n = 0;
      try {
        const dec = new TextDecoder(enc, { fatal: true });
        for (const l of lines) {
          const t = dec.decode(l);
          const i = parseInt(t, 10);
          if (t === i + '/' + PROBE[i]) n++;
        }
      } catch {
        continue;
      }
      if (n > score) [best, score] = [enc, n];
    }
    codePage = best;
    return best;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** tar.exe's stdout whatever its exit code (for listCodePage only). */
function runAll(args) {
  return new Promise((resolve) => {
    const child = spawn(TAR, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const out = [];
    child.stdout.on('data', (d) => out.push(d));
    child.on('error', () => resolve(null));
    child.on('close', () => resolve(Buffer.concat(out)));
  });
}

/** Asks tar.exe itself: it lists a tiny UTF-8 ZIP holding the names. A name it cannot read is
 *  exactly a name it crashes on when packing (measured with Turkish, Latin, Greek, Cyrillic, CJK,
 *  emoji and best-fit letters such as ā). Only names outside ASCII are asked about. */
async function tarCanHold(names, { signal } = {}) {
  const odd = [...new Set(names)].filter((n) => /[^\x20-\x7e]/.test(n));
  if (!odd.length) return true;
  const { zipSync } = require('fflate');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-names-'));
  try {
    const probe = path.join(dir, 'names.zip');
    fs.writeFileSync(probe, zipSync(Object.fromEntries(odd.map((n, i) => [i + '/' + n, new Uint8Array(0)]))));
    const list = await run(['-tf', probe], { signal, raw: true });
    // held means held unchanged: tar.exe "best-fits" some letters (ā becomes a), so the list
    // must read back exactly in one of the Windows ANSI code pages
    const want = odd.map((n, i) => i + '/' + n).join('\n');
    // bsdtar writes bytes it counts as unprintable as \ooo (the € of 1254 is \200)
    const bytes = unescapeList(list.toString('latin1'));
    return ANSI.some((enc) => {
      try {
        return new TextDecoder(enc, { fatal: true }).decode(bytes).split(/\r?\n/).filter(Boolean).join('\n') === want;
      } catch {
        return false;
      }
    });
  } catch (e) {
    if (e.cancelled) throw e;
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function isZip(file) {
  const b = Buffer.alloc(4);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    return fs.readSync(fd, b, 0, 4, 0) === 4 && (b.readUInt32LE(0) === 0x04034b50 || b.readUInt32LE(0) === 0x06054b50);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** A name Windows cannot hold as a file: a trailing dot or space is dropped, CON, NUL … are devices. */
function windowsName(name) {
  return name.split('/').filter(Boolean).every((p) => p === '.' || (!/[. ]$/.test(p) && !/^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i.test(p)));
}

/** The name refusals every route shares (tar.exe's list in inspect(), Charles' ZIP and TAR
 *  readers): a path leaving the folder, a name Windows cannot hold, and two entries that would land
 *  on one path (ignoring case), or a file where another entry needs a folder. Measured: tar.exe
 *  silently keeps the last of "A.txt" / "a.txt" and silently replaces a file "a" with the folder of
 *  a later "a/b"; only a folder followed by a file of its name fails cleanly. `seen` comes from
 *  nameSet() and is kept for the whole list. */
function vetName(name, dir, seen) {
  if (!safeEntry(name) || !windowsName(name.replace(/\\/g, '/'))) throw Error(PATH_OUT);
  const parts = name.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.').map((s) => s.toLowerCase());
  for (let i = 1; i < parts.length; i++) {
    const up = parts.slice(0, i).join('/');
    if (seen.files.has(up)) throw Error(ZIP_DUP);
    seen.dirs.add(up);
  }
  const key = parts.join('/');
  if (!key) return;
  if (seen.files.has(key) || (!dir && seen.dirs.has(key))) throw Error(ZIP_DUP);
  (dir ? seen.dirs : seen.files).add(key);
}
const nameSet = () => ({ files: new Set(), dirs: new Set() });

/** The target of one checked entry inside `base`, or an error when it would leave it. */
function inside(base, name) {
  const target = path.resolve(base, ...name.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.'));
  if (target !== base && !target.startsWith(base + path.sep)) throw Error(PATH_OUT);
  return target;
}

/** The ZIP's central directory, read and checked by the same rules as check(): every entry is seen
 *  before anything is unpacked, and only this list is unpacked (zipExtract), so the check and the
 *  unpacking cannot read a name differently. */
async function zipEntries(file) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const size = (await fh.stat()).size;
    const bad = () => { throw Error(ZIP_BROKEN); };
    const read = async (pos, len) => {
      if (!Number.isSafeInteger(pos) || pos < 0 || len < 0 || pos + len > size) bad();
      const b = Buffer.alloc(len);
      if ((await fh.read(b, 0, len, pos)).bytesRead !== len) bad();
      return b;
    };
    const tailLen = Math.min(size, 65557);
    const tail = await read(size - tailLen, tailLen);
    let e = -1;
    for (let p = tailLen - 22; p >= 0; p--) {
      if (tail.readUInt32LE(p) === 0x06054b50 && p + 22 + tail.readUInt16LE(p + 20) === tailLen) { e = p; break; }
    }
    if (e < 0 || tail.readUInt16LE(e + 4) || tail.readUInt16LE(e + 6)) bad();
    let count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
      if (e < 20 || tail.readUInt32LE(e - 20) !== 0x07064b50) bad();
      const z = await read(Number(tail.readBigUInt64LE(e - 12)), 56);
      if (z.readUInt32LE(0) !== 0x06064b50) bad();
      [count, cdSize, cdOff] = [32, 40, 48].map((o) => Number(z.readBigUInt64LE(o)));
    }
    if (count > MAX_FILES) throw Error(`Arşivde çok fazla dosya var (en fazla ${MAX_FILES}).`);
    if (cdSize > 64 * 1024 * 1024) bad();
    const cd = await read(cdOff, cdSize);
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    const out = [];
    const seen = nameSet();
    let total = 0;
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) bad();
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      const n = cd.readUInt16LE(p + 28), x = cd.readUInt16LE(p + 30), c = cd.readUInt16LE(p + 32);
      if (p + 46 + n + x + c > cd.length) bad();
      const raw = cd.subarray(p + 46, p + 46 + n);
      let name;
      if (flags & 2048) {
        try { name = utf8.decode(raw); } catch { bad(); }
      } else if (raw.every((b) => b < 0x80)) name = raw.toString('latin1');
      else throw Error(NAME_READ); // an old code-page name next to one tar.exe cannot read
      let size = cd.readUInt32LE(p + 24), packed = cd.readUInt32LE(p + 20), local = cd.readUInt32LE(p + 42);
      if (size === 0xffffffff || packed === 0xffffffff || local === 0xffffffff) {
        let found = false;
        for (let q = p + 46 + n, end = q + x; q + 4 <= end; q += 4 + cd.readUInt16LE(q + 2)) {
          if (cd.readUInt16LE(q) !== 1) continue;
          let a = q + 4;
          const next = () => { if (a + 8 > end) bad(); const v = Number(cd.readBigUInt64LE(a)); a += 8; return v; };
          if (size === 0xffffffff) size = next();
          if (packed === 0xffffffff) packed = next();
          if (local === 0xffffffff) local = next();
          found = true;
          break;
        }
        if (!found) bad();
      }
      const host = cd[p + 5], attrs = cd.readUInt32LE(p + 38);
      // the same refusals as check(): links, paths leaving the folder, names Windows cannot hold
      if ((host === 3 && ((attrs >>> 16) & 0xf000) === 0xa000) || (host === 0 && attrs & 0x400)) throw Error('Arşivde bağlantı (link) var; güvenlik için açılmadı.');
      vetName(name, /[\\/]$/.test(name), seen);
      if (flags & 1) throw Error('Arşiv parolayla korunuyor; açılamıyor.');
      if (method !== 0 && method !== 8) throw Error(ZIP_METHOD);
      total += size;
      out.push({ name, dir: /[\\/]$/.test(name), method, crc: cd.readUInt32LE(p + 16), size, packed, local });
      p += 46 + n + x + c;
    }
    if (total > MAX_BYTES) throw Error('Arşivin içi çok büyük (8 GB’den fazla).');
    return out;
  } finally {
    await fh.close();
  }
}

/** Unpacks exactly the entries zipEntries() checked into `root` (new and empty): streamed, sizes
 *  and CRC verified, nothing overwritten. */
async function zipExtract(file, entries, root, { signal } = {}) {
  const zlib = require('node:zlib');
  const { Transform, Readable } = require('node:stream');
  const { pipeline } = require('node:stream/promises');
  const fh = await fs.promises.open(file, 'r');
  const base = path.resolve(root);
  try {
    const size = (await fh.stat()).size;
    for (const z of entries) {
      if (signal?.aborted) throw cancelled();
      const target = path.resolve(base, ...z.name.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.'));
      if (target === base && z.dir) continue;
      if (!target.startsWith(base + path.sep)) throw Error(PATH_OUT);
      if (z.dir) {
        fs.mkdirSync(target, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const head = Buffer.alloc(30);
      if (z.local + 30 > size || (await fh.read(head, 0, 30, z.local)).bytesRead !== 30 || head.readUInt32LE(0) !== 0x04034b50) throw Error(ZIP_BROKEN);
      const start = z.local + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
      if (start + z.packed > size) throw Error(ZIP_BROKEN);
      let got = 0;
      let crc = 0;
      const verify = new Transform({
        transform(chunk, _, done) {
          got += chunk.length;
          if (got > z.size) return done(Error(ZIP_BROKEN));
          crc = zlib.crc32(chunk, crc);
          done(null, chunk);
        },
      });
      const steps = [];
      steps.push(z.packed ? fh.createReadStream({ autoClose: false, start, end: start + z.packed - 1 }) : Readable.from([]));
      if (z.method === 8) steps.push(zlib.createInflateRaw());
      steps.push(verify, fs.createWriteStream(target, { flags: 'wx' }));
      try {
        await pipeline(...steps, { signal });
      } catch (e) {
        if (signal?.aborted) throw cancelled();
        if (e.code === 'EEXIST') throw Error(ZIP_DUP);
        if (e.syscall || e.message === ZIP_BROKEN) throw e; // a disk error stays itself
        throw Error(ZIP_BROKEN);
      }
      if (got !== z.size || crc >>> 0 !== z.crc) throw Error(ZIP_BROKEN);
    }
  } finally {
    await fh.close();
  }
}

/** What Charles' own writers pack: files and folders under their names ("name (2)" for a second
 *  item of the same name), "/" separated; links and junctions are skipped, never followed. */
async function collect(paths) {
  const items = [];
  const used = new Set();
  for (const p of paths) {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) continue;
    let top = path.basename(p);
    for (let n = 2; used.has(top.toLowerCase()); n++) top = path.basename(p, path.extname(p)) + ` (${n})` + path.extname(p);
    used.add(top.toLowerCase());
    if (!st.isDirectory()) {
      items.push({ name: top, file: p, st });
      continue;
    }
    items.push({ name: top + '/', st });
    for (const d of await fs.promises.readdir(p, { recursive: true, withFileTypes: true })) {
      if (d.isSymbolicLink() || (!d.isDirectory() && !d.isFile())) continue;
      const full = path.join(d.parentPath ?? d.path, d.name);
      const rel = top + '/' + path.relative(p, full).split(path.sep).join('/');
      items.push(d.isDirectory() ? { name: rel + '/', st: fs.statSync(full) } : { name: rel, file: full, st: fs.statSync(full) });
    }
  }
  return items;
}

/** Packs into a ZIP with Charles' own writer (fflate, streamed): UTF-8 names, no links followed. */
async function zipWrite(paths, out, { signal } = {}) {
  const { Zip, ZipDeflate, ZipPassThrough } = require('fflate');
  const items = await collect(paths);
  const total = items.reduce((s, it) => s + (it.file ? it.st.size : 0), 0);
  if (items.length > 65000 || total > 0xffffffff - 64 * 1024 * 1024) throw Error(ZIP_LIMIT);
  const out1980 = (d) => new Date(Math.min(Math.max(+d, +new Date(1980, 0, 2)), +new Date(2099, 11, 31)));
  const fd = await fs.promises.open(out, 'wx');
  try {
    let queue = [];
    let failure = null;
    let ended = false;
    const zip = new Zip((err, chunk, final) => {
      if (err) failure = err;
      else queue.push(chunk);
      if (final) ended = true;
    });
    const flush = async () => {
      if (failure) throw failure;
      const q = queue;
      queue = [];
      for (const c of q) await fd.write(c);
    };
    const buf = Buffer.alloc(1024 * 1024);
    for (const it of items) {
      if (signal?.aborted) throw cancelled();
      const stored = !it.file || /\.(zip|7z|rar|gz|xz|png|jpe?g|webp|gif|mp[34]|m4a|webm|mkv|mov|avi|docx|xlsx|pptx|pdf)$/i.test(it.name);
      const entry = stored ? new ZipPassThrough(it.name) : new ZipDeflate(it.name, { level: 6 });
      entry.mtime = out1980(it.st.mtime);
      zip.add(entry);
      if (!it.file) {
        entry.push(new Uint8Array(0), true);
        await flush();
        continue;
      }
      const h = await fs.promises.open(it.file, 'r');
      try {
        for (;;) {
          const { bytesRead } = await h.read(buf, 0, buf.length, null);
          entry.push(new Uint8Array(buf.subarray(0, bytesRead)), bytesRead === 0);
          await flush();
          if (!bytesRead) break;
          if (signal?.aborted) throw cancelled();
        }
      } finally {
        await h.close();
      }
    }
    zip.end();
    await flush();
    if (!ended) throw Error(ZIP_BROKEN);
  } finally {
    await fd.close();
  }
}

// ── Charles' own TAR (v1.0.0): only for names tar.exe cannot hold ──────────────────────────────

/** POSIX ustar + pax writer, streamed (gzip through zlib). A pax record carries every name that
 *  is not plain ASCII or longer than 100 bytes, and every size over the 8 GB ustar field; pax has
 *  no size or count limit, so none is kept here. Mode 0644 / 0755, owner 0, mtime kept. */
async function tarWrite(paths, out, { signal, gzip = false } = {}) {
  const zlib = require('node:zlib');
  const { once } = require('node:events');
  const { pipeline, finished } = require('node:stream/promises');
  const items = await collect(paths);
  const ws = fs.createWriteStream(out, { flags: 'wx' });
  const gz = gzip ? zlib.createGzip() : null;
  const sink = gz || ws;
  const done = gz ? pipeline(gz, ws) : finished(ws);
  done.catch(() => {});
  const put = async (b) => {
    if (signal?.aborted) throw cancelled();
    if (!sink.write(b)) await Promise.race([once(sink, 'drain'), done]);
  };
  const octal = (h, at, len, v) => h.write(v.toString(8).padStart(len - 1, '0') + '\0', at, len, 'latin1');
  const header = (name, size, mtime, type) => {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'latin1');
    octal(h, 100, 8, type === '5' ? 0o755 : 0o644);
    octal(h, 108, 8, 0);
    octal(h, 116, 8, 0);
    octal(h, 124, 12, Math.min(size, 0o77777777777));
    octal(h, 136, 12, Math.max(0, Math.min(Math.floor(mtime / 1000), 0o77777777777)));
    h.write('        ', 148, 8, 'latin1');
    h.write(type, 156, 1, 'latin1');
    h.write('ustar\u000000', 257, 8, 'latin1');
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');
    return h;
  };
  const pad = (n) => Buffer.alloc((512 - (n % 512)) % 512);
  const record = (key, value) => {
    const body = ` ${key}=${value}\n`;
    let n = Buffer.byteLength(body);
    while (String(n).length + Buffer.byteLength(body) !== n) n = String(n).length + Buffer.byteLength(body);
    return n + body;
  };
  try {
    const buf = Buffer.alloc(1024 * 1024);
    for (const it of items) {
      const dir = !it.file;
      const size = dir ? 0 : it.st.size;
      const name = it.name;
      const raw = Buffer.from(name, 'utf8');
      // a plain-ASCII short name stays in the ustar field; others get a pax record and an
      // ASCII stand-in there
      const plain = raw.length <= 100 && /^[\x20-\x7e]*$/.test(name);
      let pax = (plain ? '' : record('path', name)) + (size > 0o77777777777 ? record('size', size) : '');
      if (pax) {
        const data = Buffer.from(pax, 'utf8');
        await put(header('PaxHeader/' + String(items.indexOf(it)), data.length, +it.st.mtime, 'x'));
        await put(data);
        await put(pad(data.length));
      }
      const stand = plain ? name : name.replace(/[^\x20-\x7e]/g, '_').slice(-99);
      await put(header(stand, size, +it.st.mtime, dir ? '5' : '0'));
      if (dir) continue;
      const h = await fs.promises.open(it.file, 'r');
      try {
        let left = size;
        while (left > 0) {
          const { bytesRead } = await h.read(buf, 0, Math.min(buf.length, left), null);
          if (!bytesRead) throw Error(CHANGED);
          await put(Buffer.from(buf.subarray(0, bytesRead)));
          left -= bytesRead;
        }
      } finally {
        await h.close();
      }
      await put(pad(size));
    }
    await put(Buffer.alloc(1024));
    sink.end();
    await done;
  } catch (e) {
    sink.destroy();
    ws.destroy();
    await done.catch(() => {});
    throw e;
  }
}

/** Reads exact byte counts from a stream (for the TAR reader). */
function bytesOf(stream) {
  const it = stream[Symbol.asyncIterator]();
  let buf = Buffer.alloc(0);
  const fill = async (n) => {
    while (buf.length < n) {
      const { value, done } = await it.next();
      if (done) return false;
      buf = buf.length ? Buffer.concat([buf, value]) : value;
    }
    return true;
  };
  return {
    fill,
    async take(n) {
      if (!(await fill(n))) throw Error(ZIP_BROKEN); // a truncated archive
      const out = buf.subarray(0, n);
      buf = buf.subarray(n);
      return out;
    },
    async each(n, fn) {
      while (n > 0) {
        if (!buf.length && !(await fill(1))) throw Error(ZIP_BROKEN);
        const k = Math.min(n, buf.length);
        await fn(buf.subarray(0, k));
        buf = buf.subarray(k);
        n -= k;
      }
    },
    close() {
      stream.destroy();
    },
  };
}

/** The entries of a TAR / TAR.GZ in order: ustar, pax (path, linkpath, size), GNU long names (L, K).
 *  `onData(entry, reader)` must consume entry.size bytes; it is called for files only. The
 *  decompressed stream is bounded: entry data by the 8 GB total, headers by the file limit. */
async function tarWalk(file, onEntry, { signal } = {}) {
  const zlib = require('node:zlib');
  const head = Buffer.alloc(2);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, 2, 0); } finally { fs.closeSync(fd); }
  const src = fs.createReadStream(file);
  const stream = head[0] === 0x1f && head[1] === 0x8b ? src.pipe(zlib.createGunzip()) : src;
  src.on('error', (e) => stream.destroy(e));
  const r = bytesOf(stream);
  const bad = () => { throw Error(ZIP_BROKEN); };
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const text = (b) => {
    const z = b.indexOf(0);
    const raw = z < 0 ? b : b.subarray(0, z);
    if (raw.every((x) => x < 0x80)) return raw.toString('latin1');
    try { return utf8.decode(raw); } catch { throw Error(NAME_READ); } // not UTF-8: not guessed
  };
  const num = (b) => {
    if (b[0] & 0x80) {
      if (b[0] & 0x40) bad(); // negative base-256
      let v = 0;
      for (let i = 1; i < b.length; i++) v = v * 256 + b[i];
      if (!Number.isSafeInteger(v)) bad();
      return v;
    }
    const s = b.toString('latin1').replace(/[\0 ]+$/, '').replace(/^ +/, '');
    if (!/^[0-7]*$/.test(s)) bad();
    return s ? parseInt(s, 8) : 0;
  };
  let meta = 0;
  let total = 0;
  let pending = {};
  try {
    for (;;) {
      if (signal?.aborted) throw cancelled();
      const h = await r.take(512);
      if (h.every((b) => !b)) return; // end of archive (anything after it is never read)
      let sum = 0;
      let signed = 0;
      for (let i = 0; i < 512; i++) {
        const b = i >= 148 && i < 156 ? 32 : h[i];
        sum += b;
        signed += b > 127 ? b - 256 : b;
      }
      const want = num(h.subarray(148, 156));
      if (want !== sum && want !== signed) bad();
      const type = String.fromCharCode(h[156] || 48);
      const fieldSize = num(h.subarray(124, 136));
      const meta1 = 'xgLK'.includes(type);
      if (meta1) {
        if (++meta > 2 * MAX_FILES + 16 || fieldSize > 1024 * 1024) bad();
        const data = await r.take(fieldSize);
        await r.take((512 - (fieldSize % 512)) % 512);
        if (type === 'L') pending.long = text(data);
        else if (type === 'K') pending.link = true;
        else if (type === 'x') {
          for (let p = 0; p < data.length;) {
            const sp = data.indexOf(0x20, p);
            const len = sp > p ? Number(data.toString('latin1', p, sp)) : NaN;
            if (!Number.isSafeInteger(len) || len <= sp - p || p + len > data.length || data[p + len - 1] !== 0x0a) bad();
            const rec = data.subarray(sp + 1, p + len - 1);
            const eq = rec.indexOf(0x3d);
            if (eq < 1) bad();
            const key = rec.toString('latin1', 0, eq);
            let value;
            try { value = utf8.decode(rec.subarray(eq + 1)); } catch { throw Error(NAME_READ); }
            if (key === 'path') pending.path = value;
            else if (key === 'linkpath') pending.link = true;
            else if (key === 'size') {
              if (!/^\d+$/.test(value)) bad();
              pending.size = Number(value);
            }
            p += len;
          }
        }
        continue; // 'g' (global pax) carries nothing Charles uses
      }
      const posix = h.toString('latin1', 257, 263) === 'ustar\0';
      const prefix = posix ? text(h.subarray(345, 500)) : '';
      const name = pending.path ?? pending.long ?? (prefix ? prefix + '/' : '') + text(h.subarray(0, 100));
      let size = fieldSize;
      if (pending.size !== undefined) {
        // a size field that disagrees with the pax size (and is not the overflow value) is refused
        if (fieldSize && fieldSize !== pending.size && fieldSize !== 0o77777777777) bad();
        size = pending.size;
      }
      const link = pending.link;
      pending = {};
      if (link || type === '1' || type === '2') throw Error(LINK);
      // only files ('0', '7') and folders ('5'): devices, FIFOs, GNU sparse and the rest are refused
      if (!'057'.includes(type)) throw Error(SPECIAL);
      const dir = type === '5' || name.endsWith('/');
      if (!Number.isSafeInteger(size) || (dir && size > 1024 * 1024)) bad();
      total += dir ? 0 : size;
      if (total > MAX_BYTES) throw Error('Arşivin içi çok büyük (8 GB’den fazla).');
      await onEntry({ name, dir, size: dir ? 0 : size, mtime: num(h.subarray(136, 148)) }, r);
      // a directory's data (if any) and the padding are skipped
      await r.each((dir ? size : 0) + ((512 - (size % 512)) % 512), () => {});
    }
  } catch (e) {
    if (/^Z_/.test(e.code || '') || e.code === 'ERR_STREAM_PREMATURE_CLOSE') throw Error(ZIP_BROKEN);
    throw e;
  } finally {
    r.close();
    src.destroy();
  }
}

/** Checks a TAR the way check() and zipEntries() do; this list is what tarExtract() unpacks. */
async function tarEntries(file, { signal } = {}) {
  const out = [];
  const seen = nameSet();
  await tarWalk(file, async (e, r) => {
    if (out.length >= MAX_FILES) throw Error(`Arşivde çok fazla dosya var (en fazla ${MAX_FILES}).`);
    vetName(e.name, e.dir, seen);
    out.push(e);
    if (!e.dir) await r.each(e.size, () => {}); // also finds a truncated archive
  }, { signal });
  return out;
}

/** Unpacks exactly the checked entries (read again in the same order; any difference stops it). */
async function tarExtract(file, entries, root, { signal } = {}) {
  const { once } = require('node:events');
  const base = path.resolve(root);
  let i = 0;
  await tarWalk(file, async (e, r) => {
    const want = entries[i++];
    if (!want || want.name !== e.name || want.dir !== e.dir || want.size !== e.size) throw Error(ZIP_BROKEN);
    const target = inside(base, e.name);
    if (e.dir) {
      if (target !== base) fs.mkdirSync(target, { recursive: true });
      return;
    }
    if (target === base) throw Error(PATH_OUT);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const ws = fs.createWriteStream(target, { flags: 'wx' });
    const failed = once(ws, 'error').then(([err]) => { throw err; });
    failed.catch(() => {});
    try {
      await Promise.race([once(ws, 'open'), failed]);
      await r.each(e.size, async (chunk) => {
        if (!ws.write(chunk)) await Promise.race([once(ws, 'drain'), failed]);
      });
      ws.end();
      await Promise.race([once(ws, 'close'), failed]);
    } catch (err) {
      ws.destroy();
      if (err.code === 'EEXIST') throw Error(ZIP_DUP);
      throw err;
    }
    try { fs.utimesSync(target, new Date(), new Date(e.mtime * 1000)); } catch {}
  }, { signal });
  if (i !== entries.length) throw Error(ZIP_BROKEN);
}

module.exports = { available, check, extract, create, repack, safeEntry, READS, WRITES, TAR, tarCanHold, zipEntries, tarEntries, tarWrite, listCodePage };
