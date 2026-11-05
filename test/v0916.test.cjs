// v0.9.16: clipboard of Electron 44, limit look, finished state, live scrolling, Quick Share start, panel, PowerPoint
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { buildSync } = require('esbuild');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const temp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v0916-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const load = (file) => {
  const code = buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, format: 'cjs', platform: 'node', write: false, tsconfigRaw: {} }).outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', code)(m, m.exports);
  return m.exports;
};

test('Electron 44: the clipboard is only touched through its asynchronous API', async () => {
  for (const file of ['app/main.cjs', 'app/system/whatsapp.cjs'])
    assert.doesNotMatch(read(file), /clipboard\.(readImage|writeImage|readBuffer|availableFormats)\(/, file);
  const { readPicture, writeRich, writePicture } = require('../app/core/clipboard.cjs');
  const bytes = Buffer.from([1, 2, 3]);
  const item = (types, get) => ({ types, getType: async (t) => get(t) });
  const picture = await readPicture({ read: async () => [item(['text/plain', 'image/png'], () => new Blob([bytes], { type: 'image/png' }))] });
  assert.deepEqual([picture.type, [...picture.bytes]], ['image/png', [1, 2, 3]]);
  assert.equal(await readPicture({ read: async () => [item(['text/plain'], () => 'x')] }), null);
  const written = [];
  class ClipboardItem { constructor(v) { this.v = v; } }
  const clip = { write: async (list) => written.push(...list) };
  await writeRich(clip, ClipboardItem, 'a', '<b>a</b>');
  await writePicture(clip, ClipboardItem, bytes);
  assert.deepEqual(Object.keys(written[0].v), ['text/plain', 'text/html']);
  assert.equal(written[1].v['image/png'].type, 'image/png');
});

test('the limit look needs verified data of the AI in use', () => {
  const { verifiedBlocked: v, limitErrorLasts: lasts } = load('src/island/quota-state.ts');
  const now = 1800000000000;
  const fresh = { updatedAt: now - 1000 };
  assert.equal(v({ ...fresh, blocked: true }, now), true);
  assert.equal(v({ ...fresh, blocked: false }, now), false);
  assert.equal(v({ ...fresh, blocked: null }, now), null);
  assert.equal(v(null, now), null);
  assert.equal(v({ ...fresh, blocked: true, stale: true }, now), null, 'a failed read proves nothing');
  assert.equal(v({ blocked: true, updatedAt: now - 3600000 }, now), null, 'old data');
  assert.equal(v({ ...fresh, blocked: true, fiveHour: { remaining: 0, resetsAt: now / 1000 - 5 } }, now), null, 'the window has reset');
  assert.equal(v({ ...fresh, blocked: true, fiveHour: { remaining: 0, resetsAt: now / 1000 + 500 } }, now), true);
  assert.equal(lasts('Usage limit reached'), 600000);
  assert.equal(lasts('Kullanım limitine ulaşıldı'), 600000);
  assert.equal(lasts('429 Too many requests'), 60000);
  for (const s of ['File not found', 'Network disconnected', 'port 14291 refused']) assert.equal(lasts(s), 0, s);
  const r = read('src/renderer.ts');
  assert.doesNotMatch(r, /quotaBlocked = true/, 'only the usage verdict sets it');
  assert.match(r, /quota\.limitError\(turnModel \|\| model\.value,/, 'an error belongs to the AI that answered');
});

test('"Tamamlandı" and an error end by their own clock, also with music and clicks', () => {
  const r = read('src/renderer.ts');
  const tick = r.slice(r.indexOf('window.setInterval(() => {\n  if (settleAt'));
  assert.ok(tick.indexOf('settleAt') < tick.indexOf('if (musicPlaying && !quotaBlocked)'), 'before the early return for music');
  assert.match(r, /const SETTLE = \{ finished: 6000, error: 20000 \}/);
});

test('a streaming answer keeps its boxes; only an upward step stops the following', () => {
  const md = read('src/chat/markdown.ts');
  assert.match(md, /morphChildren\(element, draft\)/);
  assert.doesNotMatch(md, /element\.innerHTML =/);
  const f = read('src/chat/follow.ts');
  assert.match(f, /if \(top < lastTop - 1 && gap > 1\) pinned\.set\(list, false\)/);
  assert.doesNotMatch(read('src/workspace/side-panel.ts'), /pre\.scrollTop = pre\.scrollHeight/);
});

test('Quick Share: a start that fails reports why, one child at a time; LocalSend goes on', async (t) => {
  const { EventEmitter } = require('node:events');
  const { MultiDropEngine } = require('../app/files/quickshare-multidrop.cjs');
  const { ShareService } = require('../app/files/share.cjs');
  const dir = temp(t);
  fs.mkdirSync(path.join(dir, 'python'));
  fs.writeFileSync(path.join(dir, 'python', 'python.exe'), '');
  fs.writeFileSync(path.join(dir, 'bridge.py'), '');
  const fake = (answer) => () => {
    const c = new EventEmitter();
    c.stdout = new (require('node:stream').PassThrough)();
    c.stderr = new (require('node:stream').PassThrough)();
    c.stdin = new (require('node:stream').Writable)({
      write(line, _e, cb) {
        c.stdout.write(answer(JSON.parse(line)) + '\n');
        cb();
      },
    });
    c.pid = 1;
    // Windows: what child.kill() really gives
    c.kill = () => setImmediate(() => c.emit('exit', null, 'SIGTERM'));
    return c;
  };
  const engine = new MultiDropEngine({ runtimeRoot: dir, logFile: path.join(dir, 'q.log'), spawnProcess: fake((m) => JSON.stringify({ event: 'response', id: m.id, ok: false, error: '[WinError 10013] erişim' })) });
  const errors = [];
  engine.on('transfer-error', (e) => errors.push(e.error));
  await assert.rejects(engine.start(), /bağlantı noktası/);
  assert.deepEqual(errors, [], 'the null exit of our own kill is not an event');
  assert.equal(engine.child, null);
  const log = fs.readFileSync(path.join(dir, 'q.log'), 'utf8');
  assert.match(log, /"stage":"start-failed"/);
  assert.match(log, /\\"signal\\":\\"SIGTERM\\"/);
  assert.doesNotMatch(read('app/files/quickshare-multidrop.cjs'), /kapandı \(\$\{code\}\)\./);

  const s = new ShareService({ userData: dir, quickShareEngine: engine });
  let scanned = 0;
  s.ad.start = async () => {};
  s.ad.scan = () => scanned++;
  const st = await s.start();
  assert.match(st.engineError, /bağlantı noktası/);
  assert.equal(scanned, 1, 'LocalSend still searched for devices');
  s.stop();
  assert.equal(read('tools/quickshare/bridge.py').includes('emit("booted")'), true);
  assert.match(read('tools/quickshare/vendor/multidrop/backends/quickshare/__init__.py'), /winerror", None\) == 10013/);
});

test('panel: closing does not reopen under the pointer; the island never flashes the taskbar', () => {
  const m = read('app/main.cjs');
  assert.match(m, /if \(!value\) stripAsleep = true;/);
  assert.match(m, /if \(!inside\) stripAsleep = false;/);
  assert.doesNotMatch(m, /\bwin\.flashFrame/);
  const { createAttention } = require('../app/core/attention.cjs');
  const calls = [];
  const w = { focused: false, isFocused() { return this.focused; }, flashFrame: (v) => calls.push(v) };
  let open = null;
  let time = 0;
  const a = createAttention(() => open, () => time);
  assert.equal(a.ask('x'), false, 'the island has no taskbar button');
  open = w;
  assert.equal(a.ask('x'), true);
  assert.equal(a.ask('x'), false, 'one event flashes once');
  time = 70000;
  w.focused = true;
  assert.equal(a.ask('y'), false, 'nothing while it is in front');
  a.clear();
  assert.deepEqual(calls, [true, false]);
});

test('the big picture lives inside the island shape', () => {
  assert.match(read('src/chat/image-card.ts'), /querySelector<HTMLElement>\('main\.island'\)/);
  assert.match(read('public/index.html'), /styles\/34-v0916\.css/);
  assert.match(read('public/styles/34-v0916.css'), /@container weather \(max-width: 470px\)/);
});

// a small real package: text, table, notes, picture, chart and a hidden slide
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64');
const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"';
const rels = (...list) => `<Relationships>${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://x/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const para = (t) => `<a:p><a:r><a:rPr lang="tr"/><a:t>${t}</a:t></a:r></a:p>`;
const title = (t) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/>${para(t)}</p:txBody></p:sp>`;
function sample() {
  const slide1 = `<p:sld ${NS}><p:cSld><p:spTree>${title('Giriş &amp; ğüş')}
    <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Tablo"/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="600000"/><a:ext cx="900000" cy="300000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tblGrid><a:gridCol w="450000"/><a:gridCol w="450000"/></a:tblGrid><a:tr h="150000"><a:tc><a:txBody>${para('A1')}</a:txBody></a:tc><a:tc><a:txBody>${para('B1')}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
    <p:pic><p:nvPicPr><p:cNvPr id="4" name="Foto" descr="Mavi nokta"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="1000000"/><a:ext cx="300000" cy="300000"/></a:xfrm></p:spPr></p:pic>
    <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="G"/></p:nvGraphicFramePr><p:xfrm><a:off x="400000" y="1000000"/><a:ext cx="900000" cy="600000"/></p:xfrm><a:graphic><a:graphicData><c:chart r:id="rId4"/></a:graphicData></a:graphic></p:graphicFrame>
    </p:spTree></p:cSld></p:sld>`;
  const chart = `<c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Satış</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Ocak</c:v></c:pt><c:pt idx="1"><c:v>Şubat</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>7</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const slide2 = `<p:sld ${NS} show="0"><p:cSld><p:spTree>${title('Gizli')}</p:spTree></p:cSld></p:sld>`;
  const notes = `<p:notes ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="N"/><p:cNvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${para('Not metni')}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
  const layout = `<p:sldLayout ${NS}><p:cSld><p:spTree/></p:cSld></p:sldLayout>`;
  const master = `<p:sldMaster ${NS}><p:cSld><p:spTree/></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"/><p:txStyles/></p:sldMaster>`;
  const theme = `<a:theme ${NS}><a:themeElements><a:clrScheme><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme><a:fontScheme><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
  return zipSync({
    'ppt/presentation.xml': strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(rels(['rId1', 'slide', 'slides/slide1.xml'], ['rId2', 'slide', 'slides/slide2.xml'])),
    'ppt/slides/slide1.xml': strToU8(slide1), 'ppt/slides/slide2.xml': strToU8(slide2),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(rels(['rId1', 'slideLayout', '../slideLayouts/l1.xml'], ['rId2', 'notesSlide', '../notesSlides/n1.xml'], ['rId3', 'image', '../media/i1.png'], ['rId4', 'chart', '../charts/c1.xml'])),
    'ppt/slides/_rels/slide2.xml.rels': strToU8(rels(['rId1', 'slideLayout', '../slideLayouts/l1.xml'])),
    'ppt/slideLayouts/l1.xml': strToU8(layout), 'ppt/slideLayouts/_rels/l1.xml.rels': strToU8(rels(['rId1', 'slideMaster', '../slideMasters/m1.xml'])),
    'ppt/slideMasters/m1.xml': strToU8(master), 'ppt/slideMasters/_rels/m1.xml.rels': strToU8(rels(['rId1', 'theme', '../theme/t1.xml'])),
    'ppt/theme/t1.xml': strToU8(theme), 'ppt/notesSlides/n1.xml': strToU8(notes), 'ppt/charts/c1.xml': strToU8(chart), 'ppt/media/i1.png': PNG,
  });
}

test('a .pptx is read in order: text, table, chart values, picture, notes, hidden slide', (t) => {
  const S = require('../app/files/slides.cjs');
  const file = path.join(temp(t), 'Sunum ğü.pptx');
  fs.writeFileSync(file, sample());
  const deck = S.loadDeck(file);
  assert.deepEqual([deck.width, deck.height, deck.slides.length], [960, 540, 2]);
  const text = S.deckText(deck);
  assert.match(text, /\[Slayt 1 \/ 2\] Giriş & ğüş/);
  assert.match(text, /\| A1 \| B1 \|/);
  assert.match(text, /Satış: Ocak=12, Şubat=7/);
  assert.match(text, /Mavi nokta/);
  assert.match(text, /Konuşmacı notları: Not metni/);
  assert.match(text, /\[Slayt 2 \/ 2\] \(gizli slayt\) Gizli/);
  assert.deepEqual(S.visualsOf(deck.slides[0]), { pictures: 1, charts: 1, diagrams: false, any: true });
  const html = S.deckHtml(deck);
  assert.match(html, /<svg xmlns=/);
  assert.doesNotMatch(html, /<script/);
  const docx = S.deckDocx(deck);
  const parts = require('fflate').unzipSync(new Uint8Array(docx));
  assert.ok(parts['word/media/image1.png']);
  const doc = Buffer.from(parts['word/document.xml']).toString('utf8');
  for (const w of ['<w:tbl>', 'Slayt 1: Giriş &amp; ğüş', 'Not metni', 'Satış: Ocak=12']) assert.ok(doc.includes(w), w);
});

test('unreadable presentations say why; file text never becomes an instruction', async (t) => {
  const S = require('../app/files/slides.cjs');
  const { Extras } = require('../app/core/extras.cjs');
  const dir = temp(t);
  const empty = path.join(dir, 'a.pptx'), broken = path.join(dir, 'b.pptx'), renamed = path.join(dir, 'c.ppt');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(broken, Buffer.from([0x50, 0x4b, 3, 4, 9, 9]));
  fs.writeFileSync(renamed, 'düz metin');
  assert.throws(() => S.loadDeck(empty), /boş/);
  assert.throws(() => S.loadDeck(broken), /bozuk/);
  assert.throws(() => S.loadDeck(renamed), /geçerli bir PowerPoint/);
  const good = path.join(dir, 'd.pptx');
  fs.writeFileSync(good, sample());
  const x = new Extras(path.join(dir, 'x'), null);
  const it = x.ingest(good);
  assert.equal(it.kind, 'presentation');
  const [first, ...rest] = await x.inputs([it.id], { images: false });
  assert.equal(rest.length, 0);
  assert.match(first.text, /GÖRÜLMEDİ/);
  assert.match(first.text, /dosya_icerigi/);
  x.slidePictures = async () => [path.join(dir, 's.png')];
  const withPictures = await x.inputs([it.id], { images: true });
  assert.deepEqual(withPictures.map((i) => i.type), ['text', 'localImage']);
  assert.doesNotMatch(withPictures[0].text, /GÖRÜLMEDİ/);
});

test('the converter offers only what it can make for a presentation, and leaves nothing half done', async (t) => {
  const { Converter, targetsFor, kindOf } = require('../app/files/convert.cjs');
  assert.equal(kindOf('x.PPTX'), 'presentation');
  assert.deepEqual(targetsFor('a.ppt'), ['pdf', 'docx', 'png', 'txt', 'md', 'zip']);
  const dir = temp(t);
  const file = path.join(dir, 'Sunum.pptx');
  fs.writeFileSync(file, sample());
  const plain = new Converter({ ffmpeg: () => null });
  const noEngine = await plain.add([file]);
  assert.deepEqual(noEngine.targets.map((x) => x.id), ['txt', 'md', 'zip']);
  const before = fs.readFileSync(file);
  const broken = new Converter({ ffmpeg: () => null, slides: { pdf: async (_s, _d, target) => { fs.writeFileSync(target, 'yarım'); throw Error('olmadı'); } } });
  const b = await broken.add([file]);
  const r = await broken.run(b.id, 'pdf');
  assert.equal(r.failed, 1);
  const names = fs.readdirSync(dir);
  assert.deepEqual(names, ['Sunum.pptx'], 'no half file');
  assert.ok(before.equals(fs.readFileSync(file)));
  const word = await broken.run(b.id, 'docx');
  assert.equal(word.failed, 0);
  assert.match(word.notes[0], /birebir korumaz/);
});
