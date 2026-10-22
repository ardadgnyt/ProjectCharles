// v0.8.6: the "download" permission is an ordinary module permission (no trusted package list).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('any module may ask for "download"; the install screen explains it', () => {
  const { parseManifest, describePermissions } = require('../app/modules/manifest.cjs');
  const m = parseManifest(JSON.stringify({ id: 'my-video-tool', name: 'Video', version: '0.1.0', author: 'Someone', description: 'x', charlesApi: 1, entry: 'index.html', permissions: ['download'] }));
  assert.deepEqual(m.permissions, ['download']);
  const text = describePermissions(m.permissions).find((p) => p.id === 'download').text;
  assert.match(text, /indirme kuyruğunu görebilir ve yönetebilir/);
  // the bridge asks only whether the calling module is on and has the permission
  const bridge = read('app/modules/download/bridge.cjs');
  assert.match(bridge, /const permitted = \(id\) => \{[^}]*m\.enabled !== false && \(m\.permissions \|\| \[\]\)\.includes\('download'\)/);
  assert.doesNotMatch(bridge, /id !== 'download'/);
  assert.match(read('modules/download/scripts/pack.mjs'), /'download', 'storage'/);
});

test('version 0.8.6 or later', () => {
  assert.match(JSON.parse(read('package.json')).version, /^0\.(8\.([6-9]|\d\d)|(9|\d\d)\.\d+)/);
  assert.match(read('CHANGELOG.md'), /## v0\.8\.6 Beta/);
});
