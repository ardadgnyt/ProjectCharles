// v0.6.3: Turkish flag on national days, English translations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function loadTs(file) {
  const esbuild = require('esbuild');
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const m = { exports: {} };
  const code = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}

test('the flag is worn automatically on 19 Mayıs, 30 Ağustos, 29 Ekim and 10 Kasım', () => {
  const { wornAccessories, isNationalDay } = loadTs('src/vendor/slime/wardrobe.ts');
  const base = { hat: 'none', eyes: 'none', other: 'banana' };
  for (const [m, d] of [
    [5, 19],
    [8, 30],
    [10, 29],
    [11, 10],
  ]) {
    const day = new Date(2026, m - 1, d, 12);
    assert.equal(isNationalDay(day), true);
    assert.equal(wornAccessories(base, day).hand, 'flag'); // missing = auto
    assert.equal(wornAccessories({ ...base, hand: 'auto' }, day).hand, 'flag');
    assert.equal(wornAccessories(base, day).other, 'banana'); // goes with the rest
  }
  const plain = new Date(2026, 9, 14);
  assert.equal(isNationalDay(plain), false);
  assert.equal(wornAccessories(base, plain).hand, 'none');

});

test('English: settings texts, line-broken HTML texts and texts with numbers are translated', () => {
  const esbuild = require('esbuild');
  const out = esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', 'src/settings/i18n.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  const { englishFor } = m.exports;
  assert.equal(englishFor('Mimikleri dene'), 'Try expressions');
  assert.equal(englishFor('Takibi\n                  duraklat'), 'Pause monitoring');
  assert.equal(englishFor('5 saatlik Codex kalan kullanım: 72%'), '5-hour Codex remaining: 72%');
  assert.equal(englishFor('2sa 15dk'), '2h 15m');
  assert.equal(englishFor('29 Ekim'), 'October 29');
  assert.equal(englishFor('Zephyr · Parlak'), 'Zephyr · Bright');
  assert.equal(englishFor('Bu metin sözlükte yok'), undefined);
});
