// v0.8.0: a module's own files, only inside %APPDATA%\Charles\module-data\<id>\ (500 MB).
const fs = require('node:fs');
const path = require('node:path');
const { cleanPath, FORBIDDEN } = require('./package.cjs');

const QUOTA = 500 * 1024 * 1024;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

class ModuleStorage {
  constructor(dir, quota = QUOTA) {
    this.dir = path.resolve(dir);
    this.quota = quota;
    this.used = null; // bytes, measured on first write
    fs.mkdirSync(this.dir, { recursive: true });
  }
  /** "notes/a.json" → absolute path inside the data folder, or an error. */
  resolve(rel, { allowRoot = false } = {}) {
    if (allowRoot && (rel === '' || rel === undefined || rel === '.')) return this.dir;
    let clean;
    try {
      clean = cleanPath(String(rel ?? ''));
    } catch {
      throw Error('Geçersiz dosya yolu: modül yalnızca kendi veri klasörünü kullanabilir.');
    }
    if (clean.split('/').some((p) => RESERVED.test(p))) throw Error('Bu dosya adı Windows’ta kullanılamaz.');
    const abs = path.resolve(this.dir, ...clean.split('/'));
    const rp = path.relative(this.dir, abs);
    if (!rp || rp.startsWith('..') || path.isAbsolute(rp)) throw Error('Geçersiz dosya yolu: modül yalnızca kendi veri klasörünü kullanabilir.');
    // a junction/link inside the folder must not lead outside it
    // v0.9.1: the file itself too (reading a link to a file outside followed it)
    try {
      if (fs.lstatSync(abs).isSymbolicLink()) throw Error('Geçersiz dosya yolu.');
    } catch (e) {
      if (e.code !== 'ENOENT') throw Error('Geçersiz dosya yolu.');
    }
    let probe = path.dirname(abs);
    while (probe.length > this.dir.length) {
      if (fs.existsSync(probe) && fs.lstatSync(probe).isSymbolicLink()) throw Error('Geçersiz dosya yolu.');
      probe = path.dirname(probe);
    }
    return abs;
  }
  measure() {
    let n = 0;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const a = path.join(d, e.name);
        if (e.isDirectory()) walk(a);
        else if (e.isFile()) n += fs.statSync(a).size;
      }
    };
    walk(this.dir);
    this.used = n;
    return n;
  }
  bytes(data, encoding) {
    if (typeof data === 'string') return Buffer.from(data, encoding === 'base64' ? 'base64' : 'utf8');
    if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    throw Error('Dosya içeriği metin ya da Uint8Array olmalı.');
  }
  writeFile(rel, data, { encoding = 'utf8' } = {}) {
    const abs = this.resolve(rel);
    if (FORBIDDEN.test(abs)) throw Error('Modüller çalıştırılabilir dosya kaydedemez.');
    const buf = this.bytes(data, encoding);
    if (this.used === null) this.measure();
    const old = fs.existsSync(abs) ? fs.statSync(abs).size : 0;
    if (this.used - old + buf.length > this.quota) throw Error('Modülün veri kotası doldu (500 MB).');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = abs + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, abs);
    this.used += buf.length - old;
    return { path: path.relative(this.dir, abs).split(path.sep).join('/'), size: buf.length };
  }
  readFile(rel, { encoding = 'utf8' } = {}) {
    const abs = this.resolve(rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw Error('Dosya bulunamadı: ' + String(rel).slice(0, 120));
    const buf = fs.readFileSync(abs);
    if (encoding === 'binary') return new Uint8Array(buf);
    return buf.toString(encoding === 'base64' ? 'base64' : 'utf8');
  }
  deleteFile(rel) {
    const abs = this.resolve(rel);
    if (!fs.existsSync(abs)) return false;
    const st = fs.statSync(abs);
    if (this.used === null) this.measure();
    if (st.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
      this.used = null;
    } else {
      fs.rmSync(abs, { force: true });
      this.used -= st.size;
    }
    return true;
  }
  listFiles(rel = '') {
    const root = this.resolve(rel, { allowRoot: true });
    if (!fs.existsSync(root)) return [];
    const out = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const a = path.join(d, e.name);
        if (e.name.includes('.tmp-')) continue;
        const r = path.relative(this.dir, a).split(path.sep).join('/');
        if (e.isDirectory()) {
          out.push({ path: r, dir: true });
          walk(a);
        } else if (e.isFile()) {
          const st = fs.statSync(a);
          out.push({ path: r, dir: false, size: st.size, modified: st.mtimeMs });
        }
        if (out.length >= 5000) return;
      }
    };
    walk(root);
    return out;
  }
  getJSON(rel, fallback = null) {
    try {
      return JSON.parse(this.readFile(rel));
    } catch (e) {
      if (/bulunamadı/.test(e.message)) return fallback;
      throw Error('JSON okunamadı: ' + String(rel).slice(0, 120));
    }
  }
  setJSON(rel, value) {
    const text = JSON.stringify(value);
    if (text === undefined) throw Error('Bu değer JSON olarak kaydedilemez.');
    return this.writeFile(rel, text);
  }
}

module.exports = { ModuleStorage, QUOTA };
