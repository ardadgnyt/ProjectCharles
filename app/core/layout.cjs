// Island bounds on screen for its states and docking side.
//
// v0.8.10: the island has three open sizes —
//   notch  (closed): a small strip at the top edge — v0.8.11: only Slime (124 × 62), or
//          Slime and the music controls while something plays (380 × 66),
//   shelf  (open home page): the card shelf (v0.8.11: 740 × 170),
//   chat   (open chat): the chat panel, growing down from the island.
// `hidden` is the thin strip the island slides into when it is not used.
const NOTCH = { width: 380, height: 66 };
const NOTCH_IDLE = { width: 124, height: 62 };
const SHELF = { width: 740, height: 170 };
const CHAT_WIDTH = 620;

function size({ expanded, hidden, chat = true, height, scale = 1, music = true }) {
  if (hidden) return { width: 240, height: 6 };
  if (!expanded) return music ? NOTCH : NOTCH_IDLE;
  if (!chat) return SHELF;
  return { width: Math.round(CHAT_WIDTH * scale), height };
}

function bounds(area, { expanded, hidden, side, height, scale = 1, chat = true, music = true }) {
  const s = size({ expanded, hidden, chat, height, scale, music });
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
  const shelf = bounds(area, { expanded: true, hidden: false, side, height, chat: false });
  const width = Math.max(chat.width, shelf.width);
  return {
    x: Math.round(side === 'right' ? area.x + area.width - width : side === 'left' ? area.x : area.x + (area.width - width) / 2),
    y: area.y,
    width,
    height: Math.max(chat.height, shelf.height),
  };
}
module.exports = { bounds, surfaceBounds, NOTCH, NOTCH_IDLE, SHELF };
