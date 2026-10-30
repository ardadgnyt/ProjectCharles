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
const RATES = { default: [60, 10000], 'ai.chat': [12, 60000], 'ai.image': [4, 60000], 'voice.speak': [20, 60000], notify: [10, 60000], 'files.save': [6, 60000], 'files.pick': [6, 60000] };

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
  if (method.startsWith('download.')) return 'download';
  if (method === 'slime.wear') return 'appearance';
  if (method === 'files.save' || method === 'files.pick') return 'files'; // v0.9.12
  return null;
}

const str = (v, name, max) => {
  if (typeof v !== 'string' || !v.trim()) throw Error(`“${name}” boş olamaz.`);
  if (v.length > max) throw Error(`“${name}” en fazla ${max} karakter olabilir.`);
  return v;
};

// v0.8.7: images for ai.chat — only from the module's own data folder
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_CHAT_IMAGES = 10;
const MAX_CHAT_IMAGE_BYTES = 20 * 1024 * 1024;
const NO_IMAGE_MODEL = /^(cursor|abacus|evren):/i;
const FEATURES = ['ai.images', 'slime.look', 'slime.react', 'slime.wear', 'slime.kit', 'files.save', 'files.pick'];
// v0.8.8: what the desktop Slime can do for a module (src/renderer.ts → onModuleReact)
const REACTIONS = ['greet', 'blink', 'squash', 'slap', 'dizzy', 'gulp'];
// the accessories a module may put on the desktop Slime (src/vendor/slime/wardrobe.ts SLOT_ITEMS)
const SLOT_ITEMS = {
  hat: ['none', 'auto', 'fedora', 'crown', 'partyHat', 'beanie', 'witchHat', 'santaHat', 'bunnyEars', 'bow', 'headphones'],
  eyes: ['none', 'sunglasses', 'bigShades', 'roundGlasses', 'monocle', 'eyePatch'],
  other: ['none', 'pumpkin', 'scarf', 'banana', 'bowTie', 'catCollar', 'arrow'],
};
/** { hat?, eyes?, other? } → a checked accessory set (missing slots: null = keep the user's). */
function cleanWear(v) {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('slime.wear bir nesne bekler: { hat, eyes, other } ya da null.');
  const out = {};
  for (const k of Object.keys(v)) if (!SLOT_ITEMS[k]) throw Error(`Bilinmeyen aksesuar yuvası “${String(k).slice(0, 20)}” (hat, eyes, other).`);
  for (const slot of Object.keys(SLOT_ITEMS)) {
    if (v[slot] === undefined || v[slot] === null) continue;
    if (!SLOT_ITEMS[slot].includes(v[slot])) throw Error(`Geçersiz ${slot} aksesuarı “${String(v[slot]).slice(0, 30)}”. Geçerli: ${SLOT_ITEMS[slot].join(', ')}.`);
    out[slot] = v[slot];
  }
  if (out.other === 'pumpkin' && out.hat && !['none', 'auto'].includes(out.hat)) throw Error('Balkabağı şapkayla birlikte takılamaz.');
  if (!Object.keys(out).length) throw Error('En az bir aksesuar yuvası (hat, eyes, other) ver ya da null gönder.');
  return out;
}

/** images: ['courses/k1/s9.png'] → absolute paths inside the module's data folder, or an error. */
function chatImages(images, storage) {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images)) throw Error('“images” bir liste olmalı, örn. ["sources/s9.png"].');
  if (images.length > MAX_CHAT_IMAGES) throw Error(`Bir ai.chat isteğinde en fazla ${MAX_CHAT_IMAGES} görsel olabilir.`);
  return images.map((rel, i) => {
    if (typeof rel !== 'string' || !rel.trim() || rel.length > 400) throw Error(`images[${i}] geçerli bir dosya yolu olmalı.`);
    if (!IMAGE_EXT.test(rel)) throw Error(`images[${i}]: yalnızca PNG, JPG, JPEG ve WebP görseller gönderilebilir.`);
    const abs = storage.resolve(rel); // stays inside the module's own data folder
    if (!IMAGE_EXT.test(abs)) throw Error(`images[${i}]: yalnızca PNG, JPG, JPEG ve WebP görseller gönderilebilir.`);
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch {
      throw Error(`images[${i}] bulunamadı: ${rel}`);
    }
    if (!st.isFile()) throw Error(`images[${i}] bir dosya değil: ${rel}`);
    if (!st.size) throw Error(`images[${i}] boş: ${rel}`);
    if (st.size > MAX_CHAT_IMAGE_BYTES) throw Error(`images[${i}] çok büyük (en fazla 20 MB): ${rel}`);
    return abs;
  });
}

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
  let wearer = null; // v0.8.8: the module whose accessories the desktop Slime wears
  const allow = rateLimiter();
  // Charles Download optional bridge.
  let downloadBridge = null;
  if (fs.existsSync(path.join(__dirname, 'download', 'config.json')))
    try {
      downloadBridge = require('./download/bridge.cjs').createDownloadBridge({ registry, owners, sessionFor, open, deps });
    } catch (e) {
      // outside Electron (tests) or a broken install: the other modules keep working
      console.warn('Charles Download:', e.message);
    }

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
    return { files: registry.root(id), data: registry.dataDir(id), entry, kit: deps.kitDir || null };
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
    deps.applyWindowIdentity?.(win);
    win.on('show', () => deps.applyWindowIdentity?.(win));
    win.on('focus', () => deps.applyWindowIdentity?.(win));
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
      // the desktop Slime takes off what this module put on
      if (wearer === id) {
        wearer = null;
        deps.wear?.(null);
      }
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
            deps.notify?.(registry.get(id) ? id : 'Modül', 'Geliştirici modu: ' + e.message, id);
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
    if (method.startsWith('download.')) {
      if (!downloadBridge) throw Error('Charles Download host eklentisi kurulu değil.');
      return downloadBridge.call(id, method, args);
    }
    const s = () => storage(id);
    switch (method) {
      case 'info':
        return {
          id,
          version: m.version,
          charlesVersion: deps.charlesVersion,
          language: deps.language(),
          permissions: [...(m.permissions || []), ...Object.keys(DEFAULT_PERMISSIONS)],
          // v0.8.7: what this Charles can do beyond the v0.8.0 API (older versions send none)
          features: [...FEATURES],
        };
      case 'ai.chat': {
        const prompt = chatPrompt(args);
        const model = args?.model === undefined || args?.model === null ? null : String(args.model);
        if (model !== null && !MODEL.test(model)) throw Error('Geçersiz model adı.');
        const images = chatImages(args?.images, s());
        if (images.length && model !== null && NO_IMAGE_MODEL.test(model)) throw Error('Görseller şu an yalnızca GPT, Claude ve Antigravity ile çalışıyor.');
        const key = id + ' ai.chat';
        if (busy.has(key)) throw Error('Önceki ai.chat isteği hâlâ sürüyor.');
        busy.add(key);
        try {
          return await deps.askChat(images.length ? { prompt, model, images } : { prompt, model });
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
      // v0.8.8: the desktop Slime's look, reactions and temporary accessories
      case 'slime.look':
        return deps.look ? deps.look() : null;
      case 'slime.react': {
        const name = String(args?.name || '');
        if (!REACTIONS.includes(name) && !EMOTES.includes(name))
          throw Error(`Geçersiz tepki “${name.slice(0, 30)}”. Geçerli: ${[...REACTIONS, ...EMOTES].join(', ')}.`);
        if (EMOTES.includes(name)) deps.emote(name);
        else deps.react?.(name);
        return true;
      }
      case 'slime.wear': {
        const wear = cleanWear(args?.accessories === undefined ? null : args.accessories);
        if (wear) {
          wearer = id;
          deps.wear?.(wear);
        } else if (wearer === id) {
          wearer = null;
          deps.wear?.(null);
        }
        return true;
      }
      // v0.9.12: a file to the user's computer / files from it, always through Windows' own
      // Save / Open window (app/modules/files.cjs); one window at a time per module
      case 'files.save':
      case 'files.pick': {
        const key = id + ' files';
        if (busy.has(key)) throw Error('Kaydet / Aç penceresi zaten açık.');
        busy.add(key);
        try {
          let moduleName = id;
          try {
            moduleName = registry.manifest(id).name;
          } catch {}
          const win = windows.get(id);
          const files = require('./files.cjs');
          if (method === 'files.pick') return await files.pickFiles({ args: args || {}, dialog, win, moduleName });
          const r = await files.saveFile({ storage: s(), args: args || {}, dialog, win, moduleName, downloads: deps.downloadsDir?.() || registry.dataDir(id) });
          if (!r.saved) return { saved: false };
          deps.notifySaved?.(id, moduleName, r.name, r.file);
          return { saved: true, name: r.name, size: r.size }; // never the full path
        } finally {
          busy.delete(key);
        }
      }
      case 'notify': {
        let name = id;
        try {
          name = registry.manifest(id).name;
        } catch {}
        deps.notify(name, str(args?.text, 'text', 300), id);
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
    /** v0.8.8: the user's Slime look changed (colour / accessories) → every module window. */
    look(value) {
      for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send('charles-module:slime-look', value);
    },
    language(lang) {
      downloadBridge?.language?.(lang);
      for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send('charles-module:language', lang);
    },
    closeAll() {
      for (const id of [...windows.keys()]) close(id);
    },
  };
}

module.exports = { createModuleHost, chatPrompt, chatImages, rateLimiter, needs, cleanWear, EMOTES, REACTIONS, SLOT_ITEMS, FEATURES };
