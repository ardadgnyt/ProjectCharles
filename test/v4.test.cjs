const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Sessions } = require('../app/ai/sessions.cjs'),
  { ChatFolders } = require('../app/ai/chat-folders.cjs');
test('Invalid saved folder cycles and orphan links recover to a finite tree', () => {
  const { restoreFolders } = require('../app/ai/chat-folders.cjs');
  const folders = restoreFolders([
    { id: 'a', name: 'A', parentId: 'b' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'missing' },
  ]);
  assert.equal(folders[0].parentId, null);
  assert.equal(folders[2].parentId, null);
});
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v4-'));
  const s = new Sessions(dir, dir),
    f = new ChatFolders(s);
  return {
    s,
    f,
    dir,
    close: () => {
      s.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
test('AI classification runs separately, respects disabled auto mode and never adds turns to chat', async () => {
  const x = setup();
  try {
    const { ChatClassifier } = require('../app/ai/chat-classifier.cjs'),
      { EventEmitter } = require('node:events');
    let calls = 0,
      changed = 0;
    class Fake extends EventEmitter {
      async connect() {}
      async send(args) {
        calls++;
        assert.equal(args.mode, 'chat');
        assert.match(args.prompt, /Dersler/);
        this.emit('event', {
          type: 'agent',
          data: {
            method: 'item/completed',
            params: { item: { type: 'agentMessage', text: '{"category":"Dersler"}' } },
          },
        });
        this.emit('event', {
          type: 'agent',
          data: { method: 'turn/completed', params: { turn: { status: 'completed' } } },
        });
      }
      stop() {}
    }
    x.s.local('Ders notlarım', 'Birlikte çalışalım');
    const before = JSON.stringify(x.s.current.events);
    const c = new ChatClassifier(
      x.s,
      x.f,
      x.dir,
      () => changed++,
      () => new Fake(),
    );
    x.s.autoFolders = false;
    await c.run();
    assert.equal(calls, 0);
    await c.run(true);
    assert.equal(calls, 1);
    assert.equal(changed, 1);
    assert.equal(JSON.stringify(x.s.current.events), before);
    assert.equal(x.s.current.classified, true);
    assert.equal(x.s.folders[0].name, 'Dersler');
  } finally {
    x.close();
  }
});
test('Old history migrates without losing events; nested folders and manual choices survive restart', () => {
  const x = setup();
  try {
    const { s, f, dir } = x;
    s.local('Ders çalışalım', 'Hazırım');
    const id = s.active;
    f.edit({ action: 'create', name: 'Dersler' });
    const parent = s.folders[0].id;
    f.edit({ action: 'create', name: 'MAT101', parentId: parent });
    const child = s.folders[1].id;
    f.edit({ action: 'move-chat', roomId: id, parentId: child });
    const restored = new Sessions(dir, dir);
    assert.equal(restored.rooms.get(id).folderId, child);
    assert.equal(restored.rooms.get(id).events.length, 2);
    assert.equal(restored.folders[1].parentId, parent);
    assert.equal(restored.rooms.get(id).manualFolder, true);
    restored.stop();
  } finally {
    x.close();
  }
});
test('Folder operations reject cycles and unknown targets; deletion preserves chats and children', () => {
  const x = setup();
  try {
    const { s, f } = x;
    f.edit({ action: 'create', name: 'A' });
    const a = s.folders[0].id;
    f.edit({ action: 'create', name: 'B', parentId: a });
    const b = s.folders[1].id;
    assert.throws(() => f.edit({ action: 'move-folder', id: a, parentId: b }), /kendi/);
    assert.throws(() => f.edit({ action: 'move-chat', roomId: s.active, parentId: 'missing' }));
    f.edit({ action: 'move-chat', roomId: s.active, parentId: a });
    f.edit({ action: 'delete', id: a });
    assert.equal(s.current.folderId, null);
    assert.equal(s.folders[0].parentId, null);
    assert.equal(s.rooms.size, 1);
  } finally {
    x.close();
  }
});
test('AI result validation, manual move protection and edit branches preserve folder intent', () => {
  const x = setup();
  try {
    const { s, f } = x;
    s.local('Daemon Targaryen', 'FRP');
    assert.throws(() => f.applyAI(s.active, '{"category":"Delete files"}'));
    f.applyAI(s.active, '{"category":"FRP"}');
    const id = s.current.folderId;
    assert.equal(s.folders[0].name, 'FRP');
    f.edit({ action: 'move-chat', roomId: s.active, parentId: null });
    assert.equal(f.applyAI(s.active, '{"folderId":"' + id + '"}'), false);
    assert.equal(s.current.folderId, null);
    s.editMessage(0);
    assert.equal(s.current.manualFolder, true);
    assert.equal(s.current.folderId, null);
  } finally {
    x.close();
  }
});
