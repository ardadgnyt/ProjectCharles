// v0.9.14: "Ekrandan seç" for the colour picker (Araçlar → Renk seçici). Like the area capture
// (capture.cjs): the island hides, the display under the pointer is captured, and a full-screen
// overlay shows the picture with a magnifier; a click returns the pixel's colour. Nothing is
// saved: the screenshot lives only in the overlay while it is open.
const { BrowserWindow, screen, ipcMain } = require('electron');
const { grabDisplay } = require('./screen-grab.cjs');
const path = require('node:path');

const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** A colour from the overlay page, checked: { r, g, b } integers 0…255, or null. */
function cleanColor(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of ['r', 'g', 'b']) {
    const v = Number(c[k]);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    out[k] = v;
  }
  return { ...out, hex: hex(out) };
}

class ColorPick {
  constructor(main, language = () => 'tr') {
    this.main = main;
    this.language = language;
    this.busy = false;
    this.overlay = null;
  }
  async pick() {
    if (this.busy) return null;
    this.busy = true;
    let timeout, handler;
    const wasVisible = this.main.isVisible();
    try {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      this.main.hide();
      await new Promise((r) => setTimeout(r, 160));
      // v0.9.14: through GDI on Windows (correct colours with HDR on; app/system/screen-grab.cjs)
      const shot = await grabDisplay(display);
      const overlay = new BrowserWindow({
        ...display.bounds,
        frame: false,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'color-pick-preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      this.overlay = overlay;
      overlay.setMenuBarVisibility(false);
      overlay.setAlwaysOnTop(true, 'screen-saver');
      const chosen = new Promise((resolve) => {
        handler = (event, color) => {
          if (event.sender === overlay.webContents) resolve(color);
        };
        ipcMain.on('color-pick-done', handler);
        overlay.once('closed', () => resolve(null));
        timeout = setTimeout(() => resolve(null), 60000);
      });
      ipcMain.handle('color-pick-image', (event) => {
        if (event.sender !== overlay.webContents) throw Error('Geçersiz pencere.');
        // raw pixels (BGRA): no PNG to encode here and decode there
        const size = shot.getSize();
        return { width: size.width, height: size.height, data: shot.toBitmap() };
      });
      await overlay.loadURL('charles://app/colorpick.html?lang=' + encodeURIComponent(String(this.language() || 'tr')));
      overlay.setBounds(display.bounds);
      overlay.show();
      overlay.focus();
      return cleanColor(await chosen);
    } finally {
      ipcMain.removeHandler('color-pick-image');
      clearTimeout(timeout);
      if (handler) ipcMain.removeListener('color-pick-done', handler);
      if (this.overlay && !this.overlay.isDestroyed()) this.overlay.destroy();
      this.overlay = null;
      this.busy = false;
      if (wasVisible && !this.main.isDestroyed()) this.main.showInactive();
    }
  }
  stop() {
    this.overlay?.close();
  }
}
module.exports = { ColorPick, cleanColor, hex };
