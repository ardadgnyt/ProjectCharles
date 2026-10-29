// v0.9.8 Beta: one pair of hands, props one at a time, the app window (drag, narrow sizes),
// the EVREN card and its guide, Claude models by version, the model menu in the app window.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the flag is put away while his paws hold a work prop or the reading sheet', () => {
  const engine = read('src/vendor/slime/engine.ts');
  assert.match(engine, /return Math\.max\(this\.reading, this\.shownStation !== 'none' \? this\.stationAlpha : 0\);/);
  assert.match(engine, /const held = hand\.presence \* this\.handFree\(\);/);
  assert.match(engine, /s\.presence \* this\.handFree\(\)/, 'behind the body too');
});

test('work props change one at a time instead of being drawn over each other', () => {
  const engine = read('src/vendor/slime/engine.ts');
  assert.match(engine, /private stepStation\(dt: number\)/);
  assert.match(engine, /this\.stepStation\(dt\);/);
  assert.match(engine, /else if \(target !== 'none' && this\.reading < 0\.05\) this\.stationAlpha/);
  assert.match(read('src/renderer.ts'), /bot\.stationAlpha < 0\.05/);
});

test('app window: moved from the title bar or the margins when Windows does not take the press', () => {
  const main = read('app/main.cjs');
  assert.match(main, /else if \(action === 'drag-start'\) startWorkspaceDrag\(\);/);
  assert.match(main, /function stopWorkspaceDrag\(\)/);
  assert.match(main, /< 4\) return; \/\/ a click/);
  const ws = read('src/workspace/workspace.ts');
  assert.match(ws, /titlebar\.addEventListener\('pointerdown', dragFrom\);/);
  assert.match(ws, /body\.addEventListener\('pointerdown', dragFrom\);/);
});

test('app window: the chat and the message box fit a narrow window', () => {
  const css = read('public/styles/27-v098.css');
  assert.match(css, /\.ws-chat-view:not\(\.with-panel\) \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(read('public/index.html'), /styles\/27-v098\.css/);
  assert.match(read('src/workspace/workspace.ts'), /root\.classList\.toggle\('side-shown'\)/);
});

test('model menu: in the app window the model list opens beside its provider', () => {
  const picker = read('src/chat/model-picker.ts');
  assert.match(picker, /\{ left: 0, top: 0, right: window\.innerWidth, bottom: window\.innerHeight \}/);
  assert.doesNotMatch(picker, /\? document\.documentElement\s*:/);
  assert.match(read('public/styles/27-v098.css'), /#model-submenu \{[^}]*background: var\(--panel-surface/);
});

test('EVREN: the same card layout as the other accounts, with Charles ile kur', () => {
  const card = read('src/settings/evren-card.ts');
  assert.match(card, /const setup = btn\('Charles ile kur', 'primary'\);/);
  assert.match(card, /guide\('evren-login'\)/);
  assert.doesNotMatch(card, /diye başlar/);
  assert.doesNotMatch(read('src/settings/abacus-card.ts'), /diye başlar/);
  const guide = read('src/settings/plugin-guide.ts');
  assert.match(guide, /'evren-login': \[/);
  assert.match(guide, /current\.finish && id === 'evren-login'/);
  const { setupURL } = require('../app/plugins/oauth-setup.cjs');
  assert.equal(setupURL('evren-login'), 'https://evren.ssyz.org.tr/');
  assert.match(read('src/settings/providers.ts'), /\(gid\) => guide\(gid\),\s*\);\s*cardTail\.after\(evren\.section\);/);
});

test('Claude: models listed by version (5.5 and 5 apart), credit-only Fable left out', () => {
  const { Providers, CLAUDE_FALLBACK, cleanClaudeModels } = require('../app/ai/providers.cjs');
  const names = CLAUDE_FALLBACK.map((m) => m[1]);
  for (const n of ['Opus 5.5', 'Opus 5', 'Opus 4.8', 'Opus 4.7', 'Opus 4.6', 'Opus 3', 'Sonnet 5.5', 'Sonnet 5', 'Sonnet 4.6', 'Haiku 5.5', 'Haiku 4.5'])
    assert.ok(names.includes(n), n);
  assert.ok(!names.some((n) => /fable/i.test(n)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-claude98-'));
  const p = new Providers(dir, dir);
  p.auth.claude = true;
  const rows = p.models().filter((m) => m.id.startsWith('claude:'));
  assert.equal(rows[0].id, 'claude:claude-opus-5-5');
  assert.equal(rows.find((m) => m.id === 'claude:claude-3-opus-20240229').efforts, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
  const sorted = cleanClaudeModels([
    { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-7', display_name: 'Claude Opus 4.7' },
    { id: 'claude-fable-5', display_name: 'Claude Fable 5' },
    { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
  ]).map((m) => m[1]);
  assert.deepEqual(sorted, ['Opus 5.5', 'Opus 4.7', 'Haiku 4.5']);
  // an old "claude:sonnet" choice becomes the newest Sonnet
  assert.match(read('src/renderer.ts'), /\^claude:\(opus\|sonnet\|haiku\)\$/);
});
