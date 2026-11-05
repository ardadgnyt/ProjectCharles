// v0.9.17: Quick Share: a stale phone address, preview windows stay off the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ShareService } = require('../app/files/share.cjs');

const fixture = (t, send, peers) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v0917-'));
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'x');
  const qs = Object.assign(new EventEmitter(), { peers, health: {}, port: 1, start: async () => {}, setReceiveMode() {}, stop() {}, stopDiscoveryWake() {}, note() {}, sendFiles: send, handleMdnsPacket() {} });
  const s = new ShareService({ userData: dir, quickShareEngine: qs });
  t.after(() => {
    s.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { s, qs, file };
};
const peer = { id: 'qs:AB12', host: '192.168.1.7', port: 53601, protocol: 'quickshare', name: 'Android cihazı' };

test('a refused phone address is looked up again and tried once', async (t) => {
  const tried = [];
  const { s, qs, file } = fixture(t, async (o) => {
    tried.push(o.port);
    if (o.port === 53601) throw Error('cannot connect to 192.168.1.7:53601: [WinError 1225]');
    return { files: [{ name: 'a.txt' }] };
  }, [peer]);
  qs.scan = async () => {
    qs.peers = [{ ...peer, port: 53777 }];
  };
  const st = await s.send({ peerId: peer.id, files: [file] });
  assert.deepEqual(tried, [53601, 53777]);
  assert.equal(st.transfer.status, 'done');
});

test('a phone that stays closed gets a clear message, not the socket error', async (t) => {
  const { s, qs, file } = fixture(t, async () => {
    throw Error('cannot connect to 192.168.1.7:53601: [WinError 1225] refused');
  }, [peer]);
  qs.scan = async () => {};
  await assert.rejects(s.send({ peerId: peer.id, files: [file] }), /Telefon bağlantıyı kabul etmedi/);
  assert.match(s.state().transfer.error, /Herkes/);
});

test('other send errors are not retried', async (t) => {
  let tries = 0;
  const { s, qs, file } = fixture(t, async () => {
    tries++;
    throw Error('receiver refused the connection');
  }, [peer]);
  qs.scan = async () => assert.fail('no scan');
  await assert.rejects(s.send({ peerId: peer.id, files: [file] }), /receiver refused/);
  assert.equal(tries, 1);
});

test('a preview window never starts the engines', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v0917-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let started = 0;
  const qs = Object.assign(new EventEmitter(), { peers: [], health: {}, start: async () => started++, setReceiveMode() {}, stop() {}, handleMdnsPacket() {} });
  const s = new ShareService({ userData: dir, quickShareEngine: qs, offline: true });
  s.ad.start = async () => started++;
  await s.start();
  assert.equal(started, 0);
  assert.equal(s.retryTimer, undefined);
  assert.match(fs.readFileSync(path.join(__dirname, '../app/main.cjs'), 'utf8'), /offline: demo,/);
});
