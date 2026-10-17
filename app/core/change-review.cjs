// v0.7.7: "Değişiklik inceleme" — before / after copies of the files Charles changes, so the
// app window can show what changed (code diff, changed paragraphs, images side by side) and
// put a file back ("Geri al").
//
// When the AI starts a file change (item/started, type fileChange) the file is read as it is
// now; when the change is finished (item/completed with the same id) it is read again. Only
// files up to 4 MB are kept, in memory, for the last 60 changes (at most ~48 MB). Nothing is
// written to disk except by an explicit undo, and an undo only happens when the file is still
// exactly as Charles left it, so later edits by the user are never overwritten.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FILE = 4 * 1024 * 1024;
const MAX_TOTAL = 48 * 1024 * 1024;
const MAX_RECORDS = 60;
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

function readCopy(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return { exists: false };
    if (st.size > MAX_FILE) return { exists: true, tooLarge: true, size: st.size };
    return { exists: true, data: fs.readFileSync(file) };
  } catch {
    return { exists: false };
  }
}
const hash = (b) => (b ? crypto.createHash('sha1').update(b).digest('hex') : '');
/** A buffer that looks like text (no NUL bytes in the first 8 KB). */
const isText = (b) => !b || !b.subarray(0, 8192).includes(0);

function kindOf(file, before, after) {
  if (IMAGE.test(file)) return 'image';
  if (!isText(before?.data) || !isText(after?.data)) return 'binary';
  if (/\.(md|markdown|txt|rtf|html?|tex|csv)$/i.test(file)) return 'text';
  return 'code';
}

class ChangeReview {
  constructor() {
    this.records = []; // newest last
    this.pending = new Map(); // item id → [{ file, before }]
    this.seq = 0;
  }
  /** Absolute paths of a fileChange item. */
  paths(item, cwd) {
    const out = [];
    for (const c of item?.changes || []) {
      const p = String(c?.path || '').trim();
      if (!p || p.length > 1000) continue;
      const abs = path.isAbsolute(p) ? p : cwd ? path.resolve(cwd, p) : '';
      if (abs && !out.includes(abs)) out.push(abs);
    }
    return out.slice(0, 20);
  }
  /** Called for every live agent event (app/main.cjs eventToUi). */
  observe(method, item, cwd, turnId) {
    if (!item?.id) return;
    if (method === 'item/started' && item.type === 'fileChange') {
      if (this.pending.has(item.id)) return;
      const files = this.paths(item, cwd);
      if (!files.length) return;
      this.pending.set(item.id, { files: files.map((file) => ({ file, before: readCopy(file) })), diffs: item.changes, turnId });
      // a change that never finishes is forgotten after 10 minutes
      setTimeout(() => this.pending.delete(item.id), 600000).unref?.();
      return;
    }
    if (method === 'item/completed') {
      let p = this.pending.get(item.id);
      // Codex sometimes reports a change only when it is finished: no "before" then, the
      // diff of the item is still shown
      if (!p && item.type === 'fileChange') {
        const files = this.paths(item, cwd);
        if (!files.length) return;
        p = { files: files.map((file) => ({ file, before: null })), diffs: item.changes, turnId };
      }
      if (!p) return;
      this.pending.delete(item.id);
      const failed = item.status === 'failed' || item.status === 'declined';
      for (const { file, before } of p.files) {
        const after = readCopy(file);
        if (failed && before && before.data && after.data && hash(before.data) === hash(after.data)) continue;
        const diff = (item.changes || p.diffs || []).find((c) => c?.path && (path.resolve(cwd || '', c.path) === file || c.path === file))?.diff;
        this.add({ file, before, after, diff: typeof diff === 'string' ? diff.slice(0, 400000) : '', turnId: p.turnId || turnId || '' });
      }
    }
  }
  add({ file, before, after, diff, turnId }) {
    const kind = kindOf(file, before, after);
    const rec = {
      id: 'c' + Date.now().toString(36) + (++this.seq).toString(36),
      file,
      name: path.basename(file),
      kind,
      at: Date.now(),
      turnId,
      before,
      after,
      diff,
      created: before ? !before.exists : false,
      deleted: !after.exists,
    };
    if (before?.data && after?.data && hash(before.data) === hash(after.data) && !diff) return;
    this.records.push(rec);
    this.trim();
    return rec;
  }
  trim() {
    while (this.records.length > MAX_RECORDS) this.records.shift();
    const size = () => this.records.reduce((n, r) => n + (r.before?.data?.length || 0) + (r.after?.data?.length || 0), 0);
    while (this.records.length > 1 && size() > MAX_TOTAL) this.records.shift();
  }
  canUndo(r) {
    if (!r.before || r.before.tooLarge || r.after?.tooLarge) return false;
    if (r.undone) return false;
    if (r.before.exists && !r.before.data) return false;
    return true;
  }
  list() {
    return this.records
      .slice()
      .reverse()
      .map((r) => ({
        id: r.id,
        file: r.file,
        name: r.name,
        kind: r.kind,
        at: r.at,
        turnId: r.turnId,
        created: r.created,
        deleted: r.deleted,
        undone: !!r.undone,
        canUndo: this.canUndo(r),
        hasBefore: !!r.before,
      }));
  }
  side(r, copy) {
    if (!copy) return null;
    if (!copy.exists) return { missing: true };
    if (copy.tooLarge) return { tooLarge: true, size: copy.size };
    if (r.kind === 'image') {
      const ext = path.extname(r.file).slice(1).toLowerCase();
      return { image: 'data:' + (MIME[ext] || 'image/png') + ';base64,' + copy.data.toString('base64') };
    }
    if (r.kind === 'binary') return { binary: true, size: copy.data.length };
    return { text: copy.data.toString('utf8') };
  }
  get(id) {
    const r = this.records.find((x) => x.id === id);
    if (!r) throw Error('Bu değişiklik artık bulunamadı.');
    return { ...this.list().find((x) => x.id === id), before: this.side(r, r.before), after: this.side(r, r.after), diff: r.diff };
  }
  /** Puts the file back as it was before Charles' change. */
  undo(id) {
    const r = this.records.find((x) => x.id === id);
    if (!r) throw Error('Bu değişiklik artık bulunamadı.');
    if (!this.canUndo(r)) throw Error('Bu değişiklik geri alınamıyor (önceki hali kaydedilmedi veya dosya çok büyük).');
    const now = readCopy(r.file);
    const same = r.after.exists ? now.exists && !now.tooLarge && hash(now.data) === hash(r.after.data) : !now.exists;
    if (!same) throw Error('Dosya Charles’ın değişikliğinden sonra yeniden değişmiş; üzerine yazmamak için geri alınmadı.');
    if (r.before.exists) {
      fs.mkdirSync(path.dirname(r.file), { recursive: true });
      fs.writeFileSync(r.file, r.before.data);
    } else fs.rmSync(r.file, { force: true });
    r.undone = true;
    return this.list().find((x) => x.id === id);
  }
}

module.exports = { ChangeReview, kindOf, isText };
