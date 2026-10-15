const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const { Agent } = require('../app/ai/agent.cjs');
test('Manual model changes preserve the thread; automatic option resolves the server default', async () => {
  const a = new Agent(path.resolve(__dirname, '..'));
  a.ready = true;
  const calls = [];
  a.rpc = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'model/list') return { data: [{ model: 'default-model', isDefault: true }] };
      if (method === 'thread/start') return { thread: { id: 'same-thread' } };
      if (method === 'turn/start') return { turn: { id: 'turn' } };
    },
  };
  for (const model of ['astra', 'sol', null]) {
    await a.send({ cwd: a.root, prompt: 'test', model, mode: 'chat' });
    a.notification({
      method: 'turn/completed',
      params: { threadId: 'same-thread', turn: { status: 'completed' } },
    });
  }
  assert.equal(calls.filter((x) => x.method === 'thread/start').length, 1);
  assert.deepEqual(
    calls.filter((x) => x.method === 'turn/start').map((x) => x.params.model),
    ['astra', 'sol', 'default-model'],
  );
});
test('Quota error does not silently retry with a different model', async () => {
  const a = new Agent(path.resolve(__dirname, '..'));
  a.ready = true;
  let turns = 0;
  a.rpc = {
    request: async (method) => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'thread/start') return { thread: { id: 't' } };
      if (method === 'turn/start') {
        turns++;
        throw Error('Usage limit');
      }
    },
  };
  await assert.rejects(
    a.send({ cwd: a.root, prompt: 'test', model: 'astra', mode: 'chat' }),
    /Usage limit/,
  );
  assert.equal(turns, 1);
  assert.equal(a.busy, false);
});
