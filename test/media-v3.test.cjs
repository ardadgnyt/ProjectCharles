const test = require('node:test');
const assert = require('node:assert/strict');
const { mediaRequest } = require('../app/system/media-request.cjs');
test('Media controls validate action-specific values before reaching PowerShell', () => {
  assert.deepEqual(mediaRequest('status'), { action: 'status' });
  assert.deepEqual(mediaRequest({ action: 'seek', position: 42, extra: 'ignored' }), {
    action: 'seek',
    position: 42,
  });
  assert.deepEqual(mediaRequest({ action: 'shuffle', enabled: false }), {
    action: 'shuffle',
    enabled: false,
  });
  for (const mode of ['None', 'List', 'Track'])
    assert.equal(mediaRequest({ action: 'repeat', mode }).mode, mode);
  for (const v of [
    { action: 'seek', position: -1 },
    { action: 'seek', position: Infinity },
    { action: 'seek', position: '42' },
    { action: 'shuffle', enabled: 'true' },
    { action: 'repeat', mode: 'all' },
    'status\nnext',
    'unknown',
    null,
  ])
    assert.throws(() => mediaRequest(v));
});
