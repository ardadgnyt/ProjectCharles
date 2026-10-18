// v0.8.0: running modules. Every module opens in its own window with its own in-memory
// session: sandboxed, no Node.js, no network (every http/https/ws request is cancelled), only
// its own files over charles-module://<id>/. The page talks to Charles through
// module-preload.cjs; each call is checked here against the sender's module and permissions.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveRequest, headers } = require('./protocol.cjs');
const { ModuleStorage } = require('./storage.cjs');
const { readFolder } = require('./package.cjs');
const { DEFAULT_PERMISSIONS } = require('./manifest.cjs');

const EMOTES = ['love', 'surprised', 'proud', 'wink', 'yawn', 'happy', 'annoyed'];
const MODEL = /^[a-z0-9][a-z0-9:._/-]{0,80}$/i;
// calls per window of time, per module
const RATES = { default: [60, 10000], 'ai.chat': [12, 60000], 'ai.image': [4, 60000], 'voice.speak': [20, 60000], notify: [10, 60000] };

/** A simple sliding-window limit: true when the call may run. */
function rateLimiter(rates = RATES, now = () => Date.now()) {
  const calls = new Map();
  return (id, method) => {
    const [max, ms] = rates[method] || rates.default;
    const key = id + ' ' + (rates[method] ? method : 'default');
    const t = now();
    const list = (calls.get(key) || []).filter((x) => t - x < ms);
    if (list.length >= max) {
      calls.set(key, list);
      return false;
    }
    list.push(t);
    calls.set(key, list);
    return true;
  };
}

/** Which permission a method needs (storage, slime and notify are given to every module). */
function needs(method) {
  if (method === 'ai.chat') return 'ai';
  if (method === 'ai.image') return 'image';
  if (method === 'voice.speak' || method === 'voice.stop') return 'voice';
  return null;
}

const str = (v, name, max) => {
  if (typeof v !== 'string' || !v.trim()) throw Error(`“${name}” boş olamaz.`);
  if (v.length > max) throw Error(`“${name}” en fazla ${max} karakter olabilir.`);
  return v;
};

/** { system, messages } → one prompt for the AI (no chat history is written). */
function chatPrompt(args) {
  if (!args || typeof args !== 'object') throw Error('ai.chat bir nesne bekler: { system, messages }.');
  const system = args.system === undefined ? '' : str(args.system, 'system', 20000);
  const messages = args.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 50) throw Error('“messages” 1–50 mesajlık bir liste olmalı.');
  let total = system.length;
  const lines = messages.map((m, i) => {
    if (!m || !['user', 'assistant'].includes(m.role)) throw Error(`messages[${i}].role “user” ya da “assistant” olmalı.`);
    const c = str(m.content, `messages[${i}].content`, 20000);
    total += c.length;
    return (m.role === 'user' ? 'Kullanıcı' : 'Asistan') + ': ' + c;
  });
  if (total > 100000) throw Error('Mesajların toplamı çok uzun (en fazla 100.000 karakter).');
  if (messages[messages.length - 1].role !== 'user') throw Error('Son mesaj kullanıcıdan olmalı.');
  const head = system ? `Sistem talimatı (bir Charles modülünden):\n${system}\n\n` : '';
  if (messages.length === 1) return head + messages[0].content;
  return head + 'Konuşma:\n' + lines.join('\n\n') + '\n\nSon kullanıcı mesajına yanıt ver.';
}

function createModuleHost(o) {
  const { registry, electron, deps } = o;
  const { BrowserWindow, session, ipcMain, dialog, shell, net, screen } = electron;
  const windows = new Map(); // id → BrowserWindow
  const owners = new Map(); // webContents.id → id
  const sessions = new Map();
  const storages = new Map();
  const watchers = new Map();
  const busy = new Set(); // "id ai.chat"
  const allow = rateLimiter();

  const changed = () => deps.onChange?.();
  const storage = (id) => {
    if (!storages.has(id)) storages.set(id, new ModuleStorage(registry.dataDir(id)));
    return storages.get(id);
  };
  function roots(id) {
    const m = registry.get(id);
    if (!m || m.enabled === false) return null;
    let entry = 'index.html';
    try {
      entry = registry.manifest(id).entry;
    } catch {}
    return { files: registry.root(id), data: registry.dataDir(id), entry };
  }
  function sessionFor(id) {
    if (sessions.has(id)) return sessions.get(id);
    const ses = session.fromPartition('charles-module-' + id); // not persisted
    ses.protocol.handle('charles-module', async (request) => {
      const host = (() => {
        try {
          return new URL(request.url).hostname;
        } catch {
          return '';
        }
      })();
      // a module never reads another module's files
      if (host !== id) return new Response('', { status: 403 });
      const r = resolveRequest(request.url, roots);
      if (!r.file) return new Response('', { status: r.status || 404 });
      const res = await net.fetch(pathToFileURL(r.file).toString());
      return new Response(res.body, { status: 200, headers: headers(r.mime) });
    });
    // no network, no downloads, no camera / microphone / location / notifications …
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*', 'file://*/*'] }, (_d, cb) => cb({ cancel: true }));
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (e) => e.preventDefault());
    sessions.set(id, ses);
    return ses;
  }
  function visibleBounds(b, m) {
    if (!b) return { width: m.window.width, height: m.window.height };
    const area = screen.getDisplayMatching(b).workArea;
    const on = b.x < area.x + area.width - 80 && b.x + b.width > area.x + 80 && b.y >= area.y - 10 && b.y < area.y + area.height - 60;
    if (!on) return { width: Math.min(b.width, area.width), height: Math.min(b.height, area.height) };
    return b;
  }
  async function askLink(win, name, url) {
    if (!/^https?:\/\//i.test(url)) return;
    const r = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Tarayıcıda aç', 'Vazgeç'],
      defaultId: 1,
      cancelId: 1,
      title: name,
      message: `“${name}” modülü bir bağlantı açmak istiyor.`,
      detail: url.slice(0, 500),
      noLink: true,
    });
    if (r.response === 0) await shell.openExternal(url);
  }
  function open(id) {
    const m = registry.get(id);
    if (!m) throw Error('Bu modül yüklü değil.');
    if (m.enabled === false) throw Error('Bu modül kapalı. Ayarlar → Modüller’den aç.');
    const existing = windows.get(id);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return true;
    }
    const manifest = m.devPath ? registry.recheck(id) : registry.manifest(id);
    const b = visibleBounds(m.bounds, manifest);
    const win = new BrowserWindow({
      ...b,
      minWidth: manifest.window.minWidth,
      minHeight: manifest.window.minHeight,
      title: manifest.name,
      show: false,
      backgroundColor: '#0b0a09',
      autoHideMenuBar: true,
      icon: deps.icon?.(),
      webPreferences: {
        preload: path.join(__dirname, 'module-preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        devTools: registry.data.dev === true,
        session: sessionFor(id),
      },
    });
    win.setMenu(null);
    windows.set(id, win);
    owners.set(win.webContents.id, id);
    const wcId = win.webContents.id;
    const origin = `charles-module://${id}/`;
    win.webContents.on('will-navigate', (e, url) => {
      if (url.startsWith(origin)) return;
      e.preventDefault();
      void askLink(win, manifest.name, url);
    });
    win.webContents.on('will-redirect', (e, url) => {
      if (!url.startsWith(origin)) e.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      void askLink(win, manifest.name, url);
      return { action: 'deny' };
    });
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());
    win.on('page-title-updated', (e) => e.preventDefault());
    win.once('ready-to-show', () => win.show());
    const keep = () => !win.isDestroyed() && !win.isMinimized() && !win.isMaximized() && registry.saveBounds(id, win.getBounds());
    win.on('moved', keep);
    win.on('resized', keep);
    win.on('closed', () => {
      windows.delete(id);
      owners.delete(wcId);
      unwatch(id);
      deps.stopSpeak?.(id);
      changed();
    });
    if (m.devPath) watch(id, win);
    void win.loadURL(origin + manifest.entry);
    changed();
    return true;
  }
  /** Developer mode: the folder changes → checked again → the open window reloads. */
  function watch(id, win) {
    const m = registry.get(id);
    if (!m?.devPath || watchers.has(id)) return;
    let timer = null;
    try {
      const w = fs.watch(m.devPath, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (win.isDestroyed()) return;
          try {
            readFolder(m.devPath); // the same checks as installing
            registry.recheck(id);
            win.webContents.reloadIgnoringCache();
          } catch (e) {
            deps.notify?.(registry.get(id) ? id : 'Modül', 'Geliştirici modu: ' + e.message);
          }
        }, 350);
      });
      watchers.set(id, w);
    } catch {}
  }
  function unwatch(id) {
    try {
      watchers.get(id)?.close();
    } catch {}
    watchers.delete(id);
  }
  function close(id) {
    const w = windows.get(id);
    if (w && !w.isDestroyed()) w.close();
  }
  function reload(id) {
    const w = windows.get(id);
    if (w && !w.isDestroyed()) w.webContents.reloadIgnoringCache();
  }

  // ── the API (window.charlesModule) ─────────────────────────────────────────────
  async function call(id, method, args) {
    const m = registry.get(id);
    if (!m || m.enabled === false) throw Error('Bu modül kapalı.');
    const need = needs(method);
    if (need && !(m.permissions || []).includes(need)) throw Error(`Bu modülün “${need}” izni yok (manifest.json → permissions).`);
    if (!allow(id, method)) throw Error('Çok sık istek gönderildi; biraz bekleyip tekrar dene.');
    const s = () => storage(id);
    switch (method) {
      case 'info':
        return {
          id,
          version: m.version,
          charlesVersion: deps.charlesVersion,
          language: deps.language(),
          permissions: [...(m.permissions || []), ...Object.keys(DEFAULT_PERMISSIONS)],
        };
      case 'ai.chat': {
        const prompt = chatPrompt(args);
        const model = args?.model === undefined || args?.model === null ? null : String(args.model);
        if (model !== null && !MODEL.test(model)) throw Error('Geçersiz model adı.');
        const key = id + ' ai.chat';
        if (busy.has(key)) throw Error('Önceki ai.chat isteği hâlâ sürüyor.');
        busy.add(key);
        try {
          return await deps.askChat({ prompt, model });
        } finally {
          busy.delete(key);
        }
      }
      case 'ai.image': {
        const prompt = str(args?.prompt, 'prompt', 4000);
        const key = id + ' ai.image';
        if (busy.has(key)) throw Error('Önceki görsel hâlâ oluşturuluyor.');
        busy.add(key);
        try {
          const b64 = await deps.askImage({ prompt, cwd: registry.dataDir(id) });
          const name = 'images/' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
          s().writeFile(name, b64, { encoding: 'base64' });
          return { path: name, url: `charles-module://${id}/_data/${name}` };
        } finally {
          busy.delete(key);
        }
      }
      case 'storage.getJSON':
        return s().getJSON(args?.path, args?.fallback ?? null);
      case 'storage.setJSON':
        return s().setJSON(args?.path, args?.value);
      case 'storage.listFiles':
        return s().listFiles(args?.path || '');
      case 'storage.readFile':
        return s().readFile(args?.path, { encoding: args?.encoding || 'utf8' });
      case 'storage.writeFile':
        return s().writeFile(args?.path, args?.data, { encoding: args?.encoding || 'utf8' });
      case 'storage.deleteFile':
        return s().deleteFile(args?.path);
      case 'voice.speak': {
        if (deps.micOff?.()) throw Error('Charles’ın mikrofon/ses gizliliği açık; sesli okuma şu an kapalı.');
        await deps.speak(id, str(args?.text, 'text', 5000));
        return true;
      }
      case 'voice.stop':
        deps.stopSpeak?.(id);
        return true;
      case 'slime.emote': {
        const name = String(args?.name || '');
        if (!EMOTES.includes(name)) throw Error(`Geçersiz ifade “${name.slice(0, 30)}”. Geçerli ifadeler: ${EMOTES.join(', ')}.`);
        deps.emote(name);
        return true;
      }
      case 'notify': {
        let name = id;
        try {
          name = registry.manifest(id).name;
        } catch {}
        deps.notify(name, str(args?.text, 'text', 300));
        return true;
      }
      default:
        throw Error('Bilinmeyen modül API çağrısı: ' + String(method).slice(0, 40));
    }
  }
  ipcMain.handle('charles-module', async (event, method, args) => {
    const id = owners.get(event.sender.id);
    // only the module window's own top page may call
    if (!id || event.senderFrame !== event.sender.mainFrame || !String(event.senderFrame.url).startsWith(`charles-module://${id}/`))
      return { ok: false, error: 'Bu çağrı yalnızca bir Charles modül penceresinden yapılabilir.' };
    try {
      return { ok: true, value: await call(id, String(method), args) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  return {
    open,
    close,
    reload,
    call,
    openIds: () => [...windows.keys()].filter((id) => !windows.get(id).isDestroyed()),
    language(lang) {
      for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send('charles-module:language', lang);
    },
    closeAll() {
      for (const id of [...windows.keys()]) close(id);
    },
  };
}

module.exports = { createModuleHost, chatPrompt, rateLimiter, needs, EMOTES };
