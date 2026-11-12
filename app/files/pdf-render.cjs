'use strict';
// v0.9.26: PDF → PNG / JPEG for the converter (app/files/convert.cjs).
//
// The pages are drawn by Windows' own PDF renderer (Windows.Data.Pdf) inside Charles' helper
// (`charles-helper.exe --pdf`, setup/CharlesHelper.cs): text, vector shapes, pictures, embedded fonts
// and page rotation come out as a PDF viewer shows them; it is not a copy of the pictures inside the
// file. The helper writes one PNG per page into a temporary folder; here each one becomes the
// picture the user asked for (a JPEG through Electron's encoder, on white) and is moved into place.
// One page is in memory at a time, the source is only read, and nothing is ever overwritten.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const DPIS = [72, 96, 150, 200, 300];
const DEFAULT_DPI = 150;
const MAX_PAGES = 2000;
const PAGE_MS = 90000; // no answer for a page this long: the helper is stopped
const QUALITY = { high: 95, balanced: 88, small: 70 };

const ERRORS = {
  password: 'Bu PDF parolayla korunuyor. Charles parolalı PDF’leri dönüştüremez; parolasız bir kopyasını kullan.',
  corrupt: 'PDF açılamadı: dosya bozuk ya da desteklenmeyen bir PDF.',
  missing: 'PDF bulunamadı.',
  denied: 'PDF’ye erişim izni yok.',
  timeout: 'PDF çok uzun sürdü; işlem durduruldu.',
  request: 'PDF dönüştürücü başlatılamadı.',
  out: 'Çıktı klasörü bulunamadı.',
  memory: 'Windows’un PDF çizicisi grafik belleği alamadı. Açık programları (özellikle arka planda kalmış Word pencerelerini) kapatıp yeniden dene.',
  crash: 'Windows’un PDF çizicisi beklenmedik şekilde kapandı. Bilgisayarı yeniden başlatıp tekrar dene.',
};

/**
 * "1-3, 5, 8" → [1, 2, 3, 5, 8] within 1..count. '' or 'all' = every page. Throws a message the user
 * can act on for anything else (a page outside the document, a reversed range, letters).
 */
function parsePages(text, count) {
  const s = String(text ?? '').trim();
  if (!s || /^(all|tümü|hepsi)$/i.test(s)) return Array.from({ length: count }, (_, i) => i + 1);
  const out = new Set();
  for (const part of s.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d{1,6})(?:\s*-\s*(\d{1,6})?)?$/.exec(part);
    if (!m) throw Object.assign(Error(`Sayfa aralığı okunamadı: “${part.slice(0, 20)}”. Örnek: 1-3, 5`), { code: 'pages' });
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : part.includes('-') ? count : a;
    if (a < 1 || b < 1) throw Object.assign(Error('Sayfa numaraları 1’den başlar.'), { code: 'pages' });
    if (a > b) throw Object.assign(Error(`Sayfa aralığı ters: ${a}-${b}.`), { code: 'pages' });
    if (b > count) throw Object.assign(Error(`Bu PDF ${count} sayfa; ${b}. sayfa yok.`), { code: 'pages' });
    for (let n = a; n <= b; n++) out.add(n);
  }
  if (!out.size) throw Object.assign(Error('Hiç sayfa seçilmedi.'), { code: 'pages' });
  if (out.size > MAX_PAGES) throw Object.assign(Error(`Bir seferde en fazla ${MAX_PAGES} sayfa dönüştürülebilir.`), { code: 'pages' });
  return [...out].sort((x, y) => x - y);
}

/** belge_001.png …: zero-padded so the files sort in page order (at least three digits). */
function pageName(base, page, count, ext) {
  return `${base}_${String(page).padStart(Math.max(3, String(count).length), '0')}.${ext}`;
}

/** A name for a file or folder in `dir` that does not exist yet. */
function freePath(dir, name, ext = '') {
  for (let n = 1; ; n++) {
    const full = path.join(dir, (n === 1 ? name : `${name} (${n})`) + (ext ? '.' + ext : ''));
    if (!fs.existsSync(full)) return full;
  }
}

function createPdfImages({ helper, nativeImage, spawnFn = spawn }) {
  /** Runs the helper once; onLine gets each answer; resolves when it ends. */
  function run(request, { signal, onLine = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      if (!helper || !fs.existsSync(helper)) return reject(Error('Charles yardımcısı bulunamadı; kurulumu onar.'));
      let child;
      try {
        child = spawnFn(helper, ['--pdf'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      } catch (e) {
        return reject(e);
      }
      let finished = false;
      let timer;
      const end = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', abort);
        try {
          child.kill();
        } catch {}
        error ? reject(error) : resolve();
      };
      const watch = () => {
        clearTimeout(timer);
        timer = setTimeout(() => end(Error(ERRORS.timeout)), PAGE_MS);
      };
      const abort = () => end(Object.assign(Error('İptal edildi.'), { cancelled: true }));
      if (signal?.aborted) return abort();
      signal?.addEventListener?.('abort', abort);
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        watch();
        let v;
        try {
          v = JSON.parse(line);
        } catch {
          return;
        }
        try {
          onLine(v);
        } catch (e) {
          end(e);
        }
      });
      child.on('error', (e) => end(e));
      child.on('close', () => end());
      watch();
      // the request travels on stdin: a password would never show on a command line
      child.stdin.end(require('./helper-job.cjs').asciiJson(request) + '\n');
    });
  }

  async function info(file, { signal } = {}) {
    let out = null;
    await run({ cmd: 'info', file }, { signal, onLine: (v) => (out = out || v) });
    if (!out) throw Error(ERRORS.corrupt);
    if (out.error) throw Object.assign(Error(ERRORS[out.error] || ERRORS.corrupt), { code: out.error });
    return { pages: Number(out.pages) || 0, protected: !!out.protected };
  }

  /**
   * Converts the chosen pages. options: { target: 'png'|'jpg', pages: '1-3', dpi, quality, background:
   * 'white'|'transparent', outDir, signal, progress(p), note(text) }. Returns the file (one page) or
   * the folder (several pages) it made; on cancel, what was finished stays and the error says so.
   */
  async function convert(file, { target, pages = '', dpi = DEFAULT_DPI, quality = 'balanced', background = 'white', outDir = '', signal, progress = () => {}, note = () => {} } = {}) {
    if (!['png', 'jpg'].includes(target)) throw Error('Bu biçime dönüştürülemiyor.');
    const meta = await info(file, { signal });
    if (!meta.pages) throw Error(ERRORS.corrupt);
    const list = parsePages(pages, meta.pages);
    const resolution = DPIS.includes(Number(dpi)) ? Number(dpi) : DEFAULT_DPI;
    const dir = outDir && path.isAbsolute(outDir) ? outDir : path.dirname(file);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw Error(ERRORS.out);
    const base = path.basename(file, path.extname(file)).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'belge';
    const single = list.length === 1;
    // several pages go into a folder of their own, so a page never lands on a file that is there
    const target_dir = single ? dir : freePath(dir, `${base} (${target.toUpperCase()})`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-pdf-'));
    let made = 0;
    let created = false;
    let scaled = false;
    const failed = [];
    let first = null;
    const reasons = new Map();
    try {
      // JPEG has no transparency: always on white. PNG: white like paper, or see-through on request.
      const bg = target === 'png' && background === 'transparent' ? 'none' : 'white';
      // a page Windows' renderer could not draw is tried once more in a fresh helper (it happened
      // while Office programs were busy); one that still fails is named
      let todo = list;
      const done = new Set();
      for (let attempt = 0; attempt < 2 && todo.length; attempt++) {
      failed.length = 0;
      let finished = false;
      await run(
        { cmd: 'render', file, out: tmp, pages: todo.join(','), dpi: resolution, bg },
        {
          signal,
          onLine: (v) => {
            if (v.done) finished = true;
            if (v.error && v.page === undefined) throw Object.assign(Error(ERRORS[v.error] || ERRORS.corrupt), { code: v.error });
            if (v.page === undefined) return;
            if (v.error || !v.file) {
              failed.push(v.page);
              reasons.set(v.page, v.error || 'file');
              return;
            }
            const png = path.resolve(String(v.file));
            // only what the helper wrote in our folder (Windows paths compare without case)
            if (path.dirname(png).toLowerCase() !== path.resolve(tmp).toLowerCase()) {
              failed.push(v.page);
              reasons.set(v.page, 'path');
              return;
            }
            if (v.scaled) scaled = true;
            if (!single && !created) {
              fs.mkdirSync(target_dir);
              created = true;
            }
            const dest = single ? freePath(dir, base, target) : path.join(target_dir, pageName(base, v.page, meta.pages, target));
            if (target === 'png') fs.copyFileSync(png, dest, fs.constants.COPYFILE_EXCL);
            else {
              const image = nativeImage.createFromPath(png);
              if (image.isEmpty()) {
                failed.push(v.page);
                return;
              }
              fs.writeFileSync(dest, image.toJPEG(QUALITY[quality] || QUALITY.balanced), { flag: 'wx' });
            }
            fs.rmSync(png, { force: true });
            first = first || dest;
            made++;
            done.add(v.page);
            progress(made / list.length);
          },
        },
      );
      // pages the helper never answered for (it ended inside Windows' renderer) are tried again too
      for (const p of todo) if (!done.has(p) && !failed.includes(p)) {
        failed.push(p);
        if (!reasons.has(p)) reasons.set(p, finished ? 'file' : 'crash');
      }
      todo = [...failed];
      }
    } catch (e) {
      if (e.cancelled && made)
        throw Object.assign(Error(`İptal edildi. Bitmiş ${made} sayfa kaydedildi: ${single ? first : target_dir}`), { cancelled: true, partial: single ? first : target_dir });
      throw e;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    if (failed.length) note(`Şu sayfalar çizilemedi: ${failed.join(', ')}.`);
    if (scaled) note('Bazı sayfalar çok büyük olduğu için daha düşük çözünürlükte kaydedildi.');
    if (!made) {
      // a reason the user can act on, when there is one
      const why = [...new Set(reasons.values())];
      const known = why.map((r) => ERRORS[r]).filter(Boolean);
      if (known.length === 1) throw Error(known[0]);
      throw Error('Hiçbir sayfa dönüştürülemedi' + (why.length ? ' (' + why.join(', ') + ')' : '') + '.');
    }
    return single ? first : target_dir;
  }

  return { info, convert };
}

module.exports = { createPdfImages, parsePages, pageName, freePath, DPIS, DEFAULT_DPI, MAX_PAGES };
