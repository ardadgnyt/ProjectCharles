const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  os = require('os'),
  path = require('path');
const { readStore, writeStore } = require('../app/core/store.cjs');
const { Personal } = require('../app/personal/personal.cjs');
test('Null-filled settings recover without losing preserved bytes; valid backup restores values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-recover-'));
  try {
    const file = path.join(dir, 'personal.json');
    writeStore(file, { access: 'ask', memories: [] });
    writeStore(file, { access: 'full', memories: [] });
    fs.writeFileSync(file, Buffer.alloc(447));
    const p = new Personal(dir);
    assert.equal(p.data.access, 'ask');
    assert.match(p.recoveryWarning, /yedek geri/);
    const preserved = fs.readdirSync(dir).find((n) => n.includes('corrupt'));
    assert.deepEqual(fs.readFileSync(path.join(dir, preserved)), Buffer.alloc(447));
    p.save();
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('A completed temporary write is recovered before the previous backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-recover-'));
  try {
    const file = path.join(dir, 'sample.json');
    fs.writeFileSync(file, Buffer.alloc(3));
    fs.writeFileSync(file + '.tmp', '{"revision":2}');
    fs.writeFileSync(file + '.bak', '{"revision":1}');
    const r = readStore(file, (v) => !!v.revision);
    assert.equal(r.value.revision, 2);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).revision, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Interrupted rotation (only .tmp/.bak left) is recovered on read; zero-filled file never becomes .bak', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-recover-'));
  try {
    const file = path.join(dir, 'h.json');
    fs.writeFileSync(file + '.tmp', '{"revision":3}');
    fs.writeFileSync(file + '.bak', '{"revision":2}');
    assert.equal(readStore(file).value.revision, 3);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).revision, 3);
    writeStore(file, { revision: 4 });
    assert.equal(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).revision, 3);
    fs.writeFileSync(file, Buffer.alloc(10));
    writeStore(file, { revision: 5 });
    assert.equal(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).revision, 3);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).revision, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
