// Bridge for the screen-area selection overlay.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('selection', {
  image: () => ipcRenderer.invoke('capture-get-image'),
  finish: (rect) => ipcRenderer.send('capture-selection', rect),
});
