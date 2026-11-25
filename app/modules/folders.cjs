// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v1.0.2: folders permission & charlesModule.folders API — user-granted folder access for modules.
// Grants are device-local and stored in %APPDATA%\Charles\module-folders.json (never in module data).
// All paths are checked strictly (no .., no symlinks/junctions, no executable writes, atomic writes
// with fsync + rename, optimistic SHA-256 locking, and Recycle Bin deletion only).
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readStore, writeStore } = require('../core/store.cjs');
const { cleanPath, FORBIDDEN } = require('./package.cjs');
const { ID } = require('./manifest.cjs');

const LIMITS = {
  readBytes: 50 * 1024 * 1024,
  writeBytes: 50 * 1024 * 1024,
  readManyCount: 500,
  readManyBytes: 64 * 1024 * 1024,
  scanMaxFiles: 20000,
  pathLength: 260,
};
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const GRANT_ID = /^f_[0-9a-f]{16}$/;

function normKey(p) {
  return path.resolve(String(p || '')).replace(/[\\/]+$/, '').toLowerCase();
}

function isSameOrInside(candidate, root) {
  const a = normKey(candidate);
  const b = normKey(root);
  if (!b) return false;
  return a === b || a.startsWith(b + path.sep);
}

/** Checks whether a user-chosen folder is safe to grant (rejects roots, system dirs, Charles data, profile root, UNC). */
function checkPickable(dir, { userData = '', env = process.env } = {}) {
  const raw = String(dir || '').trim();
  if (!raw) throw Error('Bu klasör seçilemez: geçersiz yol.');
  if (/^(\\\\|\/\/)/.test(raw)) throw Error('Bu klasör seçilemez: ağ yolları desteklenmiyor.');
  const abs = path.resolve(raw);
  const parsed = path.parse(abs);
  if (normKey(abs) === normKey(parsed.root))
    throw Error('Bu klasör seçilemez: sürücü kökü seçilemez.');
  let st;
  try {
    st = fs.lstatSync(abs);
  } catch {
    throw Error('Bu klasör seçilemez: klasöre ulaşılamıyor.');
  }
  if (st.isSymbolicLink()) throw Error('Bu klasör seçilemez: kısayol veya bağlantı klasörü kullanılamaz.');
  if (!st.isDirectory()) throw Error('Bu klasör seçilemez: seçilen yol bir klasör değil.');

  const blockedTrees = [
    [env.WINDIR || env.SystemRoot, 'Windows sistem klasörü'],
    [env.ProgramFiles, 'Program Files klasörü'],
    [env['ProgramFiles(x86)'], 'Program Files (x86) klasörü'],
    [env.ProgramData, 'ProgramData klasörü'],
    [userData, 'Charles veri klasörü'],
    [env.APPDATA ? path.join(env.APPDATA, 'Charles') : '', 'Charles veri klasörü'],
  ];
  for (const [root, label] of blockedTrees) {
    if (root && isSameOrInside(abs, root))
      throw Error(`Bu klasör seçilemez: ${label} korunmaktadır.`);
  }
  const home = env.USERPROFILE || env.HOME || os.homedir();
  if (home && normKey(abs) === normKey(home))
    throw Error('Bu klasör seçilemez: kullanıcı profili kök klasörü doğrudan seçilemez; altındaki bir klasörü seç.');
  return abs;
}

/** Validates a relative path inside a grant root. Rejects .., \, absolute paths, drive letters, reserved names. */
function cleanRel(rel, { allowRoot = false } = {}) {
  if (rel === undefined || rel === null || rel === '') {
    if (allowRoot) return '';
    throw Error('Geçersiz dosya yolu: yol boş olamaz.');
  }
  if (typeof rel !== 'string') throw Error('Geçersiz dosya yolu.');
  if (allowRoot && (rel === '.' || rel === '/')) return '';
  if (/[\u0000-\u001f]/.test(rel)) throw Error('Geçersiz dosya yolu: geçersiz karakter içeriyor.');
  if (rel.includes('\\')) throw Error('Geçersiz dosya yolu: "/" ayracı kullanılmalı.');
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) throw Error('Geçersiz dosya yolu: mutlak yol kullanılamaz.');
  const parts = rel.split('/').filter((p) => p !== '');
  if (!parts.length) {
    if (allowRoot) return '';
    throw Error('Geçersiz dosya yolu.');
  }
  for (const p of parts) {
    if (p === '..' || p === '.') throw Error('Geçersiz dosya yolu: klasör dışına çıkılamaz.');
    if (/[<>:"|?*]/.test(p) || /[. ]$/.test(p)) throw Error('Geçersiz dosya yolu: Windows’ta geçersiz karakter içeriyor.');
    if (RESERVED.test(p)) throw Error('Bu dosya adı Windows’ta kullanılamaz.');
  }
  const clean = parts.join('/');
  if (clean.length > LIMITS.pathLength) throw Error('Geçersiz dosya yolu: yol çok uzun.');
  return clean;
}

/** Checks that every existing path segment from rootDir down to abs is not a symlink/junction and stays inside rootDir. */
function assertNoSymlinkEscape(rootDir, abs) {
  const realRoot = fs.realpathSync(rootDir);
  const rel = path.relative(rootDir, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel))
    throw Error('Geçersiz dosya yolu: izin verilen klasör dışına çıkılamaz.');
  if (!rel) return abs;
  const parts = rel.split(path.sep).filter(Boolean);
  let cur = rootDir;
  let deepestExisting = rootDir;
  for (const part of parts) {
    cur = path.join(cur, part);
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) throw Error('Geçersiz dosya yolu: bağlantı (symlink/junction) izlenemez.');
      deepestExisting = cur;
    } catch (e) {
      if (e.code === 'ENOENT') break;
      if (/bağlantı|Geçersiz dosya yolu/.test(e.message)) throw e;
      throw Error('Geçersiz dosya yolu.');
    }
  }
  const realDeepest = fs.realpathSync(deepestExisting);
  const rr = path.relative(realRoot, realDeepest);
  if (rr.startsWith('..') || path.isAbsolute(rr))
    throw Error('Geçersiz dosya yolu: izin verilen klasör dışına çıkılamaz.');
  return abs;
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256FileStream(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (chunk) => hash.update(chunk));
    s.on('error', reject);
    s.on('end', () => resolve(hash.digest('hex')));
  });
}

function toBytes(data, encoding) {
  if (typeof data === 'string') return Buffer.from(data, encoding === 'base64' ? 'base64' : 'utf8');
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  throw Error('Dosya içeriği metin, base64 ya da Uint8Array olmalı.');
}

function missingFolderError(folderPath) {
  const err = new Error('Klasöre ulaşılamıyor: ' + folderPath);
  err.code = 'FOLDER_MISSING';
  return err;
}

function folderAvailable(folderPath) {
  try {
    const st = fs.lstatSync(folderPath);
    if (!st.isDirectory() || st.isSymbolicLink()) return false;
    fs.accessSync(folderPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function writeTempDurable(file, buf) {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, buf);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

class ModuleFolders {
  constructor({ userData, now = () => Date.now(), env = process.env }) {
    this.userData = path.resolve(userData);
    this.file = path.join(this.userData, 'module-folders.json');
    this.now = now;
    this.env = env;
    this.data = { format: 1, modules: {} };
    const loaded = readStore(
      this.file,
      (v) => v && typeof v === 'object' && !Array.isArray(v) && v.modules && typeof v.modules === 'object',
    );
    if (loaded.value) {
      for (const [modId, list] of Object.entries(loaded.value.modules)) {
        if (!ID.test(modId) || !Array.isArray(list)) continue;
        this.data.modules[modId] = list
          .filter((g) => g && typeof g === 'object' && GRANT_ID.test(String(g.id || '')) && typeof g.path === 'string' && g.path)
          .map((g) => ({
            id: g.id,
            path: path.resolve(g.path),
            name: String(g.name || path.basename(g.path)),
            addedAt: Number(g.addedAt) || 0,
          }));
      }
    }
  }

  save() {
    writeStore(this.file, this.data);
  }

  _list(moduleId) {
    if (!ID.test(String(moduleId || ''))) throw Error('Geçersiz modül.');
    return this.data.modules[moduleId] || [];
  }

  _grant(moduleId, grantId) {
    const id = String(grantId || '');
    if (!GRANT_ID.test(id)) throw Error('Bu klasör izni bulunamadı (kaldırılmış olabilir).');
    const g = this._list(moduleId).find((x) => x.id === id);
    if (!g) throw Error('Bu klasör izni bulunamadı (kaldırılmış olabilir).');
    return g;
  }

  _requireRoot(moduleId, grantId) {
    const g = this._grant(moduleId, grantId);
    if (!folderAvailable(g.path)) throw missingFolderError(g.path);
    return g;
  }

  /** Used by protocol.cjs for /_folder/<grantId>/<rel>. Returns root path or null. */
  grantRoot(moduleId, grantId) {
    const id = String(grantId || '');
    if (!GRANT_ID.test(id)) return null;
    const g = (this.data.modules[moduleId] || []).find((x) => x.id === id);
    if (!g || !folderAvailable(g.path)) return null;
    return g.path;
  }

  granted(moduleId) {
    return this._list(moduleId).map((g) => ({
      id: g.id,
      name: g.name,
      path: g.path,
      addedAt: g.addedAt,
      available: folderAvailable(g.path),
    }));
  }

  forget(moduleId, grantId) {
    const list = this._list(moduleId);
    const next = list.filter((g) => g.id !== String(grantId || ''));
    if (next.length !== list.length) {
      if (next.length) this.data.modules[moduleId] = next;
      else delete this.data.modules[moduleId];
      this.save();
    }
    return true;
  }

  removeModule(moduleId) {
    if (this.data.modules[moduleId]) {
      delete this.data.modules[moduleId];
      this.save();
    }
  }

  /** Registers an already-picked folder path (shared by pick & tests). */
  grantPath(moduleId, folderPath) {
    const abs = checkPickable(folderPath, { userData: this.userData, env: this.env });
    const list = this._list(moduleId);
    const key = normKey(abs);
    const existing = list.find((g) => normKey(g.path) === key);
    if (existing) {
      return { id: existing.id, name: existing.name, path: existing.path };
    }
    const entry = {
      id: 'f_' + crypto.randomBytes(8).toString('hex'),
      path: abs,
      name: path.basename(abs),
      addedAt: this.now(),
    };
    this.data.modules[moduleId] = [...list, entry];
    this.save();
    return { id: entry.id, name: entry.name, path: entry.path };
  }

  /** Updates an existing grant's path (keeps the same id). */
  relinkPath(moduleId, grantId, folderPath) {
    const g = this._grant(moduleId, grantId);
    const abs = checkPickable(folderPath, { userData: this.userData, env: this.env });
    g.path = abs;
    g.name = path.basename(abs);
    this.save();
    return { id: g.id, name: g.name, path: g.path };
  }

  async pick(moduleId, args = {}, { dialog, win, moduleName = moduleId } = {}) {
    const opts = {
      title: args?.title ? String(args.title).slice(0, 80) : `“${moduleName}” modülü için klasör seç`,
      properties: ['openDirectory', 'createDirectory'],
    };
    if (typeof args?.defaultPath === 'string' && args.defaultPath.trim()) {
      try {
        const dp = path.resolve(args.defaultPath);
        if (fs.existsSync(dp) && fs.statSync(dp).isDirectory()) opts.defaultPath = dp;
      } catch {}
    }
    const r = await dialog.showOpenDialog(win, opts);
    if (r.canceled || !r.filePaths?.length) return { picked: false };
    const folder = this.grantPath(moduleId, r.filePaths[0]);
    return { picked: true, folder };
  }

  async relink(moduleId, grantId, args = {}, { dialog, win, moduleName = moduleId } = {}) {
    this._grant(moduleId, grantId);
    const r = await dialog.showOpenDialog(win, {
      title: args?.title ? String(args.title).slice(0, 80) : `“${moduleName}” klasörünü yeniden bağla`,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths?.length) return { picked: false };
    const folder = this.relinkPath(moduleId, grantId, r.filePaths[0]);
    return { picked: true, folder };
  }

  resolve(moduleId, grantId, rel, { allowRoot = false } = {}) {
    const g = this._requireRoot(moduleId, grantId);
    const clean = cleanRel(rel, { allowRoot });
    const abs = clean ? path.resolve(g.path, ...clean.split('/')) : g.path;
    assertNoSymlinkEscape(g.path, abs);
    return { grant: g, clean, abs };
  }

  stat(moduleId, grantId, rel = '') {
    const { abs } = this.resolve(moduleId, grantId, rel, { allowRoot: true });
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch (e) {
      if (e.code === 'ENOENT') return { exists: false };
      throw Error('Dosya bilgisi okunamadı.');
    }
    if (st.isSymbolicLink()) throw Error('Geçersiz dosya yolu: bağlantı (symlink/junction) izlenemez.');
    return {
      exists: true,
      dir: st.isDirectory(),
      size: st.isFile() ? st.size : 0,
      modified: st.mtimeMs,
    };
  }

  async scan(moduleId, grantId, args = {}) {
    const startRel = args?.path ? String(args.path) : '';
    const wantHash = args?.hash === true;
    const maxFiles = Math.max(1, Math.min(LIMITS.scanMaxFiles, Number(args?.maxFiles) || LIMITS.scanMaxFiles));
    const skipPrefixes = Array.isArray(args?.skip)
      ? args.skip
          .map((s) => String(s || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase())
          .filter(Boolean)
      : [];
    const { grant, clean: baseRel, abs: startAbs } = this.resolve(moduleId, grantId, startRel, { allowRoot: true });
    let startSt;
    try {
      startSt = fs.lstatSync(startAbs);
    } catch (e) {
      if (e.code === 'ENOENT') return { files: [], dirs: [], errors: [], truncated: false };
      throw Error('Klasör taranamadı.');
    }
    if (!startSt.isDirectory()) throw Error('Taranacak yol bir klasör değil.');

    const files = [];
    const dirs = [];
    const errors = [];
    let truncated = false;
    const shouldSkip = (rel) => {
      const low = rel.toLowerCase();
      return skipPrefixes.some((p) => low === p || low.startsWith(p + '/'));
    };

    const walk = async (absDir, relDir) => {
      if (truncated) return;
      let entries;
      try {
        entries = await fsp.readdir(absDir, { withFileTypes: true });
      } catch (e) {
        errors.push({ path: relDir, error: e.message || 'Okunamadı' });
        return;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (truncated) return;
        if (entry.name.includes('.tmp-')) continue;
        const childRel = relDir ? relDir + '/' + entry.name : entry.name;
        if (shouldSkip(childRel)) continue;
        const childAbs = path.join(absDir, entry.name);
        if (entry.isSymbolicLink()) continue;
        let st;
        try {
          st = await fsp.lstat(childAbs);
        } catch (e) {
          errors.push({ path: childRel, error: e.message || 'Okunamadı' });
          continue;
        }
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          dirs.push(childRel);
          await walk(childAbs, childRel);
        } else if (st.isFile()) {
          if (files.length >= maxFiles) {
            truncated = true;
            return;
          }
          const item = { path: childRel, size: st.size, modified: st.mtimeMs };
          if (wantHash) {
            try {
              item.sha256 = await sha256FileStream(childAbs);
            } catch (e) {
              errors.push({ path: childRel, error: e.message || 'Özet hesaplanamadı' });
              continue;
            }
          }
          files.push(item);
        }
      }
    };

    await walk(startAbs, baseRel);
    return { files, dirs, errors, truncated };
  }

  read(moduleId, grantId, rel, { encoding = 'utf8' } = {}) {
    const enc = ['utf8', 'base64', 'binary'].includes(encoding) ? encoding : 'utf8';
    const { abs } = this.resolve(moduleId, grantId, rel);
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch (e) {
      if (e.code === 'ENOENT') throw Error('Dosya bulunamadı: ' + String(rel).slice(0, 120));
      throw Error('Dosya okunamadı: ' + String(rel).slice(0, 120));
    }
    if (st.isSymbolicLink() || !st.isFile()) throw Error('Dosya bulunamadı: ' + String(rel).slice(0, 120));
    if (st.size > LIMITS.readBytes) throw Error('Dosya çok büyük (en fazla 50 MB).');
    const buf = fs.readFileSync(abs);
    if (buf.length > LIMITS.readBytes) throw Error('Dosya çok büyük (en fazla 50 MB).');
    const sha256 = sha256Buffer(buf);
    const data = enc === 'binary' ? new Uint8Array(buf) : buf.toString(enc === 'base64' ? 'base64' : 'utf8');
    return { data, sha256, size: buf.length, modified: st.mtimeMs };
  }

  readMany(moduleId, grantId, paths, { encoding = 'utf8' } = {}) {
    this._requireRoot(moduleId, grantId);
    if (!Array.isArray(paths)) throw Error('“paths” bir liste olmalı.');
    if (paths.length > LIMITS.readManyCount) throw Error(`Bir seferde en fazla ${LIMITS.readManyCount} dosya okunabilir.`);
    const enc = ['utf8', 'base64', 'binary'].includes(encoding) ? encoding : 'utf8';
    let totalBytes = 0;
    const out = [];
    for (const rel of paths) {
      const key = String(rel ?? '');
      try {
        const { abs, clean } = this.resolve(moduleId, grantId, key);
        const st = fs.lstatSync(abs);
        if (st.isSymbolicLink() || !st.isFile()) {
          out.push({ path: key, error: 'Dosya bulunamadı.' });
          continue;
        }
        if (st.size > LIMITS.readBytes) {
          out.push({ path: clean, error: 'Dosya çok büyük (en fazla 50 MB).' });
          continue;
        }
        if (totalBytes + st.size > LIMITS.readManyBytes) {
          out.push({ path: clean, error: 'Toplu okuma sınırı aşıldı (en fazla 64 MB).' });
          continue;
        }
        const buf = fs.readFileSync(abs);
        totalBytes += buf.length;
        if (totalBytes > LIMITS.readManyBytes) {
          out.push({ path: clean, error: 'Toplu okuma sınırı aşıldı (en fazla 64 MB).' });
          continue;
        }
        const sha256 = sha256Buffer(buf);
        const data = enc === 'binary' ? new Uint8Array(buf) : buf.toString(enc === 'base64' ? 'base64' : 'utf8');
        out.push({ path: clean, data, sha256, size: buf.length, modified: st.mtimeMs });
      } catch (e) {
        out.push({ path: key, error: e.message || 'Okunamadı.' });
      }
    }
    return out;
  }

  _currentState(abs) {
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch (e) {
      if (e.code === 'ENOENT') return { exists: false, sha256: null };
      throw e;
    }
    if (st.isSymbolicLink()) throw Error('Geçersiz dosya yolu: bağlantı (symlink/junction) izlenemez.');
    if (!st.isFile()) throw Error('Hedef bir klasör; üzerine dosya yazılamaz.');
    return { exists: true, sha256: sha256Buffer(fs.readFileSync(abs)) };
  }

  _matchesExpect(state, expectSha256) {
    if (expectSha256 === null) return !state.exists;
    return state.exists && state.sha256 === expectSha256;
  }

  write(moduleId, grantId, rel, data, opts = {}) {
    const { encoding = 'utf8', mkdirs = true } = opts || {};
    const hasExpect = Object.prototype.hasOwnProperty.call(opts || {}, 'expectSha256') && opts.expectSha256 !== undefined;
    const expectSha256 = hasExpect ? opts.expectSha256 : undefined;
    if (hasExpect && expectSha256 !== null && (typeof expectSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(expectSha256)))
      throw Error('Geçersiz expectSha256 değeri.');
    const normExpect = typeof expectSha256 === 'string' ? expectSha256.toLowerCase() : expectSha256;

    const { abs } = this.resolve(moduleId, grantId, rel);
    if (FORBIDDEN.test(abs)) throw Error('Modüller çalıştırılabilir dosya kaydedemez.');
    const buf = toBytes(data, encoding);
    if (buf.length > LIMITS.writeBytes) throw Error('Dosya çok büyük (en fazla 50 MB).');

    if (hasExpect) {
      const cur = this._currentState(abs);
      if (!this._matchesExpect(cur, normExpect)) return { written: false, conflict: cur };
    }

    const parent = path.dirname(abs);
    if (mkdirs) fs.mkdirSync(parent, { recursive: true });
    else if (!fs.existsSync(parent)) throw Error('Üst klasör bulunamadı.');

    const tmp = abs + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
    try {
      writeTempDurable(tmp, buf);
      if (hasExpect) {
        const cur2 = this._currentState(abs);
        if (!this._matchesExpect(cur2, normExpect)) {
          fs.rmSync(tmp, { force: true });
          return { written: false, conflict: cur2 };
        }
      }
      fs.renameSync(tmp, abs);
    } catch (e) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {}
      throw e;
    }
    return { written: true, sha256: sha256Buffer(buf), size: buf.length };
  }

  mkdir(moduleId, grantId, rel) {
    const { abs } = this.resolve(moduleId, grantId, rel, { allowRoot: true });
    fs.mkdirSync(abs, { recursive: true });
    return true;
  }

  move(moduleId, grantId, from, to, { overwrite = false } = {}) {
    const src = this.resolve(moduleId, grantId, from);
    const dst = this.resolve(moduleId, grantId, to);
    if (FORBIDDEN.test(dst.abs)) throw Error('Modüller çalıştırılabilir dosya kaydedemez.');
    if (!fs.existsSync(src.abs)) throw Error('Taşınacak dosya bulunamadı: ' + src.clean);
    if (fs.existsSync(dst.abs) && !overwrite) throw Error('Hedef zaten var: ' + dst.clean);
    fs.mkdirSync(path.dirname(dst.abs), { recursive: true });
    if (overwrite && fs.existsSync(dst.abs) && normKey(src.abs) !== normKey(dst.abs)) {
      const srcSt = fs.lstatSync(src.abs);
      const dstSt = fs.lstatSync(dst.abs);
      if (dstSt.isDirectory()) throw Error('Hedef bir klasör; üzerine taşınamaz.');
      if (srcSt.isDirectory() && !dstSt.isDirectory()) throw Error('Klasör bir dosyanın üzerine taşınamaz.');
    }
    fs.renameSync(src.abs, dst.abs);
    return true;
  }

  async trash(moduleId, grantId, rel, { shell } = {}) {
    if (!rel || !String(rel).trim()) throw Error('İzin verilen ana klasör silinemez.');
    const { abs, clean } = this.resolve(moduleId, grantId, rel);
    if (!fs.existsSync(abs)) throw Error('Silinecek öğe bulunamadı: ' + clean);
    if (!shell?.trashItem) throw Error('Geri Dönüşüm Kutusu kullanılamıyor.');
    await shell.trashItem(abs);
    return true;
  }
}

module.exports = { ModuleFolders, checkPickable, cleanRel, LIMITS, GRANT_ID };
