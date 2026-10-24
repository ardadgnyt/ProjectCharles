// v0.8.15: Spotify's progress keeps moving (the song's name is optional), new island clicks,
// smaller day cards in the weather sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('Spotify: position, length and state never wait for the song’s name', () => {
  const ps = read('app/system/media-worker.ps1');
  // only the session list may restart the worker; everything else is optional
  assert.match(ps, /if\(-not \$Optional\)\{\$script:restart=\$true\}/);
  assert.match(ps, /\$script:manager=Await-Result \(\$managerType::RequestAsync\(\)\) \$managerType\}/);
  assert.match(ps, /TryGetMediaPropertiesAsync\(\)\) \$propertyType 1500 -Optional/);
  // the name is asked for on a new song or every 20 s, not on every poll
  assert.match(ps, /\(\$m\.key -ne \$songKey -or \(\$now-\$m\.at\)\.TotalSeconds -ge 20\) -and \(\$now-\$m\.failedAt\)\.TotalSeconds -ge 30/);
  // the timeline is read before the name, so it is there even when the name is late
  assert.ok(ps.indexOf("$script:stage='timeline'") < ps.indexOf("$script:stage='properties'"));
  // the cover's stream is closed
  assert.match(ps, /if\(\$stream\)\{try\{\$stream\.Dispose\(\)\}catch\{\}\}/);
  // Spotify's window is found also while it sits in the tray
  assert.match(ps, /\[CharlesSpotifyWindow\]::Titles/);
  assert.match(ps, /EnumWindows\(delegate\(IntPtr h, IntPtr l\)/);
  // where it hung goes to perf.log
  assert.match(ps, /stage=\$script:stage/);
  assert.match(read('app/main.cjs'), /perfLog\('media', note\);/);
  // the worker itself silent: Spotify's window for a minute
  assert.match(read('app/system/media-worker.cjs'), /this\.windowOnlyUntil = Date\.now\(\) \+ 60000;\s*this\.stop\(\);/);
});

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

test('version 0.8.15', () => {
  assert.equal(JSON.parse(read('package.json')).version, '0.8.15-beta.1');
  assert.match(read('public/index.html'), /v0\.8\.15 Beta/);
  assert.match(read('setup/install.ps1'), /\$Version = 'v0\.8\.15 Beta'/);
  assert.match(read('CHANGELOG.md'), /## v0\.8\.15 Beta/);
});
