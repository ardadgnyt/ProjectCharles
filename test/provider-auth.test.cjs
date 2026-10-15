const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Providers } = require('../app/ai/providers.cjs');
test('Models follow verified login and logout; old preferences cannot fake a login', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-auth-'));
  try {
    const p = new Providers(process.cwd(), dir);
    p.enable('gemini', true);
    assert.equal(p.models().length, 0);
    let logged = false,
      calls = 0;
    p.probe = async (id) => {
      calls++;
      return id === 'gemini' && logged;
    };
    await p.refreshAuth(true);
    assert.equal(p.models().length, 0);
    logged = true;
    await p.refreshAuth(true);
    assert.equal(p.models().length, 3);
    assert(p.models().every((m) => m.id.startsWith('gemini:')));
    const n = calls;
    await p.refreshAuth();
    assert.equal(calls, n);
    logged = false;
    // One failed check (slow CLI) keeps the account; a second one in a row signs it out.
    await p.refreshAuth(true);
    assert.equal(p.models().length, 3);
    await p.refreshAuth(true);
    assert.equal(p.models().length, 0);
    p.probe = async () => {
      throw Error('offline');
    };
    await p.refreshAuth(true);
    assert.equal(p.models().length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Auth probes require successful official output and reject API-only Claude auth', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-auth-probe-'));
  try {
    const script = path.join(dir, 'probe.cjs'),
      result = path.join(dir, 'result.json');
    fs.writeFileSync(
      script,
      `const r=JSON.parse(require('fs').readFileSync(${JSON.stringify(result)}));console.log(r.out);process.exit(r.code||0);`,
    );
    const p = new Providers(process.cwd(), dir);
    p.spec = () => ({ exe: process.execPath, args: [script] });
    for (const [id, out, expected] of [
      ['claude', JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }), true],
      ['claude', JSON.stringify({ loggedIn: true, authMethod: 'api_key' }), false],
      ['claude', JSON.stringify({ loggedIn: false, authMethod: 'claude.ai' }), false],
      ['gemini', 'Authentication required', false],
      ['gemini', 'Model quotas: Gemini remaining 100%', true],
      ['gemini', 'Failed to fetch usage', false],
      ['gemini', '', false],
      ['cursor', JSON.stringify({ isAuthenticated: true, hasAccessToken: true }), true],
      ['cursor', JSON.stringify({ isAuthenticated: false, hasAccessToken: false }), false],
    ]) {
      fs.writeFileSync(result, JSON.stringify({ out }));
      assert.equal(await p.probe(id), expected, id + out);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Already signed-in login refreshes models without opening a terminal', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-already-auth-'));
  try {
    const p = new Providers(process.cwd(), dir);
    p.probe = async () => true;
    assert.deepEqual(await p.login('gemini'), { opened: false, signedIn: true });
    assert.equal(p.models().length, 3);
    assert.equal(fs.existsSync(path.join(dir, 'providers/login-gemini.ps1')), false);
    const { subscriptionEnv } = require('../app/ai/providers.cjs');
    const env = subscriptionEnv(
      { SSH_CONNECTION: 'remote', SSH_CLIENT: 'remote', SSH_TTY: 'remote' },
      dir,
    );
    assert.equal(env.SSH_CONNECTION, undefined);
    assert.equal(env.SSH_CLIENT, undefined);
    assert.equal(env.SSH_TTY, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
