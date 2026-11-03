// Bridge for the screen colour picker overlay (color-pick.cjs).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('picker', {
  image: () => ipcRenderer.invoke('color-pick-image'),
  finish: (color) => ipcRenderer.send('color-pick-done', color),
});
