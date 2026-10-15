const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Agent } = require('../app/ai/agent.cjs');
const { Rpc } = require('../app/ai/rpc.cjs');
const { approvalReply, questionReply, isLoginUrl } = require('../app/core/policy.cjs');
const { threadParams } = require('../app/core/policy.cjs');
const root = path.resolve(__dirname, '..');
const fake = () => ({ command: process.execPath, args: [path.join(__dirname, 'fake-server.cjs')] });
function wait(a, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      a.off('event', listener);
      reject(Error('Event timeout'));
    }, 4000);
    const listener = (e) => {
      if (predicate(e)) {
        clearTimeout(timer);
        a.off('event', listener);
        resolve(e);
      }
    };
    a.on('event', listener);
  });
}
for (const decision of ['accept', 'decline'])
  test(`Live RPC flow: ${decision}, UTF-8 streaming, stale reply rejection`, async () => {
    const a = new Agent(root, fake);
    try {
      assert.equal((await a.connect()).signedIn, true);
      assert.equal((await a.models())[0].id, 'test-model');
      const requested = wait(a, (e) => e.type === 'request');
      await a.send({ cwd: root, model: 'test-model', prompt: 'test' });
      const request = (await requested).data;
      assert.equal(request.item.command, 'test command');
      assert.throws(() => a.reset(), /durdurun/);
      await assert.rejects(a.send({ cwd: root, prompt: 'overlap' }), /zaten/);
      const delta = wait(
        a,
        (e) => e.type === 'agent' && e.data.method === 'item/agentMessage/delta',
      );
      const completed = wait(a, (e) => e.type === 'agent' && e.data.method === 'turn/completed');
      a.reply({ id: request.id, decision });
      assert.match(
        (await delta).data.params.delta,
        decision === 'accept' ? /Türkçe/ : /reddedildi/,
      );
      await completed;
      assert.equal(a.busy, false);
      assert.equal(a.requests.size, 0);
      assert.throws(() => a.reply({ id: request.id, decision }), /beklemiyor/);
    } finally {
      a.stop();
    }
  });
test('Interrupt clears pending permissions and stops turn', async () => {
  const a = new Agent(root, fake);
  try {
    await a.connect();
    const request = wait(a, (e) => e.type === 'request');
    await a.send({ cwd: root, prompt: 'test' });
    await request;
    const end = wait(a, (e) => e.type === 'agent' && e.data.method === 'turn/completed');
    await a.interrupt();
    await end;
    assert.equal(a.busy, false);
    assert.equal(a.requests.size, 0);
  } finally {
    a.stop();
  }
});
test('No permanent grants or forged approvals; exact available decisions', () => {
  const r = {
    method: 'item/commandExecution/requestApproval',
    params: { availableDecisions: ['decline', 'cancel'] },
  };
  assert.throws(() => approvalReply(r, 'accept'));
  assert.throws(() => approvalReply(r, 'acceptForSession'));
  assert.deepEqual(approvalReply(r, 'decline'), { decision: 'decline' });
  assert.throws(() => approvalReply({ method: 'unknown' }, 'accept'));
});
test('Question validation and login URL allowlist', () => {
  const r = { method: 'item/tool/requestUserInput', params: { questions: [{ id: 'q' }] } };
  assert.equal(questionReply(r, { q: 'Yanıt' }).answers.q.answers[0], 'Yanıt');
  assert.throws(() => questionReply(r, {}));
  assert.ok(isLoginUrl('https://auth.openai.com/authorize?x=1'));
  for (const u of [
    'https://auth.openai.com.evil.test/',
    'file:///test',
    'https://evil.test',
    'http://chatgpt.com',
    'https://evil@chatgpt.com',
  ])
    assert.equal(isLoginUrl(u), false);
});
test('Unknown permissions denied; no implicit approval', () => {
  const a = new Agent(root, fake);
  const sent = [];
  a.rpc = { send: (m) => sent.push(m) };
  a.threadId = 't1';
  a.serverRequest({
    id: 7,
    method: 'item/permissions/requestApproval',
    params: { threadId: 't1' },
  });
  assert.deepEqual(sent[0].result.permissions, {});
  a.serverRequest({ id: 8, method: 'something/new', params: {} });
  assert.equal(sent[1].error.code, -32601);
});
test('Chat uses read-only workspace and declines command/file approvals', () => {
  assert.equal(threadParams(root, null, 'chat').sandbox, 'read-only');
  assert.equal(threadParams(root, null, 'project').sandbox, 'workspace-write');
  const a = new Agent(root, fake);
  a.mode = 'chat';
  const sent = [];
  a.rpc = { send: (m) => sent.push(m) };
  for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'])
    a.serverRequest({ id: method, method, params: {} });
  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.result.decision === 'decline'));
  assert.equal(a.requests.size, 0);
});
test('RPC timeout and subprocess exit reject pending requests', async () => {
  const spec = fake();
  const rpc = new Rpc(spec.command, spec.args);
  try {
    assert.deepEqual(await rpc.request('echo', { value: 4 }), { value: 4 });
    await assert.rejects(rpc.request('never', {}, 30), /yanıt vermedi/);
    await assert.rejects(rpc.request('crash'), /kapandı/);
    assert.equal(rpc.pending.size, 0);
  } finally {
    rpc.stop();
  }
});
