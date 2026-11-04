// v0.9.15: Dosya Rafı — files kept in %APPDATA%\Charles\file-rack until the user removes them.
//
//   file-rack/index.json   the list (core/store.cjs: survives a crash or a power cut)
//   file-rack/files/       one real file per item, under the name it is shown with
//
// The shelf holds its own copies: the source is only read, so it can move or disappear later.
// A second file with the same name becomes "name (2).ext", and the renderer only ever knows ids;
// the paths stay here.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { readStore, writeStore } = require('../core/store.cjs');

const MAX_ITEMS = 500;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
const ID = /^[0-9a-f-]{36}$/i;

/** A file name that is safe on Windows, with its extension kept when it has to be shortened. */
function safeName(raw) {
  let name = path.win32.basename(String(raw || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
  if (!name) name = 'dosya';
  if (RESERVED.test(name)) name = '_' + name;
  if (name.length > 180) {
    const ext = path.extname(name).slice(0, 20);
    name = name.slice(0, 180 - ext.length).trimEnd() + ext;
  }
  return name;
}

class FileRack {
  constructor(dir) {
    this.dir = dir;
    this.filesDir = path.join(dir, 'files');
    this.indexFile = path.join(dir, 'index.json');
    fs.mkdirSync(this.filesDir, { recursive: true });
    // one change at a time: two drops at once can never pick the same free name
    this.queue = Promise.resolve();
    const { value } = readStore(this.indexFile, (v) => Array.isArray(v?.items));
    this.items = (value?.items || []).filter(
      (i) => ID.test(i?.id) && typeof i.name === 'string' && i.name === safeName(i.name) && fs.existsSync(path.join(this.filesDir, i.name)),
    );
    // A crash after the copy but before the list was written (or a lost list) leaves files here.
    // They are the user's: they come back on the shelf. Only unfinished copies are dropped.
    const known = new Set(this.items.map((i) => i.name.toLowerCase()));
    for (const name of fs.readdirSync(this.filesDir)) {
      const full = path.join(this.filesDir, name);
      if (name.endsWith('.part')) {
        fs.rmSync(full, { force: true });
        continue;
      }
      const stat = fs.statSync(full);
      if (known.has(name.toLowerCase()) || !stat.isFile()) continue;
      this.items.push({ id: randomUUID(), name, size: stat.size, addedAt: stat.mtimeMs });
    }
    this.save();
  }
  save() {
    writeStore(this.indexFile, { items: this.items });
  }
  run(task) {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }
  /** Newest first. A file removed by hand from the folder leaves the list here. */
  list() {
    const before = this.items.length;
    this.items = this.items.filter((i) => fs.existsSync(path.join(this.filesDir, i.name)));
    if (this.items.length !== before) this.save();
    return [...this.items].sort((a, b) => b.addedAt - a.addedAt).map(({ id, name, size, addedAt }) => ({ id, name, size, addedAt }));
  }
  freeName(wanted) {
    const taken = new Set(this.items.map((i) => i.name.toLowerCase()));
    const free = (name) => !taken.has(name.toLowerCase()) && !fs.existsSync(path.join(this.filesDir, name));
    const name = safeName(wanted);
    if (free(name)) return name;
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    for (let n = 2; ; n++) {
      const next = `${stem} (${n})${ext}`;
      if (free(next)) return next;
    }
  }
  // The copy is finished under a temporary name first, so a half-written file never shows up.
  async store(wanted, write) {
    if (this.items.length >= MAX_ITEMS) throw Error('Raf dolu: en fazla 500 dosya.');
    const part = path.join(this.filesDir, randomUUID() + '.part');
    try {
      await write(part);
      const size = (await fs.promises.stat(part)).size;
      const name = this.freeName(wanted);
      await fs.promises.rename(part, path.join(this.filesDir, name));
      this.items.push({ id: randomUUID(), name, size, addedAt: Date.now() });
      this.save();
    } finally {
      await fs.promises.rm(part, { force: true });
    }
  }
  /** → { items, skipped }: folders are skipped (their names come back), one bad file stops nothing. */
  addPaths(paths) {
    return this.run(async () => {
      const skipped = [];
      for (const source of paths) {
        const stat = await fs.promises.stat(source).catch(() => null);
        if (!stat?.isFile()) {
          skipped.push(path.basename(source));
          continue;
        }
        await this.store(path.basename(source), (part) => fs.promises.copyFile(source, part, fs.constants.COPYFILE_EXCL));
      }
      return { items: this.list(), skipped };
    });
  }
  addBytes(name, bytes) {
    return this.run(async () => {
      await this.store(name, (part) => fs.promises.writeFile(part, bytes, { flag: 'wx' }));
      return { items: this.list(), skipped: [] };
    });
  }
  find(id) {
    const item = typeof id === 'string' && ID.test(id) ? this.items.find((i) => i.id === id) : null;
    if (!item) throw Error('Dosya rafta bulunamadı.');
    return item;
  }
  pathOf(id) {
    const file = path.join(this.filesDir, this.find(id).name);
    if (!fs.existsSync(file)) throw Error('Dosya rafta bulunamadı.');
    return file;
  }
  /** Only the shelf's own copy goes; the file it was copied from is never known here. */
  remove(id) {
    return this.run(async () => {
      const item = this.find(id);
      await fs.promises.rm(path.join(this.filesDir, item.name), { force: true });
      this.items = this.items.filter((i) => i !== item);
      this.save();
      return { items: this.list(), skipped: [] };
    });
  }
}

module.exports = { FileRack, safeName, MAX_ITEMS };
