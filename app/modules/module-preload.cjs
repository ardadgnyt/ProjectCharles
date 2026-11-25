// v0.8.0: window.charlesModule — the only way a module page talks to Charles (API v1).
// Runs sandboxed: just forwards calls; app/modules/host.cjs checks the module and its
// permissions for every call.
const { contextBridge, ipcRenderer } = require('electron');

const call = async (method, args) => {
  const r = await ipcRenderer.invoke('charles-module', method, args);
  if (!r || !r.ok) {
    const err = new Error((r && r.error) || 'Modül çağrısı başarısız.');
    if (r && r.code) err.code = r.code;
    throw err;
  }
  return r.value;
};
const listeners = { language: new Set(), 'slime-look': new Set() };
const relay = (event) => (_e, value) => {
  for (const cb of listeners[event])
    try {
      cb(value);
    } catch {}
};
ipcRenderer.on('charles-module:language', relay('language'));
// v0.8.8: the user changed Slime's colour or accessories
ipcRenderer.on('charles-module:slime-look', relay('slime-look'));

contextBridge.exposeInMainWorld('charlesModule', {
  apiVersion: 1,
  // Charles Download API; host restricts this capability to the download module.
  download: {
    state: () => call('download.state'),
    inspect: (url) => call('download.inspect', { url }),
    enqueue: (options) => call('download.enqueue', options),
    control: (id, action) => call('download.control', { id, action }),
    settings: (options) => call('download.settings', options),
    clipboard: () => call('download.clipboard'),
    folder: () => call('download.folder'),
    chooseFolder: () => call('download.chooseFolder'),
    reveal: (id) => call('download.reveal', { id }),
    open: () => call('download.open'),
    hide: () => call('download.hide'),
  },
  info: () => call('info'),
  ai: {
    // onChunk (optional) is called once with the whole answer; streaming may come later.
    // v0.8.7: images (optional) are paths inside the module's own data folder, e.g.
    // images: ['courses/k1/sources/s9.png'] (png, jpg, jpeg, webp). Check
    // (await charles.info()).features?.includes('ai.images') before using them.
    chat: async (options = {}) => {
      const { onChunk, images, ...rest } = options || {};
      if (images !== undefined && images !== null) rest.images = Array.isArray(images) ? images.map((p) => String(p)) : images;
      const text = await call('ai.chat', rest);
      if (typeof onChunk === 'function') onChunk(text);
      return text;
    },
    image: (options = {}) => call('ai.image', { prompt: options && options.prompt }),
  },
  storage: {
    getJSON: (path, fallback = null) => call('storage.getJSON', { path, fallback }),
    setJSON: (path, value) => call('storage.setJSON', { path, value }),
    listFiles: (path = '') => call('storage.listFiles', { path }),
    readFile: (path, options = {}) => call('storage.readFile', { path, encoding: options.encoding }),
    writeFile: (path, data, options = {}) => call('storage.writeFile', { path, data, encoding: options.encoding }),
    deleteFile: (path) => call('storage.deleteFile', { path }),
  },
  voice: {
    speak: (text) => call('voice.speak', { text }),
    stop: () => call('voice.stop'),
  },
  slime: {
    emote: (name) => call('slime.emote', { name }),
    // v0.8.8 (features: slime.look / slime.react / slime.wear)
    look: () => call('slime.look'),
    react: (name) => call('slime.react', { name }),
    // { hat, eyes, other } while the module is open ("appearance" permission); null takes it off
    wear: (accessories) => call('slime.wear', { accessories: accessories === undefined ? null : accessories }),
  },
  // v0.9.12 ("files" permission): Windows' own Save / Open window, only right after a click or
  // a key press in the module. files.save → { saved, name, size } (never the full path);
  // files.pick → { picked, files: [{ name, size, data }] }.
  files: {
    save: (options = {}) => {
      if (!navigator.userActivation?.isActive)
        return Promise.reject(new Error('Kaydetme yalnızca bir düğmeye basınca yapılabilir.'));
      return call('files.save', options || {});
    },
    pick: (options = {}) => {
      if (!navigator.userActivation?.isActive)
        return Promise.reject(new Error('Dosya seçme yalnızca bir düğmeye basınca yapılabilir.'));
      return call('files.pick', options || {});
    },
  },
  // v1.0.2 ("folders" permission): user-granted folders with atomic writes, SHA-256 optimistic lock, Recycle Bin only.
  folders: {
    pick: (options = {}) => {
      if (!navigator.userActivation?.isActive)
        return Promise.reject(new Error('Klasör seçme yalnızca bir düğmeye basınca yapılabilir.'));
      return call('folders.pick', options || {});
    },
    relink: (id, options = {}) => {
      if (!navigator.userActivation?.isActive)
        return Promise.reject(new Error('Klasör seçme yalnızca bir düğmeye basınca yapılabilir.'));
      return call('folders.relink', { id, ...(options || {}) });
    },
    granted: () => call('folders.granted'),
    forget: (id) => call('folders.forget', { id }),
    stat: (id, path = '') => call('folders.stat', { id, path }),
    scan: (id, options = {}) => call('folders.scan', { id, ...(options || {}) }),
    read: (id, path, options = {}) => call('folders.read', { id, path, encoding: options && options.encoding }),
    readMany: (id, paths, options = {}) => call('folders.readMany', { id, paths, encoding: options && options.encoding }),
    write: (id, path, data, options = {}) => {
      const payload = { id, path, data, encoding: options && options.encoding, mkdirs: options && options.mkdirs };
      if (options && Object.prototype.hasOwnProperty.call(options, 'expectSha256') && options.expectSha256 !== undefined)
        payload.expectSha256 = options.expectSha256;
      return call('folders.write', payload);
    },
    mkdir: (id, path) => call('folders.mkdir', { id, path }),
    move: (id, from, to, options = {}) => call('folders.move', { id, from, to, overwrite: !!(options && options.overwrite === true) }),
    trash: (id, path) => call('folders.trash', { id, path }),
  },
  notify: (text) => call('notify', { text }),
  on: (event, cb) => {
    if (!listeners[event] || typeof cb !== 'function') throw new Error('Desteklenen olaylar: language, slime-look');
    listeners[event].add(cb);
    return () => listeners[event].delete(cb);
  },
});
