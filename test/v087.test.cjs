// v0.8.7: images in module ai.chat, Claude / Gemini image input, the "Modüller" home card.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createModuleHost, chatImages, FEATURES } = require('../app/modules/host.cjs');
const { ModuleStorage } = require('../app/modules/storage.cjs');
const images = require('../app/ai/provider-images.cjs');
const { launchPlan, geminiSettings } = require('../app/ai/provider-tools.cjs');
const { askOnce } = require('../app/ai/ask-once.cjs');
const { cleanDash, CARDS } = require('../app/core/dash-layout.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-087-'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function fakeHost(modules, dataDir, deps = {}) {
  const calls = [];
  const registry = {
    data: { dev: false },
    get: (id) => modules[id] || null,
    manifest: (id) => ({ name: id, entry: 'index.html' }),
    root: () => os.tmpdir(),
    dataDir: () => dataDir,
  };
  const host = createModuleHost({
    registry,
    electron: { BrowserWindow: class {}, session: {}, ipcMain: { handle: () => {} }, dialog: {}, shell: {}, net: {}, screen: {} },
    deps: {
      charlesVersion: '0.8.7',
      language: () => 'tr',
      askChat: async (args) => {
        calls.push(args);
        return 'ok';
      },
      askImage: async () => '',
      speak: async () => {},
      emote: () => {},
      notify: () => {},
      ...deps,
    },
  });
  return { host, calls };
}

test('ai.chat images: own data folder only, png/jpg/jpeg/webp, absolute paths to askChat', async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, 'courses/k1/sources'), { recursive: true });
  fs.writeFileSync(path.join(data, 'courses/k1/sources/s9.png'), PNG);
  fs.writeFileSync(path.join(data, 'b.JPEG'), PNG);
  fs.writeFileSync(path.join(data, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(data, 'empty.webp'), '');
  fs.writeFileSync(path.join(path.dirname(data), 'outside.png'), PNG);
  const { host, calls } = fakeHost({ m: { version: '1.0.0', permissions: ['ai'], enabled: true }, noai: { version: '1.0.0', permissions: [], enabled: true } }, data);
  const msg = [{ role: 'user', content: 'Bu sayfada ne yazıyor?' }];

  assert.equal(await host.call('m', 'ai.chat', { messages: msg, images: ['courses/k1/sources/s9.png', 'b.JPEG'] }), 'ok');
  assert.deepEqual(calls.at(-1).images, [path.join(data, 'courses/k1/sources/s9.png'), path.join(data, 'b.JPEG')]);
  for (const p of calls.at(-1).images) assert.ok(path.isAbsolute(p));
  // without images the call is unchanged
  await host.call('m', 'ai.chat', { messages: msg });
  assert.equal('images' in calls.at(-1), false);

  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, images: ['../outside.png'] }), /kendi veri klasörünü/);
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, images: ['C:/Windows/x.png'] }), /Geçersiz|kendi veri/);
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, images: ['notes.txt'] }), /PNG, JPG, JPEG ve WebP/);
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, images: ['nope.png'] }), /bulunamadı/);
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, images: ['empty.webp'] }), /boş/);
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, images: 'courses/k1/sources/s9.png' }), /liste/);
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, images: Array(11).fill('b.JPEG') }), /en fazla 10/);
  // a Cursor / Abacus model: clear error, nothing is sent
  const before = calls.length;
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, model: 'cursor:auto', images: ['b.JPEG'] }), /yalnızca GPT, Claude ve Gemini/);
  await assert.rejects(host.call('m', 'ai.chat', { messages: msg, model: 'abacus:auto', images: ['b.JPEG'] }), /yalnızca GPT, Claude ve Gemini/);
  assert.equal(calls.length, before);
  // the existing "ai" permission is enough, and still required
  await assert.rejects(host.call('noai', 'ai.chat', { messages: msg, images: ['b.JPEG'] }), /“ai” izni yok/);
  fs.rmSync(data, { recursive: true, force: true });
  fs.rmSync(path.join(path.dirname(data), 'outside.png'), { force: true });
});

test('chatImages: a link inside the data folder cannot lead outside', { skip: process.platform === 'win32' }, () => {
  const data = tmp();
  const out = tmp();
  fs.writeFileSync(path.join(out, 'x.png'), PNG);
  fs.symlinkSync(out, path.join(data, 'link'));
  fs.symlinkSync(path.join(out, 'x.png'), path.join(data, 'file.png'));
  const s = new ModuleStorage(data);
  assert.throws(() => chatImages(['link/x.png'], s), /Geçersiz/);
  // v0.9.1: a link as the file itself is refused by the storage already
  assert.throws(() => chatImages(['file.png'], s), /Geçersiz|dosya değil/);
  fs.rmSync(data, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test('info() announces ai.images', async () => {
  const data = tmp();
  const { host } = fakeHost({ m: { version: '1.0.0', permissions: [], enabled: true } }, data);
  const info = await host.call('m', 'info');
  assert.ok(info.features.includes('ai.images'));
  assert.ok(FEATURES.includes('ai.images'));
  fs.rmSync(data, { recursive: true, force: true });
});

test('module preload sends images with ai.chat; main turns them into localImage attachments', () => {
  const preload = read('app/modules/module-preload.cjs');
  assert.match(preload, /const \{ onChunk, images, \.\.\.rest \} = options/);
  assert.match(preload, /rest\.images = /);
  const main = read('app/main.cjs');
  assert.match(main, /askChat: \(\{ prompt, model, images \}\)/);
  assert.match(main, /\(images \|\| \[\]\)\.map\(\(p\) => \(\{ type: 'localImage', path: p \}\)\)/);
  assert.match(main, /attachments,\n\s+cwd: chatWorkspace/);
});

test('askOnce passes attachments to the subscription CLI and to Codex', async () => {
  const att = [{ type: 'localImage', path: '/x/a.png' }];
  const seen = [];
  const fakeAgent = () => {
    const handlers = [];
    return {
      on: (_, f) => handlers.push(f),
      connect: async () => {},
      send: async (args) => {
        seen.push(['codex', args]);
        setTimeout(() => {
          for (const h of handlers) {
            h({ type: 'agent', data: { method: 'item/completed', params: { item: { type: 'agentMessage', text: 'cevap' } } } });
            h({ type: 'agent', data: { method: 'turn/completed', params: { turn: { status: 'completed' } } } });
          }
        }, 1);
      },
      stop: () => {},
      handlers,
    };
  };
  let agentRef;
  const providers = {
    send: async (agent, args) => {
      seen.push(['cli', args]);
      setTimeout(() => {
        for (const h of agent.handlers) {
          h({ type: 'agent', data: { method: 'item/completed', params: { item: { type: 'agentMessage', text: 'cli' } } } });
          h({ type: 'agent', data: { method: 'turn/completed', params: { turn: { status: 'completed' } } } });
        }
      }, 1);
    },
  };
  assert.equal(await askOnce({ root, providers, prompt: 'p', model: 'claude:sonnet', attachments: att, makeAgent: () => (agentRef = fakeAgent()) }), 'cli');
  assert.deepEqual(seen.at(-1)[1].attachments, att);
  assert.equal(await askOnce({ root, providers, prompt: 'p', model: null, attachments: att, makeAgent: fakeAgent }), 'cevap');
  assert.equal(seen.at(-1)[0], 'codex');
  assert.deepEqual(seen.at(-1)[1].attachments, att);
  await askOnce({ root, providers, prompt: 'p', model: null, makeAgent: fakeAgent });
  assert.equal('attachments' in seen.at(-1)[1], false);
  void agentRef;
});

test('subscription attachments: Claude and Gemini take images, Cursor and Abacus give a clear error', () => {
  const dir = tmp();
  const png = path.join(dir, 'a.png');
  fs.writeFileSync(png, PNG);
  const att = [{ type: 'text', text: 'belge' }, { type: 'localImage', path: png }];
  for (const p of ['claude', 'gemini']) {
    const r = images.splitAttachments(p, att);
    assert.equal(r.texts.length, 1);
    assert.equal(r.images.length, 1);
  }
  for (const p of ['cursor', 'abacus']) assert.throws(() => images.splitAttachments(p, att), /Görseller şu an yalnızca GPT, Claude ve Gemini ile çalışıyor\./);
  // text alone still works everywhere
  assert.deepEqual(images.splitAttachments('cursor', [att[0]]).images, []);
  assert.throws(() => images.splitAttachments('claude', [{ type: 'localImage', path: path.join(dir, 'a.gif') }]), /PNG, JPG ya da WebP/);
  assert.throws(() => images.splitAttachments('claude', [{ type: 'localImage', path: path.join(dir, 'none.png') }]), /bulunamadı/);
  assert.throws(() => images.splitAttachments('claude', [{ type: 'mention', path: png }]), /desteklemiyor/);
  const providers = read('app/ai/providers.cjs');
  assert.doesNotMatch(providers, /Görsel için GPT seç/);
  assert.match(providers, /imagesKit\.splitAttachments\(provider, args\.attachments\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Claude: images go to stdin as one stream-json message with base64 blocks', () => {
  const dir = tmp();
  const png = path.join(dir, 'a.png');
  fs.writeFileSync(png, PNG);
  const loaded = images.loadImages([{ type: 'localImage', path: png }]);
  assert.deepEqual(loaded, [{ mime: 'image/png', data: PNG.toString('base64') }]);
  const line = images.claudeInput('Ne görüyorsun?', loaded);
  assert.ok(line.endsWith('\n'));
  const msg = JSON.parse(line);
  assert.equal(msg.type, 'user');
  assert.equal(msg.message.role, 'user');
  assert.deepEqual(msg.message.content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } });
  assert.deepEqual(msg.message.content.at(-1), { type: 'text', text: 'Ne görüyorsun?' });
  // too large: shrunk when possible, refused otherwise
  const big = path.join(dir, 'big.jpg');
  fs.writeFileSync(big, Buffer.alloc(images.MAX_IMAGE_BYTES + 1, 1));
  assert.throws(() => images.loadImages([{ path: big }]), /çok büyük/);
  const small = images.loadImages([{ path: big }], () => ({ data: Buffer.from('jpg'), mime: 'image/jpeg' }));
  assert.equal(small[0].mime, 'image/jpeg');
  // the CLI reads stream-json only when there are images; tools stay off in chat mode
  const plain = launchPlan({ provider: 'claude', model: 'sonnet', mode: 'chat', access: 'ask', workspace: dir });
  assert.ok(!plain.cli.includes('--input-format'));
  const withImg = launchPlan({ provider: 'claude', model: 'sonnet', mode: 'chat', access: 'ask', workspace: dir, images: true });
  assert.deepEqual(withImg.cli.slice(withImg.cli.indexOf('--input-format'), withImg.cli.indexOf('--input-format') + 2), ['--input-format', 'stream-json']);
  assert.ok(withImg.cli.includes('--tools'));
  assert.ok(!withImg.cli.some((a) => /dangerously|bypassPermissions/.test(a)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Gemini: images are copied to a per-message folder it may only read, then removed', () => {
  const ws = tmp();
  const src = tmp();
  const a = path.join(src, 'Gizli Ad.JPG');
  fs.writeFileSync(a, PNG);
  const staged = images.stageGeminiImages(ws, 'abc-123', [{ path: a }]);
  assert.equal(staged.dir, path.join(ws, '.charles-images', 'abc-123'));
  assert.deepEqual(staged.files, [path.join(staged.dir, 'image-1.jpg')]);
  assert.ok(fs.existsSync(staged.files[0]));
  assert.match(images.geminiImagePrompt(staged.files), /read_file/);
  assert.doesNotMatch(images.geminiImagePrompt(staged.files), /Gizli Ad/);
  assert.throws(() => images.stageGeminiImages(ws, '../x', [{ path: a }]), /Geçersiz/);
  const plan = launchPlan({ provider: 'gemini', model: 'flash', mode: 'chat', access: 'ask', workspace: ws, images: true, imageDir: staged.dir });
  assert.ok(plan.cli.includes('--add-dir') && plan.cli[plan.cli.indexOf('--add-dir') + 1] === staged.dir);
  assert.equal(plan.cli[plan.cli.indexOf('--mode') + 1], 'plan');
  assert.deepEqual(plan.geminiSettings.permissions.allow, ['read_file(*)']);
  assert.ok(plan.geminiSettings.permissions.deny.includes('write_file(*)'));
  assert.ok(plan.geminiSettings.permissions.deny.includes('command(*)'));
  assert.equal(plan.geminiSettings.allowNonWorkspaceAccess, false);
  // without images nothing changes: no file access at all
  assert.deepEqual(geminiSettings('ask', false).permissions.allow, undefined);
  assert.ok(!launchPlan({ provider: 'gemini', model: 'flash', mode: 'chat', access: 'ask', workspace: ws }).cli.includes('--add-dir'));
  images.removeStaged(staged.dir);
  assert.ok(!fs.existsSync(staged.dir));
  // only its own per-message folders are ever removed
  images.removeStaged(src);
  assert.ok(fs.existsSync(a));
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(src, { recursive: true, force: true });
});

test('home page: "modules" card and its validated module list', () => {
  assert.ok(CARDS.includes('modules'));
  const v = cleanDash({ cols: [['music'], ['modules']], modules: ['download', 'notes-app', 'download'] }, null);
  assert.deepEqual(v.cols, [['music'], ['modules']]);
  assert.deepEqual(v.modules, ['download', 'notes-app']);
  assert.equal('modules' in cleanDash({ modules: null }, v), false);
  for (const bad of [['../x'], ['A'], [1], 'download', Array(101).fill('ab')]) assert.throws(() => cleanDash({ modules: bad }, null), /Geçersiz modül kartı/);
  const dash = read('src/workspace/dashboard.ts');
  assert.match(dash, /\{ id: 'modules', title: 'Modüller'/);
  const card = read('src/workspace/modules-card.ts');
  assert.match(card, /api\.modulesOpen\(m\.id\)/);
  assert.match(card, /draggable = true/);
  assert.match(card, /d\.save\(\{ modules: ids \}\)/);
  assert.match(read('public/index.html'), /styles\/16-v087\.css/);
});

test('version 0.8.7 or later and notes', () => {
  assert.match(JSON.parse(read('package.json')).version, /^0\.(8\.([7-9]|\d\d)|(9|\d\d)\.\d+)/);
  assert.match(read('CHANGELOG.md'), /## v0\.8\.7 Beta/);
  assert.match(read('docs/MODULES.md'), /features/);
  assert.match(read('docs/MODULES.md'), /images: \['courses\/k1\/sources\/s9\.png'\]/);
});
