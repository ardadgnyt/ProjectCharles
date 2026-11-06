// v0.9.22: Right + Up push to talk, attachment cards, the desktop shadow, one black theme, long chats.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const { Hub } = require('../app/system/helper-hub.cjs');
const { parseKey, keyName, DEFAULTS, Dictation } = require('../app/voice/dictation.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const hasHelper = fs.existsSync(path.join(root, 'app/system/charles-helper.exe'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v0922-'));
const dictation = (dir) =>
  new Dictation({ dir, voice: { available: () => true }, send() {}, mic: { blocked: () => false, arm: () => true, off() {} }, spawnHelper: null });
const lines = (child) => {
  const out = [];
  require('node:readline').createInterface({ input: child.stdout }).on('line', (l) => out.push(l));
  return out;
};

test('push to talk: Right + Up is the two arrow keys, with no modifier', () => {
  assert.equal(DEFAULTS.key, 'Right+Up');
  assert.deepEqual(parseKey('Right+Up'), { vk: 0x27, vk2: 0x26, ctrl: false, alt: false, shift: false, win: false });
  assert.equal(keyName('Up+Right'), 'Right+Up');
  assert.equal(keyName('Ctrl+Alt+K'), 'Ctrl+Alt+K');
  assert.equal(keyName('F9+F8'), 'F8+F9');
});

test('push to talk: a key that cannot work is refused with a reason', () => {
  assert.throws(() => parseKey('Ctrl+Right+Up'), /eklenemez/);
  assert.throws(() => parseKey('A+B'), /yalnızca ok/);
  assert.throws(() => parseKey('Right+Right'), /yalnızca ok/);
  assert.throws(() => parseKey('Right+Up+Down'), /en fazla iki/);
  assert.throws(() => parseKey('AltGraph'), /desteklenmiyor/);
  assert.throws(() => parseKey('Ğ'), /desteklenmiyor/);
  assert.throws(() => parseKey('Up+Right', { 'Sesli görüşme': 'Right+Up' }), /Sesli görüşme/);
});

test('settings file: the old default moves to Right + Up, a chosen key and on/off stay', () => {
  const save = (value) => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'dictation.json'), JSON.stringify(value));
    const d = dictation(dir);
    return { key: d.data.key, enabled: d.data.enabled, file: JSON.parse(fs.readFileSync(path.join(dir, 'dictation.json'), 'utf8')) };
  };
  const old = save({ enabled: true, key: 'Right' });
  assert.equal(old.key, 'Right+Up');
  assert.equal(old.enabled, true);
  assert.equal(old.file.key, 'Right+Up');
  assert.equal(save({ enabled: false, key: 'Right' }).enabled, false);
  assert.equal(save({ enabled: true, key: 'F8' }).key, 'F8');
  assert.equal(save({ enabled: true, key: 'Ctrl+Alt+K' }).key, 'Ctrl+Alt+K');
  // chosen after the move: Right alone stays Right
  assert.equal(save({ enabled: true, key: 'Right', keyScheme: 2 }).key, 'Right');
  const fresh = tmp();
  assert.equal(dictation(fresh).data.key, 'Right+Up');
  assert.equal(fs.existsSync(path.join(fresh, 'dictation.json')), false, 'a new install writes nothing yet');
});

test('settings file: saving keeps one key; a refused key changes nothing', () => {
  const dir = tmp();
  const d = dictation(dir);
  assert.equal(d.save({ enabled: false, key: 'Up+Right' }).key, 'Right+Up');
  assert.throws(() => d.save({ enabled: false, key: 'A' }));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dictation.json'), 'utf8')).key, 'Right+Up');
  assert.equal(d.save({ enabled: false, key: 'F8' }).key, 'F8');
  assert.equal(dictation(dir).data.key, 'F8', 'kept after a restart');
});

test('real helper: chord gestures', { skip: !hasHelper && 'needs the helper' }, async () => {
  const hub = new Hub();
  const keys = hub.open('keys');
  const k = lines(keys);
  const sim = (...ops) => {
    for (const op of ops) keys.stdin.write(JSON.stringify({ cmd: 'sim', op }) + '\n');
  };
  const run = async (...ops) => {
    k.length = 0;
    sim(...ops);
    await new Promise((r) => setTimeout(r, 250));
    return {
      events: k.filter((l) => l.startsWith('{"e"')).map((l) => JSON.parse(l).e).filter((e) => e !== 'loaded'),
      send: k.filter((l) => l.startsWith('{"send"')).map((l) => JSON.parse(l).send),
      state: JSON.parse(k.at(-1)).state,
    };
  };
  const reset = async () => run('reset', 'hold');
  sim('chord');
  // both orders, a held pair: recording until the first key lets go; nothing reaches the app
  let r = await run('a+', 'b+', 'hold', 'b-', 'a-');
  assert.deepEqual([r.events, r.send, r.state], [['hold', 'stop'], [], 'Idle']);
  r = await run('b+', 'a+', 'hold', 'a-', 'b-');
  assert.deepEqual([r.events, r.send, r.state], [['hold', 'stop'], [], 'Idle']);
  // one key alone is an ordinary key: a tap goes through whole
  r = await run('a+', 'a-');
  assert.deepEqual([r.events, r.send], [[], ['39 press release']]);
  // held on its own it goes through after a moment; the other key then joins it
  r = await run('a+', 'join', 'a-');
  assert.deepEqual([r.events, r.send], [[], ['39 press']]);
  r = await run('a+', 'join', 'b+', 'hold', 'a-', 'b-');
  assert.deepEqual([r.events, r.send], [['hold', 'stop'], ['39 press', '39 release']]);
  // key repeat is no second press
  r = await run('a+', 'b+', 'a+', 'b+', 'a+', 'hold', 'b-', 'a-');
  assert.deepEqual(r.events, ['hold', 'stop']);
  // double press: two joins, then a third ends it
  r = await run('a+', 'b+', 'a-', 'b-', 'a+', 'b+', 'b-', 'a-', 'a+', 'b+', 'b-', 'a-');
  assert.deepEqual(r.events, ['free', 'stop']);
  // the two keys one after the other are two ordinary taps, never a double press
  await reset();
  r = await run('a+', 'a-', 'b+', 'b-', 'a+', 'a-');
  assert.deepEqual([r.events, r.send], [[], ['39 press release', '38 press release', '39 press release']]);
  // with Shift, Ctrl or Alt held the keys are theirs at once
  r = await run('a!', 'b!', 'a-', 'b-');
  assert.deepEqual([r.events, r.send], [[], []]);
  assert.deepEqual(k.filter((l) => l.startsWith('{"swallow"')).map((l) => JSON.parse(l).swallow), [false, false, false, false]);
  // Esc during hands-free ends it; the keys stay quiet until they are up
  await reset();
  r = await run('a+', 'b+', 'hold', 'esc', 'reset', 'a-', 'b-');
  assert.deepEqual([r.events, r.state], [['hold', 'cancel'], 'Idle']);
  const child = hub.child;
  hub.stop();
  await new Promise((done) => child.once('exit', done));
});

test('attachment cards: the name stays readable and keeps its extension', () => {
  const code = esbuild.buildSync({ entryPoints: [path.join(root, 'src/chat/attachment-card.ts')], bundle: true, format: 'cjs', write: false, platform: 'node' }).outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'document', code)(m, m.exports, {});
  const { shortName, fileBadge } = m.exports;
  assert.equal(shortName('ardadoganyigit_osymsonuc.pdf'), 'ardadoganyigit_osymsonuc.pdf');
  assert.equal(shortName('görsel örnek.png'), 'görsel örnek.png');
  const long = shortName('çok uzun bir türkçe dosya adı ve içinde boşluklar da var deneme.docx');
  assert.ok(long.length <= 34);
  assert.ok(long.startsWith('çok uzun'));
  assert.ok(long.endsWith('.docx'));
  assert.ok(long.includes('…'));
  assert.equal(fileBadge('a.pdf'), 'PDF');
  assert.equal(fileBadge('Şubat çizelge.xlsx'), 'XLSX');
  assert.equal(fileBadge('LICENSE'), 'DOSYA');
});

test('the message box: cards are inside it, above the text, and the hint is gone', () => {
  const html = read('public/index.html');
  assert.ok(html.indexOf('id="attachments"') > html.indexOf('id="composer"'));
  assert.ok(html.indexOf('id="attachments"') < html.indexOf('id="prompt"'));
  for (const f of ['src/voice/voice.ts', 'src/settings/i18n.ts', 'src/settings/lang/de.ts'])
    assert.doesNotMatch(read(f), /Metni kontrol et|Review the text, then press Send/);
  assert.match(read('src/settings/extras.ts'), /attachmentCard\(api, file/);
});

test('the desktop shadow is the only thing taken off, and only outside the panel', () => {
  assert.match(read('src/vendor/slime/engine.ts'), /if \(this\.contactShadow\) this\.drawSlimeShadow/);
  assert.match(read('src/renderer.ts'), /bot\.contactShadow = !petIsOut\(\) && !document\.body\.classList\.contains\('desktop-pet'\)/);
});

test('settings and large panels share one black', () => {
  const css = read('public/styles/38-v0922.css');
  assert.match(read('public/index.html'), /styles\/38-v0922\.css/);
  assert.match(css, /--ch-surface/);
  assert.match(css, /body\.workspace #settings-panel\[open\],\s*\.ws-modal \{/);
  assert.doesNotMatch(css, /#121317/);
});

test('a long chat: the translator reads only what changed, and nothing in Turkish', () => {
  const i18n = read('src/settings/i18n.ts');
  assert.match(i18n, /if \(language === 'tr'\) return;/);
  assert.doesNotMatch(i18n, /for \(const r of records\) translate\(r\.target\)/);
  assert.match(i18n, /key\.length > PATTERN_MAX/);
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /const cut = tailStart\(head\);/);
});

test('this version', () => {
  const { notes } = require('../app/core/release-notes.cjs');
  const v = notes(root, '0.9.22-beta.1');
  assert.match(v.title, /^v0\.9\.22 Beta — November/);
  assert.doesNotMatch(v.body, /[ğışİ]/);
});
