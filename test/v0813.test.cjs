// v0.8.13: closed notifications stay closed, the hidden strip is the closed island, a bigger
// Charles in the chat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { bounds, NOTCH, HIDDEN } = require('../app/core/layout.cjs');

// MailBubble with a stand-in for Electron (no window is drawn in the tests)
function fakeBubble() {
  const handlers = {};
  const electron = {
    BrowserWindow: class {},
    ipcMain: {
      on: (name, fn) => (handlers[name] = fn),
      handle: (name, fn) => (handlers[name] = fn),
    },
    screen: {},
  };
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return electron;
    return load.call(this, request, ...rest);
  };
  try {
    const file = require.resolve('../app/plugins/mail-bubble.cjs');
    delete require.cache[file];
    const { MailBubble } = require(file);
    const b = new MailBubble({ anchor: () => null, onOpen: () => {} });
    b.render = async () => {};
    return { b, handlers };
  } finally {
    Module._load = load;
  }
}

test('a closed mail or reminder never comes back', () => {
  const { b, handlers } = fakeBubble();
  b.add({ id: 'gmail|1', kind: 'gmail', title: 'A' });
  assert.equal(b.items.length, 1);
  handlers['bubble-dismiss']({ sender: (b.window = { webContents: 'w' }).webContents }, 'gmail|1');
  assert.equal(b.items.length, 0);
  b.add({ id: 'gmail|1', kind: 'gmail', title: 'A' });
  assert.equal(b.items.length, 0, 'the same mail is not shown again');
  b.add({ id: 'gmail|2', kind: 'gmail', title: 'B' });
  assert.equal(b.items.length, 1, 'a new mail still is');
});

test('a closed WhatsApp chat: a late photo or group name does not reopen it, a new message does', () => {
  const { b } = fakeBubble();
  b.upsert({ id: 'wa|x', kind: 'whatsapp', chat: 'x', last: 'M1', text: 'Selam' });
  b.dismiss('wa|x');
  assert.equal(b.items.length, 0);
  b.upsert({ id: 'wa|x', kind: 'whatsapp', chat: 'x', last: 'M1', image: 'data:image/jpeg;base64,AA' }, { update: true });
  assert.equal(b.items.length, 0, 'photo update');
  b.upsert({ id: 'wa|x', kind: 'whatsapp', chat: 'x', last: 'M1', name: 'Grup' });
  assert.equal(b.items.length, 0, 'same last message');
  b.upsert({ id: 'wa|x', kind: 'whatsapp', chat: 'x', last: 'M2', text: 'Yeni' });
  assert.equal(b.items.length, 1, 'a new message');
  assert.equal(b.items[0].text, 'Yeni');
});

test('WhatsApp: later refreshes are marked as updates and carry the last message id', () => {
  const wa = read('app/plugins/whatsapp-live.cjs');
  assert.match(wa, /this\.emit\('message', \{ \.\.\.this\.preview\(c\), update: true \}\)\);/);
  assert.match(wa, /last: last\?\.id \|\| null,/);
  const main = read('app/main.cjs');
  assert.match(main, /\{ update: !!update \}\);/);
  assert.match(main, /if \(i\.kind === 'whatsapp'\) mailBubble\.dismiss\(i\.id\);/);
});

test('the cards sit above the island and the island lets the pointer through to them', () => {
  const mb = read('app/plugins/mail-bubble.cjs');
  assert.match(mb, /setAlwaysOnTop\(true, 'screen-saver'\)/);
  assert.match(mb, /contains\(point\) \{/);
  const main = read('app/main.cjs');
  assert.match(main, /point\.y < visible\.y \+ visible\.height &&\s*!mailBubble\?\.contains\(point\);/);
  assert.match(main, /win\.moveTop\(\);\s*mailBubble\?\.raise\(\);/);
  const js = read('public/bubble.js');
  assert.match(js, /forget\(item\);\s*card\.remove\(\);/);
  assert.match(js, /items = \(items \|\| \[\]\)\.filter\(\(i\) => !closed\(i\)\);/);
});

test('closed with no music: the hidden strip (no Slime-only notch)', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const idle = bounds(area, { expanded: false, side: 'center', height: 620, music: false });
  assert.deepEqual([idle.width, idle.height], [HIDDEN.width, HIDDEN.height]);
  assert.equal(bounds(area, { expanded: false, side: 'center', height: 620, music: true }).width, NOTCH.width);
  assert.doesNotMatch(read('app/core/layout.cjs'), /NOTCH_IDLE/);
  const main = read('app/main.cjs');
  assert.match(main, /if \(!expanded && !notchMusic\) hidden = true;/);
  assert.match(main, /value === 'Paused' \? 'paused' : 'none'/);
  // resting on the strip with nothing playing opens the card shelf
  assert.match(main, /expand\(true, false, false\);\s*win\.webContents\.send\('character-peek'\);/);
  assert.match(read('src/island/shelf.ts'), /api\.notchMusic\?\.\(state\)/);
  // music is still looked for while the island is the strip
  assert.match(read('src/settings/personal.ts'), /const idle = document\.visibilityState !== 'visible' \|\| document\.body\.classList\.contains\('desktop-pet'\);/);
});

test('a bigger Charles above the chat', () => {
  const css = read('public/styles/21-v0813.css');
  assert.match(css, /header #pet \{\s*width: 96px !important;/);
  assert.match(css, /header #slime \{\s*width: 124px !important;/);
  assert.match(read('public/index.html'), /styles\/21-v0813\.css/);
});

test('version 0.8.13 is in the changelog', () => {
  assert.match(read('CHANGELOG.md'), /## v0\.8\.13 Beta/);
});
