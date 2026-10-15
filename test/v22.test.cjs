const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  os = require('os'),
  path = require('path');
const { PerformanceHistory } = require('../app/system/performance.cjs'),
  { Sessions } = require('../app/ai/sessions.cjs'),
  { Personal } = require('../app/personal/personal.cjs'),
  { taskMode } = require('../app/core/task-mode.cjs');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v22-'));
test('CPU aggregation, time windows, GPU unavailable, local persistence and retention', () => {
  const d = temp();
  let p;
  try {
    p = new PerformanceHistory(d);
    const now = Date.now(),
      cores = os.cpus().length;
    const snap = (cpu, gpuAvailable = true) => ({
      gpuAvailable,
      items: [
        { id: 1, start: 'a', name: 'Editor', cpu, ram: 400, gpu: 30 },
        { id: 2, start: 'b', name: 'Browser', cpu: cpu / 4, ram: 900, gpu: 8 },
        { id: 3, start: 'c', name: 'Editor', cpu: cpu / 2, ram: 100, gpu: 4 },
      ],
    });
    p.record(snap(0), now - 120000);
    assert.match(p.answer('son 1 saatte CPU ne kullandı', now), /henüz/);
    p.record(snap(cores * 6), now - 60000);
    p.record(snap(cores * 12), now);
    assert.match(
      p.answer('bu hafta en çok cpu yu ne kullandı', now),
      /1\. \*\*Editor\*\* — 15.0 %/,
    );
    assert.match(p.answer('son bir saatte RAM ne kullandı', now), /1\. \*\*Browser\*\* — 900.0 MB/);
    assert.match(p.answer('son 1 saat GPU en çok ne kullandı', now), /Editor\*\* — 30.0 %/);
    assert.equal(p.answer('CPU nedir?', now), null);
    p.db.close();
    p = new PerformanceHistory(d);
    assert.match(p.answer('CPU ne kullandı', now), /Editor/);
    p.record(snap(0, false), now + 60000);
    p.record(snap(cores * 6, false), now + 120000);
    assert.match(p.answer('son 1 dakika GPU ne kullandı', now + 120001), /veri vermedi/);
    p.record(snap(0), now + 9 * 86400000);
    p.record(snap(cores * 6), now + 9 * 86400000 + 60000);
    assert.equal(p.db.prepare('SELECT COUNT(*) n FROM samples').get().n, 1);
    p.set(false);
    p.db.close();
    p = new PerformanceHistory(d);
    assert.equal(p.read().enabled, false);
    p.clear();
    assert.equal(p.read().first, null);
  } finally {
    p?.stop();
    p?.db.close();
    fs.rmSync(d, { recursive: true, force: true });
  }
});
test('Edited branches and image thumbnails survive restart without altering original turns', async () => {
  const d = temp();
  let s;
  try {
    s = new Sessions(process.cwd(), d);
    s.current.agent.ready = true;
    s.current.agent.send = async () => ({});
    const image = { name: 'test.png', thumbnail: 'data:image/png;base64,abcd', kind: 'image' };
    await s.send({ prompt: 'Görseli açıkla', mode: 'chat', cwd: d, displayAttachments: [image] });
    s.local('İkinci', 'Yanıt');
    const original = s.active;
    s.editMessage(0);
    s.local('Yeni görsel sorusu', 'Yeni yanıt');
    const edited = s.active;
    assert.equal(s.snapshot().branches[0].length, 2);
    s.editMessage(1); // second user does not exist in this branch
  } catch (e) {
    assert.match(e.message, /Mesaj bulunamadı/);
  } finally {
    if (s) {
      const current = s.active;
      s.stop();
      s = new Sessions(process.cwd(), d);
      s.select(current);
      assert.equal(s.snapshot().branches[0].length, 2);
      const original = [...s.rooms.values()].find((r) => r.events[0]?.data === 'Görseli açıkla');
      assert.equal(original.events[0].attachments[0].name, 'test.png');
      s.stop();
    }
    fs.rmSync(d, { recursive: true, force: true });
  }
});
test('Color updates are atomic and task modes do not add API billing paths', () => {
  const d = temp();
  try {
    const p = new Personal(d);
    p.edit('colors', { send: '#123456' });
    assert.throws(() => p.edit('colors', { badge: '#abcdef', send: 'bad' }));
    assert.equal(p.data.colors.send, '#123456');
    assert.equal(new Personal(d).data.colors.send, '#123456');
    assert.equal(taskMode('web').config.web_search, 'live');
    assert.match(taskMode('research').instruction, /mevcut Codex/);
    assert.match(taskMode('image').instruction, /ücretli API alternatifi çalıştırma/);
    assert.throws(() => taskMode('bad'));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
