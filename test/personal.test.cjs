const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  os = require('os'),
  path = require('path');
const { Personal } = require('../app/personal/personal.cjs');
const { Sessions } = require('../app/ai/sessions.cjs');
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-personal-'));
  return {
    dir,
    p: new Personal(dir),
    close() {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
test('Memory create/edit/delete survives restart and validates limits', () => {
  const f = fixture();
  try {
    f.p.edit('memory-save', { text: 'Kısa yanıt ver.' });
    const id = f.p.data.memories[0].id;
    f.p.edit('memory-save', { id, text: 'Türkçe yanıt ver.' });
    assert.equal(new Personal(f.dir).memory(), 'Türkçe yanıt ver.');
    assert.throws(() => f.p.edit('memory-save', { text: 'x'.repeat(2001) }));
    f.p.edit('memory-delete', { id });
    assert.equal(new Personal(f.dir).memory(), '');
  } finally {
    f.close();
  }
});
test('Reminder fires once, overdue survives restart, focus pause resumes remaining time', () => {
  const f = fixture();
  try {
    f.p.edit('reminder-add', { title: 'Mola', due: Date.now() + 60000, kind: 'focus' });
    const id = f.p.data.reminders[0].id;
    f.p.edit('timer-toggle', { id });
    assert.equal(f.p.due(Date.now() + 120000).length, 0);
    f.p.edit('timer-toggle', { id });
    const due = f.p.data.reminders[0].due;
    const again = new Personal(f.dir);
    assert.equal(again.due(due + 1).length, 1);
    assert.equal(again.due(due + 2).length, 0);
    assert.equal(new Personal(f.dir).data.reminders[0].status, 'done');
    assert.throws(() => f.p.edit('reminder-add', { title: 'Geçmiş', due: 0 }));
  } finally {
    f.close();
  }
});
test('Appearance range validation and reset', () => {
  const f = fixture();
  try {
    f.p.edit('appearance', { font: 99, scale: 100, pet: 0, opacity: 0, accent: 'url(evil)' });
    assert.deepEqual(f.p.data.appearance, {
      font: 18,
      scale: 1.15,
      pet: 0.8,
      opacity: 1, // v0.7.0: opacity is no longer adjustable
      accent: '#edc9a9',
    });
  } finally {
    f.close();
  }
});
test('History rename pin search and delete; active work cannot be deleted', () => {
  const f = fixture();
  const s = new Sessions(process.cwd(), f.dir);
  try {
    s.local('eski metin', 'yanıt');
    const id = s.active;
    s.manage({ id, action: 'rename', name: 'Yeni ad' });
    s.manage({ id, action: 'pin' });
    assert.equal(s.list()[0].name, 'Yeni ad');
    assert(s.list()[0].pinned);
    assert.ok(s.search('eski metin').includes(id));
    s.current.agent.busy = true;
    assert.throws(() => s.manage({ id, action: 'delete' }));
    s.current.agent.busy = false;
    s.manage({ id, action: 'delete' });
    assert(!s.rooms.has(id));
    assert.equal(s.rooms.size, 1);
  } finally {
    s.stop();
    f.close();
  }
});
