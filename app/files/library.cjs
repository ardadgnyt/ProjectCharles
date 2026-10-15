// File search inside folders the user selected; opens only safe document types.
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto'),
  { execFile } = require('node:child_process');
const { normalize } = require('../system/desktop.cjs');
const textTypes = new Set([
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.py',
  '.html',
  '.css',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.sql',
  '.tex',
  '.c',
  '.cpp',
  '.h',
]);
function within(root, file) {
  const r = path.relative(root, file);
  return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r));
}
function terms(query) {
  const quoted = query.match(/["“](.+?)["”]/);
  if (quoted) return [normalize(quoted[1])];
  return normalize(query)
    .replace(
      /gecen hafta|bu hafta|bugun|dosyalarimda|dosyalarimi|icinde|gecen|hazirladigim|hazirladigimiz|neredeydi|nerede|bulabilir misin|bulur musun|dosyasini|dosyayi|dosya|raporu|raporunu|lutfen|ara|bul|pdf|charles|bana/g,
      ' ',
    )
    .split(/[^a-z0-9=+*/.-]+/)
    .filter((t) => t.length > 2);
}
class Library {
  constructor(personal) {
    this.personal = personal;
    this.results = new Map();
    this.cache = new Map();
    this.searching = false;
  }
  roots() {
    return this.personal.data.searchRoots || [];
  }
  add(folder) {
    const real = fs.realpathSync(folder);
    if (!fs.statSync(real).isDirectory()) throw Error('Klasör seç.');
    this.personal.data.searchRoots = [...new Set([...this.roots(), real])].slice(0, 15);
    this.personal.save();
    return this.roots();
  }
  remove(folder) {
    this.personal.data.searchRoots = this.roots().filter((p) => p !== folder);
    this.results.clear();
    this.personal.save();
    return this.roots();
  }
  async content(file, stat) {
    const cached = this.cache.get(file);
    if (cached?.mtime === stat.mtimeMs && cached.size === stat.size) return cached.text;
    let text = '';
    if (['.pdf', '.docx'].includes(path.extname(file).toLowerCase()))
      text = await new Promise((resolve, reject) =>
        execFile(
          process.execPath,
          [path.join(__dirname, 'pdf-text.cjs'), file],
          {
            windowsHide: true,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            timeout: 6000,
            maxBuffer: 2 * 1024 * 1024,
          },
          (e, out) => (e ? reject(e) : resolve(out)),
        ),
      );
    else if (textTypes.has(path.extname(file).toLowerCase()) && stat.size <= 2 * 1024 * 1024)
      text = await fs.promises.readFile(file, 'utf8');
    text = normalize(String(text).slice(0, 1000000));
    if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(file, { mtime: stat.mtimeMs, size: stat.size, text });
    return text;
  }
  async search(query) {
    if (this.searching) throw Error('Önceki arama sürüyor.');
    if (typeof query !== 'string' || query.length > 1000) throw Error('Arama metni çok uzun.');
    if (!this.roots().length) return { items: [], note: 'Sohbete “Arama için klasör ekle” yaz.' };
    const words = terms(query);
    if (!words.length)
      return {
        items: [],
        note: 'Dosya adından veya içeriğinden birkaç sözcük yaz; tam formülü tırnak içine al.',
      };
    this.searching = true;
    const items = [];
    let count = 0,
      skipped = 0;
    const start = Date.now();
    const seen = new Set();
    const q = normalize(query);
    const pdfOnly = /\bpdf\b/.test(q);
    const since = /gecen hafta/.test(q)
      ? Date.now() - 14 * 86400000
      : /bugun/.test(q)
        ? new Date().setHours(0, 0, 0, 0)
        : /bu hafta/.test(q)
          ? Date.now() - 7 * 86400000
          : 0;
    const until = /gecen hafta/.test(q) ? Date.now() - 7 * 86400000 : Infinity;
    try {
      const walk = async (dir, root) => {
        if (Date.now() - start > 30000 || count >= 8000) return;
        let entries;
        try {
          entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
          skipped++;
          return;
        }
        for (const entry of entries) {
          if (Date.now() - start > 30000 || count >= 8000) return;
          if (entry.isSymbolicLink() || ['node_modules', '.git', '.codex'].includes(entry.name))
            continue;
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(file, root);
            continue;
          }
          if (!entry.isFile() || seen.has(file)) continue;
          seen.add(file);
          count++;
          try {
            const real = await fs.promises.realpath(file);
            if (!within(root, real)) continue;
            const st = await fs.promises.stat(real);
            if (st.mtimeMs < since || st.mtimeMs > until || st.size > 20 * 1024 * 1024) continue;
            if (pdfOnly && path.extname(real).toLowerCase() !== '.pdf') continue;
            const name = normalize(entry.name);
            let text = '';
            let score = words.filter((w) => name.includes(w)).length * 3;
            if (!words.every((w) => name.includes(w))) {
              try {
                text = await this.content(real, st);
              } catch {
                skipped++;
              }
            }
            const combined = name + ' ' + text;
            if (!words.every((w) => combined.includes(w))) continue;
            score += words.filter((w) => text.includes(w)).length;
            const id = randomUUID();
            const at = text.indexOf(words[0]);
            items.push({
              id,
              name: entry.name,
              path: real,
              score,
              modified: st.mtimeMs,
              snippet: text.slice(Math.max(0, at - 50), Math.max(0, at - 50) + 200),
            });
          } catch {
            skipped++;
          }
        }
      };
      for (const folder of this.roots()) {
        try {
          await walk(await fs.promises.realpath(folder), await fs.promises.realpath(folder));
        } catch {
          skipped++;
        }
      }
      const limited = Date.now() - start > 30000 || count >= 8000;
      items.sort((a, b) => b.score - a.score || b.modified - a.modified);
      this.results.clear();
      for (const item of items.slice(0, 30)) this.results.set(item.id, item.path);
      return {
        items: items.slice(0, 30),
        note: `${count} dosya incelendi.${limited ? ' Arama sınırına ulaşıldı; daha dar bir klasör seç.' : ''}${skipped ? ' ' + skipped + ' dosya/klasör okunamadı.' : ''} PDF içinde seçilebilir metin aranır; taranmış resimlerde OCR yapılmaz.`,
      };
    } finally {
      this.searching = false;
    }
  }
  resolve(id, reveal = false) {
    const file = this.results.get(id);
    if (!file) throw Error('Aramayı yeniden çalıştır.');
    const real = fs.realpathSync(file);
    if (!this.roots().some((r) => within(fs.realpathSync(r), real)))
      throw Error('Bu dosyanın klasörü artık seçili değil.');
    if (
      !reveal &&
      ![
        '.pdf',
        '.txt',
        '.md',
        '.csv',
        '.png',
        '.jpg',
        '.jpeg',
        '.webp',
        '.docx',
        '.xlsx',
        '.pptx',
        '.tex',
        '.json',
        '.log',
      ].includes(path.extname(real).toLowerCase())
    )
      throw Error('Bu dosyayı klasöründe göstererek açabilirsin.');
    return real;
  }
}
module.exports = { Library, terms, within };
