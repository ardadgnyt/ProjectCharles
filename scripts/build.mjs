// Builds the renderer: copies public/ into a clean dist/ and bundles src/renderer.ts.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({
  entryPoints: ['./src/renderer.ts'],
  outfile: 'dist/renderer.js',
  bundle: true,
  platform: 'browser',
  target: 'chrome140',
  sourcemap: false,
  tsconfigRaw: {},
});
console.log('Masaüstü arayüzü hazır.');

// Bundle the first-party Download UI; no runtime npm dependencies.
const { existsSync, copyFileSync, mkdirSync } = await import('node:fs');
const { execFileSync } = await import('node:child_process');
if (existsSync('modules/download/scripts/build.cjs')) {
  execFileSync(process.execPath, ['scripts/build.cjs'], { cwd: 'modules/download', stdio: 'inherit', windowsHide: true });
  execFileSync(process.execPath, ['scripts/pack.mjs'], { cwd: 'modules/download', stdio: 'inherit', windowsHide: true });
  mkdirSync('modules-bundled', { recursive: true });
  copyFileSync('modules/download/download-1.0.0.zip', 'modules-bundled/download-1.0.0.zip');
}
