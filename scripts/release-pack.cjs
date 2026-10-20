#!/usr/bin/env node
// v0.8.0: builds the in-place update package for GitHub Releases.
//
//   npm run release:pack                 → release/charles-update-<version>.zip (+ .sha256)
//   npm run release:pack -- <out-dir>    → the same files in <out-dir>
//   npm run release:pack -- --with tools/cursor   (also ship an extra folder; rarely needed)
//
// The zip holds only the app files: app/, dist/, public/, package.json, package-lock.json,
// LICENSE, README.md, CHANGELOG.md. Upload BOTH files to the GitHub release; Charles downloads
// the .zip, checks it against the .sha256 and swaps the files (app/core/updater.cjs).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { zipSync } = require('fflate');

const ROOT = path.resolve(__dirname, '..');
const BASE = ['Charles.exe', 'app', 'dist', 'public', 'package.json', 'package-lock.json', 'LICENSE', 'README.md', 'CHANGELOG.md', 'setup', 'scripts', 'Start-Charles.cmd', 'licenses', 'THIRD-PARTY-NOTICES.md'];
// never shipped, wherever they are
const SKIP = /(^|\/)(\.git|node_modules|_update|_to_delete|__pycache__|\.DS_Store|Thumbs\.db)(\/|$)|(^|\/)(\.env(\..*)?|Charles-creator\.json|charles-install\.json|charles-manifest\.json|personal\.json|companion\.json|charles-history\.json|preferences\.json|[^/]*\.enc\.json|[^/]*\.key|[^/]*\.pem|[^/]*\.log)$/i;

function collect(rel, out) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) return;
  const name = rel.split(path.sep).join('/');
  if (/^(modules-bundled|modules\/download|tools\/download|licenses\/download)(\/|$)/i.test(name)) return;
  if (SKIP.test(name) || ['docs/GITHUB.md', 'docs/VERIFICATION-v0.4.4.md'].includes(name)) return;
  if (st.isDirectory()) for (const f of fs.readdirSync(abs).sort()) collect(path.join(rel, f), out);
  else out.set(name, fs.readFileSync(abs));
}

function pack({ outDir = path.join(ROOT, 'release'), extra = [] } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (!fs.existsSync(path.join(ROOT, 'Charles.exe'))) throw Error('Charles.exe missing: build the release on Windows.');
  if (!fs.existsSync(path.join(ROOT, 'dist', 'renderer.js')))
    throw Error('dist/ is missing: run `npm run build` first. / dist/ yok: önce `npm run build` çalıştır.');
  for (const e of extra)
    if (!/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(e) || e.split('/').includes('..'))
      throw Error('Invalid --with path / Geçersiz --with yolu: ' + e);
  const files = new Map();
  // The installed 0.8.0 updater swaps whole top-level directories. Ship complete roots
  // even when --with names a child, so tools/download never replaces the other tools.
  for (const rel of replacementRoots([...BASE, ...extra])) collect(rel, files);
  if (!files.has('package.json')) throw Error('package.json missing / package.json yok');
  const entries = {};
  // stored without compression for files that are compressed already, deflate for the rest
  for (const [name, data] of files) entries[name] = [data, { level: /\.(png|jpe?g|webp|ico|mp3|ogg|wav|zip|woff2?|gz)$/i.test(name) ? 0 : 6, mtime: new Date('2026-01-01T00:00:00Z') }];
  const zip = zipSync(entries);
  fs.mkdirSync(outDir, { recursive: true });
  const name = `charles-update-${pkg.version}.zip`;
  const zipPath = path.join(outDir, name);
  fs.writeFileSync(zipPath, zip);
  const hash = crypto.createHash('sha256').update(zip).digest('hex');
  fs.writeFileSync(zipPath + '.sha256', `${hash}  ${name}\n`);
  return { zipPath, shaPath: zipPath + '.sha256', hash, files: files.size, bytes: zip.length, version: pkg.version };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const extra = [];
  let outDir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--with') extra.push(String(args[++i] || '').replace(/\\/g, '/').replace(/\/+$/, ''));
    else outDir = path.resolve(args[i]);
  }
  try {
    const r = pack({ outDir, extra });
    console.log(`${path.relative(process.cwd(), r.zipPath)}  (${r.files} files, ${(r.bytes / 1048576).toFixed(1)} MB)`);
    console.log(`SHA-256 ${r.hash}`);
    console.log('Upload both files to the GitHub release. / İki dosyayı da GitHub sürümüne yükle.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

function replacementRoots(paths) {
  return [...new Set(paths.map(p => p.split('/')[0]))];
}

module.exports = { pack, BASE, SKIP, replacementRoots };
