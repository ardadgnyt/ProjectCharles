// v0.8.5–0.8.6: Download permission and tools, Gemini folder confirmation, no credential reading,
// old host copies, attachment text limit, copying formulas, mail in a new chat, steering in the
// chat, version and translations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v085-'));
const bundle = (file) => {
  const out = require('esbuild').buildSync({ entryPoints: [path.join(ROOT, file)], bundle: true, platform: 'node', format: 'cjs', write: false });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
};


// ── Download bridge: a normal module permission (v0.8.6: no package list) ─────
test('download: any module may ask for the permission; the bridge checks only that', () => {
  const { PERMISSIONS } = require('../app/modules/manifest.cjs');
  assert.ok(PERMISSIONS.download);
  assert.doesNotMatch(PERMISSIONS.download, /resmi|official/i);
  assert.equal(require('../app/modules/host.cjs').needs('download.enqueue'), 'download');
  assert.match(read('src/settings/modules-page.ts'), /download: 'İndirme'/);
  const bridge = read('app/modules/download/bridge.cjs');
  assert.doesNotMatch(bridge, /trust|trusted\.json|packageDigest/);
  assert.match(bridge, /if \(!permitted\(id\)\) throw Error/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/modules/download/trusted.json')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/modules/download/trust.cjs')));
  assert.doesNotMatch(read('modules/download/scripts/pack.mjs'), /trusted\.json/);
  const manifest = JSON.parse(read('modules/download/manifest.json'));
  assert.deepEqual(manifest.permissions, ['download']);
});

test('download tools: tools/download, download-tools (moved), AppData and the module folder', () => {
  const { toolCandidates, findTools, migrateTools } = require('../app/modules/download/bridge.cjs');
  const base = tmp();
  const app = path.join(base, 'Charles');
  const put = (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['yt-dlp.exe', 'ffmpeg.exe']) fs.writeFileSync(path.join(dir, f), 'MZ' + f);
  };
  const userData = path.join(base, 'AppData');
  const opts = { appRoot: app, userData, config: {}, env: {} };
  assert.equal(findTools(opts), null);
  // the module's development folder next to Charles (C:\Project Charles\charles-download-module\tools)
  put(path.join(base, 'charles-download-module', 'tools'));
  assert.equal(findTools(opts), path.join(base, 'charles-download-module', 'tools'));
  put(path.join(userData, 'download-tools'));
  assert.equal(findTools(opts), path.join(userData, 'download-tools'));
  // an update delivers download-tools/ → moved into tools/download, nothing overwritten
  put(path.join(app, 'download-tools'));
  fs.writeFileSync(path.join(app, 'download-tools', 'versions.json'), '{}');
  assert.equal(migrateTools(app), true);
  assert.ok(!fs.existsSync(path.join(app, 'download-tools')));
  assert.equal(fs.readFileSync(path.join(app, 'tools', 'download', 'yt-dlp.exe'), 'utf8'), 'MZyt-dlp.exe');
  assert.equal(findTools(opts), path.join(app, 'tools', 'download'));
  assert.equal(migrateTools(app), false);
  // config and environment come first
  assert.deepEqual(toolCandidates({ ...opts, config: { toolsDir: path.join(base, 'cfg') }, env: { CHARLES_DOWNLOAD_TOOLS: path.join(base, 'env') } }).slice(0, 2), [path.join(base, 'cfg'), path.join(base, 'env')]);
  assert.ok(!toolCandidates({ ...opts, config: { toolsDir: 'relative/dir' } }).includes('relative/dir'));
});

test('download: watching the clipboard is opt-in, also for 0.8.1–0.8.4 settings', () => {
  const { DownloadEngine } = require('../app/modules/download/engine.cjs');
  const dir = tmp();
  const make = () => new DownloadEngine({ dataDir: dir, outputDir: path.join(dir, 'out'), tools: {} });
  assert.equal(make().settings.watch, false);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ watch: true, outputDir: path.join(dir, 'out') }));
  assert.equal(make().settings.watch, false, 'turned on without asking → off once');
  const e = make();
  e.setSettings({ watch: true });
  assert.equal(make().settings.watch, true, 'the user’s own choice is kept');
  assert.match(read('app/modules/download/bridge.cjs'), /const enabled = \(\) => permitted\('download'\);/);
});

// ── Gemini: folders and quota ────────────────────────────────────────────────
test('Gemini: a folder from a message needs a yes, roots and system folders never', () => {
  const { blockedWorkspace } = require('../app/core/explicit-workspace.cjs');
  const env = { USERPROFILE: 'C:\\Users\\A', APPDATA: 'C:\\Users\\A\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\A\\AppData\\Local', SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramData: 'C:\\ProgramData' };
  const o = { env, appRoot: 'C:\\Project Charles\\Charles', userData: 'C:\\Users\\A\\AppData\\Roaming\\Charles' };
  for (const d of ['C:\\', 'D:', 'C:\\Windows\\System32', 'C:\\Program Files\\App', 'C:\\ProgramData', 'C:\\Users\\A', 'C:\\Users\\A\\AppData', 'C:\\Project Charles\\Charles\\app', 'C:\\Users\\A\\AppData\\Roaming\\Charles\\modules'])
    assert.ok(blockedWorkspace(d, o), d);
  for (const d of ['C:\\Users\\A\\Desktop\\Proje', 'D:\\Kod\\site', 'C:\\Project Charles\\Demo']) assert.equal(blockedWorkspace(d, o), null, d);
  const main = read('app/main.cjs');
  assert.match(main, /Bu klasör proje olarak kullanılsın mı\?/);
  assert.match(main, /blockedWorkspace\(explicit/);
  assert.doesNotMatch(main.slice(main.indexOf('explicitWorkspace(args.prompt)'), main.indexOf('explicitWorkspace(args.prompt)') + 400), /chosenCwd = explicit;\s*mode = 'project';\s*saveFolder\(\);\s*eventToUi[^]*?\n\s*}\n\s*}\n\s*if \(!\['chat'/);
});

test('Gemini quota: no credential reading, only the CLI output', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/usage/gemini-quota.ps1')));
  const p = read('app/ai/providers.cjs');
  assert.doesNotMatch(p, /gemini-quota|CredRead|v1internal/);
  for (const f of ['app/main.cjs', 'app/usage/gemini-usage.cjs']) assert.doesNotMatch(read(f), /CredRead|cloudcode-pa|v1internal/);
});

// ── disk, attachments ────────────────────────────────────────────────────────
test('old charles-host copies are removed, the running one stays', () => {
  const { cleanOldHosts } = require('../app/core/windows-identity.cjs');
  const root = tmp();
  const dist = path.join(root, 'node_modules', 'electron', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  for (const n of ['electron.exe', 'charles-host-119bf0da6e775520e93e66dd.exe', 'charles-host-51761bd55dffe0cef675c533.exe', 'charles-host-51761bd55dffe0cef675c533.exe.42.tmp.exe', 'ffmpeg.dll'])
    fs.writeFileSync(path.join(dist, n), 'x');
  assert.equal(cleanOldHosts(root, path.join(dist, 'charles-host-51761bd55dffe0cef675c533.exe')), 2);
  assert.deepEqual(fs.readdirSync(dist).sort(), ['charles-host-51761bd55dffe0cef675c533.exe', 'electron.exe', 'ffmpeg.dll']);
  assert.match(read('app/main.cjs'), /cleanOldHosts\(root\)/);
});

test('attachments: 50 files, but at most 1 000 000 characters of text per message', async () => {
  const { Extras, MAX_ATTACHMENT_TEXT } = require('../app/core/extras.cjs');
  assert.equal(MAX_ATTACHMENT_TEXT, 1000000);
  const fake = { input: async (id) => ({ type: 'text', text: 'x'.repeat(300000), id }) };
  const ok = await Extras.prototype.inputs.call(fake, ['a', 'b', 'c']);
  assert.equal(ok.length, 3);
  await assert.rejects(Extras.prototype.inputs.call(fake, ['a', 'b', 'c', 'd']), /toplam en fazla 1\.000\.000/);
  await assert.rejects(Extras.prototype.inputs.call(fake, new Array(51).fill('a')), /En fazla 50/);
});

// ── formulas ─────────────────────────────────────────────────────────────────
test('formulas keep their LaTeX for copying (click, button, selection)', () => {
  const { mathPlugin } = bundle('src/chat/math.ts');
  const md = require('markdown-it')({ html: false }).use(mathPlugin);
  const inline = md.render('Alan $\\pi r^2$ olur.');
  assert.match(inline, /class="math-inline" data-answer-action="math" data-tex="\\pi r\^2"/);
  const block = md.render('$$\n\\frac{a}{b}\n$$');
  assert.match(block, /class="math-display" data-tex="\\frac\{a\}\{b\}" data-display="1"/);
  assert.match(block, /class="math-copy" data-answer-action="math"/);
  assert.doesNotMatch(md.render('$<img src=x onerror=alert(1)>$'), /<img/);
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /answerAction === 'math'/);
  assert.match(renderer, /feed\.addEventListener\('copy'/);
  assert.match(read('src/chat/math-copy.ts'), /'\$\$' \+ tex \+ '\$\$'/);
  assert.match(read('app/main.cjs'), /clipboard\.write\(\{ text, html \}\)/);
  assert.match(read('public/index.html'), /styles\/15-v085\.css/);
});

// ── mail, steering ───────────────────────────────────────────────────────────
test('a mail opened while Charles works goes to a new chat', () => {
  const r = read('src/renderer.ts');
  const block = r.slice(r.indexOf('api.onMailExplain('), r.indexOf('api.onMailExplain(') + 1800);
  assert.match(block, /if \(busy \|\| feed\.querySelector\('\.message'\)\)/);
  assert.match(block, /switchRoom\(await api\.sessionNew\(\)\)/);
  assert.doesNotMatch(block, /Charles şu an meşgul/);
});

test('extra instructions stay where they were sent', () => {
  const r = read('src/renderer.ts');
  assert.match(r, /function splitAfterSteer\(\)/);
  assert.match(r, /markSteer\(row\(text, 'user'\)\);\s*splitAfterSteer\(\);/);
  assert.match(r, /running: \(\) => busy && !dispatching,\s*feed,/);
  assert.match(read('src/chat/steer.ts'), /box\.className = 'steer-pending';/);
});

// ── release, version, translations ───────────────────────────────────────────
test('release: Setup ships tools/download, the update ships download-tools/', () => {
  const pack = read('scripts/release-pack.cjs');
  assert.match(pack, /files\.set\('download-tools\/' \+ f/);
  assert.doesNotMatch(pack, /licenses\\\/download\)/);
  assert.doesNotMatch(read('scripts/package.py'), /'tools\/download'/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'docs/DOWNLOAD-MODULE.md')));
  assert.doesNotMatch(read('README.md'), /DOWNLOAD-MODULE/);
});

test('version agrees everywhere', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.match(v, /^0\.\d+\.\d+-beta\.\d+$/);
  assert.equal(JSON.parse(read('package-lock.json')).version, v);
  const label = 'v' + v.replace(/-beta\.\d+$/, '') + ' Beta';
  assert.ok(read('public/index.html').includes(label));
  assert.ok(read('setup/install.ps1').includes(`$Version = '${label}'`));
  for (const m of read('setup/Create-Desktop-Shortcut.vbs').match(/v0\.\d+\.\d+ Beta/g)) assert.equal(m, label);
  assert.match(read('CHANGELOG.md'), /## v0\.8\.5 Beta/);
});

test('translations: the new texts and the 0.8.1–0.8.4 ones', () => {
  const { englishFor } = bundle('src/settings/i18n.ts');
  for (const s of ['Formül kopyalandı.', 'Ek talimat · sırada', 'Kotayı okumak için yenile', 'Güncelleyici başlatılamadı; Charles açık bırakıldı.', 'İşlem', 'En fazla 50 dosya seçin.'])
    assert.ok(englishFor(s), s);
  assert.equal(englishFor('rapor.pdf: PDF okunamadı; dosya bozuk veya parola korumalı olabilir.'), 'rapor.pdf: the PDF could not be read; it may be damaged or password-protected.');
});
