'use strict';
// v0.9.26: the text of a PDF with where it stands (pdf.js, the build pdf-parse ships), for the
// converter: PDF → HTML, editable PowerPoint slides, tables (XLSX / CSV), and "does this PDF have
// text, or is it a scan". Runs as a child process (ELECTRON_RUN_AS_NODE) so a large PDF never holds
// Charles up; prints one JSON line per page. The file is only read.
//
//   pdfLayout(file, { pages: [1, 2], signal }) → { pages: [{ number, width, height, items: [{ s, x, y, w, h }] }] }
//   x, y: top-left of the text in PDF points (1/72 inch) from the page's top-left corner.
const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

if (require.main === module) {
  const fs = require('node:fs');
  const [file, wanted] = process.argv.slice(2);
  const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  pdfjs.PDFJS.disableWorker = true;
  const say = (v) => process.stdout.write(JSON.stringify(v) + '\n');
  (async () => {
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), password: '' });
    } catch (e) {
      say({ error: /password/i.test(String(e?.name || e?.message)) ? 'password' : 'corrupt' });
      return;
    }
    say({ pages: doc.numPages });
    const list = wanted ? wanted.split(',').map(Number).filter((n) => n >= 1 && n <= doc.numPages) : Array.from({ length: doc.numPages }, (_, i) => i + 1);
    for (const n of list) {
      try {
        const page = await doc.getPage(n);
        const view = page.getViewport(1);
        const content = await page.getTextContent({ normalizeWhitespace: true });
        const items = [];
        for (const it of content.items) {
          if (!it.str || !it.str.trim()) continue;
          // the text's place on the page as shown (rotation and crop box applied)
          const m = pdfjs.PDFJS.Util.transform(view.transform, it.transform);
          const h = Math.hypot(m[2], m[3]) || Math.abs(it.height) || 10;
          const w = Math.abs(it.width) * (view.scale || 1);
          items.push({ s: it.str, x: +m[4].toFixed(1), y: +(m[5] - h).toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) });
        }
        say({ number: n, width: +view.width.toFixed(1), height: +view.height.toFixed(1), items });
        page.cleanup();
      } catch {
        say({ number: n, error: 'page' });
      }
    }
    say({ done: true });
  })().catch(() => say({ error: 'corrupt' }));
}

function pdfLayout(file, { pages = null, signal, timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = [__filename, file];
    if (pages && pages.length) args.push(pages.join(','));
    const child = spawn(process.execPath, args, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const out = { pages: [], count: 0 };
    let error = null;
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener?.('abort', stop, { once: true });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let v;
      try {
        v = JSON.parse(line);
      } catch {
        return;
      }
      if (v.error && v.number === undefined) error = v.error;
      else if (v.pages !== undefined) out.count = v.pages;
      else if (v.number !== undefined && !v.error) out.pages.push(v);
    });
    child.on('error', reject);
    child.on('close', () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', stop);
      if (signal?.aborted) return reject(Object.assign(Error('İptal edildi.'), { cancelled: true }));
      if (error === 'password') return reject(Object.assign(Error('Bu PDF parolayla korunuyor. Charles parolalı PDF’leri dönüştüremez; parolasız bir kopyasını kullan.'), { code: 'password' }));
      if (error) return reject(Object.assign(Error('PDF açılamadı: dosya bozuk ya da desteklenmeyen bir PDF.'), { code: 'corrupt' }));
      resolve(out);
    });
  });
}

/** Text pieces of a page → lines in reading order (pieces on one baseline joined with spaces). */
function pageLines(page) {
  const items = [...page.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(2, Math.min(last.h, it.h) * 0.5)) last.items.push(it);
    else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  return lines.map((l) => {
    const parts = l.items.sort((a, b) => a.x - b.x);
    let text = '';
    let end = null;
    for (const p of parts) {
      if (end !== null && p.x - end > p.h * 0.15 && !/\s$/.test(text) && !/^\s/.test(p.s)) text += ' ';
      text += p.s;
      end = p.x + p.w;
    }
    return { y: l.y, h: l.h, x: parts[0].x, text: text.replace(/\s+/g, ' ').trim() };
  });
}

module.exports = { pdfLayout, pageLines };
