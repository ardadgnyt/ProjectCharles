'use strict';
// v0.9.26: what the big picture view does with a picture: add it to the message box, copy it,
// save a copy. The format comes from the picture's own bytes, so a file's name, extension and
// contents always agree; names are made safe for Windows. Nothing here moves or changes a source.
const path = require('node:path');

const MAX_DATA_URL = 80e6; // ~60 MB of picture
const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** 'png' | 'jpg' | 'gif' | 'webp' from the first bytes, or null. */
function sniff(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.slice(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (bytes.slice(0, 4).toString('latin1') === 'RIFF' && bytes.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** A data URL → { ext, mime, bytes } of a real PNG/JPEG/GIF/WebP. Throws otherwise. */
function imageData(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
    typeof dataUrl === 'string' && dataUrl.length < MAX_DATA_URL ? dataUrl : '',
  );
  if (!m) throw Error('Görsel okunamadı.');
  const bytes = Buffer.from(m[2], 'base64');
  const ext = sniff(bytes);
  if (!ext) throw Error('Görsel okunamadı.');
  return { ext, mime: MIME[ext], bytes };
}

/** A file name Windows accepts, without folders, ending in the picture's real extension. */
function safeName(name, ext, fallback = 'Charles-gorsel') {
  let base = path.basename(String(name || '')).replace(/\.(png|jpe?g|gif|webp|bmp|tiff?)$/i, '');
  base = base
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = fallback;
  return base + '.' + ext;
}

/** The path the user chose in the save dialog, with the real extension kept. */
function withExtension(file, ext) {
  const current = path.extname(file).slice(1).toLowerCase();
  const same = current === ext || (ext === 'jpg' && current === 'jpeg');
  return same ? file : file + '.' + ext;
}

module.exports = { sniff, imageData, safeName, withExtension, MIME };
