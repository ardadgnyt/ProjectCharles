const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { GeminiLive, connectionError } = require('../app/voice/gemini-live.cjs');
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('encrypted:' + s),
  decryptString: (b) => b.toString().slice(10),
};
function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v31-'));
}
test('Live key and free-project acknowledgement survive restart; replacement and deletion persist', () => {
  const dir = fixture();
  try {
    const a = new GeminiLive(dir, encryption, () => {});
    a.save({ key: 'a'.repeat(35), enabled: true, freeProject: true });
    const b = new GeminiLive(dir, encryption, () => {});
    assert.equal(b.status().configured, true);
    assert.equal(b.status().freeProject, true);
    b.save({ key: 'b'.repeat(35), enabled: false, freeProject: true });
    assert.equal(new GeminiLive(dir, encryption, () => {}).status().enabled, false);
    b.clear();
    assert.equal(new GeminiLive(dir, encryption, () => {}).status().configured, false);
    assert(!fs.readdirSync(dir).some((n) => n.includes('corrupt')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Early Live server rejection reports quota instead of hanging or starting microphone', async () => {
  const dir = fixture();
  try {
    let callbacks;
    const live = new GeminiLive(
      dir,
      encryption,
      () => {},
      () => ({
        live: {
          connect: (p) => {
            callbacks = p.callbacks;
            return new Promise(() => {});
          },
        },
      }),
    );
    live.save({ key: 'a'.repeat(35), enabled: true, freeProject: true });
    const start = live.start();
    callbacks.onclose({ reason: 'RESOURCE_EXHAUSTED quota', code: 1008 });
    await assert.rejects(start, /kota/i);
    assert.equal(live.connection, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Cancelling a connecting Live session closes a late SDK connection', async () => {
  const dir = fixture();
  try {
    let resolve,
      closed = 0;
    const live = new GeminiLive(
      dir,
      encryption,
      () => {},
      () => ({ live: { connect: () => new Promise((r) => (resolve = r)) } }),
    );
    live.save({ key: 'a'.repeat(35), enabled: true, freeProject: true });
    const start = live.start();
    live.stop();
    await assert.rejects(start, /iptal/);
    resolve({ close: () => closed++ });
    await new Promise((r) => setImmediate(r));
    assert.equal(closed, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Live errors redact credentials and distinguish authorization and network failures', () => {
  assert.match(connectionError({ message: '403 permission denied' }), /reddedildi/);
  assert.match(connectionError({ message: 'ENOTFOUND' }), /İnternet/);
  const key = 'a'.repeat(35);
  assert(!connectionError({ message: 'Unknown ' + key }, key).includes(key));
  assert(!connectionError({ message: 'url?key=secret' }).includes('secret'));
});
test('Unreadable Windows key is reported as unavailable rather than ready to use', () => {
  const dir = fixture();
  try {
    new GeminiLive(dir, encryption, () => {}).save({
      key: 'a'.repeat(35),
      enabled: true,
      freeProject: true,
    });
    const broken = new GeminiLive(
      dir,
      {
        ...encryption,
        decryptString() {
          throw Error('decrypt failed');
        },
      },
      () => {},
    );
    assert.equal(broken.status().enabled, false);
    assert.equal(broken.status().configured, false);
    assert.match(broken.status().error, /yeniden gir/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Opaque authorization key containing a dot is saved and passed unchanged to SDK', async () => {
  const dir = fixture();
  const fake = 'AQ.' + 'synthetic-test-only_'.repeat(3);
  try {
    let received;
    const a = new GeminiLive(
      dir,
      encryption,
      () => {},
      (key) => {
        received = key;
        return { live: { connect: async () => ({ close() {} }) } };
      },
    );
    a.save({ key: fake, enabled: true, freeProject: true });
    assert.equal(new GeminiLive(dir, encryption, () => {}).status().configured, true);
    await a.start();
    a.stop();
    assert.equal(received, fake);
    assert.throws(() =>
      a.save({ key: fake + '\nHeader: value', enabled: true, freeProject: true }),
    );
    assert(!connectionError({ message: 'rejected ' + fake }).includes(fake));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
