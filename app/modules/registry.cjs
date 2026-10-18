// v0.8.0: installed modules. Files: %APPDATA%\Charles\modules\<id>\ ; data (kept when a module
// is removed or updated): %APPDATA%\Charles\module-data\<id>\ ; list: modules.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseManifest, compareVersions, describePermissions, ID } = require('./manifest.cjs');
const { readFolder } = require('./package.cjs');

function writeJson(file, value) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

class ModuleRegistry {
  constructor({ userData, now = () => Date.now() }) {
    this.base = path.join(userData, 'modules');
    this.dataBase = path.join(userData, 'module-data');
    this.file = path.join(userData, 'modules.json');
    this.now = now;
    this.pending = new Map(); // token → { pkg, source, at }
    fs.mkdirSync(this.base, { recursive: true });
    fs.mkdirSync(this.dataBase, { recursive: true });
    this.data = { format: 1, dev: false, modules: {} };
    try {
      const v = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (v && typeof v === 'object' && v.modules && typeof v.modules === 'object') {
        this.data.dev = v.dev === true;
        for (const [id, m] of Object.entries(v.modules)) if (ID.test(id) && m && typeof m === 'object') this.data.modules[id] = m;
      }
    } catch {}
    // leftovers of an interrupted install
    for (const n of fs.readdirSync(this.base)) if (n.startsWith('.tmp-') || n.startsWith('.old-')) fs.rmSync(path.join(this.base, n), { recursive: true, force: true });
  }
  save() {
    writeJson(this.file, this.data);
  }
  /** Folder the module's files are served from (its own source folder in developer mode). */
  root(id) {
    const m = this.data.modules[id];
    if (!m) throw Error('Bu modül yüklü değil.');
    return m.devPath || path.join(this.base, id);
  }
  dataDir(id) {
    if (!ID.test(id)) throw Error('Geçersiz modül.');
    const d = path.join(this.dataBase, id);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
  manifest(id) {
    return parseManifest(fs.readFileSync(path.join(this.root(id), 'manifest.json'), 'utf8'));
  }
  get(id) {
    return this.data.modules[id] || null;
  }
  setDev(value) {
    this.data.dev = value === true;
    this.save();
    return this.data.dev;
  }
  /** For the settings page: every module with its manifest (or the error that broke it). */
  list() {
    return Object.entries(this.data.modules)
      .map(([id, m]) => {
        let manifest = null,
          error = '',
          icon = '';
        try {
          manifest = this.manifest(id);
          if (manifest.icon) icon = iconData(path.join(this.root(id), manifest.icon));
        } catch (e) {
          error = e.message;
        }
        return {
          id,
          version: m.version,
          enabled: m.enabled !== false,
          permissions: m.permissions || [],
          installedAt: m.installedAt,
          updatedAt: m.updatedAt || m.installedAt,
          dev: !!m.devPath,
          devPath: m.devPath || '',
          name: manifest?.name || id,
          author: manifest?.author || '',
          description: manifest?.description || '',
          icon,
          error,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }
  /** A checked package waiting for the user's "Kur" → what the confirmation card shows. */
  prepare(pkg, source) {
    for (const [t, p] of this.pending) if (this.now() - p.at > 10 * 60 * 1000) this.pending.delete(t);
    const token = crypto.randomBytes(12).toString('hex');
    this.pending.set(token, { pkg, source, at: this.now() });
    const m = pkg.manifest;
    const existing = this.data.modules[m.id] || null;
    return {
      token,
      manifest: m,
      permissions: describePermissions(m.permissions),
      source: source.kind,
      update: existing ? { from: existing.version, to: m.version, older: compareVersions(m.version, existing.version) < 0 } : null,
      files: pkg.files.size,
      bytes: [...pkg.files.values()].reduce((n, d) => n + d.length, 0),
    };
  }
  cancel(token) {
    this.pending.delete(token);
  }
  /** Installs (or updates) a prepared package; the data folder is kept. */
  install(token) {
    const p = this.pending.get(token);
    if (!p) throw Error('Kurulum süresi doldu; modülü yeniden seç.');
    this.pending.delete(token);
    const { manifest, files } = p.pkg;
    const id = manifest.id;
    const prev = this.data.modules[id];
    const target = path.join(this.base, id);
    if (p.source.kind === 'folder') {
      // developer mode: served straight from the chosen folder (re-checked on every change)
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    } else {
      const tmp = path.join(this.base, '.tmp-' + crypto.randomBytes(6).toString('hex'));
      for (const [rel, data] of files) {
        const abs = path.join(tmp, ...rel.split('/'));
        if (!abs.startsWith(tmp + path.sep)) throw Error('Geçersiz dosya yolu.');
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, data);
      }
      // the new files are complete before the old ones go
      let old = '';
      if (fs.existsSync(target)) {
        old = path.join(this.base, '.old-' + crypto.randomBytes(6).toString('hex'));
        fs.renameSync(target, old);
      }
      try {
        fs.renameSync(tmp, target);
      } catch (e) {
        if (old) fs.renameSync(old, target);
        fs.rmSync(tmp, { recursive: true, force: true });
        throw e;
      }
      if (old) fs.rmSync(old, { recursive: true, force: true });
    }
    this.dataDir(id);
    const t = this.now();
    this.data.modules[id] = {
      version: manifest.version,
      enabled: prev ? prev.enabled !== false : true,
      permissions: manifest.permissions,
      installedAt: prev?.installedAt || t,
      updatedAt: t,
      ...(p.source.kind === 'folder' ? { devPath: p.source.path } : {}),
      ...(prev?.bounds ? { bounds: prev.bounds } : {}),
    };
    this.save();
    return { id, updated: !!prev, version: manifest.version };
  }
  /** Re-reads a developer-mode folder after a change; returns the new manifest or throws. */
  recheck(id) {
    const m = this.data.modules[id];
    if (!m?.devPath) return this.manifest(id);
    const pkg = readFolder(m.devPath);
    if (pkg.manifest.id !== id) throw Error('Klasördeki manifest.json’da modül kimliği değişmiş; modülü yeniden yükle.');
    m.version = pkg.manifest.version;
    m.permissions = m.permissions.filter((x) => pkg.manifest.permissions.includes(x));
    this.save();
    return pkg.manifest;
  }
  setEnabled(id, value) {
    if (!this.data.modules[id]) throw Error('Bu modül yüklü değil.');
    this.data.modules[id].enabled = value === true;
    this.save();
    return this.data.modules[id].enabled;
  }
  saveBounds(id, b) {
    const m = this.data.modules[id];
    if (!m || !b) return;
    m.bounds = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    this.save();
  }
  remove(id, deleteData = false) {
    if (!this.data.modules[id]) throw Error('Bu modül yüklü değil.');
    const m = this.data.modules[id];
    if (!m.devPath) fs.rmSync(path.join(this.base, id), { recursive: true, force: true });
    if (deleteData) fs.rmSync(path.join(this.dataBase, id), { recursive: true, force: true });
    delete this.data.modules[id];
    this.save();
    return true;
  }
}

function iconData(file) {
  try {
    const st = fs.statSync(file);
    if (st.size > 512 * 1024) return '';
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
    return mime ? `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` : '';
  } catch {
    return '';
  }
}

module.exports = { ModuleRegistry };
