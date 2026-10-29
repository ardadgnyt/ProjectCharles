// v0.8.8: long-chat context, projects, empty chats, module Slime API + kit, window switch,
// WhatsApp in Charles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { zipSync } = require('fflate');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-088-'));
const { contextText, hasContent, CONTEXT_BUDGET } = require('../app/ai/sessions.cjs');
const projects = require('../app/ai/chat-projects.cjs');
const wa = require('../app/plugins/whatsapp-live.cjs');

const user = (data) => ({ type: 'history-user', data });
const answer = (text) => ({ type: 'agent', data: { method: 'item/completed', params: { item: { type: 'agentMessage', text } } } });

// ── 1. the start of a long chat is no longer lost ────────────────────────────
test('context: a long chat keeps its opening (the 7 questions) and the latest messages', () => {
  const events = [user('Bana 7 diferansiyel denklem sorusu hazırla.'), answer('1) y\'\'+y=0 … 7) y\'\'-2y\'+5y=e^x cos(2x)')];
  for (let i = 1; i <= 40; i++) events.push(user(`${i}. adım: ` + 'x'.repeat(300)), answer('çözüm ' + i + ' ' + 'y'.repeat(1500)));
  const all = contextText(events);
  // v0.8.7 kept only the last 24 messages: the questions were gone
  assert.match(all, /7\) y''-2y'\+5y=e\^x cos\(2x\)/);
  assert.match(all, /çözüm 40/);
  assert.ok(all.length <= CONTEXT_BUDGET + 2000);
  // a tight budget (Abacus AI's command line) still keeps the opening and the end, and says
  // what was shortened instead of dropping it silently
  const small = contextText(events, { budget: 14000 });
  assert.ok(small.length <= 15000, String(small.length));
  assert.match(small, /7\) y''-2y'\+5y/);
  assert.match(small, /çözüm 40/);
  assert.match(small, /\[(Kısaltılmış ara mesajlar|… arada \d+ eski mesaj)/);
  // a short chat goes whole, as before
  assert.equal(contextText([user('selam'), answer('merhaba')]), 'user: selam\nassistant: merhaba');
});

// ── 2. projects ──────────────────────────────────────────────────────────────
function fakeSessions() {
  const rooms = new Map();
  const mk = (id, extra = {}) => rooms.set(id, { id, name: 'Sohbet ' + id, events: [], updatedAt: Date.now(), projectId: null, folderId: null, ...extra });
  return { rooms, projects: [], folders: [], mk, save() {} };
}
test('projects: create, rename, instructions, move chats in and out, delete keeps chats', () => {
  const s = fakeSessions();
  s.mk('1');
  s.mk('2', { folderId: 'f1' });
  const p = projects.editProject(s, { action: 'project-create', name: 'Fizik dersi' });
  assert.equal(s.projects.length, 1);
  assert.throws(() => projects.editProject(s, { action: 'project-create', name: 'fizik DERSİ' }), /Bu isimde/);
  assert.throws(() => projects.editProject(s, { action: 'project-create', name: '' }), /1–60/);
  projects.editProject(s, { action: 'project-rename', id: p.id, name: 'Fizik' });
  assert.equal(s.projects[0].name, 'Fizik');
  projects.editProject(s, { action: 'project-instructions', id: p.id, instructions: '  Adım adım anlat.  ' });
  assert.equal(s.projects[0].instructions, 'Adım adım anlat.');
  assert.throws(() => projects.editProject(s, { action: 'project-instructions', id: p.id, instructions: 'x'.repeat(8001) }), /8000/);
  projects.editProject(s, { action: 'move-chat-project', roomId: '2', projectId: p.id });
  assert.equal(s.rooms.get('2').projectId, p.id);
  assert.equal(s.rooms.get('2').folderId, null, 'a chat is in a project or a folder, not both');
  assert.throws(() => projects.editProject(s, { action: 'move-chat-project', roomId: '1', projectId: 'nope' }), /Proje bulunamadı/);
  projects.editProject(s, { action: 'project-delete', id: p.id });
  assert.equal(s.projects.length, 0);
  assert.equal(s.rooms.size, 2);
  assert.equal(s.rooms.get('2').projectId, null);
  const restored = projects.restoreProjects([{ id: 'a', name: ' X ', instructions: 5 }, { id: 'a', name: 'dup' }, null]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].name, 'X');
  assert.equal(restored[0].instructions, '');
});
test('projects: a chat knows the instructions and the other chats of its project', () => {
  const s = fakeSessions();
  const p = projects.editProject(s, { action: 'project-create', name: 'Tez' });
  projects.editProject(s, { action: 'project-instructions', id: p.id, instructions: 'APA kaynak biçimi kullan.' });
  s.mk('a', { projectId: p.id, name: 'Literatür', events: [user('Kaynak olarak Smith 2020 kullanalım.'), answer('Tamam, Smith 2020 eklendi.')] });
  s.mk('b', { projectId: p.id, name: 'Yöntem', events: [] });
  s.mk('c', { name: 'Başka', events: [user('gizli konu')] });
  const ctx = projects.projectContext(s, s.rooms.get('b'), { full: true, contextText });
  assert.match(ctx, /“Tez” projesine ait/);
  assert.match(ctx, /APA kaynak biçimi/);
  assert.match(ctx, /Literatür/);
  assert.match(ctx, /Smith 2020/);
  assert.doesNotMatch(ctx, /gizli konu/, 'chats outside the project stay out');
  // nothing changed since this chat last looked: nothing is sent again
  s.rooms.get('b').projectSeenAt = Date.now() + 1000;
  assert.equal(projects.projectContext(s, s.rooms.get('b'), { full: false, contextText }), '');
  assert.equal(projects.projectContext(s, s.rooms.get('c'), { full: true, contextText }), '');
  // wired into sending and the folder editor, and into the sidebar
  const sessions = read('app/ai/sessions.cjs');
  assert.match(sessions, /projectContext\(this, r/);
  assert.match(sessions, /Charles proje bağlamı/);
  assert.match(read('app/ai/chat-folders.cjs'), /editProject\(this\.sessions, args\)/);
  const sidebar = read('src/workspace/sidebar.ts');
  assert.match(sidebar, /'Projeler'/);
  assert.ok(sidebar.indexOf("'Projeler'") < sidebar.indexOf("'Klasörler'"), 'projects come above folders');
});

// ── 3. empty chats are not listed or saved ──────────────────────────────────
test('empty chats: not in the list, not saved, dropped when left', () => {
  assert.equal(hasContent({ events: [] }), false);
  assert.equal(hasContent({ events: [user('a')] }), true);
  const src = read('app/ai/sessions.cjs');
  assert.match(src, /\.filter\(hasContent\)\s*\.sort\(/);
  assert.match(src, /\[\.\.\.this\.rooms\.values\(\)\]\.filter\(hasContent\)\.map\(/);
  assert.match(src, /leaving an empty chat drops it/);
  assert.match(read('app/ai/chat-folders.cjs'), /activeId: this\.sessions\.active/);
});

// ── 4. modules: Slime API and kit ────────────────────────────────────────────
test('module Slime API: look, reactions, temporary accessories with the appearance permission', async () => {
  const { createModuleHost, cleanWear, FEATURES } = require('../app/modules/host.cjs');
  const data = tmp();
  const calls = [];
  const modules = { m: { version: '1.0.0', permissions: ['appearance'], enabled: true }, plain: { version: '1.0.0', permissions: [], enabled: true } };
  const host = createModuleHost({
    registry: { data: { dev: false }, get: (id) => modules[id] || null, manifest: (id) => ({ name: id, entry: 'index.html' }), root: () => os.tmpdir(), dataDir: () => data },
    electron: { BrowserWindow: class {}, session: {}, ipcMain: { handle: () => {} }, dialog: {}, shell: {}, net: {}, screen: {} },
    deps: {
      charlesVersion: '0.8.8',
      language: () => 'tr',
      askChat: async () => '',
      askImage: async () => '',
      speak: async () => {},
      emote: (n) => calls.push(['emote', n]),
      react: (n) => calls.push(['react', n]),
      wear: (a) => calls.push(['wear', a]),
      look: () => ({ color: 'teal', mustache: false, hat: 'none', eyes: 'none', other: 'scarf' }),
      notify: () => {},
    },
  });
  assert.deepEqual(await host.call('plain', 'slime.look'), { color: 'teal', mustache: false, hat: 'none', eyes: 'none', other: 'scarf' });
  await host.call('plain', 'slime.react', { name: 'greet' });
  await host.call('plain', 'slime.react', { name: 'love' });
  assert.deepEqual(calls, [['react', 'greet'], ['emote', 'love']]);
  await assert.rejects(host.call('plain', 'slime.react', { name: 'explode' }), /Geçersiz tepki/);
  await assert.rejects(host.call('plain', 'slime.wear', { accessories: { eyes: 'roundGlasses' } }), /“appearance” izni yok/);
  await host.call('m', 'slime.wear', { accessories: { eyes: 'roundGlasses' } });
  assert.deepEqual(calls.at(-1), ['wear', { eyes: 'roundGlasses' }]);
  await host.call('m', 'slime.wear', { accessories: null });
  assert.deepEqual(calls.at(-1), ['wear', null]);
  assert.throws(() => cleanWear({ eyes: 'laser' }), /Geçersiz eyes/);
  assert.throws(() => cleanWear({ shoes: 'x' }), /Bilinmeyen aksesuar/);
  assert.throws(() => cleanWear({ hat: 'crown', other: 'pumpkin' }), /Balkabağı/);
  for (const f of ['slime.look', 'slime.react', 'slime.wear', 'slime.kit', 'ai.images']) assert.ok(FEATURES.includes(f), f);
  assert.match(read('app/modules/manifest.cjs'), /appearance:/);
  const preload = read('app/modules/module-preload.cjs');
  assert.match(preload, /wear: \(accessories\) =>/);
  assert.match(preload, /'slime-look'/);
  fs.rmSync(data, { recursive: true, force: true });
});
test('module Slime kit: served read-only from Charles at /_charles/', () => {
  const { resolveRequest } = require('../app/modules/protocol.cjs');
  const files = tmp();
  const kit = tmp();
  fs.mkdirSync(path.join(kit, 'module-kit'));
  fs.mkdirSync(path.join(kit, 'sounds'));
  fs.writeFileSync(path.join(kit, 'module-kit', 'slime.js'), '//');
  fs.writeFileSync(path.join(kit, 'sounds', 'slap.wav'), 'x');
  fs.writeFileSync(path.join(kit, 'secret.txt'), 'x');
  const roots = () => ({ files, data: files, entry: 'index.html', kit });
  assert.equal(resolveRequest('charles-module://m/_charles/slime.js', roots).file, path.join(kit, 'module-kit', 'slime.js'));
  assert.equal(resolveRequest('charles-module://m/_charles/sounds/slap.wav', roots).mime, 'audio/wav');
  for (const bad of ['/_charles/secret.txt', '/_charles/../secret.txt', '/_charles/sounds/../../secret.txt', '/_charles/module-kit/slime.js', '/_charles/sounds/x.mp3'])
    assert.ok(!resolveRequest('charles-module://m' + bad, roots).file, bad);
  assert.match(read('scripts/build.mjs'), /src\/module-kit\/slime-kit\.ts/);
  const kitSrc = read('src/module-kit/slime-kit.ts');
  assert.match(kitSrc, /CharlesSlime/);
  assert.match(kitSrc, /Sound\.base = '\/_charles\/sounds\/'/);
  // the reading pose no longer draws its glasses over worn eyewear
  assert.match(read('src/vendor/slime/engine.ts'), /drawReading\(x, performance\.now\(\) \/ 1000, (?:this\.)?reading, ownEyes[,)]/);
  fs.rmSync(files, { recursive: true, force: true });
  fs.rmSync(kit, { recursive: true, force: true });
});

// ── 5. island ↔ app window ───────────────────────────────────────────────────
test('window switch: a failed save never leaves the island inside the big window', () => {
  const main = read('app/main.cjs');
  assert.match(main, /function syncWindows\(\)/);
  assert.match(main, /workspace save failed/);
  assert.match(main, /return setWorkspace\(on\);\n\s+\} finally \{\n\s+sendWorkspace\(\);\n\s+checkWindowsSoon\(\);/);
  assert.match(read('src/workspace/workspace.ts'), /apply\(await api\.workspaceState\(\)\)/);
  assert.match(read('app/core/store.cjs'), /function renameRetry/);
});

// ── 6. WhatsApp in Charles ──────────────────────────────────────────────────
test('WhatsApp gateway release: picks the Windows zip, checks its SHA-256, finds the binary', () => {
  const assets = [
    { name: 'whatsapp_9.0.0_linux_amd64.zip' },
    { name: 'whatsapp_9.0.0_windows_amd64.zip', size: 10 },
    { name: 'checksums-windows.txt' },
  ];
  assert.equal(wa.pickAssets(assets, 'windows', 'amd64').zip.name, 'whatsapp_9.0.0_windows_amd64.zip');
  assert.equal(wa.pickAssets(assets, 'windows', 'amd64').sums.name, 'checksums-windows.txt');
  assert.equal(wa.pickAssets([{ name: 'evil.zip' }]), null);
  const h = 'a'.repeat(64);
  assert.equal(wa.expectedHash('z.zip', `${h}  z.zip\n${'b'.repeat(64)}  other.zip`), h);
  assert.equal(wa.expectedHash('z.zip', '', 'sha256:' + 'C'.repeat(64)), 'c'.repeat(64));
  assert.equal(wa.expectedHash('z.zip', 'nonsense'), null);
  assert.equal(wa.binaryEntry(['README.md', 'windows-amd64.exe']), 'windows-amd64.exe');
  assert.equal(wa.binaryEntry(['dir/', 'x/whatsapp.exe']), 'x/whatsapp.exe');
  assert.equal(wa.binaryEntry(['run.bat']), null);
});
test('WhatsApp webhook payloads: messages, media labels, nothing else', () => {
  const m = wa.parseWebhook(JSON.stringify({ event: 'message', device_id: 'x', payload: { id: 'M1', chat_id: '905551112233@s.whatsapp.net', from: '905551112233@s.whatsapp.net', from_name: 'Mert', body: 'Selam', timestamp: '2026-10-23T10:00:00Z', is_from_me: false } }));
  assert.deepEqual({ ...m }, { group: false, id: 'M1', chat: '905551112233@s.whatsapp.net', from: '905551112233@s.whatsapp.net', name: 'Mert', text: 'Selam', media: null, kind: null, at: Date.parse('2026-10-23T10:00:00Z'), mine: false });
  assert.equal(wa.parseWebhook(JSON.stringify({ event: 'message', payload: { id: 'M2', chat_id: 'a@lid', image: { url: 'x' } } })).media, 'Fotoğraf');
  assert.equal(wa.parseWebhook(JSON.stringify({ event: 'message.ack', payload: {} })), null);
  assert.equal(wa.parseWebhook('not json'), null);
  assert.ok(wa.isPerson('905551112233@s.whatsapp.net') && wa.isPerson('1234567@lid'));
  assert.ok(!wa.isPerson('123@g.us') && !wa.isPerson('status@broadcast'));
});

function fakeGateway() {
  const state = { loggedIn: false, sent: [], reads: [], devices: [] };
  const QR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const reply = (status, body, type = 'application/json') => ({
    ok: status < 400,
    status,
    headers: { get: (k) => (k === 'content-type' ? type : null) },
    arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))),
  });
  const zip = Buffer.from(zipSync({ 'windows-amd64.exe': new Uint8Array([77, 90, 1, 2]) }));
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  const fetch = async (url, opts = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.github.com')
      return reply(200, {
        tag_name: 'v9.0.0',
        assets: [
          { name: 'whatsapp_9.0.0_windows_amd64.zip', size: zip.length, browser_download_url: 'https://github.com/dl/zip' },
          { name: 'checksums-windows.txt', browser_download_url: 'https://github.com/dl/sums' },
        ],
      });
    if (u.pathname === '/dl/zip') return reply(200, state.badZip ? Buffer.from('tampered') : zip, 'application/zip');
    if (u.pathname === '/dl/sums') return reply(200, Buffer.from(`${sha}  whatsapp_9.0.0_windows_amd64.zip\n`), 'text/plain');
    // the local gateway: basic auth and the device header are always sent
    assert.match(opts.headers.Authorization, /^Basic /);
    assert.equal(opts.headers['X-Device-Id'], 'charles');
    const route = opts.method + ' ' + u.pathname;
    if (route === 'GET /health') return reply(200, Buffer.from('OK'), 'text/plain');
    if (route === 'GET /devices') return reply(200, { results: state.devices });
    if (route === 'POST /devices') {
      state.devices.push({ id: JSON.parse(opts.body).device_id });
      return reply(200, { results: {} });
    }
    if (route === 'GET /devices/charles/status') return reply(200, { results: { is_logged_in: state.loggedIn, is_connected: state.loggedIn } });
    if (route === 'GET /devices/charles/login') return reply(200, { results: { qr_link: 'http://evil.example/statics/qr.png', qr_duration: 30 } });
    if (route === 'GET /statics/qr.png') return reply(200, QR, 'image/png');
    if (route === 'GET /app/status') return reply(200, { results: { jid: '905550000000:12@s.whatsapp.net' } });
    if (route === 'POST /send/message') {
      state.sent.push(JSON.parse(opts.body));
      return reply(200, { results: { message_id: 'S' + state.sent.length } });
    }
    if (u.pathname.startsWith('/message/') && u.pathname.endsWith('/read')) {
      state.reads.push(decodeURIComponent(u.pathname.split('/')[2]));
      return reply(200, { results: {} });
    }
    if (u.pathname.startsWith('/chat/')) return reply(200, { results: { data: [] } });
    return reply(404, { message: 'no' });
  };
  return { state, fetch };
}
function fakeSpawn() {
  const runs = [];
  const spawn = (exe, args, opts) => {
    const child = new EventEmitter();
    child.pid = 4242;
    child.kill = () => child.emit('exit', 0);
    runs.push({ exe, args, opts });
    return child;
  };
  return { runs, spawn };
}
function post(port, body, secret) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port, path: '/whatsapp', method: 'POST', headers: { 'X-Hub-Signature-256': wa.signature(data, secret) } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(data);
  });
}
test('WhatsApp in Charles: install, QR, link, a message, a reply — all on this computer', async () => {
  const dir = tmp();
  const g = fakeGateway();
  const sp = fakeSpawn();
  const live = new wa.WhatsAppLive({ dir, fetch: g.fetch, spawn: sp.spawn, platform: 'win32' });
  live.killStale = () => {};
  assert.equal(live.state().link, 'off');
  // a tampered download is refused, nothing is installed
  g.state.badZip = true;
  await assert.rejects(live.install(), /SHA-256/);
  assert.equal(live.installed(), false);
  g.state.badZip = false;
  assert.equal(await live.install(), '9.0.0');
  assert.deepEqual([...fs.readFileSync(live.binary)], [77, 90, 1, 2]);
  assert.ok(live.binary.startsWith(dir), 'the gateway lives in the user data folder');

  await live.enable(true);
  const run = sp.runs[0];
  assert.deepEqual(run.args.slice(0, 2), ['rest', '--host=127.0.0.1']);
  assert.match(run.args.join(' '), /--auto-download-media=false/);
  assert.equal(run.opts.stdio, 'ignore');
  assert.equal(run.opts.env.APP_UI_ENABLED, 'false');
  assert.match(run.opts.env.APP_BASIC_AUTH, /^charles:[0-9a-f]{36}$/);
  assert.match(run.opts.env.WHATSAPP_WEBHOOK, /^http:\/\/127\.0\.0\.1:\d+\/whatsapp$/);
  assert.ok(!run.args.join(' ').includes(run.opts.env.WHATSAPP_WEBHOOK_SECRET), 'secrets never on the command line');
  assert.deepEqual(g.state.devices, [{ id: 'charles' }]);
  // not linked yet: a QR, fetched from the gateway itself whatever host its link names
  assert.equal(live.state().link, 'qr');
  assert.match(live.state().qr, /^data:image\/png;base64,/);

  g.state.loggedIn = true;
  await live.poll();
  assert.equal(live.state().link, 'connected');
  assert.equal(live.state().me, '905550000000');

  const port = live.server.address().port;
  const got = [];
  live.on('message', (m) => got.push(m));
  const msg = { event: 'message', payload: { id: 'M1', chat_id: '905551112233@s.whatsapp.net', from_name: 'Mert Yılmaz', body: 'Yarınki toplantı için notları attım.', timestamp: new Date().toISOString() } };
  // a delivery without the right signature is refused
  assert.equal(await post(port, msg, 'wrong'), 401);
  assert.equal(got.length, 0);
  assert.equal(await post(port, msg, live.secret), 200);
  assert.equal(await post(port, msg, live.secret), 200); // the same message twice counts once
  assert.equal(got.length, 1);
  assert.equal(got[0].name, 'Mert Yılmaz');
  assert.equal(got[0].unread, 1);
  // groups stay quiet unless the user wants them
  await post(port, { event: 'message', payload: { id: 'G1', chat_id: '123-456@g.us', body: 'grup' } }, live.secret);
  assert.equal(got.length, 1);

  // reading marks the last message read; replying goes only to a chat that wrote
  await live.markRead('905551112233@s.whatsapp.net');
  assert.deepEqual(g.state.reads, ['M1']);
  await live.reply('905551112233@s.whatsapp.net', 'Tamam, bakıyorum');
  assert.deepEqual(g.state.sent, [{ phone: '905551112233@s.whatsapp.net', message: 'Tamam, bakıyorum' }]);
  await assert.rejects(live.reply('905559999999@s.whatsapp.net', 'x'), /yanıt verilebilir/);
  await assert.rejects(live.reply('905551112233@s.whatsapp.net', '   '), /boş/);
  // "WhatsApp'tan Annem'e …" with a saved number
  await live.sendTo('+90 555 444 33 22', 'Geliyorum');
  assert.equal(g.state.sent.at(-1).phone, '905554443322@s.whatsapp.net');
  // a few messages a minute at most
  for (let i = 0; i < 6; i++) await live.reply('905551112233@s.whatsapp.net', 'm' + i);
  await assert.rejects(live.reply('905551112233@s.whatsapp.net', 'one too many'), /bir dakika bekle/);

  // turning it off forgets every message; settings hold no message or secret
  await live.enable(false);
  assert.equal(live.chats.size, 0);
  const saved = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
  assert.doesNotMatch(saved, /Mert|toplantı|charles:|secret/i);
  assert.throws(() => live.configure({ quickReplies: Array(9).fill('a') }), /En fazla 8/);
  assert.deepEqual(live.configure({ quickReplies: [' Tamam '] }).quickReplies, ['Tamam']);
  await live.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
test('WhatsApp UI: in the existing WhatsApp card and the existing bubble under the island', () => {
  const card = read('src/settings/whatsapp-card.ts');
  assert.match(card, /Mesajlar Charles’ta/);
  assert.match(card, /wa-people-toggle/);
  assert.match(card, /peopleBody\.hidden = true/, 'contacts are folded by default');
  const bubble = read('public/bubble.js');
  for (const s of ['Hızlı yanıtlar', 'Mesaj gönderiliyor…', 'Yanıt gönderildi', 'Sohbeti aç', 'yeni mesaj']) assert.ok(bubble.includes(s), s);
  assert.doesNotMatch(bubble, /innerHTML/);
  assert.match(read('app/plugins/mail-bubble.cjs'), /ipcMain\.handle\('bubble-wa'/);
  assert.match(read('public/styles/17-v088.css'), /button\.wa-remove \{[^}]*width: 28px !important/);
});

test('version 0.8.8 or later and notes', () => {
  assert.match(JSON.parse(read('package.json')).version, /^0\.(8\.([8-9]|\d\d)|(9|\d\d)\.\d+)/);
  assert.match(read('CHANGELOG.md'), /## v0\.8\.8 Beta/);
  assert.match(read('docs/MODULES.md'), /CharlesSlime\.mount/);
  assert.match(read('THIRD-PARTY-NOTICES.md'), /go-whatsapp-web-multidevice/);
});
