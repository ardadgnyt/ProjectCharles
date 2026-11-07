// v0.9.24 Release Candidate: the island's size, Charles' name in Windows, the installer, the time beside a
// message and the welcome card.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('version: a release candidate, ordered after the betas and before the final version', () => {
  const { compareVersions, label, parseVersion } = require('../app/core/updater.cjs');
  const version = JSON.parse(read('package.json')).version;
  assert.equal(version, '0.9.24-rc.1');
  assert.ok(parseVersion(version));
  assert.equal(compareVersions('0.9.23-beta.1', version), -1);
  assert.equal(compareVersions(version, '0.9.24'), -1);
  assert.equal(compareVersions('0.9.24-beta.9', version), -1, 'beta < rc');
  assert.equal(label(version), 'v0.9.24 Release Candidate');
  assert.equal(label('0.9.23-beta.1'), 'v0.9.23 Beta');
  assert.match(read('public/index.html'), /version-label">v0\.9\.24 Release Candidate</);
  assert.match(read('scripts/build.mjs'), /tag === 'rc' \? ' Release Candidate'/);
  assert.match(read('scripts/release-pack.cjs'), /t === 'rc' \? 'Release Candidate'/);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, version);
  const { notes } = require('../app/core/release-notes.cjs');
  assert.match(notes(root, version).title, /v0\.9\.24 Release Candidate/);
});

test('island size: the whole island follows, the app window and Charles on the desktop do not', () => {
  const css = read('public/styles/37-v0920.css');
  const rule = /body\.island-small:not\(\.workspace\):not\(\.desktop-pet\):not\(\.hidden-island\):not\(\.plugin-guide-active\) main\.island \{\s*zoom: 0\.6667;/;
  assert.match(css, rule);
  assert.doesNotMatch(css, /#notch \{\s*zoom/, 'no second zoom on the closed island');
  // the saved height stays the Large one, whatever the drag did
  const companion = read('src/island/companion.ts');
  assert.match(companion, /startHeight \+ \(e\.screenY - startY\) \/ sizeFactor\(\)/);
  const { bounds, ISLAND_SMALL } = require('../app/core/layout.cjs');
  const area = { x: 0, y: 0, width: 2560, height: 1400 };
  const big = bounds(area, { expanded: true, hidden: false, chat: true, side: 'left', height: 900 });
  const small = bounds(area, { expanded: true, hidden: false, chat: true, side: 'left', height: 900, island: ISLAND_SMALL });
  assert.deepEqual([small.width, small.height, small.x], [414, 600, 0]);
  assert.deepEqual([big.width, big.height], [620, 900]);
});

test('Task Manager: the generated host carries Charles in its version resource', () => {
  const launcher = read('setup/CharlesLauncher.cs');
  for (const field of ['FileDescription', 'ProductName', 'OriginalFilename', 'CompanyName']) assert.match(launcher, new RegExp(`Text\\("${field}", "`));
  assert.match(launcher, /Text\("FileDescription", "Charles"\)/);
  assert.match(launcher, /UpdateResource\(update,new IntPtr\(16\)/);
  assert.match(launcher, /"host-v3:"/, 'a new identity, so old hosts are replaced');
  assert.match(launcher, /CHARLES_HOST/);
  const main = read('app/main.cjs');
  assert.match(main, /startedAs\.startsWith\('charles-host-'\) && process\.env\.CHARLES_HOST !== '3'/);
  assert.ok(main.indexOf('startedAs') < main.indexOf("require('./core/system-ca.cjs')"), 'before any window or lock');
});

test('the time beside a message is one line, and only there', () => {
  const css = read('public/styles/40-v0924.css');
  assert.match(css, /body\.workspace #feed \.message\.user\[data-ws-meta\]::after \{[^}]*width: max-content;[^}]*white-space: nowrap;/);
  assert.match(read('public/index.html'), /styles\/40-v0924\.css/);
});

test('welcome card: the island makes room for it and stays open', () => {
  const tour = read('src/island/onboarding.ts');
  assert.match(tour, /shelfHold\?\.\(true\)/);
  assert.match(tour, /shelfHold\?\.\(false\)/);
  assert.match(tour, /tourHeight/);
  assert.match(read('src/island/shelf.ts'), /body\.dataset\.tourHeight/);
  assert.match(read('public/styles/40-v0924.css'), /\.tour \{\s*overflow-y: auto;/);
});

test('installer: no administrator rights, the license must be accepted, data needs its own choice', () => {
  const cs = read('setup/CharlesSetup.cs');
  assert.match(read('setup/CharlesSetup.manifest'), /level="asInvoker"/);
  assert.doesNotMatch(cs, /accept\.Checked = true/);
  assert.match(cs, /Enable\(Primary, accept\.Checked\)/);
  assert.match(cs, /data\.Checked = false/);
  assert.match(cs, /removeData && MessageBox\.Show/);
  assert.match(cs, /Registry\.CurrentUser/);
  assert.doesNotMatch(cs, /Registry\.LocalMachine|runas|Set-MpPreference|Unblock-File|netsh/);
  assert.match(cs, /File\.Exists\(Path\.Combine\(DataFolder, "companion\.json"\)\)/, 'a language somebody chose is left alone');
  // both languages for every text
  const texts = cs.match(/\{"[a-zA-Z0-9]+", new\[\] \{/g) || [];
  assert.ok(texts.length > 50);
  assert.equal(texts.length, (cs.match(/\{"[a-zA-Z0-9]+", new\[\] \{"[^\n]*", "[^\n]*"\}\},/g) || []).length);
  const pack = read('scripts/setup-pack.py');
  assert.match(pack, /CharlesSetup\.exe/);
  assert.match(pack, /CHARLES1/);
  assert.match(read('scripts/build-setup.ps1'), /LICENSE-ASSETS\.md/);
  assert.match(read('scripts/build-setup.ps1'), /THIRD-PARTY-NOTICES\.md/);
});

test('dictation: a recording cancelled while it is being read is never typed, and the microphone goes', async () => {
  const os = require('node:os');
  const { Dictation } = require('../app/voice/dictation.cjs');
  let finish, micOff = 0, typed = 0;
  const d = new Dictation({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0924-')),
    voice: { available: () => true, stop() {}, transcribe: () => new Promise((r) => (finish = r)) },
    send() {},
    mic: { blocked: () => false, arm: () => true, off: () => micOff++ },
  });
  d.child = { stdin: { write() {} } };
  d.indicator = () => {};
  d.ask = async (v) => {
    if (v.cmd === 'type') typed++;
    return v.cmd === 'target' ? { window: 1, pid: 1 } : { typed: true };
  };
  await d.begun('hold');
  assert.equal(d.phase, 'recording');
  d.finish();
  const ticket = d.ticket;
  const job = d.audio(ticket, Buffer.alloc(8));
  d.cancel();
  assert.equal(d.phase, 'idle');
  finish('gizli metin');
  assert.equal(await job, false);
  assert.equal(typed, 0, 'nothing reaches the target');
  assert.equal(d.result, '', 'and nothing is kept to paste');
  assert.ok(micOff >= 1);
});

test('dictation: a window change after recording asks instead of typing', async () => {
  const os = require('node:os');
  const { Dictation } = require('../app/voice/dictation.cjs');
  const shown = [];
  let typed = 0, n = 0;
  const d = new Dictation({
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'charles-0924-')),
    voice: { available: () => true, stop() {}, transcribe: async () => 'metin' },
    send() {},
    mic: { blocked: () => false, arm: () => true, off() {} },
  });
  d.child = { stdin: { write() {} } };
  d.indicator = (v) => shown.push(v.state);
  d.ask = async (v) => {
    if (v.cmd === 'type') typed++;
    return v.cmd === 'target' ? { window: ++n, pid: n, focus: n } : { typed: true };
  };
  await d.begun('hold');
  d.finish();
  await d.audio(d.ticket, Buffer.alloc(8));
  assert.equal(typed, 0);
  assert.ok(shown.includes('choice'));
});

test('markdown keeps raw HTML and odd links out', () => {
  const src = read('src/chat/markdown.ts');
  assert.match(src, /new MarkdownIt\(\{ html: false/);
  assert.match(src, /\['https:', 'http:'\]\.includes\(u\.protocol\)/);
  assert.match(src, /renderer\.rules\.image/);
});

// ── extra instruction with files, no size limit ─────────────────────────────
function extrasIn() {
  const { Extras } = require('../app/core/extras.cjs');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'charles-0924-'));
  const extras = Object.create(Extras.prototype);
  extras.directory = dir;
  extras.attachments = new Map();
  const file = (name, data) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, data);
    return p;
  };
  return { extras, file, dir };
}
test('a file has no size limit: 30 MB is taken, the big copy is asynchronous', async () => {
  const { extras, file } = extrasIn();
  const big = file('big.png', Buffer.alloc(30 * 1024 * 1024, 1));
  const a = extras.ingest(big);
  assert.equal(a.size, 30 * 1024 * 1024);
  const b = await extras.ingestFile(big);
  assert.equal(fs.statSync(extras.attachments.get(b.id).path).size, 30 * 1024 * 1024);
  await assert.rejects(extras.ingestFile(file('a.exe', 'x')));
  const main = read('app/main.cjs');
  assert.doesNotMatch(main, /en fazla 20 MB/);
  assert.match(main, /r\.filePaths\.length > 1000/);
  assert.match(main, /paths\.length > 1000/);
  assert.doesNotMatch(read('src/settings/extras.ts'), /20 \* 1024 \* 1024/);
});
test('a long text no longer stops the message: what fits goes, the rest is said', async () => {
  const { extras, file } = extrasIn();
  const a = extras.ingest(file('long.log', 'ab'.repeat(1500000)));
  const small = extras.ingest(file('small.txt', 'kısa metin'));
  const out = await extras.inputs([a.id, small.id]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.cut, ['long.log', 'small.txt']);
  assert.match(out[0].text, /yalnızca ilk \d+ karakteri/);
  assert.match(out[0].text, /<\/dosya_icerigi[^>]*>/);
  assert.ok(out[0].text.length <= 1000000);
  assert.match(out[1].text, /sığmadı/);
  for (const item of out) assert.equal(item.cut, undefined);
  const whole = await extras.inputs([small.id]);
  assert.equal(whole.cut, undefined);
  assert.match(whole[0].text, /kısa metin/);
});
test('text of one very long file is never read whole', async () => {
  const { extras, file } = extrasIn();
  const a = extras.ingest(file('log.txt', 'x'.repeat(5000000)));
  const reading = fs.readFileSync;
  fs.readFileSync = (...args) => {
    if (String(args[0]).includes(a.id)) throw Error('read whole');
    return reading(...args);
  };
  try {
    const [item] = await extras.inputs([a.id]);
    assert.match(item.text, /yalnızca ilk/);
  } finally {
    fs.readFileSync = reading;
  }
});
test('an extra instruction takes files: Codex gets them in turn/steer', async () => {
  assert.match(read('app/ai/agent.cjs'), /\[\{ type: 'text', text, text_elements: \[\] \}, \.\.\.attachments\]/);
  const sessions = read('app/ai/sessions.cjs');
  assert.match(sessions, /r\.agent\.steer\(text\.trim\(\), attachments\)/);
  assert.match(sessions, /steer: true, \.\.\.\(shownAttachments\.length/);
  const main = read('app/main.cjs');
  const handler = main.slice(main.indexOf("safeHandler('steer'"), main.indexOf("safeHandler('steer'") + 700);
  assert.match(handler, /extras\.untrusted\(attachments\)/);
  assert.match(handler, /every\(\(id\) => typeof id === 'string'\)/);
  assert.ok(handler.indexOf('extras.untrusted') < handler.indexOf('extras.inputs'));
});
test('the queue of extra instructions keeps files and gives them back', async () => {
  const esbuild = require('esbuild');
  const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/chat/steer.ts')], bundle: true, format: 'cjs', platform: 'node', write: false });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  const made = [];
  const el = () => {
    const e = { hidden: false, children: [], classList: { add() {}, remove() {} }, append: (...k) => e.children.push(...k), replaceChildren: (...k) => (e.children = k), addEventListener() {}, dispatchEvent() {}, focus() {}, insertBefore() {}, setAttribute() {} };
    made.push(e);
    return e;
  };
  global.document = { createElement: el };
  global.Event = class {};
  const sent = [];
  const shown = [];
  const back = [];
  let external = false;
  let refuse = false;
  const prompt = el();
  prompt.value = '';
  const ui = m.exports.steerUI({
    api: { steer: async (text, ids) => { if (refuse) throw Error('no'); sent.push([text, ids]); return true; } },
    composer: el(), bar: el(), prompt, t: (s) => s, external: () => external,
    shown: (text, files) => shown.push([text, files.length]), restore: (files) => back.push(...files), notice() {},
  });
  await ui.send('bak', [{ id: 'a', name: 'a.png' }]);
  assert.deepEqual(sent, [['bak', ['a']]]);
  assert.deepEqual(shown, [['bak', 1]]);
  await ui.send('', [{ id: 'b', name: 'b.png' }]);
  assert.equal(sent[1][0], 'Eklediğim dosyalara da bak.');
  await ui.send('');
  assert.equal(sent.length, 2);
  await ui.send('yazı');
  assert.equal(sent[2].length, 2);
  assert.equal(sent[2][1], undefined);
  external = true;
  await ui.send('sonra', [{ id: 'c', name: 'c.png' }]);
  assert.equal(sent.length, 3);
  assert.equal(ui.take(), 'sonra');
  assert.deepEqual(back.map((f) => f.id), ['c']);
  delete global.document;
  delete global.Event;
});
test('pictures: each gets its share of one request', async () => {
  const p = require('../app/ai/provider-images.cjs');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'charles-0924-'));
  const f = path.join(dir, 'a.png');
  fs.writeFileSync(f, Buffer.alloc(1024 * 1024));
  const items = Array.from({ length: 200 }, () => ({ type: 'localImage', path: f }));
  const asked = [];
  const made = await p.loadImages(items.map((i) => ({ path: i.path })), (file, limit) => {
    asked.push(limit);
    return { data: Buffer.alloc(1000), mime: 'image/jpeg' };
  });
  assert.equal(made.length, 200);
  assert.equal(asked[0], Math.floor(p.MAX_REQUEST_IMAGE_BYTES / 200));
  await assert.rejects(p.loadImages(items.map((i) => ({ path: i.path }))), /çok büyük/);
  assert.throws(() => p.splitAttachments('claude', Array.from({ length: 601 }, () => ({ type: 'localImage', path: f }))), /en fazla 600 görsel/);
});

test('the picture view stays under the window buttons of the app window', () => {
  assert.match(read('app/main.cjs'), /titleBarOverlay: \{[^}]*height: 52 \}/);
  assert.match(read('public/styles/40-v0924.css'), /body\.workspace \.image-lightbox \{\s*inset: 52px 0 0;/);
});
