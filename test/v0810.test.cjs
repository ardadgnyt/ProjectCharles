// v0.8.10: island v2 (notch → card shelf → chat), the cream bar, the converter.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0810-'));
const { bounds, surfaceBounds, NOTCH, SHELF } = require('../app/core/layout.cjs');
const cv = require('../app/files/convert.cjs');

test('island sizes: notch, shelf, chat; the surface fits all of them', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(bounds(area, { expanded: false, side: 'center', height: 620 }), { x: 770, y: 0, ...NOTCH });
  assert.deepEqual(bounds(area, { expanded: true, chat: false, side: 'center', height: 620 }), { x: (1920 - SHELF.width) / 2, y: 0, ...SHELF });
  assert.equal(bounds(area, { expanded: true, side: 'center', height: 700 }).height, 700);
  const s = surfaceBounds(area, { side: 'center', height: 700 });
  assert.equal(s.width, Math.max(SHELF.width, 620));
  assert.equal(s.height, 700);
  // a small screen clamps the shelf
  assert.equal(bounds({ x: 0, y: 0, width: 600, height: 700 }, { expanded: true, chat: false, side: 'center', height: 620 }).width, 600);
});

test('main: views, shelf closes by itself, converter handlers', () => {
  const main = read('app/main.cjs');
  assert.match(main, /safeHandler\('island-view'/);
  assert.match(main, /win\.webContents\.send\('ui-view', islandView\(\)\)/);
  assert.match(main, /!chatOpen &&\s*!panelPinned &&\s*!shelfHeld/);
  for (const h of ['convert-choose', 'convert-run', 'convert-cancel', 'convert-reveal']) assert.match(main, new RegExp(`safeHandler\\('${h}'`));
  assert.match(main, /ipcMain\.handle\('convert-drop'/);
  // paths reach the converter only from a drop (preload) or the dialog
  const preload = read('app/preload.cjs');
  assert.match(preload, /closest\('\[data-drop="convert"\]'\)/);
  assert.doesNotMatch(preload, /convertAdd/);
});

test('renderer: shelf cards, ‹ › dock the island, cream bar opens the chat, no page dots', () => {
  const shelf = read('src/island/shelf.ts');
  for (const s of ['AI kullanımı', 'Dönüştürücü', 'Çalmaya başla', 'Sola yasla', "getElementById('dock-left')?.click()"]) assert.ok(shelf.includes(s), s);
  assert.match(read('src/island/companion.ts'), /api\.islandView\(target\)/);
  const css = read('public/styles/18-v0810.css');
  assert.match(css, /#resize-handle::after \{[^}]*background: var\(--v10-cream\)/);
  assert.match(css, /backdrop-filter: blur/);
  assert.doesNotMatch(css, /shelf-dot/);
  assert.doesNotMatch(shelf, /shelf-dots|loadModules/);
  assert.match(read('public/index.html'), /styles\/18-v0810\.css/);
});

test('converter: only formats every file can become', () => {
  const ids = (files) => cv.commonTargets(files).map((t) => t.id);
  assert.deepEqual(ids(['/a/x.png']).slice(0, 3), ['jpg', 'webp', 'avif']);
  assert.ok(!ids(['/a/x.png']).includes('png'));
  assert.ok(ids(['/a/x.mov']).includes('mp3'));
  assert.deepEqual(ids(['/a/x.png', '/a/y.mp3']), ['zip']);
  assert.deepEqual(ids(['/a/x.zip']), ['extract']);
  assert.deepEqual(ids(['/a/x.srt']), ['vtt', 'zip']);
  assert.equal(cv.kindOf('/a/b.JPEG'), 'image');
});

test('converter: data, subtitles, Word, PDF and ICO writers', () => {
  const rows = cv.parseDelimited('a;b\n1;"x; y"\n', ';');
  assert.deepEqual(cv.tableToObjects(rows), [{ a: '1', b: 'x; y' }]);
  assert.deepEqual(cv.objectsToTable([{ a: 1 }, { b: 2 }]), [['a', 'b'], [1, undefined], [undefined, 2]]);
  assert.equal(cv.writeDelimited([['a', 'b,c']], ','), 'a,"b,c"\r\n');
  const vtt = cv.srtToVtt('1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n');
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:00:01\.000 --> 00:00:02\.000/);
  assert.match(cv.vttToSrt(vtt), /00:00:01,000 --> 00:00:02,000/);
  const docx = cv.docxFromBlocks(cv.blocksFromMarkdown('# Başlık\n\nMetin & <b>\n\n- bir\n- iki\n'));
  const blocks = cv.docxToBlocks(docx);
  assert.deepEqual(blocks.map((b) => [b.heading || 0, b.text]), [[1, 'Başlık'], [0, 'Metin & <b>'], [0, '• bir'], [0, '• iki']]);
  // a 1×1 JPEG
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
  assert.deepEqual(cv.jpegSize(jpg), { width: 1, height: 1, components: 1 });
  const pdf = cv.pdfFromJpegs([jpg, jpg]).toString('latin1');
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Count 2/);
  assert.match(pdf, /%%EOF\n$/);
  const ico = cv.icoFromPngs([{ size: 16, data: Buffer.from('a') }, { size: 256, data: Buffer.from('bb') }]);
  assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico[6 + 16], 0); // 256 is written as 0
});

test('converter: ZIP packing and safe extraction, results next to the original', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'merhaba');
  fs.writeFileSync(path.join(dir, 'a.zip'), 'eski');
  const c = new cv.Converter({ ffmpeg: () => null });
  let b = await c.add([path.join(dir, 'a.txt')]);
  assert.ok(b.targets.some((t) => t.id === 'docx'));
  let r = await c.run(b.id, 'zip', {}, () => {});
  assert.deepEqual(r.outputs, ['a (2).zip'], 'an existing file is never replaced');
  assert.equal(fs.readFileSync(path.join(dir, 'a.zip'), 'utf8'), 'eski');
  b = await c.add([path.join(dir, 'a (2).zip')]);
  r = await c.run(b.id, 'extract', {}, () => {});
  assert.equal(fs.readFileSync(path.join(dir, 'a (2)', 'a.txt'), 'utf8'), 'merhaba');
  // entries that try to leave the folder are skipped
  const { zipSync, strToU8 } = require('fflate');
  fs.writeFileSync(path.join(dir, 'evil.zip'), zipSync({ '../out.txt': strToU8('x'), 'ok/in.txt': strToU8('y') }));
  assert.equal(cv.unzipTo(path.join(dir, 'evil.zip'), path.join(dir, 'evil')), 1);
  assert.ok(!fs.existsSync(path.join(dir, 'out.txt')));
  b = await c.add([path.join(dir, 'a.txt')]);
  r = await c.run(b.id, 'docx', {}, () => {});
  assert.equal(r.outputs[0], 'a.docx');
  await assert.rejects(() => c.add(['relative.txt']), /Geçersiz/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('converter: FFmpeg arguments', () => {
  const a = cv.ffmpegArgs('/x/in.mov', '/x/out.mp4', 'mp4', { quality: 'small', size: 720 });
  assert.deepEqual(a.slice(0, 5), ['-hide_banner', '-nostdin', '-y', '-i', '/x/in.mov']);
  assert.ok(a.includes('libx264') && a.includes('28'));
  assert.ok(a.join(' ').includes("scale=-2:'min(720,ih)'"));
  assert.ok(cv.ffmpegArgs('/x/in.mov', '/x/o.mp3', 'mp3').includes('-vn'));
  assert.ok(cv.ffmpegArgs('/x/in.png', '/x/o.webp', 'webp').includes('libwebp'));
});

test('version 0.8.10 is in the changelog', () => {
  assert.match(read('CHANGELOG.md'), /## v0\.8\.10 Beta/);
});
