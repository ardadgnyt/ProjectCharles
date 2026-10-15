// v0.6.0: the app icon in the user's Slime colour. The renderer draws the Slime
// (src/island/app-icon.ts); here it becomes the tray icon, the window/taskbar icon and the
// .ico used by the desktop and Start menu shortcuts (dist/charles.ico).
const fs = require('node:fs');
const path = require('node:path');

// A Windows .ico with PNG-compressed images (supported since Windows Vista).
function icoFrom(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

function applyIcon(dataUrl, { nativeImage, tray, win, userData, root }) {
  if (
    typeof dataUrl !== 'string' ||
    !/^data:image\/png;base64,/.test(dataUrl) ||
    dataUrl.length > 2e6
  )
    throw Error('Geçersiz simge.');
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) throw Error('Geçersiz simge.');
  tray?.setImage(image.resize({ width: 20, height: 20, quality: 'best' }));
  if (win && !win.isDestroyed()) win.setIcon(image);
  fs.writeFileSync(path.join(userData, 'app-icon.png'), image.toPNG());
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const ico = icoFrom(
    sizes.map((size) => ({
      size,
      data: image.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    })),
  );
  try {
    fs.writeFileSync(path.join(root, 'dist', 'charles.ico'), ico);
  } catch {
    // read-only install folder: the tray and taskbar still follow the colour
  }
  return true;
}

module.exports = { applyIcon, icoFrom };
