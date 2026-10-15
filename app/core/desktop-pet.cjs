// Window bounds for Slime when it is dragged out onto the desktop.
// v0.6.2: the same size as the Slime studio preview (160 px) whose transparent margin may go past the screen edge, so
// the body itself can touch the edge (the body fills only the middle of the window).
const PET_SIZE = 160;
const PET_PAD = Math.round(PET_SIZE * 0.2);
function petBounds(point, area, pad = PET_PAD) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw Error('Geçersiz karakter konumu.');
  const width = PET_SIZE,
    height = PET_SIZE;
  return {
    x: 0 + Math.round(Math.max(area.x - pad, Math.min(area.x + area.width - width + pad, point.x))),
    y: 0 + Math.round(Math.max(area.y - pad, Math.min(area.y + area.height - height + pad, point.y))),
    width,
    height,
  };
}
module.exports = { petBounds, PET_SIZE, PET_PAD };
