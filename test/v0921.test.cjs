const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Ayarlar in the app window: the shelf\'s hook steps aside there', () => {
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /if \(view !== 'shelf' \|\| body\.classList\.contains\('workspace'\)\) return;\s+e\.preventDefault\(\);/);
  assert.match(shelf, /if \(view === 'chat'\) b\.click\(\);\s+else if \(tries > 1\) once\(tries - 1\);/, 'a slow panel gets a few waits');
  assert.match(read('src/workspace/workspace.ts'), /\$\('settings-toggle'\)\.click\(\);/);
});

test('the drag: one at a time; shape, guard and state are undone whatever happened', () => {
  const main = read('app/main.cjs');
  assert.match(main, /if \(rackDragging\) return false; \/\/ one drag at a time/);
  const body = /rackDragging = true;[\s\S]*?setTimeout\(settled, 200\);/.exec(main)[0];
  assert.match(body, /island\.setShape\(\[\{ x: visibleBounds\.x - at\.x/);
  assert.match(body, /drag-guard\.cjs'\)\.watch\(/);
  const last = body.slice(body.indexOf('} finally {'));
  for (const step of ['guard.stop()', 'island.setShape([])', 'rackDragging = false', 'settled()']) assert.ok(last.includes(step), step);
  assert.ok(last.indexOf('guard.stop()') < last.indexOf('rackDragging = false'));
});

test('the guard: asks once, ends with the drag, and does nothing without the helper', () => {
  const { watch } = require('../app/files/drag-guard.cjs');
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stdin = { written: [], write(t) { this.written.push(t); } };
  let killed = 0;
  child.kill = () => killed++;
  const g = watch({ window: 123, pid: 9, open: (n) => (assert.equal(n, 'guard'), child) });
  assert.deepEqual(JSON.parse(child.stdin.written[0]), { window: 123, pid: 9 });
  g.stop();
  g.stop();
  assert.equal(killed, 1);
  const none = watch({ window: 1, open: () => { throw Error('no helper'); } });
  assert.doesNotThrow(() => none.stop());
});

test('the guard in the helper: only Charles\' own window, and only after the button is up', () => {
  const cs = read('setup/CharlesHelper.cs');
  const guard = /static class Guard \{[\s\S]*?\n\}\n/.exec(cs)[0];
  assert.match(guard, /owner != pid\) return;/);
  assert.match(guard, /while \(!w\.Closed && \(GetAsyncKeyState\(button\) & 0x8000\) != 0\)/);
  assert.match(guard, /if \(w\.Closed\) return;/);
  assert.doesNotMatch(guard, /mouse_event|SendInput|keybd_event/, 'no made-up input');
});

test('hub: refresh leaves the guard alone', () => {
  const { Hub } = require('../app/system/helper-hub.cjs');
  const c = new EventEmitter();
  c.stdout = new PassThrough();
  c.written = [];
  c.stdin = new EventEmitter();
  c.stdin.write = (t) => c.written.push(t);
  c.stdin.end = () => {};
  c.kill = () => {};
  const hub = new Hub({ spawn: () => c });
  hub.open('guard');
  hub.open('fg');
  hub.refresh();
  assert.deepEqual(c.written.filter((l) => l.includes('!refresh')), ['fg\t!refresh\n']);
  hub.stop();
});

test('a file coming in, in the app window: a card that asks, and its text stays text', () => {
  const { offerCard, receivingCard, receivedCard, filesLine } = require('../app/files/share-card.cjs');
  const offer = { id: 'o1', protocol: 'quickshare', peerName: 'Galaxy S24+', pin: '4821', files: [{ name: 'rapor.pdf', size: 2516582 }, { name: 'b.png', size: 1000 }] };
  const c = offerCard(offer);
  assert.equal(c.title, 'Galaxy S24+');
  assert.equal(c.source, 'Quick Share');
  assert.match(c.reason, /rapor\.pdf \+1 · 2\.4 MB · PIN: 4821/);
  assert.equal(c.lead, 'Sana dosya göndermek istiyor');
  assert.deepEqual(c.choices.map((x) => x.id), ['accept', 'decline']);
  assert.equal(offerCard({ id: 'o2', protocol: 'airdrop', peerName: '', files: [] }).title, 'Bir cihaz');
  assert.equal(offerCard({ id: 'o2', protocol: 'airdrop', files: [] }).source, 'AirDrop');
  assert.equal(filesLine([{ name: 'a.txt', size: 500 }]), 'a.txt · 1 KB');
  assert.equal(receivingCard(offer).lead, 'Dosya alınıyor');
  const done = receivedCard({ id: 'r', protocol: 'localsend', peerName: 'Tel', files: [{ name: 'a', size: 1, path: 'C:\\x\\a' }] }, 'C:\\d');
  assert.equal(done.reveal, 'C:\\x\\a');
  assert.equal(receivedCard({ id: 'r', files: [] }, 'C:\\d').reveal, 'C:\\d');
  const js = read('public/bubble.js');
  assert.match(js, /card\.classList\.add\('asking'\)/);
  assert.match(js, /window\.bubble\.choice\(item\.id, choice\.id\)/);
  assert.doesNotMatch(js, /innerHTML/);
  const main = read('app/main.cjs');
  assert.match(main, /askedCard && st\.offer\?\.id !== askedCard/, 'the question leaves when it is over');
  assert.match(read('app/plugins/mail-bubble.cjs'), /item\?\.choices\?\.some\(\(c\) => c\.id === choice\)/, 'only what the card offered');
});

test('this version', () => {
  const { notes } = require('../app/core/release-notes.cjs');
  const v = notes(ROOT, '0.9.21-beta.1');
  assert.match(v.title, /^v0\.9\.21 Beta — November/);
  assert.doesNotMatch(v.body, /[ğışİ]/);
});
