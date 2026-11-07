// Island bounds on screen for its states and docking side.
//
// v0.8.10: the island has three open sizes —
//   notch  (closed): Slime and the music controls while something plays (380 × 66);
//          v0.8.13: with nothing playing the closed island is the hidden strip (no Slime-only
//          notch any more),
//   shelf  (open home page): the card shelf (v0.8.11: 740 × 170),
//   chat   (open chat): the chat panel, growing down from the island.
// `hidden` is the thin strip the island slides into when it is not used.
const NOTCH = { width: 380, height: 66 };
const HIDDEN = { width: 240, height: 6 };
const SHELF = { width: 640, height: 220 };
// v0.9.13: the home page grows when one of its panels (Dosyalar, AI kullanımı, Hava durumu)
// opens; the page measures itself and sends the height (clamped here).
const SHELF_MIN = 220;
const SHELF_MAX = 640;
const shelfSize = (h) => ({ width: SHELF.width, height: Math.round(Math.min(SHELF_MAX, Math.max(SHELF_MIN, Number(h) || SHELF.height))) });
const CHAT_WIDTH = 620;
// v0.9.20: Ayarlar → Görünüm → Charles adacık boyutu. Both sizes come from the same base numbers,
// so changing back and forth never adds up.
// v0.9.24: it is the whole island: closed, its card shelf and the tall chat. Only the closed
// island shrank before, and that is on screen only while music plays, so with nothing playing the
// choice seemed to do nothing. The app window, Charles' own window and module windows stay as they are.
const ISLAND_SMALL = 2 / 3;
// The width stays even: a centred island with an odd one sits on half a pixel, and the desktop showed
// through thin lines between its tiles.
const fit = (s, island) => (island === 1 ? s : { width: 2 * Math.round((s.width * island) / 2), height: Math.round(s.height * island) });

function size({ expanded, hidden, chat = true, height, scale = 1, music = true, shelf, island = 1 }) {
  if (hidden) return fit(HIDDEN, island);
  if (!expanded) return fit(music ? NOTCH : HIDDEN, island);
  if (!chat) return fit(shelfSize(shelf), island);
  return fit({ width: Math.round(CHAT_WIDTH * scale), height }, island);
}

function bounds(area, { expanded, hidden, side, height, scale = 1, chat = true, music = true, shelf, island = 1 }) {
  const s = size({ expanded, hidden, chat, height, scale, music, shelf, island });
  const width = Math.min(s.width, area.width);
  return {
    x: Math.round(
      side === 'right'
        ? area.x + area.width - width
        : side === 'left'
          ? area.x
          : area.x + (area.width - width) / 2,
    ),
    y: area.y,
    width,
    height: Math.min(s.height, area.height),
  };
}

/** The transparent native surface: large enough for every state, so it never has to move. */
function surfaceBounds(area, { side, height, scale = 1 }) {
  const chat = bounds(area, { expanded: true, hidden: false, side, height, scale, chat: true });
  // the tallest home page, so opening a panel never moves the native window
  const shelf = bounds(area, { expanded: true, hidden: false, side, height, chat: false, shelf: SHELF_MAX });
  const width = Math.max(chat.width, shelf.width);
  return {
    x: Math.round(side === 'right' ? area.x + area.width - width : side === 'left' ? area.x : area.x + (area.width - width) / 2),
    y: area.y,
    width,
    height: Math.max(chat.height, shelf.height),
  };
}
module.exports = { bounds, surfaceBounds, shelfSize, NOTCH, HIDDEN, SHELF, SHELF_MIN, SHELF_MAX, ISLAND_SMALL };
