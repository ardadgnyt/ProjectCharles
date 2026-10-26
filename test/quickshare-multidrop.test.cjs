'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { MultiDropEngine } = require('../app/files/quickshare-multidrop.cjs');
const { QuickShareEngine } = require('../app/files/quickshare.cjs');
const { ShareService } = require('../app/files/share.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-multidrop-'));
  const engine = new MultiDropEngine({ deviceName: 'Charles test', downloadDir: path.join(dir, 'in'),
    logFile: path.join(dir, 'quickshare.log'), identityFile: path.join(dir, 'identity.json'),
    port: 0, bind: '127.0.0.1', discovery: false });
  return { dir, engine };
}

function event(emitter, name, ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { emitter.off(name, done); reject(Error('Missing event ' + name)); }, ms);
    function done(value) { clearTimeout(timer); resolve(value); }
    emitter.once(name, done);
  });
}

test('bundled MultiDrop receives four consecutive transfers with fresh consent and one listener', { timeout: 60000 }, async () => {
  const { dir, engine } = fixture();
  const service = new ShareService({ userData: path.join(dir, 'settings'), quickShareEngine: engine });
  const sender = new QuickShareEngine({ deviceName: 'Independent JS sender', discovery: false });
  let offers = 0;
  service.ad.start = async () => {};
  service.ad.refreshNetwork = async () => {};
  service.ad.scan = () => {};
  service.ad.announce = () => {};
  service.on('offer', offer => { offers++; service.respondOffer(offer.id, true); });
  const failures = [];
  engine.on('transfer-error', error => failures.push(error));
  try {
    await service.start();
    const port = engine.port, pid = engine.health.pid, endpoint = engine.endpointId;
    for (let i = 0; i < 4; i++) {
      const file = path.join(dir, `source-${i}.txt`);
      const body = Buffer.from('Transfer ' + i + '\n' + 'abc'.repeat(50000));
      fs.writeFileSync(file, body);
      const received = event(service, 'received');
      await sender.sendFiles({ host: '127.0.0.1', port, files: [file] });
      const entry = await received;
      assert.deepEqual(fs.readFileSync(entry.files[0].path), body);
      assert.equal(service.transfer.status, 'done');
      assert.equal(engine.port, port);
      assert.equal(engine.health.pid, pid);
      assert.equal(engine.endpointId, endpoint);
      assert.equal(service.state().offer, null);
    }
    assert.equal(offers, 4);
    assert.equal(failures.length, 0, JSON.stringify(failures));
    assert.equal(service.history.length, 4);
    // No renderer, panel or Slime event is required to keep the receiver alive.
    await service.maintainReceiving();
    assert.equal(engine.port, port);
    assert.equal(engine.health.pid, pid);
    await service.setReceiving(false);
    assert.equal(engine.health.listening, false);
    await service.maintainReceiving();
    assert.equal(engine.receiveMode, 'off');
    assert.equal(engine.health.listening, false);
    await service.setReceiving(true);
    assert.equal(engine.health.listening, true);
    assert.equal(engine.endpointId, endpoint);
    assert.equal(engine.health.pid, pid);
  } finally {
    service.stop();
    await engine.stop();
    sender.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bundled MultiDrop sends back-to-back files and propagates rejection', { timeout: 60000 }, async () => {
  const { dir, engine } = fixture();
  const receiver = new QuickShareEngine({ downloadDir: path.join(dir, 'other'), discovery: false });
  let accept = true;
  receiver.on('offer', offer => offer.respond(accept));
  try {
    await engine.start();
    await receiver.start();
    for (let i = 0; i < 3; i++) {
      const file = path.join(dir, `send-${i}.txt`);
      fs.writeFileSync(file, 'Payload ' + i);
      const received = event(receiver, 'received');
      const result = await engine.sendFiles({ host: '127.0.0.1', port: receiver.port, files: [file] });
      const rec = await received;
      assert.equal(fs.readFileSync(rec.files[0].path, 'utf8'), 'Payload ' + i);
      assert.equal(result.files.length, 1);
    }
    accept = false;
    const file = path.join(dir, 'send-0.txt');
    await assert.rejects(engine.sendFiles({ host: '127.0.0.1', port: receiver.port, files: [file] }), /reject/i);
    accept = true;
    await engine.sendFiles({ host: '127.0.0.1', port: receiver.port, files: [file] });
  } finally {
    receiver.stop();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('receive Off remains Off across startup/resume and identity persists across restart', { timeout: 30000 }, async () => {
  const { dir, engine } = fixture();
  try {
    engine.setReceiveMode('off');
    await Promise.all([engine.start(), engine.start(), engine.start()]);
    const id = engine.endpointId;
    assert.equal(engine.health.listening, false);
    await engine.refreshNetwork({ force: true });
    assert.equal(engine.health.listening, false);
    await engine.setReceiving(true);
    assert.equal(engine.health.listening, true);
    const off = engine.setReceiving(false);
    await engine.refreshNetwork();
    await off;
    assert.equal(engine.health.listening, false);
    await engine.stop();
    await engine.start();
    assert.equal(engine.endpointId, id);
    assert.equal(engine.health.listening, false);
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cancelled consent is cleared and a subsequent transfer succeeds', { timeout: 30000 }, async () => {
  const { dir, engine } = fixture();
  const sender = new QuickShareEngine({ discovery: false });
  try {
    await engine.start();
    const file = path.join(dir, 'photo.txt');
    fs.writeFileSync(file, 'Hello');
    const offered = event(engine, 'offer');
    const ac = new AbortController();
    const attempt = sender.sendFiles({ host: '127.0.0.1', port: engine.port, files: [file], signal: ac.signal });
    const failure = assert.rejects(attempt);
    const offer = await offered;
    const closed = event(engine, 'offer-closed');
    ac.abort();
    await failure;
    assert.equal((await closed).id, offer.id);
    assert.equal(engine.offers.size, 0);
    engine.on('offer', next => next.respond(true));
    const received = event(engine, 'received');
    await sender.sendFiles({ host: '127.0.0.1', port: engine.port, files: [file] });
    await received;
  } finally {
    sender.stop();
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('worker exit and parent EOF close the listener; restart retains Off', { timeout: 30000 }, async () => {
  const { dir, engine } = fixture();
  const errors = [];
  engine.on('transfer-error', value => errors.push(value));
  try {
    await engine.start();
    const child = engine.child;
    const exit = once(child, 'exit');
    child.stdin.end();
    await exit;
    assert.equal(engine.health.listening, false);
    assert.equal(engine.child, null);
    await engine.start();
    assert.equal(engine.health.listening, true);
    await engine.setReceiving(false);
    const crashed = once(engine.child, 'exit');
    engine.child.kill();
    await crashed;
    await engine.start();
    assert.equal(engine.receiveMode, 'off');
    assert.equal(engine.health.listening, false);
  } finally {
    await engine.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
