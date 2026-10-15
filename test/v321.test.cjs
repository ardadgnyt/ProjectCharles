const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { parse, resolveHome } = require('../app/plugins/plugin-commands.cjs'),
  { ComputerTime } = require('../app/system/computer-time.cjs'),
  { Shortcuts, DEFAULTS } = require('../app/core/shortcuts.cjs'),
  { runVoicePlugin } = require('../app/voice/live-plugins.cjs'),
  { googleConfig, setupURL } = require('../app/plugins/oauth-setup.cjs');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v321-'));
test('User screenshot requests route to named Home Assistant devices and school inbox', () => {
  for (const text of [
    'Tavan lambasını kapatabilir misin?',
    'home asistant ile tavan lambasını kapatabilir misin',
  ]) {
    const r = parse(text);
    assert.equal(r.action, 'turn_off');
    assert.equal(
      resolveHome(r, [{ id: 'light.ceiling', title: 'Tavan lambası', text: 'on' }]).entity,
      'light.ceiling',
    );
  }
  assert.deepEqual(parse('okul mailimi kontrol edip son gelen maili söyler misin'), {
    kind: 'school',
    query: '',
    latest: true,
  });
  assert.equal(parse('Okul maillerimi özetle').summary, true);
  assert.equal(parse('Gmail maillerimi özetler misin?').kind, 'gmail');
  assert.equal(parse('Tavan lambasını kapatma'), null);
  assert.equal(parse('Hikayede tavan lambasını kapatabilir misin?'), null);
  assert.equal(parse('Şu cümleyi çevir: tavan lambasını kapat'), null);
});
test('Home Assistant ambiguous and unavailable devices never resolve to an action', () => {
  const r = parse('Tavan lambasını kapat');
  assert(
    resolveHome(r, [
      { id: 'light.a', title: 'Tavan lambası' },
      { id: 'light.b', title: 'Tavan lambası' },
    ]).message,
  );
  assert(resolveHome(r, [{ id: 'light.a', title: 'Tavan lambası', text: 'unavailable' }]).message);
  assert(resolveHome(r, []).message);
  assert.equal(
    resolveHome(parse('Salon perdesini aç'), [{ id: 'cover.salon', title: 'Salon perdesi' }])
      .action,
    'open_cover',
  );
});
test('Computer time excludes lock, suspend gaps, restart downtime and splits reporting weeks', () => {
  const dir = temp(),
    t = Date.now();
  try {
    const c = new ComputerTime(dir);
    c.sample(t, 'active');
    c.sample(t + 15000, 'active');
    c.sample(t + 30000, 'idle');
    c.sample(t + 45000, 'locked');
    c.sample(t + 60000, 'locked');
    assert.equal(c.read(t, t + 100000).computerSeconds, 30);
    assert.equal(c.read(t, t + 100000).activeSeconds, 15);
    c.sample(t + 75000, 'active');
    c.sample(t + 90000, 'active');
    c.sample(t + 900000, 'active');
    assert.equal(c.read(t, t + 999999).computerSeconds, 45);
    assert.equal(c.read(t + 10000, t + 20000).computerSeconds, 10);
    c.save();
    const next = new ComputerTime(dir);
    next.sample(t + 2000000, 'active');
    assert.equal(next.read(t, t + 3000000).computerSeconds, 45);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Shortcut recording temporarily releases existing global shortcuts and restores on cancel', () => {
  const dir = temp(),
    keys = new Set();
  try {
    const s = new Shortcuts(
      dir,
      {
        register: (key) => {
          keys.add(key);
          return true;
        },
        unregister: (key) => keys.delete(key),
      },
      () => {},
    );
    assert(keys.size);
    s.recording(true);
    assert.equal(keys.size, 0);
    s.recording(false);
    assert.equal(keys.size, Object.keys(DEFAULTS).length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('OAuth setup accepts only desktop Google JSON and fixed official setup pages', () => {
  assert.deepEqual(
    googleConfig(
      JSON.stringify({
        installed: { client_id: 'fake.apps.googleusercontent.com', client_secret: 'synthetic' },
      }),
    ),
    { clientId: 'fake.apps.googleusercontent.com', secret: 'synthetic' },
  );
  assert.throws(() => googleConfig('{"web":{}}'));
  assert.throws(() => googleConfig('{"private_key":"synthetic"}'));
  assert.match(setupURL('google', 0), /^https:\/\/console.cloud.google.com\//);
  assert.throws(() => setupURL('https://example.com'));
});
test('Voice plugins read the requested school account and preserve approval and cancellation', async () => {
  let posts = 0,
    confirm = 0,
    reads = [];
  const plugins = {
    list: async (kind) =>
      kind === 'home'
        ? [{ id: 'light.ceiling', title: 'Tavan lambası', text: 'on' }]
        : [
            { id: 'old', date: '2026-10-01' },
            { id: 'new', date: '2026-10-12' },
          ],
    read: async (kind, id) => {
      reads.push([kind, id]);
      return { id, text: 'School result' };
    },
    homeAction: async () => posts++,
  };
  const r = await runVoicePlugin({
    plugins,
    transcript: 'Okul mailimi kontrol edip son gelen maili söyler misin',
  });
  assert.equal(r.source, 'school');
  assert.deepEqual(reads, [['school', 'new']]);
  await runVoicePlugin({
    plugins,
    transcript: 'Tavan lambasını kapat',
    access: 'ask',
    onConfirm: () => confirm++,
  });
  assert.equal(confirm, 1);
  assert.equal(posts, 0);
  await runVoicePlugin({ plugins, transcript: 'Tavan lambasını kapat', access: 'full' });
  assert.equal(posts, 1);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(() =>
    runVoicePlugin({
      plugins,
      transcript: 'Tavan lambasını kapat',
      access: 'full',
      signal: aborted.signal,
    }),
  );
  assert.equal(posts, 1);
  await assert.rejects(() =>
    runVoicePlugin({ plugins, transcript: 'Hikayede biri ışığı kapattı' }),
  );
});
const { Plugins } = require('../app/plugins/plugins.cjs');
test('School inbox reads latest messages even when older than seven days', async () => {
  const dir = temp(),
    target = require.resolve('imapflow'),
    original = require.cache[target];
  let range, opts;
  class FakeIMAP {
    constructor() {
      this.mailbox = { exists: 40, uidValidity: 9 };
    }
    async connect() {}
    async getMailboxLock() {
      return { release() {} };
    }
    async *fetch(r, f, o) {
      range = r;
      opts = o;
      yield {
        uid: 88,
        envelope: { subject: 'Older school mail', from: [], date: new Date('2026-01-01') },
        flags: new Set(),
      };
    }
    async logout() {}
  }
  require.cache[target] = {
    id: target,
    filename: target,
    loaded: true,
    exports: { ImapFlow: FakeIMAP },
  };
  try {
    const p = new Plugins(
      dir,
      {},
      () => {},
      () => {},
    );
    p.data.configs.school = { host: 'test.example', user: 'test', password: 'synthetic' };
    const rows = await p.school();
    assert.equal(range, '16:40');
    assert.equal(opts, undefined);
    assert.equal(rows[0].id, '9:88');
    assert.equal(rows[0].title, 'Older school mail');
  } finally {
    if (original) require.cache[target] = original;
    else delete require.cache[target];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('New unread mail notifications do not require a keyword', async () => {
  const dir = temp();
  try {
    const alerts = [],
      p = new Plugins(
        dir,
        {
          isEncryptionAvailable: () => true,
          encryptString: (s) => Buffer.from(s),
          decryptString: (b) => b.toString(),
        },
        () => {},
        (v) => alerts.push(v),
      );
    p.data.tokens.google = { access_token: 'synthetic' };
    let rows = [{ id: 'one', title: 'Merhaba', unread: true }];
    p.list = async (kind) => (kind === 'gmail' ? rows : []);
    const judged = [];
    p.onMail = async (mails) => judged.push(...mails);
    await p.poll();
    assert.equal(judged.length, 0);
    rows = [...rows, { id: 'two', title: 'Toplantı notları', unread: true }];
    await p.poll();
    assert.equal(judged.length, 1, 'new unread mail reaches triage without any keyword');
    await p.poll();
    assert.equal(judged.length, 1);
    assert.equal(alerts.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
