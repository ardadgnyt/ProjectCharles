const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Preferences } = require('../app/core/preferences.cjs'),
  { memoryCommand } = require('../app/personal/memory.cjs'),
  { Personal } = require('../app/personal/personal.cjs'),
  { bounds } = require('../app/core/layout.cjs'),
  { Weather } = require('../app/personal/weather.cjs'),
  { Companion, localSuggestion } = require('../app/personal/companion.cjs');
function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v2-'));
}
test('Dock geometry handles negative screen origins and clamps panel height to work area', () => {
  const area = { x: -1440, y: 0, width: 1440, height: 900 };
  assert.deepEqual(bounds(area, { expanded: true, side: 'right', height: 1000 }), {
    x: -620,
    y: 0,
    width: 620,
    height: 900,
  });
  // v0.8.10: the closed island is the 380 px notch
  assert.equal(bounds(area, { expanded: false, side: 'center', height: 620 }).x, -910);
});
test('Name and study context persist across sessions and explicit forgetting removes it', () => {
  const dir = temp();
  try {
    let p = new Personal(dir);
    assert.match(memoryCommand('Bana Peder diye hitap et', p), /Peder/);
    memoryCommand('Bugün MAT101 çalışıyoruz', p);
    p = new Personal(dir);
    assert.match(memoryCommand('Ne çalışıyorduk?', p), /MAT101/);
    memoryCommand('Bana Deniz diye hitap et', p);
    assert.equal(p.data.memories.filter((m) => m.key === 'address').length, 1);
    assert.match(p.memory(), /Deniz/);
    memoryCommand('1 numaralı hafıza kaydını sil', p);
    assert.equal(
      p.data.memories.some((m) => m.key === 'address'),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Weather validates place names and caches successful weather reads', async () => {
  let calls = 0;
  const w = new Weather(async (url) => {
    calls++;
    return {
      ok: true,
      json: async () =>
        url.includes('geocoding')
          ? { results: [{ name: 'Ankara', latitude: 39.9, longitude: 32.8, country: 'Türkiye' }] }
          : { current: { temperature_2m: 18.4, weather_code: 0 } },
    };
  });
  const cities = await w.cities('Ankara');
  assert.equal(cities.length, 1);
  assert.match((await w.current(cities[0])).text, /18°/);
  await w.current(cities[0]);
  assert.equal(calls, 2);
  await assert.rejects(() => w.cities('a'));
});
test('AI suggestions respect opt-out, idle eligibility, daily budget and time limits', () => {
  const dir = temp();
  try {
    const prefs = new Preferences(dir);
    assert.equal(prefs.data.aiSuggestions, false);
    prefs.update({ setup: true, observeApps: true, aiSuggestions: true });
    const c = new Companion({
      root: dir,
      prefs,
      send: () => {},
      eligible: () => true,
      model: () => null,
    });
    const now = Date.now();
    c.app = 'Code';
    c.started = now - 70000;
    c.changedAt = now - 70000;
    assert(c.canSuggest(now));
    prefs.data.aiSuggestions = false;
    assert(!c.canSuggest(now));
    prefs.data.aiSuggestions = true;
    prefs.data.usage = { day: new Date(now).toLocaleDateString('en-CA'), last: 0, count: 8 };
    assert(!c.canSuggest(now));
    prefs.data.usage.count = 0;
    prefs.data.usage.last = now;
    assert(!c.canSuggest(now));
    assert.match(localSuggestion('WINWORD'), /Belgeden/);
    c.stop();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
