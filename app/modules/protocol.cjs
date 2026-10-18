// v0.8.0: charles-module://<id>/<file> — serves only that module's own files (and, under
// /_data/, files from its own data folder), with a strict Content-Security-Policy.
const fs = require('node:fs');
const path = require('node:path');

const CSP = [
  "default-src 'self' charles-module:",
  "script-src 'self' charles-module:",
  "style-src 'self' 'unsafe-inline' charles-module:",
  "img-src 'self' data: blob: charles-module:",
  "media-src 'self' data: blob: charles-module:",
  "font-src 'self' data: charles-module:",
  "connect-src 'self' charles-module:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob: charles-module:",
  "form-action 'none'",
].join('; ');

const MIME = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
};
const mimeOf = (file) => MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';

/**
 * A request URL → { file, mime } inside the module's folder, or { status } (403/404).
 * roots(id) → { files, data } absolute folders, or null for an unknown / turned off module.
 */
function resolveRequest(url, roots) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { status: 400 };
  }
  if (u.protocol !== 'charles-module:') return { status: 403 };
  const r = roots(u.hostname);
  if (!r) return { status: 404 };
  let rel;
  try {
    rel = decodeURIComponent(u.pathname);
  } catch {
    return { status: 400 };
  }
  if (rel.includes('\0') || rel.includes('\\')) return { status: 403 };
  let base = r.files;
  if (rel === '/_data' || rel.startsWith('/_data/')) {
    base = r.data;
    rel = rel.slice('/_data'.length);
  }
  if (rel === '/' || rel === '') rel = '/' + (r.entry || 'index.html');
  const file = path.resolve(base, '.' + rel);
  const back = path.relative(base, file);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) return { status: 403 };
  try {
    // a link inside the folder must not point outside it
    const real = fs.realpathSync(file);
    const realBase = fs.realpathSync(base);
    const rr = path.relative(realBase, real);
    if (rr.startsWith('..') || path.isAbsolute(rr)) return { status: 403 };
    if (!fs.statSync(real).isFile()) return { status: 404 };
    return { file: real, mime: mimeOf(real) };
  } catch {
    return { status: 404 };
  }
}

function headers(mime) {
  return {
    'Content-Type': mime,
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
}

module.exports = { resolveRequest, headers, CSP, MIME, mimeOf };
