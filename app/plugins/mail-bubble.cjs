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
// v1.0.0 (perffix P4): the card window's page process (~25 MB private, ~105 MB working set) used to
// stay for good after the first card. It closes this long after the last card has gone;
// ensureWindow() opens it again for the next one.
const CLOSE_AFTER = 150000;

/** v1.0.0 (perffix P4): whether the empty card window may be destroyed now. Never while a card is
 *  listed (shown, or held back by the full-screen guard, a focus session or a suppression), while a
 *  WhatsApp reply is being written, while a card action is still running, or while it is on screen. */
function mayCloseCards({ items = 0, composing = false, actions = 0, visible = false } = {}) {
  return items === 0 && !composing && actions === 0 && !visible;
}

// v1.0.4: the ipcMain listeners of the MailBubble that is in use (one per process). A second
// MailBubble (a test, a restart of the plugin code) takes them over instead of adding a second set.
let listening = null;
/** A card window that can still be used (a half-made or stand-in window counts as gone). */
function alive(w) {
  try {
    return !!w && !w.isDestroyed();
  } catch {
    return false;
  }
}

/**
 * v0.9.18: where the cards go. Under the island when they fit there; a panel too tall for that used
 * to send them on top of itself, and a window on the same topmost band as the focused panel stays
 * behind it, so only the sound got through. Now beside the panel, above it, and over it only as the
 * last choice. { corner: true } is the app window: its top right corner, under the title bar.
 */
function bubbleSpot(a, area, width, height, gap = GAP) {
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  if (a.corner) return { x: Math.max(area.x, a.x + a.width - width - 16), y: Math.min(a.y + 60, Math.max(area.y, bottom - height)) };
  const middle = Math.max(area.x, Math.min(right - width, Math.round(a.x + (a.width - width) / 2)));
  if (a.y + a.height + gap + height <= bottom) return { x: middle, y: a.y + a.height + gap };
  const top = Math.max(area.y, Math.min(a.y, bottom - height));
  if (a.x + a.width + gap + width <= right) return { x: a.x + a.width + gap, y: top };
  if (a.x - gap - width >= area.x) return { x: a.x - gap - width, y: top };
  if (a.y - gap - height >= area.y) return { x: middle, y: a.y - gap - height };
  return { x: middle, y: area.y };
}

class MailBubble {
  // anchor(): { x, y, width, height } of the visible island in screen coordinates.
  // onOpen(item): called when the user clicks a bubble.
  // onWhatsApp(action, args): v0.8.8 WhatsApp cards (reply, quick replies, open the chat…).
  // onDismiss(id): v1.0.0 (bughunt) the user closed a card (main.cjs drops what waited for it).
  constructor({ anchor, onOpen, onWhatsApp = null, onDismiss = null, language = () => 'tr', palette = () => 'cream', fullscreen = () => false, fullscreenFront = null }) {
    this.anchor = anchor;
    this.onDismiss = onDismiss;
    this.fullscreen = fullscreen;
    this.fullscreenFront = fullscreenFront;
    this.language = language;
    this.palette = palette;
    this.onOpen = onOpen;
    this.onWhatsApp = onWhatsApp;
    this.items = [];
    this.height = 0;
    this.window = null;
    this.ready = null;
    this.suppressed = false;
    this.held = false;
    this.composing = false;
    this.composingAt = 0;
    // v1.0.4: `focusable` is what the cards want, `nativeFocusable` what the window is. They differ
    // only while the window is on screen and still activatable after a reply (see setWindowFocusable).
    this.focusable = false;
    this.nativeFocusable = false;
    // v1.0.4: the card window has no taskbar button since the last show (see offTaskbar)
    this.offBar = false;
    this.hovered = false;
    this.needsRender = false;
    this.rendering = false;
    this.renderSeq = 0;
    this.crashTimes = [];
    this.actions = 0;
    this.closeTimer = null;
    this.closeAfter = CLOSE_AFTER;
    // v1.0.4: the lifetime timers of cards with a `ttl`, by id (cleared when the card goes)
    this.ttlTimers = new Map();
    // v0.8.13: what the user closed stays closed. A closed mail / reminder never comes back;
    // a closed WhatsApp chat comes back only with a newer message (not for its photo or the
    // group's name arriving a moment later).
    this.dismissed = new Map();
    const own = (event) => this.window && event.sender === this.window.webContents;
    const listeners = {
      'bubble-open': (event, id) => {
        if (own(event)) this.open(id);
      },
      'bubble-dismiss': (event, id) => {
        if (own(event)) this.dismiss(id);
      },
      // v0.9.21: a card that asks something (item.choices); only the choices it offered are accepted
      'bubble-choice': (event, id, choice) => {
        if (!own(event)) return;
        const item = this.items.find((i) => i.id === id);
        if (!item?.choices?.some((c) => c.id === choice)) return;
        this.remove(id);
        this.onChoice?.(item, choice);
      },
      'bubble-size': (event, height) => {
        if (!own(event) || !Number.isFinite(height)) return;
        this.height = Math.max(0, Math.min(600, Math.round(height)));
        this.place();
      },
    };
    // v1.0.4: one set of listeners per process (a second MailBubble takes them over)
    if (listening) listening.release();
    for (const [name, fn] of Object.entries(listeners)) ipcMain.on(name, fn);
    // v0.8.8: WhatsApp cards. "focus" lets the card take the keyboard while a reply is typed
    // (the bubble window stays non-focusable WS_EX_NOACTIVATE otherwise so routine notifications
    // never steal focus from games or other apps).
    ipcMain.handle('bubble-wa', async (event, action, args) => {
      if (!own(event)) return { ok: false, error: 'Geçersiz pencere.' };
      try {
        if (action === 'focus') {
          const w = this.window;
          const on = !!args?.on && !this.isFullscreen();
          this.composing = on;
          this.composingAt = on ? Date.now() : 0;
          if (w && !w.isDestroyed()) {
            // setFocusable(true) gives the window a taskbar button again: off at once
            if (this.setWindowFocusable(on)) {
              w.setSkipTaskbar(true);
              this.offBar = true;
            }
            if (on) {
              w.setIgnoreMouseEvents(false);
              w.setAlwaysOnTop(true, 'screen-saver');
              w.moveTop();
              w.focus();
              w.webContents?.focus?.();
            }
          }
          return { ok: true, value: on };
        }
        if (!this.onWhatsApp) throw Error('WhatsApp kapalı.');
        this.actions++;
        try {
          return { ok: true, value: await this.onWhatsApp(String(action), args || {}) };
        } finally {
          this.actions--;
        }
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    listening = {
      owner: this,
      release: () => {
        for (const [name, fn] of Object.entries(listeners)) ipcMain.removeListener?.(name, fn);
        try {
          ipcMain.removeHandler?.('bubble-wa');
        } catch {}
        if (listening?.owner === this) listening = null;
      },
    };
  }

  /**
   * v1.0.4: a click on a card (its action). The card goes first, so a second press, the click after
   * the press or a × that follows find nothing and the action runs once. A failing action never
   * stays silent and never blocks the next card: `onOpenFailed(item, error)` says so.
   */
  open(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;
    this.remove(id);
    this.actions++;
    let result;
    try {
      result = this.onOpen(item);
    } catch (e) {
      result = Promise.reject(e);
    }
    Promise.resolve(result)
      .catch((e) => {
        try {
          this.onOpenFailed?.(item, e);
        } catch {}
      })
      .finally(() => {
        this.actions = Math.max(0, this.actions - 1);
      });
    return true;
  }

  // item: { id, kind, title, from, reason, date }
  add(item) {
    if (!item?.id || this.items.some((i) => i.id === item.id) || this.dismissed.has(item.id)) return;
    this.items.unshift({ ...item, at: Date.now() });
    this.trim();
    // v0.8.14: notices with a lifetime (a module's) close by themselves
    // v1.0.4: the timer is kept and cleared when the card goes before it (×, a click, replaced)
    const ttl = Number(item.ttl);
    if (ttl > 0) {
      const timer = setTimeout(() => {
        if (this.ttlTimers.get(item.id) === timer) this.ttlTimers.delete(item.id);
        this.remove(item.id);
      }, Math.min(ttl, 10 * 60000));
      timer.unref?.();
      this.ttlTimers.set(item.id, timer);
    }
    void this.render();
  }

  /** v1.0.4: at most 12 cards; the lifetime timer of one that falls off goes with it. */
  trim() {
    if (this.items.length <= 12) return;
    for (const i of this.items.slice(12)) this.clearTtl(i.id);
    this.items = this.items.slice(0, 12);
  }

  clearTtl(id) {
    const timer = this.ttlTimers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.ttlTimers.delete(id);
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
    this.items = [{ ...item, at: Date.now() }, ...this.items.filter((i) => i.id !== item.id)];
    this.trim();
    void this.render();
  }

  /**
   * v1.0.3: only call Electron setFocusable when the state actually changes.
   * v1.0.4: and never setFocusable(false) on a card window that is on screen. Electron then calls
   * Focus(false), Chromium's HWNDMessageHandler::Deactivate(), which hands the foreground to the
   * next visible window below the card (::SetForegroundWindow), whatever it is and also when the
   * card is not the active window. Right after the user clicked the island that took the focus away
   * from the island again and its blur timer folded the chat that had just been opened. Now:
   *  - a hidden window flips at once (Focus(false) does nothing for a hidden window);
   *  - a window on screen that has the focus stays activatable until it loses it (blur);
   *  - a window on screen without the focus flips while it is hidden for that moment.
   * Returns true when the window was made focusable now (Electron gave it a taskbar button).
   */
  setWindowFocusable(on) {
    const next = !!on;
    this.focusable = next;
    const w = this.window;
    if (!alive(w)) {
      this.nativeFocusable = false;
      return false;
    }
    if (next) {
      if (this.nativeFocusable) return false;
      this.nativeFocusable = true;
      try {
        w.setFocusable?.(true);
      } catch {}
      this.offBar = false;
      return true;
    }
    this.settleFocusable();
    return false;
  }

  /** v1.0.4: brings the window to `focusable` when that cannot move the foreground (see above). */
  settleFocusable() {
    const w = this.window;
    if (this.focusable || !this.nativeFocusable || !alive(w)) return;
    let visible = false;
    let focused = false;
    try {
      visible = w.isVisible();
      focused = !!w.isFocused?.();
    } catch {}
    if (visible && focused) return; // after its blur
    try {
      if (visible) w.hide();
      w.setFocusable?.(false);
      this.nativeFocusable = false;
      this.offBar = false;
      // back on screen only when the cards are still meant to be there
      if (visible && this.shown()) {
        w.showInactive();
        w.moveTop();
      }
    } catch {}
  }

  /** v1.0.4: whether the cards are meant to be on screen now (placeCards shows them then). */
  shown() {
    return !!this.items.length && !!this.height && !this.suppressed && !this.held && !this.isFullscreen();
  }

  /** v1.0.3: clears any stuck WhatsApp compose / hover state (e.g. when user opens Island chat). */
  cancelCompose() {
    this.composing = false;
    this.composingAt = 0;
    this.hovered = false;
    this.setWindowFocusable(false);
  }

  /** v1.0.4: hides the card window; a pending flip to non-focusable happens while it is hidden. */
  hideWindow() {
    const w = this.window;
    if (!alive(w)) return;
    try {
      if (w.isVisible()) w.hide();
    } catch {}
    this.settleFocusable();
  }

  remove(id) {
    this.clearTtl(id);
    if (!this.items.some((i) => i.id === id)) return;
    this.items = this.items.filter((i) => i.id !== id);
    if (!this.items.length) {
      this.height = 0;
      // hidden first: the flip back to non-focusable then happens off screen
      this.hideWindow();
      this.cancelCompose();
    }
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
    try {
      this.onDismiss?.(id);
    } catch {}
  }

  /** v0.9.14: a focus session with "Bildirimleri sustur": the cards wait until it ends. */
  hold(value) {
    this.held = !!value;
    this.place();
  }

  // Hide while the desktop pet, a plugin guide or screen capture owns the screen.
  suppress(value) {
    this.suppressed = !!value;
    this.place();
  }

  /** True when a full-screen program is active on Charles' display or in front on any display. */
  isFullscreen() {
    return Boolean(this.fullscreen?.() || this.fullscreenFront?.());
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
    this.focusable = false;
    this.nativeFocusable = false;
    // v0.8.13: the same level as a pinned island, and raised above it, so the island's larger
    // see-through surface never sits over a card and takes its clicks
    if (!this.isFullscreen()) this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setSkipTaskbar(true);
    this.offBar = false; // Windows may add a button when it is shown: taken off on 'show'
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (e) => e.preventDefault());
    const recoverDeadWindow = () => {
      if (this.window !== w) return;
      this.window = null;
      this.ready = null;
      this.wordsSent = null;
      this.composing = false;
      this.composingAt = 0;
      this.hovered = false;
      this.focusable = false;
      this.nativeFocusable = false;
      this.height = 0;
      try {
        if (!w.isDestroyed()) w.destroy();
      } catch {}
      const now = Date.now();
      this.crashTimes = [...this.crashTimes.filter((t) => now - t < 120000), now];
      if (this.items.length && this.crashTimes.length <= 3) {
        setTimeout(() => {
          if (this.items.length) void this.render();
        }, 500).unref?.();
      }
    };
    const w = this.window;
    w.webContents.on('render-process-gone', (_e, details) => {
      if (details?.reason === 'clean-exit') return;
      recoverDeadWindow();
    });
    w.on('unresponsive', () => recoverDeadWindow());
    // v1.0.4: the card lost the focus (the user clicked the island or another program). It becomes
    // non-activatable again only after this event, outside Windows' activation change, and while it
    // is hidden for that moment (setWindowFocusable): never with Focus(false) on a visible window.
    w.on('blur', () => {
      this.composing = false;
      this.composingAt = 0;
      this.focusable = false;
      setImmediate(() => {
        if (this.window === w && !w.isDestroyed()) this.settleFocusable();
      });
    });
    // v1.0.4: Windows can give a window a taskbar button when it is shown; taken off once per show
    w.on('show', () => {
      this.offBar = false;
      this.offTaskbar();
    });
    w.on('closed', () => {
      if (this.window === w) {
        this.window = null;
        this.ready = null;
        this.wordsSent = null;
        this.composing = false;
        this.composingAt = 0;
        this.hovered = false;
        this.focusable = false;
        this.nativeFocusable = false;
      }
    });
    // v1.0.0 (bughunt): a page that failed to load is not kept: its window goes and the next card
    // event makes a new one (one try per event; a rejected `ready` used to fail every later card)
    this.ready = w.loadURL('charles://app/bubble.html').catch((e) => {
      if (this.window === w) {
        this.window = null;
        this.ready = null;
        this.wordsSent = null;
      }
      if (!w.isDestroyed()) w.destroy();
      throw e;
    });
    return this.ready;
  }

  /** v1.0.0 (perffix P4): one timer from the moment the last card goes; a new card cancels it. */
  closeLater() {
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
    if (!this.window || this.window.isDestroyed()) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      const w = this.window;
      if (!w || w.isDestroyed()) return;
      const state = { items: this.items.length, composing: this.composing, actions: this.actions, visible: w.isVisible() };
      if (mayCloseCards(state)) w.destroy();
      // a reply being written or an action still running: ask again later (a card coming back
      // cancels this through render())
      else if (!state.items) this.closeLater();
    }, this.closeAfter);
    this.closeTimer.unref?.();
  }

  async render() {
    const seq = ++this.renderSeq;
    if (!this.items.length) {
      this.height = 0;
      this.needsRender = false;
      this.place(); // hides the window (and settles its focusability off screen)
      this.cancelCompose();
      this.closeLater();
      return;
    }
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
    if (this.isFullscreen()) {
      this.needsRender = true;
      this.place();
      this.cancelCompose();
      return;
    }
    this.needsRender = false;
    try {
      await this.ensureWindow();
    } catch {
      return; // the next card event tries again (see ensureWindow)
    }
    if (seq !== this.renderSeq || !this.items.length) return;
    if (!this.window || this.window.isDestroyed()) return;
    // WhatsApp chats share one card (v0.8.8), the rest are bubbles as before
    const wa = this.items.filter((i) => i.kind === 'whatsapp');
    if (!wa.length && this.composing) {
      this.composing = false;
      this.composingAt = 0;
      this.setWindowFocusable(false);
    }
    const rest = this.items.filter((i) => i.kind !== 'whatsapp');
    const language = String(this.language() || 'tr');
    const palette = String(this.palette?.() || 'cream');
    this.window.webContents.send('bubble-items', {
      items: rest.slice(0, MAX_VISIBLE),
      more: Math.max(0, rest.length - MAX_VISIBLE),
      wa,
      language,
      palette,
      // v1.0.0: the card texts of this language (notice-text.cjs); the page keeps no table
      words: language === this.wordsSent ? null : require('./notice-text.cjs').words(language),
    });
    this.wordsSent = language;
  }

  /** v0.9.19: where the cards are now, or null when none is on screen. */
  box() {
    const w = this.window;
    return w && !w.isDestroyed() && w.isVisible() ? w.getBounds() : null;
  }

  place() {
    this.placeCards();
    this.onPlaced?.();
  }

  // Keeps the bubbles centred under the island; flips above it near the screen bottom.
  placeCards() {
    const w = this.window;
    // v0.9.25: never over a full-screen app (a game, a film): a topmost card brought the taskbar
    // back over YouTube/Netflix and dropped a game to the desktop. The cards wait for its end.
    const full = this.isFullscreen();
    if (!this.items.length || this.suppressed || this.held || full) {
      // hidden first, so a reply's focusable window flips back off screen (no Focus(false))
      this.hideWindow();
      this.cancelCompose();
      return;
    }
    if (this.needsRender || !w || w.isDestroyed()) {
      if (!this.rendering) {
        this.rendering = true;
        void this.render().finally(() => {
          this.rendering = false;
        });
      }
      return;
    }
    if (!this.height) {
      this.hideWindow();
      return;
    }
    const a = this.anchor();
    if (!a) return;
    const area = screen.getDisplayNearestPoint({ x: a.x + a.width / 2, y: a.y }).workArea;
    const width = Math.min(WIDTH, area.width);
    const spot = bubbleSpot(a, area, width, this.height);
    w.setBounds({ x: Math.round(spot.x), y: Math.round(spot.y), width, height: this.height });
    if (!this.composing) this.setWindowFocusable(false);
    w.setIgnoreMouseEvents(false);
    w.setAlwaysOnTop(true, 'screen-saver');
    if (!w.isVisible()) w.showInactive();
    // v1.0.4: after the show (Windows adds a button when a window is shown), and only when needed
    this.offTaskbar();
    w.moveTop();
  }

  /** v0.8.13: keeps the cards above the island (called after the island raises itself). */
  raise() {
    const w = this.window;
    if (this.fullscreen?.()) return;
    if (this.fullscreenFront?.()) return;
    if (w && !w.isDestroyed() && w.isVisible()) {
      try {
        w.setIgnoreMouseEvents(false);
        w.setAlwaysOnTop(true, 'screen-saver');
        w.moveTop();
      } catch {}
    }
  }

  /** v0.9.0: the cards never have a taskbar button.
   *  v1.0.4: ITaskbarList (CoCreateInstance + HrInit + DeleteTab on every call) is asked again only
   *  after the window was shown or made focusable since the last time, or with `force` (main.cjs's
   *  slow pass: offTaskbarAgain), and never while a full-screen program is in front. */
  offTaskbar() {
    return this.dropTaskbarButton(false);
  }

  offTaskbarAgain() {
    return this.dropTaskbarButton(true);
  }

  dropTaskbarButton(force) {
    const w = this.window;
    if (!w || w.isDestroyed()) return false;
    if ((this.offBar && !force) || this.fullscreenFront?.()) return false;
    w.setSkipTaskbar(true);
    this.offBar = true;
    return true;
  }

  /** v0.9.2 / v1.0.3: whether the user is actively typing/focused in the bubble window.
   *  Auto-clears stale composing flag if focus was refused or blur was missed.
   *  v1.0.4: "hovered" counts only while the pointer really is on the cards (a hover flag left
   *  behind when the cursor watcher paused kept the island from folding and from taking the focus). */
  active() {
    const w = this.window;
    if (!w || w.isDestroyed() || !w.isVisible()) {
      this.composing = false;
      this.hovered = false;
      return false;
    }
    const focused = !!w.isFocused?.();
    if (this.composing && !focused && Date.now() - this.composingAt > 1200) {
      this.composing = false;
      this.composingAt = 0;
      this.setWindowFocusable(false);
    }
    if (this.hovered) {
      let point = null;
      try {
        point = screen.getCursorScreenPoint?.() || null;
      } catch {}
      if (point && !this.contains(point)) this.hovered = false;
    }
    return Boolean(this.composing || this.hovered || focused);
  }

  /** v0.8.14 / v0.9.2: keeps the card window interactive and above the island whenever the pointer is on it. */
  hover(point) {
    if (this.isFullscreen()) {
      this.hovered = false;
      return;
    }
    const over = this.contains(point);
    if (over && !this.hovered) {
      const w = this.window;
      // v1.0.4: no focusability change here (the pointer is arriving: a flip would hide the card
      // under it for a moment); a pending one was settled when the card lost the focus
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
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
    for (const timer of this.ttlTimers.values()) clearTimeout(timer);
    this.ttlTimers.clear();
    if (listening?.owner === this) listening.release();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }
}

module.exports = { MailBubble, bubbleSpot, mayCloseCards, CLOSE_AFTER };
