// v0.8.14: Spotify is found again (a stuck media worker restarts, Spotify's window as a fallback),
// the music card opens Spotify, a five-day weather sheet, new clicks on the island.
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

test('media worker: a hung Windows media call starts a fresh worker, then reads Spotify’s window for a while', async () => {
  const { worker, spawned } = fakeWorker([
    { ok: false, reason: 'timeout', restart: true },
    { ok: true, state: 'Playing', title: 'Song', artist: 'Band', fallback: true },
  ]);
  const first = await worker.request('status');
  assert.equal(first.reason, 'timeout');
  assert.equal(spawned.length, 1);
  assert.ok(spawned[0].args.includes('-Mta'), 'awaited from a multithreaded apartment');
  const second = await worker.request('status');
  assert.equal(second.state, 'Playing');
  assert.equal(spawned.length, 2, 'a new PowerShell after the hang');
  assert.deepEqual(spawned[1].child.requests[0], { action: 'status', window: true });
  worker.stop();
});

test('media worker script: timeouts restart it, Spotify’s window answers when sessions fail', () => {
  const ps = read('app/system/media-worker.ps1');
  assert.match(ps, /\$script:restart=\$true;throw \[System\.TimeoutException\]/);
  assert.match(ps, /if\(\$script:restart\)\{\[Console\]::Out\.Flush\(\);exit 0\}/);
  assert.match(ps, /function Window-Status \{/);
  assert.match(ps, /if\(-not \$media\)\{\[Console\]::WriteLine\(\(Window-Answer \$action\)\);continue\}/);
  assert.match(ps, /if\(\$request\.window -eq \$true\)/);
  // the song's name may come late: the session still counts as playing
  assert.match(ps, /TryGetMediaPropertiesAsync\(\)\) \$propertyType 2500/);
  // several Spotify sessions: the one that plays
  assert.match(ps, /PlaybackStatus\.ToString\(\) -eq 'Playing'\)\{return \$s\}/);
});

test('"Çalmaya başla" and a click on the music card open Spotify', async () => {
  const { Desktop } = require('../app/system/desktop.cjs');
  const opened = [];
  const d = new Desktop({ openExternal: async (u) => opened.push(u) }, async () => ({ stdout: '[]' }), () => null);
  let n = 0;
  d.helper = async () => (++n < 3 ? { ok: false, reason: 'media-unavailable' } : { ok: true, state: 'Playing' });
  const r = await d.media('play');
  assert.deepEqual(opened, ['spotify:']);
  assert.equal(r.state, 'Playing');
  assert.equal(await d.openSpotify(), 'Spotify');
  assert.match(read('app/main.cjs'), /safeHandler\('spotify-open', \(\) => desktop\.openSpotify\(\)\)/);
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /if \(onPath\(e, 'button, input'\)\) return;\s*void attempt\(\(\) => api\.spotifyOpen\(\)\);/);
});

test('weather: five days from Open-Meteo, in a sheet the size of AI usage', async () => {
  const { Weather } = require('../app/personal/weather.cjs');
  let url = '';
  const w = new Weather(async (u) => {
    url = String(u);
    return {
      ok: true,
      json: async () => ({
        current: { temperature_2m: 16.4, apparent_temperature: 15.2, relative_humidity_2m: 71, wind_speed_10m: 9.6, weather_code: 2 },
        daily: { time: ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'], weather_code: [0, 61, 95, 71, 3], temperature_2m_max: [20.2, 17, 15, 3, 18], temperature_2m_min: [10, 9, 8, -2, 7], precipitation_probability_max: [0, 80, 60, 40, 10] },
      }),
    };
  });
  const f = await w.forecast({ name: 'Ankara, Türkiye', latitude: 39.9, longitude: 32.8 });
  assert.match(url, /forecast_days=5/);
  assert.match(url, /daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max/);
  assert.equal(f.city, 'Ankara');
  assert.deepEqual([f.current.temp, f.current.feels, f.current.humidity, f.current.wind, f.current.text], [16, 15, 71, 10, 'Parçalı bulutlu']);
  assert.equal(f.days.length, 5);
  assert.deepEqual(f.days.map((d) => d.emoji), ['☀️', '🌧️', '⛈️', '❄️', '🌤️']);
  assert.deepEqual(f.days[3], { date: '2026-10-27', code: 71, text: 'Karlı', emoji: '❄️', max: 3, min: -2, rain: 40 });
  assert.equal(await w.forecast(null), null);
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /weatherCard\.onclick = \(\) => openWeather\(\);/);
  assert.match(shelf, /viaChat\('weather-idle', true\);/);
  assert.match(read('app/main.cjs'), /safeHandler\('weather-forecast'/);
  const css = read('public/styles/22-v0814.css');
  assert.match(css, /#shelf \.shelf-sheet\[data-kind='weather'\] \{\s*right: auto;\s*width: 290px;/);
  assert.match(read('public/index.html'), /styles\/22-v0814\.css/);
});

test('clicks: the chat goes back to the shelf, the shelf closes the island; the cream bar stays', () => {
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /view === 'chat' && e\.button === 0 && empty\(t\) && !t\.closest\('\.character-center'\)\) \{\s*e\.stopImmediatePropagation\(\);\s*void attempt\(\(\) => api\.islandView\('shelf'\)\);/);
  assert.match(shelf, /if \(view === 'shelf' && !onPath\(e, [^)]*\)\)\s*void attempt\(\(\) => api\.islandView\('notch'\)\);/);
  assert.match(shelf, /on the shelf an empty part of the top bar closes the island\s*e\.stopImmediatePropagation\(\);\s*void attempt\(\(\) => api\.islandView\('notch'\)\);/);
  // the cream bar: in the chat it closes, on the shelf it opens the chat (unchanged)
  const companion = read('src/island/companion.ts');
  assert.match(companion, /api\.islandView\('notch'\)/);
  assert.match(companion, /api\.islandView\('chat'\)/);
});

test('chat: Slime a little higher with room above "Charles"', () => {
  const css = read('public/styles/22-v0814.css');
  assert.match(css, /header > \.character-center \{\s*top: 28px !important;/);
  assert.match(css, /header #pet \{\s*margin: 0 0 10px !important;/);
});

test('new texts are translated', () => {
  const en = read('src/settings/i18n-0814.ts');
  for (const s of ['5 günlük tahmin', 'Hissedilen', 'Bugün', 'Yarın', 'Şehri değiştir']) assert.ok(en.includes(`"${s}"`), s);
  assert.match(read('src/settings/i18n.ts'), /english0811, english0814\)/);
  for (const lang of ['de', 'fr', 'es', 'zh']) assert.match(read(`src/settings/lang/${lang}.ts`), /"Feels like": /, lang);
});

test('version 0.8.14', () => {
  assert.equal(JSON.parse(read('package.json')).version, '0.8.14-beta.1');
  assert.match(read('public/index.html'), /v0\.8\.14 Beta/);
  assert.match(read('setup/install.ps1'), /\$Version = 'v0\.8\.14 Beta'/);
  assert.match(read('CHANGELOG.md'), /## v0\.8\.14 Beta/);
});

