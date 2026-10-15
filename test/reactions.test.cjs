const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module');
const { transformSync } = require('esbuild');
const file = path.resolve(__dirname, '../src/chat/reactions.ts');
const m = new Module(file, module);
m._compile(
  transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
  file,
);
const { textReaction, isRateLimit } = m.exports;
test('All expressions have real Turkish message triggers', () => {
  const cases = {
    'Merhaba Charles': 'greet',
    'Seni seviyorum': 'love',
    'Aferin, iyi iş çıkardın': 'proud',
    'Teşekkür ederim': 'happy',
    'Vay canına, şaşırdım': 'surprised',
    'Uykum geldi': 'yawn',
    'Aramızda kalsın ;)': 'wink',
    'Sana takılıyorum': 'annoyed',
  };
  for (const [message, reaction] of Object.entries(cases))
    assert.equal(textReaction(message), reaction, message);
  assert.equal(textReaction('Bu dosyayı incele'), null);
});
test('Quota failures are distinguished from unrelated errors', () => {
  for (const s of ['Usage limit reached', '429 Too many requests', 'Kullanım limitine ulaşıldı'])
    assert.equal(isRateLimit(s), true, s);
  for (const s of ['File not found', 'Network disconnected'])
    assert.equal(isRateLimit(s), false, s);
});
