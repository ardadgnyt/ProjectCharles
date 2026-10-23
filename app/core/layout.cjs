// Island bounds on screen for its states and docking side.
//
// v0.8.10: the island has three open sizes —
//   notch  (closed): a small 380 × 68 strip at the top edge,
//   shelf  (open home page): the 1180 × 284 card shelf,
//   chat   (open chat): the chat panel, growing down from the island.
// `hidden` is the thin strip the island slides into when it is not used.
const NOTCH = { width: 380, height: 68 };
const SHELF = { width: 1180, height: 284 };
const CHAT_WIDTH = 620;

function size({ expanded, hidden, chat = true, height, scale = 1 }) {
  if (hidden) return { width: 240, height: 6 };
  if (!expanded) return NOTCH;
  if (!chat) return SHELF;
  return { width: Math.round(CHAT_WIDTH * scale), height };
}

function bounds(area, { expanded, hidden, side, height, scale = 1, chat = true }) {
  const s = size({ expanded, hidden, chat, height, scale });
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
module.exports = { bounds, surfaceBounds, NOTCH, SHELF };
