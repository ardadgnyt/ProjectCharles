// v0.6.0: Slime is the character; no old character name or upstream branding left in the project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Personal } = require('../app/personal/personal.cjs');
const { fromDesignTest } = require('../app/personal/slime-migrate.cjs');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'models', 'tools', 'licenses']);

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(ts|cjs|js|mjs|css|html|md|json|cmd|vbs|ps1|py)$/.test(e.name)) yield p;
  }
}

test('the old character name and upstream branding are gone from the project files', () => {
  const found = [];
  for (const p of files(ROOT)) {
    if (p.endsWith('package-lock.json') || p.endsWith('v060.test.cjs')) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (/mochi|coucou|notch ?-?buddy/i.test(text)) found.push(path.relative(ROOT, p));
  }
  assert.deepEqual(found, []);
  assert.match(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
});

test('the Slime look chosen in the Design Test build is taken over once', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-060-'));
  fs.mkdirSync(path.join(appData, 'Charles Design Test'));
  fs.writeFileSync(
    path.join(appData, 'Charles Design Test', 'personal.json'),
    JSON.stringify({ slime: 'slime:purple:1', outfit: 'fedora' }),
  );
  const dir = path.join(appData, 'Charles');
  fs.mkdirSync(dir);
  const p = new Personal(dir);
  assert.equal(fromDesignTest(appData, p), true);
  assert.equal(p.data.slime, 'slime:purple:1');
  assert.equal(p.data.outfit, 'fedora');
  p.edit('slime', { value: 'slime:white:0' });
  assert.equal(fromDesignTest(appData, p), false);
  assert.equal(p.data.slime, 'slime:white:0');
  fs.rmSync(appData, { recursive: true, force: true });
});

test('slime look values round-trip', () => {
  const esbuild = require('esbuild');
  const src = fs.readFileSync(path.join(ROOT, 'src/vendor/slime/shape.ts'), 'utf8');
  const m = { exports: {} };
  new Function(
    'module',
    'exports',
    esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code,
  )(m, m.exports);
  const { parseLook, lookValue, SLIME_COLOR_IDS } = m.exports;
  assert.equal(SLIME_COLOR_IDS.length, 7);
  assert.deepEqual(parseLook('slime:purple:1'), { color: 'purple', mustache: true });
  assert.deepEqual(parseLook('garbage'), { color: 'green', mustache: false });
  assert.equal(lookValue({ color: 'yellow', mustache: false }), 'slime:yellow:0');
});

test('app icon: a valid .ico with PNG images is built for every size', () => {
  const { icoFrom } = require('../app/core/app-icon.cjs');
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const ico = icoFrom([
    { size: 16, data: png },
    { size: 256, data: png },
  ]);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico.readUInt8(6), 16);
  assert.equal(ico.readUInt8(6 + 16), 0); // 256 is written as 0
  assert.equal(ico.readUInt32LE(6 + 12), 6 + 32);
  assert.equal(ico.length, 6 + 32 + 16);
});

test('sounds are switched on once for the new v0.6.0 sounds, then stay the user’s choice', () => {
  const { Extras } = require('../app/core/extras.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-snd-'));
  fs.writeFileSync(path.join(dir, 'display.json'), JSON.stringify({ sound: false, volume: 0 }));
  const enc = { isEncryptionAvailable: () => false };
  const a = new Extras(dir, enc);
  assert.equal(a.prefs.sound, true);
  assert.equal(a.prefs.volume, 0.12);
  a.settings({ ...a.settings(), sound: false });
  const b = new Extras(dir, enc);
  assert.equal(b.prefs.sound, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
