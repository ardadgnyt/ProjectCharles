const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  os = require('os'),
  path = require('path');
const { Sessions, contextText } = require('../app/ai/sessions.cjs');
const { threadParams } = require('../app/core/policy.cjs');
test('Charles threads are ephemeral in chat and project modes', () => {
  for (const mode of ['chat', 'project'])
    assert.equal(threadParams(process.cwd(), null, mode).ephemeral, true);
});
test('Local history survives restart, close and new chat; restores context without replaying tools', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-history-'));
  const s = new Sessions(process.cwd(), dir);
  const id = s.active;
  s.local('Merhaba', 'Merhaba, ben Charles.');
  s.reset();
  s.local('İkinci sohbet', 'Yanıt');
  s.close();
  s.stop();
  const restored = new Sessions(process.cwd(), dir);
  restored.select(id);
  assert.equal(restored.current.events.length, 2);
  assert.equal(restored.current.agent.threadId, null);
  let sent;
  restored.current.agent.ready = true;
  restored.current.agent.send = async (a) => {
    sent = a;
    return {};
  };
  await restored.send({ cwd: process.cwd(), model: 'test', mode: 'chat', prompt: 'Adın ne?' });
  assert.match(sent.prompt, /Merhaba, ben Charles/);
  assert.match(sent.prompt, /Adın ne/);
  assert.equal(restored.current.events.at(-1).data, 'Adın ne?');
  assert.equal(restored.list().filter((r) => r.name === 'İkinci sohbet').length, 1);
  restored.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
test('Corrupt local history is preserved and startup continues with a recovery notice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-history-bad-'));
  try {
    const file = path.join(dir, 'charles-history.json');
    fs.writeFileSync(file, 'broken');
    const sessions = new Sessions('.', dir);
    assert.match(sessions.recoveryWarning, /korundu/);
    const preserved = fs.readdirSync(dir).find((n) => n.includes('.corrupt-'));
    assert.equal(fs.readFileSync(path.join(dir, preserved), 'utf8'), 'broken');
    assert.equal(sessions.current.events.length, 0);
    sessions.stop();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
