const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { explicitWorkspace } = require('../app/core/explicit-workspace.cjs');
const { launchPlan } = require('../app/ai/provider-tools.cjs');
const updater = require('../app/core/updater.cjs');
const root = path.resolve(__dirname, '..');
const m = { exports: {} };
const code = require('esbuild').buildSync({ entryPoints: [path.join(root, 'src/chat/math.ts')], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
new Function('module', 'exports', 'require', code)(m, m.exports, require);
const md = require('markdown-it')({ html: false }).use(m.exports.mathPlugin);

test('markdown renders equations, lists and tables without executing HTML', () => {
  for (const src of ['$x^2$', '\\(x^2\\)', '$$\n\\frac{1}{2}\n$$', '\\[\\sum_{n=1}^{10}n\\]']) assert.match(md.render(src), /<math/);
  assert.match(md.render('**Bold**\n\n- one\n- two'), /<strong>Bold<\/strong>/);
  assert.match(md.render('| A | B |\n|---|---|\n| 1 | 2 |'), /<table>/);
  assert.doesNotMatch(md.render('<img src=x onerror=alert(1)>'), /<img/);
  assert.doesNotMatch(md.render('$\\href{javascript:alert(1)}{click}$'), /href="javascript/);
  assert.doesNotMatch(md.render('Use '+String.fromCharCode(96)+'$x$'+String.fromCharCode(96)), /<math/);
  assert.doesNotMatch(md.render('Cost $5 and $10'), /<math/);
  assert.doesNotThrow(() => md.render('$\\frac{1}{$'));
  assert.match(md.render('$x'), /\$x/);
  assert.match(md.render('$x^2$'), /<math/);
});
test('Gemini explicit Windows folders including spaces become scoped project workspaces', () => {
  const dirs = new Set(['C:\\Users\\User\\Desktop\\ProjectCharles', 'C:\\Project Charles\\Demo']);
  const io = { statSync(p) { if (!dirs.has(p)) throw Error('missing'); return { isDirectory: () => true }; }, realpathSync: p => p };
  assert.equal(explicitWorkspace('C:\\Users\\User\\Desktop\\ProjectCharles klasöründeki dosyaları incele', io), [...dirs][0]);
  assert.equal(explicitWorkspace('"C:\\Project Charles\\Demo" klasörünü incele', io), [...dirs][1]);
  assert.equal(explicitWorkspace('C:\\Project Charles\\Missing klasörünü incele', io), null);
  assert.equal(explicitWorkspace('C:\\Project Charles\\Demo sadece örnek yol', io), null);
  for (const access of ['ask', 'auto']) {
    const p = launchPlan({ provider: 'gemini', mode: 'project', access, projectDir: [...dirs][0], model: 'auto', workspace: 'unused' });
    assert.equal(p.cwd, [...dirs][0]);
    assert.deepEqual(p.cli.slice(-2), ['--add-dir', p.cwd]);
    assert.ok(p.geminiSettings.permissions.allow.includes('read_file(*)'));
    assert.equal(p.geminiSettings.permissions.allow.includes('write_file(*)'), access === 'auto');
    assert.ok(p.geminiSettings.permissions.deny.includes('command(*)'));
  }
});
test('updater worker acknowledges launch, replaces files after exit, preserves runtime', { skip: process.platform !== 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "charles 082 ' "));
  const put = (p, data) => { fs.mkdirSync(path.dirname(path.join(dir,p)), { recursive:true }); fs.writeFileSync(path.join(dir,p), data); };
  put('app/main.cjs','old'); put('node_modules/keep.txt','runtime');
  put('_update/stage/app/main.cjs','new'); put('_update/stage/package.json','{"version":"0.8.2-beta.1"}');
  put('_update/swap.ps1','\uFEFF'+updater.SWAP_SCRIPT);
  const parent = spawn(process.execPath, ['-e','setTimeout(()=>{},60000)'], { windowsHide:true, stdio:'ignore' });
  try {
    await updater.launchSwap({script:path.join(dir,'_update/swap.ps1'), params:{App:dir,Stage:path.join(dir,'_update/stage'),Backup:path.join(dir,'_update/backup'),Result:path.join(dir,'_update/result.json'),WaitPid:parent.pid,Version:'0.8.2-beta.1'}});
    assert.equal(fs.readFileSync(path.join(dir,'app/main.cjs'),'utf8'),'old');
    parent.kill();
    let result;
    for(let i=0;i<200;i++){ result=updater.takeResult(dir); if(result)break; await new Promise(r=>setTimeout(r,100)); }
    assert.equal(result?.ok,true, JSON.stringify(result));
    assert.equal(fs.readFileSync(path.join(dir,'app/main.cjs'),'utf8'),'new');
    assert.equal(fs.readFileSync(path.join(dir,'_update/backup/app/main.cjs'),'utf8'),'old');
    assert.equal(fs.readFileSync(path.join(dir,'node_modules/keep.txt'),'utf8'),'runtime');
  } finally { parent.kill(); }
});
test('updater launch failures reject instead of reporting success', { skip: process.platform !== 'win32' }, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-bad-update-'));
  fs.mkdirSync(path.join(dir,'_update'));
  await assert.rejects(updater.launchSwap({ script:path.join(dir,'_update/missing.ps1'), params:{App:dir} }), /başlatılamadı/);
});
test('release excludes the optional Download payload', () => {
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'charles-pack082-'));
  const result=require('../scripts/release-pack.cjs').pack({outDir:out});
  const pkg=updater.readUpdateZip(fs.readFileSync(result.zipPath),{name:'project-charles',expectVersion:require('../package.json').version});
  assert.ok(pkg.files.has('dist/renderer.js'));
  assert.ok(pkg.files.has('public/charles.ico'));
  for(const name of pkg.files.keys()) assert.doesNotMatch(name,/^(modules-bundled|modules\/download|tools\/download|licenses\/download)\//);
});
