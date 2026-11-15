// Builds the renderer: copies public/ into a clean dist/ and bundles src/renderer.ts.
// v1.0.0 (perf2, P9): the page bundle is minified and pure ASCII (so Chromium keeps its source as a
// one-byte string); the German, French, Spanish and Chinese tables are dist/lang/<code>.js, loaded
// only for the language in use; KaTeX is dist/katex.js, loaded on the first formula. No source map
// is written: the app never reads one and page errors are not logged with stacks.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { Script } from 'node:vm';

// CHARLES_BUILD_OUT: a test copy of dist/ (unit tests, .qa); the launcher and helper are built only for dist/
const OUT = process.env.CHARLES_BUILD_OUT || 'dist';
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp('public', OUT, { recursive: true });
// v0.9.9: the version under "Charles" always comes from package.json (0.9.9-beta.1 → v0.9.9
// Beta, 1.0.0 → v1.0.0 Stable), so a forgotten edit in public/index.html can no longer ship an old number.
{
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const [, num, tag] = /^(\d+\.\d+\.\d+)(?:-([a-z]+))?/i.exec(version) || [];
  const label = 'v' + num + (tag === 'rc' ? ' Release Candidate' : tag ? ' ' + tag[0].toUpperCase() + tag.slice(1) : ' Stable');
  const html = readFileSync(OUT + '/index.html', 'utf8');
  const next = html.replace(/(<small class="version-label">)[^<]*(<\/small>)/, `$1${label}$2`);
  if (next === html && !html.includes(label)) throw Error('version-label not found in index.html');
  writeFileSync(OUT + '/index.html', next);
}

// The four language tables: src/settings/lang/*.ts stay the source; each becomes dist/lang/<code>.js.
const TABLES = { de: 'german', fr: 'french', es: 'spanish', zh: 'chinese' };
await mkdir(OUT + '/lang', { recursive: true });
for (const [code, name] of Object.entries(TABLES)) {
  const r = await build({ entryPoints: [`src/settings/lang/${code}.ts`], bundle: true, format: 'cjs', platform: 'neutral', write: false, logLevel: 'silent', tsconfigRaw: {} });
  const m = { exports: {} };
  new Function('module', 'exports', r.outputFiles[0].text)(m, m.exports);
  const table = m.exports[name];
  if (!table || typeof table !== 'object' || Object.keys(table).length < 100) throw Error(`src/settings/lang/${code}.ts: no ${name} table`);
  // a script for loadLanguage() in i18n.ts; JSON.parse of a string is the fastest way to make it
  const text = `charlesLanguageTable(${JSON.stringify(code)},JSON.parse(${JSON.stringify(JSON.stringify(table))}));\n`;
  writeFileSync(`${OUT}/lang/${code}.js`, asciiOnly(text, `lang/${code}.js`));
}
// In the page bundle the tables are empty (i18n.ts loads the file) and KaTeX is the on-demand loader.
const pageOnly = {
  name: 'charles-page-only',
  setup(b) {
    b.onResolve({ filter: /^\.\/lang\/(de|fr|es|zh)$/ }, (a) =>
      /[\\/]src[\\/]settings[\\/]i18n\.ts$/.test(a.importer) ? { path: a.path, namespace: 'charles-lang' } : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: 'charles-lang' }, () => ({
      contents: Object.values(TABLES).map((n) => `export const ${n} = undefined;`).join('\n'),
      loader: 'js',
    }));
    b.onResolve({ filter: /^\.\/katex-source$/ }, (a) =>
      /[\\/]src[\\/]chat[\\/]math\.ts$/.test(a.importer) ? { path: a.resolveDir + '/katex-lazy.ts' } : undefined,
    );
  },
};
// esbuild writes strings as ASCII escapes but leaves regular expressions (Turkish patterns) as they
// are; one such character makes Chromium keep the whole script as a two-byte string. \uXXXX means
// the same character inside a regular expression (and in a legal comment it is only text).
function asciiOnly(code, file) {
  let out = '';
  let last = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    if (c < 0x80) continue;
    if (code[i - 1] === '\\') throw Error(`${file}: a non-ASCII character after a backslash at ${i}`);
    out += code.slice(last, i) + '\\u' + c.toString(16).padStart(4, '0');
    last = i + 1;
  }
  out += code.slice(last);
  new Script(out, { filename: file }); // still valid JavaScript
  return out;
}
async function bundle(options, file) {
  const r = await build({ ...options, bundle: true, platform: 'browser', target: 'chrome140', minify: true, sourcemap: false, write: false, logLevel: 'warning', tsconfigRaw: {} });
  writeFileSync(file, asciiOnly(r.outputFiles[0].text, file));
}
await bundle({ entryPoints: ['./src/renderer.ts'], plugins: [pageOnly] }, OUT + '/renderer.js');
await bundle({ stdin: { contents: "export { default } from 'katex';", resolveDir: '.', loader: 'js' }, format: 'iife', globalName: 'charlesKatex' }, OUT + '/katex.js');
// v0.8.8: Charles' Slime for module windows (served at charles-module://<id>/_charles/slime.js)
await build({
  entryPoints: ['./src/module-kit/slime-kit.ts'],
  outfile: OUT + '/module-kit/slime.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome140',
  minify: true,
  legalComments: 'inline',
  sourcemap: false,
  tsconfigRaw: {},
});
if (process.platform === 'win32' && OUT === 'dist') {
  const { execFileSync } = await import('node:child_process');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-launcher.ps1'], { stdio: 'inherit', windowsHide: true });
  // v0.9.20: the helper is rebuilt when its source changed; the same source gives the same program
  const { existsSync, statSync } = await import('node:fs');
  const helper = 'app/system/charles-helper.exe';
  if (!existsSync(helper) || statSync(helper).mtimeMs < statSync('setup/CharlesHelper.cs').mtimeMs)
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-helper.ps1'], { stdio: 'inherit', windowsHide: true });
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
