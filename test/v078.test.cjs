// v0.7.8 Beta: file drop listeners, drag state, smart home editor drag, compact work strip,
// installer quoting.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('every file drop listener is called (not only the last one)', () => {
  const p = read('app/preload.cjs');
  assert.match(p, /const dropCallbacks = new Set\(\);/);
  assert.match(p, /dropCallbacks\.add\(cb\)/);
  assert.doesNotMatch(p, /dropCallback = cb;/);
});

test('drags inside the window do not switch on the drop area, and it always ends', () => {
  const x = read('src/settings/extras.ts');
  assert.match(x, /addEventListener\('dragstart', \(\) => \(internalDrag = true\), true\)/);
  assert.match(x, /const external = \(e: DragEvent\) => !internalDrag/);
  assert.match(x, /addEventListener\('drop', \(\) => window\.setTimeout\(endDrop, 0\), true\)/);
  assert.match(x, /e\.buttons === 0 && document\.body\.classList\.contains\('dropping'\)\) endDrop\(\)/);
});

test('smart home editor keeps the dragged cell on the page', () => {
  const h = read('src/workspace/home.ts');
  const over = h.slice(h.indexOf('board.ondragover'), h.indexOf('board.ondrop'));
  assert.doesNotMatch(over, /paintEditor\(\)/);
  assert.match(over, /placeSlot\(at\)/);
  assert.match(h, /application\/x-charles-device/);
  assert.match(h, /if \(editor\.isOpen\(\) && !dragId\) paintEditor\(\);/);
});

test('work panel and queue sit side by side', () => {
  const css = read('public/styles/12-v077.css');
  assert.match(css, /\.ws-chat-view \.ws-work \{\s*display: flex;/);
  assert.match(css, /\.ws-chat-view \.ws-work > \.ws-queue \{\s*flex: 0 0 300px;/);
});

test('installer has no curly quotes (PowerShell reads ‘ ’ as quote marks)', () => {
  for (const f of ['setup/install.ps1']) {
    const s = read(f);
    assert.ok(!/[‘’‚‛“”„]/.test(s), f);
    // every line has balanced single quotes ('' inside a string is one escaped quote)
    s.split('\n').forEach((line, i) => {
      const code = line.replace(/#.*$/, '').replace(/"[^"]*"/g, '""');
      assert.equal((code.replace(/''/g, '').match(/'/g) || []).length % 2, 0, `${f}:${i + 1}`);
    });
  }
});

test('v0.7.9: the chat view has a row for the work strip, so the chat starts at the top', () => {
  const css = read('public/styles/12-v077.css');
  assert.match(css, /\.ws-chat-view \{\s*grid-template-rows: auto auto minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.ws-chat-view > \.ws-chat-body \{\s*grid-row: 3;/);
  assert.match(css, /\.ws-chat-view > \.ws-panel \{\s*grid-row: 1 \/ span 4;/);
});
