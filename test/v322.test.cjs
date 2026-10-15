const test = require('node:test'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events');
const { readPOP3, POP3 } = require('../app/plugins/pop3.cjs'),
  { waitForVoiceIntent, runVoicePlugin } = require('../app/voice/live-plugins.cjs');
function fakeServer({ number = 1, top = true, auth = true } = {}) {
  const commands = [];
  let options;
  function connect(value) {
    options = value;
    const s = new EventEmitter();
    s.destroy = () => {};
    const send = (text) => {
      const b = Buffer.from(text, 'utf8');
      setImmediate(() => {
        s.emit('data', b.subarray(0, 3));
        s.emit('data', b.subarray(3));
      });
    };
    s.write = (text) => {
      const cmd = text.trim();
      commands.push(cmd);
      if (cmd.startsWith('USER ')) send('+OK user\r\n');
      else if (cmd.startsWith('PASS '))
        send(auth ? '+OK authenticated\r\n' : '-ERR secret should never appear\r\n');
      else if (cmd === 'UIDL') send('+OK ids\r\n' + number + ' stable-uid\r\n.\r\n');
      else if (cmd.startsWith('TOP '))
        send(
          top
            ? '+OK header\r\nSubject: School test\r\nFrom: Teacher <teacher@example.test>\r\nDate: Mon, 12 Oct 2026 10:00:00 +0300\r\n\r\n.\r\n'
            : '-ERR not supported\r\n',
        );
      else if (cmd.startsWith('RETR '))
        send(
          '+OK message\r\nSubject: School test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello student\r\n..dotted line\r\n.\r\n',
        );
      else if (cmd === 'QUIT') send('+OK bye\r\n');
      else throw Error('Unexpected command ' + cmd);
    };
    send('+OK POP3 ready\r\n');
    return s;
  }
  return {
    connect,
    commands,
    get options() {
      return options;
    },
  };
}
const config = {
  host: 'mail.example.test',
  port: 995,
  user: 'student@example.test',
  password: 'synthetic-pass',
};
test('POP3 TLS lists headers and retains stable UID across message renumbering; no delete command', async () => {
  const server = fakeServer();
  const rows = await readPOP3(config, null, server.connect);
  assert.equal(rows[0].id, 'pop3:stable-uid');
  assert.equal(rows[0].title, 'School test');
  assert.equal(server.options.rejectUnauthorized, true);
  assert.equal(server.options.port, 995);
  assert(!server.commands.some((c) => /^DELE|RETR/.test(c)));
  const second = fakeServer({ number: 8 });
  const text = await readPOP3(config, rows[0].id, second.connect);
  assert.match(text, /Hello student/);
  assert.match(text, /\.dotted line/);
  assert(second.commands.includes('RETR 8'));
  assert(!second.commands.some((c) => /^DELE/.test(c)));
});
test('POP3 missing TOP falls back to read-only RETR and authentication errors hide server text', async () => {
  const server = fakeServer({ top: false });
  assert.equal((await readPOP3(config, null, server.connect))[0].title, 'School test');
  assert(server.commands.includes('RETR 1'));
  await assert.rejects(
    () => readPOP3(config, null, fakeServer({ auth: false }).connect),
    (e) => /kabul edilmedi/.test(e.message) && !e.message.includes('secret'),
  );
  const client = new POP3({ ...config, password: 'x\r\nDELE 1' }, () => {
    throw Error('must not connect');
  });
  await assert.rejects(() => client.open(), /biçimi/);
});
test('Voice waits for late partial transcription and understands spoken punctuation', async () => {
  let text = '';
  const controller = new AbortController();
  setTimeout(() => {
    text = 'Home Assistant,';
  }, 30);
  setTimeout(() => {
    text = 'Home Assistant, tavan lambasını kapatır mısın?';
  }, 80);
  const transcript = await waitForVoiceIntent(() => text, controller.signal, 600);
  let called = false;
  await runVoicePlugin({
    transcript,
    access: 'full',
    plugins: {
      list: async () => [{ id: 'light.ceiling', title: 'Tavan lambası' }],
      homeAction: async () => {
        called = true;
      },
    },
  });
  assert(called);
  await assert.rejects(() => waitForVoiceIntent(() => '', undefined, 80), /tamamlanamadı/);
  controller.abort();
  await assert.rejects(() => waitForVoiceIntent(() => transcript, controller.signal), /iptal/);
});
test('Gemini tool receives current speech even when turnComplete arrives in the same event', async () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path'),
    { GeminiLive } = require('../app/voice/gemini-live.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v322-live-'));
  let live, callbacks;
  try {
    const seen = [];
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
          connect: async (v) => {
            callbacks = v.callbacks;
            return { close() {}, sendToolResponse() {} };
          },
        },
      }),
      async (_r, _s, name, context) => {
        seen.push([name, context.transcript]);
        return { result: 'ok' };
      },
    );
    live.save({ key: 'synthetic-'.repeat(4), enabled: true, freeProject: true });
    await live.start();
    callbacks.onmessage({
      serverContent: { inputTranscription: { text: 'Tavan lambasını kapat' }, turnComplete: true },
      toolCall: {
        functionCalls: [
          { id: 'one', name: 'connected_plugin', args: { request: 'Tavan lambasını kapat' } },
        ],
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(seen, [['connected_plugin', 'Tavan lambasını kapat']]);
    callbacks.onmessage({
      toolCall: {
        functionCalls: [{ id: 'two', name: 'connected_plugin', args: { request: 'previous' } }],
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(seen[1][1], '');
  } finally {
    live?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
