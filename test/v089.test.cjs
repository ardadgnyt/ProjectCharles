// v0.8.9: lighter history (smoother window switch), WhatsApp groups and card fixes, bubbles
// that move with the growing island, README modules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-089-'));
const { Sessions, savedEvents } = require('../app/ai/sessions.cjs');
const wa = require('../app/plugins/whatsapp-live.cjs');

const done = (item) => ({ type: 'agent', data: { method: 'item/completed', params: { item } } });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(3000, 7)]).toString('base64');

test('history keeps what matters: no prompt echo, pictures as files, long outputs cut', () => {
  const dir = tmp();
  const events = [
    { type: 'history-user', data: 'çiz bir kedi' },
    done({ id: 'u1', type: 'userMessage', content: [{ type: 'text', text: 'x'.repeat(160000) }] }),
    done({ id: 'i1', type: 'imageGeneration', status: 'completed', result: PNG }),
    done({ id: 'c1', type: 'commandExecution', command: 'dir', aggregatedOutput: 'a'.repeat(50000) + 'SON' }),
    done({ id: 'm1', type: 'mcpToolCall', tool: 'read', result: { text: 'b'.repeat(50000) } }),
    done({ id: 'f1', type: 'fileChange', changes: [{ path: 'a.txt', diff: 'd'.repeat(80000) }] }),
    done({ id: 'a1', type: 'agentMessage', text: 'İşte kedi.' }),
    { type: 'agent', data: { method: 'turn/completed', params: { turn: { status: 'completed' } } } },
  ];
  const kept = savedEvents(events, { imageDir: dir });
  assert.ok(!kept.some((e) => e.data?.params?.item?.type === 'userMessage'));
  const img = kept.find((e) => e.data?.params?.item?.type === 'imageGeneration').data.params.item;
  assert.equal(img.result, '');
  assert.match(img.resultFile, /^[0-9a-f]{40}\.png$/);
  assert.ok(fs.existsSync(path.join(dir, img.resultFile)));
  const cmd = kept.find((e) => e.data?.params?.item?.type === 'commandExecution').data.params.item;
  assert.ok(cmd.aggregatedOutput.length <= 20001 && cmd.aggregatedOutput.endsWith('SON'));
  assert.ok(kept.find((e) => e.data?.params?.item?.type === 'mcpToolCall').data.params.item.result.length <= 20001);
  assert.ok(kept.find((e) => e.data?.params?.item?.type === 'fileChange').data.params.item.changes[0].diff.length < 50010);
  assert.equal(JSON.stringify(kept).length < 100000, true);
  // the input is not changed
  assert.equal(events[2].data.params.item.result, PNG);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history is written asynchronously, flushed on quit, searched in the main process', async () => {
  const dir = tmp();
  const s = new Sessions(root, dir);
  s.current.events.push({ type: 'history-user', data: 'Merhaba Charles, diferansiyel denklem' });
  s.current.name = 'Matematik';
  s.save();
  await new Promise((r) => setTimeout(r, 400));
  while (s.writing) await s.writing;
  const file = path.join(dir, 'charles-history.json');
  assert.match(fs.readFileSync(file, 'utf8'), /diferansiyel/);
  assert.deepEqual(s.search('DİFERANSİYEL'), [s.current.id]);
  assert.deepEqual(s.search('yok böyle bir şey'), []);
  assert.equal('search' in s.list()[0], false, 'the list no longer carries every chat’s text');
  s.current.events.push({ type: 'history-user', data: 'son mesaj' });
  s.flush();
  assert.match(fs.readFileSync(file, 'utf8'), /son mesaj/);
  // after flush (quitting) no late async write replaces the file
  s.save();
  await new Promise((r) => setTimeout(r, 400));
  assert.match(fs.readFileSync(file, 'utf8'), /son mesaj/);
  const main = read('app/main.cjs');
  assert.match(main, /agent\?\.flush\?\.\(\)/);
  assert.match(main, /safeHandler\('history-search'/);
  assert.match(main, /safeHandler\('history-image'/);
  assert.match(read('src/workspace/sidebar.ts'), /api\.historySearch\(q\)/);
  assert.match(read('src/renderer.ts'), /api\s*\.historyImage\(item\.resultFile\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('window switch: the chat is not laid out while the page moves', () => {
  const ws = read('src/workspace/workspace.ts');
  assert.match(ws, /function switching\(\)/);
  assert.match(ws, /document\.body\.classList\.remove\('ws-switching'\)/);
  assert.match(read('public/styles/17-v088.css'), /body\.ws-switching #feed \{\s*content-visibility: hidden;/);
});

test('bubbles move with a growing island at once', () => {
  const main = read('app/main.cjs');
  assert.match(main, /const growing = target\.height > previous\.height \|\| target\.width > previous\.width;/);
  assert.match(main, /if \(growing \|\| !animate\) mailBubble\?\.place\(\);/);
});

test('WhatsApp groups: shown as the group, only when turned on', async () => {
  const dir = tmp();
  const live = new wa.WhatsAppLive({ dir, fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from(JSON.stringify({ results: { Name: 'Proje Ekibi' } })) }), spawn: () => null, platform: 'win32' });
  live.port = 1;
  live.auth = 'a:b';
  const got = [];
  live.on('message', (m) => got.push(m));
  const msg = (id, chat, extra = {}) => ({ id, chat, from: '905551112233@s.whatsapp.net', name: 'M. Eren', text: 'Paylaşcaz mı bunu', media: null, at: Date.now(), mine: false, group: /@g\.us$/.test(chat), ...extra });
  // off: groups, channels and status never come
  live.receive(msg('G1', '120363@g.us'));
  live.receive(msg('N1', '123@newsletter'));
  live.receive(msg('S1', 'status@broadcast'));
  // a group the gateway marked only through other fields
  live.receive(msg('G2', '905551112233@s.whatsapp.net', { group: true }));
  assert.equal(got.length, 0);
  live.configure({ groups: true });
  live.receive(msg('G3', '120363@g.us'));
  await new Promise((r) => setTimeout(r, 30));
  const last = got.at(-1);
  assert.equal(last.group, true);
  assert.equal(last.name, 'Proje Ekibi');
  assert.equal(last.text, 'M. Eren: Paylaşcaz mı bunu');
  assert.equal(last.sender, 'M. Eren');
  // turned off again: the group's messages go
  live.configure({ groups: false });
  assert.equal(live.chats.has('120363@g.us'), false);
  // the gateway itself drops channels and status
  assert.match(read('app/plugins/whatsapp-live.cjs'), /WHATSAPP_WEBHOOK_IGNORE_JIDS: '@newsletter,status@broadcast'/);
  assert.equal(wa.parseWebhook(JSON.stringify({ event: 'message', payload: { id: 'x', chat_id: '120363@g.us', from: 'a@s.whatsapp.net', body: 'hi' } })).group, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('WhatsApp card: centred send, × inside the window, no Windows tooltips', () => {
  const css = read('public/bubble.css');
  assert.match(css, /\.wa-compose \{\s*display: flex;\s*align-items: center;/);
  // v0.9.2: a little more room for the larger ×
  assert.match(css, /#stack \{[^}]*padding: 11px 11px 8px;/);
  const js = read('public/bubble.js');
  assert.doesNotMatch(js, /\.title = /, 'no native tooltips');
  assert.match(js, /waUpdate\(\[\]\);\s*resize\(\);\s*void window\.bubble\.wa\('dismiss-all'\)/);
  assert.match(js, /wa-from/);
  assert.match(read('src/settings/whatsapp-card.ts'), /groups\.onchange = async \(\) =>/);
});

test('README: modules, official modules link, updater since v0.8.2', () => {
  const md = read('README.md');
  assert.match(md, /## Modules · Modüller/);
  assert.match(md, /https:\/\/github\.com\/ardadgnyt\/ProjectCharles\/releases#release-Modules/);
  assert.match(md, /docs\/images\/modules\.png/);
  assert.ok(fs.existsSync(path.join(root, 'docs/images/modules.png')));
  assert.match(md, /v0\.8\.2/);
});

test('version 0.8.9 is in the changelog', () => {
  assert.match(read('CHANGELOG.md'), /## v0\.8\.9 Beta/);
});
