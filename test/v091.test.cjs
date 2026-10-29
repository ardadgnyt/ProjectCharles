// v0.9.1: two hands while greeting at work, no history button on the shelf, Slime back in the
// app window, no false low-quota warning, pictures in the chat open large.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { usageSnapshot } = require('../app/usage/codex-usage.cjs');

test('greeting while typing or reading: the work props lose their paws (two hands, not four)', () => {
  const engine = read('src/vendor/slime/engine.ts');
  assert.match(engine, /const greeting =\s*this\.hands > 0\.01 \|\| \(now\(\) >= this\.waveStart && this\.waveStart > 0 && now\(\) < this\.waveUntil\);/);
  // v0.9.6: the props are also put away while he waves (`reading` is this.reading * keep)
  assert.match(engine, /drawReading\(x, performance\.now\(\) \/ 1000, reading, ownEyes, !greeting, /);
  assert.match(engine, /drawStation\(x, performance\.now\(\) \/ 1000, this\.shownStation, false, !greeting\);/);
  assert.match(read('src/chat/activity.ts'), /for \(const side of paws \? \[-1, 1\] : \[\]\) \{\s*x\.fillStyle = PAW\.dark;/);
  assert.match(read('src/chat/reading.ts'), /for \(const side of paws \? \[-1, 1\] : \[\]\) \{\s*const hand = x\.createRadialGradient/);
});

test('no chat history button on the card shelf', () => {
  assert.match(read('public/styles/24-v091.css'), /body\.v10\[data-view='shelf'\] #island-bar #sessions-toggle \{\s*display: none !important;/);
  assert.match(read('public/index.html'), /styles\/24-v091\.css/);
});

test('app window: Slime stays in its Charles card', () => {
  assert.match(read('src/island/shelf.ts'), /function placePet\(\) \{[\s\S]{0,300}if \(body\.classList\.contains\('workspace'\)\) return;/);
});

test('low quota: no warning when Codex has credits, for an old window, or before a fresh read agrees', () => {
  const w = (usedPercent, mins) => ({ usedPercent, windowDurationMins: mins, resetsAt: 2000000000 });
  const paid = usageSnapshot({ rateLimits: { primary: w(100, 300), secondary: w(15, 10080), credits: { hasCredits: true, unlimited: false, balance: '62.41' } } });
  assert.equal(paid.paid, true);
  assert.equal(paid.blocked, false, 'credits left: Codex goes on');
  const none = usageSnapshot({ rateLimits: { primary: w(100, 300), secondary: w(15, 10080), credits: { hasCredits: false } } });
  assert.equal(none.paid, false);
  assert.equal(none.blocked, true);
  const usage = read('src/island/usage.ts');
  assert.match(usage, /if \(v\?\.paid\) return out;/);
  assert.match(usage, /if \(w\.resetsAt && w\.resetsAt \* 1000 <= now\) continue;/);
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /const v = await api\.usageRead\(true, q\.provider\);/);
  assert.match(renderer, /if \(v\?\.paid \|\| v\?\.unavailable \|\| typeof w\?\.remaining !== 'number' \|\| w\.remaining >= LOW_QUOTA\)\s*return false;/);
});

test('pictures sent in the chat open large on a click', () => {
  const main = read('app/main.cjs');
  assert.match(main, /return \{ name: a\.name, kind: a\.kind, thumbnail, preview \};/);
  assert.match(main, /preview = storeImage\(dir, data\);/);
  assert.match(main, /\/\^\[0-9a-f\]\{40\}\\\.\(png\|jpg\|webp\|gif\)\$\//);
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /img\.classList\.add\('zoomable'\);/);
  assert.match(renderer, /\.historyImage\(name\)\s*\.then\(\(src: string\) => lightbox\(src, file\.name\)\)/);
  assert.match(read('src/chat/image-card.ts'), /export function lightbox\(\s*src: string,\s*alt = /);
  const { storeImage } = require('../app/ai/sessions.cjs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-091-'));
  const gif = 'data:image/gif;base64,' + Buffer.alloc(200, 7).toString('base64');
  const name = storeImage(dir, gif);
  assert.match(name, /^[0-9a-f]{40}\.gif$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('version 0.9.10', () => {
  assert.equal(JSON.parse(read('package.json')).version, '0.9.10-beta.1');
  assert.match(read('public/index.html'), /v0\.9\.10 Beta/);
  assert.match(read('setup/install.ps1'), /\$Version = 'v0\.9\.10 Beta'/);
  assert.match(read('CHANGELOG.md'), /## v0\.9\.10 Beta/);
});
