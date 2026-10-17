// v0.7.7 Beta: change review (before/after, undo), diff, work queue and "Şu an ne yapıyorum?",
// customizable home page, system cards, smart home reconnect, refresh animation, drag fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('../node_modules/esbuild');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const load = (file) => {
  const code = buildSync({ entryPoints: [path.join(root, file)], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
};

test('change review keeps before/after and undoes only an untouched file', () => {
  const { ChangeReview } = require('../app/core/change-review.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-review-'));
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'eski\n');
  const r = new ChangeReview();
  r.observe('item/started', { id: 'i1', type: 'fileChange', changes: [{ path: 'a.txt' }] }, dir);
  fs.writeFileSync(file, 'yeni\n');
  r.observe('item/completed', { id: 'i1', type: 'fileChange', status: 'completed', changes: [{ path: 'a.txt' }] }, dir);
  const [item] = r.list();
  assert.equal(item.name, 'a.txt');
  assert.equal(item.kind, 'text');
  assert.equal(item.canUndo, true);
  const got = r.get(item.id);
  assert.equal(got.before.text, 'eski\n');
  assert.equal(got.after.text, 'yeni\n');
  // changed again by the user: no undo, nothing overwritten
  fs.writeFileSync(file, 'kullanıcı\n');
  assert.throws(() => r.undo(item.id), /yeniden değişmiş/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'kullanıcı\n');
  fs.writeFileSync(file, 'yeni\n');
  r.undo(item.id);
  assert.equal(fs.readFileSync(file, 'utf8'), 'eski\n');
  assert.equal(r.list()[0].undone, true);
  // a file Charles created is removed by undo; Claude's completed event has another type
  const made = path.join(dir, 'yeni.js');
  r.observe('item/started', { id: 'i2', type: 'fileChange', changes: [{ path: made }] }, dir);
  fs.writeFileSync(made, 'x');
  r.observe('item/completed', { id: 'i2', type: 'mcpToolCall', status: 'completed' }, dir);
  const created = r.list()[0];
  assert.equal(created.created, true);
  assert.equal(created.kind, 'code');
  r.undo(created.id);
  assert.equal(fs.existsSync(made), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('change review: images, no before copy, unknown ids', () => {
  const { ChangeReview, kindOf } = require('../app/core/change-review.cjs');
  assert.equal(kindOf('x.png', null, { data: Buffer.from([0, 1]) }), 'image');
  assert.equal(kindOf('x.bin', null, { data: Buffer.from([0, 1]) }), 'binary');
  assert.equal(kindOf('x.md', null, { data: Buffer.from('a') }), 'text');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-review-'));
  fs.writeFileSync(path.join(dir, 'p.png'), Buffer.from([137, 80, 78, 71]));
  const r = new ChangeReview();
  // only the finished change is known (no "before"): shown with the diff, no undo
  r.observe('item/completed', { id: 'i3', type: 'fileChange', status: 'completed', changes: [{ path: 'p.png', diff: '' }] }, dir);
  const it = r.list()[0];
  assert.equal(it.canUndo, false);
  assert.match(r.get(it.id).after.image, /^data:image\/png;base64,/);
  assert.throws(() => r.get('yok'), /bulunamadı/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('main: change review, system cards and home page layout are wired', () => {
  const main = read('app/main.cjs');
  assert.match(main, /changeReview\.observe\(event\.data\.method/);
  for (const h of ['review-list', 'review-get', 'review-undo', 'system-usage', 'system-info', 'workspace-dash'])
    assert.match(main, new RegExp(`safeHandler\\('${h}'`));
  const pre = read('app/preload.cjs');
  for (const k of ['reviewList', 'reviewGet', 'reviewUndo', 'systemUsage', 'systemInfo', 'workspaceDash']) assert.match(pre, new RegExp(k + ':'));
});

test('home page layout is checked', () => {
  const { cleanDash } = require('../app/core/dash-layout.cjs');
  assert.deepEqual(cleanDash({ cols: [['notes', 'music'], ['sysinfo']] }, null).cols, [['notes', 'music'], ['sysinfo']]);
  // a card only once
  assert.deepEqual(cleanDash({ cols: [['notes'], ['notes', 'home']] }, null).cols, [['notes'], ['home']]);
  assert.throws(() => cleanDash({ cols: [['evil']] }, null));
  assert.throws(() => cleanDash({ cols: [['notes'], ['x']] }, null), /Bilinmeyen/);
  assert.equal(cleanDash({ notes: 'a'.repeat(30000) }, null).notes.length, 20000);
  assert.throws(() => cleanDash({ commands: [{ label: '', prompt: 'x' }] }, null));
  const v = cleanDash({ commands: [{ label: 'Özet', prompt: 'Günü özetle' }] }, { cols: [[], []] });
  assert.deepEqual(v.commands, [{ label: 'Özet', prompt: 'Günü özetle' }]);
  assert.deepEqual(v.cols, [[], []]); // an empty page stays empty
  // the new cards are not on the page at first
  const { DEFAULT } = require('../app/core/dash-layout.cjs');
  for (const id of ['commands', 'notes', 'sysusage', 'sysinfo']) assert.ok(!DEFAULT.cols.flat().includes(id));
});

test('system cards read local values', async () => {
  const sys = require('../app/core/system-info.cjs');
  const u = await sys.usage(null);
  assert.ok(u.cpu >= 0 && u.cpu <= 100);
  assert.ok(u.memory.total > u.memory.used && u.memory.used > 0);
  const i = sys.info(null, '0.7.7');
  assert.equal(i.charles, '0.7.7');
  assert.ok(i.cores > 0 && i.memory > 0);
});

test('diff: lines, paragraphs and unified diffs', () => {
  const D = load('src/workspace/diff.ts');
  const apply = (ops) => ({ a: ops.filter((o) => o.t !== '+').map((o) => o.a), b: ops.filter((o) => o.t !== '-').map((o) => o.a) });
  for (let n = 0; n < 200; n++) {
    const rnd = () => Array.from({ length: (Math.random() * 25) | 0 }, () => 'abcde'[(Math.random() * 5) | 0]);
    const a = rnd(),
      b = rnd();
    const r = apply(D.diffList(a, b));
    assert.deepEqual(r.a, a);
    assert.deepEqual(r.b, b);
  }
  const rows = D.lineRows('a\nb\nc', 'a\nX\nc\nd');
  assert.deepEqual(D.stats(rows), { add: 2, del: 1 });
  const long = Array.from({ length: 40 }, (_, i) => 'l' + i);
  const folded = D.lineRows(long.join('\n'), [...long.slice(0, 20), 'yeni', ...long.slice(20)].join('\n'));
  assert.ok(folded.some((r) => r.t === 'skip' && r.count > 10));
  const paras = D.paragraphChanges('Bir.\n\nİkinci paragraf burada.', 'Bir.\n\nİkinci paragraf şurada.\n\nYeni paragraf.');
  assert.deepEqual(paras.map((p) => p.t), ['=', 'changed', '+']);
  assert.ok(paras[1].words.some((w) => w.t === '+' && w.a === 'şurada.'));
  assert.deepEqual(D.unifiedRows('@@ -1,2 +1,2 @@\n a\n-b\n+c').map((r) => r.t), ['=', '-', '+']);
});

test('work: honest estimates, queue order with dependencies, step texts', () => {
  const W = load('src/workspace/work.ts');
  // too few or too uneven steps: no estimate
  assert.equal(W.estimate([60000], 4, 1), null);
  assert.equal(W.estimate([60000, 60000], 2, 2), null);
  assert.equal(W.estimate([10000, 120000], 5, 2), null);
  assert.equal(W.estimate([60000, 66000], 5, 2), 63000 * 3);
  const cards = [
    { id: 'a', text: 'Araştır', status: 'failed' },
    { id: 'b', text: 'Karşılaştır', status: 'waiting', after: 'a' },
    { id: 'c', text: 'Düzenle', status: 'waiting' },
  ];
  assert.equal(W.nextCard(cards).id, 'c');
  cards[0].status = 'done';
  assert.equal(W.nextCard(cards).id, 'b');
  assert.deepEqual(W.describe({ type: 'commandExecution', command: 'npm   test' }), ['Komut çalıştırıyorum', 'npm test']);
  assert.deepEqual(W.describe({ type: 'fileChange', changes: [{ path: 'C:\\p\\src\\a.ts' }] }), ['Dosya düzenliyorum', 'a.ts']);
  assert.equal(W.describe({ type: 'userMessage' }), null);
});

test('renderer: agent and request events reach the work panel', () => {
  const r = read('src/renderer.ts');
  assert.match(r, /new CustomEvent\('charles-agent'/);
  assert.match(r, /new CustomEvent\('charles-request'/);
  const w = read('src/workspace/workspace.ts');
  assert.match(w, /workUI\(/);
  assert.match(w, /reviewScreen\(/);
  assert.match(w, /'Değişiklikleri incele'/);
  assert.match(w, /'Ana sayfayı düzenle'/);
});

test('usage refresh arrow turns while loading', () => {
  const d = read('src/workspace/dashboard.ts');
  assert.match(d, /usageRefresh\.classList\.add\('spinning'\)/);
  assert.match(d, /animationiteration/);
  assert.match(read('public/styles/12-v077.css'), /\.ws-icon\.spinning svg \{\s*animation: ws-spin/);
});

test('smart home comes back without a restart', () => {
  const h = read('src/workspace/home.ts');
  assert.match(h, /function retryLater\(\)/);
  assert.match(h, /addEventListener\('online', retryNow\)/);
  const main = read('app/main.cjs');
  assert.match(main, /if \(value\.error\) delete wsCache\.home;/);
  assert.match(main, /Home Assistant yanıt vermiyor\./);
});

test('title bar drag area is refreshed and Slime takes dropped files', () => {
  const w = read('src/workspace/workspace.ts');
  assert.match(w, /function refreshDrag\(\)/);
  assert.match(read('public/styles/12-v077.css'), /\.ws-titlebar\.ws-drag-reset \{\s*-webkit-app-region: no-drag;/);
  const s = read('src/workspace/drop-slime.ts');
  assert.match(s, /new BotEngine\(\)/);
  assert.match(s, /animateMorph\(1\)/);
  assert.match(s, /\.gulp\(\)/);
  const html = read('public/index.html');
  assert.ok(html.indexOf('styles/12-v077.css') > html.indexOf('styles/11-fit.css'));
});

test('new texts have English and the other languages', () => {
  const src = read('src/settings/i18n-077.ts');
  for (const k of ['Şu an ne yapıyorum?', 'İş kuyruğu', 'Değişiklikleri incele', 'Kart ekle', 'Sistem kullanımı', 'Yön değiştir'])
    assert.ok(src.includes(`'${k}'`), k);
  for (const l of ['de', 'fr', 'es', 'zh']) {
    const t = read(`src/settings/lang/${l}.ts`);
    for (const k of ['What am I doing right now?', 'Work queue', 'Review changes', 'Add card', '{n} changes']) assert.ok(t.includes(`"${k}"`), l + ' ' + k);
  }
});
