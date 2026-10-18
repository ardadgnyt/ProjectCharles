#!/usr/bin/env node
// v0.8.0: npm run module:pack <folder> [out.zip]
// Checks a module folder exactly like Charles does when installing it, then zips it.
const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');
const { readFolder } = require('../app/modules/package.cjs');

const [dir, outArg] = process.argv.slice(2);
if (!dir) {
  console.error('Kullanım: npm run module:pack <modül klasörü> [çıktı.zip]');
  process.exit(1);
}
try {
  const { manifest, files } = readFolder(path.resolve(dir));
  const out = path.resolve(outArg || `${manifest.id}-${manifest.version}.zip`);
  const entries = {};
  for (const [name, data] of files) entries[name] = [new Uint8Array(data), { level: /\.(png|jpe?g|webp|gif|woff2?|mp3|ogg|mp4|webm|zip)$/i.test(name) ? 0 : 9 }];
  fs.writeFileSync(out, zipSync(entries));
  const size = fs.statSync(out).size;
  console.log(`${manifest.name} v${manifest.version}: ${files.size} dosya → ${out} (${(size / 1024).toFixed(1)} KB)`);
} catch (e) {
  console.error('Paket oluşturulmadı: ' + e.message);
  process.exit(1);
}
