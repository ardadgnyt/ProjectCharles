// v0.8.12: bug fixes on the new island — one even surface, chat header, cream bar, seek, drag.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = read('public/styles/20-v0812.css');

test('one even surface: no shading from top to bottom, no corner glows', () => {
  assert.match(css, /\.island \{\s*background: var\(--ac-grain-soft\), rgba\(4, 4, 4, 0\.985\) !important;/);
  assert.match(css, /backdrop-filter: none !important/);
  assert.match(read('public/index.html'), /styles\/20-v0812\.css/);
});

test('chat header: Slime, then "Charles", then the light and the version (no status text)', () => {
  assert.match(css, /header > \.character-center \{[^}]*flex-direction: column !important;/);
  assert.match(css, /#toggle #status \{\s*display: none !important;/);
  assert.match(css, /\.version-label::before \{\s*content: none !important;/);
});

test('cream bar in the chat: drag resizes, a click folds the island', () => {
  const c = read('src/island/companion.ts');
  assert.match(c, /Math\.abs\(e\.screenY - startY\) < 4\) \{\s*void attempt\(\(\) => api\.islandView\('notch'\)\);/);
  assert.match(c, /if \(dragging && Math\.abs\(e\.screenY - startY\) >= 4\)/);
});

test('chat: a click on an empty part of the Charles panel folds the island', () => {
  assert.match(read('src/island/shelf.ts'), /view === 'chat' && e\.button === 0 && empty\(t\) && !t\.closest\('\.character-center'\)/);
});

test('seek: shown at once, no slow fill', () => {
  const personal = read('src/settings/personal.ts');
  assert.match(personal, /lastMedia = \{ \.\.\.lastMedia, position: Number\(progress\.value\) \};/);
  assert.match(read('src/island/shelf.ts'), /document\.addEventListener\('charles-media-state', paintBar\)/);
  assert.match(css, /#notch \.notch-progress i \{\s*transition: none !important;/);
});

test('dragging Slime: the drag survives Slime moving to another place in the page', () => {
  const pet = read('src/island/desktop-pet.ts');
  assert.match(pet, /addEventListener\('lostpointercapture', \(\) => \{/);
  assert.match(pet, /pet\.setPointerCapture\(pointerId\)/);
  assert.doesNotMatch(pet, /addEventListener\('lostpointercapture', finish\)/);
});

test('bar buttons never stay pressed; the mouse leaving the island is noticed', () => {
  assert.match(css, /body\.v10\[data-view='chat'\] #island-bar #sessions-toggle \{\s*background: transparent !important;/);
  assert.match(css, /body\.v10\.pointer-out #island-bar button:hover/);
  assert.match(read('src/island/shelf.ts'), /body\.classList\.toggle\('pointer-out', out\)/);
});

test('a bigger Charles on the shelf', () => {
  assert.match(css, /body\.v10 #shelf #slime \{\s*width: 110px !important;/);
});

test('converter: quality and size sit under the file (never cut off below many formats)', () => {
  const conv = read('src/island/converter.ts');
  assert.match(conv, /el\('div', 'conv-files', head, el\('div', 'conv-opts', \.\.\.options\(\)\), list\)/);
  assert.match(conv, /const formats = el\('div', 'conv-formats', chips\);/);
});

test('README shows the new island', () => {
  const md = read('README.md');
  assert.match(md, /docs\/images\/island\.png/);
  assert.doesNotMatch(md, /docs\/images\/desktop\.png/);
  for (const f of ['island.png', 'screens.png']) assert.ok(fs.statSync(path.join(root, 'docs/images', f)).size > 100000, f);
});

test('AI usage as in v0.8.9: a glowing provider light and glowing rings', () => {
  assert.match(css, /\.usage-title \.usage-dot \{\s*display: block;[\s\S]{0,200}box-shadow:\s*0 0 6px var\(--provider\)/);
  assert.match(css, /\.gauge-fill \{\s*stroke: var\(--provider\);\s*filter: drop-shadow/);
});

test('version 0.8.12 is in the changelog', () => {
  assert.match(read('CHANGELOG.md'), /## v0\.8\.12 Beta/);
});
