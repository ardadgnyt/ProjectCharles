// v0.7.1: account tab with reset, "Set up with Charles" for every AI, Gemini Live and plugin
// connected states, new accessories, weather city picker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function loadTs(file) {
  const esbuild = require('esbuild');
  const m = { exports: {} };
  const code = esbuild.transformSync(read(file), { loader: 'ts', format: 'cjs' }).code;
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-reset-'));
const touch = (dir, name, text = '{}') => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
};

test('reset: "accounts" moves only the connections into a backup folder', () => {
  const { request, apply } = require('../app/core/reset.cjs');
  const dir = tmp();
  for (const f of ['plugins.enc.json', 'gemini-live.enc.json', 'personal.json', 'charles-history.json'])
    touch(dir, f);
  touch(dir, 'providers/claude/x.json');
  request(dir, 'accounts');
  assert.ok(fs.existsSync(path.join(dir, 'reset-request.json')));
  const r = apply(dir, 42);
  assert.equal(r.scope, 'accounts');
  assert.equal(r.backup, path.join(dir, 'reset-backup-42'));
  assert.deepEqual(r.moved.sort(), ['gemini-live.enc.json', 'plugins.enc.json', 'providers']);
  // chats and memory stay; nothing is deleted
  assert.ok(fs.existsSync(path.join(dir, 'personal.json')));
  assert.ok(fs.existsSync(path.join(dir, 'charles-history.json')));
  assert.ok(fs.existsSync(path.join(dir, 'reset-backup-42', 'providers', 'claude', 'x.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'reset-request.json')));
});

test('reset: "all" moves data and connections; without a request only the data', () => {
  const { request, apply } = require('../app/core/reset.cjs');
  const dir = tmp();
  for (const f of ['personal.json', 'personal.json.bak', 'preferences.json', 'plugins.enc.json'])
    touch(dir, f);
  touch(dir, 'chat-workspace/a.txt', 'x');
  request(dir, 'all');
  const r = apply(dir, 1);
  for (const f of ['personal.json', 'personal.json.bak', 'preferences.json', 'plugins.enc.json', 'chat-workspace'])
    assert.ok(r.moved.includes(f), f);
  // setup\Reset-Charles.cmd: no request file → data only, connections kept
  const d2 = tmp();
  touch(d2, 'personal.json');
  touch(d2, 'plugins.enc.json');
  const r2 = apply(d2, 2);
  assert.equal(r2.scope, 'data');
  assert.deepEqual(r2.moved, ['personal.json']);
  assert.ok(fs.existsSync(path.join(d2, 'plugins.enc.json')));
  assert.throws(() => request(d2, 'everything'));
  assert.equal(apply(tmp(), 3).backup, null);
});

test('reset: wired through main, preload and the new Hesap tab (with a confirmation)', () => {
  const main = read('app/main.cjs');
  assert.match(main, /safeHandler\('reset-all'/);
  assert.match(main, /Önce çalışan işleri durdur/);
  assert.match(main, /require\('\.\/core\/reset\.cjs'\)\.apply\(app\.getPath\('userData'\)\)/);
  assert.match(main, /safeHandler\('open-data-folder'/);
  const preload = read('app/preload.cjs');
  assert.match(preload, /resetAll: \(scope\) => invoke\('reset-all', scope\)/);
  assert.match(preload, /openDataFolder/);
  const tab = read('src/settings/account-tab.ts');
  assert.match(tab, /Emin misin\?/);
  assert.match(tab, /Vazgeç/);
  assert.match(tab, /resetAll\(/);
  const pages = read('src/settings/settings-pages.ts');
  assert.match(pages, /\['account', 'AI Modelleri'\]/);
  assert.match(pages, /\['profile', 'Hesap'\]/);
});

test('AI models: every AI has "Charles ile kur", one button order, safe connected state', () => {
  const { setupURL } = require('../app/plugins/oauth-setup.cjs');
  for (const id of ['gpt-login', 'claude-login', 'gemini-login', 'cursor-login']) assert.equal(setupURL(id), null, id);
  const guide = read('src/settings/plugin-guide.ts');
  for (const id of ['gpt-login', 'claude-login', 'cursor-login']) assert.match(guide, new RegExp(`'${id}': \\[`));
  assert.match(guide, /\(gpt\|claude\|gemini\|cursor\)-login/);
  const providers = read('src/settings/providers.ts');
  assert.match(providers, /guide\('gpt-login'\)/);
  assert.match(providers, /guide\(id \+ '-login'\)/);
  // classList.toggle(name, undefined) toggles instead of removing: the state is coerced
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /classList\.toggle\('connected', !!signedIn\)/);
  assert.doesNotMatch(renderer, /Ayarlar → Hesap/);
});

test('Gemini Live: connected button and a simpler panel with the key under details', () => {
  const live = read('src/voice/gemini-live.ts');
  assert.match(live, /id="live-guide"/);
  assert.match(live, /id="live-state"/);
  assert.match(live, /Gemini Live bağlı/);
  assert.match(live, /<details id="live-key-settings">/);
  assert.match(read('src/island/onboarding.ts'), /AI Modelleri/);
});

test('plugins: login buttons show the connected state and come back after removing', () => {
  const plugins = read('src/settings/plugins.ts');
  assert.match(plugins, /Google bağlı|Microsoft bağlı|bağlı'/);
  assert.match(plugins, /dataset\.label/);
  assert.match(plugins, /loginButtons/);
});

test('wardrobe: five new accessories in their slots, accepted by the personal store', () => {
  const w = loadTs('src/vendor/slime/wardrobe.ts');
  assert.equal(w.slotOf('headphones'), 'hat');
  assert.equal(w.slotOf('eyePatch'), 'eyes');
  for (const k of ['bowTie', 'catCollar', 'arrow']) assert.equal(w.slotOf(k), 'other', k);
  for (const k of ['headphones', 'eyePatch', 'bowTie', 'catCollar', 'arrow']) {
    assert.ok(w.OUTFIT_SELECTIONS.includes(k), k);
    assert.ok(w.OUTFIT_KEYS[k], k);
  }
  const island = read('src/island/wardrobe.ts');
  for (const label of ['Kulaklık', 'Korsan göz bandı', 'Papyon', 'Çanlı kedi tasması', 'Batmış ok'])
    assert.ok(island.includes(label), label);
  const { Personal } = require('../app/personal/personal.cjs');
  const p = new Personal(tmp());
  p.save = () => {};
  p.edit('accessories', { hat: 'headphones', eyes: 'eyePatch', other: 'arrow' });
  assert.deepEqual([p.data.outfit, p.data.eyewear, p.data.otherWear], ['headphones', 'eyePatch', 'arrow']);
  p.edit('accessories', { hat: 'headphones', eyes: 'none', other: 'catCollar' });
  p.edit('accessories', { hat: 'none', eyes: 'none', other: 'bowTie' });
  assert.throws(() => p.edit('accessories', { hat: 'jetpack' }));
  const outfits = read('src/vendor/slime/outfits.ts');
  for (const fn of ['headphones', 'eyePatch', 'bowTie', 'catCollar', 'arrowStuck'])
    assert.match(outfits, new RegExp(`function ${fn}\\(`), fn);
});

test('weather: city picker with live search and the current city', () => {
  const html = read('public/index.html');
  assert.match(html, /class="[^"]*city-picker/);
  assert.match(html, /id="city-query"/);
  assert.match(html, /id="city-results"/);
  assert.match(html, /styles\/8-v071\.css/);
  const companion = read('src/island/companion.ts');
  assert.match(companion, /city-row/);
  assert.match(companion, /ArrowDown/);
  assert.match(read('public/styles/8-v071.css'), /#settings-panel\[open\]/);
});

test('English: the v0.7.1 texts are translated', () => {
  const { english071 } = loadTs('src/settings/i18n-071.ts');
  for (const k of ['AI Modelleri', 'Hesap ve veriler', 'Batmış ok', 'Tüm verileri sıfırla', '✓ Gemini Live bağlı'])
    assert.ok(english071[k], k);
  assert.match(read('src/settings/i18n.ts'), /english070, english071/);
});

test('the cowboy hat was dropped before release', () => {
  assert.doesNotMatch(read('src/vendor/slime/wardrobe.ts'), /cowboyHat/);
  assert.doesNotMatch(read('src/vendor/slime/outfits.ts'), /cowboyHat/);
});
