// v0.8.0: module system — manifest, package checks, install / update / remove, storage,
// permissions and the charles-module protocol.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { validateManifest, parseManifest, compareVersions } = require('../app/modules/manifest.cjs');
const { readZip, readFolder, checkFiles, cleanPath } = require('../app/modules/package.cjs');
const { ModuleRegistry } = require('../app/modules/registry.cjs');
const { ModuleStorage } = require('../app/modules/storage.cjs');
const { resolveRequest, CSP } = require('../app/modules/protocol.cjs');
const { createModuleHost, chatPrompt, rateLimiter } = require('../app/modules/host.cjs');
const { imageBase64 } = require('../app/modules/ai-image.cjs');

const root = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-modules-'));
const base = (extra = {}) => ({
  id: 'hello',
  name: 'Merhaba',
  version: '1.0.0',
  author: 'Test',
  description: 'Deneme',
  charlesApi: 1,
  entry: 'index.html',
  permissions: ['ai'],
  ...extra,
});
const zip = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
const pkgFiles = (m = base(), more = {}) => ({ 'manifest.json': JSON.stringify(m), 'index.html': '<!doctype html><p>hi</p>', ...more });

test('manifest: valid one is cleaned, defaults filled', () => {
  const m = validateManifest(base({ permissions: ['ai', 'storage', 'image', 'ai'], window: { width: 900, height: 600 } }));
  assert.deepEqual(m.permissions, ['ai', 'image']); // default ones and duplicates dropped
  assert.equal(m.window.width, 900);
  assert.equal(m.window.minWidth, 480);
  assert.equal(parseManifest('\uFEFF' + JSON.stringify(base())).id, 'hello');
});

test('manifest: invalid ones give clear Turkish errors', () => {
  const bad = [
    [{ id: 'Hello' }, /id/],
    [{ id: 'a' }, /id/],
    [{ id: '../x' }, /id/],
    [{ name: '' }, /name/],
    [{ version: '1.0' }, /version/],
    [{ charlesApi: 2 }, /API sürümü/],
    [{ entry: '../index.html' }, /entry/],
    [{ entry: 'app.js' }, /\.html/],
    [{ permissions: ['ai', 'filesystem'] }, /bilinmeyen izin “filesystem”/],
    [{ permissions: 'ai' }, /liste/],
    [{ extra: 1 }, /bilinmeyen alan/],
    [{ window: { width: 100 } }, /window\.width/],
  ];
  for (const [patch, re] of bad) assert.throws(() => validateManifest(base(patch)), re, JSON.stringify(patch));
  const noAuthor = base();
  delete noAuthor.author;
  assert.throws(() => validateManifest(noAuthor), /author/);
  assert.throws(() => parseManifest('{nope'), /JSON/);
  assert.equal(compareVersions('1.10.0', '1.9.3'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0-beta.1'), 0);
});

test('zip: a good package, also inside one top folder', () => {
  const a = readZip(zip(pkgFiles()));
  assert.equal(a.manifest.id, 'hello');
  assert.ok(a.files.has('index.html'));
  const nested = Object.fromEntries(Object.entries(pkgFiles()).map(([k, v]) => ['hello-module/' + k, v]));
  assert.ok(readZip(zip(nested)).files.has('manifest.json'));
  assert.throws(() => readZip(zip({ 'index.html': 'x' })), /manifest\.json bulunamadı/);
  assert.throws(() => readZip(zip(pkgFiles(base({ entry: 'main.html' })))), /giriş dosyası/);
  assert.throws(() => readZip(new Uint8Array(100)), /zip|Zip/);
});

test('zip: zip-slip, absolute paths and drive letters are refused', () => {
  for (const evil of ['../evil.js', 'a/../../evil.js', '/etc/x.js', 'C:/Windows/x.js', 'a\\..\\b.js'])
    assert.throws(() => readZip(zip(pkgFiles(base(), { [evil]: 'x' }))), /zip-slip|mutlak|ters bölü/, evil);
  assert.throws(() => cleanPath('con:'), /geçersiz/);
});

test('zip: executables, too many files and too many bytes are refused', () => {
  for (const f of ['run.exe', 'lib/x.dll', 'a.bat', 'b.CMD', 'c.ps1', 'd.vbs', 'e.msi', 'f.node', 'g.sh', 'h.lnk'])
    assert.throws(() => readZip(zip(pkgFiles(base(), { [f]: 'x' }))), /çalıştırılabilir/, f);
  const many = pkgFiles();
  for (let i = 0; i < 2000; i++) many[`f/${i}.txt`] = 'x';
  assert.throws(() => readZip(zip(many)), /çok fazla dosya/);
  assert.throws(() => checkFiles([['a.bin', 60e6], ['b.bin', 60e6]]), /100 MB/);
  assert.throws(() => checkFiles([['A.txt', 1], ['a.txt', 1]]), /aynı adlı/);
});

test('install, update (data kept), turn off, remove (data kept or deleted)', () => {
  const userData = tmp();
  const reg = new ModuleRegistry({ userData });
  const p1 = reg.prepare(readZip(zip(pkgFiles())), { kind: 'zip', path: 'x.zip' });
  assert.equal(p1.update, null);
  assert.ok(p1.permissions.some((x) => x.id === 'ai' && !x.default));
  assert.ok(p1.permissions.some((x) => x.id === 'storage' && x.default));
  reg.install(p1.token);
  assert.ok(fs.existsSync(path.join(userData, 'modules', 'hello', 'index.html')));
  assert.throws(() => reg.install(p1.token), /süresi doldu/); // a token works once
  const store = new ModuleStorage(reg.dataDir('hello'));
  store.setJSON('save.json', { level: 3 });
  // update: version shown, data kept, old files replaced
  const p2 = reg.prepare(readZip(zip(pkgFiles(base({ version: '1.1.0' }), { 'new.css': 'b{}' }))), { kind: 'zip', path: 'y.zip' });
  assert.deepEqual(p2.update, { from: '1.0.0', to: '1.1.0', older: false });
  reg.install(p2.token);
  assert.equal(reg.get('hello').version, '1.1.0');
  assert.ok(fs.existsSync(path.join(userData, 'modules', 'hello', 'new.css')));
  assert.deepEqual(new ModuleStorage(reg.dataDir('hello')).getJSON('save.json'), { level: 3 });
  // the list survives a restart
  const again = new ModuleRegistry({ userData });
  assert.equal(again.list()[0].name, 'Merhaba');
  assert.equal(again.setEnabled('hello', false), false);
  again.remove('hello', false);
  assert.ok(!fs.existsSync(path.join(userData, 'modules', 'hello')));
  assert.ok(fs.existsSync(path.join(userData, 'module-data', 'hello', 'save.json')));
  const p3 = again.prepare(readZip(zip(pkgFiles())), { kind: 'zip', path: 'x.zip' });
  again.install(p3.token);
  again.remove('hello', true);
  assert.ok(!fs.existsSync(path.join(userData, 'module-data', 'hello')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'modules.json'), 'utf8')).modules, {});
  fs.rmSync(userData, { recursive: true, force: true });
});

test('developer mode: a folder is checked the same way and served from where it is', () => {
  const userData = tmp();
  const dir = tmp();
  for (const [k, v] of Object.entries(pkgFiles())) fs.writeFileSync(path.join(dir, k), v);
  const reg = new ModuleRegistry({ userData });
  const p = reg.prepare(readFolder(dir), { kind: 'folder', path: dir });
  reg.install(p.token);
  assert.equal(reg.root('hello'), dir);
  fs.writeFileSync(path.join(dir, 'bad.exe'), 'x');
  assert.throws(() => reg.recheck('hello'), /çalıştırılabilir/);
  fs.rmSync(path.join(dir, 'bad.exe'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(base({ version: '2.0.0' })));
  assert.equal(reg.recheck('hello').version, '2.0.0');
  reg.remove('hello');
  assert.ok(fs.existsSync(path.join(dir, 'index.html'))); // the source folder is never deleted
  for (const d of [userData, dir]) fs.rmSync(d, { recursive: true, force: true });
});

test('storage: only inside the module folder, with a quota', () => {
  const dir = tmp();
  const s = new ModuleStorage(path.join(dir, 'data'), 1000);
  s.writeFile('a/b.txt', 'merhaba');
  assert.equal(s.readFile('a/b.txt'), 'merhaba');
  assert.deepEqual(
    s.listFiles().map((f) => f.path),
    ['a', 'a/b.txt'],
  );
  for (const evil of ['../x.txt', 'a/../../x.txt', '/x.txt', 'C:/x.txt', '..\\x.txt', 'NUL.txt'])
    assert.throws(() => s.writeFile(evil, 'x'), /Geçersiz|Windows/, evil);
  assert.throws(() => s.readFile('../../etc/passwd'), /Geçersiz/);
  assert.throws(() => s.writeFile('run.exe', 'x'), /çalıştırılabilir/);
  assert.throws(() => s.writeFile('big.bin', 'x'.repeat(2000)), /kota/);
  s.writeFile('img.png', 'iVBORw0KGgo=', { encoding: 'base64' });
  assert.equal(s.readFile('img.png', { encoding: 'base64' }), 'iVBORw0KGgo=');
  assert.equal(s.deleteFile('a/b.txt'), true);
  assert.equal(s.getJSON('none.json', 'yok'), 'yok');
  assert.ok(!fs.existsSync(path.join(dir, 'x.txt')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('protocol: only the module’s own files, never outside its folder', () => {
  const dir = tmp();
  const files = path.join(dir, 'modules', 'hello');
  const data = path.join(dir, 'module-data', 'hello');
  fs.mkdirSync(files, { recursive: true });
  fs.mkdirSync(path.join(data, 'images'), { recursive: true });
  fs.writeFileSync(path.join(files, 'index.html'), 'x');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'x');
  fs.writeFileSync(path.join(data, 'images', 'a.png'), 'x');
  const roots = (id) => (id === 'hello' ? { files, data, entry: 'index.html' } : null);
  assert.equal(resolveRequest('charles-module://hello/index.html', roots).mime, 'text/html; charset=utf-8');
  assert.equal(resolveRequest('charles-module://hello/', roots).file, fs.realpathSync(path.join(files, 'index.html')));
  assert.ok(resolveRequest('charles-module://hello/_data/images/a.png', roots).file);
  // the URL parser already folds %2e%2e away: the request stays inside the folder (not found)
  assert.equal(resolveRequest('charles-module://hello/%2e%2e/%2e%2e/secret.txt', roots).file, undefined);
  assert.equal(resolveRequest('charles-module://hello/..%5c..%5csecret.txt', roots).status, 403);
  assert.equal(resolveRequest('charles-module://hello/_data/../../../secret.txt', roots).file, undefined);
  assert.equal(resolveRequest('charles-module://other/index.html', roots).status, 404);
  assert.equal(resolveRequest('https://hello/index.html', roots).status, 403);
  assert.match(CSP, /default-src 'self' charles-module:/);
  assert.doesNotMatch(CSP, /https?:/);
  fs.rmSync(dir, { recursive: true, force: true });
});

function fakeHost(modules, deps = {}) {
  const handlers = {};
  const registry = {
    data: { dev: false },
    get: (id) => modules[id] || null,
    manifest: (id) => ({ name: id, entry: 'index.html' }),
    root: () => os.tmpdir(),
    dataDir: (id) => {
      const d = path.join(os.tmpdir(), 'charles-module-test-' + id);
      fs.mkdirSync(d, { recursive: true });
      return d;
    },
  };
  const host = createModuleHost({
    registry,
    electron: { BrowserWindow: class {}, session: {}, ipcMain: { handle: (n, f) => (handlers[n] = f) }, dialog: {}, shell: {}, net: {}, screen: {} },
    deps: {
      charlesVersion: '0.8.0',
      language: () => 'tr',
      askChat: async ({ prompt }) => 'yanıt: ' + prompt,
      askImage: async () => 'iVBORw0KGgo=',
      speak: async () => {},
      emote: () => {},
      notify: () => {},
      ...deps,
    },
  });
  return { host, handlers };
}

test('permissions: a module without “image” cannot call ai.image; others are checked too', async () => {
  const { host } = fakeHost({ hello: { version: '1.0.0', permissions: ['ai'], enabled: true }, off: { version: '1.0.0', permissions: ['image'], enabled: false } });
  await assert.rejects(host.call('hello', 'ai.image', { prompt: 'kedi' }), /“image” izni yok/);
  await assert.rejects(host.call('hello', 'voice.speak', { text: 'merhaba' }), /“voice” izni yok/);
  assert.match(await host.call('hello', 'ai.chat', { messages: [{ role: 'user', content: 'selam' }] }), /selam/);
  await assert.rejects(host.call('off', 'ai.image', { prompt: 'x' }), /kapalı/);
  await assert.rejects(host.call('hello', 'slime.emote', { name: 'dance' }), /Geçersiz ifade/);
  assert.equal(await host.call('hello', 'slime.emote', { name: 'happy' }), true);
  await assert.rejects(host.call('hello', 'fs.read', {}), /Bilinmeyen/);
  const info = await host.call('hello', 'info');
  assert.deepEqual(info.permissions, ['ai', 'storage', 'slime', 'notify']);
  await assert.rejects(host.call('hello', 'storage.writeFile', { path: '../x', data: 'x' }), /Geçersiz/);
});

test('ai.image saves the picture in the module’s data folder', async () => {
  const { host } = fakeHost({ painter: { version: '1.0.0', permissions: ['image'], enabled: true } });
  const r = await host.call('painter', 'ai.image', { prompt: 'kedi' });
  assert.match(r.path, /^images\/.+\.png$/);
  assert.equal(r.url, 'charles-module://painter/_data/' + r.path);
  assert.equal(imageBase64('data:image/png;base64,iVBO Rw0K'), 'iVBORw0K');
  assert.equal(imageBase64('<script>'), null);
});

test('only module windows may call the API; calls are rate limited', async () => {
  const { handlers } = fakeHost({ hello: { version: '1.0.0', permissions: [], enabled: true } });
  const r = await handlers['charles-module']({ sender: { id: 999, mainFrame: {} }, senderFrame: { url: 'charles://app/' } }, 'info');
  assert.equal(r.ok, false);
  let t = 0;
  const allow = rateLimiter({ default: [2, 1000] }, () => t);
  assert.equal(allow('a', 'x'), true);
  assert.equal(allow('a', 'x'), true);
  assert.equal(allow('a', 'x'), false);
  assert.equal(allow('b', 'x'), true);
  t = 1500;
  assert.equal(allow('a', 'x'), true);
});

test('ai.chat prompt: system + messages, checked', () => {
  assert.match(chatPrompt({ system: 'Kısa yaz', messages: [{ role: 'user', content: 'Merhaba' }] }), /Kısa yaz[\s\S]*Merhaba/);
  assert.throws(() => chatPrompt({ messages: [] }), /1–50/);
  assert.throws(() => chatPrompt({ messages: [{ role: 'system', content: 'x' }] }), /role/);
  assert.throws(() => chatPrompt({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }), /Son mesaj/);
});

test('main process: scheme, sandboxed window, settings page, example module and packer', () => {
  const main = read('app/main.cjs');
  assert.match(main, /scheme: 'charles-module',\s*privileges: \{ standard: true, secure: true, supportFetchAPI: true \}/);
  for (const h of ['modules-list', 'modules-pick', 'modules-install', 'modules-open', 'modules-enable', 'modules-remove', 'modules-dev'])
    assert.match(main, new RegExp(`safeHandler\\('${h}'`));
  const host = read('app/modules/host.cjs');
  for (const k of ['sandbox: true', 'contextIsolation: true', 'nodeIntegration: false', 'webSecurity: true']) assert.ok(host.includes(k), k);
  assert.match(host, /setWindowOpenHandler/);
  assert.match(host, /'will-navigate'/);
  assert.match(host, /onBeforeRequest\(\{ urls: \['http:\/\/\*\/\*', 'https:\/\/\*\/\*'/);
  assert.match(read('src/settings/settings-pages.ts'), /\['modules', 'Modüller'\], \/\/ v0\.8\.0\n\s*\['shortcuts', 'Kısayollar'\]/);
  const ex = readFolder(path.join(root, 'docs/examples/hello-module'));
  assert.deepEqual(ex.manifest.permissions, ['ai', 'image', 'voice']);
  assert.match(JSON.parse(read('package.json')).scripts['module:pack'], /module-pack\.cjs/);
  assert.ok(fs.existsSync(path.join(root, 'docs/MODULES.md')));
});

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}
