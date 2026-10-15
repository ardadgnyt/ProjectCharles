const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { preview, save, guide } = require('../app/personal/profile-transfer.cjs');
const { importCreator } = require('../app/personal/creator-profile.cjs');
const { Personal } = require('../app/personal/personal.cjs');
const { threadParams } = require('../app/core/policy.cjs');
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-profile-'));
  try {
    fn(dir, new Personal(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
test('Profile guide covers identity, work and behavior; importing validates, deduplicates and persists only selected text', () =>
  fixture((dir, p) => {
    assert.match(guide(), /CHARLES BENİMLE NASIL KONUŞMALI/);
    assert.match(guide(), /DEVAM EDEN PROJELER/);
    const items = preview(
      '```json\n' +
        JSON.stringify({
          sections: [
            { title: 'Hitap', text: 'Bana Deniz de.' },
            { title: 'Okul', text: 'Örnek okul.' },
          ],
        }) +
        '\n```',
    );
    assert.equal(p.data.memories.length, 0);
    assert.equal(save(p, [items[0]]).added, 1);
    assert.equal(save(p, [items[0]]).added, 0);
    assert.equal(new Personal(dir).data.memories.length, 1);
    assert(!p.memory().includes('Örnek okul'));
    assert.throws(() => preview('geçersiz'), /JSON/);
    assert.throws(() => preview('{"sections":null}'));
    assert.throws(() => save(p, [items[0], { title: 'X', text: 'x'.repeat(2100) }]));
    assert.equal(p.data.memories.length, 1);
    p.data.memories = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      text: 'x'.repeat(1850),
    }));
    assert.throws(() => save(p, [{ title: 'Uzun', text: 'y'.repeat(300) }]), /15.000/);
    assert.equal(p.data.memories.length, 8);
  }));
test('Creator data is optional, imported once, does not change access and can be deleted without reimport', () =>
  fixture((dir, p) => {
    assert.equal(importCreator(dir, p), false);
    assert(!p.memory().includes('yaratıcı'));
    fs.writeFileSync(
      path.join(dir, 'Charles-creator.json'),
      JSON.stringify({
        format: 'charles-creator-profile',
        version: 1,
        creator: 'HzPederPan',
        role: 'creator',
      }),
    );
    assert.equal(importCreator(dir, p), true);
    assert.equal(p.data.access, 'ask');
    assert.equal(importCreator(dir, new Personal(dir)), false);
    p.edit('memory-delete', { id: p.data.memories[0].id });
    assert.equal(importCreator(dir, p), false);
    assert.equal(p.data.memories.length, 0);
    for (const mode of ['chat', 'project'])
      assert.match(threadParams(dir, null, mode).developerInstructions, /HzPederPan/);
  }));
