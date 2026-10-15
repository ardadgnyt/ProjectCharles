// v0.6.1: accessory categories (Şapka · Göz · Yüz · Diğer), monocle.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Personal } = require('../app/personal/personal.cjs');

function loadTs(file) {
  const esbuild = require('esbuild');
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const m = { exports: {} };
  const code = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}

test('hat, glasses and scarf are stored together; pumpkin and hat clash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-061-'));
  const p = new Personal(dir);
  p.edit('accessories', { hat: 'fedora', eyes: 'monocle', other: 'scarf', slime: 'slime:blue:1' });
  assert.equal(p.data.outfit, 'fedora');
  assert.equal(p.data.eyewear, 'monocle');
  assert.equal(p.data.otherWear, 'scarf');
  assert.equal(p.data.slime, 'slime:blue:1');
  assert.throws(() => p.edit('accessories', { hat: 'crown', other: 'pumpkin' }), /Balkabağı/);
  assert.throws(() => p.edit('accessories', { eyes: 'fedora' }));
  p.edit('accessories', { hat: 'none', eyes: 'none', other: 'pumpkin' });
  assert.equal(p.data.otherWear, 'pumpkin');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an old single outfit moves to its own category', () => {
  for (const [old, field] of [
    ['sunglasses', 'eyewear'],
    ['scarf', 'otherWear'],
    ['crown', 'outfit'],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-061m-'));
    fs.writeFileSync(path.join(dir, 'personal.json'), JSON.stringify({ outfit: old }));
    const p = new Personal(dir);
    assert.equal(p.data[field], old);
    if (field !== 'outfit') assert.equal(p.data.outfit, 'none');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('"Mevsime göre" fills the right slot and never puts a hat on the pumpkin', () => {
  const { wornAccessories, clashes, slotOf } = loadTs('src/vendor/slime/wardrobe.ts');
  const summer = new Date(2026, 6, 10);
  const winter = new Date(2026, 11, 10);
  assert.deepEqual(wornAccessories({ hat: 'auto', eyes: 'none', other: 'none' }, summer), {
    hat: 'none',
    eyes: 'sunglasses',
    other: 'none',
    hand: 'none',
  });
  assert.deepEqual(wornAccessories({ hat: 'auto', eyes: 'monocle', other: 'none' }, summer), {
    hat: 'none',
    eyes: 'monocle',
    other: 'none',
    hand: 'none',
  });
  assert.equal(
    wornAccessories({ hat: 'auto', eyes: 'none', other: 'none' }, winter).hat,
    'santaHat',
  );
  assert.equal(
    wornAccessories({ hat: 'auto', eyes: 'none', other: 'pumpkin' }, winter).hat,
    'none',
  );
  assert.equal(clashes({ hat: 'fedora', eyes: 'none', other: 'pumpkin' }), true);
  assert.equal(clashes({ hat: 'fedora', eyes: 'monocle', other: 'scarf' }), false);
  assert.equal(slotOf('monocle'), 'eyes');
  assert.equal(slotOf('pumpkin'), 'other');
  assert.equal(slotOf('bow'), 'hat');
});
