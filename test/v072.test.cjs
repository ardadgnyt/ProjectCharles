// v0.7.2 Beta: new languages, copy boxes, side panel, calendar and smart home editors, holidays,
// WhatsApp, and the fixes (model list on quota warnings, weather city, back to the island).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function bundle(file) {
  const esbuild = require('esbuild');
  const out = esbuild.buildSync({
    entryPoints: [path.join(root, file)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-072-'));

// ── languages ────────────────────────────────────────────────────────────────
test('languages: six choices, and every English UI text has a German, French, Spanish and Chinese entry', () => {
  const i18n = bundle('src/settings/i18n.ts');
  assert.deepEqual(
    i18n.LANGUAGES.map(([c]) => c),
    ['tr', 'en', 'de', 'fr', 'es', 'zh'],
  );
  const english = new Set(i18n.englishEntries().map(([, v]) => v.replace(/\s+/g, ' ').trim()));
  for (const [file, name] of [
    ['de', 'german'],
    ['fr', 'french'],
    ['es', 'spanish'],
    ['zh', 'chinese'],
  ]) {
    const table = bundle(`src/settings/lang/${file}.ts`)[name];
    const missing = [...english].filter((en) => !(en in table));
    assert.deepEqual(missing, [], file + ' is missing texts');
    for (const [k, v] of Object.entries(table)) {
      assert.ok(typeof v === 'string' && v.trim(), `${file}: empty translation for ${k}`);
      assert.equal((k.match(/\{n\}/g) || []).length, (v.match(/\{n\}/g) || []).length, `${file}: {n} in ${k}`);
    }
  }
  assert.equal(bundle('src/settings/lang/de.ts').german.Settings, 'Einstellungen');
  assert.equal(bundle('src/settings/lang/zh.ts').chinese['Add to chat'], '添加到聊天');
});

test('languages: the new v0.7.2 texts have English, the language is accepted and used for answers and voice', () => {
  const { englishFor } = bundle('src/settings/i18n.ts');
  assert.equal(englishFor('Sohbete ekle'), 'Add to chat');
  assert.equal(englishFor('Düzenlemeyi açıkla…'), 'Describe the edit…');
  assert.equal(englishFor('Visual Studio Code ile aç'), 'Open with Visual Studio Code');
  assert.equal(englishFor('Takvimi düzenle'), 'Edit calendar');
  assert.equal(englishFor('Akıllı evi düzenle'), 'Edit smart home');
  assert.equal(englishFor('7 cihaz · 3 sütun'), '7 devices · 3 columns');
  assert.equal(englishFor('1 etkinlik'), '1 event');
  assert.equal(englishFor('Resmî tatil'), 'Public holiday');
  const { sanitize } = require('../app/core/preferences.cjs');
  for (const l of ['tr', 'en', 'de', 'fr', 'es', 'zh']) assert.equal(sanitize({ language: l }).language, l);
  assert.equal(sanitize({ language: 'xx' }).language, undefined);
  const main = read('app/main.cjs');
  assert.match(main, /de: 'German', fr: 'French', es: 'Spanish', zh: 'Simplified Chinese'/);
  assert.match(read('app/voice/gemini-live.cjs'), /LANGUAGE_NAMES\[language\]/);
});

// ── fixes ────────────────────────────────────────────────────────────────────
test('weather city: one bad field no longer throws the whole preferences file away', () => {
  const { sanitize, Preferences } = require('../app/core/preferences.cjs');
  const city = { name: 'Kadıköy, İstanbul', latitude: 40.99, longitude: 29.03 };
  const v = sanitize({ city, height: 'tall', side: 'top', setup: 'yes' });
  assert.deepEqual(v.city, city);
  assert.equal(v.setup, true); // a city means the question was answered
  assert.equal(v.height, undefined);
  assert.equal(v.side, undefined);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'companion.json'), JSON.stringify({ city, usage: 'broken', language: 'de' }));
  const p = new Preferences(dir);
  assert.equal(p.data.city.name, 'Kadıköy, İstanbul');
  assert.equal(p.data.language, 'de');
  assert.match(read('src/island/companion.ts'), /!value\.preferences\.setup && !value\.preferences\.city/);
});

test('model list: a failing sign-in refresh keeps the other models; an empty answer keeps the old list', () => {
  const main = read('app/main.cjs');
  assert.match(main, /refreshAuth\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(main, /let extra = \[\];\s*try \{\s*extra = agent\.providers\.models\(\);\s*\} catch \{\}/);
  assert.match(main, /agent\.models\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(read('src/renderer.ts'), /onLowQuota/);
});

test('copy boxes: the AIs are told to put copyable text in fenced blocks; code boxes have copy and panel buttons', () => {
  const { ASK_FORMAT, COPY_FORMAT } = require('../app/core/ask-format.cjs');
  assert.ok(ASK_FORMAT.endsWith(COPY_FORMAT));
  assert.match(COPY_FORMAT, /```text/);
  const md = read('src/chat/markdown.ts');
  assert.match(md, /code-block/);
  assert.match(md, /code-copy/);
  assert.match(md, /code-panel/);
  // the panel button is only in the app window
  assert.match(read('public/styles/9-special.css'), /body:not\(\.workspace\) \.code-tools \.code-panel/);
});

test('highlighter: names languages and works on files', () => {
  const h = bundle('src/chat/highlight.ts');
  assert.equal(h.LANGUAGE_NAMES.py, 'Python');
  assert.equal(h.languageOfFile('C:/x/app.ts'), 'ts');
});

// ── side panel ───────────────────────────────────────────────────────────────
test('side panel: files are read only inside the allowed folders', () => {
  const { resolveInside, preview } = require('../app/core/file-preview.cjs');
  const a = tmp();
  const outside = tmp();
  fs.writeFileSync(path.join(a, 'ok.py'), 'print(1)\n');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
  assert.equal(preview('ok.py', [a]).text, 'print(1)\n');
  assert.throws(() => resolveInside(path.join(outside, 'secret.txt'), [a]), /dışında/);
  assert.throws(() => resolveInside('../' + path.basename(outside) + '/secret.txt', [a]), /dışında/);
  assert.throws(() => resolveInside('a\0b', [a]), /Geçersiz/);
  fs.writeFileSync(path.join(a, 'bin.dat'), Buffer.from([1, 0, 2]));
  assert.equal(preview('bin.dat', [a]).binary, true);
});

test('side panel: open menu (VS Code, GitHub Desktop, Terminal, default app, folder, save as) and selection tools', () => {
  const sp = read('src/workspace/side-panel.ts');
  for (const s of [
    'Visual Studio Code ile aç',
    'GitHub Desktop ile aç',
    'Varsayılan uygulamada aç',
    'Terminalde aç',
    'Klasörde aç',
    'Farklı kaydet…',
    'Sohbete ekle',
    'Düzenlemeyi açıkla…',
  ])
    assert.ok(sp.includes(s), s);
  assert.match(sp, /fileWriteCode/); // code tabs are written to a file before opening
  assert.ok(!/vscode/i.test(read('src/workspace/icons.ts').match(/export const ICONS[\s\S]*/)?.[0] || ''), 'no VS Code logo');
  const main = read('app/main.cjs');
  for (const how of ["'vscode'", "'github'", "'terminal'", "'saveas'"]) assert.ok(main.includes(how), how);
  assert.match(main, /vscode:\/\/file\//);
  assert.match(main, /x-github-client:\/\/openLocalRepo\//);
});

// ── calendar ─────────────────────────────────────────────────────────────────
test('holidays follow the language’s country', () => {
  const { holidays, holidaysBetween } = bundle('src/workspace/holidays.ts');
  const has = (y, l, date, name) =>
    assert.ok(
      holidays(y, l).some((h) => h.date === date && h.name.includes(name)),
      `${l} ${date} ${name}`,
    );
  has(2026, 'tr', '2026-10-29', 'Cumhuriyet Bayramı');
  has(2026, 'tr', '2026-03-20', 'Ramazan Bayramı');
  has(2026, 'en', '2026-11-26', 'Thanksgiving');
  has(2026, 'de', '2026-04-06', 'Ostermontag');
  has(2026, 'fr', '2026-07-14', 'Fête nationale');
  has(2026, 'es', '2026-10-12', 'Fiesta Nacional');
  has(2026, 'zh', '2026-02-17', '春节');
  assert.ok(!holidays(2026, 'zh').some((h) => /gün/.test(h.name)));
  const oct = holidaysBetween(new Date(2026, 9, 1), new Date(2026, 9, 31), 'tr');
  assert.ok(oct.every((h) => h.date.startsWith('2026-10')));
});

test('calendar: events can be edited and deleted in Google Calendar', () => {
  const p = read('app/plugins/plugins.cjs');
  assert.match(p, /calendarUpdate\(/);
  assert.match(p, /calendarDelete\(/);
  assert.match(p, /method: 'PATCH'/);
  assert.match(p, /method: 'DELETE'/);
  const pre = read('app/preload.cjs');
  assert.match(pre, /workspaceCalendarUpdate/);
  assert.match(pre, /workspaceCalendarDelete/);
  const cal = read('src/workspace/calendar.ts');
  for (const s of ['Takvimi düzenle', 'Ay', 'Hafta', 'Tüm gün', 'Hatırlatma']) assert.ok(cal.includes(s), s);
});

test('smart home: drag-and-drop layout editor and device picker', () => {
  const h = read('src/workspace/home.ts');
  assert.match(h, /draggable/);
  assert.match(h, /'Cihaz ekle'/);
  assert.match(h, /'Buraya bırak'/);
  assert.match(read('app/plugins/plugins.cjs'), /climate: \['turn_on', ?'turn_off'\]/);
});

test('leash label is short', () => {
  assert.match(read('src/island/wardrobe.ts'), /\['catCollar', ?'Tasma'/);
  assert.equal(bundle('src/settings/i18n.ts').englishFor('Tasma'), 'Leash');
});

// ── WhatsApp ─────────────────────────────────────────────────────────────────
test('WhatsApp: Turkish and English commands are understood, other text is not', () => {
  const { parseWhatsApp } = require('../app/system/whatsapp.cjs');
  const cases = [
    ["WhatsApp'tan Ahmet'e yarın geliyorum mesajını at", 'Ahmet', 'yarın geliyorum'],
    ["Ahmet'e whatsapp'tan 'Merhaba, nasılsın?' diye mesaj at", 'Ahmet', 'Merhaba, nasılsın?'],
    ['anneme whatsapptan akşam geç geleceğim yaz', 'Annem', 'akşam geç geleceğim'],
    ["WhatsApp'tan Ayşe'ye Toplantı 3'te mesajını gönder", 'Ayşe', "Toplantı 3'te"],
    ["Akşam yemeğe geliyorum diye Mehmet'e whatsapp'tan mesaj at", 'Mehmet', 'Akşam yemeğe geliyorum'],
    ['send See you at 5 to John on WhatsApp', 'John', 'See you at 5'],
    ["WhatsApp John saying I'm late", 'John', "I'm late"],
    ["whatsapp'tan geliyorum mesajını at", '', 'geliyorum'],
  ];
  for (const [text, to, message] of cases) assert.deepEqual(parseWhatsApp(text), { to, message }, text);
  for (const text of ['whatsapp nedir', "whatsapp'ı aç", "WhatsApp'tan Ahmet'e mesaj at", 'Ahmet’e selam söyle', ''])
    assert.equal(parseWhatsApp(text), null, text);
});

test('WhatsApp: contacts are validated and stored locally; sending only presses Enter for a saved contact', async () => {
  const { WhatsAppContacts, sendWhatsApp } = require('../app/system/whatsapp.cjs');
  const dir = tmp();
  const c = new WhatsAppContacts(dir);
  assert.throws(() => c.save({ contacts: [{ name: 'Ali', phone: '12' }] }), /telefon/);
  c.save({ contacts: [{ name: 'Annem', phone: '0090 555 111 22 33' }] });
  assert.equal(c.read().contacts[0].phone, '+905551112233');
  assert.equal(new WhatsAppContacts(dir).find('annem').name, 'Annem');

  const opened = [];
  let pressed = 0;
  const deps = {
    contacts: c,
    openExternal: async (u) => opened.push(u),
    pressEnter: async () => (++pressed, true),
  };
  const a = await sendWhatsApp({ to: 'Annem', message: 'Eve geldim' }, deps);
  assert.equal(opened[0], 'whatsapp://send?phone=905551112233&text=Eve%20geldim');
  assert.equal(pressed, 1);
  assert.match(a, /gönderildi/);
  const b = await sendWhatsApp({ to: 'Ahmet', message: 'Selam' }, deps);
  assert.equal(opened[1], 'whatsapp://send?text=Selam');
  assert.equal(pressed, 1); // unknown person: the user picks and sends
  assert.match(b, /kayıtlı numara yok/);
  c.save({ autoSend: false });
  await sendWhatsApp({ to: 'Annem', message: 'x' }, deps);
  assert.equal(pressed, 1);
  // no WhatsApp Desktop → WhatsApp Web
  const web = [];
  await sendWhatsApp(
    { to: '', message: 'hi' },
    { contacts: c, openExternal: async (u) => { if (u.startsWith('whatsapp:')) throw Error('no app'); web.push(u); } },
  );
  assert.deepEqual(web, ['https://wa.me/?text=hi']);
});

test('WhatsApp: hooked into chat and voice, with a settings card', () => {
  const main = read('app/main.cjs');
  assert.match(main, /parseWhatsApp\(args\.prompt\)/);
  assert.match(main, /wa\.parseWhatsApp\(request\) \|\|/);
  assert.match(main, /safeHandler\('whatsapp-save'/);
  assert.match(read('app/voice/gemini-live.cjs'), /name: 'whatsapp_message'/);
  assert.match(read('src/renderer.ts'), /whatsappCard\(api, notice\)/);
});

test('version: package, lock, label and installer agree (v0.7.2 or later)', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.match(v, /^0\.7\.[2-9]-beta\.\d+$/);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, v);
  assert.equal(lock.packages[''].version, v);
  const short = 'v' + v.replace(/-beta\.\d+$/, '') + ' Beta';
  assert.ok(read('public/index.html').includes(short));
  assert.ok(read('setup/install.ps1').includes(`$Version = '${short}'`));
  assert.match(read('CHANGELOG.md'), /## v0\.7\.2 Beta/);
});
