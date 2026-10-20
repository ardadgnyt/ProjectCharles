'use strict';
// Optional, first-party Download module bridge. Other modules retain their sandbox.
const fs = require('node:fs');
const path = require('node:path');
const { DownloadEngine, candidateURL, validURL } = require('./engine.cjs');

function createDownloadBridge({ registry, owners, sessionFor, open, deps }) {
  const electron = require('electron');
  const { app, clipboard, BrowserWindow, BaseWindow, screen, dialog, shell } = electron;
  const configFile = path.join(__dirname, 'config.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return { call: () => { throw Error('Download host kurulumu eksik.'); } }; }
  if (!app?.getPath) return { call: () => { throw Error('Download yalnızca Electron içinde çalışır.'); } };
  const appRoot = path.resolve(__dirname, '..', '..', '..');
  const bundledTools = path.join(appRoot, 'tools', 'download');
  const toolRoot = config.toolsDir || (fs.existsSync(path.join(bundledTools, 'yt-dlp.exe')) ? bundledTools : path.join(app.getPath('userData'), 'download-tools'));
  const bundledNode = path.join(appRoot, 'tools', 'cursor', 'node.exe');
  const engine = new DownloadEngine({
    dataDir: path.join(app.getPath('userData'), 'module-data', 'download', 'engine'),
    outputDir: path.join(app.getPath('downloads'), 'Charles'),
    tools: { ytdlp: path.join(toolRoot, 'yt-dlp.exe'), ffmpeg: path.join(toolRoot, 'ffmpeg.exe'), node: config.nodePath || (fs.existsSync(bundledNode) ? bundledNode : '') },
  });
  let popup = null, lastClipboard = '', dismissed = false, wasEnabled = false, closing = false, readingClipboard = false;
  Promise.resolve(clipboard.readText()).then(text => { lastClipboard = String(text || '').trim(); }).catch(() => {});
  const enabled = () => !!registry.get('download') && registry.get('download').enabled !== false;
  function position() {
    if (!popup || popup.isDestroyed()) return;
    const island = BaseWindow.getAllWindows().find(w => w !== popup && !w.isDestroyed() && w.isVisible() && w.getTitle().startsWith('Charles ·') && w.isAlwaysOnTop());
    const anchor = island?.getBounds();
    const area = anchor ? screen.getDisplayMatching(anchor).workArea : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = 500, height = 188;
    const x = Math.round(Math.min(area.x + area.width - width - 12, Math.max(area.x + 12, anchor ? anchor.x + (anchor.width - width) / 2 : area.x + (area.width - width) / 2)));
    const y = Math.round(Math.min(area.y + area.height - height - 12, Math.max(area.y + 12, anchor ? anchor.y + anchor.height + 8 : area.y + 24)));
    popup.setBounds({ x, y, width, height });
  }
  function showPopup() {
    if (closing || !enabled() || dismissed) return;
    if (popup && !popup.isDestroyed()) { position(); popup.showInactive(); return; }
    popup = new BrowserWindow({
      width: 500, height: 188, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false,
      webPreferences: { preload: path.join(__dirname, '..', 'module-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: false, session: sessionFor('download') },
    });
    const win = popup, wcId = win.webContents.id;
    owners.set(wcId, 'download');
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('charles-module://download/')) e.preventDefault(); });
    win.webContents.on('will-redirect', (e, url) => { if (!url.startsWith('charles-module://download/')) e.preventDefault(); });
    win.webContents.on('will-attach-webview', e => e.preventDefault());
    win.once('ready-to-show', () => { if (!win.isDestroyed() && !dismissed && enabled()) { position(); win.showInactive(); } });
    win.on('closed', () => { owners.delete(wcId); if (popup === win) popup = null; });
    position();
    void win.loadURL('charles-module://download/index.html?compact=1');
  }
  engine.on('offer', () => { dismissed = false; showPopup(); });
  engine.on('completed', job => { dismissed = false; showPopup(); deps.notify?.('İndirme tamamlandı', job.title.slice(0, 200)); });
  const timer = setInterval(async () => {
    if (closing) return;
    const active = enabled();
    if (!active) {
      if (popup && !popup.isDestroyed()) popup.close();
      if (wasEnabled) for (const job of engine.jobs) if (['queued','downloading'].includes(job.status)) {
        try { engine.control(job.id, 'pause'); } catch {}
      } else if (job.status === 'processing') { try { engine.control(job.id, 'cancel'); } catch {} }
      wasEnabled = false;
      return;
    }
    wasEnabled = true;
    if (engine.settings.watch && !readingClipboard) {
      readingClipboard = true;
      try {
        const text = String(await clipboard.readText()).trim();
        if (text !== lastClipboard) {
          lastClipboard = text;
          const url = text.length <= 8192 && candidateURL(text);
          if (url) engine.setCandidate(url);
        }
      } catch {} finally { readingClipboard = false; }
    }
    if (popup && !popup.isDestroyed()) {
      position();
      const relevant = engine.candidate && Date.now() - engine.candidate.at < 25000 || engine.jobs.some(j => ['queued','downloading','processing'].includes(j.status) || j.status === 'done' && Date.now() - j.completedAt < 15000);
      if (!relevant) popup.hide();
    }
  }, 1000);
  timer.unref();
  const shutdown = () => { closing = true; clearInterval(timer); void engine.shutdown(); if (popup && !popup.isDestroyed()) popup.destroy(); };
  app.once('before-quit', shutdown);
  return {
    engine,
    async call(id, method, args) {
      if (id !== 'download' || !enabled()) throw Error('Bu API yalnızca etkin Charles Download modülüne açıktır.');
      switch (method) {
        case 'download.state': return engine.snapshot();
        case 'download.inspect': return engine.inspect(args?.url);
        case 'download.enqueue': {
          const job = engine.enqueue(args); engine.candidate = null; dismissed = false; showPopup(); return job;
        }
        case 'download.control': return engine.control(String(args?.id), String(args?.action));
        case 'download.settings': return engine.setSettings({ watch: args?.watch });
        case 'download.clipboard': return validURL(String(await clipboard.readText()).trim());
        case 'download.folder': {
          fs.mkdirSync(engine.settings.outputDir, { recursive: true });
          const error = await shell.openPath(engine.settings.outputDir); if (error) throw Error(error); return true;
        }
        case 'download.chooseFolder': {
          const result = await dialog.showOpenDialog({ title: 'İndirme klasörünü seç', defaultPath: engine.settings.outputDir, properties: ['openDirectory', 'createDirectory'] });
          if (!result.canceled && result.filePaths[0]) engine.setSettings({ outputDir: result.filePaths[0] });
          return engine.snapshot();
        }
        case 'download.reveal': {
          const job = engine.jobs.find(j => j.id === args?.id);
          if (!job || job.status !== 'done' || !fs.existsSync(job.output)) throw Error('Kaydedilen dosya bulunamadı.');
          shell.showItemInFolder(job.output); return true;
        }
        case 'download.open': open('download'); if (popup && !popup.isDestroyed()) popup.hide(); return true;
        case 'download.hide': dismissed = true; if (popup && !popup.isDestroyed()) popup.hide(); return true;
        default: throw Error('Bilinmeyen indirme çağrısı.');
      }
    },
    shutdown,
  };
}
module.exports = { createDownloadBridge };
