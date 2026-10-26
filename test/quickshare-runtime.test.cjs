const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { migrateQuickShareRuntime } = require('../app/files/quickshare-runtime.cjs');

test('an in-app update replaces only Quick Share and preserves other tools and user data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-qs-update-'));
  function file(name, body) { const p=path.join(root,name); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,body); }
  try {
    file('tools/cursor/node.exe','keep AI'); file('tools/whisper/model.bin','keep voice');
    file('personal.json','keep settings'); file('tools/quickshare/old.py','old');
    file('quickshare-tools/python/python.exe','new runtime'); file('quickshare-tools/bridge.py','new bridge');
    const runtime = migrateQuickShareRuntime(root);
    assert.equal(fs.readFileSync(path.join(runtime,'bridge.py'),'utf8'),'new bridge');
    assert.equal(fs.existsSync(path.join(runtime,'old.py')),false);
    assert.equal(fs.existsSync(path.join(root,'quickshare-tools')),false);
    assert.equal(fs.readFileSync(path.join(root,'tools/cursor/node.exe'),'utf8'),'keep AI');
    assert.equal(fs.readFileSync(path.join(root,'tools/whisper/model.bin'),'utf8'),'keep voice');
    assert.equal(fs.readFileSync(path.join(root,'personal.json'),'utf8'),'keep settings');
    assert.equal(migrateQuickShareRuntime(root),runtime);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('an incomplete runtime update cannot remove the working runtime', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-qs-incomplete-'));
  try {
    fs.mkdirSync(path.join(root,'tools/quickshare'),{recursive:true});
    fs.writeFileSync(path.join(root,'tools/quickshare/bridge.py'),'working');
    fs.mkdirSync(path.join(root,'quickshare-tools'));
    assert.throws(()=>migrateQuickShareRuntime(root));
    assert.equal(fs.readFileSync(path.join(root,'tools/quickshare/bridge.py'),'utf8'),'working');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
