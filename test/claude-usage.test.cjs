const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ClaudeUsage, claudeUsage, USAGE_URL } = require('../app/usage/claude-usage.cjs');

function configDir(oauth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-claude-'));
  if (oauth)
    fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: oauth }));
  return dir;
}
const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

test('Claude usage windows become remaining percentages with reset times and plan name', () => {
  const v = claudeUsage(
    {
      five_hour: { utilization: 23, resets_at: '2026-10-13T20:00:00Z' },
      seven_day: { utilization: 100, resets_at: '2026-10-17T08:00:00Z' },
    },
    'pro',
  );
  assert.equal(v.provider, 'claude');
  assert.equal(v.fiveHour.remaining, 77);
  assert.equal(v.fiveHour.resetsAt, Date.parse('2026-10-13T20:00:00Z') / 1000);
  assert.equal(v.weekly.remaining, 0);
  assert.equal(v.blocked, true);
  assert.equal(v.plan, 'Pro');
  assert.equal(claudeUsage({}).unavailable, 'Kota bilgisi okunamadı');
});

test('Claude usage request uses the CLI session token with the OAuth beta header and caches', async () => {
  const dir = configDir({
    accessToken: 'tok-1',
    expiresAt: Date.now() + 3600e3,
    subscriptionType: 'max',
  });
  const calls = [];
  const u = new ClaudeUsage(dir, {
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return response(200, { five_hour: { utilization: 10 }, seven_day: { utilization: 40 } });
    },
  });
  const v = await u.read(true);
  assert.equal(calls[0].url, USAGE_URL);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-1');
  assert.equal(calls[0].init.headers['anthropic-beta'], 'oauth-2025-04-20');
  assert.equal(v.fiveHour.remaining, 90);
  assert.equal(v.weekly.remaining, 60);
  assert.equal(v.plan, 'Max');
  await u.read(false);
  assert.equal(calls.length, 1, 'second read inside a minute is served from cache');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Expired Claude session asks the CLI to renew before reading; missing login is reported', async () => {
  const dir = configDir({ accessToken: 'old', expiresAt: Date.now() - 1000 });
  let renewed = 0;
  const u = new ClaudeUsage(dir, {
    refreshSession: async () => {
      renewed++;
      fs.writeFileSync(
        path.join(dir, '.credentials.json'),
        JSON.stringify({ claudeAiOauth: { accessToken: 'new', expiresAt: Date.now() + 3600e3 } }),
      );
    },
    fetcher: async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer new');
      return response(200, { five_hour: { utilization: 0 }, seven_day: { utilization: 0 } });
    },
  });
  assert.equal((await u.read(true)).fiveHour.remaining, 100);
  assert.equal(renewed, 1);
  const missing = new ClaudeUsage(configDir(null), { fetcher: async () => assert.fail('no call') });
  assert.equal((await missing.read(true)).unavailable, 'Claude hesabı bağlı değil');
  const rejected = new ClaudeUsage(configDir({ accessToken: 'x', expiresAt: Date.now() + 9e6 }), {
    fetcher: async () => response(401, {}),
  });
  assert.equal((await rejected.read(true)).unavailable, 'Oturum yenilenince görünecek');
});

test('Rate-limited or failed Claude reads keep the last good numbers and back off', async () => {
  let now = Date.now();
  let status = 200;
  let calls = 0;
  const u = new ClaudeUsage(configDir({ accessToken: 't', expiresAt: now + 9e6 }), {
    now: () => now,
    fetcher: async () => {
      calls++;
      return {
        status,
        ok: status === 200,
        headers: { get: () => '120' },
        json: async () => ({ five_hour: { utilization: 40 }, seven_day: { utilization: 5 } }),
      };
    },
  });
  assert.equal((await u.read(true)).fiveHour.remaining, 60);
  status = 429;
  const stale = await u.read(true);
  assert.equal(stale.fiveHour.remaining, 60);
  assert.equal(stale.stale, true);
  await u.read(true);
  assert.equal(calls, 2, 'no request during the back-off window');
  now += 121000;
  status = 200;
  await u.read(true);
  assert.equal(calls, 3);
});
