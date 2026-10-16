// v0.7.5 Beta: black and cream theme, modern Spotify controls on the island
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('noir theme is loaded after the special styles', () => {
  const html = read('public/index.html');
  assert.ok(html.indexOf('styles/10-noir.css') > html.indexOf('styles/9-special.css'));
});

test('noir theme keeps the island slightly see-through', () => {
  const css = read('public/styles/10-noir.css');
  const m = css.match(/rgba\(0, 0, 0, (0\.\d+)\) 100%/);
  assert.ok(m && Number(m[1]) < 1);
  assert.match(css, /--sb-accent: #eed2b2/);
});

test('island Spotify buttons are flat icons without circles', () => {
  const css = read('public/styles/10-noir.css');
  assert.doesNotMatch(css, /#music-play[^{]*\{[^}]*border-radius: 50%/);
  for (const id of ['previous', 'next', 'play', 'pause']) assert.match(css, new RegExp(`#music-${id} \\{\\s*--icon:`));
});

test('app window title bar matches the black theme', () => {
  assert.match(read('app/main.cjs'), /titleBarOverlay: \{ color: '#010101'/);
  assert.match(read('package.json'), /"version": "0\.7\.5-beta\.1"/);
});
