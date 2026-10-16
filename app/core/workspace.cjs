// v0.7.1 SpecialBeta: the workspace window. The same Charles window turns from the island into
// a normal app window (like the Codex and Claude desktop apps) and back. This file only does
// the geometry; app/main.cjs switches the window's behaviour.

// v0.7.4: smaller minimum so a window snapped to half (or a quarter) of a 1920 px screen fits
const MIN = { width: 760, height: 480 };
const DEFAULT = { width: 1480, height: 940 };

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/** Clamps a rectangle into the display's work area (keeps at least the minimum size). */
function fit(rect, area) {
  const width = Math.round(Math.max(Math.min(MIN.width, area.width), Math.min(rect.width, area.width)));
  const height = Math.round(Math.max(Math.min(MIN.height, area.height), Math.min(rect.height, area.height)));
  const x = Math.round(Math.min(Math.max(rect.x, area.x), area.x + area.width - width));
  const y = Math.round(Math.min(Math.max(rect.y, area.y), area.y + area.height - height));
  return { x, y, width, height };
}

/** Where the workspace opens: the saved place if it is still on this display, else centred. */
function workspaceBounds(saved, area) {
  const s = saved && typeof saved === 'object' ? saved.bounds : null;
  if (s && ['x', 'y', 'width', 'height'].every((k) => finite(s[k]))) {
    const inside =
      s.x + s.width > area.x + 80 &&
      s.x < area.x + area.width - 80 &&
      s.y >= area.y - 10 &&
      s.y < area.y + area.height - 80;
    if (inside) return fit(s, area);
  }
  const width = Math.min(DEFAULT.width, Math.round(area.width * 0.9));
  const height = Math.min(DEFAULT.height, Math.round(area.height * 0.9));
  return fit(
    {
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
      width,
      height,
    },
    area,
  );
}

/** A resize from the renderer's edge handles: start bounds + pointer movement → new bounds. */
function resized(start, edge, dx, dy, area) {
  if (!start || !['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(edge)) return null;
  if (![dx, dy].every(finite)) return null;
  let { x, y, width, height } = start;
  if (edge.includes('e')) width = Math.max(MIN.width, start.width + dx);
  if (edge.includes('s')) height = Math.max(MIN.height, start.height + dy);
  if (edge.includes('w')) {
    width = Math.max(MIN.width, start.width - dx);
    x = start.x + start.width - width;
  }
  if (edge.includes('n')) {
    height = Math.max(MIN.height, start.height - dy);
    y = start.y + start.height - height;
  }
  // never larger than the work area, never above its top edge
  width = Math.min(width, area.width);
  height = Math.min(height, area.height);
  y = Math.max(area.y, y);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

module.exports = { workspaceBounds, resized, fit, MIN };
