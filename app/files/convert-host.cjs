'use strict';
// v0.8.10: the Electron side of the converter (app/files/convert.cjs): finds FFmpeg and draws
// SVG in a hidden page that cannot reach the network. (v0.8.11: text PDFs are written directly.)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Converter } = require('./convert.cjs');
const { pdfText } = require('./attachment-text.cjs');

function findFFmpeg(appRoot, userData) {
  const { toolCandidates, migrateTools } = require('../modules/download/bridge.cjs');
  try { migrateTools(appRoot); } catch {}
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  for (const dir of toolCandidates({ appRoot, userData })) {
    const file = path.join(dir, exe);
    try { if (fs.statSync(file).isFile()) return file; } catch {}
  }
  // development on Linux / macOS
  if (process.platform !== 'win32') for (const f of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']) if (fs.existsSync(f)) return f;
  return null;
}

function createConverter({ electron, appRoot }) {
  const { BrowserWindow, session, nativeImage, app } = electron;
  let ffmpeg;
  const ff = () => (ffmpeg === undefined ? (ffmpeg = findFFmpeg(appRoot, app.getPath('userData'))) : ffmpeg);
  let partition = null;
  function quietSession() {
    if (partition) return partition;
    partition = session.fromPartition('charles-convert');
    // pages made from the user's files never load anything from the network
    partition.webRequest.onBeforeRequest((details, done) => done({ cancel: !/^(file|data|blob|devtools):/i.test(details.url) }));
    partition.setPermissionRequestHandler((_wc, _p, done) => done(false));
    return partition;
  }
  async function withPage(html, javascript, fn) {
    const tmp = path.join(os.tmpdir(), `charles-convert-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tmp, html);
    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      paintWhenInitiallyHidden: true,
      webPreferences: { session: quietSession(), javascript, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    try {
      await win.loadFile(tmp);
      return await fn(win.webContents);
    } finally {
      if (!win.isDestroyed()) win.destroy();
      fs.rmSync(tmp, { force: true });
    }
  }
  const rasterSVG = (svg, maxSize = 2048) =>
    withPage('<!doctype html><meta charset="utf-8"><body style="margin:0"></body>', true, async (wc) => {
      const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
      const data = await wc.executeJavaScript(`new Promise((ok, fail) => {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
          const max = ${Math.max(16, Math.min(8192, Math.round(maxSize)))};
          const k = Math.min(max / Math.max(w, h), 8);
          w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          ok(c.toDataURL('image/png'));
        };
        img.onerror = () => fail(new Error('SVG okunamadı.'));
        img.src = ${JSON.stringify(url)};
      })`);
      return Buffer.from(String(data).split(',')[1] || '', 'base64');
    });
  const slides = slideEngine({ withPage, rasterSVG });
  return new Converter({ ffmpeg: ff, nativeImage, rasterSVG, pdfText, slides });
}

/** v0.9.16: presentations drawn in the same closed hidden page (no network, no scripts of theirs). */
function slideEngine({ withPage, rasterSVG }) {
  const { deckHtml, chartSvg } = require('./slides.cjs');
  const powerpoint = require('./powerpoint-com.cjs');
  async function builtinPdf(deck, target) {
    const data = await withPage(deckHtml(deck), false, (wc) => wc.printToPDF({ preferCSSPageSize: true, printBackground: true, margins: { marginType: 'none' } }));
    fs.writeFileSync(target, data);
  }
  async function pictures(deck, { width = 1920, only = null, signal, progress } = {}) {
    const list = only ? deck.slides.filter((s) => only.includes(s.number)) : deck.slides;
    const scale = width / (deck.width * (96 / 72));
    const height = Math.round(deck.height * (96 / 72) * scale);
    const out = [];
    // a slide at a time: one hidden window is sized to the picture, paints it, and is read back
    for (const [i, slide] of list.entries()) {
      if (signal?.aborted) throw Object.assign(Error('İptal edildi.'), { cancelled: true });
      out.push(await withPage(deckHtml(deck, { scale, only: [slide.number] }), false, async (wc) => {
        wc.getOwnerBrowserWindow?.()?.setContentSize(Math.round(width), height);
        await new Promise((r) => setTimeout(r, 150));
        return (await wc.capturePage({ x: 0, y: 0, width: Math.round(width), height }, { stayHidden: true })).toPNG();
      }));
      progress?.((i + 1) / list.length);
    }
    return out;
  }
  async function pdf(source, deck, target, { signal, progress } = {}) {
    if (await powerpoint.available()) {
      try {
        progress?.(0.3);
        await powerpoint.toPdf(source, target, { signal });
        return { engine: 'powerpoint' };
      } catch (e) {
        if (e.cancelled) throw e;
        // the built-in drawing still gives a result
        fs.rmSync(target, { force: true });
      }
    }
    progress?.(0.5);
    await builtinPdf(deck, target);
    return { engine: 'builtin' };
  }
  async function chartPictures(deck) {
    const out = new Map();
    for (const slide of deck.slides)
      for (const s of slide.shapes) {
        if (s.kind !== 'chart' || s.layer !== 'slide') continue;
        const w = Math.max(60, s.w), h = Math.max(40, s.h);
        const svg = chartSvg(s, w, h).replace('<svg ', `<svg style="background:#fff" `).replace('width="100%" height="100%"', `width="${w * 2}" height="${h * 2}"`);
        try {
          out.set(s, await rasterSVG(svg, 1600));
        } catch {}
      }
    return out;
  }
  return { pdf, pictures, chartPictures };
}
module.exports = { createConverter, findFFmpeg };
