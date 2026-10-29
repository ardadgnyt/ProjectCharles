// Builds the renderer: copies public/ into a clean dist/ and bundles src/renderer.ts.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
// v0.9.9: the version under "Charles" always comes from package.json (0.9.9-beta.1 → v0.9.9
// Beta), so a forgotten edit in public/index.html can no longer ship an old number.
{
  const { readFileSync, writeFileSync } = await import('node:fs');
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const [, num, tag] = /^(\d+\.\d+\.\d+)(?:-([a-z]+))?/i.exec(version) || [];
  const label = 'v' + num + (tag ? ' ' + tag[0].toUpperCase() + tag.slice(1) : '');
  const html = readFileSync('dist/index.html', 'utf8');
  const next = html.replace(/(<small class="version-label">)[^<]*(<\/small>)/, `$1${label}$2`);
  if (next === html && !html.includes(label)) throw Error('version-label not found in index.html');
  writeFileSync('dist/index.html', next);
}
await build({
  entryPoints: ['./src/renderer.ts'],
  outfile: 'dist/renderer.js',
  bundle: true,
  platform: 'browser',
  target: 'chrome140',
  sourcemap: false,
  tsconfigRaw: {},
});
// v0.8.8: Charles' Slime for module windows (served at charles-module://<id>/_charles/slime.js)
await build({
  entryPoints: ['./src/module-kit/slime-kit.ts'],
  outfile: 'dist/module-kit/slime.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome140',
  minify: true,
  legalComments: 'inline',
  sourcemap: false,
  tsconfigRaw: {},
});
if (process.platform === 'win32') {
  const { execFileSync } = await import('node:child_process');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-launcher.ps1'], { stdio: 'inherit', windowsHide: true });
}
console.log('Masaüstü arayüzü hazır.');

// Bundle the first-party Download UI; no runtime npm dependencies.
const { existsSync, copyFileSync, mkdirSync } = await import('node:fs');
const { execFileSync } = await import('node:child_process');
if (process.argv.includes('--with-download') && existsSync('modules/download/scripts/build.cjs')) {
  execFileSync(process.execPath, ['scripts/build.cjs'], { cwd: 'modules/download', stdio: 'inherit', windowsHide: true });
  execFileSync(process.execPath, ['scripts/pack.mjs'], { cwd: 'modules/download', stdio: 'inherit', windowsHide: true });
  mkdirSync('modules-bundled', { recursive: true });
  copyFileSync('modules/download/download-1.0.0.zip', 'modules-bundled/download-1.0.0.zip');
}
