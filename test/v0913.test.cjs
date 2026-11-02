// v0.9.13: the redesigned island home page, WhatsApp quiet catch-up / muted chats, hourly weather.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the home page grows with its panel, within limits', () => {
  const { shelfSize, SHELF, SHELF_MIN, SHELF_MAX } = require('../app/core/layout.cjs');
  assert.equal(shelfSize(undefined).height, SHELF.height);
  assert.equal(shelfSize(5).height, SHELF_MIN);
  assert.equal(shelfSize(5000).height, SHELF_MAX);
  assert.equal(shelfSize(400).width, SHELF.width);
  assert.match(read('app/main.cjs'), /safeHandler\('shelf-height'/);
  assert.match(read('app/preload.cjs'), /shelfHeight: \(value\) => invoke\('shelf-height', value\)/);
});

test('three cards with panels, a message box with a voice-call button', () => {
  const shelf = read('src/island/shelf.ts');
  for (const s of ["acc('files'", "acc('usage'", "acc('weather'", "viaComposer('voice-call')", "viaComposer('voice-mic')", "filesAcc.b.dataset.drop = 'files'"]) assert.ok(shelf.includes(s), s);
  // a panel no longer pins the island open (only a transfer does)
  assert.match(shelf, /api\.shelfHold\?\.\(kind === 'files' && share\.busy\(\)\)/);
  // a drop on the Dosyalar card itself is not added to the chat
  assert.match(read('app/preload.cjs'), /closest\('\[data-drop="files"\]'\)\) return;/);
  assert.match(read('public/index.html'), /styles\/29-v0913\.css/);
  assert.match(read('public/index.html'), /<option value="project">Proje<\/option>/);
});

test('weather: the next hours of today', async () => {
  const { Weather } = require('../app/personal/weather.cjs');
  let url = '';
  const times = Array.from({ length: 24 }, (_, i) => `2026-11-02T${String(i).padStart(2, '0')}:00`);
  const w = new Weather(async (u) => {
    url = String(u);
    return {
      ok: true,
      json: async () => ({
        current: { time: '2026-11-02T21:45', temperature_2m: 11.2, weather_code: 2 },
        hourly: { time: times, temperature_2m: times.map((_, i) => i), weather_code: times.map(() => 61), precipitation_probability: times.map(() => 50) },
        daily: { time: ['2026-11-02'], weather_code: [2], temperature_2m_max: [18], temperature_2m_min: [9], precipitation_probability_max: [10] },
      }),
    };
  });
  const f = await w.forecast({ name: 'Ankara', latitude: 39.9, longitude: 32.8 });
  assert.match(url, /hourly=temperature_2m,weather_code,precipitation_probability/);
  assert.deepEqual(f.hours.map((h) => h.time), ['21:00', '22:00', '23:00']);
  assert.equal(f.hours[1].temp, 22);
  assert.equal(f.hours[0].text, 'Yağışlı');
});

test('WhatsApp: muted / archived chats, quiet catch-up, one sound per burst', () => {
  const wa = require('../app/plugins/whatsapp-live.cjs');
  const f = wa.chatFlagsFrom([
    { chat_jid: 'a@s.whatsapp.net', muted: 1, archived: 0 },
    { chat_jid: 'g@g.us', muted: 0, archived: 1 },
    { chat_jid: 'c@s.whatsapp.net', muted: 0, archived: 0 },
  ]);
  assert.deepEqual([...f.muted], ['a@s.whatsapp.net']);
  assert.deepEqual([...f.archived], ['g@g.us']);
  assert.deepEqual([...wa.addLinkedJids(new Set(['12@lid']), [{ lid: '12', pn: '905551112233' }])], ['12@lid', '905551112233@s.whatsapp.net']);
  const live = read('app/plugins/whatsapp-live.cjs');
  assert.match(live, /if \(this\.silenced\(m\.chat\)\) return;/);
  assert.match(live, /const quiet = !this\.startedAt \|\| m\.at < this\.startedAt - 1000;/);
  assert.match(read('app/main.cjs'), /if \(!update && !quiet && win/);
  assert.match(read('src/renderer.ts'), /Date\.now\(\) - lastWhatsappSound < 4000/);
  assert.match(read('public/bubble.js'), /element\('button', 'close wa-x', '×'\)/);
});

test('small fixes: composer scroll, magnifier turns, mode switch', () => {
  assert.match(read('src/settings/settings-pages.ts'), /text\.scrollTop = atEnd \? text\.scrollHeight : top;/);
  assert.match(read('src/vendor/slime/engine.ts'), /if \(this\.shownStation === 'web'\) x\.translate\(Math\.sin\(this\.yaw\) \* rx \* 0\.9, 0\);/);
  assert.match(read('src/island/mode-seg.ts'), /Object\.defineProperty\(select, 'value'/);
});

test('the new home page is translated', () => {
  const i18n = read('src/settings/i18n-0913.ts');
  for (const s of ['Dönüştür veya gönder', 'BUGÜN · SAATLİK', 'YAKINDAKİ CİHAZLAR', 'Spotify · Hazır', 'Kredi']) assert.ok(i18n.includes(s), s);
  assert.match(i18n, /sağlayıcı\$\/, \(_, n\) =>/);
  for (const lang of ['de', 'fr', 'es', 'zh']) {
    const t = read(`src/settings/lang/${lang}.ts`);
    for (const k of ['"Convert or send"', '"TODAY · HOURLY"', '"{n} providers"', '"same network"', '"Credits"']) assert.ok(t.includes(k), lang + ' ' + k);
  }
});
