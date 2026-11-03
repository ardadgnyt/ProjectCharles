// v0.9.14: the screen colour picker overlay — a magnifier follows the pointer; a click sends the
// pixel's colour to Charles, Esc or a right click cancels.
const screenCanvas = document.getElementById('screen'), sctx = screenCanvas.getContext('2d', { willReadFrequently: true });
const zoom = document.getElementById('zoom'), zctx = zoom.getContext('2d');
const loupe = document.getElementById('loupe'), hexLabel = document.getElementById('hex'), swatch = document.getElementById('swatch');
const CELLS = 11, CELL = zoom.width / CELLS;
let ready = false, scale = 1, last = null;
// the hint in the island's language
const HINT = {
  en: 'Click the spot whose color you want · Esc to cancel',
  de: 'Klicke auf die Stelle, deren Farbe du willst · Esc zum Abbrechen',
  fr: 'Clique sur l’endroit dont tu veux la couleur · Échap pour annuler',
  es: 'Haz clic en el punto cuyo color quieres · Esc para cancelar',
  zh: '点击你想要取色的位置 · 按 Esc 取消',
};
const lang = new URLSearchParams(location.search).get('lang');
if (HINT[lang]) document.querySelector('aside').textContent = HINT[lang];
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
window.picker.image().then((shot) => {
  const { width, height } = shot;
  const src = new Uint8Array(shot.data.buffer || shot.data, shot.data.byteOffset || 0, width * height * 4);
  const out = new ImageData(width, height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = src[i + 2];
    d[i + 1] = src[i + 1];
    d[i + 2] = src[i];
    d[i + 3] = 255;
  }
  screenCanvas.width = width;
  screenCanvas.height = height;
  sctx.putImageData(out, 0, 0);
  scale = width / innerWidth;
  ready = true;
}).catch(() => { document.querySelector('aside').textContent = 'Ekran okunamadı. Esc ile kapatıp tekrar dene.'; });
function at(e) {
  const x = Math.max(0, Math.min(screenCanvas.width - 1, Math.floor(e.clientX * scale)));
  const y = Math.max(0, Math.min(screenCanvas.height - 1, Math.floor(e.clientY * scale)));
  return { x, y };
}
function paint(e) {
  if (!ready) return;
  const p = at(e);
  const half = (CELLS - 1) / 2;
  zctx.imageSmoothingEnabled = false;
  zctx.fillStyle = '#111';
  zctx.fillRect(0, 0, zoom.width, zoom.height);
  zctx.drawImage(screenCanvas, p.x - half, p.y - half, CELLS, CELLS, 0, 0, zoom.width, zoom.height);
  zctx.strokeStyle = 'rgba(255,255,255,.9)';
  zctx.lineWidth = 2;
  zctx.strokeRect(half * CELL, half * CELL, CELL, CELL);
  const d = sctx.getImageData(p.x, p.y, 1, 1).data;
  last = { r: d[0], g: d[1], b: d[2] };
  hexLabel.textContent = hex(d[0], d[1], d[2]);
  swatch.style.background = hexLabel.textContent;
  const w = 132, gap = 22;
  let left = e.clientX + gap, top = e.clientY + gap;
  if (left + w > innerWidth) left = e.clientX - gap - w;
  if (top + w + 40 > innerHeight) top = e.clientY - gap - w - 36;
  loupe.style.transform = `translate(${left}px, ${top}px)`;
  loupe.style.display = 'flex';
}
document.addEventListener('pointermove', paint);
document.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (e.button === 2) return window.picker.finish(null);
  if (e.button !== 0 || !ready) return;
  paint(e);
  window.picker.finish(last);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.picker.finish(null); });
