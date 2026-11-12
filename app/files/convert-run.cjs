'use strict';
// v0.9.26: how each target of convert-ops.cjs is made. One function per kind of input; every result
// is first written under a temporary name and then moved to a name that does not exist yet, so a
// failure or a cancel leaves no half file and nothing of the user's is overwritten.
const fs = require('node:fs');
const path = require('node:path');
const ops = require('./convert-ops.cjs');
const sheets = require('./sheets.cjs');
const docs = require('./docs.cjs');
const media = require('./media.cjs');
const { helperJob } = require('./helper-job.cjs');

const cancelled = (signal) => {
  if (signal?.aborted) throw Object.assign(Error('İptal edildi.'), { cancelled: true });
};
const conv = () => require('./convert.cjs');

/**
 * ctx: { deps, signal, progress(p), note(text), outDir, base, review? }
 * deps: { ffmpeg(), nativeImage, rasterSVG, pdfImages, helper, root, office, renderHtml, slides, fonts(), pdfText }
 * Returns the output path (a file, or a folder for several files), or { review } when the user is to
 * check text or cells first (finish() then writes).
 */
async function runTarget(file, target, opts, ctx) {
  const s = ops.setOf(file);
  const run = RUNNERS[s];
  if (!run) throw Error('Bu biçime dönüştürülemiyor.');
  return run(file, target, opts, ctx);
}

// ── shared pieces ───────────────────────────────────────────────────────────────────────────────
function place(ctx, ext) {
  return conv().uniquePath(ctx.outDir, ctx.base, ext);
}
function folder(ctx, label) {
  return conv().uniquePath(ctx.outDir, `${ctx.base} (${label})`, '');
}
function write(ctx, ext, data) {
  const out = place(ctx, ext);
  fs.writeFileSync(out, data, { flag: 'wx' });
  return out;
}
async function ff(ctx, args) {
  const ffmpeg = ctx.deps.ffmpeg?.();
  if (!ffmpeg) throw Error('FFmpeg bulunamadı. Charles kurulumundaki tools\\download klasörünü kontrol et.');
  await conv().runFFmpeg(ffmpeg, args, { signal: ctx.signal, onProgress: ctx.progress });
}
/** ffmpeg into a temporary name beside the result, renamed when it worked. */
async function ffOut(ctx, ext, build) {
  const out = place(ctx, ext);
  const tmp = out + '.part.' + ext;
  try {
    await ff(ctx, build(tmp));
    fs.renameSync(tmp, out);
    return out;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const pageList = (opts) => (opts.pageMode === 'some' ? opts.pages : '');
function blocksFromLines(lines) {
  // OCR or PDF lines → paragraphs: a bigger gap than usual starts a new one
  const blocks = [];
  let cur = null;
  let prev = null;
  for (const l of lines) {
    const gap = prev ? l.y - (prev.y + prev.h) : 0;
    if (!cur || gap > Math.max(prev.h, l.h) * 0.9) {
      cur = { text: l.text };
      blocks.push(cur);
    } else cur.text += (cur.text.endsWith('-') ? '' : ' ') + l.text;
    prev = l;
  }
  return blocks;
}
async function office(ctx, app, job) {
  const office = ctx.deps.office;
  if (!office || !(await office.available(app))) {
    const name = { word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' }[app];
    throw Error(`Bu dönüşüm için Microsoft ${name} gerekir; bu bilgisayarda bulunamadı.`);
  }
  return office.run(app, job, { signal: ctx.signal });
}
/** Office into a temporary file with the right extension, then renamed. */
async function officeOut(ctx, app, file, format, ext, extra = {}) {
  const out = place(ctx, ext);
  const tmp = out + '.part.' + ext;
  try {
    ctx.progress(0.2);
    await office(ctx, app, { source: file, target: tmp, format, ...extra });
    if (!fs.existsSync(tmp)) throw Error('Dönüştürülemedi.');
    fs.renameSync(tmp, out);
    return out;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const officeHere = async (ctx, app) => !!ctx.deps.office && (await ctx.deps.office.available(app));

// ── pictures through the helper ─────────────────────────────────────────────────────────────────
async function frames(ctx, file) {
  const dir = ops.tmpDir();
  const lines = await helperJob(ctx.deps.helper, '--image', { cmd: 'frames', file, out: dir }, { signal: ctx.signal });
  const err = lines.find((l) => l.error);
  if (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (err.error === 'codec') throw Error(/\.(heic|heif)$/i.test(file) ? 'HEIC/HEIF için Windows’un “HEIF Görüntü Uzantıları” gerekir (Microsoft Store). Yükleyip yeniden dene.' : 'Bu görsel biçimi okunamadı.');
    throw Error('Görsel okunamadı; dosya bozuk olabilir.');
  }
  return { dir, files: lines.filter((l) => l.frame).map((l) => l.file) };
}
async function tiffFrom(ctx, pngs) {
  const out = place(ctx, 'tiff');
  const lines = await helperJob(ctx.deps.helper, '--image', { cmd: 'tiff', files: pngs.join('|'), out }, { signal: ctx.signal });
  if (!lines.some((l) => l.done)) throw Error('TIFF yazılamadı.');
  return out;
}
/** A picture's pixels on a colour (transparency → the colour), as JPEG of `quality`. */
function onColour(ni, image, hex, quality) {
  const { width, height } = image.getSize();
  const px = Buffer.from(image.toBitmap()); // BGRA
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    if (a >= 1) continue;
    px[i] = Math.round(px[i] * a + b * (1 - a));
    px[i + 1] = Math.round(px[i + 1] * a + g * (1 - a));
    px[i + 2] = Math.round(px[i + 2] * a + r * (1 - a));
    px[i + 3] = 255;
  }
  return ni.createFromBitmap(px, { width, height }).toJPEG(quality);
}
const JPEG_Q = { high: 95, balanced: 88, small: 70 };

// ── OCR ─────────────────────────────────────────────────────────────────────────────────────────
async function ocrPng(ctx, png, lang) {
  const lines = await helperJob(ctx.deps.helper, '--ocr', { file: png, lang: lang || '' }, { signal: ctx.signal, idleMs: 180000 });
  const r = lines[0] || {};
  if (r.error === 'nolang') throw Error('Bu bilgisayarda metin tanıma dili yüklü değil: Windows Ayarlar → Saat ve dil → Dil’den bir dil paketi ekle.');
  if (r.error) throw Error('Görseldeki metin okunamadı.');
  return r;
}
/**
 * OCR words → lines in reading order. Windows' OCR gives a table's columns as separate lines; the
 * words are put back into rows by where they stand, left to right.
 */
const ocrLines = (r) =>
  require('./tables.cjs')
    .rowsOf(r.lines.flatMap((l) => l.words))
    .map((row) => ({ text: row.words.map((w) => w.text).join(' '), x: row.words[0].x, y: Math.min(...row.words.map((w) => w.y)), h: row.h }));
/** Any picture → a PNG or JPEG that both the OCR and Electron's image code open. */
async function readablePng(ctx, file, work) {
  if (/\.(png|jpe?g|jfif)$/i.test(file)) return file;
  const out = path.join(work, 'ocr.png');
  await ff(ctx, ['-hide_banner', '-nostdin', '-y', '-i', file, '-frames:v', '1', out]);
  return out;
}
/** The pages of a PDF or the picture, OCR'd: [{ png, dpi, result }]. */
async function ocrPages(ctx, file, opts, work) {
  const pages = [];
  if (ops.setOf(file) === 'pdf') {
    const dpi = +opts.dpi || 300;
    const dir = await ctx.deps.pdfImages.convert(file, { target: 'png', pages: pageList(opts), dpi, outDir: work, signal: ctx.signal, progress: (p) => ctx.progress(p * 0.4), note: ctx.note });
    const list = fs.statSync(dir).isDirectory() ? fs.readdirSync(dir).sort().map((n) => path.join(dir, n)) : [dir];
    for (const [i, png] of list.entries()) {
      cancelled(ctx.signal);
      pages.push({ png, dpi, result: await ocrPng(ctx, png, opts.lang) });
      ctx.progress(0.4 + ((i + 1) / list.length) * 0.5);
    }
  } else if (/\.tiff?$/i.test(file)) {
    // every page of a multi-page TIFF
    const fr = await frames(ctx, file);
    for (const [i, png] of fr.files.entries()) {
      cancelled(ctx.signal);
      const copy = path.join(work, `tiff-${i}.png`);
      fs.renameSync(png, copy);
      pages.push({ png: copy, dpi: 150, result: await ocrPng(ctx, copy, opts.lang) });
      ctx.progress(((i + 1) / fr.files.length) * 0.9);
    }
    fs.rmSync(fr.dir, { recursive: true, force: true });
  } else {
    const png = await readablePng(ctx, file, work);
    pages.push({ png, dpi: 150, result: await ocrPng(ctx, png, opts.lang) });
    ctx.progress(0.8);
  }
  return pages;
}

// ── review: text or cells checked before they are saved ─────────────────────────────────────────
function textResult(ctx, text, opts, save) {
  if (opts.review && ctx.review) return { review: { kind: 'text', text }, finish: (edited) => save(typeof edited === 'string' ? edited : text) };
  return save(text);
}
function tableResult(ctx, rows, opts, save) {
  if (ctx.review && opts.review !== false) return { review: { kind: 'table', rows: rows.slice(0, 2000) }, finish: (edited) => save(Array.isArray(edited) ? edited.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : [])) : rows) };
  return save(rows);
}
function saveRows(ctx, target, rows, opts) {
  const kind = target.endsWith('csv') ? 'csv' : 'xlsx';
  const typedRows = rows.map((r) => r.map((c) => sheets.typed(String(c), 'auto')));
  if (kind === 'csv') return write(ctx, 'csv', sheets.encodeText(sheets.writeDelimited(rows, ','), opts.outEncoding || 'utf-8-bom'));
  return write(ctx, 'xlsx', sheets.writeXlsx([{ name: 'Tablo', rows: typedRows }], { header: true }));
}

// ── PDF ─────────────────────────────────────────────────────────────────────────────────────────
async function pdf(file, target, opts, ctx) {
  const { pdfLayout, pageLines } = require('./pdf-layout.cjs');
  const work = ops.tmpDir();
  try {
    if (target === 'png' || target === 'jpg') {
      return await ctx.deps.pdfImages.convert(file, { target, pages: pageList(opts), dpi: +opts.dpi, quality: opts.quality, background: opts.background, outDir: opts.outDir || ctx.outDir, signal: ctx.signal, progress: ctx.progress, note: ctx.note });
    }
    if (target === 'pages-tiff') {
      const dir = await ctx.deps.pdfImages.convert(file, { target: 'png', pages: pageList(opts), dpi: +opts.dpi, outDir: work, signal: ctx.signal, progress: (p) => ctx.progress(p * 0.8), note: ctx.note });
      const list = fs.statSync(dir).isDirectory() ? fs.readdirSync(dir).sort().map((n) => path.join(dir, n)) : [dir];
      return await tiffFrom({ ...ctx, outDir: opts.outDir || ctx.outDir }, list);
    }
    if (target === 'txt' || target === 'docx' || target === 'html') {
      ctx.progress(0.2);
      const layout = await pdfLayout(file, { signal: ctx.signal });
      const pages = layout.pages.map((p) => blocksFromLines(pageLines(p)));
      if (!pages.flat().length) throw Error('PDF içinde okunabilir metin yok (taranmış olabilir). OCR seçeneklerinden birini kullan.');
      const c = conv();
      if (target === 'txt') return write(ctx, 'txt', pages.map((b) => b.map((x) => x.text).join('\n\n')).join('\n\n\f\n') + '\n');
      const blocks = pages.flat();
      if (target === 'docx') return write(ctx, 'docx', c.docxFromBlocks(blocks));
      return write(ctx, 'html', sheets.htmlPage(ctx.base, layout.pages.map((p, i) => `<section><h2>${i + 1}</h2>${pages[i].map((b) => `<p>${sheets.esc(b.text)}</p>`).join('')}</section>`).join('<hr>')));
    }
    if (target === 'pptx-pages') {
      const dir = await ctx.deps.pdfImages.convert(file, { target: 'jpg', pages: pageList(opts), dpi: +opts.dpi || 150, quality: 'high', outDir: work, signal: ctx.signal, progress: (p) => ctx.progress(p * 0.8), note: ctx.note });
      const list = fs.statSync(dir).isDirectory() ? fs.readdirSync(dir).sort().map((n) => path.join(dir, n)) : [dir];
      const layout = await pdfLayout(file, { pages: [1], signal: ctx.signal }).catch(() => null);
      const ni = ctx.deps.nativeImage;
      const slides = list.map((f) => {
        const { width, height } = ni.createFromPath(f).getSize();
        const ratio = layout?.pages[0] ? layout.pages[0].width / width : 72 / (+opts.dpi || 150);
        return { data: fs.readFileSync(f), ext: 'jpg', width: width * ratio, height: height * ratio };
      });
      return write(ctx, 'pptx', require('./pptx-write.cjs').pictureSlides(slides));
    }
    if (target === 'pptx-text') {
      const all = await pdfLayout(file, { signal: ctx.signal });
      const wanted = new Set(require('./pdf-render.cjs').parsePages(pageList(opts), all.count));
      const pages = all.pages.filter((p) => wanted.has(p.number)).map((p) => ({ width: p.width, height: p.height, lines: pageLines(p) }));
      if (!pages.some((p) => p.lines.length)) throw Error('PDF içinde düzenlenebilir metin yok (taranmış olabilir). Sayfa görselleri seçeneğini kullan.');
      return write(ctx, 'pptx', require('./pptx-write.cjs').textSlides(pages));
    }
    if (target === 'pdf-xlsx' || target === 'pdf-csv') {
      const { tableFromWords } = require('./tables.cjs');
      const all = await pdfLayout(file, { signal: ctx.signal });
      const wanted = new Set(require('./pdf-render.cjs').parsePages(pageList(opts), all.count));
      let rows = [];
      const scans = [];
      for (const p of all.pages.filter((x) => wanted.has(x.number))) {
        if (p.items.length) rows.push(...tableFromWords(p.items));
        else scans.push(p.number);
      }
      if (scans.length) {
        // pages without text: their words come from OCR
        const pages = await ocrPages(ctx, file, { ...opts, pageMode: 'some', pages: scans.join(','), dpi: '300' }, work);
        for (const pg of pages) rows.push(...tableFromWords(pg.result.lines.flatMap((l) => l.words)));
      }
      rows = rows.filter((r) => r.some((c) => String(c).trim()));
      if (!rows.length) throw Error('PDF’de tablo olarak okunacak metin bulunamadı.');
      return tableResult(ctx, rows, { review: true }, (r) => saveRows(ctx, target, r, opts));
    }
    if (target.startsWith('ocr-')) return await ocr(file, target, opts, ctx, work);
    throw Error('Bu biçime dönüştürülemiyor.');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function ocr(file, target, opts, ctx, work) {
  const pages = await ocrPages(ctx, file, opts, work);
  if (target === 'ocr-pdf') {
    const { searchablePdf } = require('./searchable-pdf.cjs');
    const ni = ctx.deps.nativeImage;
    const font = ctx.deps.fonts?.()?.regular;
    if (!font) throw Error('PDF için yazı tipi bulunamadı.');
    const out = searchablePdf(
      pages.map((p) => ({ jpeg: ni.createFromPath(p.png).toJPEG(85), dpi: p.dpi, words: p.result.lines.flatMap((l) => l.words) })),
      font,
      { title: ctx.base },
    );
    if (!pages.some((p) => p.result.lines.length)) ctx.note('Sayfalarda okunabilir metin bulunamadı; PDF yine de oluşturuldu ama aranamaz.');
    return write(ctx, 'pdf', out);
  }
  if (target === 'ocr-xlsx' || target === 'ocr-csv') {
    const { tableFromWords } = require('./tables.cjs');
    const rows = pages.flatMap((p) => tableFromWords(p.result.lines.flatMap((l) => l.words))).filter((r) => r.some((c) => c));
    if (!rows.length) throw Error('Görselde tablo olarak okunacak metin bulunamadı.');
    return tableResult(ctx, rows, opts, (r) => saveRows(ctx, target, r, opts));
  }
  const text = pages.map((p) => blocksFromLines(ocrLines(p.result)).map((b) => b.text).join('\n\n')).join('\n\n');
  if (!text.trim()) throw Error('Görselde okunabilir metin bulunamadı.');
  return textResult(ctx, text, opts, (t) => (target === 'ocr-txt' ? write(ctx, 'txt', t.replace(/\r?\n/g, '\r\n') + '\r\n') : write(ctx, 'docx', conv().docxFromBlocks(conv().blocksFromText(t)))));
}

// ── Word, ODT, RTF ──────────────────────────────────────────────────────────────────────────────
async function blocksOfDocument(file) {
  const e = ops.ext(file);
  const c = conv();
  if (e === 'docx') return c.docxToBlocks(fs.readFileSync(file));
  if (e === 'odt') return docs.readOdt(fs.readFileSync(file));
  if (e === 'rtf') return docs.readRtf(fs.readFileSync(file));
  throw Error('Bu belge için Microsoft Word gerekir.');
}
async function word(file, target, opts, ctx) {
  const e = ops.ext(file);
  const viaWord = await officeHere(ctx, 'word');
  const formats = { pdf: 'pdf', docx: 'docx', odt: 'odt', rtf: 'rtf', txt: 'txt', html: 'html' };
  if (['pages-png', 'pages-jpg'].includes(target)) {
    const work = ops.tmpDir();
    try {
      const pdfFile = await word(file, 'pdf', opts, { ...ctx, outDir: work, progress: (p) => ctx.progress(p * 0.4) });
      return await ctx.deps.pdfImages.convert(pdfFile, { target: target === 'pages-png' ? 'png' : 'jpg', pages: pageList(opts), dpi: +opts.dpi, quality: opts.quality, outDir: opts.outDir || ctx.outDir, signal: ctx.signal, progress: (p) => ctx.progress(0.4 + p * 0.6), note: ctx.note }).then((out) => {
        // the pages carry the document's name, not the temporary PDF's
        return out;
      });
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  if (viaWord && formats[target]) return officeOut(ctx, 'word', file, formats[target], target);
  if (e === 'doc' && !viaWord) throw Error('DOC dosyaları için Microsoft Word gerekir; bu bilgisayarda bulunamadı.');
  ctx.progress(0.3);
  let blocks;
  if (viaWord && e !== 'docx') {
    // Markdown, EPUB …: Word reads the file into a DOCX first, Charles writes the rest
    const work = ops.tmpDir();
    try {
      const tmp = path.join(work, 'belge.docx');
      await office(ctx, 'word', { source: file, target: tmp, format: 'docx' });
      blocks = conv().docxToBlocks(fs.readFileSync(tmp));
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  } else blocks = await blocksOfDocument(file);
  if (!viaWord) ctx.note('Word bulunamadı: yalnızca başlıklar, paragraflar ve listeler aktarıldı; tablolar, resimler ve biçimler korunmadı.');
  return writeBlocks(ctx, target, blocks, opts);
}
function writeBlocks(ctx, target, blocks, opts = {}) {
  const c = conv();
  if (!blocks.length) throw Error('Belgede metin yok.');
  if (target === 'pdf') return write(ctx, 'pdf', ctx.deps.textPdf(blocks, ctx.base));
  if (target === 'docx') return write(ctx, 'docx', c.docxFromBlocks(blocks));
  if (target === 'odt') return write(ctx, 'odt', docs.writeOdt(blocks, ctx.base));
  if (target === 'rtf') return write(ctx, 'rtf', docs.writeRtf(blocks));
  if (target === 'txt') return write(ctx, 'txt', c.blocksToText(blocks).replace(/\n/g, '\r\n'));
  if (target === 'md') return write(ctx, 'md', c.blocksToMarkdown(blocks));
  if (target === 'html') return write(ctx, 'html', c.blocksToHTML(blocks, ctx.base));
  if (target === 'epub') return write(ctx, 'epub', docs.writeEpub(blocks, { title: (opts.title || '').trim() || ctx.base }));
  throw Error('Bu biçime dönüştürülemiyor.');
}

// ── text, Markdown, HTML, EPUB ──────────────────────────────────────────────────────────────────
async function plain(file, target, opts, ctx) {
  const c = conv();
  const text = sheets.decodeText(fs.readFileSync(file), 'auto');
  if (target === 'md') return write(ctx, 'md', text);
  if (target === 'html') return write(ctx, 'html', c.textToHTML ? c.textToHTML(text, ctx.base) : sheets.htmlPage(ctx.base, `<pre>${sheets.esc(text)}</pre>`));
  return writeBlocks(ctx, target, c.blocksFromText(text), opts);
}
async function markdown(file, target, opts, ctx) {
  const c = conv();
  const md = sheets.decodeText(fs.readFileSync(file), 'auto');
  if (target === 'html') return write(ctx, 'html', c.markdownToHTML(md, ctx.base));
  if (target === 'txt') return write(ctx, 'txt', c.markdownToText(md));
  return writeBlocks(ctx, target, c.blocksFromMarkdown(md), opts);
}
async function html(file, target, opts, ctx) {
  const c = conv();
  if (target === 'page-png' || target === 'page-jpg' || target === 'pdf') {
    const ext = target === 'pdf' ? 'pdf' : target === 'page-png' ? 'png' : 'jpg';
    ctx.progress(0.3);
    const data = await ctx.deps.renderHtml({ file, format: ext, width: +opts.width || 1280, quality: JPEG_Q[opts.quality] || 88 });
    if (data.cut) ctx.note('Sayfa çok uzun olduğu için 16 000 piksel yükseklikte kesildi.');
    return write(ctx, ext, data.bytes);
  }
  const text = sheets.decodeText(fs.readFileSync(file), 'auto');
  if (target === 'txt') return write(ctx, 'txt', c.htmlToText(text));
  if (target === 'md') return write(ctx, 'md', c.htmlToMarkdown(text));
  return writeBlocks(ctx, target, c.blocksFromMarkdown(c.htmlToMarkdown(text)), opts);
}
async function epub(file, target, opts, ctx) {
  const c = conv();
  const book = docs.readEpub(fs.readFileSync(file));
  ctx.progress(0.3);
  if (target === 'html') return write(ctx, 'html', sheets.htmlPage(book.title || ctx.base, book.chapters.map((ch) => `<section>${ch.html.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '').replace(/<img\b[^>]*>/gi, '').replace(/\son\w+="[^"]*"/gi, '')}</section>`).join('<hr>')));
  const blocks = book.chapters.flatMap((ch) => c.blocksFromMarkdown(c.htmlToMarkdown(ch.html)));
  if (target === 'txt') return write(ctx, 'txt', c.blocksToText(blocks).replace(/\n/g, '\r\n'));
  return writeBlocks(ctx, target, blocks, opts);
}

// ── tables ──────────────────────────────────────────────────────────────────────────────────────
async function workbookOf(file, ctx) {
  const e = ops.ext(file);
  if (e === 'xlsx') return sheets.readXlsx(fs.readFileSync(file));
  if (e === 'ods') return sheets.readOds(fs.readFileSync(file));
  // XLS: Excel turns it into XLSX first, which Charles then reads
  const work = ops.tmpDir();
  try {
    const out = path.join(work, 'kitap.xlsx');
    await office(ctx, 'excel', { source: file, target: out, format: 'xlsx' });
    return sheets.readXlsx(fs.readFileSync(out));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
function pickSheet(book, name) {
  if (!name) return book[0];
  const s = book.find((x) => x.name === name);
  if (!s) throw Error(`“${name}” adlı çalışma sayfası yok.`);
  return s;
}
async function sheet(file, target, opts, ctx) {
  const viaExcel = await officeHere(ctx, 'excel');
  const fmt = { xlsx: 'xlsx', ods: 'ods', pdf: 'pdf', html: 'html' };
  if (viaExcel && fmt[target]) return officeOut(ctx, 'excel', file, fmt[target], target, opts.sheet && target === 'pdf' ? { sheet: opts.sheet } : {});
  ctx.progress(0.2);
  const book = await workbookOf(file, ctx);
  if (target === 'csv' || target === 'tsv') {
    const s = pickSheet(book, opts.sheet);
    return write(ctx, target, sheets.encodeText(sheets.writeDelimited(s.rows, target === 'tsv' ? '\t' : ','), opts.outEncoding));
  }
  if (target === 'sheet-png' || target === 'sheet-jpg') {
    const s = pickSheet(book, opts.sheet);
    const rows = sheets.sliceRange(s.rows, opts.range);
    if (!rows.length) throw Error('Seçilen aralık boş.');
    const ext = target === 'sheet-png' ? 'png' : 'jpg';
    const data = await ctx.deps.renderHtml({ html: sheets.htmlPage(s.name, sheets.htmlTable(rows, { header: false })), format: ext, width: 0, quality: JPEG_Q[opts.quality] || 88 });
    return write(ctx, ext, data.bytes);
  }
  if (!viaExcel) ctx.note('Excel bulunamadı: yalnızca değerler aktarıldı; formüller (son sonuçları kaldı), biçimler, grafikler ve resimler korunmadı.');
  return writeTables(ctx, target, book, opts);
}
async function writeTables(ctx, target, book, opts) {
  if (target === 'xlsx') return write(ctx, 'xlsx', sheets.writeXlsx(book, { header: opts.header !== 'no' }));
  if (target === 'ods') return write(ctx, 'ods', sheets.writeOds(book, { header: opts.header !== 'no' }));
  if (target === 'csv' || target === 'tsv') return write(ctx, target, sheets.encodeText(sheets.writeDelimited(book[0].rows, target === 'tsv' ? '\t' : ','), opts.outEncoding));
  if (target === 'json') return write(ctx, 'json', JSON.stringify(sheets.jsonFromTable(book[0].rows, opts.header !== 'no'), null, 2) + '\n');
  const page = sheets.htmlPage(ctx.base, book.map((s) => (book.length > 1 ? `<h1>${sheets.esc(s.name)}</h1>` : '') + sheets.htmlTable(s.rows, { header: opts.header !== 'no' })).join(''));
  if (target === 'html') return write(ctx, 'html', page);
  if (target === 'pdf') {
    const data = await ctx.deps.renderHtml({ html: page, format: 'pdf', landscape: Math.max(...book.map((s) => Math.max(0, ...s.rows.map((r) => r.length)))) > 6 });
    return write(ctx, 'pdf', data.bytes);
  }
  throw Error('Bu biçime dönüştürülemiyor.');
}
async function delimited(file, target, opts, ctx) {
  const { rows } = sheets.readDelimited(fs.readFileSync(file), { separator: opts.separator, encoding: opts.encoding, types: opts.types, tsv: ops.ext(file) === 'tsv' });
  if (!rows.length) throw Error('Dosyada veri yok.');
  return writeTables(ctx, target, [{ name: ctx.base, rows }], opts);
}
async function json(file, target, opts, ctx) {
  let value;
  try {
    value = JSON.parse(sheets.decodeText(fs.readFileSync(file), 'auto'));
  } catch {
    throw Error('JSON okunamadı.');
  }
  const rows = sheets.tableFromJson(value);
  return writeTables(ctx, target, [{ name: ctx.base, rows }], opts);
}

// ── presentations ───────────────────────────────────────────────────────────────────────────────
async function slides(file, target, opts, ctx) {
  const e = ops.ext(file);
  const viaPpt = await officeHere(ctx, 'powerpoint');
  if (['pptx', 'odp'].includes(target)) return officeOut(ctx, 'powerpoint', file, target, target);
  if (['png', 'jpg', 'pages-tiff'].includes(target)) {
    const w = +opts.width || 1920;
    const work = ops.tmpDir();
    try {
      let pngs;
      if (viaPpt) {
        ctx.progress(0.2);
        await office(ctx, 'powerpoint', { source: file, target: work, format: 'images', filter: 'PNG', ext: 'png', width: w, height: 0 });
        pngs = fs.readdirSync(work).filter((n) => n.endsWith('.png')).sort().map((n) => path.join(work, n));
      } else {
        if (e === 'odp') throw Error('ODP için Microsoft PowerPoint gerekir; bu bilgisayarda bulunamadı.');
        const deck = require('./slides.cjs').loadDeck(file);
        const pics = await ctx.deps.slides.pictures(deck, { width: w, signal: ctx.signal, progress: (p) => ctx.progress(p * 0.8) });
        pngs = pics.map((png, i) => {
          const f = path.join(work, `slide-${String(i + 1).padStart(5, '0')}.png`);
          fs.writeFileSync(f, png);
          return f;
        });
      }
      if (target === 'pages-tiff') return await tiffFrom({ ...ctx, outDir: opts.outDir || ctx.outDir }, pngs);
      const outDir = opts.outDir || ctx.outDir;
      const dir = conv().uniquePath(outDir, `${ctx.base} (${target.toUpperCase()})`, '');
      fs.mkdirSync(dir);
      const ni = ctx.deps.nativeImage;
      pngs.forEach((f, i) => {
        const name = path.join(dir, `${ctx.base}_${String(i + 1).padStart(3, '0')}.${target}`);
        if (target === 'png') fs.copyFileSync(f, name, fs.constants.COPYFILE_EXCL);
        else fs.writeFileSync(name, ni.createFromPath(f).toJPEG(JPEG_Q[opts.quality] || 88), { flag: 'wx' });
      });
      return dir;
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  if (target === 'pdf' && (viaPpt || e === 'odp')) return officeOut(ctx, 'powerpoint', file, 'pdf', 'pdf');
  if (e === 'odp' && (target === 'docx' || target === 'md')) {
    // PowerPoint reads the ODP into a PPTX first; Charles' slide reader writes the document
    const work = ops.tmpDir();
    try {
      const tmp = path.join(work, 'sunum.pptx');
      await office(ctx, 'powerpoint', { source: file, target: tmp, format: 'pptx' });
      const sl = require('./slides.cjs');
      const deck = sl.loadDeck(tmp);
      if (target === 'md') return write(ctx, 'md', sl.deckMarkdown(deck));
      const charts = await ctx.deps.slides?.chartPictures?.(deck);
      return write(ctx, 'docx', sl.deckDocx(deck, { charts }));
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  if (target === 'txt' || target === 'notes-txt') {
    let list;
    if (viaPpt) {
      const work = ops.tmpDir();
      try {
        const out = path.join(work, 'metin.json');
        await office(ctx, 'powerpoint', { source: file, target: out, format: 'text' });
        list = [].concat(JSON.parse(fs.readFileSync(out, 'utf8').replace(/^﻿/, '')));
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
    } else {
      if (e === 'odp') throw Error('ODP için Microsoft PowerPoint gerekir; bu bilgisayarda bulunamadı.');
      const sl = require('./slides.cjs');
      const deck = sl.loadDeck(file);
      // the slide text as Charles' slide reader writes it (titles, lists, tables), notes apart
      list = deck.slides.map((s) => ({ number: s.number, text: sl.deckText({ ...deck, slides: [{ ...s, notes: '' }] }).replace(/^\[Slayt [^\]]*\]\s*/, ''), notes: s.notes || '' }));
    }
    const fmt = (key) => list.map((s) => `— ${s.number} —\r\n${String(s[key] || '').replace(/\r?\n/g, '\r\n').trim()}`).join('\r\n\r\n') + '\r\n';
    if (target === 'notes-txt') return write(ctx, 'txt', fmt('notes'));
    const out = write(ctx, 'txt', fmt('text'));
    if (opts.notes) {
      const notes = conv().uniquePath(ctx.outDir, ctx.base + ' (notlar)', 'txt');
      fs.writeFileSync(notes, fmt('notes'), { flag: 'wx' });
      ctx.extra?.(notes);
    }
    return out;
  }
  return null; // PDF without PowerPoint, Word, Markdown: Charles' own slide drawing (convert.cjs)
}

// ── pictures ────────────────────────────────────────────────────────────────────────────────────
async function raster(file, target, opts, ctx) {
  const ni = ctx.deps.nativeImage;
  const e = ops.ext(file);
  const work = ops.tmpDir();
  try {
    if (target.startsWith('ocr-')) return await ocr(file, target, opts, ctx, work);
    if (target === 'svg-trace') {
      let src = file;
      if (!/\.(png|jpe?g|jfif)$/i.test(file)) {
        src = path.join(work, 'kaynak.png');
        await ff(ctx, ['-hide_banner', '-nostdin', '-y', '-i', file, '-frames:v', '1', src]);
      }
      const img = ni.createFromPath(src);
      if (img.isEmpty()) throw Error('Görsel okunamadı.');
      const { width, height } = img.getSize();
      const bgra = img.toBitmap();
      const rgba = Buffer.alloc(bgra.length);
      for (let i = 0; i < bgra.length; i += 4) (rgba[i] = bgra[i + 2]), (rgba[i + 1] = bgra[i + 1]), (rgba[i + 2] = bgra[i]), (rgba[i + 3] = bgra[i + 3]);
      ctx.progress(0.3);
      return write(ctx, 'svg', require('./vectorize.cjs').traceSvg({ width, height, data: rgba }, { colors: +opts.colors || 8, detail: opts.detail }));
    }
    // multi-page TIFF: every page, as pictures or as one PDF
    if (/^tiff?$/.test(e) && ['png', 'jpg', 'pdf'].includes(target)) {
      const { files } = await frames(ctx, file);
      if (files.length > 1) {
        if (target === 'pdf') return write(ctx, 'pdf', conv().pdfFromJpegs(files.map((f) => onColour(ni, ni.createFromPath(f), opts.bg || '#ffffff', 90))));
        const dir = folder(ctx, target.toUpperCase());
        fs.mkdirSync(dir);
        files.forEach((f, i) => {
          const name = path.join(dir, `${ctx.base}_${String(i + 1).padStart(3, '0')}.${target}`);
          if (target === 'png') fs.copyFileSync(f, name, fs.constants.COPYFILE_EXCL);
          else fs.writeFileSync(name, onColour(ni, ni.createFromPath(f), opts.bg || '#ffffff', JPEG_Q[opts.quality] || 88), { flag: 'wx' });
        });
        return dir;
      }
    }
    // a JPEG, BMP or PDF of a picture with see-through parts: on the chosen colour
    if (['jpg', 'bmp', 'pdf'].includes(target)) {
      let img = ni.createFromPath(file);
      if (img.isEmpty() && /\.(webp|avif|tiff?)$/i.test(file)) {
        const png = path.join(work, 'kaynak.png');
        await ff(ctx, ['-hide_banner', '-nostdin', '-y', '-i', file, '-frames:v', '1', png]);
        img = ni.createFromPath(png);
      }
      if (!img.isEmpty()) {
        img = opts.size ? fitImage(img, opts.size) : img;
        const jpg = onColour(ni, img, opts.bg || '#ffffff', JPEG_Q[opts.quality] || 90);
        if (target === 'jpg') return write(ctx, 'jpg', jpg);
        if (target === 'pdf') return write(ctx, 'pdf', conv().pdfFromJpegs([jpg]));
        const flat = ni.createFromBuffer(jpg);
        const bmp = path.join(work, 'flat.png');
        fs.writeFileSync(bmp, flat.toPNG());
        return await ffOut(ctx, 'bmp', (out) => ['-hide_banner', '-nostdin', '-y', '-i', bmp, '-frames:v', '1', '-pix_fmt', 'bgr24', out]);
      }
    }
    if (target === 'tiff') {
      const img = ni.createFromPath(file);
      if (!img.isEmpty()) {
        const png = path.join(work, 'kaynak.png');
        fs.writeFileSync(png, (opts.size ? fitImage(img, opts.size) : img).toPNG());
        return await tiffFrom(ctx, [png]);
      }
    }
    return null; // the long-standing path in convert.cjs does the rest
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
function fitImage(img, size) {
  const { width, height } = img.getSize();
  if (Math.max(width, height) <= size) return img;
  return width >= height ? img.resize({ width: size, quality: 'best' }) : img.resize({ height: size, quality: 'best' });
}
async function heic(file, target, opts, ctx) {
  const { dir, files } = await frames(ctx, file);
  try {
    if (!files.length) throw Error('Görsel okunamadı.');
    const ni = ctx.deps.nativeImage;
    const img = ni.createFromPath(files[0]);
    if (target === 'png') return write(ctx, 'png', img.toPNG());
    if (target === 'jpg') return write(ctx, 'jpg', onColour(ni, img, opts.bg || '#ffffff', JPEG_Q[opts.quality] || 90));
    if (target === 'pdf') return write(ctx, 'pdf', conv().pdfFromJpegs([onColour(ni, img, opts.bg || '#ffffff', 92)]));
    if (target === 'webp') return await ffOut(ctx, 'webp', (out) => ['-hide_banner', '-nostdin', '-y', '-i', files[0], '-frames:v', '1', '-c:v', 'libwebp', '-quality', opts.quality === 'high' ? '92' : opts.quality === 'small' ? '65' : '80', out]);
    throw Error('Bu biçime dönüştürülemiyor.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function svg(file, target, opts, ctx) {
  if (target === 'pdf') {
    // drawn as vectors, not as a picture
    const data = await ctx.deps.renderHtml({ svgFile: file, format: 'pdf' });
    return write(ctx, 'pdf', data.bytes);
  }
  if (target === 'jpg') {
    const ni = ctx.deps.nativeImage;
    const png = await ctx.deps.rasterSVG(fs.readFileSync(file, 'utf8'), opts.size || 2048);
    return write(ctx, 'jpg', onColour(ni, ni.createFromBuffer(png), opts.bg || '#ffffff', JPEG_Q[opts.quality] || 90));
  }
  return null;
}
async function ico(file, target, opts, ctx) {
  const { dir, files } = await frames(ctx, file);
  try {
    if (!files.length) throw Error('Simge okunamadı.');
    const out = folder(ctx, 'PNG');
    fs.mkdirSync(out);
    const ni = ctx.deps.nativeImage;
    files.forEach((f) => {
      const { width, height } = ni.createFromPath(f).getSize();
      const name = conv().uniquePath(out, `${ctx.base}_${width}x${height}`, 'png');
      fs.copyFileSync(f, name, fs.constants.COPYFILE_EXCL);
    });
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function gif(file, target, opts, ctx) {
  if (target === 'anim-webp') return ffOut(ctx, 'webp', (out) => media.animArgs(file, out, 'webp', opts));
  if (target === 'anim-mp4') return ffOut(ctx, 'mp4', (out) => media.animArgs(file, out, 'mp4', opts));
  if (target === 'frames-png' || target === 'frames-jpg') {
    const list = media.frameList(opts.frames || '1');
    const ext = target === 'frames-png' ? 'png' : 'jpg';
    const dir = folder(ctx, ext.toUpperCase());
    const tmp = dir + '.part';
    fs.mkdirSync(tmp);
    try {
      await ff(ctx, media.gifFramesArgs(file, path.join(tmp, 'f_%05d.' + ext), list));
      const made = fs.readdirSync(tmp).sort();
      if (!made.length) throw Error('Seçilen kareler GIF’te yok.');
      if (made.length < list.length) ctx.note(`GIF’te ${made.length} kare bulundu; olmayan kareler atlandı.`);
      fs.mkdirSync(dir);
      made.forEach((n, i) => fs.renameSync(path.join(tmp, n), path.join(dir, `${ctx.base}_kare_${String(list[i] ?? i + 1).padStart(3, '0')}.${ext}`)));
      return dir;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return null;
}

// ── sound and video ─────────────────────────────────────────────────────────────────────────────
async function speech(file, target, opts, ctx) {
  const { transcribe } = require('./transcribe.cjs');
  const r = await transcribe(file, { root: ctx.deps.root, ffmpeg: ctx.deps.ffmpeg?.(), language: opts.lang, signal: ctx.signal, progress: ctx.progress });
  if (target === 'say-txt') return write(ctx, 'txt', r.txt.replace(/\r?\n/g, '\r\n'));
  if (target === 'say-srt') return write(ctx, 'srt', r.srt);
  if (target === 'say-vtt') return write(ctx, 'vtt', r.vtt);
  return write(ctx, 'docx', conv().docxFromBlocks(r.txt.split(/\n+/).filter((l) => l.trim()).map((t) => ({ text: t.trim() }))));
}
async function audio(file, target, opts, ctx) {
  if (target.startsWith('say-')) return speech(file, target, opts, ctx);
  if (media.AUDIO_TARGETS.includes(target)) return ffOut(ctx, target, (out) => media.audioArgs(file, out, target, opts));
  return null;
}
async function video(file, target, opts, ctx) {
  if (target.startsWith('say-')) return speech(file, target, opts, ctx);
  if (target.startsWith('audio-')) {
    const t = target.slice(6);
    return ffOut(ctx, t, (out) => media.audioArgs(file, out, t, opts));
  }
  if (media.VIDEO_TARGETS.includes(target)) return ffOut(ctx, target, (out) => media.videoArgs(file, out, target, { ...opts, height: +opts.height || 0 }));
  if (target === 'clip-gif' || target === 'clip-webp') {
    const t = target.slice(5);
    return ffOut(ctx, t, (out) => media.clipArgs(file, out, t, opts));
  }
  if (target === 'frames-png' || target === 'frames-jpg') {
    const ext = target === 'frames-png' ? 'png' : 'jpg';
    const dir = folder(ctx, ext.toUpperCase());
    const tmp = dir + '.part';
    fs.mkdirSync(tmp);
    try {
      if (opts.frameMode === 'every') {
        await ff(ctx, media.intervalFramesArgs(file, path.join(tmp, `${ctx.base}_%04d.${ext}`), +opts.every || 10, ext === 'jpg'));
      } else {
        const times = String(opts.times || '0').split(/[,;]/).map((t) => t.trim()).filter(Boolean).slice(0, 500).map(media.timeOf);
        if (!times.length) throw Error('Hiç an seçilmedi.');
        for (const [i, at] of times.entries()) {
          cancelled(ctx.signal);
          const label = new Date(at * 1000).toISOString().slice(11, 19).replace(/:/g, '-');
          await ff({ ...ctx, progress: () => ctx.progress((i + 1) / times.length) }, media.videoFrameArgs(file, path.join(tmp, `${ctx.base}_${label}.${ext}`), at));
        }
      }
      if (!fs.readdirSync(tmp).length) throw Error('Seçilen anlarda kare bulunamadı (video daha kısa olabilir).');
      fs.renameSync(tmp, dir);
      return dir;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return null;
}
async function subs(file, target, opts, ctx) {
  if (target !== 'sub-txt') return null;
  const { subtitlesToText } = require('./transcribe.cjs');
  return write(ctx, 'txt', subtitlesToText(sheets.decodeText(fs.readFileSync(file), 'auto')).replace(/\n/g, '\r\n'));
}
async function archiveIn(file, target, opts, ctx) {
  const a = require('./archive.cjs');
  if (target === 'extract') {
    const r = await a.extract(file, ctx.outDir, { signal: ctx.signal, freePath: (d, n) => conv().uniquePath(d, n, '') });
    return r.folder;
  }
  const fmt = { 'arc-zip': 'zip', 'arc-7z': '7z', 'arc-tar': 'tar', 'arc-tgz': 'tar.gz' }[target];
  if (!fmt) return null;
  const base = path.basename(file).replace(a.READS, '');
  return a.repack(file, conv().uniquePath(ctx.outDir, base, fmt), fmt, { signal: ctx.signal });
}

const RUNNERS = {
  pdf, word, sheet, delimited, json, slides, txt: plain, md: markdown, html, epub,
  raster, heic, svg, ico, gif, audio, video, subs, archive: archiveIn,
};

// ── several files into one ──────────────────────────────────────────────────────────────────────
/** files (in the user's order) → one animated GIF / WebP, or one 7z / TAR archive. */
async function runJoined(files, target, opts, ctx) {
  if (target === 'arc-7z' || target === 'arc-tar') {
    const a = require('./archive.cjs');
    const fmt = target === 'arc-7z' ? '7z' : 'tar';
    return a.create(files, conv().uniquePath(ctx.outDir, ctx.base, fmt), fmt, { signal: ctx.signal });
  }
  if (target === 'join-gif' || target === 'join-webp') {
    const t = target.slice(5);
    const work = ops.tmpDir();
    try {
      // every picture as a PNG first (HEIC, WebP, AVIF … too), so FFmpeg reads one kind
      const ni = ctx.deps.nativeImage;
      const pngs = [];
      for (const [i, f] of files.entries()) {
        cancelled(ctx.signal);
        const out = path.join(work, `p${String(i).padStart(5, '0')}.png`);
        let img = ni.createFromPath(f);
        if (img.isEmpty()) {
          if (/\.(heic|heif)$/i.test(f)) {
            const fr = await frames(ctx, f);
            img = ni.createFromPath(fr.files[0]);
          } else {
            await ff(ctx, ['-hide_banner', '-nostdin', '-y', '-i', f, '-frames:v', '1', out]);
            img = ni.createFromPath(out);
          }
        }
        if (img.isEmpty()) throw Error(path.basename(f) + ': görsel okunamadı.');
        fs.writeFileSync(out, img.toPNG());
        pngs.push(out);
        ctx.progress(((i + 1) / files.length) * 0.5);
      }
      const size = ni.createFromPath(pngs[0]).getSize();
      const list = path.join(work, 'liste.txt');
      return await ffOut(ctx, t, (out) => {
        const [text, args] = media.slideshowArgs(pngs, list, out, t, { delay: +opts.delay || 500, width: +opts.width || 0, quality: opts.quality, fit: [size.width, size.height] });
        fs.writeFileSync(list, text);
        return args;
      });
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  throw Error('Bu biçime dönüştürülemiyor.');
}

module.exports = { runTarget, runJoined, blocksFromLines, onColour, writeBlocks };
