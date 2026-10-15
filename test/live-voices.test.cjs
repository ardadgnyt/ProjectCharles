const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { GeminiLive } = require('../app/voice/gemini-live.cjs');
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
};
test('Live voice persists without replacing the key and is sent in session setup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-voice-choice-'));
  try {
    let config;
    let a = new GeminiLive(dir, encryption, () => {});
    a.save({ key: 'synthetic-key-'.repeat(3), enabled: true, freeProject: true, voice: 'Kore' });
    const saved = a.data.secret;
    a = new GeminiLive(
      dir,
      encryption,
      () => {},
      () => ({
        live: {
          connect: async (c) => {
            config = c.config;
            return { close() {} };
          },
        },
      }),
    );
    assert.equal(a.status().voice, 'Kore');
    a.save({ enabled: true, freeProject: true, voice: 'Puck' });
    assert.equal(a.data.secret, saved);
    await a.start();
    assert.equal(config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck');
    a.stop();
    assert.throws(() => a.save({ enabled: true, freeProject: true, voice: 'unknown' }), /geçerli/);
    assert.equal(a.status().voice, 'Puck');
    a.save({ enabled: true, freeProject: true, voice: '' });
    await a.start();
    assert.equal(config.speechConfig, undefined);
    a.stop();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Older Live preferences preserve provider default and allow selecting a voice before login', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-voice-choice-'));
  try {
    const a = new GeminiLive(dir, encryption, () => {});
    assert.equal(a.status().voice, '');
    a.save({ enabled: false, freeProject: false, voice: 'Aoede' });
    assert.equal(new GeminiLive(dir, encryption, () => {}).status().voice, 'Aoede');
    assert.equal(a.status().configured, false);
    a.data.voice = { bad: true };
    assert.equal(a.status().voice, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
