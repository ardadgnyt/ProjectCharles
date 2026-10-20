const test = require('node:test');
const assert = require('node:assert/strict');
const { replacementRoots } = require('../scripts/release-pack.cjs');

test('update packages replace complete roots, preserving sibling tools and documents', () => {
  assert.deepEqual(
    replacementRoots(['app', 'tools/download', 'tools/cursor', 'docs/DOWNLOAD-MODULE.md', 'licenses/download', 'package.json']),
    ['app', 'tools', 'docs', 'licenses', 'package.json'],
  );
});
