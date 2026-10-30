// v0.9.12 Beta: files.save / files.pick for modules ("files" permission).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { ModuleStorage } = require('../app/modules/storage.cjs');
const files = require('../app/modules/files.cjs');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('names are cleaned; executables refused, also from the filter list', () => {
  assert.equal(files.cleanName('../../Windows/evil.txt'), 'evil.txt');
  assert.equal(files.cleanName('C:\\x\\a<b>:c?.md'), 'abc.md');
  assert.equal(files.cleanName('CON.txt'), '_CON.txt');
  assert.equal(files.cleanName('..'), 'dosya.txt');
  assert.equal(files.cleanName('notes. . '), 'notes');
  assert.throws(() => files.cleanName('kur.exe'), /çalıştırılabilir/);
  assert.throws(() => files.cleanName('a.PS1'), /çalıştırılabilir/);
  assert.throws(() => files.cleanFilters([{ name: 'x', extensions: ['lnk'] }]), /çalıştırılabilir/);
  const f = files.cleanFilters([{ name: 'Evren', extensions: ['.zip', '*.json', 'bad ext'] }]);
  assert.deepEqual(f[0].extensions, ['zip', 'json']);
  assert.equal(f.at(-1).extensions[0], '*');
});

test('content: data / from / zip, only from the module\'s own folder, with limits', () => {
  const dir = tmp('charles-files-');
  const s = new ModuleStorage(dir);
  s.writeFile('universes/u1/a.json', '{"a":1}');
  s.writeFile('universes/u1/img/p.png', 'PNG');
  s.writeFile('other.txt', 'x');
  assert.equal(files.buildBytes(s, { data: 'merhaba' }).toString(), 'merhaba');
  assert.equal(files.buildBytes(s, { data: Buffer.from('hi').toString('base64'), encoding: 'base64' }).toString(), 'hi');
  assert.equal(files.buildBytes(s, { from: 'other.txt' }).toString(), 'x');
  const zip = files.buildBytes(s, { zip: ['universes/u1/'], zipRoot: 'universes/u1/' });
  const names = Object.keys(require('fflate').unzipSync(new Uint8Array(zip))).sort();
  assert.deepEqual(names, ['a.json', 'img/p.png']);
  assert.throws(() => files.buildBytes(s, { from: '../outside.txt' }), /Geçersiz dosya yolu/);
  assert.throws(() => files.buildBytes(s, { zip: ['../../'] }), /Geçersiz dosya yolu/);
  assert.throws(() => files.buildBytes(s, { data: 'a', from: 'other.txt' }), /tek bir yoldan/);
  assert.throws(() => files.buildBytes(s, { data: 'x'.repeat(20) }, { ...files.LIMITS, saveBytes: 10 }), /çok büyük/);
  assert.throws(() => files.buildBytes(s, { zip: ['universes'] }, { ...files.LIMITS, zipFiles: 1 }), /5000/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('save: cancelled → { saved: false }; written atomically; an executable typed in the window is refused', async () => {
  const dir = tmp('charles-files-');
  const out = tmp('charles-out-');
  const s = new ModuleStorage(dir);
  const opts = (filePath, canceled = false) => ({
    storage: s,
    moduleName: 'FRP',
    downloads: out,
    dialog: { showSaveDialog: async (_w, o) => ((opts.seen = o), { canceled, filePath }) },
  });
  assert.deepEqual(await files.saveFile({ ...opts('', true), args: { data: 'a', name: 'n.md' } }), { saved: false });
  const target = path.join(out, 'Oturum.md');
  const r = await files.saveFile({ ...opts(target), args: { data: '# Özet', name: '../Oturum.md' } });
  assert.equal(r.saved, true);
  assert.equal(r.name, 'Oturum.md');
  assert.equal(fs.readFileSync(target, 'utf8'), '# Özet');
  assert.equal(opts.seen.defaultPath, path.join(out, 'Oturum.md'));
  assert.match(opts.seen.title, /“FRP” modülü bir dosya kaydetmek istiyor/);
  assert.deepEqual(fs.readdirSync(out), ['Oturum.md'], 'no temporary file left');
  await assert.rejects(files.saveFile({ ...opts(path.join(out, 'x.exe')), args: { data: 'MZ', name: 'x.txt' } }), /kaydedilemez/);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test('pick: names and contents only; cancelled → { picked: false }', async () => {
  const dir = tmp('charles-pick-');
  const a = path.join(dir, 'evren.json');
  fs.writeFileSync(a, '{"x":1}');
  const dialog = (paths) => ({ showOpenDialog: async () => ({ canceled: !paths.length, filePaths: paths }) });
  assert.deepEqual(await files.pickFiles({ dialog: dialog([]), moduleName: 'FRP' }), { picked: false, files: [] });
  const r = await files.pickFiles({ dialog: dialog([a]), moduleName: 'FRP', args: { encoding: 'utf8' } });
  assert.deepEqual(r, { picked: true, files: [{ name: 'evren.json', size: 7, data: '{"x":1}' }] });
  const bin = await files.pickFiles({ dialog: dialog([a]), moduleName: 'FRP' });
  assert.ok(bin.files[0].data instanceof Uint8Array);
  assert.ok(!JSON.stringify(r).includes(dir), 'the folder never reaches the module');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('wiring: permission, host checks, preload user activation, docs', () => {
  const { needs, FEATURES } = require('../app/modules/host.cjs');
  assert.equal(needs('files.save'), 'files');
  assert.equal(needs('files.pick'), 'files');
  assert.ok(FEATURES.includes('files.save') && FEATURES.includes('files.pick'));
  const { PERMISSIONS } = require('../app/modules/manifest.cjs');
  assert.match(PERMISSIONS.files, /her seferinde sen seçersin/);
  const host = read('app/modules/host.cjs');
  assert.match(host, /'files\.save': \[6, 60000\]/);
  assert.match(host, /return \{ saved: true, name: r\.name, size: r\.size \}; \/\/ never the full path/);
  const preload = read('app/modules/module-preload.cjs');
  assert.equal((preload.match(/navigator\.userActivation\?\.isActive/g) || []).length, 2);
  assert.match(read('app/main.cjs'), /shell\.showItemInFolder\(item\.reveal\)/);
  assert.match(read('docs/MODULES.md'), /C\.files\.save\(\{/);
});
