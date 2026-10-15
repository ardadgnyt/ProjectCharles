// Island bounds on screen for compact / expanded / hidden states and docking side.
function bounds(area, { expanded, hidden, side, height, scale = 1 }) {
  const width = Math.min(hidden ? 240 : expanded ? Math.round(620 * scale) : 500, area.width);
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
    height: Math.min(hidden ? 6 : expanded ? height : 126, area.height),
  };
}
module.exports = { bounds };
