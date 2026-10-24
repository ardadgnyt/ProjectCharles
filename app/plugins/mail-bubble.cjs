// Notification bubbles shown just below the Charles island.
//
// Important mail (and calendar reminders) appear here instead of Windows toasts.
// The bubbles live in their own small transparent window so they never disturb the
// panel's own layout and animation. The window never takes focus; a click on a
// bubble asks Charles to explain that item, the × removes it.
const path = require('node:path');
const { BrowserWindow, ipcMain, screen } = require('electron');

const WIDTH = 380;
const MAX_VISIBLE = 3;
const GAP = 8;

class MailBubble {
  // anchor(): { x, y, width, height } of the visible island in screen coordinates.
  // onOpen(item): called when the user clicks a bubble.
  // onWhatsApp(action, args): v0.8.8 WhatsApp cards (reply, quick replies, open the chat…).
  constructor({ anchor, onOpen, onWhatsApp = null, language = () => 'tr' }) {
    this.anchor = anchor;
    this.language = language;
    this.onOpen = onOpen;
    this.onWhatsApp = onWhatsApp;
    this.items = [];
    this.height = 0;
    this.window = null;
    this.ready = null;
    this.suppressed = false;
    // v0.8.13: what the user closed stays closed. A closed mail / reminder never comes back;
    // a closed WhatsApp chat comes back only with a newer message (not for its photo or the
    // group's name arriving a moment later).
    this.dismissed = new Map();
    const own = (event) => this.window && event.sender === this.window.webContents;
    ipcMain.on('bubble-open', (event, id) => {
      if (!own(event)) return;
      const item = this.items.find((i) => i.id === id);
      if (!item) return;
      this.remove(id);
      this.onOpen(item);
    });
    ipcMain.on('bubble-dismiss', (event, id) => {
      if (own(event)) this.dismiss(id);
    });
    // v0.8.8: WhatsApp cards. "focus" lets the card take the keyboard while a reply is typed
    // (the bubble window never takes focus otherwise).
    ipcMain.handle('bubble-wa', async (event, action, args) => {
      if (!own(event)) return { ok: false, error: 'Geçersiz pencere.' };
      try {
        if (action === 'focus') {
          const w = this.window;
          w.setFocusable(!!args?.on);
          if (args?.on) w.focus();
          else w.blur();
          return { ok: true, value: true };
        }
        if (!this.onWhatsApp) throw Error('WhatsApp kapalı.');
        return { ok: true, value: await this.onWhatsApp(String(action), args || {}) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    ipcMain.on('bubble-size', (event, height) => {
      if (!own(event) || !Number.isFinite(height)) return;
      this.height = Math.max(0, Math.min(600, Math.round(height)));
      this.place();
    });
  }

  // item: { id, kind, title, from, reason, date }
  add(item) {
    if (!item?.id || this.items.some((i) => i.id === item.id) || this.dismissed.has(item.id)) return;
    this.items.unshift({ ...item, at: Date.now() });
    this.items = this.items.slice(0, 12);
    // v0.8.14: notices with a lifetime (a module's) close by themselves
    const ttl = Number(item.ttl);
    if (ttl > 0) setTimeout(() => this.remove(item.id), Math.min(ttl, 10 * 60000)).unref?.();
    void this.render();
  }

  /** v0.8.8: adds or replaces an item (a WhatsApp chat's card) and moves it to the top. */
  // v0.8.13: { update: true } only refreshes a card still on screen (a photo, a group name, a
  // reply sent) and never brings back one the user closed.
  upsert(item, { update = false } = {}) {
    if (!item?.id) return;
    const present = this.items.some((i) => i.id === item.id);
    if (update && !present) return;
    const closed = this.dismissed.get(item.id);
    if (closed && !present) {
      // a WhatsApp card carries the id of the chat's last message: only a new one reopens it
      if (!item.last || item.last === closed.last) return;
      this.dismissed.delete(item.id);
    }
    this.items = [{ ...item, at: Date.now() }, ...this.items.filter((i) => i.id !== item.id)].slice(0, 12);
    void this.render();
  }

  remove(id) {
    if (!this.items.some((i) => i.id === id)) return;
    this.items = this.items.filter((i) => i.id !== id);
    void this.render();
  }

  /** v0.8.13: the user's × (or "close all"): removed and remembered as closed. */
  dismiss(id) {
    id = String(id || '');
    if (!id) return;
    const item = this.items.find((i) => i.id === id);
    this.dismissed.set(id, { time: Date.now(), last: item?.last || null });
    if (this.dismissed.size > 500) this.dismissed.delete(this.dismissed.keys().next().value);
    this.remove(id);
  }

  // Hide while the desktop pet, a plugin guide or screen capture owns the screen.
  suppress(value) {
    this.suppressed = !!value;
    this.place();
  }

  async ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.ready;
    this.window = new BrowserWindow({
      width: WIDTH,
      height: 120,
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      show: false,
      backgroundColor: '#00000000',
      title: 'Charles · Bildirim',
      webPreferences: {
        preload: path.join(__dirname, 'bubble-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    // v0.8.13: the same level as a pinned island, and raised above it, so the island's larger
    // see-through surface never sits over a card and takes its clicks
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (e) => e.preventDefault());
    this.window.on('closed', () => {
      this.window = null;
      this.ready = null;
    });
    this.ready = this.window.loadURL('charles://app/bubble.html');
    return this.ready;
  }

  async render() {
    if (!this.items.length) {
      this.height = 0;
      this.place();
      return;
    }
    await this.ensureWindow();
    if (!this.window || this.window.isDestroyed()) return;
    // WhatsApp chats share one card (v0.8.8), the rest are bubbles as before
    const wa = this.items.filter((i) => i.kind === 'whatsapp');
    const rest = this.items.filter((i) => i.kind !== 'whatsapp');
    this.window.webContents.send('bubble-items', {
      items: rest.slice(0, MAX_VISIBLE),
      more: Math.max(0, rest.length - MAX_VISIBLE),
      wa,
      language: String(this.language() || 'tr'),
    });
  }

  // Keeps the bubbles centred under the island; flips above it near the screen bottom.
  place() {
    const w = this.window;
    if (!w || w.isDestroyed()) return;
    if (!this.items.length || !this.height || this.suppressed) {
      if (w.isVisible()) w.hide();
      return;
    }
    const a = this.anchor();
    if (!a) return;
    const area = screen.getDisplayNearestPoint({ x: a.x + a.width / 2, y: a.y }).workArea;
    const width = Math.min(WIDTH, area.width);
    let x = Math.round(a.x + (a.width - width) / 2);
    x = Math.max(area.x, Math.min(area.x + area.width - width, x));
    let y = a.y + a.height + GAP;
    if (y + this.height > area.y + area.height) y = Math.max(area.y, a.y - this.height - GAP);
    w.setBounds({ x, y: Math.round(y), width, height: this.height });
    if (!w.isVisible()) w.showInactive();
    w.moveTop();
  }

  /** v0.8.13: keeps the cards above the island (called after the island raises itself). */
  raise() {
    const w = this.window;
    if (w && !w.isDestroyed() && w.isVisible()) w.moveTop();
  }

  /** v0.8.14: raises the card window once each time the pointer comes onto it. */
  hover(point) {
    const over = this.contains(point);
    if (over && !this.hovered) {
      const w = this.window;
      try {
        w.setIgnoreMouseEvents(false);
        w.setAlwaysOnTop(true, 'screen-saver');
        w.moveTop();
      } catch {}
    }
    this.hovered = over;
  }

  /** v0.8.13: whether a screen point is over the visible cards. */
  contains(point) {
    const w = this.window;
    if (!w || w.isDestroyed() || !w.isVisible() || !point) return false;
    const b = w.getBounds();
    return point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height;
  }

  destroy() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }
}

module.exports = { MailBubble };
