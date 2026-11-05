// v0.9.18: the Bas-konuş indicator's only link to Charles.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dictation', {
  onState: (cb) => ipcRenderer.on('dictation-state', (_e, v) => cb(v)),
  act: (name) => ipcRenderer.send('dictation-action', name),
});
