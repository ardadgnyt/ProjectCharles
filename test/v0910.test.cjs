// v0.9.10 Beta: no waving in his sleep, one pair of cheeks while reading, smoother pointer and
// streaming, durations in the UI language, file citations and formula tables in answers, the chat
// keeps its place when it moves back to the island.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

async function bundle(code) {
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    stdin: { contents: code, resolveDir: path.join(__dirname, '..'), loader: 'ts' },
    bundle: true,
    platform: 'node',
    write: false,
    format: 'cjs',
    logLevel: 'silent',
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

test('no waving while asleep; falling asleep puts the hands down', () => {
  const engine = read('src/vendor/slime/engine.ts');
  assert.match(engine, /greet\(\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*if \(this\.state === 'sleeping'\) return;/);
  assert.match(engine, /if \(next === 'sleeping'\) \{\s*this\.interruptGreet\(\);/);
  assert.match(read('src/renderer.ts'), /bot\.interruptGreet\(\);\s*touchCharacter\(\);/);
});

test('reading: the glasses draw no second pair of cheeks over the Slime', () => {
  assert.match(read('src/chat/reading.ts'), /if \(!cheeks\) continue;/);
  assert.match(read('src/vendor/slime/engine.ts'), /!greeting, !\(slime && this\.morph < 0\.6\)\)/);
});

test('pointer once per frame, canvas measured at most 4×/s, long answers redrawn a few times a second', () => {
  const r = read('src/renderer.ts');
  assert.match(r, /api\.onCursor\(queueCursor\);/);
  assert.match(r, /if \(!canvasRect \|\| t - canvasRectAt > 250\)/);
  assert.equal((r.match(/canvas\.getBoundingClientRect\(\)/g) || []).length, 1);
  assert.match(read('src/chat/markdown.ts'), /const gap = length > 4000 \? Math\.min\(400, 60 \+ length \/ 100\) : 0;/);
  assert.match(read('app/main.cjs'), /detached \|\| workspace \? 33 : 16/);
});

test('durations and percentages follow the UI language', async () => {
  const { shortMinutes, shortSeconds, percent } = await bundle(
    "export * from './src/settings/time-units';",
  );
  assert.equal(shortMinutes(358, 'tr'), '5sa 58dk');
  assert.equal(shortMinutes(358, 'en'), '5h 58m');
  assert.equal(shortMinutes(360, 'en'), '6h');
  assert.equal(shortMinutes(45, 'tr'), '45 dk');
  assert.equal(shortMinutes(1805, 'de'), '1 T. 6 Std.');
  assert.equal(shortMinutes(358, 'zh'), '5小时58分钟');
  assert.equal(shortSeconds(30, 'en'), '30 s');
  assert.equal(percent(58, 'tr'), '%58');
  assert.equal(percent(58, 'en'), '58%');
  assert.match(read('src/island/usage.ts'), /return shortMinutes\(\(resetsAt \* 1000 - now\) \/ 60000\);/);
  assert.match(read('src/workspace/dashboard.ts'), /pct\.textContent = percent\(left\);/);
});

test('answers: file citations become chips, "|" inside formulas no longer breaks a table', async () => {
  const { prepareAnswer, protectTableMath, CITE_MARK } = await bundle(
    "export * from './src/chat/answer-text';",
  );
  const r = prepareAnswer(
    'Kaynak:\n:codex-file-citation{path="C:/Users/U/AppData/Roaming/Charles/inbox/751fb63f-0c1c-4737-a088-e74c120f5fd7.pdf" purpose="source"}\nson',
  );
  assert.equal(r.citations.length, 1);
  assert.equal(r.citations[0].name, '751fb63f-0c1c-4737-a088-e74c120f5fd7.pdf');
  assert.ok(r.text.includes(CITE_MARK + '0'));
  assert.ok(!r.text.includes('codex-file-citation'));
  const row = protectTableMath('| Bileşen | $V_{n,rms}$ | $|Z_n|$ | $I_{n,rms}$ |');
  assert.equal(row.split('|').length - 2, 4, 'four cells, like the header');
  assert.match(row, /\$\\vert Z_n\\vert \$/);
  const MarkdownIt = require('markdown-it');
  const html = new MarkdownIt().render(
    prepareAnswer('| Bileşen | $|Z_n|$ |\n|---|---:|\n| Temel | 15.259 Ω |').text,
  );
  assert.match(html, /<table>/);
  assert.match(read('src/chat/markdown.ts'), /placeCitations\(element, prepared\.citations\);/);
  assert.match(read('app/main.cjs'), /safeHandler\('attachment-name'/);
});

test('the chat keeps its place when it moves between the app window and the island', () => {
  const follow = read('src/chat/follow.ts');
  assert.match(follow, /export function restore\(list: HTMLElement\)/);
  assert.match(follow, /new ResizeObserver/);
  const r = read('src/renderer.ts');
  assert.match(r, /feed\.clientHeight > 0 &&\s*!following\(feed\) &&/);
  assert.match(r, /restoreFeed\(feed\);/);
});
