// v0.9.15: agy's updater stays off in unattended runs, Dosya Rafı, the big view of a sent picture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { Providers } = require('../app/ai/providers.cjs');
const { FileRack, safeName } = require('../app/files/file-rack.cjs');

const temp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v0915-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('unattended agy runs switch its updater off, the chat leaves it on', async (t) => {
  const dir = temp(t);
  const log = path.join(dir, 'runs.log');
  const script = path.join(dir, 'cli.cjs');
  fs.writeFileSync(
    script,
    `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.env.AGY_CLI_DISABLE_AUTO_UPDATE??null)+'\\n');
let text='';process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>{if(text){console.log(JSON.stringify({event:'init'}));console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'ok'}}));}});`,
  );
  const p = new Providers(path.resolve(__dirname, '..'), dir);
  // agy reads only "true": "1" was tried on the real tool and still started --bg-updater
  assert.equal(p.geminiEnv({ background: true }).AGY_CLI_DISABLE_AUTO_UPDATE, 'true');
  assert.equal(p.geminiEnv().AGY_CLI_DISABLE_AUTO_UPDATE, undefined);
  assert.equal(p.geminiEnv().USERPROFILE, path.join(dir, 'providers', 'gemini'));
  p.spec = () => ({ exe: process.execPath, args: [script] });
  await p.usage(true);
  await p.probe('gemini');
  await p.refreshGeminiModels();
  const runs = () => fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(runs(), ['true', 'true', 'true']);

  p.probe = async (id) => id === 'gemini';
  await p.refreshAuth(true);
  const before = runs().length; // refreshAuth lists the models too (an unattended run as well)
  const send = async (extra) => {
    let done;
    const finished = new Promise((r) => (done = r));
    const agent = { busy: false, publish: (_t, e) => e.method === 'turn/completed' && done() };
    await p.send(agent, { model: 'gemini:auto', prompt: 'Merhaba', ...extra });
    await finished;
  };
  await send({ background: true });
  await send({});
  assert.deepEqual(runs().slice(before), ['true', null]);
});

test('runs nobody watches say so', () => {
  assert.match(read('app/ai/ask-once.cjs'), /providers\.send\(agent, \{ \.\.\.args, background: true \}\)/);
  assert.match(read('app/ai/chat-classifier.cjs'), /providers\.send\(agent, \{ \.\.\.args, background: true \}\)/);
});

test('Dosya Rafı keeps its own copies, across a restart', async (t) => {
  const dir = temp(t);
  const source = path.join(dir, 'kaynak.txt');
  fs.writeFileSync(source, 'merhaba');
  const store = path.join(dir, 'rack');
  const rack = new FileRack(store);
  const { items } = await rack.addPaths([source]);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'kaynak.txt');
  assert.equal(fs.readFileSync(source, 'utf8'), 'merhaba');
  const copy = rack.pathOf(items[0].id);
  assert.notEqual(copy, source);

  fs.rmSync(source);
  assert.equal(fs.readFileSync(copy, 'utf8'), 'merhaba');
  const again = new FileRack(store);
  assert.deepEqual(again.list().map((i) => i.id), [items[0].id]);
  assert.equal(fs.readFileSync(again.pathOf(items[0].id), 'utf8'), 'merhaba');
});

test('the same name never overwrites, whatever the case or timing', async (t) => {
  const dir = temp(t);
  const a = path.join(dir, 'a'), b = path.join(dir, 'b');
  fs.mkdirSync(a);
  fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, 'Rapor.txt'), 'bir');
  fs.writeFileSync(path.join(b, 'rapor.txt'), 'iki');
  const rack = new FileRack(path.join(dir, 'rack'));
  await Promise.all([rack.addPaths([path.join(a, 'Rapor.txt')]), rack.addPaths([path.join(b, 'rapor.txt')]), rack.addPaths([path.join(a, 'Rapor.txt')])]);
  const items = rack.list();
  assert.deepEqual(items.map((i) => i.name.toLowerCase()).sort(), ['rapor (2).txt', 'rapor (3).txt', 'rapor.txt']);
  assert.deepEqual(items.map((i) => fs.readFileSync(rack.pathOf(i.id), 'utf8')).sort(), ['bir', 'bir', 'iki']);
});

test('removing takes only the shelf copy; folders stay out', async (t) => {
  const dir = temp(t);
  const source = path.join(dir, 'asil.txt');
  fs.writeFileSync(source, 'asıl');
  const rack = new FileRack(path.join(dir, 'rack'));
  const { items, skipped } = await rack.addPaths([source, dir]);
  assert.deepEqual(skipped, [path.basename(dir)]);
  const copy = rack.pathOf(items[0].id);
  assert.deepEqual((await rack.remove(items[0].id)).items, []);
  assert.equal(fs.existsSync(copy), false);
  assert.equal(fs.readFileSync(source, 'utf8'), 'asıl');
  await assert.rejects(rack.remove(items[0].id), /rafta bulunamadı/);
  assert.throws(() => rack.pathOf('..\\..\\main.cjs'), /rafta bulunamadı/);
});

test('a pasted screenshot becomes a file; names are safe on Windows', async (t) => {
  const rack = new FileRack(path.join(temp(t), 'rack'));
  const bytes = Buffer.from([1, 2, 3]);
  await rack.addBytes('Ekran görüntüsü.png', bytes);
  const { items } = await rack.addBytes('Ekran görüntüsü.png', bytes);
  assert.deepEqual(items.map((i) => i.name).sort(), ['Ekran görüntüsü (2).png', 'Ekran görüntüsü.png']);
  assert.deepEqual(fs.readFileSync(rack.pathOf(items[0].id)), bytes);
  assert.equal(safeName('..\\..\\evil.txt'), 'evil.txt');
  assert.equal(safeName('CON.txt'), '_CON.txt');
  assert.equal(safeName('a<b?.txt.'), 'a_b_.txt');
  assert.equal(safeName(''), 'dosya');
  assert.ok(safeName('x'.repeat(400) + '.png').endsWith('.png'));
  assert.ok(safeName('x'.repeat(400) + '.png').length <= 180);
});

test('after a crash the shelf keeps finished files and drops half copies', async (t) => {
  const dir = path.join(temp(t), 'rack');
  const rack = new FileRack(dir);
  await rack.addBytes('kalan.txt', Buffer.from('a'));
  fs.writeFileSync(path.join(dir, 'files', 'yetim.txt'), 'b');
  fs.writeFileSync(path.join(dir, 'files', 'yarim.part'), 'c');
  const again = new FileRack(dir);
  assert.deepEqual(again.list().map((i) => i.name).sort(), ['kalan.txt', 'yetim.txt']);
  assert.equal(fs.existsSync(path.join(dir, 'files', 'yarim.part')), false);
});

test('a tampered list cannot point outside the shelf', (t) => {
  const dir = temp(t);
  const store = path.join(dir, 'rack');
  fs.mkdirSync(path.join(store, 'files'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'gizli.txt'), 'x');
  fs.writeFileSync(path.join(store, 'index.json'), JSON.stringify({ items: [{ id: '00000000-0000-0000-0000-000000000000', name: '..\\gizli.txt', size: 1, addedAt: 1 }] }));
  assert.deepEqual(new FileRack(store).list(), []);
});

test('the island wiring of Dosya Rafı', () => {
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /tile\('rack', 'folder', 'Dosya Rafı'/);
  assert.match(shelf, /api\.onRackDrop/);
  const pre = read('app/preload.cjs');
  assert.match(pre, /\[data-drop="rack"\]/);
  for (const k of ['rackList:', 'rackRemove:', 'rackPaste:', 'rackDrag:', 'onRackDrop:']) assert.ok(pre.includes(k), k);
  const main = read('app/main.cjs');
  assert.match(main, /path\.join\(app\.getPath\('userData'\), 'file-rack'\)/);
  assert.match(main, /startDrag\(\{ file, icon \}\)/);
  const rack = read('src/island/file-rack.ts');
  // v0.9.16: Ctrl+V works while the shelf is on screen; text boxes keep their own paste
  assert.match(rack, /if \(!onScreen\(\) \|\| typing\(e\.target\)\) return;/);
  // preventDefault on dragstart skips dragend; without this later outside drops are ignored
  assert.match(rack, /document\.dispatchEvent\(new Event\('dragend'\)\)/);
  assert.match(read('public/index.html'), /styles\/33-v0915\.css/);
  assert.equal(require('../scripts/release-pack.cjs').SKIP.test('graphify-out/graph.json'), true);
  assert.match(read('scripts/package.py'), /SKIP_DIRS = \{[^}]*'graphify-out'/);
});

test('a just-sent picture opens its original; the big view closes with the island', () => {
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /api\.attachmentImage\(file\.id\)/);
  assert.match(renderer, /if \(!value\) closeLightbox\(\);/);
  assert.match(renderer, /if \(view !== 'chat'\) closeLightbox\(\);/);
  assert.match(read('src/settings/extras.ts'), /previews: \(\) => files\.map\(\(f\) => \(\{ id: f\.id,/);
  assert.match(read('app/main.cjs'), /safeHandler\('attachment-image'/);
  const card = read('src/chat/image-card.ts');
  assert.doesNotMatch(card, /'image-lightbox-close', '×'/);
  assert.match(card, /close\.innerHTML = ICONS\.close/);
});
