const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { Hub, CRASH_LIMIT, EXE } = require('../app/system/helper-hub.cjs');

function fakeProcess() {
  const c = new EventEmitter();
  c.stdout = new PassThrough();
  c.written = [];
  c.stdin = new EventEmitter();
  c.stdin.write = (t) => c.written.push(t);
  c.stdin.end = () => c.emit('ended');
  c.kill = () => {};
  return c;
}
const tick = () => new Promise((r) => setImmediate(r));
const lines = (channel) => {
  const got = [];
  readline.createInterface({ input: channel.stdout }).on('line', (l) => got.push(l));
  return got;
};

test('hub: one process for all channels, lines go to their own channel', async () => {
  const spawned = [];
  const hub = new Hub({ spawn: () => (spawned.push(fakeProcess()), spawned.at(-1)) });
  const fg = hub.open('fg');
  const media = hub.open('media');
  assert.equal(spawned.length, 1);
  const a = lines(fg);
  const b = lines(media);
  fg.stdin.write('read\n');
  media.stdin.write('{"action":"status"}\n');
  assert.deepEqual(spawned[0].written, ['fg\t!open\n', 'media\t!open\n', 'fg\tread\n', 'media\t{"action":"status"}\n']);
  spawned[0].stdout.write('media\t{"ok":true}\nfg\t{"app":"x"}\nnobody\t1\n');
  await tick();
  await tick();
  assert.deepEqual(a, ['{"app":"x"}']);
  assert.deepEqual(b, ['{"ok":true}']);
});

test('hub: refuses a channel that is not on the list', () => {
  assert.throws(() => new Hub({ spawn: fakeProcess }).open('shell'), /Invalid channel/);
});

test('hub: the helper ends with the last channel, and that is no fall', () => {
  const spawned = [];
  const hub = new Hub({ spawn: () => (spawned.push(fakeProcess()), spawned.at(-1)) });
  const fg = hub.open('fg');
  const media = hub.open('media');
  let ended = 0;
  spawned[0].on('ended', () => ended++);
  media.kill();
  assert.equal(ended, 0);
  assert.ok(spawned[0].written.includes('media\t!close\n'));
  fg.kill();
  assert.equal(ended, 1);
  assert.equal(hub.child, null);
  spawned[0].emit('exit', 0);
  assert.equal(hub.falls.length, 0);
  hub.open('fg');
  assert.equal(spawned.length, 2, 'a later channel starts it again');
});

test('hub: a helper that fell closes its channels; repeated falls stop the restarts', async () => {
  let now = 1000;
  const spawned = [];
  const hub = new Hub({ spawn: () => (spawned.push(fakeProcess()), spawned.at(-1)), now: () => now });
  for (let i = 0; i < CRASH_LIMIT; i++) {
    const c = hub.open('fg');
    let exited = 0;
    c.on('exit', () => exited++);
    spawned.at(-1).emit('exit', 1);
    assert.equal(exited, 1, 'its users see it go');
    now += 1000;
  }
  assert.equal(spawned.length, CRASH_LIMIT);
  const refused = hub.open('fg');
  const seen = await new Promise((resolve) => refused.on('error', resolve));
  assert.match(seen.message, /çalışmıyor/);
  assert.equal(spawned.length, CRASH_LIMIT, 'no new process');
  now += 6 * 60000;
  hub.open('fg');
  assert.equal(spawned.length, CRASH_LIMIT + 1, 'after the rest it may try again');
});

test('hub: refresh reaches hooks and media once; Charles closing ends the process', () => {
  const spawned = [];
  const hub = new Hub({ spawn: () => (spawned.push(fakeProcess()), spawned.at(-1)) });
  for (const n of ['fg', 'media', 'keys', 'metrics']) hub.open(n);
  hub.refresh();
  assert.deepEqual(spawned[0].written.filter((l) => l.includes('!refresh')), ['fg\t!refresh\n', 'media\t!refresh\n', 'keys\t!refresh\n']);
  let ended = 0;
  spawned[0].on('ended', () => ended++);
  hub.stop();
  assert.equal(ended, 1);
  assert.equal(hub.channels.size, 0);
});

test('foreground: a report answers read() without asking, and reaches who watches', async () => {
  const { Foreground } = require('../app/system/foreground.cjs');
  const child = fakeProcess();
  const f = new Foreground({ spawnHelper: () => child });
  const seen = [];
  f.watch((v) => seen.push(v.app));
  child.stdout.write('{"app":"Code","pid":1,"window":5,"full":false,"live":true}\n');
  await tick();
  await tick();
  assert.deepEqual(seen, ['Code']);
  assert.equal((await f.read()).app, 'Code');
  assert.equal(child.written.length, 0);
});

test('foreground: without the event hook each read asks the helper', async () => {
  const { Foreground } = require('../app/system/foreground.cjs');
  const child = fakeProcess();
  const f = new Foreground({ spawnHelper: () => child });
  const a = f.read();
  child.stdout.write('{"app":"Code","live":false}\n');
  assert.equal((await a).app, 'Code');
  void f.read();
  assert.equal(child.written.length, 2);
  f.stop();
});

test('media: a change is passed on and takes no request\'s answer', async () => {
  const { MediaWorker } = require('../app/system/media-worker.cjs');
  const child = fakeProcess();
  let changed = 0;
  const w = new MediaWorker({ spawnHelper: () => child, onChange: () => changed++ });
  const r = w.request('status');
  await tick();
  child.stdout.write('{"changed":true}\n{"ok":true,"state":"Playing"}\n');
  assert.equal((await r).state, 'Playing');
  assert.equal(changed, 1);
  w.stop();
});

test('usage statistics come from the helper; no shell per sample', async () => {
  const { PerformanceHistory } = require('../app/system/performance.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-usage-'));
  const child = fakeProcess();
  const h = new PerformanceHistory(dir, { spawnHelper: () => child });
  const answer = (o) => child.stdout.write(JSON.stringify(o) + '\n');
  const first = h.sample();
  answer({ gpuAvailable: false, items: [{ id: 1, name: 'a', start: '1', cpu: 1, ram: 10, gpu: null }] });
  await first;
  assert.equal(h.lastError, '');
  assert.deepEqual(child.written, ['usage\n']);
  const second = h.sample();
  answer({ failed: true });
  await second;
  assert.match(h.lastError, /okunamıyor/);
  h.stop();
  h.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.doesNotMatch(read('app/system/performance.cjs'), /powershell|execFile/i);
});

test('the five all-day PowerShell helpers are gone', () => {
  for (const f of ['foreground', 'media-worker', 'dictation-keys', 'live-metrics', 'performance'])
    assert.equal(fs.existsSync(path.join(ROOT, 'app/system', f + '.ps1')), false, f);
  for (const f of ['foreground', 'media-worker', 'live-metrics', 'performance', 'screen-grab'])
    assert.doesNotMatch(read(`app/system/${f}.cjs`), /powershell\.exe/i, f);
  assert.doesNotMatch(read('app/voice/dictation.cjs'), /powershell\.exe/i);
  assert.doesNotMatch(read('app/main.cjs'), /screen-grab\.cjs'\)\.warm/);
});

test('the helper runs no command and opens no window', () => {
  const cs = read('setup/CharlesHelper.cs');
  assert.doesNotMatch(cs, /Process\.Start|ProcessStartInfo|cmd\.exe|powershell\.exe|ShellExecute/i);
  assert.match(read('scripts/build-helper.ps1'), /\/target:winexe/);
  assert.match(read('app/system/helper-hub.cjs'), /windowsHide: true/);
});

test('the helper ships with both packages', () => {
  const { BASE } = require('../scripts/release-pack.cjs');
  assert.ok(BASE.includes('app'));
  assert.ok(BASE.includes('setup'));
  assert.match(read('scripts/release-pack.cjs'), /charles-helper\.exe missing/);
  assert.doesNotMatch(read('scripts/package.py'), /charles-helper/);
});

const hasHelper = process.platform === 'win32' && fs.existsSync(EXE);
test('real helper: requests that are not on the list are refused, the hub survives them', { skip: !hasHelper && 'needs the helper' }, async () => {
  const hub = new Hub();
  const keys = hub.open('keys');
  const media = hub.open('media');
  const k = lines(keys);
  const m = lines(media);
  for (const bad of ['garbage', '{"cmd":"run","file":"calc.exe"}', '{"cmd":"sim","op":"down"}']) keys.stdin.write(bad + '\n');
  media.stdin.write('{"action":"open"}\n');
  await new Promise((r) => setTimeout(r, 1200));
  assert.ok(k.includes('{"r":null}'), 'bad JSON is answered as a failure');
  assert.ok(k.includes('{"swallow":true}'), 'the channel still works');
  assert.deepEqual(m, ['{"ok":false,"reason":"media-unavailable"}']);
  const child = hub.child;
  hub.stop();
  await new Promise((r) => child.once('exit', r));
});

test('real helper: push-to-talk gestures are the ones of v0.9.18', { skip: !hasHelper && 'needs the helper' }, async () => {
  const hub = new Hub();
  const keys = hub.open('keys');
  const k = lines(keys);
  const sim = (op) => keys.stdin.write(JSON.stringify({ cmd: 'sim', op }) + '\n');
  // hold
  for (const op of ['down', 'hold', 'up']) sim(op);
  // a tap gives the key back
  for (const op of ['down', 'up', 'tap']) sim(op);
  // double press: hands free, third press ends it
  for (const op of ['down', 'up', 'down', 'up', 'down', 'up']) sim(op);
  // key repeat while held is one press
  for (const op of ['down', 'hold', 'down', 'down', 'up']) sim(op);
  // Esc cancels
  for (const op of ['down', 'hold', 'esc', 'reset', 'up']) sim(op);
  await new Promise((r) => setTimeout(r, 900));
  const events = k.filter((l) => l.startsWith('{"e"')).map((l) => JSON.parse(l).e);
  assert.deepEqual(events, ['loaded', 'hold', 'stop', 'inject', 'free', 'stop', 'hold', 'stop', 'hold', 'cancel']);
  assert.equal(JSON.parse(k.at(-1)).state, 'Idle');
  const child = hub.child;
  hub.stop();
  await new Promise((r) => child.once('exit', r));
});

test('mail date with a calendar that can be written: added directly, nothing opened', async () => {
  const { deadlineProposal } = require('../app/plugins/deadlines.cjs');
  const when = new Date(Date.now() + 5 * 86400000);
  const iso = when.toISOString().slice(0, 10) + 'T14:30';
  const reminders = [];
  const personal = { data: { reminders }, edit: (a, v) => reminders.push(v) };
  const added = [];
  const opened = [];
  let fail = true;
  const make = () =>
    deadlineProposal({
      mail: { id: 'm1', title: 'Toplantı' },
      deadline: iso,
      event: 'Staj görüşmesi',
      personal,
      dir: os.tmpdir(),
      open: (f) => (opened.push(f), ''),
      calendar: {
        name: 'Google Takvim',
        add: async (ev) => {
          if (fail) throw Error('Bağlantı başarısız (HTTP 500).');
          added.push(ev);
          return { id: ev.uid };
        },
      },
    });
  const p = make();
  assert.deepEqual(p.actions.map((a) => a.id), ['calendar', 'remind', 'file', 'no']);
  assert.equal(p.actions[0].primary, true);
  await assert.rejects(p.actions[0].run(), /HTTP 500/);
  assert.equal(reminders.length, 0, 'a failed add leaves no half of it');
  fail = false;
  const reply = await p.actions[0].run();
  assert.match(reply, /Google Takvim’e ekledim/);
  assert.equal(added[0].allDay, false);
  assert.equal(new Date(added[0].start).getHours(), 14);
  assert.equal(new Date(added[0].start).getMinutes(), 30);
  assert.equal(reminders.length, 2);
  assert.equal(opened.length, 0, 'no program was opened');
  await make().actions[0].run();
  assert.equal(added[0].uid, added[1].uid, 'the same mail and date: one id');
  assert.equal(reminders.length, 2, 'no second reminders');
  assert.match(added[0].uid, /^[a-v0-9]{5,}$/);
});

test('Google answers "already there": said so, no error', async () => {
  const { Plugins } = require('../app/plugins/plugins.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-gcal-'));
  const p = new Plugins(dir, { isEncryptionAvailable: () => false }, () => {}, () => {}, async () => ({ ok: false, status: 409, json: async () => ({}) }));
  p.data.tokens.gcal = { access: 'x' };
  p.token = async () => 'x';
  const writer = p.calendarWriter();
  assert.equal(writer.name, 'Google Takvim');
  const r = await writer.add({ title: 'A', start: Date.now() + 86400000, uid: 'abc12345' });
  assert.deepEqual(r, { id: 'abc12345', existed: true });
  p.data.tokens.gcal = null;
  assert.equal(p.calendarWriter(), null, 'Outlook reads only, so no writer without Google');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a failed answer keeps the question; two at once run once', async () => {
  const { Proposals } = require('../app/core/proposals.cjs');
  let runs = 0;
  let fail = true;
  const p = new Proposals({ show: () => {} });
  const id = p.add({
    text: 'x',
    actions: [{ id: 'a', label: 'A', run: async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 5));
      if (fail) throw Error('olmadı');
      return 'tamam';
    } }],
  });
  await assert.rejects(p.answer(id, 'a'), /olmadı/);
  fail = false;
  const first = p.answer(id, 'a');
  await assert.rejects(p.answer(id, 'a'), /işleniyor/);
  assert.equal((await first).reply, 'tamam');
  assert.equal(runs, 2);
  await assert.rejects(p.answer(id, 'a'), /geçerli değil/);
});

test('shelf drag name: broken like a desktop icon, never cut in the middle of the column', () => {
  const src = read('src/island/file-rack.ts');
  const body = /export function nameLines[\s\S]*?\n}\n/.exec(src)[0].replace('export ', '').replace(/: \(text: string\) => number|: string\[\]|: string|: number/g, '');
  const nameLines = new Function('const MAX_LINES = 6;\n' + body + '; return nameLines;')();
  const measure = (t) => t.length * 7; // 7 px a letter
  const whole = (lines) => lines.join('');
  const name = 'ardadoganyigit_osymsonuc.pdf';
  const lines = nameLines(measure, name, 77);
  assert.deepEqual(lines, ['ardadoganyi', 'git_osymson', 'uc.pdf'], 'the look of the Windows picture');
  assert.equal(whole(lines), name);
  for (const n of ['a.txt', 'Şubat ödeme çizelgesi güncel.xlsx', 'çok uzun bir türkçe dosya adı ve boşluklar var.pdf']) {
    const l = nameLines(measure, n, 96);
    assert.ok(l.every((x) => measure(x) <= 96), n);
    assert.equal(l.join(' ').replace(/ /g, ''), n.replace(/ /g, ''), n);
  }
  const long = 'x'.repeat(300) + '.pdf';
  const cut = nameLines(measure, long, 96);
  assert.equal(cut.length, 6);
  assert.ok(cut.at(-1).startsWith('…') && cut.at(-1).endsWith('.pdf'), 'the end of the name stays');
  assert.match(src, /const GHOST_W = 180;/, 'no room for the path Electron writes beside the picture');
  assert.match(src, /const ICON = 48;/);
  assert.match(src, /const NAME_W = 74;/);
  const main = read('app/main.cjs');
  assert.match(main, /win\.webContents\.startDrag\(\{ file, icon \}\)/);
  assert.match(main, /rackDragging = true;\s+dropHeldUntil = Number\.MAX_SAFE_INTEGER;[\s\S]{0,1400}?try \{\s+win\.webContents\.startDrag/, 'the panel stays and timers wait');
  assert.match(main, /finally \{[\s\S]{0,160}?rackDragging = false;/, 'and they go on after it, whatever happened');
  for (const place of [/function offTaskbar\(\) \{\s+if \(rackDragging\) return;/, /function applyTopmost\(\) \{\s+if \(!win \|\| win\.isDestroyed\(\) \|\| rackDragging\) return;/, /win\.isMinimized\(\) \|\| rackDragging\) return;/, /workspace \|\| rackDragging\) return;/]) assert.match(main, place);
});

test('island size: Small is 2/3 of Large, from the same numbers, and the panel does not change', () => {
  const { bounds, NOTCH, HIDDEN, ISLAND_SMALL, shelfSize } = require('../app/core/layout.cjs');
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const at = (island, state) => bounds(area, { side: 'center', height: 620, ...state, ...(island ? { island } : {}) });
  const notch = { expanded: false, hidden: false, music: true };
  const strip = { expanded: false, hidden: true };
  assert.deepEqual([at(null, notch).width, at(null, notch).height], [NOTCH.width, NOTCH.height]);
  assert.deepEqual([at(null, strip).width, at(null, strip).height], [HIDDEN.width, HIDDEN.height]);
  const small = at(ISLAND_SMALL, notch);
  assert.deepEqual([small.width, small.height], [253, 44]);
  assert.ok(Math.abs(small.width / NOTCH.width - 2 / 3) < 0.01);
  assert.ok(Math.abs(small.height / NOTCH.height - 2 / 3) < 0.01);
  assert.equal(small.x, Math.round((1920 - 253) / 2), 'still in the middle');
  assert.equal(at(ISLAND_SMALL, strip).width, 160);
  for (const open of [{ expanded: true, hidden: false, chat: true }, { expanded: true, hidden: false, chat: false, shelf: 300 }])
    assert.deepEqual(at(ISLAND_SMALL, open), at(null, open), 'the open panel');
  assert.equal(shelfSize(300).width, 640);
  // back and forth adds nothing up: both are worked out from the base numbers
  assert.deepEqual(at(null, notch), at(1, notch));
});

test('island size: a setting of its own, Large unless chosen, and old settings keep working', () => {
  const { Personal } = require('../app/personal/personal.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-look-'));
  fs.writeFileSync(path.join(dir, 'personal.json'), JSON.stringify({ memories: [], appearance: { font: 15, scale: 1.1, accent: '#112233', opacity: 1, pet: 0.9 } }));
  const p = new Personal(dir);
  assert.equal(p.data.appearance.island, 'large');
  assert.equal(p.data.appearance.font, 15, 'nothing else was reset');
  const look = { font: 15, scale: 1.1, pet: 0.9, accent: '#112233' };
  p.edit('appearance', { ...look, island: 'small' });
  assert.equal(p.data.appearance.island, 'small');
  p.edit('appearance', { ...look, island: 'huge' });
  assert.equal(p.data.appearance.island, 'small', 'an unknown value changes nothing');
  p.edit('appearance', look);
  assert.equal(p.data.appearance.island, 'small');
  p.edit('appearance', { ...look, island: 'large' });
  assert.equal(p.data.appearance.island, 'large');
  fs.rmSync(dir, { recursive: true, force: true });
  const html = read('public/index.html');
  assert.match(html, /Charles adacık boyutu[\s\S]*?value="large">Büyük[\s\S]*?value="small">Küçük/);
  assert.match(read('public/styles/37-v0920.css'), /zoom: 0\.6667/);
  assert.match(read('src/settings/personal.ts'), /classList\.toggle\('island-small'/);
  assert.match(read('app/main.cjs'), /island: personal\?\.data\.appearance\.island === 'small' \? ISLAND_SMALL : 1/);
});

test('this version', () => {
  const { notes } = require('../app/core/release-notes.cjs');
  const v = notes(ROOT, '0.9.20-beta.1');
  assert.match(v.title, /^v0\.9\.20 Beta — November/);
  assert.doesNotMatch(v.body, /[ğışİ]/);
});
