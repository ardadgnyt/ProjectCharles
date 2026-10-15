const test = require('node:test'),
  assert = require('node:assert/strict');
const { validateWave, speechText, Voice } = require('../app/voice/voice.cjs');
function wave(n = 16000) {
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 5000), 44 + i * 2);
  return b;
}
test('Voice validates duration, PCM format and silence before invoking native decoder', () => {
  assert.equal(validateWave(wave()).length, 32044);
  const bad = wave();
  bad.writeUInt16LE(2, 22);
  assert.throws(() => validateWave(bad));
  assert.throws(() => validateWave(wave(960001)));
  const silent = wave();
  silent.fill(0, 44);
  assert.throws(() => validateWave(silent), /duyulamadı/);
  assert.throws(() => validateWave('file.wav'));
});
test('Speech reads content without Markdown code blocks and link URLs', () => {
  assert.equal(
    speechText('**Merhaba** [site](https://example.com)\n```js\nsecret()\n```'),
    'Merhaba site\n Kod bölümü ekranda.',
  );
  assert.equal(speechText('x'.repeat(8000)).length, 6000);
});
test('Cancelling speech terminates its own process and releases the job', async () => {
  const v = new Voice('.', '.');
  const run = v.run(process.execPath, ['-e', 'setTimeout(()=>{},60000)']);
  v.stop();
  await assert.rejects(run, /iptal/);
  assert.equal(v.job, null);
});
