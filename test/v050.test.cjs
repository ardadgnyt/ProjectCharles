const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Plugins } = require('../app/plugins/plugins.cjs');
const { trustSystemCertificates } = require('../app/core/system-ca.cjs');
const { mailQuestion } = require('../app/plugins/plugin-commands.cjs');

const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
};

test('Mail requests to one service run one at a time and 429 answers are retried', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v050-'));
  try {
    let running = 0,
      peak = 0,
      calls = 0;
    const p = new Plugins(
      dir,
      encryption,
      () => {},
      () => {},
      async () => {
        calls++;
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        if (calls === 1)
          return { status: 429, ok: false, headers: { get: () => '0.01' }, json: async () => ({}) };
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          json: async () => ({ n: calls }),
        };
      },
    );
    const results = await Promise.all([
      p.json('https://gmail.googleapis.com/a'),
      p.json('https://gmail.googleapis.com/b'),
      p.json('https://gmail.googleapis.com/c'),
    ]);
    assert.equal(peak, 1, 'never two requests to the same host at once');
    assert.equal(calls, 4, 'first request retried once after 429');
    assert.deepEqual(
      results.map((r) => r.n),
      [2, 3, 4],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows certificate store is trusted when the runtime supports it', () => {
  assert.equal(typeof trustSystemCertificates(), 'boolean');
});

test('Free-form mail questions are recognised; writing or setup questions are not', () => {
  assert.equal(mailQuestion('onemli bir e posta var mi bana gelen').important, true);
  assert.equal(mailQuestion('hotmailime yeni mail geldi mi').kind, 'outlook');
  assert.equal(mailQuestion('mail nasil baglanir'), null);
  assert.equal(mailQuestion('bana bir mail yaz'), null);
});

test('v0.5.2 reactions: user phrases and answer tone map to Slime emotes', async () => {
  const esbuild = require('esbuild');
  const src = fs.readFileSync(path.join(__dirname, '../src/chat/reactions.ts'), 'utf8');
  const m = { exports: {} };
  new Function(
    'module',
    'exports',
    esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code,
  )(m, m.exports);
  const { textReaction, answerReaction } = m.exports;
  assert.equal(textReaction('Süper olmuş, bayıldım!'), 'happy');
  assert.equal(textReaction('Sınavı geçtim!'), 'proud');
  assert.equal(textReaction('Çok yoruldum'), 'yawn');
  assert.equal(textReaction('Of ya, berbat'), 'annoyed');
  assert.equal(textReaction('Bugün hava güneşli'), null);
  assert.equal(answerReaction('Tebrikler, harika iş! 🎉'), 'proud');
  assert.equal(answerReaction('Maalesef buna erişemiyorum.'), 'annoyed');
  assert.equal(answerReaction('Tamam, işte liste:'), null);
});

test('v0.5.3: Claude/Gemini/Cursor get project tools by access level, never a permission bypass', () => {
  const { launchPlan, claudeItems } = require('../app/ai/provider-tools.cjs');
  const base = { model: 'sonnet', projectDir: 'C:/p', workspace: 'C:/w' };
  for (const provider of ['claude', 'gemini', 'cursor'])
    for (const access of ['ask', 'auto', 'full'])
      for (const mode of ['chat', 'project']) {
        const p = launchPlan({ ...base, provider, access, mode });
        const flags = p.cli.join(' ');
        assert.doesNotMatch(
          flags,
          /bypassPermissions|dangerously|--force|--yolo/,
          provider + access,
        );
        assert.equal(p.cwd, mode === 'project' ? 'C:/p' : 'C:/w');
        assert.equal(p.tools, mode === 'project');
      }
  const chat = launchPlan({ ...base, provider: 'claude', access: 'full', mode: 'chat' }).cli;
  assert.equal(chat[chat.indexOf('--tools') + 1], '');
  const ask = launchPlan({ ...base, provider: 'claude', access: 'ask', mode: 'project' }).cli;
  assert.equal(ask[ask.indexOf('--permission-mode') + 1], 'plan');
  const auto = launchPlan({ ...base, provider: 'claude', access: 'auto', mode: 'project' }).cli;
  assert.equal(auto[auto.indexOf('--permission-mode') + 1], 'acceptEdits');
  assert.doesNotMatch(auto[auto.indexOf('--allowedTools') + 1], /Bash/);
  const g = launchPlan({ ...base, provider: 'gemini', access: 'full', mode: 'project' });
  assert.ok(g.cli.includes('accept-edits'));
  assert.ok(!g.geminiSettings.permissions.allow.includes('command(*)'));
  const items = claudeItems({
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'a.js' } }],
    },
  });
  assert.equal(items[0].item.type, 'fileChange');
});
