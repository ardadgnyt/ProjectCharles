// v0.8.14: Spotify is found again (a stuck media worker restarts, Spotify's window as a fallback),
// the music card opens Spotify, a five-day weather sheet, new clicks on the island.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('"Çalmaya başla" and a click on the music card open Spotify', async () => {
  const { Desktop } = require('../app/system/desktop.cjs');
  const opened = [];
  const d = new Desktop({ openExternal: async (u) => opened.push(u) }, async () => ({ stdout: '[]' }), () => null);
  let n = 0;
  d.helper = async () => (++n < 3 ? { ok: false, reason: 'no-session' } : { ok: true, state: 'Playing' });
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
  // v0.8.15 changed the shelf again (see test/v0815.test.cjs)
  assert.match(shelf, /if \(view === 'shelf' && !onPath\(e, [^)]*\)\)\s*void attempt/);
  assert.match(read('src/island/companion.ts'), /api\.islandView\('notch'\)/);
});

test('chat: Slime a little higher with room above "Charles"', () => {
  const css = read('public/styles/22-v0814.css');
  assert.match(css, /header > \.character-center \{\s*top: 28px !important;/);
  assert.match(css, /header #pet \{\s*margin: 0 0 10px !important;/);
});

test('new texts are translated', () => {
  const en = read('src/settings/i18n-0814.ts');
  for (const s of ['5 günlük tahmin', 'Hissedilen', 'Bugün', 'Yarın', 'Şehri değiştir']) assert.ok(en.includes(`"${s}"`), s);
  assert.match(read('src/settings/i18n.ts'), /english0811, english0814/);
  for (const lang of ['de', 'fr', 'es', 'zh']) assert.match(read(`src/settings/lang/${lang}.ts`), /"Feels like": /, lang);
});

test('module notices: no copies, close by themselves, a click opens the module, the card window comes up under the pointer', () => {
  const main = read('app/main.cjs');
  assert.match(main, /notify: \(title, text, moduleId\) => \{/);
  assert.match(main, /i\.module === \(moduleId \|\| null\) && i\.reason === text\) mailBubble\.remove\(i\.id\);/);
  assert.match(main, /ttl: 60000,/);
  assert.match(main, /moduleHost\.open\(String\(item\.module\)\);/);
  assert.match(main, /mailBubble\?\.hover\(point\);/);
  const host = read('app/modules/host.cjs');
  assert.match(host, /deps\.notify\(name, str\(args\?\.text, 'text', 300\), id\);/);
  const mb = read('app/plugins/mail-bubble.cjs');
  assert.match(mb, /if \(ttl > 0\) setTimeout\(\(\) => this\.remove\(item\.id\)/);
  assert.match(mb, /hover\(point\) \{/);
  assert.match(read('public/bubble.js'), /\(item\.module \? ' module' : ''\)/);
});

test('version 0.8.14 is in the changelog', () => {
  assert.match(read('CHANGELOG.md'), /## v0\.8\.14 Beta/);
});


test('module notice closes by itself (ttl); a removed card is not drawn again', async () => {
  const electron = { BrowserWindow: class {}, ipcMain: { on() {}, handle() {} }, screen: {} };
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return electron;
    return load.call(this, request, ...rest);
  };
  let b;
  try {
    const file = require.resolve('../app/plugins/mail-bubble.cjs');
    delete require.cache[file];
    const { MailBubble } = require(file);
    b = new MailBubble({ anchor: () => null, onOpen: () => {} });
  } finally {
    Module._load = load;
  }
  let renders = 0;
  b.render = async () => renders++;
  b.add({ id: 'module|1', kind: 'charles', module: 'study', reason: 'Mola bitti', ttl: 20 });
  assert.equal(b.items.length, 1);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(b.items.length, 0);
  const before = renders;
  b.remove('module|1');
  assert.equal(renders, before, 'removing a card that is gone does not redraw');
  assert.equal(b.hover({ x: 0, y: 0 }), undefined);
});
