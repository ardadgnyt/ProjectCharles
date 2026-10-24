// v0.9.1 audit: behaviour tests from the v0.9.0 test plan that can run without Windows,
// accounts or long sessions (the plan's IDs are in the test names).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-audit-'));
const updater = require('../app/core/updater.cjs');
const { zipSync, strToU8 } = require('fflate');

// ── 02. updates ────────────────────────────────────────────────────────────────
const pkgJson = (version = '0.9.1-beta.1', name = 'project-charles') => strToU8(JSON.stringify({ name, version }));
const readZip = (files, opts = { name: 'project-charles', expectVersion: '0.9.1-beta.1' }, zipOpts) => updater.readUpdateZip(zipSync(files, zipOpts), opts);

test('GNC-03: version order (beta.2 < beta.10 < stable, same version, invalid)', () => {
  const c = updater.compareVersions;
  assert.equal(c('0.9.1-beta.2', '0.9.1-beta.10'), -1);
  assert.equal(c('0.9.1-beta.10', '0.9.1'), -1);
  assert.equal(c('0.9.1-beta.1', '0.9.1-beta.1'), 0);
  assert.equal(c('v0.10.0', '0.9.9'), 1);
  assert.equal(c('0.9.0', 'modules-1.0'), null);
});

test('GNC-05: a changed byte, a wrong name or version: rejected before anything is written', () => {
  const body = strToU8('console.log("x' + 'y'.repeat(4000) + '");');
  for (const level of [0, 6]) {
    const z = zipSync({ 'package.json': pkgJson(), 'app/a.js': body }, { level });
    z[Buffer.from(z).indexOf('app/a.js') + 8 + 20] ^= 1;
    assert.throws(() => updater.readUpdateZip(z, { name: 'project-charles' }), /bozuk/, 'level ' + level);
  }
  assert.throws(() => readZip({ 'package.json': pkgJson('0.9.1-beta.1', 'other') }), /başka bir uygulamaya/);
  assert.throws(() => readZip({ 'package.json': pkgJson('0.9.0-beta.1') }), /beklenenle aynı değil/);
  assert.throws(() => readZip({ 'app/a.js': body }), /package\.json yok/);
  assert.equal(readZip({ 'package.json': pkgJson(), 'app/a.js': body }).version, '0.9.1-beta.1');
});

test('GNC-09: unsafe paths, case clashes, Windows device names and protected files are refused', () => {
  const x = strToU8('x');
  for (const bad of ['../evil.js', 'app/../../evil.js', '/etc/x', 'C:/Windows/x', 'app\\..\\x', 'app/a.js:stream', 'app/x.', 'app/CON', 'app/nul.txt', 'app/com1.log'])
    assert.throws(() => readZip({ 'package.json': pkgJson(), [bad]: x }), /güvenli olmayan/, bad);
  assert.throws(() => readZip({ 'package.json': pkgJson(), 'App/a.js': x, 'app/A.js': x }), /aynı adlı/);
  for (const p of ['charles-history.json', '.ENV', '_update/x', 'charles-creator.json'])
    assert.throws(() => readZip({ 'package.json': pkgJson(), [p]: x }), /korunan/, p);
});

test('GNC-11: only GitHub release hosts over https on the default port; every redirect is checked', async () => {
  const ok = updater.allowedUrl;
  for (const u of ['https://github.com/a', 'https://objects.githubusercontent.com/a', 'https://release-assets.githubusercontent.com/a']) assert.equal(ok(u), true, u);
  for (const u of ['http://github.com/a', 'https://evil.com/a', 'https://github.com.evil.com/a', 'https://u:p@github.com/a', 'https://raw.githubusercontent.com/someone/repo/a.zip', 'https://github.com:8443/a'])
    assert.equal(ok(u), false, u);
  // a redirect through a host that is not GitHub is never asked
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url === 'https://github.com/r/a.zip') return { status: 302, headers: new Map([['location', 'https://evil.example/a.zip']]) };
    return { status: 200, ok: true, url, headers: new Map(), body: null };
  };
  await assert.rejects(updater.download('https://github.com/r/a.zip', path.join(tmp(), 'a'), { fetchImpl }), /GitHub dışından/);
  assert.deepEqual(asked, ['https://github.com/r/a.zip']);
  // GitHub → its own file host: followed
  const dir = tmp();
  const data = new TextEncoder().encode('abc');
  const asked2 = [];
  const good = async (url) => {
    asked2.push(url);
    if (url.startsWith('https://github.com/')) return { status: 302, headers: new Map([['location', 'https://objects.githubusercontent.com/f']]) };
    let sent = false;
    return { status: 200, ok: true, url, headers: new Map([['content-length', '3']]), body: { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: data })) }) } };
  };
  assert.equal(await updater.download('https://github.com/r/b.zip', path.join(dir, 'b'), { fetchImpl: good }), 3);
  assert.deepEqual(asked2, ['https://github.com/r/b.zip', 'https://objects.githubusercontent.com/f']);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── 03. Spotify / media worker ───────────────────────────────────────────────────
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
/** MediaWorker with a stand-in PowerShell whose answers the test writes itself. */
function worker() {
  const spawned = [];
  const cp = {
    spawn: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stdin = new PassThrough();
      child.killed = false;
      child.kill = () => {
        if (child.killed) return;
        child.killed = true;
        setImmediate(() => child.emit('exit', 0));
      };
      child.requests = [];
      child.stdin.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => child.requests.push(JSON.parse(l))));
      child.say = (line) => child.stdout.write(line + '\n');
      spawned.push(child);
      return child;
    },
  };
  const load = Module._load;
  Module._load = function (request, ...rest) {
    return request === 'node:child_process' ? cp : load.call(this, request, ...rest);
  };
  try {
    const file = require.resolve('../app/system/media-worker.cjs');
    delete require.cache[file];
    return { w: new (require(file).MediaWorker)(), spawned };
  } finally {
    Module._load = load;
  }
}
const tick = () => new Promise((r) => setImmediate(r));

test('MED-03/05: one worker for many requests; two "unavailable" in a row → a fresh worker, one alone does not', async () => {
  const { w, spawned } = worker();
  for (let i = 0; i < 5; i++) {
    const p = w.request('status');
    await tick();
    spawned[0].say(JSON.stringify({ ok: true, state: 'Playing' }));
    await p;
  }
  assert.equal(spawned.length, 1, 'no new worker per request');
  const answer = async (line) => {
    const p = w.request('status');
    await tick();
    spawned.at(-1).say(line);
    return p;
  };
  await answer('{"ok":false,"reason":"media-unavailable"}');
  await answer('{"ok":true,"state":"Paused"}');
  await answer('{"ok":false,"reason":"media-unavailable"}');
  assert.equal(spawned.length, 1, 'a single miss keeps the worker');
  await answer('{"ok":false,"reason":"media-unavailable"}');
  assert.equal(spawned[0].killed, true);
  const r = await answer('{"ok":true,"state":"Playing"}');
  assert.equal(r.state, 'Playing');
  assert.equal(spawned.length, 2);
  w.stop();
});

test('MED-06: BOM, broken JSON, an early exit and a late answer from a stopped worker', async () => {
  const { w, spawned } = worker();
  let p = w.request('status');
  await tick();
  spawned[0].say('﻿{"ok":true,"state":"Playing"}');
  assert.equal((await p).state, 'Playing', 'BOM');
  p = w.request('status');
  await tick();
  spawned[0].say('{not json');
  spawned[0].say('{"ok":true,"state":"Paused"}');
  assert.equal((await p).state, 'Paused', 'a broken line is skipped');
  p = w.request('status');
  await tick();
  spawned[0].emit('exit', 1);
  await assert.rejects(p, /kesildi/);
  // the next request starts a new worker; a late line from the old one is not taken for it
  p = w.request('status');
  await tick();
  assert.equal(spawned.length, 2);
  spawned[0].say('{"ok":true,"state":"Stopped","title":"old"}');
  await tick();
  spawned[1].say('{"ok":true,"state":"Playing","title":"new"}');
  assert.equal((await p).title, 'new');
  assert.ok(read('app/system/media-worker.cjs').includes('}, 8000);'), 'the 8 s limit for a silent worker');
  w.stop();
});

test('MED-02: Spotify is asked every 3 s (30 s while Slime is out on the desktop), not every second', () => {
  const personal = read('src/settings/personal.ts');
  assert.match(personal, /nextPoll = Date\.now\(\) \+ \(idle \? 30000 : 3000\);/);
  assert.doesNotMatch(personal, /\? 1000 : 3000/);
});

// ── 05. Electron, pages, links ──────────────────────────────────────────────────
test('ELK-01: every window keeps the page isolated (sandbox, context isolation, no Node)', () => {
  for (const f of ['app/main.cjs', 'app/modules/host.cjs', 'app/modules/download/bridge.cjs', 'app/files/convert-host.cjs', 'app/system/capture.cjs', 'app/plugins/mail-bubble.cjs']) {
    const s = read(f);
    const blocks = s.split(/new (?:BrowserWindow|WebContentsView)\(/).slice(1).map((b) => b.slice(0, 1400));
    assert.ok(blocks.length, f);
    for (const b of blocks) {
      if (!/webPreferences/.test(b)) continue;
      assert.match(b, /sandbox: true/, f);
      assert.match(b, /contextIsolation: true/, f);
      assert.match(b, /nodeIntegration: false/, f);
      assert.doesNotMatch(b, /webSecurity: false|allowRunningInsecureContent: true|nodeIntegrationInWorker: true/, f);
    }
  }
  const main = read('app/main.cjs');
  // ELK-02: the main page's calls are taken only from the page itself, from charles://app/
  assert.match(main, /event\.sender !== win\.webContents \|\|\s*event\.senderFrame !== win\.webContents\.mainFrame \|\|\s*!event\.senderFrame\.url\.startsWith\('charles:\/\/app\/'\)/);
});

test('ELK-04/05: chat answers never run code or open unsafe links', () => {
  const { buildSync } = require('esbuild');
  const out = buildSync({ entryPoints: [path.join(root, 'src/chat/markdown.ts')], bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent' });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  const r = m.exports.renderMarkdown;
  for (const s of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<svg onload=alert(1)>', '<iframe src="https://e.x">'])
    assert.doesNotMatch(r(s), /<(script|img|svg|iframe)/i, s);
  for (const s of ['[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))', '[x](data:text/html,1)', '[x](file:///C:/Windows/win.ini)', '[x](vbscript:x)'])
    assert.doesNotMatch(r(s), /<a /, s);
  assert.doesNotMatch(r('![a](https://evil.example/pixel.png)'), /<img/, 'no remote pictures from an answer');
  assert.doesNotMatch(r('$\\href{javascript:alert(1)}{x}$'), /href="javascript/);
  assert.doesNotMatch(r('$x" onmouseover="alert(1)$'), /data-tex="x" onmouseover/);
  // links are opened only as http(s) without user names
  assert.match(read('app/main.cjs'), /if \(!\['https:', 'http:'\]\.includes\(url\.protocol\) \|\| url\.username \|\| url\.password\)/);
});

test('ELK-06: module pages cannot read outside their own folder (encoded ../, backslash, links)', () => {
  const { resolveRequest } = require('../app/modules/protocol.cjs');
  const dir = tmp();
  const files = path.join(dir, 'files');
  const data = path.join(dir, 'data');
  fs.mkdirSync(files);
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(files, 'index.html'), 'ok');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'secret');
  try {
    fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(files, 'link.txt'));
  } catch {}
  const roots = (id) => (id === 'a' ? { files, data, entry: 'index.html', kit: null } : null);
  assert.ok(resolveRequest('charles-module://a/', roots).file);
  for (const u of ['charles-module://a/..%2fsecret.txt', 'charles-module://a/%2e%2e/secret.txt', 'charles-module://a/_data/..%2f..%2fsecret.txt', 'charles-module://a/..%5csecret.txt', 'charles-module://a/link.txt', 'charles-module://a/%00x'])
    assert.ok(!resolveRequest(u, roots).file, u);
  assert.equal(resolveRequest('charles-module://b/index.html', roots).status, 404, 'another module');
  assert.equal(resolveRequest('https://a/index.html', roots).status, 403);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── 08/09/11/12. modules, saved data, files, converter ──────────────────────────────
test('MOD-07: module storage stays in its own folder (../, encoded, devices, links, the file itself a link)', () => {
  const { ModuleStorage } = require('../app/modules/storage.cjs');
  const dir = tmp();
  const store = new ModuleStorage(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'secret');
  store.writeFile('notes/a.txt', 'ok');
  assert.equal(store.readFile('notes/a.txt'), 'ok');
  for (const bad of ['../secret.txt', 'notes/../../secret.txt', '..\\secret.txt', '/etc/passwd', 'C:/x.txt', 'CON', 'notes/nul.txt', 'a.txt:stream'])
    assert.throws(() => store.readFile(bad), /Geçersiz|Windows/, bad);
  let linked = true;
  try {
    fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(dir, 'data', 'link.txt'));
    fs.symlinkSync(dir, path.join(dir, 'data', 'up'), 'dir');
  } catch {
    linked = false;
  }
  if (linked) {
    assert.throws(() => store.readFile('link.txt'), /Geçersiz/, 'a link as the file itself');
    assert.throws(() => store.readFile('up/secret.txt'), /Geçersiz/, 'a link as a folder');
    assert.throws(() => store.deleteFile('link.txt'), /Geçersiz/);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'secret.txt'), 'utf8'), 'secret');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('VER-01: a damaged save is kept aside and the last good copy comes back', () => {
  const { readStore, writeStore } = require('../app/core/store.cjs');
  const dir = tmp();
  const file = path.join(dir, 'charles-history.json');
  writeStore(file, { n: 1 });
  writeStore(file, { n: 2 });
  fs.writeFileSync(file, '{"n": 3, "trunc');
  let r = readStore(file);
  assert.deepEqual(r.value, { n: 1 }, 'the backup (.bak) of the last write');
  assert.match(r.warning, /korundu/);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')), 'the damaged file is kept');
  // a crash between the renames: only .tmp / .bak are left
  fs.writeFileSync(file + '.tmp', JSON.stringify({ n: 4 }));
  fs.rmSync(file);
  r = readStore(file);
  assert.deepEqual(r.value, { n: 4 });
  // a zero-filled file never becomes the backup
  const bak = fs.readFileSync(file + '.bak', 'utf8');
  fs.writeFileSync(file, Buffer.alloc(10));
  writeStore(file, { n: 5 });
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), bak);
  assert.deepEqual(readStore(file).value, { n: 5 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('DON-06/07: CSV ↔ JSON keeps quotes, separators, line breaks and Unicode; subtitles keep their times', () => {
  const cv = require('../app/files/convert.cjs');
  const rows = [['ad', 'not'], ['Şule "Ş"', 'a;b\nc'], ['😀', '']];
  for (const sep of [',', ';', '\t']) assert.deepEqual(cv.parseDelimited(cv.writeDelimited(rows, sep), sep), rows, JSON.stringify(sep));
  assert.deepEqual(cv.objectsToTable([{ a: 1 }, { b: null }]), [['a', 'b'], [1, undefined], [undefined, null]]);
  const srt = '1\r\n00:00:01,250 --> 00:00:02,500\r\nMerhaba\r\nikinci satır\r\n\r\n2\r\n00:01:00,000 --> 00:01:01,999\r\nSon\r\n';
  const vtt = cv.srtToVtt(srt);
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:00:01\.250 --> 00:00:02\.500\nMerhaba\nikinci satır/);
  assert.equal(cv.vttToSrt(vtt).trim(), srt.replace(/\r/g, '').trim());
});

test('DON-08: unpacking an archive never leaves its new folder and skips names Windows cannot hold', () => {
  const cv = require('../app/files/convert.cjs');
  const dir = tmp();
  const zip = path.join(dir, 'a.zip');
  const x = strToU8('x');
  fs.writeFileSync(zip, zipSync({ 'ok/a.txt': x, '../escape.txt': x, '/abs.txt': x, 'C:/drive.txt': x, 'b.txt:stream': x, 'CON': x, 'dot.': x }));
  const out = path.join(dir, 'out');
  assert.equal(cv.unzipTo(zip, out), 1);
  assert.deepEqual(fs.readdirSync(out), ['ok']);
  assert.ok(!fs.existsSync(path.join(dir, 'escape.txt')));
  // an existing folder of the same name is never written into
  fs.writeFileSync(path.join(dir, 'a'), 'mine');
  assert.notEqual(cv.uniquePath(dir, 'a', ''), path.join(dir, 'a'));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── 04/16. island and cards ───────────────────────────────────────────────────
test('KIS-02: five days with missing values and an empty answer', async () => {
  const { Weather } = require('../app/personal/weather.cjs');
  const answer = (daily) => new Weather(async () => ({ ok: true, json: async () => ({ current: {}, daily }) }));
  const f = await answer({ time: ['2026-10-24', '2026-10-25'], weather_code: [0, null], temperature_2m_max: [null, 10], temperature_2m_min: [1, null], precipitation_probability_max: [0, 100] }).forecast({ name: 'X', latitude: 1, longitude: 2 });
  assert.equal(f.days.length, 2);
  assert.equal(f.days[0].max, null, 'a missing value stays missing (shown as —), never 0');
  assert.deepEqual([f.days[0].rain, f.days[1].rain], [0, 100]);
  assert.equal(f.current.temp, null);
  await assert.rejects(answer({ time: [] }).forecast({ name: 'X', latitude: 1, longitude: 2 }), /alınamadı/);
  assert.equal(await answer({}).forecast({ name: 'X', latitude: 'a', longitude: 2 }), null);
});

test('PEN-07: clicks — shelf: empty space opens the chat, cream bar closes; chat: empty space → shelf, cream bar closes', () => {
  const companion = read('src/island/companion.ts');
  assert.match(companion, /const barTarget = \(\) => \(document\.body\.dataset\.view === 'shelf' \? 'notch' : 'chat'\);/);
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /if \(view === 'shelf' && !onPath\(e, [^)]*\)\)\s*void attempt\(\(\) => api\.islandView\('chat'\)\);/);
  assert.match(shelf, /void attempt\(\(\) => api\.islandView\('shelf'\)\);/);
});

test('KAL-06: the user guide describes the current island (strip, music notch, shelf, chat)', () => {
  const guide = read('docs/USER-GUIDE.md');
  assert.match(guide, /v0\.9\.1 Beta/);
  assert.match(guide, /thin strip/);
  assert.match(guide, /cream bar below closes the island/);
  assert.doesNotMatch(guide, /Click Slime to open the large panel/);
});

test('GNC-10/DON-08: a zip whose recorded sizes are wrong is neither a bomb nor unpacked as whole', () => {
  const big = Buffer.from(zipSync({ 'package.json': pkgJson(), 'big.bin': new Uint8Array(4 * 1024 * 1024) }));
  // the central directory claims 10 bytes for a 4 MB file
  let p = big.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (p >= 0) {
    if (big.toString('utf8', p + 46, p + 46 + big.readUInt16LE(p + 28)) === 'big.bin') big.writeUInt32LE(10, p + 24);
    p = big.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), p + 4);
  }
  assert.throws(() => updater.readUpdateZip(new Uint8Array(big), { name: 'project-charles' }), /bozuk/);
  const cv = require('../app/files/convert.cjs');
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.zip'), big);
  assert.throws(() => cv.unzipTo(path.join(dir, 'a.zip'), path.join(dir, 'out')), /bozuk/);
  fs.rmSync(dir, { recursive: true, force: true });
});
