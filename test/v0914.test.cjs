// v0.9.14: Araçlar (colour picker, timer, module shortcuts), the notch states, the new app-window cards.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('screen colour picker: checked colour, hex, overlay files', () => {
  const { cleanColor, hex } = require('../app/system/color-pick.cjs');
  assert.deepEqual(cleanColor({ r: 232, g: 162, b: 60 }), { r: 232, g: 162, b: 60, hex: '#E8A23C' });
  assert.equal(cleanColor({ r: 256, g: 0, b: 0 }), null);
  assert.equal(cleanColor({ r: 1.5, g: 0, b: 0 }), null);
  assert.equal(cleanColor(null), null);
  assert.equal(hex({ r: 0, g: 15, b: 255 }), '#000FFF');
  for (const f of ['public/colorpick.html', 'public/colorpick.js', 'public/colorpick.css', 'app/system/color-pick-preload.cjs']) assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
  const main = read('app/main.cjs');
  assert.match(main, /safeHandler\('color-pick'/);
  assert.match(main, /!colorPick\?\.busy &&/);
});

test('the notch shows a tool; "Bildirimleri sustur" holds the cards', () => {
  const main = read('app/main.cjs');
  assert.match(main, /safeHandler\('notch-tool'/);
  assert.match(main, /if \(!expanded && !notchMusic && !notchTool\) hidden = true;/);
  assert.match(main, /music: notchMusic \|\| !!notchTool,/);
  assert.match(main, /safeHandler\('focus-quiet'/);
  assert.match(read('app/plugins/mail-bubble.cjs'), /this\.suppressed \|\| this\.held\)/);
  const pre = read('app/preload.cjs');
  for (const k of ['colorPick:', 'notchTool:', 'focusQuiet:']) assert.ok(pre.includes(k), k);
});

test('timer: three modes, the break belongs to Odak and is asked when focus ends', () => {
  const t = read('src/island/timer.ts');
  assert.match(t, /const MODES: \[Mode, string\]\[\] = \[\s*\['focus', 'Odak'\],\s*\['countdown', 'Geri sayım'\],\s*\['stopwatch', 'Kronometre'\],\s*\];/);
  assert.match(t, /const BREAKS = \[5, 10, 15, 20, 30\];/);
  assert.match(t, /'Ne kadar mola vereceksin\?'/);
  assert.match(t, /endAt: now \+ total/);
});

test('colour maths', async () => {
  const { build } = await import('esbuild').catch(() => ({}));
  if (!build) return;
  const r = await build({ entryPoints: [path.join(__dirname, '../src/island/color-picker.ts')], bundle: true, format: 'cjs', write: false, platform: 'node', external: [] });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', 'document', r.outputFiles[0].text)(m, m.exports, require, {});
  const { parseHex, toHex, rgbToHsl, hsvToRgb, rgbToHsv, tones } = m.exports;
  assert.deepEqual(parseHex('#e8a23c'), { r: 232, g: 162, b: 60 });
  assert.deepEqual(parseHex('fff'), { r: 255, g: 255, b: 255 });
  assert.equal(parseHex('nope'), null);
  assert.deepEqual(rgbToHsl({ r: 232, g: 162, b: 60 }), { h: 36, s: 79, l: 57 });
  const c = { r: 232, g: 162, b: 60 };
  const v = rgbToHsv(c);
  assert.equal(toHex(hsvToRgb(v.h, v.s, v.v)), '#E8A23C');
  assert.equal(tones(c).length, 4);
});

test('home page: four cards, no line under Dosyalar / Araçlar, weather is degrees and city', () => {
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /acc\('files', svg\('folder'\), 'Dosyalar', ''\)/);
  assert.match(shelf, /acc\('tools', svg\('wrench'\), 'Araçlar', ''\)/);
  assert.match(shelf, /weatherAcc\.sub\.textContent = `\$\{parts\[1\]\} · \$\{parts\[0\]\}`;/);
  assert.match(shelf, /api\.modulesOpen\(m\.id\)/);
  assert.match(read('src/island/share.ts'), /hint\.dataset\.idle \?\?/);
  const css = read('public/styles/30-v0914.css');
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /#shelf\.shelf13 \.h13-acc\.low \.h13-acc-sub \{\s*color: var\(--v10-muted\);/);
  const html = read('public/index.html');
  assert.match(html, /styles\/30-v0914\.css/);
  assert.match(html, /styles\/31-v0914-cards\.css/);
});

test('app window: colour picker, timer, files and weather cards', () => {
  const { cleanDash } = require('../app/core/dash-layout.cjs');
  const v = cleanDash({ cols: [['colors', 'files'], ['timer', 'weather']] }, null);
  assert.deepEqual(v.cols, [['colors', 'files'], ['timer', 'weather']]);
  const dash = read('src/workspace/dashboard.ts');
  for (const id of ["id: 'colors'", "id: 'timer'", "id: 'files'", "id: 'weather'"]) assert.ok(dash.includes(id), id);
  assert.match(dash, /hub\.filesHost = \(sub, onClose\) =>/);
});

test('Araçlar is translated', () => {
  const i18n = read('src/settings/i18n-0914.ts');
  for (const s of ['Araçlar', 'Renk seçici', 'Zamanlayıcı', 'Odak bitti!', 'Molaya başla', 'Panoya kopyalandı']) assert.ok(i18n.includes(s), s);
  for (const lang of ['de', 'fr', 'es', 'zh']) {
    const t = read(`src/settings/lang/${lang}.ts`);
    for (const k of ['"Tools"', '"Color picker"', '"Focus done!"', '"Focus · {n}:{n} left"']) assert.ok(t.includes(k), lang + ' ' + k);
  }
});

test('home page row: voice call card, Charles in the middle, the song on the music notch', () => {
  const shelf = read('src/island/shelf.ts');
  assert.match(shelf, /el\('div', 'h13-top', askCol, hero, music\.card\)/);
  assert.match(shelf, /'Charles konuşuyor' : 'Dinliyor…'/);
  assert.doesNotMatch(shelf, /viaComposer\('voice-call'\)/);
  assert.match(shelf, /document\.addEventListener\('charles-live-level'/);
  assert.match(shelf, /notchTitle\.textContent = r\.title/);
  assert.match(read('src/voice/gemini-live.ts'), /charles: active && out > 0\.08 && out >= mine/);
  assert.match(read('src/island/timer.ts'), /tm13-durations tm13-breaks/);
});

test('screen pictures through GDI on Windows (HDR)', async () => {
  const { grabDisplay, SCRIPT } = require('../app/system/screen-grab.cjs');
  assert.match(SCRIPT(0, 0, 10, 10), /CopyFromScreen\(0, 0, 0, 0/);
  assert.match(SCRIPT(0, 0, 10, 10), /SetProcessDpiAwarenessContext/);
  assert.match(read('app/system/capture.cjs'), /await grabDisplay\(display\)/);
  assert.match(read('app/system/color-pick.cjs'), /await grabDisplay\(display\)/);
  assert.equal(typeof grabDisplay, 'function');
});

test('Araçlar: seven tools; the app window cards and the weekly summary are reused, not rebuilt', () => {
  const shelf = read('src/island/shelf.ts');
  for (const name of ['Renk seçici', 'Zamanlayıcı', 'Hatırlatıcılar', 'Takvim', 'E-postalar', 'Kullanım özeti', 'Akıllı ev']) assert.ok(shelf.includes(`'${name}']`), name);
  assert.match(shelf, /el\('button', 'h13-tt', el\('span', 'h13-tt-icon', svg\(name\)\), el\('strong', 'h13-tt-name', title\)\)/, 'icon and name only');
  assert.match(shelf, /hub\.cards\?\.\[CARD\[sub\]!\]/);
  assert.match(shelf, /weeklySummaryUI\(weeklyHost, api, notice\)/);
  assert.match(read('src/settings/shortcuts.ts'), /weeklySummaryUI\(weekly, api, notice\)/);
  const dash = read('src/workspace/dashboard.ts');
  assert.match(dash, /hub\.cards = \{\s*reminders: \{ element: reminders/);
  assert.match(dash, /editor\.set\(editor\.layout\(\)\)/, 'the app window takes its cards back');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public/styles/32-v0914-island-cards.css')));
  assert.match(read('public/index.html'), /32-v0914-island-cards\.css/);
});
