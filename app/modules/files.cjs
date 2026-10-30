// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.12: files.save and files.pick for modules ("files" permission).
//
// A module can save a file to the user's computer and read files the user picks, but only through
// Windows' own Save / Open windows: the user chooses what and where every time, the module never
// learns a full path and never sees any other file. Saved content comes from the module itself
// (text / bytes), from its own data folder (one file), or as a zip that Charles builds from its
// data folder. Executable types are refused, also when the user changes the extension in the
// window; files are written atomically (temporary file, then rename).
const fs = require('node:fs');
const path = require('node:path');
const { FORBIDDEN } = require('./package.cjs');

const LIMITS = {
  saveBytes: 200 * 1024 * 1024, // what one files.save may write
  zipFiles: 5000, // files in one zip
  pickFiles: 20, // files in one files.pick
  pickBytes: 200 * 1024 * 1024, // all picked files together
};
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const EXT = /^[a-z0-9]{1,12}$/i;

/** A suggested file name: a name only (no folders, no "..", no characters Windows refuses). */
function cleanName(value, fallback = 'dosya.txt') {
  let name = String(value ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 120);
  if (!name || name === '.' || name === '..' || /^\.+$/.test(name)) name = fallback;
  const base = name.replace(/\..*$/, '');
  if (RESERVED.test(base) || RESERVED.test(name)) name = '_' + name;
  if (FORBIDDEN.test(name)) throw Error('Bu dosya türü kaydedilemez (çalıştırılabilir dosya).');
  return name;
}

/** [{ name, extensions: ['zip'] }] → checked filters for the Save / Open window. */
function cleanFilters(filters, name = '') {
  const out = [];
  if (Array.isArray(filters))
    for (const f of filters.slice(0, 8)) {
      const extensions = Array.isArray(f?.extensions)
        ? f.extensions.map((e) => String(e).replace(/^\*?\./, '')).filter((e) => e === '*' || EXT.test(e)).slice(0, 12)
        : [];
      if (!extensions.length) continue;
      if (extensions.some((e) => e !== '*' && FORBIDDEN.test('x.' + e))) throw Error('Bu dosya türü kaydedilemez (çalıştırılabilir dosya).');
      out.push({ name: String(f?.name || extensions.join(', ')).slice(0, 60), extensions });
    }
  const ext = /\.([a-z0-9]{1,12})$/i.exec(name)?.[1];
  if (!out.length && ext) out.push({ name: ext.toUpperCase(), extensions: [ext] });
  out.push({ name: 'Tüm dosyalar', extensions: ['*'] });
  return out;
}

function toBytes(data, encoding) {
  if (typeof data === 'string') return Buffer.from(data, encoding === 'base64' ? 'base64' : 'utf8');
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  throw Error('“data” metin, base64 ya da Uint8Array olmalı.');
}

/** The bytes of a files.save call: data | from (one data-folder file) | zip (data-folder paths). */
function buildBytes(storage, args = {}, limits = LIMITS) {
  const given = ['data', 'from', 'zip'].filter((k) => args[k] !== undefined && args[k] !== null);
  if (given.length !== 1) throw Error('files.save için içeriği tek bir yoldan ver: data, from ya da zip.');
  let bytes;
  if (given[0] === 'data') bytes = toBytes(args.data, args.encoding);
  else if (given[0] === 'from') {
    const abs = storage.resolve(String(args.from));
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch {
      throw Error('Dosya bulunamadı: ' + String(args.from).slice(0, 120));
    }
    if (!st.isFile()) throw Error('“from” modülün veri klasöründe bir dosya olmalı.');
    if (st.size > limits.saveBytes) throw Error('Dosya çok büyük (en fazla 200 MB).');
    bytes = fs.readFileSync(abs);
  } else {
    const list = Array.isArray(args.zip) ? args.zip : [args.zip];
    if (!list.length || list.length > 100) throw Error('“zip” 1–100 yol içeren bir liste olmalı.');
    const root = args.zipRoot ? String(args.zipRoot).replace(/\\/g, '/').replace(/^\/+/, '') : '';
    const files = {};
    let count = 0,
      total = 0;
    const add = (abs) => {
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) return; // never follows a link out of the data folder
      if (st.isDirectory()) {
        for (const e of fs.readdirSync(abs)) if (!e.includes('.tmp-')) add(path.join(abs, e));
        return;
      }
      if (!st.isFile()) return;
      if (++count > limits.zipFiles) throw Error('Zip’e en fazla 5000 dosya konabilir.');
      total += st.size;
      if (total > limits.saveBytes) throw Error('Zip çok büyük (en fazla 200 MB).');
      let rel = path.relative(storage.dir, abs).split(path.sep).join('/');
      if (root && rel.startsWith(root.replace(/\/?$/, '/'))) rel = rel.slice(root.replace(/\/?$/, '/').length);
      if (rel) files[rel] = [new Uint8Array(fs.readFileSync(abs)), { level: /\.(png|jpe?g|webp|gif|zip|gz|mp3|mp4|ogg|wav|woff2?)$/i.test(rel) ? 0 : 6 }];
    };
    for (const p of list) {
      const rel = String(p ?? '').replace(/\/+$/, '');
      const abs = storage.resolve(rel);
      if (!fs.existsSync(abs)) throw Error('Bulunamadı: ' + rel.slice(0, 120));
      add(abs);
    }
    if (!count) throw Error('Zip’e konacak dosya yok.');
    bytes = Buffer.from(require('fflate').zipSync(files));
  }
  if (bytes.length > limits.saveBytes) throw Error('Kaydedilecek içerik çok büyük (en fazla 200 MB).');
  return bytes;
}

/** Writes atomically next to the target (temporary file, then rename). */
function writeAtomic(file, bytes) {
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, bytes);
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
    throw e;
  }
}

/** files.save: the Save window, then the write. `dialog` is Electron's (or a test double). */
async function saveFile({ storage, args = {}, dialog, win, moduleName, downloads, limits = LIMITS }) {
  const bytes = buildBytes(storage, args, limits);
  const suggested = cleanName(args.name, args.zip ? 'paket.zip' : 'dosya.txt');
  const r = await dialog.showSaveDialog(win, {
    title: args.title ? String(args.title).slice(0, 80) : `“${moduleName}” modülü bir dosya kaydetmek istiyor`,
    defaultPath: path.join(downloads, suggested),
    filters: cleanFilters(args.filters, suggested),
    properties: ['showOverwriteConfirmation', 'createDirectory'],
  });
  if (r.canceled || !r.filePath) return { saved: false };
  const file = path.resolve(r.filePath);
  // the user may have typed another extension in the window
  if (FORBIDDEN.test(file) || RESERVED.test(path.basename(file).replace(/\..*$/, ''))) throw Error('Bu dosya türü kaydedilemez.');
  writeAtomic(file, bytes);
  return { saved: true, name: path.basename(file), size: bytes.length, file };
}

/** files.pick: the Open window; the picked files' names and contents (never their paths). */
async function pickFiles({ args = {}, dialog, win, moduleName, limits = LIMITS }) {
  const encoding = ['binary', 'utf8', 'base64'].includes(args.encoding) ? args.encoding : 'binary';
  const r = await dialog.showOpenDialog(win, {
    title: args.title ? String(args.title).slice(0, 80) : `“${moduleName}” modülü bir dosya açmak istiyor`,
    filters: Array.isArray(args.filters) ? cleanFilters(args.filters) : undefined,
    properties: ['openFile', ...(args.multiple ? ['multiSelections'] : [])],
  });
  if (r.canceled || !r.filePaths?.length) return { picked: false, files: [] };
  if (r.filePaths.length > limits.pickFiles) throw Error('En fazla 20 dosya seçilebilir.');
  let total = 0;
  const files = r.filePaths.map((p) => {
    const st = fs.statSync(p);
    if (!st.isFile()) throw Error('Yalnızca dosya seçilebilir.');
    total += st.size;
    if (total > limits.pickBytes) throw Error('Seçilen dosyalar çok büyük (toplam en fazla 200 MB).');
    const buf = fs.readFileSync(p);
    return {
      name: path.basename(p),
      size: buf.length,
      data: encoding === 'utf8' ? buf.toString('utf8') : encoding === 'base64' ? buf.toString('base64') : new Uint8Array(buf),
    };
  });
  return { picked: true, files };
}

module.exports = { cleanName, cleanFilters, buildBytes, saveFile, pickFiles, writeAtomic, LIMITS };
