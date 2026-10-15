const test = require('node:test'),
  assert = require('node:assert/strict');
const { parse } = require('../app/plugins/plugin-commands.cjs');
const { runVoicePlugin } = require('../app/voice/live-plugins.cjs');
const screenshot = 'okul mailimi kontrol eder misin önemli bir mail var mı gelen';
test('Compound mailbox questions use the explicit Charles account', () => {
  for (const text of [
    screenshot,
    'Okul mailimi kontrol eder misin? Önemli bir mail var mı gelen?',
    'Hey Charles, okul mailimi kontrol et ve kısaca özetle',
    'Okul mailimde önemli bir mail var mı?',
    'Okul mailimi kontrol edebilir misin',
    'Okul hesabımdaki maillerimi incele',
  ])
    assert.deepEqual(parse(text), { kind: 'school', query: '', summary: true }, text);
  assert.equal(parse('Gmail maillerimi kontrol et önemli bir mail var mı').kind, 'gmail');
  assert.equal(parse('Outlook gelen kutumu kontrol edip özetle').kind, 'outlook');
  assert.equal(parse('Maillerimi kontrol eder misin yeni bir mail var mı').kind, 'mail');
});
test('Mail discussion, negation and modifications do not trigger mailbox reads', () => {
  for (const text of [
    'Okul mailimi kontrol etme',
    'Okul mailimi nasıl bağlarım',
    'Okul mailimi sil',
    'Okul mailimi kontrol et ve herkese gönder',
    'Hikayede okul mailimi kontrol eder misin dedim',
    'Şunu çevir: okul mailimi kontrol eder misin',
    'Okul mailimi "kontrol eder misin" cümlesini çevir',
  ])
    assert.equal(parse(text), null, text);
});
test('Voice compound question reads only school messages and propagates connection failures', async () => {
  const calls = [];
  const plugins = {
    list: async (kind) => {
      calls.push(['list', kind]);
      return [
        { id: 'old', date: '2026-01-01' },
        { id: 'new', date: '2026-10-12' },
      ];
    },
    read: async (kind, id) => {
      calls.push(['read', kind, id]);
      return { id, text: 'Synthetic school message' };
    },
  };
  const result = await runVoicePlugin({ plugins, transcript: screenshot });
  assert.equal(result.source, 'school');
  assert.deepEqual(calls, [
    ['list', 'school'],
    ['read', 'school', 'new'],
    ['read', 'school', 'old'],
  ]);
  await assert.rejects(
    () =>
      runVoicePlugin({
        plugins: {
          list: async () => {
            throw Error('School connection failed');
          },
        },
        transcript: screenshot,
      }),
    /School connection failed/,
  );
});
