const test = require('node:test'),
  assert = require('node:assert/strict');
const { weatherReply } = require('../app/personal/weather-chat.cjs');
test('Generic weather questions use saved city; unrelated or other city requests stay with AI', async () => {
  const city = { name: 'Ankara', latitude: 39.9, longitude: 32.8 };
  let calls = 0;
  const weather = {
    current: async (c) => {
      assert.equal(c, city);
      calls++;
      return { text: 'Ankara · 17° · Açık ☀️' };
    },
  };
  for (const prompt of [
    'hava durumu ne',
    'Hava nasıl?',
    'Bugün hava durumu nasıl?',
    'Şu an kaç derece?',
  ])
    assert.match(await weatherReply(prompt, city, weather), /Ankara · 17°/);
  assert.equal(calls, 4);
  for (const prompt of [
    'İstanbul hava durumu',
    'yarın hava nasıl',
    'hava durumu uygulaması yaz',
    'hava durumu ne demek',
  ])
    assert.equal(await weatherReply(prompt, city, weather), null);
  assert.match(await weatherReply('hava durumu ne', null, weather), /konumunu seç/);
  assert.match(
    await weatherReply('hava nasıl', city, {
      current: async () => {
        throw Error('offline');
      },
    }),
    /ulaşamıyorum/,
  );
});
