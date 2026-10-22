'use strict';
// Optional, first-party Download module bridge. Other modules retain their sandbox.
const fs = require('node:fs');
const path = require('node:path');
const { DownloadEngine, candidateURL, validURL } = require('./engine.cjs');
const { createTrust } = require('./trust.cjs');
const TOOL_FILES = ['yt-dlp.exe', 'ffmpeg.exe'];
const hasTools = (dir) => !!dir && TOOL_FILES.every((f) => { try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; } });

/**
 * v0.8.5: where yt-dlp / FFmpeg are. Charles ships them in tools/download (Setup). An in-app
 * update delivers them in <app>/download-tools (older updaters replace whole top-level
 * folders, so tools/ itself cannot be sent); they are moved into tools/download on start.
 */
function toolCandidates({ appRoot, userData, config = {}, env = process.env }) {
  return [
    config.toolsDir,
    env.CHARLES_DOWNLOAD_TOOLS,
    path.join(appRoot, 'tools', 'download'),
    path.join(appRoot, 'download-tools'),
    userData && path.join(userData, 'download-tools'),
    // the module's own development folder next to the Charles folder
    path.resolve(appRoot, '..', 'charles-download-module', 'tools'),
  ].filter((d) => typeof d === 'string' && d && path.isAbsolute(d));
}
function findTools(options) {
  return toolCandidates(options).find(hasTools) || null;
}
/** <app>/download-tools (from an update) → <app>/tools/download. Never overwrites. */
function migrateTools(appRoot) {
  const from = path.join(appRoot, 'download-tools'), to = path.join(appRoot, 'tools', 'download');
  try {
    if (!fs.statSync(from).isDirectory()) return false;
  } catch {
    return false;
  }
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name), b = path.join(to, name);
    if (fs.existsSync(b)) {
      // the same file already in place: the copy from the update is not needed
      if (fs.statSync(a).size === fs.statSync(b).size) fs.rmSync(a, { force: true });
      else { fs.rmSync(b, { force: true }); fs.renameSync(a, b); }
    } else fs.renameSync(a, b);
  }
  try { fs.rmdirSync(from); } catch {}
  return true;
}

function createDownloadBridge({ registry, owners, sessionFor, open, deps }) {
  const electron = require('electron');
  const { app, clipboard, BrowserWindow, BaseWindow, screen, dialog, shell } = electron;
  const configFile = path.join(__dirname, 'config.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return { call: () => { throw Error('Download host kurulumu eksik.'); } }; }
  if (!app?.getPath) return { call: () => { throw Error('Download yalnızca Electron içinde çalışır.'); } };
  const appRoot = path.resolve(__dirname, '..', '..', '..');
  try { migrateTools(appRoot); } catch (e) { console.warn('Charles Download tools:', e.message); }
  const bundledNode = path.join(appRoot, 'tools', 'cursor', 'node.exe');
  const toolOptions = { appRoot, userData: app.getPath('userData'), config };
  const toolsAt = (dir) => ({
    ytdlp: dir ? path.join(dir, 'yt-dlp.exe') : '',
    ffmpeg: dir ? path.join(dir, 'ffmpeg.exe') : '',
    node: config.nodePath || (fs.existsSync(bundledNode) ? bundledNode : ''),
    dir: dir || '',
  });
  const engine = new DownloadEngine({
    dataDir: path.join(app.getPath('userData'), 'module-data', 'download', 'engine'),
    outputDir: path.join(app.getPath('downloads'), 'Charles'),
    tools: toolsAt(findTools(toolOptions)),
  });
  // tools that appear later (Setup run again, folder added) are picked up without a restart
  const refreshTools = () => {
    if (engine.ready()) return;
    const dir = findTools(toolOptions);
    if (dir) engine.tools = toolsAt(dir);
  };
  const trust = createTrust({ registry });
  const messages={
    completed:{tr:'İndirme tamamlandı',en:'Download complete',de:'Download abgeschlossen',fr:'Téléchargement terminé',es:'Descarga completada',zh:'下载完成'},
    folder:{tr:'İndirme klasörünü seç',en:'Choose download folder',de:'Downloadordner wählen',fr:'Choisir le dossier',es:'Elegir carpeta de descargas',zh:'选择下载文件夹'},
  };
  const message=key=>messages[key][deps.language?.() || 'tr'] || messages[key].en;
  let popup = null, lastClipboard = '', dismissed = false, wasEnabled = false, closing = false, readingClipboard = false;
  // The card page reports its height and whether the user is busy with it through its
  // document title ("charles-download|h=158|hold=0"), so no extra IPC surface is needed.
  const CARD_WIDTH = 548, ISLAND_MAX_HEIGHT = 170, GAP = 4;
  let cardHeight = 170, hold = false;
  Promise.resolve(clipboard.readText()).then(text => { lastClipboard = String(text || '').trim(); }).catch(() => {});
  // v0.8.5: only Charles' own Download module (known package, "download" permission granted)
  const enabled = () => trust().ok;
  // Bounds directly under the compact Charles island (as in the concept design). While the
  // island panel is expanded, hidden or the app window is open, there is no anchor: wait.
  function cardBounds() {
    const anchor = deps.islandAnchor?.();
    if (!anchor || anchor.height > ISLAND_MAX_HEIGHT || anchor.height < 20) return null;
    const area = screen.getDisplayMatching(anchor).workArea;
    const width = Math.min(CARD_WIDTH, area.width - 16);
    const height = Math.max(40, Math.min(cardHeight, area.height - 40));
    const x = Math.round(Math.min(area.x + area.width - width - 8, Math.max(area.x + 8, anchor.x + (anchor.width - width) / 2)));
    let y = Math.round(anchor.y + anchor.height + GAP);
    if (y + height > area.y + area.height) y = Math.max(area.y, Math.round(anchor.y - height - GAP));
    return { x, y, width, height };
  }
  function position() {
    if (!popup || popup.isDestroyed()) return false;
    const bounds = cardBounds();
    if (!bounds || cardHeight < 30) { if (popup.isVisible()) popup.hide(); return false; }
    const now = popup.getBounds();
    if (['x', 'y', 'width', 'height'].some(k => now[k] !== bounds[k])) popup.setBounds(bounds);
    return true;
  }
  function showPopup() {
    if (closing || !enabled() || dismissed) return;
    if (popup && !popup.isDestroyed()) { if (position()) popup.showInactive(); return; }
    const start = cardBounds() || { width: CARD_WIDTH, height: cardHeight, x: -10000, y: -10000 };
    popup = new BrowserWindow({
      ...start, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false,
      webPreferences: { preload: path.join(__dirname, '..', 'module-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: false, session: sessionFor('download') },
    });
    const win = popup, wcId = win.webContents.id;
    owners.set(wcId, 'download');
    deps.applyWindowIdentity?.(win);
    win.setMenu(null);
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.webContents.on('page-title-updated', (e, title) => {
      e.preventDefault();
      const m = /^charles-download\|h=(\d{1,4})\|hold=([01])$/.exec(String(title));
      if (!m || win.isDestroyed()) return;
      cardHeight = Math.min(560, Number(m[1])); hold = m[2] === '1';
      if (dismissed) return;
      if (position()) { if (!win.isVisible()) win.showInactive(); }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('charles-module://download/')) e.preventDefault(); });
    win.webContents.on('will-redirect', (e, url) => { if (!url.startsWith('charles-module://download/')) e.preventDefault(); });
    win.webContents.on('will-attach-webview', e => e.preventDefault());
    win.once('ready-to-show', () => { if (!win.isDestroyed() && !dismissed && enabled()) { if (position()) win.showInactive(); } });
    win.on('closed', () => { owners.delete(wcId); if (popup === win) popup = null; });
    position();
    void win.loadURL('charles-module://download/index.html?compact=1');
  }
  engine.on('offer', () => { dismissed = false; showPopup(); });
  engine.on('completed', job => { dismissed = false; showPopup(); deps.notify?.(message('completed'), job.title.slice(0, 200)); });
  engine.on('failed', () => { dismissed = false; showPopup(); });
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
      const now = Date.now();
      const relevant = hold || engine.candidate && now - engine.candidate.at < 30000 || engine.jobs.some(j => ['queued','downloading','processing','paused','pausing'].includes(j.status) || j.status === 'done' && now - j.completedAt < 20000 || j.status === 'error' && now - (j.failedAt || 0) < 20000);
      if (!relevant) popup.hide();
      else if (!dismissed && position()) popup.showInactive();
    }
  }, 1000);
  timer.unref();
  const shutdown = () => { closing = true; clearInterval(timer); void engine.shutdown(); if (popup && !popup.isDestroyed()) popup.destroy(); };
  app.once('before-quit', shutdown);
  return {
    engine,
    language(lang) { if (popup && !popup.isDestroyed()) popup.webContents.send('charles-module:language', lang); },
    async call(id, method, args) {
      if (id !== 'download') throw Error('Bu API yalnızca etkin Charles Download modülüne açıktır.');
      const state = trust();
      if (!state.ok)
        throw Error(
          state.reason === 'permission'
            ? 'Bu Download modülü sürümü “İndirme” izni istemiyor. Charles Download 1.0.1 veya üstünü yükle.'
            : state.reason === 'untrusted'
              ? 'Bu modül Charles’ın resmi Download paketiyle eşleşmiyor; indirme özellikleri kapalı.'
              : state.reason === 'dev-off'
                ? 'Klasörden yüklenen Download modülü yalnızca Geliştirici modu açıkken çalışır.'
                : 'Bu API yalnızca etkin Charles Download modülüne açıktır.',
        );
      if (['download.state', 'download.inspect', 'download.enqueue'].includes(method)) refreshTools();
      switch (method) {
        case 'download.state': return { ...engine.snapshot(), toolsDir: engine.tools.dir || '', language: deps.language?.() || 'tr' };
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
          const result = await dialog.showOpenDialog({ title: message('folder'), defaultPath: engine.settings.outputDir, properties: ['openDirectory', 'createDirectory'] });
          if (!result.canceled && result.filePaths[0]) engine.setSettings({ outputDir: result.filePaths[0] });
          return engine.snapshot();
        }
        case 'download.reveal': {
          const job = engine.jobs.find(j => j.id === args?.id);
          if (!job || job.status !== 'done' || !fs.existsSync(job.output)) throw Error('Kaydedilen dosya bulunamadı.');
          shell.showItemInFolder(job.output); return true;
        }
        case 'download.open': open('download'); dismissed = true; hold = false; if (popup && !popup.isDestroyed()) popup.hide(); return true;
        case 'download.hide': dismissed = true; hold = false; if (popup && !popup.isDestroyed()) popup.hide(); return true;
        default: throw Error('Bilinmeyen indirme çağrısı.');
      }
    },
    shutdown,
  };
}
module.exports = { createDownloadBridge, toolCandidates, findTools, migrateTools, hasTools };
