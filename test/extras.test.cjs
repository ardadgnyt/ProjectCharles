const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Extras, SERVICES } = require('../app/core/extras.cjs');
const { Sessions } = require('../app/ai/sessions.cjs');
const cryptoMock = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
};
function fixture(fetcher) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-extras-test-'));
  return {
    dir,
    extras: new Extras(dir, cryptoMock, fetcher),
    close() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
test('Attachment copy, input formatting, limits and executable rejection', () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, 'note.txt');
    fs.writeFileSync(file, 'Merhaba');
    const a = f.extras.ingest(file);
    assert.equal(a.name, 'note.txt');
    assert.equal(a.path, undefined);
    assert.match(f.extras.inputs([a.id])[0].text, /Merhaba/);
    fs.writeFileSync(path.join(f.dir, 'bad.exe'), 'x');
    assert.throws(() => f.extras.ingest(path.join(f.dir, 'bad.exe')), /Desteklenenler/);
    assert.throws(() => f.extras.inputs(['unknown']));
    assert.throws(() => f.extras.inputs(Array(6).fill(a.id)));
    assert.throws(() => f.extras.ingest(f.dir));
    const img = path.join(f.dir, 'a.png');
    fs.writeFileSync(img, 'test');
    const i = f.extras.ingest(img);
    assert.equal(f.extras.inputs([i.id])[0].type, 'localImage');
  } finally {
    f.close();
  }
});
test('Service secret flags, URL validation, refresh, pause and revocation', async () => {
  let calls = 0;
  const f = fixture(async (url) => {
    calls++;
    return {
      ok: true,
      json: async () =>
        url.endsWith('/user')
          ? { login: 'test', public_repos: 2 }
          : [{ full_name: 'test/repo', stargazers_count: 5 }],
    };
  });
  try {
    f.extras.setSecret('github', 'private-token');
    assert.equal(f.extras.settings().services.find((s) => s.id === 'github').configured, true);
    assert.ok(!JSON.stringify(f.extras.settings()).includes('private-token'));
    const r = await f.extras.refresh('github');
    assert.equal(calls, 2);
    assert.match(r.rows[1], /test\/repo/);
    f.extras.pause(true);
    await assert.rejects(f.extras.refresh('github'), /duraklat/);
    assert.throws(() => f.extras.setSecret('n8n', 'token', 'http://external.test'));
    assert.throws(() => f.extras.setSecret('unknown', 'token'));
    f.extras.setSecret('github', '');
    assert.equal(f.extras.settings().services.find((s) => s.id === 'github').configured, false);
  } finally {
    f.close();
  }
});
test('Settings persist with clamped ranges', () => {
  const f = fixture();
  try {
    f.extras.settings({
      sound: false,
      volume: 3,
      autoHide: true,
      hideSeconds: 1,
      screen: 'primary',
    });
    const saved = new Extras(f.dir, cryptoMock);
    assert.equal(saved.settings().volume, 0.2);
    assert.equal(saved.settings().hideSeconds, 10);
    assert.equal(saved.settings().sound, false);
  } finally {
    f.close();
  }
});
test('All seven integrations map read-only response fixtures', async () => {
  const responses = {
    github: { login: 'a', public_repos: 1 },
    vercel: { deployments: [{ name: 'a', state: 'READY' }] },
    stripe: { available: [], data: [] },
    resend: { data: [] },
    notion: { results: [] },
    calcom: { data: [] },
    n8n: { data: [] },
  };
  for (const id of SERVICES) {
    const f = fixture(async (url) => ({
      ok: true,
      json: async () => (url.includes('/user/repos') ? [] : responses[id]),
    }));
    try {
      f.extras.setSecret(id, 'key', id === 'n8n' ? 'https://example.test' : '');
      assert.equal((await f.extras.refresh(id)).error, null);
    } finally {
      f.close();
    }
  }
});
test('Independent sessions preserve busy state and route background approvals', () => {
  const s = new Sessions(process.cwd());
  const id1 = s.active;
  s.current.agent.busy = true;
  const next = s.add();
  assert.notEqual(next.id, id1);
  assert.equal(s.busy, false);
  let background;
  s.on('event', (e) => {
    if (e.type === 'background-request') background = e;
  });
  s.rooms.get(id1).agent.publish('request', { id: 'q' });
  assert.equal(background.data.id, id1);
  s.select(id1);
  assert.equal(s.busy, true);
  assert.throws(() => s.close(), /durdurun/);
  s.current.agent.busy = false;
  s.close();
  assert.equal(s.rooms.size, 1);
  s.stop();
});
