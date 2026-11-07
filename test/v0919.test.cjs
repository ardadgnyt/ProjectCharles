// v0.9.19: the frame over a target, the dictation indicator's place, in-bubble editing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');

const { ContentDrop, HOLD_MS, RETRY_MS } = require('../app/system/content-drop.cjs');
const { indicatorSpot, Dictation } = require('../app/voice/dictation.cjs');
const { Sessions } = require('../app/ai/sessions.cjs');
const { Extras } = require('../app/core/extras.cjs');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A helper that answers from `answer(command)`; returning a promise delays the line. */
function fakeHelper(answer, { ready = true } = {}) {
  const spawned = [];
  const spawnHelper = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.emit('exit');
    };
    // one question at a time, as the real helper reads its stdin
    let turn = Promise.resolve();
    child.stdin = new Writable({
      write(chunk, _e, done) {
        const command = JSON.parse(String(chunk));
        turn = turn.then(() => answer(command)).then((v) => void (!child.killed && child.stdout.write(JSON.stringify(v) + '\n')));
        done();
      },
    });
    spawned.push(child);
    if (ready) child.stdout.write('{"ready":true}\n');
    return child;
  };
  return { spawnHelper, spawned };
}
function fakeDrop(answer) {
  const shown = [];
  const helper = fakeHelper(answer);
  class Win {
    constructor() {
      this.visible = false;
      this.webContents = { setWindowOpenHandler() {}, executeJavaScript: async (code) => shown.push(code) };
    }
    isDestroyed() {
      return false;
    }
    isVisible() {
      return this.visible;
    }
    loadURL() {
      return Promise.resolve();
    }
    setIgnoreMouseEvents() {}
    setAlwaysOnTop() {}
    setBounds(b) {
      this.bounds = b;
    }
    showInactive() {
      this.visible = true;
    }
    moveTop() {}
    hide() {
      this.visible = false;
    }
    destroy() {}
  }
  const same = (v) => v;
  const drop = new ContentDrop({
    BrowserWindow: Win,
    screen: { dipToScreenPoint: same, screenToDipRect: (_w, r) => r },
    globalShortcut: { register: () => true, unregister: () => {} },
    spawnHelper: helper.spawnHelper,
  });
  return { drop, shown, helper };
}
const WINDOW = { found: true, hwnd: 7, app: 'chrome', title: 'Sayfa', kind: 'page', rect: { x: 0, y: 0, width: 900, height: 700 }, blocked: false };
const held = (drop, t0 = 1000) => {
  drop.move({ x: 100, y: 100 }, t0);
  drop.move({ x: 101, y: 100 }, t0 + HOLD_MS);
};

test('frame: the exact area when it comes quickly, and a target only with a frame on screen', async () => {
  const { drop, shown, helper } = fakeDrop((c) => (c.cmd === 'probe' ? WINDOW : { documents: 1, name: 'Haber', rect: { x: 10, y: 80, width: 880, height: 610 } }));
  drop.begin();
  held(drop);
  await wait(60);
  assert.equal(drop.overlay.bounds.y, 80);
  assert.match(shown.at(-1), /Haber/);
  assert.equal(drop.target.hwnd, 7);
  assert.equal(drop.end().hwnd, 7);
  assert.equal(drop.overlay.visible, false, 'no frame after the drag');
  drop.stop();
  assert.equal(helper.spawned.length, 1);
});

test('frame: a slow page shows the window at once, narrows later, and the helper lives on', async () => {
  let finish;
  const { drop, helper } = fakeDrop((c) => (c.cmd === 'probe' ? WINDOW : new Promise((r) => (finish = r))));
  drop.begin();
  held(drop);
  await wait(320);
  assert.equal(drop.overlay.visible, true);
  assert.equal(drop.overlay.bounds.width, 900);
  assert.ok(drop.target, 'can be dropped on before the exact area is known');
  finish({ documents: 1, rect: { x: 20, y: 90, width: 800, height: 500 } });
  await wait(30);
  assert.equal(drop.overlay.bounds.width, 800);
  assert.equal(helper.spawned[0].killed, false);
  drop.stop();
});

test('frame: a page still answering holds back neither the next hold nor the helper', async () => {
  let slow;
  const asked = [];
  const { drop, helper } = fakeDrop((c) => {
    asked.push(c.cmd);
    if (c.cmd === 'probe') return WINDOW;
    if (asked.filter((x) => x === 'refine').length === 1) return new Promise((r) => (slow = r));
    return { documents: 1, rect: { x: 1, y: 2, width: 300, height: 200 } };
  });
  drop.begin();
  held(drop);
  await wait(320);
  assert.ok(drop.target);
  drop.move({ x: 700, y: 500 }, 3000); // on to another window
  drop.move({ x: 701, y: 500 }, 3000 + HOLD_MS);
  await wait(30);
  assert.equal(drop.probing, true, 'the second hold asks at once');
  slow({ documents: 1, rect: { x: 5, y: 5, width: 100, height: 100 } }); // late: for the old target
  await wait(320);
  assert.equal(drop.overlay.bounds.width, 300, 'the late answer does not move the new frame');
  assert.equal(helper.spawned.length, 1);
  drop.stop();
});

test('frame: moving on while the answer is on its way leaves nothing behind', async () => {
  let answer;
  const { drop } = fakeDrop((c) => (c.cmd === 'probe' ? new Promise((r) => (answer = r)) : {}));
  drop.begin();
  held(drop);
  await wait(10);
  drop.move({ x: 500, y: 500 }, 2000); // moved
  answer(WINDOW);
  await wait(300);
  assert.equal(drop.target, null);
  assert.equal(drop.overlay, null);
  drop.begin();
  assert.equal(drop.end(), null, 'an earlier drag does not reach the next');
  drop.stop();
});

test('frame: empty desktop is asked rarely, not on each pointer tick', async () => {
  let asked = 0;
  const { drop } = fakeDrop(() => (asked++, { found: false }));
  drop.begin();
  let t = 1000;
  drop.move({ x: 100, y: 100 }, t);
  for (let i = 0; i < 40; i++) {
    t += 16;
    drop.move({ x: 100, y: 100 }, t + HOLD_MS);
    await wait(1);
  }
  assert.equal(asked, 1);
  drop.move({ x: 100, y: 100 }, t + HOLD_MS + RETRY_MS);
  await wait(5);
  assert.equal(asked, 2);
  drop.stop();
});

test('frame: a protected window is refused once and says so at the release; Esc cancels', async () => {
  let asked = 0;
  const { drop } = fakeDrop(() => (asked++, { ...WINDOW, app: 'keepass', blocked: true }));
  drop.begin();
  held(drop);
  await wait(30);
  drop.move({ x: 101, y: 100 }, 5000);
  await wait(10);
  assert.equal(asked, 1);
  assert.match(drop.end().refused.error, /koruma/);
  drop.begin();
  drop.cancelled = true;
  assert.deepEqual(drop.end(), { cancelled: true });
  drop.stop();
});

test('frame: a helper started for a drag that asked nothing does not stay', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { drop, helper } = fakeDrop(() => ({}));
  drop.begin();
  assert.equal(helper.spawned.length, 1);
  t.mock.timers.tick(46000);
  assert.equal(helper.spawned[0].killed, true);
  assert.equal(drop.child, null);
});

test('frame: the helper finds windows without UI Automation first, and skips invisible ones', () => {
  const ps = read('app/system/content-reader.ps1');
  const probe = ps.slice(ps.indexOf('public static Hashtable Probe'), ps.indexOf('public static Hashtable Refine'));
  assert.doesNotMatch(probe, /Documents\(/);
  assert.match(ps, /GetLayeredWindowAttributes/);
  // the wallpaper is not a page: an overlay no one can activate does not count, even with a name
  assert.match(ps, /if \(\(ex & 0x08000000\) != 0\) continue;/);
  assert.match(ps, /cls == "Progman" \|\| cls == "WorkerW"/);
  assert.match(ps, /\$c\.cmd -eq 'refine'/);
});

test('indicator: under the island, under the cards, inside the screen', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const island = { x: 760, y: 0, width: 400, height: 40 };
  assert.deepEqual(indicatorSpot(island, null, area, 300, 52), { x: 810, y: 48 });
  const cards = { x: 770, y: 48, width: 380, height: 200 };
  assert.deepEqual(indicatorSpot(island, cards, area, 300, 52), { x: 810, y: 256 });
  // a panel as tall as the screen: beside it
  const panel = { x: 650, y: 0, width: 620, height: 1030 };
  assert.equal(indicatorSpot(panel, null, area, 300, 52).x, 1278);
  // docked to the right edge
  const docked = { x: 1500, y: 0, width: 420, height: 40 };
  assert.ok(indicatorSpot(docked, null, area, 420, 132).x + 420 <= 1920);
  // another screen
  const left = { x: -1920, y: 0, width: 1920, height: 1040 };
  const spot = indicatorSpot({ x: -1160, y: 0, width: 400, height: 40 }, null, left, 300, 52);
  assert.ok(spot.x >= -1920 && spot.x + 300 <= 0);
});

test('indicator: follows the island and never asks for the keyboard', () => {
  const calls = [];
  const win = {
    isDestroyed: () => false,
    getBounds: () => calls.at(-1) || {},
    setBounds: (b) => calls.push(b),
  };
  const d = new Dictation({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0919-')),
    voice: {},
    send() {},
    mic: {},
    screen: { getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }), getCursorScreenPoint: () => ({ x: 0, y: 0 }) },
    clipboard: {},
    anchor: () => ({ x: island, y: 0, width: 400, height: 40 }),
  });
  let island = 760;
  d.win = win;
  d.size = { width: 300, height: 52 };
  d.place();
  assert.equal(calls.at(-1).x, 810);
  island = 100;
  d.place();
  assert.equal(calls.at(-1).x, 150);
  const before = calls.length;
  d.place();
  assert.equal(calls.length, before, 'no call when nothing moved');
  const source = read('app/voice/dictation.cjs');
  assert.match(source, /focusable: false/);
  assert.match(source, /showInactive/);
});

test('editing: nothing changes before Save, and a refused message leaves the chat as it was', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0919-'));
  const s = new Sessions(process.cwd(), dir);
  try {
    s.current.events.push({ type: 'history-user', data: 'ilk', attachments: [{ id: 'a', name: 'x.txt' }] }, { type: 'history-local', data: 'yanıt' });
    s.current.events.push({ type: 'history-user', data: 'ikinci', attachments: [] }, { type: 'history-local', data: 'yanıt 2' });
    const room = s.active;
    const info = s.editInfo(0);
    assert.equal(info.text, 'ilk');
    assert.equal(info.attachments[0].name, 'x.txt');
    assert.equal(s.active, room);
    assert.equal(s.current.events.length, 4);
    assert.throws(() => s.editInfo(9), /Mesaj/);
    const edit = s.editMessage(0);
    assert.notEqual(s.active, room);
    assert.equal(edit.from, room);
    assert.equal(edit.room.id, s.active);
    const back = s.undoEdit(edit.room.id, edit.from);
    assert.equal(s.active, room);
    assert.equal(s.rooms.has(edit.room.id), false);
    assert.equal(back.events.filter((e) => e.type === 'history-user').length, 2);
    assert.equal(s.current.events.length, 4);
  } finally {
    s.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('editing: an attachment of a sent message comes back only while its file exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0919-'));
  try {
    const e = new Extras(dir, { isEncryptionAvailable: () => false });
    const file = path.join(dir, 'not.txt');
    fs.writeFileSync(file, 'içerik');
    const { id } = e.ingest(file);
    assert.equal(e.revive({ id }).id, id);
    assert.equal(e.revive({ id: 'x' }), null);
    assert.equal(e.revive({ name: 'old message without id' }), null);
    e.attachments.clear();
    const back = e.revive({ id, name: 'not.txt', kind: 'text' });
    assert.equal(back.untrusted, 'content', 'after a restart it is not known where it came from');
    fs.rmSync(path.join(dir, 'inbox'), { recursive: true });
    e.attachments.clear();
    assert.equal(e.revive({ id }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('editing and the content card: one way out, the box is not used', () => {
  const r = read('src/renderer.ts');
  const c = read('src/chat/content-context.ts');
  const e = read('src/chat/message-editor.ts');
  assert.doesNotMatch(r, /prompt\.value = r\.text/);
  assert.doesNotMatch(e, /prompt/);
  assert.match(c, /if \(sending \|\| !context\) return;/);
  assert.doesNotMatch(c, /requestSubmit/);
  assert.match(r, /dropped\.sent\(sentIds\)/);
  // only what went out leaves the box: a drop during the send keeps its attachment
  assert.doesNotMatch(r.slice(r.indexOf('async function sendMessage'), r.indexOf('const editor = messageEditor')), /features\.clear\(\)/);
});

test('Charles goes back only for this drag, and never during another', () => {
  const main = read('app/main.cjs');
  assert.match(main, /if \(drag && drag\.id === petDragId\) sendPetBack\(drag\.origin\);/);
  assert.match(main, /if \(petDrag\) \{\s+\/\/ in the user's hand/);
  assert.match(main, /if \(run !== contentRun\) return;/);
});

test('no work while nothing happens: frames, previews, pickers, sound, windows, helpers', () => {
  const loop = read('src/island/animation-loop.ts');
  assert.match(loop, /const left = last \? 1000 \/ rate/);
  const preview = read('src/settings/slime-preview.ts');
  assert.doesNotMatch(preview, /requestAnimationFrame/);
  assert.match(preview, /IntersectionObserver/);
  for (const f of ['src/chat/model-picker.ts', 'src/chat/effort-picker.ts']) {
    assert.doesNotMatch(read(f), /setInterval\(sync/);
    assert.match(read(f), /watchSelect\(select, sync\)/);
  }
  const sound = read('src/vendor/core/sound.ts');
  assert.match(sound, /src\.onended = \(\) => \{\s+this\.sounding--;\s+this\.idle\(\);/);
  const main = read('app/main.cjs');
  assert.equal(main.match(/new \(require\('\.\/system\/foreground\.cjs'\)\.Foreground\)\(\)/g).length, 1, 'one foreground helper');
  assert.doesNotMatch(main, /setTimeout\(\(\) => grab\.warm\(\), 6000\)/);
});

test('the foreground helper: two callers at once get one answer', async () => {
  const { Foreground } = require('../app/system/foreground.cjs');
  const f = new Foreground();
  let written = 0;
  f.child = { stdin: { write: () => written++ }, kill() {} };
  const a = f.read();
  const b = f.read();
  assert.equal(a, b);
  f.finish({ app: 'x' });
  assert.equal(written, 1);
  assert.deepEqual(await b, { app: 'x' });
});

test('release notes of this version are in English and ship with Charles', () => {
  const { notes } = require('../app/core/release-notes.cjs');
  const v = notes(ROOT, '0.9.19-beta.1');
  assert.match(v.title, /^v0\.9\.19 Beta — November/);
  assert.doesNotMatch(v.body, /[ğışİ]/);
});
