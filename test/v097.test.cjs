// v0.9.7 Beta: Quick Share "Ağ izni ver" and the model menu's arrows.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function runtime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles fw '));
  fs.mkdirSync(path.join(dir, 'python'));
  fs.writeFileSync(path.join(dir, 'python', 'python.exe'), '');
  fs.writeFileSync(path.join(dir, 'Allow-Local-Network.ps1'), '');
  return dir;
}

test('firewall allow: the script path with spaces reaches the elevated PowerShell quoted', async () => {
  const { QuickShareFirewall, allowArguments } = require('../app/files/firewall.cjs');
  const dir = runtime();
  const scripts = [];
  let allowed = false;
  const fw = new QuickShareFirewall({
    runtimeRoot: () => dir,
    platform: 'win32',
    run: async (script) => {
      scripts.push(script);
      if (/Start-Process/.test(script)) {
        allowed = true;
        return 'exit=0';
      }
      return JSON.stringify({ allow: allowed ? 2 : 0, block: 0, profile: 'Private' });
    },
  });
  assert.equal((await fw.check()).ok, false);
  const r = await fw.allow();
  assert.equal(r.ok, true, 'the banner goes away once the rules exist');
  const elevate = scripts.find((s) => /Start-Process/.test(s));
  const script = path.join(dir, 'Allow-Local-Network.ps1');
  assert.ok(elevate.includes(`-File "${script}"`), elevate);
  assert.doesNotMatch(elevate, /-ArgumentList @\(/, 'an argument array is joined unquoted by Start-Process');
  assert.throws(() => allowArguments('C:\\a"b.ps1'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('firewall allow: a failing script is reported instead of leaving the banner silent', async () => {
  const { QuickShareFirewall } = require('../app/files/firewall.cjs');
  const dir = runtime();
  const fw = new QuickShareFirewall({
    runtimeRoot: () => dir,
    platform: 'win32',
    run: async (s) => (/Start-Process/.test(s) ? 'exit=1' : '{"allow":0,"block":0,"profile":"Private"}'),
  });
  await assert.rejects(fw.allow(), /kod 1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('firewall check: only rules for the current network count; a Public network is named', async () => {
  const { QuickShareFirewall, checkScript } = require('../app/files/firewall.cjs');
  const dir = runtime();
  const pub = new QuickShareFirewall({
    runtimeRoot: () => dir,
    platform: 'win32',
    run: async () => '{"allow":2,"block":0,"profile":"Public"}',
  });
  const r = await pub.check();
  assert.equal(r.ok, false);
  assert.equal(r.publicNet, true);
  const s = checkScript('C:\\x\\python.exe');
  assert.match(s, /function Applies\(\$r\)/);
  assert.match(s, /\(Applies \$_\)/);
  assert.match(read('src/island/share.ts'), /firewall\.publicNet/);
  assert.match(read('src/island/share.ts'), /share-firewall-error/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('model menu arrows point where the panels open', () => {
  const html = read('public/index.html');
  assert.equal((html.match(/<path d="m5 10 3-3 3 3" \/>/g) || []).length, 2, 'model and effort chevrons point up');
  assert.doesNotMatch(html, /m5 6 3 3 3-3/);
  const picker = read('src/chat/model-picker.ts');
  assert.match(picker, /pointArrows\(left < box\.left \? 'left' : 'right'\)/);
  assert.match(picker, /side === 'left' \? '‹' : '›'/);
});
