'use strict';
// v0.9.6 (Argon): effort levels, EVREN, empty chats, Quick Share visibility, the + button.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function fakeCodex(models) {
  const { Agent } = require('../app/ai/agent.cjs');
  const agent = new Agent(ROOT);
  const calls = [];
  agent.ready = true;
  agent.signedIn = true;
  agent.rpc = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'model/list') return { data: models, nextCursor: null };
      if (method === 'account/read') return { account: { type: 'chatgpt', email: 'x' }, requiresOpenaiAuth: false };
      if (method === 'thread/start') return { thread: { id: 't1' } };
      if (method === 'turn/start') return { turn: { id: 'u1' } };
      return {};
    },
  };
  return { agent, calls };
}

test('GPT: each model offers exactly the levels Codex lists for it', async () => {
  const { agent } = fakeCodex([
    { model: 'gpt-a', displayName: 'A', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low', description: '' }, { reasoningEffort: 'xhigh', description: '' }] },
    { model: 'gpt-b', displayName: 'B', isDefault: false, supportedReasoningEfforts: [] },
  ]);
  const list = await agent.models();
  assert.deepEqual(list[0].efforts.map((e) => [e.value, e.label, e.id]), [['low', 'Low', 'gpt-a'], ['xhigh', 'Extra High', 'gpt-a']]);
  assert.equal(list[1].efforts, undefined, 'no levels → locked on Otomatik');
});

test('GPT: the level goes with turn/start (Codex has no such field on thread/start)', async () => {
  const { agent, calls } = fakeCodex([
    { model: 'gpt-a', displayName: 'A', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'high', description: '' }] },
  ]);
  agent.account = async () => ({ signedIn: true });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-effort-'));
  await agent.send({ cwd, model: 'gpt-a', prompt: 'merhaba', mode: 'chat', effort: 'high' });
  const thread = calls.find((c) => c.method === 'thread/start').params;
  const turn = calls.find((c) => c.method === 'turn/start').params;
  assert.equal(thread.reasoningEffort, undefined);
  assert.equal(turn.effort, 'high');
  agent.busy = false;
  await assert.rejects(agent.send({ cwd, model: 'gpt-a', prompt: 'x', mode: 'chat', effort: 'ultra' }), /geçerli bir efor/);
  agent.busy = false;
  await agent.send({ cwd, model: 'gpt-a', prompt: 'x', mode: 'chat', effort: '' });
  assert.equal(calls.filter((c) => c.method === 'turn/start').at(-1).params.effort, undefined, 'Otomatik sends none');
  assert.equal(calls.filter((c) => c.method === 'thread/start').length, 1, 'changing the level does not restart the chat');
  fs.rmSync(cwd, { recursive: true, force: true });
});

test('Claude: Claude Code’s own --effort values; Haiku takes none', () => {
  const { launchPlan } = require('../app/ai/provider-tools.cjs');
  const base = { provider: 'claude', model: 'opus', mode: 'chat', access: 'ask', workspace: os.tmpdir() };
  const cli = launchPlan({ ...base, effort: 'xhigh' }).cli;
  assert.equal(cli[cli.indexOf('--effort') + 1], 'xhigh');
  assert.throws(() => launchPlan({ ...base, effort: 'extra-high' }), /geçerli bir efor/);
  const { Providers } = require('../app/ai/providers.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-claude-'));
  const p = new Providers(dir, dir);
  p.auth.claude = true;
  const rows = p.models().filter((m) => m.id.startsWith('claude:'));
  assert.deepEqual(rows.find((m) => m.id === 'claude:claude-opus-5-5').efforts.map((e) => e.value), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(rows.find((m) => m.id === 'claude:claude-haiku-5-5').efforts, undefined);
  // v0.9.8: versions, not bare aliases (Opus 5.5 and Opus 5 apart); Fable needs credits
  assert.ok(rows.some((m) => m.id === 'claude:claude-opus-5') && rows.some((m) => m.id === 'claude:claude-sonnet-5-5'));
  assert.ok(!rows.some((m) => /fable|^claude:(opus|sonnet|haiku)$/.test(m.id)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the chosen level reaches the main process and is remembered per model', () => {
  assert.match(read('app/main.cjs'), /effort: typeof args\.effort === 'string' \? args\.effort\.slice\(0, 24\) : ''/);
  assert.match(read('src/renderer.ts'), /effort: model\.selectedOptions\[0\]\?\.dataset\.effort \|\| ''/);
  const picker = read('src/chat/effort-picker.ts');
  assert.match(picker, /localStorage\.setItem\(STORE \+ base, value\)/);
});

test('EVREN lists every chat model the account offers', () => {
  const { cleanModels } = require('../app/ai/evren.cjs');
  assert.deepEqual(cleanModels([{ id: 'a/model-one' }, { id: 'text-embedding-x' }, { id: 'model-two', name: 'Two' }]), [
    ['a/model-one', 'model-one'],
    ['model-two', 'Two'],
  ]);
});

test('empty chats are never saved, however often Charles starts', () => {
  const { Sessions } = require('../app/ai/sessions.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-empty-'));
  for (let i = 0; i < 4; i++) {
    const s = new Sessions(ROOT, dir);
    s.freshStart();
    s.local('', 'Takvim önerisi'); // Charles' own note does not make a chat real
    s.flush();
    s.stop();
  }
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'charles-history.json'), 'utf8'));
  assert.equal(saved.rooms.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the + button opens its menu when its icon is clicked', () => {
  const src = read('src/settings/settings-pages.ts');
  assert.match(src, /!plus\.contains\(e\.target as Node\)/);
  assert.doesNotMatch(src, /e\.target !== plus/);
});

test('Quick Share: no JavaScript engine in the app, announcements repeat, resume republishes', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/files/quickshare.cjs')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/files/quickshare-channel.cjs')));
  const wire = require('../app/files/mdns-wire.cjs');
  const q = wire.buildMdnsQuery(['_FC9F5ED42C8A._tcp.local.']);
  assert.equal(wire.parseMdnsPacket(q).questions[0].name, '_FC9F5ED42C8A._tcp.local');
  const mdns = read('tools/quickshare/vendor/multidrop/backends/quickshare/mdns.py');
  assert.match(mdns, /ANNOUNCE_INTERVAL = 4\.0/);
  assert.match(mdns, /def same_subnet\(/);
  assert.match(mdns, /VIRTUAL_ADAPTER = re\.compile\(/);
  assert.match(read('tools/quickshare/bridge.py'), /if method == "refresh":/);
  assert.match(read('app/files/quickshare-multidrop.cjs'), /this\.request\(force \? 'refresh' : 'health'/);
  // the vendor manifest matches the shipped files
  const crypto = require('node:crypto');
  const up = JSON.parse(read('tools/quickshare/UPSTREAM.json'));
  for (const [file, v] of Object.entries(up.files)) {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'tools/quickshare/vendor', file))).digest('hex');
    assert.equal(sha, v.sha256, file);
    assert.equal(v.modified, sha !== v.originalSha256, file);
  }
});

test('v0.9.5 leftovers: readable sources, full module docs, versions agree', () => {
  for (const f of ['src/island/shelf.ts', 'src/module-kit/slime-kit.ts', 'src/settings/lang/de.ts'])
    assert.doesNotMatch(read(f), /\\u0131|\\xFC|\\xE7/, f);
  assert.match(read('docs/MODULES.md'), /CharlesSlime\.mount/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'docs/DOWNLOAD-MODULE.md')));
  const label = 'v' + JSON.parse(read('package.json')).version.replace(/-beta\.\d+$/, '') + ' Beta';
  for (const m of read('setup/Create-Desktop-Shortcut.vbs').match(/v0\.\d+\.\d+ Beta/g)) assert.equal(m, label);
  assert.match(read('README.md'), new RegExp('version-' + label.split(' ')[0].replace(/\./g, '\\.') + '%20beta'));
});

test('model menu: providers first, models beside them without the provider name', () => {
  const src = read('src/chat/model-picker.ts');
  for (const name of ['OpenAI', 'AntiGravity', 'Claude', 'Cursor', 'Abacus AI', 'Evren']) assert.match(src, new RegExp(`'${name}'`));
  assert.match(src, /addEventListener\('pointerenter', \(\) => showModels\(id, row\)\)/);
});

test('every model: Claude from the account, Antigravity and Cursor unfiltered', () => {
  const { cleanClaudeModels, parseCursorModels, Providers } = require('../app/ai/providers.cjs');
  // models that need usage credits (Fable) are not offered
  assert.deepEqual(
    cleanClaudeModels([{ id: 'claude-fable-5-1', display_name: 'Claude Fable 5.1' }, { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }, { id: 'x; rm' }]),
    [['claude-sonnet-5-5', 'Sonnet 5.5']],
  );
  assert.deepEqual(parseCursorModels('gpt-5.5 - GPT 5.5\nauto - Auto\n').map(([id]) => id), ['gpt-5.5']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-all-'));
  const p = new Providers(dir, dir);
  p.auth.claude = true;
  p.claudeModels = cleanClaudeModels([{ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' }, { id: 'claude-opus-4-1', display_name: 'Claude Opus 4.1' }, { id: 'claude-3-opus-20240229', display_name: 'Claude Opus 3' }]);
  const rows = p.models();
  assert.ok(rows.find((m) => m.id === 'claude:claude-opus-4-8').efforts.length);
  assert.equal(rows.find((m) => m.id === 'claude:claude-opus-4-1').efforts, undefined);
  assert.equal(rows.find((m) => m.id === 'claude:claude-3-opus-20240229').efforts, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('opening an old chat: no new Codex process, the latest messages first', () => {
  const sessions = read('app/ai/sessions.cjs');
  assert.match(sessions, /if \(donor && donor !== this\.current\.agent\) return donor\.account\(\);/);
  assert.match(sessions, /pruneAgents\(\)/);
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /const TAIL_MESSAGES = 20;/);
  assert.match(renderer, /if \(!replaying\) stickToBottom\(feed/);
});

test('Quick Share firewall: rules read without admin, block rules reported', async () => {
  const { QuickShareFirewall } = require('../app/files/firewall.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-fw-'));
  fs.mkdirSync(path.join(dir, 'python'));
  fs.writeFileSync(path.join(dir, 'python', 'python.exe'), '');
  const fw = new QuickShareFirewall({ runtimeRoot: () => dir, platform: 'win32', run: async () => '{"allow":2,"block":1}' });
  assert.equal((await fw.check()).ok, false);
  const good = new QuickShareFirewall({ runtimeRoot: () => dir, platform: 'win32', run: async () => '{"allow":2,"block":0}' });
  assert.equal((await good.check()).ok, true);
  const broken = new QuickShareFirewall({ runtimeRoot: () => dir, platform: 'win32', run: async () => { throw Error('x'); } });
  assert.equal((await broken.check()).ok, true, 'never nags when the rules cannot be read');
  assert.match(read('tools/quickshare/Allow-Local-Network.ps1'), /Remove-NetFirewallRule/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Quick Share: the announcement also goes straight to mDNS neighbours', () => {
  const mdns = read('tools/quickshare/vendor/multidrop/backends/quickshare/mdns.py');
  assert.match(mdns, /def neighbor\(self, ip: str\)/);
  assert.match(mdns, /self\.transport\.sendto\(chunk, \(ip, 5353\)\)/);
  assert.match(read('tools/quickshare/bridge.py'), /if method == "mdns-neighbor":/);
  assert.match(read('app/files/quickshare-multidrop.cjs'), /this\.request\('mdns-neighbor', \{ address: ip \}\)/);
});

test('waving puts away what Slime holds and brings it back', () => {
  const engine = read('src/vendor/slime/engine.ts');
  assert.match(engine, /const keep = Math\.max\(0, 1 - this\.hands\);/);
  assert.match(engine, /const held = hand\.presence \* this\.handFree\(\);/);
  assert.match(engine, /return Math\.max\(0, 1 - this\.hands\) \* Math\.max\(0, 1 - this\.propHands \* 1\.5\);/);
  assert.match(engine, /const prop = keep \* this\.stationAlpha;/);
});

test('the island stays on top unless another app is full screen', () => {
  const main = read('app/main.cjs');
  assert.match(main, /if \(workspace \|\| fullscreenOther\) \{/);
  assert.match(main, /startTopGuard\(\);/);
  assert.match(read('app/system/foreground.ps1'), /full=\[CharlesForeground\]::FullScreen\(\$handle\)/);
});

test('no yawning or sleeping while music plays (he dances instead)', () => {
  assert.match(read('src/renderer.ts'), /if \(musicPlaying && !quotaBlocked\) \{\s*if \(sleeping \|\| idlePhase > 0\) touchCharacter\(\);/);
});

test('while music plays Charles dances and never falls asleep', () => {
  const r = read('src/renderer.ts');
  assert.match(r, /if \(musicPlaying && !quotaBlocked && \(sleeping \|\| idlePhase > 0\)\) touchCharacter\(\);/);
  assert.match(r, /!calm && !sleeping && bot\.reading < 0\.01\);/);
  assert.match(r, /elapsed >= 180000 && idlePhase < 2 && !musicPlaying/);
  assert.match(r, /elapsed >= 60000 && idlePhase < 1 && !musicPlaying/);
});
