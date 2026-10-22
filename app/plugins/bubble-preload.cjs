// Bridge for the notification bubble window (public/bubble.html). Only these calls exist.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bubble', {
  onItems: (cb) => ipcRenderer.on('bubble-items', (_e, value) => cb(value)),
  open: (id) => ipcRenderer.send('bubble-open', String(id)),
  dismiss: (id) => ipcRenderer.send('bubble-dismiss', String(id)),
  resize: (height) => ipcRenderer.send('bubble-size', Number(height)),
  // v0.8.8: WhatsApp cards
  wa: async (action, args) => {
    const r = await ipcRenderer.invoke('bubble-wa', String(action), args || {});
    if (!r || !r.ok) throw new Error((r && r.error) || 'WhatsApp işlemi başarısız.');
    return r.value;
  },
});
