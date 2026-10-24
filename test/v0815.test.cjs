// v0.8.15: Spotify's progress keeps moving (the song's name is optional), new island clicks,
// smaller day cards in the weather sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('music without a known length: no progress bar stuck at 0:00', () => {
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /card\.classList\.toggle\('no-time', active && !\(r\.duration > 0\)\);/);
  const css = read('public/styles/23-v0815.css');
  assert.match(css, /#shelf \.card-music\.no-time \.music-progress \{\s*visibility: hidden;/);
  assert.match(css, /body\.music-no-time #notch \.notch-progress \{\s*visibility: hidden;/);
});

test('clicks: shelf — cream bar closes, empty space opens the chat; chat — cream bar closes, empty space → shelf', () => {
  const companion = read('src/island/companion.ts');
  assert.match(companion, /const barTarget = \(\) => \(document\.body\.dataset\.view === 'shelf' \? 'notch' : 'chat'\);/);
  assert.match(companion, /const target = barTarget\(\);\s*void attempt\(\(\) => api\.islandView\(target\)\);/);
  assert.match(companion, /Math\.abs\(e\.screenY - startY\) < 4\) \{\s*void attempt\(\(\) => api\.islandView\('notch'\)\);/);
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /if \(view === 'shelf' && !onPath\(e, [^)]*\)\)\s*void attempt\(\(\) => api\.islandView\('chat'\)\);/);
  assert.match(shelf, /on the shelf an empty part of the top bar opens the chat\s*e\.stopImmediatePropagation\(\);\s*void attempt\(\(\) => api\.islandView\('chat'\)\);/);
  assert.match(shelf, /void attempt\(\(\) => api\.islandView\('shelf'\)\);/);
  assert.match(read('src/settings/i18n-0815.ts'), /"Adayı küçült": "Shrink the island"/);
});

test('weather: smaller day cards with room below them', () => {
  const css = read('public/styles/23-v0815.css');
  assert.match(css, /#shelf \.weather-day-sky \{/);
  assert.match(css, /#shelf \.shelf-sheet\[data-kind='weather'\] \{\s*padding: 6px 10px 10px;/);
  assert.match(read('src/island/shelf.ts'), /'weather-day-sky',/);
  assert.match(read('public/index.html'), /styles\/23-v0815\.css/);
});

test('version 0.8.15 is in the changelog', () => {
  assert.match(read('CHANGELOG.md'), /## v0\.8\.15 Beta/);
});
