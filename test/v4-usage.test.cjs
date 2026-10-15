const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { ComputerTime } = require('../app/system/computer-time.cjs'),
  { Weekly, weekStart } = require('../app/system/weekly.cjs');
test('Application time splits switches and week boundaries, persists, and excludes lock/sleep', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-usage-'));
  try {
    const now = Date.now(),
      start = weekStart(now),
      c = new ComputerTime(dir);
    c.sample(start - 15000, 'active', 'game');
    c.sample(start + 15000, 'active', 'editor');
    c.sample(start + 30000, 'active', 'editor');
    c.sample(start + 45000, 'locked', 'lockapp');
    c.sample(start + 60000, 'active', 'browser');
    c.sample(start + 90000, 'idle', 'browser');
    c.sample(start + 500000, 'idle', 'browser');
    const r = c.read(start, start + 600000);
    assert.equal(r.computerSeconds, 60);
    assert.deepEqual(r.apps, [
      { name: 'browser', seconds: 30, activeSeconds: 0 },
      { name: 'game', seconds: 15, activeSeconds: 15 },
      { name: 'editor', seconds: 15, activeSeconds: 15 },
    ]);
    c.save();
    assert.deepEqual(new ComputerTime(dir).read(start, start + 600000), r);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Current week includes completed and ongoing turns while Monday summary stays previous week', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-weekly-'));
  try {
    const w = new Weekly(dir),
      now = Date.now(),
      start = weekStart(now);
    w.data.rows = [
      { room: 'last', start: start - 1000, seconds: 20 },
      { room: 'now', start: start + 1, seconds: 30 },
    ];
    w.active.set('active', { room: 'active', start: now - 1000, files: [], model: 'GPT' });
    assert.equal(w.read(now).turns, 1);
    const r = w.read(now, 'current');
    assert.equal(r.turns, 2);
    assert.equal(r.seconds, 31);
    assert.equal(r.end, now);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
