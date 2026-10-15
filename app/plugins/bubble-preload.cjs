// Bridge for the notification bubble window (public/bubble.html). Only these calls exist.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bubble', {
  onItems: (cb) => ipcRenderer.on('bubble-items', (_e, value) => cb(value)),
  open: (id) => ipcRenderer.send('bubble-open', String(id)),
  dismiss: (id) => ipcRenderer.send('bubble-dismiss', String(id)),
  resize: (height) => ipcRenderer.send('bubble-size', Number(height)),
});
