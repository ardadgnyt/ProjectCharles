const test = require('node:test');
const assert = require('node:assert/strict');
const { QuickShareNames } = require('../app/files/quickshare-names.cjs');
const { MultiDropEngine } = require('../app/files/quickshare-multidrop.cjs');

test('a hidden announcement retains an observed phone name without borrowing another device name', () => {
  let now = 0;
  const names = new QuickShareNames(() => now);
  const phone = { endpointId: 'ABCD', host: '192.0.2.7', name: 'hidden device ABCD', deviceType: 'phone' };
  assert.equal(names.resolve(phone).name, 'Android cihazı');
  names.rememberAddress(phone.host, 'Galaxy S24+');
  assert.equal(names.resolve(phone).name, 'Galaxy S24+');
  assert.equal(names.resolve({ ...phone, endpointId: 'EFGH', host: '192.0.2.8' }).name, 'Android cihazı');
  now = 121000;
  assert.equal(names.resolve(phone).name, 'Galaxy S24+');
  assert.equal(names.resolve({ ...phone, endpointId: 'NEW1' }).name, 'Android cihazı', 'expired IP observation must not name a new endpoint');
  assert.equal(names.resolve({ ...phone, name: 'Pixel 9' }).name, 'Pixel 9', 'fresh explicit name replaces the old name');
});

test('technical placeholders and raw addresses are never shown as a device name', () => {
  const names = new QuickShareNames();
  for (const name of ['hidden device Z5WG', 'Quick Share (Z5WG)', '192.0.2.8', '']) {
    assert.equal(names.resolve({ name, deviceType: 'phone' }).name, 'Android cihazı');
  }
});

test('successful receiving refreshes the listed hidden peer using the actual sender name', () => {
  const engine = new MultiDropEngine();
  const peer = { id: 'qs:TEST', endpointId: 'TEST', host: '192.0.2.7', name: 'hidden device TEST', deviceType: 'phone' };
  engine.message({ event: 'peers', value: [peer] });
  assert.equal(engine.peers[0].name, 'Android cihazı');
  engine.message({ event: 'received', id: 'receive-test', peerAddress: peer.host, peerName: 'Galaxy S24+', files: [] });
  assert.equal(engine.peers[0].name, 'Galaxy S24+');
  engine.message({ event: 'peers', value: [{ ...peer, name: 'Quick Share (TEST)' }] });
  assert.equal(engine.peers[0].name, 'Galaxy S24+');
});
