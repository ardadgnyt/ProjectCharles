// v0.7.3 Beta: Cursor Composer/Grok models, full-height side panel, Claude usage freshness,
// × goes back to the island.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('Cursor: Composer and Grok models are read from the account and passed with --model', () => {
  const { parseCursorModels } = require('../app/ai/providers.cjs');
  const out =
    'Available models\n\n\x1b[1mauto\x1b[0m - Auto\ncomposer-2.5 - Composer 2.5 (current, default)\n' +
    'gpt-5.5-medium - GPT-5.5\ngrok-4.20 - Grok 4.20\n  grok-code-fast-1\nclaude-opus-4-6 - Opus\ncomposer-2.5 - again';
  assert.deepEqual(parseCursorModels(out), [
    ['composer-2.5', 'Composer 2.5'],
    ['grok-4.20', 'Grok 4.20'],
    ['grok-code-fast-1', 'Grok Code Fast 1'],
  ]);
  assert.deepEqual(parseCursorModels('rm -rf / - x\n'), []);
  const { launchPlan } = require('../app/ai/provider-tools.cjs');
  const plan = launchPlan({ provider: 'cursor', model: 'grok-4.20', mode: 'chat', access: 'ask', workspace: os.tmpdir() });
  assert.deepEqual(plan.cli.slice(plan.cli.indexOf('--model'), plan.cli.indexOf('--model') + 2), ['--model', 'grok-4.20']);
  const auto = launchPlan({ provider: 'cursor', model: 'auto', mode: 'chat', access: 'ask', workspace: os.tmpdir() });
  assert.ok(!auto.cli.includes('--model'));
  // never a permission bypass
  assert.ok(!plan.cli.includes('--force') && !plan.cli.includes('--yolo'));
});

test('Cursor models are offered only when Cursor is signed in', () => {
  const { Providers } = require('../app/ai/providers.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-073-'));
  const p = new Providers(root, dir);
  p.auth = { cursor: true };
  p.cursorModels = [['grok-4.20', 'Grok 4.20']];
  const ids = p.models().map((m) => m.id);
  assert.deepEqual(ids, ['cursor:auto', 'cursor:grok-4.20']);
  p.auth = { cursor: false, claude: true };
  assert.ok(!p.models().some((m) => m.id.startsWith('cursor:')));
});

test('Claude usage: windows whose reset has passed are not shown as current', async () => {
  const { ClaudeUsage } = require('../app/usage/claude-usage.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-073c-'));
  fs.writeFileSync(
    path.join(dir, '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 't1', expiresAt: 0, subscriptionType: 'pro' } }),
  );
  const now = 1_800_000_000_000;
  const cacheFile = path.join(dir, 'cache.json');
  fs.writeFileSync(
    cacheFile,
    JSON.stringify({
      provider: 'claude',
      fiveHour: { remaining: 5, resetsAt: now / 1000 - 60 },
      weekly: { remaining: 84, resetsAt: now / 1000 + 86400 },
      updatedAt: now - 3600e3,
    }),
  );
  let calls = 0;
  let renewed = 0;
  const u = new ClaudeUsage(dir, {
    now: () => now,
    cacheFile,
    refreshSession: async () => {
      renewed++;
      fs.writeFileSync(
        path.join(dir, '.credentials.json'),
        JSON.stringify({ claudeAiOauth: { accessToken: 't2', expiresAt: 0 } }),
      );
    },
    fetcher: async (_url, opts) => {
      calls++;
      if (opts.headers.Authorization === 'Bearer t1') return { status: 401, ok: false };
      return {
        status: 200,
        ok: true,
        json: async () => ({
          five_hour: { utilization: 70, resets_at: now / 1000 + 3600 },
          seven_day: { utilization: 28, resets_at: now / 1000 + 5 * 86400 },
        }),
      };
    },
  });
  // stale copy drops the reset window and keeps the weekly one, marked as old
  const stale = u.staleCopy();
  assert.equal(stale.fiveHour, null);
  assert.equal(stale.weekly.remaining, 84);
  assert.equal(stale.stale, true);
  // 401 → the CLI renews the session → one more try with the new token
  const fresh = await u.read(true);
  assert.equal(renewed, 1);
  assert.equal(calls, 2);
  assert.equal(fresh.fiveHour.remaining, 30);
  assert.equal(fresh.weekly.remaining, 72);
  assert.match(read('app/ai/providers.cjs'), /if \(provider === 'claude'\) this\.claudeUsage\.invalidate\(\)/);
});

test('side panel shows the whole file; × goes back to the island', () => {
  const css = read('public/styles/9-special.css');
  assert.match(css, /\.ws-gutter,\n\.ws-code \{[^}]*max-height: none;[^}]*overflow: visible;/);
  assert.match(css, /\.ws-term \{[^}]*max-height: none;/);
  const r = read('src/renderer.ts');
  assert.match(r, /e\.shiftKey \? api\.quit\(\) : document\.body\.classList\.contains\('workspace'\) \? api\.workspace\(false\) : api\.expand\(false\)/);
  assert.match(read('public/index.html'), /id="quit" title="Adacığa dön/);
  assert.equal(JSON.parse(read('package.json')).version, '0.7.3-beta.1');
});
