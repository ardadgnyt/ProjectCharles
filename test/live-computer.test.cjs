const test = require('node:test'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { runComputerTask } = require('../app/voice/live-computer.cjs'),
  { GeminiLive } = require('../app/voice/gemini-live.cjs');
function agent() {
  const a = new EventEmitter();
  a.ready = true;
  a.requests = new Map();
  a.account = async () => ({ signedIn: true });
  a.interrupt = async () => {
    a.interrupted = true;
  };
  return a;
}
test('Voice computer action forwards selected access and resolves actual agent result', async () => {
  const a = agent();
  let args;
  a.send = async (p) => {
    args = p;
    queueMicrotask(() => {
      a.emit('event', {
        type: 'agent',
        data: {
          method: 'item/completed',
          params: { item: { type: 'agentMessage', text: 'Dosya oluşturuldu.' } },
        },
      });
      a.emit('event', {
        type: 'agent',
        data: { method: 'turn/completed', params: { turn: { status: 'completed' } } },
      });
    });
  };
  const r = await runComputerTask({
    agent: a,
    request: 'Masaüstüne merhaba.txt yaz',
    transcript: 'Masaüstüne merhaba.txt oluştur',
    cwd: 'C:/Desktop',
    access: 'ask',
  });
  assert.equal(args.access, 'ask');
  assert.equal(args.mode, 'project');
  assert.equal(args.model, null);
  assert.match(args.prompt, /ses dökümü/);
  assert.equal(r.result, 'Dosya oluşturuldu.');
  assert.equal(a.listenerCount('event'), 0);
});
test('Voice tasks require spoken input and GPT login; cancellations interrupt their turn', async () => {
  const a = agent();
  await assert.rejects(runComputerTask({ agent: a, request: 'x', transcript: '' }), /tekrar söyle/);
  a.account = async () => ({ signedIn: false });
  await assert.rejects(runComputerTask({ agent: a, request: 'x', transcript: 'x' }), /GPT/);
  a.account = async () => ({ signedIn: true });
  a.send = async () => {};
  const controller = new AbortController();
  const pending = runComputerTask({
    agent: a,
    request: 'x',
    transcript: 'x',
    signal: controller.signal,
  });
  await new Promise((r) => setImmediate(r));
  controller.abort();
  await assert.rejects(pending, /iptal/);
  assert(a.interrupted);
  assert.equal(a.listenerCount('event'), 0);
});
test('Concurrent voice actions are rejected; failed tool turns are not successes', async () => {
  const a = agent();
  a.send = async () => {};
  const p = runComputerTask({ agent: a, request: 'x', transcript: 'x' });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(runComputerTask({ agent: a, request: 'y', transcript: 'y' }), /etkin/);
  a.emit('event', {
    type: 'agent',
    data: {
      method: 'turn/completed',
      params: { turn: { status: 'failed', error: { message: 'İzin reddedildi' } } },
    },
  });
  await assert.rejects(p, /İzin reddedildi/);
});
test('Live function calls return results once, and cancellation suppresses late responses', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-live-tool-'));
  let live;
  try {
    let callbacks,
      config,
      calls = 0,
      finish;
    const replies = [];
    live = new GeminiLive(
      dir,
      {
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from(s),
        decryptString: (b) => b.toString(),
      },
      () => {},
      () => ({
        live: {
          connect: async (p) => {
            callbacks = p.callbacks;
            config = p.config;
            return { close() {}, sendToolResponse: (r) => replies.push(r) };
          },
        },
      }),
      async () => {
        calls++;
        return { result: 'Tamamlandı' };
      },
    );
    live.save({ key: 'synthetic-'.repeat(4), enabled: true, freeProject: true });
    await live.start();
    assert.equal(config.tools[0].functionDeclarations[0].name, 'computer_action');
    const call = { id: 'one', name: 'computer_action', args: { request: 'Dosya oluştur' } };
    callbacks.onmessage({ toolCall: { functionCalls: [call, call] } });
    await new Promise((r) => setImmediate(r));
    assert.equal(calls, 1);
    assert.equal(replies[0].functionResponses[0].response.result, 'Tamamlandı');
    live.execute = (_r, signal) =>
      new Promise((r) => {
        finish = r;
        signal.addEventListener('abort', () => r({ error: 'iptal' }));
      });
    callbacks.onmessage({ toolCall: { functionCalls: [{ ...call, id: 'two' }] } });
    callbacks.onmessage({ toolCallCancellation: { ids: ['two'] } });
    finish({ result: 'geç' });
    await new Promise((r) => setImmediate(r));
    assert.equal(replies.length, 1);
  } finally {
    live?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Abort during dispatch prevents a late computer action', async () => {
  const a = agent(),
    controller = new AbortController();
  let sent = false;
  a.send = async () => {
    sent = true;
  };
  await assert.rejects(
    runComputerTask({
      agent: a,
      request: 'x',
      transcript: 'x',
      signal: controller.signal,
      onStart: () => controller.abort(),
    }),
    /iptal/,
  );
  assert.equal(sent, false);
  assert.equal(a.listenerCount('event'), 0);
});
