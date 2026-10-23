// v0.8.11: WhatsApp photos, Markdown release notes, a normal-sized island, text PDFs, PDF → Word.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0811-'));
const { bounds, NOTCH, NOTCH_IDLE, SHELF } = require('../app/core/layout.cjs');
const wa = require('../app/plugins/whatsapp-live.cjs');
const cv = require('../app/files/convert.cjs');
const { textPdf, systemFonts } = require('../app/files/text-pdf.cjs');

test('a normal-sized island; the idle notch is only Slime', () => {
  assert.ok(SHELF.width <= 760 && SHELF.height <= 180);
  assert.ok(NOTCH_IDLE.width < NOTCH.width);
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.equal(bounds(area, { expanded: false, side: 'center', height: 620, music: false }).width, NOTCH_IDLE.width);
  assert.equal(bounds(area, { expanded: false, side: 'center', height: 620, music: true }).width, NOTCH.width);
  assert.match(read('app/main.cjs'), /safeHandler\('notch-music'/);
  const css = read('public/styles/19-v0811.css');
  assert.match(css, /mask:/, 'the ears are cut from the island itself');
  assert.match(css, /box-shadow: none !important/, 'no black shadow under the island');
  assert.match(read('src/island/shelf.ts'), /notch-version/);
  // Charles in the exact middle of the shelf (above the cream bar): both sides 269 px
  assert.match(css, /#shelf \.card-music \{\s*flex: 0 0 269px;/);
  assert.match(css, /#shelf \.shelf-col \{\s*flex: 0 0 166px;/);
  assert.match(css, /#shelf \.card-convert \{\s*flex: 0 0 94px;/);
});

test('release notes are rendered as Markdown (no raw HTML)', () => {
  const page = read('src/settings/update-page.ts');
  assert.match(page, /renderMarkdown\(r\.notes\.trim\(\)\)/);
  assert.match(read('src/chat/markdown.ts'), /html: false/);
});

test('no Filee mention in the project', () => {
  for (const f of ['README.md', 'CHANGELOG.md', 'THIRD-PARTY-NOTICES.md', 'app/files/convert.cjs', 'src/island/converter.ts'])
    assert.doesNotMatch(read(f), /Filee/i, f);
});

test('WhatsApp photos: fetched from the gateway, kept in memory, shown in the card', async () => {
  const dir = tmp();
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
  const calls = [];
  const live = new wa.WhatsAppLive({
    dir,
    fetch: async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from(JSON.stringify({ results: { mime_type: 'image/png', data: png.toString('base64') } })) };
    },
    spawn: () => null,
    platform: 'win32',
    thumbnail: () => 'data:image/jpeg;base64,AAAA',
  });
  live.port = 1;
  live.auth = 'a:b';
  const got = [];
  live.on('message', (m) => got.push(m));
  const m = wa.parseWebhook(JSON.stringify({ event: 'message', payload: { id: 'P1', chat_id: '905551112233@s.whatsapp.net', from: '905551112233@s.whatsapp.net', image: { caption: 'Bak' } } }));
  assert.equal(m.kind, 'image');
  assert.equal(m.text, 'Bak');
  live.receive(m);
  await new Promise((r) => setTimeout(r, 30));
  assert.match(calls[0], /\/message\/P1\/download\?phone=905551112233%40s\.whatsapp\.net$/);
  assert.equal(got.at(-1).image, 'data:image/jpeg;base64,AAAA');
  assert.ok(!fs.readdirSync(dir).some((f) => /\.(png|jpe?g)$/i.test(f)), 'nothing written to disk');
  const js = read('public/bubble.js');
  assert.match(js, /wa-photo/);
  assert.match(js, /photoOk\(m\.image\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('text PDF: real text with Turkish characters, several pages', { skip: !systemFonts() && 'no TrueType font here' }, () => {
  const f = systemFonts();
  const fonts = { regular: fs.readFileSync(f.regular), bold: fs.readFileSync(f.bold) };
  const pdf = textPdf([{ heading: 1, text: 'Başlık ğüşıöç' }, ...Array.from({ length: 80 }, (_, i) => ({ text: 'Satır ' + i }))], fonts, { title: 'T' });
  const s = pdf.toString('latin1');
  assert.match(s, /^%PDF-1\.5/);
  assert.match(s, /\/Count [2-9]/);
  assert.match(s, /\/FontFile2/);
  assert.match(s, /\/ToUnicode/);
  assert.match(s, /%%EOF\n$/);
});

test('converter: TXT → PDF has text, PDF → Word is offered', async () => {
  assert.ok(cv.targetsFor('/a/b.pdf').includes('docx'));
  const blocks = cv.pdfBlocks('Başlık\nBu uzun bir satır olup cümlenin devamı bir sonraki satırda devam ediyor ve\nburada bitiyor.\nYeni satır.');
  assert.deepEqual(blocks.map((b) => b.text), ['Başlık', 'Bu uzun bir satır olup cümlenin devamı bir sonraki satırda devam ediyor ve burada bitiyor.', 'Yeni satır.']);
  if (!systemFonts()) return;
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'Merhaba Dünya\n\nİkinci paragraf');
  const c = new cv.Converter({ ffmpeg: () => null });
  const b = await c.add([path.join(dir, 'a.txt')]);
  assert.ok(b.targets.some((t) => t.id === 'pdf'));
  const r = await c.run(b.id, 'pdf', {}, () => {});
  const pdf = fs.readFileSync(path.join(dir, r.outputs[0]));
  assert.ok(pdf.length > 1000);
  assert.match(pdf.toString('latin1'), /Tj/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('converter card: no dashed frame left after a drop; a finished sheet closes with the island', () => {
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /api\.onConvertDrop\?\.\(\(\) => \{\s*depth = 0;\s*convertCard\.classList\.remove\('over'\)/);
  assert.match(shelf, /!converter\.running\(\)\)\) closeSheet\(\)/);
});

test('bubble ×: works on press, the next card is not opened by the same click', () => {
  const js = read('public/bubble.js');
  assert.match(js, /function dismissOnPress\(button, fn\)/);
  assert.match(js, /button\.addEventListener\('pointerdown'/);
  assert.match(js, /dismissOnPress\(close,/);
  assert.match(js, /dismissOnPress\(b, \(\) => \{\s*waUpdate\(\[\]\);/);
  assert.match(js, /if \(quiet\(\)\) return;\s*window\.bubble\.open\(item\.id\)/);
});

test('music card: the installed Spotify app icon, read from Windows', () => {
  assert.match(read('app/main.cjs'), /safeHandler\('spotify-icon'[\s\S]{0,1200}app\.getFileIcon\(file/);
  assert.match(read('src/island/shelf.ts'), /music\.brand\(src\)/);
});

test('the island is black again (as in v0.8.9)', () => {
  assert.match(read('public/styles/19-v0811.css'), /rgba\(8, 8, 7, 0\.95\) 0%, rgba\(3, 3, 3, 0\.96\) 45%, rgba\(0, 0, 0, 0\.97\) 100%\) !important/);
});

test('version 0.8.11', () => {
  assert.equal(JSON.parse(read('package.json')).version, '0.8.11-beta.1');
  assert.match(read('public/index.html'), /v0\.8\.11 Beta/);
  assert.match(read('setup/install.ps1'), /\$Version = 'v0\.8\.11 Beta'/);
  assert.match(read('CHANGELOG.md'), /## v0\.8\.11 Beta/);
});
