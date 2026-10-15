// Screen-area capture overlay ("şuna bak").
const { BrowserWindow, desktopCapturer, screen, ipcMain } = require('electron');
const path = require('node:path');
class Capture {
  constructor(root, main, onImage) {
    this.root = root;
    this.main = main;
    this.onImage = onImage;
    this.busy = false;
    this.overlay = null;
  }
  async start() {
    if (this.busy) return;
    this.busy = true;
    let timeout;
    let handler;
    try {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      this.main.hide();
      await new Promise((r) => setTimeout(r, 160));
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor),
        },
      });
      const source =
        sources.find((s) => s.display_id === String(display.id)) ||
        (sources.length === 1 ? sources[0] : null);
      if (!source || source.thumbnail.isEmpty()) throw Error('Ekran görüntüsü alınamadı.');
      const shot = source.thumbnail;
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
          preload: path.join(__dirname, 'capture-preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      this.overlay = overlay;
      overlay.setMenuBarVisibility(false);
      overlay.setAlwaysOnTop(true, 'screen-saver');
      const selection = new Promise((resolve) => {
        handler = (event, rect) => {
          if (event.sender === overlay.webContents) resolve(rect);
        };
        ipcMain.on('capture-selection', handler);
        overlay.once('closed', () => resolve(null));
        timeout = setTimeout(() => resolve(null), 60000);
      });
      ipcMain.handle('capture-get-image', (event) => {
        if (event.sender !== overlay.webContents) throw Error('Geçersiz pencere.');
        return shot.toDataURL();
      });
      await overlay.loadURL('charles://app/capture.html');
      overlay.setBounds(display.bounds);
      overlay.show();
      overlay.focus();
      const r = await selection;
      if (
        r &&
        [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
        r.width >= 8 &&
        r.height >= 8
      ) {
        const size = shot.getSize(),
          sx = size.width / display.size.width,
          sy = size.height / display.size.height;
        const x = Math.max(0, Math.min(size.width - 1, Math.round(r.x * sx))),
          y = Math.max(0, Math.min(size.height - 1, Math.round(r.y * sy)));
        const width = Math.min(size.width - x, Math.round(r.width * sx)),
          height = Math.min(size.height - y, Math.round(r.height * sy));
        if (width > 0 && height > 0) await this.onImage(shot.crop({ x, y, width, height }).toPNG());
      }
    } finally {
      ipcMain.removeHandler('capture-get-image');
      clearTimeout(timeout);
      if (handler) ipcMain.removeListener('capture-selection', handler);
      if (this.overlay && !this.overlay.isDestroyed()) this.overlay.destroy();
      this.overlay = null;
      this.busy = false;
      if (!this.main.isDestroyed()) {
        this.main.show();
        this.main.focus();
      }
    }
  }
  stop() {
    this.overlay?.close();
  }
}
module.exports = { Capture };
