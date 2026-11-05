// v0.9.18: pure logic of the new features (no window, no keyboard, no microphone).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { stats, series } = require('../app/core/metric-stats.cjs');
const { section, notes, startKind, WhatsNew } = require('../app/core/release-notes.cjs');
const { parseKey, canType, DEFAULTS } = require('../app/voice/dictation.cjs');
const { holdStep, scopeOf, HOLD_MS } = require('../app/system/content-drop.cjs');
const { RANGES } = require('../app/system/live-metrics.cjs');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('monitor numbers: known samples, missing readings are not zero', () => {
  const now = 100000;
  const s = [10, null, 30, 20].map((v, i) => ({ t: now - 3000 + i * 1000, v }));
  const r = stats(s, now, 60000);
  assert.equal(r.current, 20);
  assert.equal(r.peak, 30);
  assert.equal(r.peakAt, now - 1000);
  assert.equal(r.count, 3);
  assert.equal(r.average, 20);
  assert.equal(r.spanMs, 3000);
  assert.deepEqual(stats([], now, 60000), { current: null, average: null, peak: null, peakAt: null, count: 0, spanMs: 0 });
});

test('monitor numbers: only the chosen range counts, and background samples count for their time', () => {
  const now = 1000000;
  const old = { t: now - 120000, v: 100 };
  assert.equal(stats([old, { t: now, v: 10 }], now, 60000).peak, 10);
  // 5 s at 40 measured once, then 5 one-second samples at 10
  const s = [{ t: now - 10000, v: 40 }, ...[5, 4, 3, 2, 1].map((n) => ({ t: now - n * 1000, v: 10 }))];
  assert.equal(stats(s, now, 60000).average, 25);
});

test('monitor chart: a long pause is a gap, not a joined line', () => {
  const now = 100000;
  const line = series([{ t: 1000, v: 1 }, { t: 2000, v: 2 }, { t: 90000, v: 3 }], now, 99000);
  assert.ok(line.some((p) => p.v === null));
  assert.equal(line.at(-1).v, 3);
  assert.deepEqual(Object.keys(RANGES), ['1m', '5m', '1h']);
});

test('release notes: the section of a version, and the three kinds of start', () => {
  const log = '# x\n\n## v0.9.18 Beta — November 5, 2026\n\n- one\n\n## v0.9.17 Beta — 5 Kasım 2026\n\n- two\n';
  assert.deepEqual(section(log, '0.9.18-beta.1'), { title: 'v0.9.18 Beta — November 5, 2026', body: '- one' });
  assert.equal(section(log, '0.9.1-beta.1'), null);
  assert.equal(startKind({ fresh: true, seen: '', current: '1' }), 'first');
  assert.equal(startKind({ fresh: false, seen: '', current: '1' }), 'update');
  assert.equal(startKind({ fresh: false, seen: '0', current: '1' }), 'update');
  assert.equal(startKind({ fresh: false, seen: '1', current: '1' }), 'restart');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0918-'));
  assert.equal(new WhatsNew(dir).check({ fresh: false, current: '2' }), 'update');
  assert.equal(new WhatsNew(dir).check({ fresh: false, current: '2' }), 'restart');
});

test('release notes of this version are in English and ship with Charles', () => {
  const v = notes(ROOT, '0.9.18-beta.1');
  assert.match(v.title, /^v0\.9\.18 Beta — November/);
  assert.match(v.body, /System monitor/);
  assert.doesNotMatch(v.body, /[ğışİ]/);
});

test('push to talk: Right Arrow by default, keys that would break typing are refused', () => {
  assert.equal(DEFAULTS.key, 'Right');
  assert.equal(parseKey('Right').vk, 0x27);
  assert.deepEqual(parseKey('Ctrl+Alt+Space'), { vk: 0x20, ctrl: true, alt: true, shift: false, win: false });
  assert.equal(parseKey('F8').vk, 0x77);
  assert.throws(() => parseKey('A'), /tek başına/);
  assert.throws(() => parseKey('Enter'), /tek başına/);
  assert.throws(() => parseKey('Ctrl+Alt+C', { 'Sohbeti aç': 'CommandOrControl+Alt+C' }), /Sohbeti aç/);
});

test('push to talk: text goes only where the cursor was, never into a password box', () => {
  const box = { hwnd: 1, focus: 2, element: 'a' };
  assert.deepEqual(canType(box, box), { ok: true });
  assert.equal(canType(box, { ...box, hwnd: 9 }).reason, 'moved');
  assert.equal(canType(box, { ...box, element: 'b' }).reason, 'moved');
  assert.equal(canType(box, { ...box, password: true }).reason, 'password');
  assert.equal(canType(box, { ...box, elevated: true }).reason, 'elevated');
  assert.equal(canType(box, { ...box, readonly: true }).reason, 'readonly');
  assert.equal(canType(box, null).reason, 'unknown');
});

test('dropping Charles: a move is not a reading, and the card says what was read', () => {
  let s = holdStep({}, { x: 0, y: 0 }, 1000);
  assert.ok(s.moved);
  s = holdStep(s, { x: 5, y: 5 }, 1000 + HOLD_MS - 1);
  assert.ok(!s.arm);
  s = holdStep(s, { x: 5, y: 5 }, 1000 + HOLD_MS);
  assert.ok(s.arm);
  s = holdStep({ ...s, blocked: true }, { x: 5, y: 5 }, 1000 + HOLD_MS + 50);
  assert.ok(!s.arm, 'Esc stays in force until the pointer moves');
  assert.equal(scopeOf({ image: 'x' }).scope, 'visible');
  assert.equal(scopeOf({ truncated: true }).scope, 'partial');
  assert.equal(scopeOf({ kind: 'page' }).scope, 'loaded');
  const main = read('app/main.cjs');
  assert.match(main, /extras\.ingest\(file, \{ untrusted: 'content' \}\)/);
});

test('notification cards: never behind the panel, and shown in the app window', () => {
  const { bubbleSpot } = require('../app/plugins/mail-bubble.cjs');
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(bubbleSpot({ x: 650, y: 0, width: 620, height: 620 }, area, 380, 88), { x: 770, y: 628 });
  assert.equal(bubbleSpot({ x: 650, y: 0, width: 620, height: 1000 }, area, 380, 88).x, 1278);
  assert.equal(bubbleSpot({ x: 1300, y: 0, width: 620, height: 1000 }, area, 380, 88).x, 912);
  assert.deepEqual(bubbleSpot({ x: 100, y: 100, width: 1000, height: 800, corner: true }, area, 380, 88), { x: 704, y: 160 });
  assert.doesNotMatch(read('app/main.cjs'), /clearInterval\(petTopTimer\);\s*mailBubble\?\.suppress\(true\);/);
});

test('the raw diff above the message box is gone', () => {
  assert.doesNotMatch(read('public/index.html'), /diff-box/);
  assert.doesNotMatch(read('src/renderer.ts'), /diff-box|turn\/diff\/updated/);
});
