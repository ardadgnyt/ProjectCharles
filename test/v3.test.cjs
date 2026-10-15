const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { GeminiLive } = require('../app/voice/gemini-live.cjs');
const { subscriptionEnv, Providers } = require('../app/ai/providers.cjs');
const { petBounds } = require('../app/core/desktop-pet.cjs');
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('encrypted:' + s),
  decryptString: (b) => b.toString().slice(10),
};
test('Gemini Live requires explicit free-project acknowledgement, encrypts key and stops stale connections', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-live-'));
  try {
    let config,
      closed = 0,
      sent = [],
      events = [];
    const connection = {
      close() {
        closed++;
      },
      sendRealtimeInput(v) {
        sent.push(v);
      },
    };
    const live = new GeminiLive(
      dir,
      encryption,
      (e) => events.push(e),
      () => ({
        live: {
          connect: async (v) => {
            config = v;
            return connection;
          },
        },
      }),
    );
    await assert.rejects(() => live.start());
    assert.throws(() => live.save({ enabled: true, key: 'x'.repeat(35), freeProject: false }));
    assert.deepEqual(live.save({ enabled: true, key: 'x'.repeat(35), freeProject: true }), {
      configured: true,
      enabled: true,
      model: 'gemini-3.8-live',
      voice: '',
      freeProject: true,
    });
    assert(!fs.readFileSync(live.file, 'utf8').includes('x'.repeat(35)));
    await live.start('Kullanıcı Türkçe konuşur.');
    assert.equal(config.model, 'gemini-3.8-live');
    assert.match(config.config.systemInstruction, /Türkçe/);
    live.audio(new Uint8Array([0, 1, 2, 3]));
    assert.equal(sent[0].audio.mimeType, 'audio/pcm;rate=16000');
    assert.throws(() => live.audio(new Uint8Array(3)));
    config.callbacks.onmessage({ serverContent: { turnComplete: true } });
    assert.equal(events.length, 1);
    live.stop();
    config.callbacks.onmessage({ serverContent: { turnComplete: true } });
    assert.equal(events.length, 1);
    assert.equal(closed, 1);
    assert.throws(() => live.audio(new Uint8Array(2)));
    live.clear();
    assert.equal(live.status().configured, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Subscription providers exclude inherited billing credentials and expose enabled models only', () => {
  const e = subscriptionEnv(
    {
      ANTHROPIC_API_KEY: 'secret',
      GEMINI_API_KEY: 'secret',
      GOOGLE_API_KEY: 'secret',
      CLAUDE_CODE_OAUTH_TOKEN: 'secret',
      PATH: 'keep',
    },
    'C:/profile',
  );
  assert.equal(e.PATH, 'keep');
  for (const k of [
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
  ])
    assert.equal(e[k], undefined);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-provider-'));
  try {
    const p = new Providers(process.cwd(), dir);
    assert.equal(p.models().length, 0);
    p.enable('gemini', true);
    assert.equal(p.models().length, 0);
    assert.throws(() => p.enable('unknown', true));
    p.enable('gemini', false);
    assert.equal(p.models().length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Desktop pet position remains inside negative-origin and small display areas', () => {
  assert.deepEqual(
    petBounds({ x: -9999, y: 9999 }, { x: -1920, y: 0, width: 1920, height: 1080 }, 0),
    { x: -1920, y: 920, width: 160, height: 160 },
  );
  assert.throws(() => petBounds({ x: NaN, y: 0 }, { x: 0, y: 0, width: 1000, height: 800 }));
});
