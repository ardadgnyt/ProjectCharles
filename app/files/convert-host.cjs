'use strict';
// v0.8.10: the Electron side of the converter (app/files/convert.cjs): finds FFmpeg, prints
// HTML to PDF and draws SVG in a hidden page that cannot reach the network.
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
  const printPDF = (html) =>
    withPage(html, false, (wc) => wc.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } }));
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
  return new Converter({ ffmpeg: ff, nativeImage, printPDF, rasterSVG, pdfText });
}
module.exports = { createConverter, findFFmpeg };
