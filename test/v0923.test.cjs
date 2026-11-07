// v0.9.23: one message style in the island and the app window, readable links, no status under Charles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('links: one light colour on every message, underlined, for every state', () => {
  const css = read('public/styles/39-v0923.css');
  assert.match(read('public/index.html'), /styles\/39-v0923\.css/);
  assert.match(css, /--ch-link: #dcdad6/);
  assert.match(css, /#feed \.markdown a,\s*#feed \.markdown a:visited \{[^}]*text-decoration: underline/);
  assert.match(css, /#feed \.markdown a:hover/);
  assert.match(css, /#feed \.markdown a:focus-visible/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test('the bubble has one definition, and no cream in the app window', () => {
  assert.match(read('public/styles/10-noir.css'), /--ch-bubble:/);
  assert.match(read('public/styles/39-v0923.css'), /background: var\(--ch-bubble\) !important/);
  const special = read('public/styles/9-special.css');
  const rule = /body\.workspace #feed \.message\.user \{[^}]*\}/.exec(special)[0];
  assert.doesNotMatch(rule, /--ws-accent/);
  assert.match(rule, /margin-right: 0 !important/);
});

test('a sent picture: the frame is no wider than the picture', () => {
  const css = read('public/styles/38-v0922.css');
  assert.match(css, /\.message-attachments figure \{\s*max-width: min\(240px, 100%\);/);
  assert.match(css, /\.message-attachments img \{\s*max-width: 100%;/);
  assert.match(read('src/renderer.ts'), /copy\.hidden = !text\.trim\(\);/);
});

test('no status under Charles in the app window; the status itself stays', () => {
  const workspace = read('src/workspace/workspace.ts');
  assert.doesNotMatch(workspace, /ws-status|statusDot|paintStatus/);
  assert.doesNotMatch(read('public/styles/9-special.css'), /\.ws-status/);
  assert.match(read('public/index.html'), /id="status"/);
});

test('this version', () => {
  assert.match(JSON.parse(read('package.json')).version, /^0\.9\.2[3-9]/);
  const { notes } = require('../app/core/release-notes.cjs');
  const v = notes(root, '0.9.23-beta.1');
  assert.match(v.title, /^v0\.9\.23 Beta — November/);
  assert.doesNotMatch(v.body, /[ğışİ]/);
});
