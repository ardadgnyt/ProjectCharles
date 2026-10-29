// v0.9.0: Spotify as up to v0.8.11 (the same media worker, asked every 3 s), with two guards:
// one session manager per worker, the cover's stream is closed, and a worker that keeps answering "unavailable" is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// MediaWorker with a stand-in PowerShell: answers each request line with the next prepared reply
function fakeWorker(replies) {
  const spawned = [];
  const childProcess = {
    spawn: (exe, args) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stdin = new PassThrough();
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        child.emit('exit', 0);
      };
      child.requests = [];
      child.stdin.on('data', (d) => {
        for (const line of String(d).split('\n').filter(Boolean)) {
          child.requests.push(JSON.parse(line));
          const reply = replies.shift();
          setImmediate(() => child.stdout.write(JSON.stringify(reply) + '\n'));
        }
      });
      spawned.push({ exe, args, child });
      return child;
    },
  };
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'node:child_process') return childProcess;
    return load.call(this, request, ...rest);
  };
  try {
    const file = require.resolve('../app/system/media-worker.cjs');
    delete require.cache[file];
    const { MediaWorker } = require(file);
    return { worker: new MediaWorker(), spawned };
  } finally {
    Module._load = load;
  }
}

test('the media worker is the one that worked up to v0.8.11', () => {
  const ps = read('app/system/media-worker.ps1');
  // one session manager for the worker's whole life (not a new one on every status)
  assert.match(ps, /if\(-not \$manager\)\{\$manager=Await-Result \(\$managerType::RequestAsync\(\)\) \$managerType\}/);
  assert.match(ps, /\}catch\{\$manager=\$null;/);
  assert.match(ps, /\$media=\$manager\.GetSessions\(\) \| Where-Object \{\$_\.SourceAppUserModelId -match '\(\?i\)spotify'\} \| Select-Object -First 1/);
  assert.match(ps, /if\(-not \$task\.Wait\(3000\)\)\{throw 'Media timeout'\}/);
  assert.doesNotMatch(ps, /Window-Answer|CharlesSpotifyWindow|-Optional/);
  // the one change: the cover's stream is closed after reading
  assert.match(ps, /\$bytes=\[CharlesMediaArt\]::Read\(\$stream\)\r?\n[^\n]*\r?\n[^\n]*\r?\n\s*try\{\$stream\.Dispose\(\)\}catch\{\}/);
  assert.doesNotMatch(read('app/system/media-worker.cjs'), /'-Mta'|windowOnlyUntil/);
});

test('Spotify is asked every 3 s again (not every second)', () => {
  const personal = read('src/settings/personal.ts');
  assert.match(personal, /nextPoll = Date\.now\(\) \+ \(idle \? 30000 : 3000\);/);
  assert.match(personal, /void attempt\(\(\) => media\(\{ action: 'seek', position: Number\(progress\.value\) \}\)\);/);
});

test('a worker that keeps answering "unavailable" is replaced by a fresh one', async () => {
  const { worker, spawned } = fakeWorker([
    { ok: false, reason: 'media-unavailable' },
    { ok: false, reason: 'media-unavailable' },
    { ok: true, state: 'Playing', title: 'Song', duration: 100, position: 5 },
  ]);
  await worker.request('status');
  await worker.request('status');
  assert.equal(spawned.length, 1);
  const r = await worker.request('status');
  assert.equal(r.state, 'Playing');
  assert.equal(spawned.length, 2, 'a new PowerShell after two unavailable answers');
  assert.equal(spawned[0].child.killed, true);
  worker.stop();
});

test('"Çalmaya başla" with Spotify closed opens Spotify (as before)', async () => {
  const { Desktop } = require('../app/system/desktop.cjs');
  const opened = [];
  const d = new Desktop({ openExternal: async (u) => opened.push(u) }, async () => ({ stdout: '[]' }), () => null);
  d.helper = async () => ({ ok: false, reason: 'media-unavailable' });
  await d.media('play');
  assert.deepEqual(opened, [], 'not for an unavailable answer');
  let n = 0;
  d.helper = async () => (++n < 2 ? { ok: false, reason: 'no-session' } : { ok: true, state: 'Playing' });
  assert.equal((await d.media('play')).state, 'Playing');
  assert.deepEqual(opened, ['spotify:']);
});

test('the island and the cards stay off the taskbar; only the app window has a button', () => {
  const main = read('app/main.cjs');
  assert.match(main, /for \(const event of \['show', 'focus', 'restore'\]\)\s*islandWin\.on\(event, \(\) => setImmediate\(offTaskbar\)\);/);
  assert.match(main, /taskbarTimer = setInterval\(offTaskbar, 4000\);/);
  assert.match(main, /if \(islandWin && !islandWin\.isDestroyed\(\)\) islandWin\.setSkipTaskbar\(true\);/);
  assert.match(main, /createAppWindow\(\);\s*appWin\.setSkipTaskbar\(false\);/);
  assert.match(main, /appWin\.hide\(\);\s*appWin\.setSkipTaskbar\(true\);/);
  assert.match(main, /clearInterval\(taskbarTimer\);/);
  const mb = read('app/plugins/mail-bubble.cjs');
  // v0.9.2: the card window stays focusable (toggling it broke clicks on Windows); the focus
  // action still keeps it off the taskbar
  assert.match(mb, /if \(action === 'focus'\) \{[\s\S]{0,400}w\.setSkipTaskbar\(true\);/);
  assert.match(mb, /offTaskbar\(\) \{/);
});

test('version 0.9.0 is in the changelog', () => {
  assert.match(read('CHANGELOG.md'), /## v0\.9\.0 Beta/);
});
