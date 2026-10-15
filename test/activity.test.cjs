const { buildSync } = require('../node_modules/esbuild');
const test = require('node:test'),
  assert = require('node:assert/strict');
const compiled = buildSync({
  entryPoints: [require('node:path').join(__dirname, '../src/chat/activity.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;
const m = { exports: {} };
new Function('module', 'exports', compiled)(m, m.exports);
const { ActivityState, toolStation } = m.exports;
test('Sustained thinking also triggers Eureka on code, and reset clears it', () => {
  const a = new ActivityState();
  a.think(100);
  a.update({ type: 'fileChange' }, 8500);
  assert.equal(a.eurekaUntil, 11100);
  a.reset();
  assert.equal(a.eurekaUntil, 0);
  a.think(100);
  a.update({ type: 'fileChange' }, 500);
  assert.equal(a.eurekaUntil, 0);
});
test('Tool stations use typed events and Eureka only fires after sustained research to code', () => {
  assert.equal(toolStation({ type: 'commandExecution', command: 'npm test' }), 'terminal');
  assert.equal(
    toolStation({ type: 'commandExecution', command: 'Get-Content lesson.pdf' }),
    'read',
  );
  assert.equal(toolStation({ type: 'imageGeneration' }), 'image');
  const a = new ActivityState();
  a.update({ type: 'webSearch' }, 100);
  a.update({ type: 'fileChange' }, 4000);
  assert.equal(a.eurekaUntil, 0);
  a.reset();
  a.update({ type: 'webSearch' }, 100);
  a.update({ type: 'fileChange' }, 9100);
  assert.equal(a.station, 'code');
  assert.equal(a.eurekaUntil, 11700);
  a.reset();
  assert.equal(a.station, 'none');
});
