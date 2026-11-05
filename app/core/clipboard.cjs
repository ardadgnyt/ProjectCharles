'use strict';
// v0.9.16: the clipboard in Electron 44 is the asynchronous W3C one: readImage, writeImage,
// readBuffer and availableFormats are gone and write() takes ClipboardItems. The old calls threw
// "is not a function": Dosya Rafı's Ctrl+V and "Görseli kopyala" never worked on this Electron.
const IMAGE = /^image\/(png|jpeg|webp|gif|bmp)$/;

/** The picture on the clipboard as bytes with its type, or null. */
async function readPicture(clipboard) {
  for (const item of await clipboard.read()) {
    const types = [...item.types];
    const type = types.includes('image/png') ? 'image/png' : types.find((t) => IMAGE.test(t));
    if (!type) continue;
    const blob = await item.getType(type);
    return { type, bytes: Buffer.from(await blob.arrayBuffer()) };
  }
  return null;
}

/** The first file copied in Explorer, or ''. */
async function readCopiedFile(clipboard) {
  for (const item of await clipboard.read()) {
    if (!item.types.includes('text/uri-list')) continue;
    const list = await item.getType('text/uri-list');
    const line = String(typeof list === 'string' ? list : await list.text()).split(/\r?\n/).find((l) => /^file:/i.test(l));
    if (line) return require('node:url').fileURLToPath(line.trim());
  }
  return '';
}

function writeRich(clipboard, ClipboardItem, text, html) {
  return clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })]);
}
function writePicture(clipboard, ClipboardItem, png) {
  return clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
}

module.exports = { readPicture, readCopiedFile, writeRich, writePicture };
