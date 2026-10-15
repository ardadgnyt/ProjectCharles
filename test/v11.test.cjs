const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Personal } = require('../app/personal/personal.cjs'),
  { Sessions } = require('../app/ai/sessions.cjs'),
  { Library } = require('../app/files/library.cjs'),
  { threadParams } = require('../app/core/policy.cjs'),
  { docxText } = require('../app/files/docx.cjs'),
  { zipSync, strToU8 } = require('fflate');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v11-'));
test('Startup archives chat and project histories; editing branches without deleting the original', () => {
  const d = temp();
  let s;
  try {
    s = new Sessions(process.cwd(), d);
    s.current.mode = 'project';
    s.current.cwd = d;
    s.local('İlk mesaj', 'Sonuç');
    const old = s.active;
    s.freshStart();
    assert.notEqual(s.active, old);
    assert.equal(s.current.events.length, 0);
    assert.equal(s.current.mode, 'project');
    assert(s.rooms.get(old).closed);
    s.select(old);
    const edit = s.editMessage(0);
    assert.equal(edit.text, 'İlk mesaj');
    assert.equal(edit.room.events.length, 0);
    assert.equal(s.rooms.get(old).events.length, 2);
    s.stop();
    s = new Sessions(process.cwd(), d);
    assert.equal(s.rooms.get(old).events.length, 2);
  } finally {
    s?.stop();
    fs.rmSync(d, { recursive: true, force: true });
  }
});
test('Explicit approval modes preserve default and map full access without changing it implicitly', () => {
  assert.equal(threadParams(process.cwd(), null, 'project').approvalPolicy, 'untrusted');
  assert.equal(threadParams(process.cwd(), null, 'project', 'auto').approvalPolicy, 'on-request');
  assert.equal(threadParams(process.cwd(), null, 'project', 'auto').sandbox, 'workspace-write');
  assert.equal(
    threadParams(process.cwd(), null, 'project', 'auto').approvalsReviewer,
    'auto_review',
  );
  const full = threadParams(process.cwd(), null, 'chat', 'full');
  assert.equal(full.sandbox, 'danger-full-access');
  assert.equal(full.approvalPolicy, 'never');
  assert.throws(() => threadParams(process.cwd(), null, 'project', 'bad'));
});
test('Local Word extraction, scoped content search and revoked folder access', async () => {
  const dir = temp();
  try {
    const p = new Personal(dir),
      lib = new Library(p),
      folder = path.join(dir, 'chosen');
    fs.mkdirSync(folder);
    const bytes = zipSync({
      'word/document.xml': strToU8(
        '<w:document><w:p><w:r><w:t>Doğrultucu formülü V=I*R</w:t></w:r></w:p></w:document>',
      ),
    });
    fs.writeFileSync(path.join(folder, 'ders.docx'), bytes);
    assert.match(docxText(bytes), /V=I\*R/);
    fs.writeFileSync(path.join(folder, 'rapor.txt'), 'Doğrultucu deneyi');
    fs.writeFileSync(path.join(dir, 'outside.txt'), 'Doğrultucu');
    lib.add(folder);
    const r = await lib.search('doğrultucu');
    assert.equal(r.items.length, 2);
    assert(r.items.every((i) => i.path.startsWith(folder)));
    const formula = await lib.search('"V=I*R"');
    assert.equal(formula.items.length, 1);
    lib.remove(folder);
    assert.throws(() => lib.resolve(formula.items[0].id));
    assert.throws(() => docxText(new Uint8Array([1, 2, 3])));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Personal command edits and access preference survive restart; summaries use recorded evidence', () => {
  const d = temp();
  try {
    const p = new Personal(d);
    p.edit('command-save', { phrase: 'Atölyeyi aç', apps: ['Steam', 'Spotify'] });
    const id = p.data.commands[0].id;
    p.edit('command-save', { id, phrase: 'Derse başla', apps: ['Notepad'] });
    p.edit('access', { value: 'full' });
    const loaded = new Personal(d);
    assert.equal(loaded.data.commands.length, 1);
    assert.equal(loaded.data.access, 'full');
    loaded.edit('command-delete', { id });
    assert.equal(loaded.data.commands.length, 0);
    const s = new Sessions(process.cwd());
    s.local('Yaptıklarımız', 'Hatırlatıcı kuruldu');
    s.current.events.push({
      type: 'agent',
      data: {
        method: 'item/completed',
        params: { item: { type: 'fileChange', changes: [{ path: 'app.js' }] } },
      },
    });
    assert.match(s.summary(), /app.js/);
    assert.match(s.summary(), /Hatırlatıcı/);
    s.stop();
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
