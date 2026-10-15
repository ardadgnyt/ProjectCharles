// v0.6.0: the app icon (tray, taskbar, shortcuts) is drawn in the user's Slime colour.
// A hidden Slime is drawn once per colour change and handed to the main process.
import { BotEngine } from '../vendor/slime/engine';
import type { SlimeColor } from '../vendor/slime/shape';

let last = '';

export function slimeIcon(color: SlimeColor): string {
  const size = 420;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const e = new BotEngine();
  e.interruptGreet();
  e.look = { color, mustache: false };
  for (let i = 0; i < 30; i++) e.update(1 / 60);
  Object.assign(e, { yaw: 0, pitch: 0, tgYaw: 0, tgPitch: 0, ox: 0, oy: 0, tilt: 0, roll: 0 });
  ctx.save();
  ctx.scale(size / 240, size / 240);
  e.draw(ctx, 240, 240);
  ctx.restore();
  // Crop to the drawn Slime (plus a small margin) and make it square.
  const data = ctx.getImageData(0, 0, size, size).data;
  let x0 = size,
    y0 = size,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (data[(y * size + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 <= x0 || y1 <= y0) return canvas.toDataURL('image/png');
  const side = Math.max(x1 - x0, y1 - y0) * 1.06;
  const out = document.createElement('canvas');
  out.width = 256;
  out.height = 256;
  const o = out.getContext('2d')!;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  o.drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, 256, 256);
  return out.toDataURL('image/png');
}

export function updateAppIcon(api: any, color: SlimeColor, attempt = 0) {
  if (color === last) return;
  let url = '';
  try {
    url = slimeIcon(color);
  } catch {
    return;
  }
  void Promise.resolve(api.appIcon(url))
    .then(() => {
      last = color;
    })
    .catch(() => {
      // The main process may not be ready yet right after start: try again shortly.
      if (attempt < 5) setTimeout(() => updateAppIcon(api, color, attempt + 1), 2000);
    });
}
