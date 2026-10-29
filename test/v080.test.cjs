// v0.8.0: Abacus AI, the usage card choice, the in-place updater, release:pack and the
// installer's language question.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { zipSync, strToU8 } = require('fflate');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v080-'));

const abacus = require('../app/ai/abacus.cjs');
const updater = require('../app/core/updater.cjs');

// ── Abacus AI ────────────────────────────────────────────────────────────────
test('abacus: every account model is read from the CLI and named "Abacus AI · …"', async () => {
  assert.equal(abacus.prettyModel('codex/gpt-6.1-sol'), 'GPT-6.1-Sol');
  // text and JSON listings; junk lines and duplicates are ignored
  assert.deepEqual(
    abacus.parseAbacusModels('\x1b[1mModels\x1b[0m\n  ❯ codex/gpt-6.1-sol (current)\n  • anthropic/claude-sonnet-5 - Claude Sonnet 5\n  codex/gpt-6.1-sol\n  hello world\n  ollama/qwen3-coder  (new chat only)\n'),
    [['codex/gpt-6.1-sol', 'GPT-6.1-Sol'], ['anthropic/claude-sonnet-5', 'Claude Sonnet 5'], ['ollama/qwen3-coder', 'Qwen3-Coder']],
  );
  assert.deepEqual(abacus.parseAbacusModels(JSON.stringify({ models: [{ id: 'google/gemini-3-pro', name: 'Gemini 3 Pro' }, 'x/../y', 'nope'] })), [['google/gemini-3-pro', 'Gemini 3 Pro']]);
  const dir = tmp();
  const { Providers } = require('../app/ai/providers.cjs');
  const p = new Providers(ROOT, dir);
  p.abacus.models = abacus.parseAbacusModels('codex/gpt-6.1-sol\nanthropic/claude-sonnet-5 - Claude Sonnet 5');
  p.saveAbacus();
  const all = p.allModels().filter(([id]) => id.startsWith('abacus:'));
  assert.deepEqual(all, [
    ['abacus:auto', 'Abacus AI · Otomatik'],
    ['abacus:codex/gpt-6.1-sol', 'Abacus AI · GPT-6.1-Sol'],
    ['abacus:anthropic/claude-sonnet-5', 'Abacus AI · Claude Sonnet 5'],
  ]);
  // every other model name keeps its own prefix, so nothing mixes
  for (const [id, name] of p.allModels()) if (!id.startsWith('abacus:')) assert.doesNotMatch(name, /Abacus/);
  // not signed in → not offered in the chat
  assert.ok(!p.models().some((m) => m.id.startsWith('abacus:')));
  p.auth.abacus = true;
  assert.ok(p.models().some((m) => m.id === 'abacus:codex/gpt-6.1-sol'));
  // saved without keys or account data, and read back
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'providers', 'abacus.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['models', 'verified']);
  assert.equal(new Providers(ROOT, dir).abacus.models.length, 2);
  assert.ok(p.status().some((s) => s.id === 'abacus'));
  // no typing model ids by hand
  assert.doesNotMatch(read('src/settings/abacus-card.ts'), /<input|el\('input'\)|providersAbacusModels/);
  assert.doesNotMatch(read('app/preload.cjs'), /providersAbacusModels/);
});

test('abacus: never the permission-bypassing mode; chat is read-only', () => {
  const chat = abacus.abacusPlan({ model: 'auto', prompt: 'merhaba', mode: 'chat', workspace: 'W' });
  const all = (p) => p.cli.join(' ');
  assert.equal(chat.cwd, 'W');
  assert.equal(chat.tools, false);
  assert.ok(!chat.cli.includes('--model'));
  assert.match(all(chat), /--permission-mode plan/);
  for (const t of ['Bash', 'Edit', 'Write', 'Read', 'WebFetch']) assert.ok(chat.cli.includes(t), t);
  const ask = abacus.abacusPlan({ model: 'codex/gpt-5.4', prompt: 'x', mode: 'project', access: 'ask', projectDir: 'P', workspace: 'W' });
  assert.equal(ask.cwd, 'P');
  assert.match(all(ask), /--permission-mode plan/);
  assert.match(all(ask), /--model codex\/gpt-5\.4/);
  const auto = abacus.abacusPlan({ model: 'auto', prompt: 'x', mode: 'project', access: 'full', projectDir: 'P', workspace: 'W' });
  assert.match(all(auto), /--permission-mode accept-edits/);
  assert.ok(auto.cli.includes('Bash'), 'the shell stays denied');
  for (const p of [chat, ask, auto]) assert.doesNotMatch(all(p), /yolo|dangerously|skip-permissions|--force/);
  assert.throws(() => abacus.abacusPlan({ model: 'auto', prompt: 'x'.repeat(abacus.MAX_PROMPT + 1), mode: 'chat', workspace: 'W' }), /çok uzun/);
  assert.throws(() => abacus.abacusPlan({ model: 'a;b', prompt: 'x', mode: 'chat', workspace: 'W' }), /Geçersiz/);
  assert.equal(abacus.abacusEnv({ ELECTRON_RUN_AS_NODE: '1' }).ABACUS_AUTO_UPDATE, 'off');
  assert.equal(abacus.abacusEnv({ ELECTRON_RUN_AS_NODE: '1' }).ELECTRON_RUN_AS_NODE, undefined);
  assert.doesNotMatch(read('app/ai/abacus.cjs').replace(/\/\/.*$/gm, ''), /'yolo'|dangerously/);
});

test('abacus: finds an npm install without a shell and never leaves npm’s folder', () => {
  const files = new Map();
  const fsx = {
    statSync: (f) => {
      if (!files.has(f)) throw Error('ENOENT');
      return { isFile: () => true };
    },
    readFileSync: (f) => files.get(f),
  };
  const npm = path.join('C:/Users/u/AppData/Roaming', 'npm');
  const shim = path.join(npm, 'abacusai.cmd');
  const script = path.join(npm, 'node_modules', '@abacus-ai', 'cli', 'dist', 'index.js');
  files.set(shim, '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@abacus-ai\\cli\\dist\\index.js" %*\r\n');
  files.set(script, '');
  files.set(path.join(npm, 'node.exe'), '');
  const env = { APPDATA: 'C:/Users/u/AppData/Roaming', USERPROFILE: 'C:/Users/u', PATH: '' };
  const found = abacus.findAbacus(env, fsx);
  assert.equal(found.kind, 'npm');
  assert.equal(found.exe, path.join(npm, 'node.exe'));
  assert.deepEqual(found.args, [script]);
  // a shim that points outside npm's folder is ignored
  assert.equal(abacus.parseNpmShim('"%dp0%\\..\\..\\evil.js"', npm), null);
  assert.equal(abacus.findAbacus({ USERPROFILE: 'C:/nobody', PATH: '' }, fsx), null);
});

test('abacus: every provider list and model check knows it', () => {
  for (const f of ['app/ai/sessions.cjs', 'app/ai/chat-classifier.cjs', 'app/ai/ask-once.cjs', 'app/main.cjs', 'src/settings/providers.ts', 'src/renderer.ts', 'src/island/usage.ts']) {
    const s = read(f);
    assert.doesNotMatch(s, /\^\(gemini\|claude\|cursor\):/, f);
  }
  assert.equal(require('../app/ai/ask-once.cjs').backgroundModel('abacus'), 'abacus:auto');
  assert.equal(require('../app/ai/ask-once.cjs').backgroundModel('evren'), 'evren:auto');
  assert.deepEqual(require('../app/ai/providers.cjs').PROVIDERS, ['gemini', 'claude', 'cursor', 'abacus', 'evren']);
  assert.match(read('app/main.cjs'), /'gpt', 'gemini', 'claude', 'cursor', 'abacus', 'evren'/);
  assert.match(read('src/settings/abacus-card.ts'), /abacus\.ai\/help\/abacusai-desktop\/cli-installation/);
  // the same buttons, in the same order, as the other accounts (+ the setup page link)
  assert.match(read('src/settings/abacus-card.ts'), /actions\.append\(setup, login, test, docs\)/);
  assert.match(read('src/settings/plugin-guide.ts'), /'abacus-login': \[/);
  assert.equal(require('../app/plugins/oauth-setup.cjs').setupURL('abacus-login'), null);
});

// ── usage card ───────────────────────────────────────────────────────────────
test('usage card: shows every connected AI by default, or the ones the user picked', () => {
  const { cleanDash } = require('../app/core/dash-layout.cjs');
  const base = cleanDash({}, null);
  assert.equal(base.usageShow, undefined);
  assert.deepEqual(cleanDash({ usageShow: ['abacus', 'gpt'] }, base).usageShow, ['gpt', 'abacus']);
  assert.equal(cleanDash({ usageShow: null }, { ...base, usageShow: ['gpt'] }).usageShow, undefined);
  assert.deepEqual(cleanDash({ usageShow: [] }, base).usageShow, []);
  assert.throws(() => cleanDash({ usageShow: ['openai'] }, base), /Geçersiz kullanım/);
  assert.throws(() => cleanDash({ usageShow: 'gpt' }, base), /Geçersiz kullanım/);
  const dash = read('src/workspace/dashboard.ts');
  assert.match(dash, /\['abacus', 'Abacus AI', '#b9a6ff'\]/);
  assert.match(dash, /usageShow \? usageShow\.includes\(id\) : id === 'gpt' \|\| usageSigned\.has\(id\)/);
  assert.match(read('public/index.html'), /styles\/14-v080\.css/);
});

// ── updater: versions ────────────────────────────────────────────────────────
test('updater: semantic version order', () => {
  const c = updater.compareVersions;
  assert.equal(c('0.8.0-beta.1', '0.8.0-beta.1'), 0);
  assert.equal(c('v0.8.1-beta.1', '0.8.0-beta.1'), 1);
  assert.equal(c('0.8.0', '0.8.0-beta.1'), 1);
  assert.equal(c('0.8.0-beta.2', '0.8.0-beta.10'), -1);
  assert.equal(c('0.8.0-beta.1', '0.8.0-rc.1'), -1);
  assert.equal(c('0.10.0', '0.9.9'), 1);
  assert.equal(c('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(c('1.0.0-1', '1.0.0-alpha'), -1);
  assert.equal(c('0.8', '0.8.0'), null);
  assert.equal(updater.versionFromText('ProjectCharles v0.8.1-beta.2'), '0.8.1-beta.2');
  assert.equal(updater.label('0.8.0-beta.1'), 'v0.8.0 Beta');
  assert.equal(updater.label('1.0.0'), 'v1.0.0');
});

const release = (version, extra = {}) => ({
  tag_name: 'v' + version,
  name: 'ProjectCharles v' + version,
  body: '## Yenilikler\n- <b>x</b>',
  html_url: 'https://github.com/ardadgnyt/ProjectCharles/releases/tag/v' + version,
  published_at: '2026-10-20T10:00:00Z',
  draft: false,
  prerelease: false,
  assets: [
    { name: `charles-update-${version}.zip`, browser_download_url: `https://github.com/ardadgnyt/ProjectCharles/releases/download/v${version}/charles-update-${version}.zip`, size: 1234 },
    { name: `charles-update-${version}.zip.sha256`, browser_download_url: `https://github.com/ardadgnyt/ProjectCharles/releases/download/v${version}/charles-update-${version}.zip.sha256`, size: 90 },
  ],
  ...extra,
});
const json = (v, status = 200) => ({ ok: status < 300, status, url: '', json: async () => v, headers: new Map() });

test('updater: reads the latest release from the GitHub API', async () => {
  const seen = [];
  const r = await updater.check({
    current: '0.8.0-beta.1',
    fetchImpl: async (url) => {
      seen.push(url);
      return json(release('0.8.1-beta.1'));
    },
  });
  assert.deepEqual(seen, ['https://api.github.com/repos/ardadgnyt/ProjectCharles/releases/latest']);
  assert.equal(r.available, true);
  assert.equal(r.latest.version, '0.8.1-beta.1');
  assert.equal(r.latest.label, 'v0.8.1 Beta');
  assert.match(r.latest.notes, /Yenilikler/);
  assert.equal(r.latest.zip.size, 1234);
  assert.equal(r.source, 'api');
  const same = await updater.check({ current: '0.8.1-beta.1', fetchImpl: async () => json(release('0.8.1-beta.1')) });
  assert.equal(same.available, false);
  const older = await updater.check({ current: '0.9.0', fetchImpl: async () => json(release('0.8.1-beta.1')) });
  assert.equal(older.available, false);
});

test('updater: only pre-releases → the release list; API down → the GitHub page', async () => {
  const list = await updater.check({
    current: '0.8.0-beta.1',
    fetchImpl: async (url) =>
      url.endsWith('/latest') ? json({ message: 'Not Found' }, 404) : json([release('0.8.1-beta.1', { prerelease: true }), release('0.8.2-beta.1', { draft: true }), release('0.8.0-beta.1')]),
  });
  assert.equal(list.latest.version, '0.8.1-beta.1');
  assert.equal(list.available, true);
  const page = await updater.check({
    current: '0.8.0-beta.1',
    fetchImpl: async (url) => {
      if (url.startsWith('https://api.github.com')) return json({ message: 'rate limited' }, 403);
      assert.equal(url, 'https://github.com/ardadgnyt/ProjectCharles/releases/latest');
      return { ok: true, status: 200, url: 'https://github.com/ardadgnyt/ProjectCharles/releases/tag/v0.8.1-beta.1' };
    },
  });
  assert.equal(page.source, 'page');
  assert.equal(page.latest.version, '0.8.1-beta.1');
  assert.equal(page.latest.zip.url, 'https://github.com/ardadgnyt/ProjectCharles/releases/download/v0.8.1-beta.1/charles-update-0.8.1-beta.1.zip');
  assert.equal(page.latest.sha.url, page.latest.zip.url + '.sha256');
  await assert.rejects(
    updater.check({ current: '0.8.0', fetchImpl: async () => { throw Error('offline'); } }),
    /Güncelleme bilgisi alınamadı/,
  );
});

// ── updater: zip checks ──────────────────────────────────────────────────────
const pkgJson = (version, name = 'project-charles') => strToU8(JSON.stringify({ name, version }));
function rawZip(names) {
  // a minimal stored zip whose names are written as given (fflate cleans nothing on write)
  return zipSync(Object.fromEntries(names.map(([n, d]) => [n, [d, { level: 0 }]])));
}

test('updater: the update zip is checked before anything is written', () => {
  const ok = updater.readUpdateZip(rawZip([['package.json', pkgJson('0.8.1')], ['app/main.cjs', strToU8('x')], ['dist/renderer.js', strToU8('y')]]), { name: 'project-charles', expectVersion: '0.8.1' });
  assert.equal(ok.version, '0.8.1');
  assert.deepEqual(ok.top.sort(), ['app', 'dist', 'package.json']);
  // one top folder is accepted
  const nested = updater.readUpdateZip(rawZip([['charles-update-0.8.1/package.json', pkgJson('0.8.1')], ['charles-update-0.8.1/app/a.cjs', strToU8('a')]]), { name: 'project-charles' });
  assert.ok(nested.files.has('app/a.cjs'));
  const bad = [
    [[['../evil.txt', strToU8('x')], ['package.json', pkgJson('0.8.1')]], /güvenli olmayan|zip-slip/i],
    [[['/etc/x', strToU8('x')], ['package.json', pkgJson('0.8.1')]], /güvenli olmayan|mutlak/i],
    [[['C:/x.txt', strToU8('x')], ['package.json', pkgJson('0.8.1')]], /güvenli olmayan|mutlak/i],
    [[['a\\b.txt', strToU8('x')], ['package.json', pkgJson('0.8.1')]], /güvenli olmayan|ters bölü/i],
    [[['app/x.cjs', strToU8('x')]], /package\.json yok/],
    [[['package.json', pkgJson('0.8.1', 'other-app')]], /başka bir uygulamaya/],
    [[['package.json', pkgJson('0.8.2')]], /beklenenle aynı değil/],
    [[['package.json', pkgJson('0.8.1')], ['_update/x', strToU8('x')]], /korunan/],
    [[['package.json', pkgJson('0.8.1')], ['charles-install.json', strToU8('{}')]], /korunan/],
    [[['package.json', pkgJson('0.8.1')], ['A.txt', strToU8('1')], ['a.txt', strToU8('2')]], /aynı adlı/],
  ];
  for (const [entries, re] of bad)
    assert.throws(() => updater.readUpdateZip(rawZip(entries), { name: 'project-charles', expectVersion: '0.8.1' }), re, JSON.stringify(entries.map((e) => e[0])));
  assert.throws(() => updater.readUpdateZip(Buffer.from('not a zip at all, definitely'), {}), /bozuk|geçerli/);
});

test('updater: size limits stop a zip bomb before it is unpacked', () => {
  const saved = { ...updater.LIMITS };
  try {
    updater.LIMITS.unpackedBytes = 1000;
    const big = zipSync({ 'package.json': pkgJson('0.8.1'), 'app/big.bin': new Uint8Array(5000) });
    assert.throws(() => updater.readUpdateZip(big, {}), /çok büyük/);
    updater.LIMITS.unpackedBytes = saved.unpackedBytes;
    updater.LIMITS.files = 2;
    assert.throws(() => updater.readUpdateZip(zipSync({ 'package.json': pkgJson('0.8.1'), a: strToU8('1'), b: strToU8('2') }), {}), /çok fazla/);
  } finally {
    Object.assign(updater.LIMITS, saved);
  }
});

test('updater: downloads only from GitHub', async () => {
  assert.ok(updater.allowedUrl('https://github.com/ardadgnyt/ProjectCharles/releases/download/v1/a.zip'));
  assert.ok(updater.allowedUrl('https://objects.githubusercontent.com/x'));
  assert.ok(!updater.allowedUrl('http://github.com/x'));
  assert.ok(!updater.allowedUrl('https://github.com.evil.example/x'));
  assert.ok(!updater.allowedUrl('https://user:pw@github.com/x'));
  await assert.rejects(updater.download('https://example.com/a.zip', path.join(tmp(), 'a'), { fetchImpl: async () => assert.fail('no request') }), /GitHub dışından/);
  // a redirect away from GitHub is refused too
  await assert.rejects(
    updater.download('https://github.com/a.zip', path.join(tmp(), 'a'), { fetchImpl: async () => ({ ok: true, status: 200, url: 'https://evil.example/a.zip', body: null, headers: new Map() }) }),
    /GitHub dışından/,
  );
  assert.equal(updater.parseSha('ABCDEF'.padEnd(64, '0') + '  charles-update-1.zip\n'), 'abcdef'.padEnd(64, '0'));
  assert.equal(updater.parseSha('nope'), null);
});

function serve(files) {
  return async (url) => {
    const data = files[url];
    if (!data) return { ok: false, status: 404, url, body: null, headers: new Map() };
    const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    return {
      ok: true,
      status: 200,
      url,
      headers: new Map([['content-length', String(bytes.length)]]),
      body: new Blob([bytes]).stream(),
    };
  };
}

test('updater: prepare() downloads, checks SHA-256 and unpacks into _update/stage', async () => {
  const root = tmp();
  const zip = zipSync({ 'package.json': pkgJson('0.8.1'), 'app/main.cjs': strToU8('new'), 'dist/renderer.js': strToU8('r') });
  const hash = crypto.createHash('sha256').update(zip).digest('hex');
  const info = updater.releaseInfo(release('0.8.1'));
  const steps = [];
  const prep = await updater.prepare({
    root,
    latest: info,
    name: 'project-charles',
    fetchImpl: serve({ [info.zip.url]: zip, [info.sha.url]: `${hash}  charles-update-0.8.1.zip\n` }),
    onProgress: (p) => steps.push(p.phase),
  });
  assert.equal(prep.version, '0.8.1');
  assert.equal(fs.readFileSync(path.join(root, '_update', 'stage', 'app', 'main.cjs'), 'utf8'), 'new');
  assert.ok(fs.existsSync(prep.script));
  assert.ok(!fs.existsSync(path.join(root, '_update', 'charles-update.zip')), 'the zip is removed after unpacking');
  assert.deepEqual([...new Set(steps)], ['download', 'verify', 'extract']);
  assert.equal(prep.params.App, root);
  const args = updater.swapArgs(prep.script, { ...prep.params, WaitPid: 1, Exe: 'C:/x/electron.exe', AppArg: root });
  assert.deepEqual(args.slice(0, 8), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', prep.script]);
  assert.equal(args[args.indexOf('-AppArg') + 1], root);
  // a wrong hash: nothing is unpacked
  const root2 = tmp();
  await assert.rejects(
    updater.prepare({ root: root2, latest: info, name: 'project-charles', fetchImpl: serve({ [info.zip.url]: zip, [info.sha.url]: '0'.repeat(64) }) }),
    /SHA-256 uyuşmuyor/,
  );
  assert.ok(!fs.existsSync(path.join(root2, '_update', 'stage')));
  // no .sha256 in the release: refused
  await assert.rejects(updater.prepare({ root: root2, latest: { ...info, sha: null }, name: 'project-charles' }), /SHA-256 değeri yayında yok/);
});

// ── updater: the swap script (backup, roll-back) ─────────────────────────────
function powershell() {
  for (const exe of [process.env.CHARLES_PWSH, process.platform === 'win32' ? 'powershell.exe' : null, 'pwsh', path.join(os.homedir(), 'pwsh', 'pwsh')].filter(Boolean)) {
    const r = spawnSync(exe, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}
function fakeApp() {
  const dir = tmp();
  const app = path.join(dir, 'Charles');
  const w = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
    fs.writeFileSync(path.join(app, rel), text);
  };
  w('app/main.cjs', 'old main');
  w('dist/renderer.js', 'old dist');
  w('package.json', '{"version":"0.8.0"}');
  w('node_modules/electron/keep.txt', 'keep');
  w('models/voice.bin', 'model');
  w('_update/stage/app/main.cjs', 'new main');
  w('_update/stage/dist/renderer.js', 'new dist');
  w('_update/stage/package.json', '{"version":"0.8.1"}');
  const script = path.join(app, '_update', 'swap.ps1');
  fs.writeFileSync(script, '\uFEFF' + updater.SWAP_SCRIPT);
  const params = { App: app, Stage: path.join(app, '_update', 'stage'), Backup: path.join(app, '_update', 'backup'), Result: path.join(app, '_update', 'result.json'), Version: '0.8.1', Lang: 'en' };
  return { app, script, params, get: (rel) => fs.readFileSync(path.join(app, rel), 'utf8') };
}
const ps = powershell();

test('updater: swap.ps1 replaces only the app files and keeps a backup', { skip: !ps && 'PowerShell not available' }, () => {
  const f = fakeApp();
  const r = spawnSync(ps, updater.swapArgs(f.script, f.params).filter((a) => a !== '-WindowStyle' && a !== 'Hidden'), { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(f.get('app/main.cjs'), 'new main');
  assert.equal(f.get('dist/renderer.js'), 'new dist');
  assert.equal(f.get('package.json'), '{"version":"0.8.1"}');
  assert.equal(f.get('node_modules/electron/keep.txt'), 'keep');
  assert.equal(f.get('models/voice.bin'), 'model');
  assert.equal(f.get('_update/backup/app/main.cjs'), 'old main');
  assert.equal(updater.takeResult(f.app).ok, true);
  assert.equal(updater.takeResult(f.app), null, 'read once');
});

test('updater: swap.ps1 rolls everything back when a step fails', { skip: !ps && 'PowerShell not available' }, () => {
  const f = fakeApp();
  const r = spawnSync(ps, updater.swapArgs(f.script, f.params).filter((a) => a !== '-WindowStyle' && a !== 'Hidden'), {
    encoding: 'utf8',
    env: { ...process.env, CHARLES_UPDATE_TEST_FAIL: 'package.json' },
  });
  assert.equal(r.status, 1);
  assert.equal(f.get('app/main.cjs'), 'old main');
  assert.equal(f.get('dist/renderer.js'), 'old dist');
  assert.equal(f.get('package.json'), '{"version":"0.8.0"}');
  assert.equal(f.get('node_modules/electron/keep.txt'), 'keep');
  const res = updater.takeResult(f.app);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'rolled-back');
  assert.match(f.get('_update/update.log'), /previous version was restored/);
});

test('updater: swap script never names user data', () => {
  assert.doesNotMatch(updater.SWAP_SCRIPT, /APPDATA|userData|Remove-Item -LiteralPath \$App\b/);
  assert.doesNotMatch(updater.SWAP_SCRIPT, /[‘’“”]/);
  assert.match(read('.gitignore'), /^_update\/$/m);
  assert.match(read('scripts/package.py'), /'_update'/);
});

// ── release:pack ─────────────────────────────────────────────────────────────
test('release:pack makes charles-update-<version>.zip and a matching .sha256', { skip: (!fs.existsSync(path.join(ROOT, 'dist', 'renderer.js')) && 'run npm run build first') || (!require('node:fs').existsSync(require('node:path').join(__dirname, '../tools/quickshare/python/python.exe')) && 'Quick Share Windows çalışma ortamı yok (python scripts/setup-quickshare.py)') }, () => {
  const { pack } = require('../scripts/release-pack.cjs');
  const out = tmp();
  const r = pack({ outDir: out });
  const version = JSON.parse(read('package.json')).version;
  assert.equal(path.basename(r.zipPath), `charles-update-${version}.zip`);
  const bytes = fs.readFileSync(r.zipPath);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), updater.parseSha(fs.readFileSync(r.shaPath, 'utf8')));
  const z = updater.readUpdateZip(bytes, { name: 'project-charles', expectVersion: version });
  assert.ok(z.files.has('app/main.cjs') && z.files.has('dist/renderer.js') && z.files.has('public/index.html'));
  for (const n of z.files.keys()) assert.doesNotMatch(n, /^(node_modules|models|tools|_update|\.git)\/|charles-install\.json|Charles-creator\.json|\.env|GITHUB\.md$/i, n);
  assert.match(read('package.json'), /"release:pack": "node scripts\/release-pack\.cjs"/);
});

// ── installer language ───────────────────────────────────────────────────────
test('installer: asks for the language first (English by default, every Charles language)', () => {
  const buf = fs.readFileSync(path.join(ROOT, 'setup/install.ps1'));
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.notDeepEqual([...buf.subarray(3, 6)], [0xef, 0xbb, 0xbf], 'only one BOM');
  const s = buf.toString('utf8');
  assert.match(s, /\$Langs = @\('en', 'tr', 'de', 'fr', 'es', 'zh'\)/);
  assert.match(s, /Choose the setup language/);
  assert.match(s, /\(default\)/);
  assert.ok(s.indexOf('Choose the setup language') < s.indexOf('Is64BitOperatingSystem'), 'asked before anything else');
  // every text has the six languages
  const block = s.slice(s.indexOf('$S = @{'), s.indexOf('\n}', s.indexOf('$S = @{')));
  const rows = block.split(/\r?\n/).filter((l) => /^\s+\w+ = @\(/.test(l));
  assert.ok(rows.length > 40);
  for (const row of rows) {
    const n = (row.replace(/""/g, '').match(/"[^"]*"/g) || []).length;
    assert.equal(n, 6, row.slice(0, 60));
  }
  // every T 'key' exists
  const keys = new Set(rows.map((r) => r.trim().split(' ')[0]));
  for (const m of s.matchAll(/\(T '(\w+)'\)|T '(\w+)'/g)) assert.ok(keys.has(m[1] || m[2]), m[1] || m[2]);
  assert.match(s, /charles-install\.json/);
  assert.match(read('scripts/package.py'), /'charles-install\.json'/);
});

test('installer: the chosen language is applied once per install', () => {
  const { applyInstallLanguage } = require('../app/core/install-language.cjs');
  const dir = tmp();
  const prefs = { data: { language: 'tr' }, saved: 0, save() { this.saved++; } };
  assert.equal(applyInstallLanguage(dir, prefs), null);
  fs.writeFileSync(path.join(dir, 'charles-install.json'), '\uFEFF{"language":"de","stamp":"2026-10-18T15:00:00Z"}');
  assert.equal(applyInstallLanguage(dir, prefs), 'de');
  assert.equal(prefs.data.language, 'de');
  prefs.data.language = 'fr'; // changed later in Settings
  assert.equal(applyInstallLanguage(dir, prefs), null);
  assert.equal(prefs.data.language, 'fr');
  fs.writeFileSync(path.join(dir, 'charles-install.json'), '{"language":"xx","stamp":"b"}');
  assert.equal(applyInstallLanguage(dir, prefs), null);
  assert.match(read('app/main.cjs'), /applyInstallLanguage\(root, v2\)/);
});

test('installer: PowerShell can parse install.ps1', { skip: !ps && 'PowerShell not available' }, () => {
  const file = path.join(ROOT, 'setup', 'install.ps1').replace(/'/g, "''");
  const r = spawnSync(ps, ['-NoProfile', '-Command', `$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$null,[ref]$e);$e.Count`], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '0', r.stdout + r.stderr);
});
