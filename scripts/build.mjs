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
