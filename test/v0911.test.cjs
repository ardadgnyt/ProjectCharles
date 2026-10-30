// v0.9.11 Beta: a long chat can be continued after a restart; routine "ready" updates do not wake
// a sleeping Charles.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a long chat (history JSON-quoted, formulas full of backslashes) still fits a turn', () => {
  const agent = read('app/ai/agent.cjs');
  assert.match(agent, /const MAX_TURN_TEXT = 900000;/);
  assert.doesNotMatch(agent, /prompt\.length > 100000/);
  const { contextText } = require('../app/ai/sessions.cjs');
  const events = [];
  for (let i = 0; i < 120; i++) {
    events.push({ type: 'history-user', data: 'soru ' + i });
    events.push({
      type: 'agent',
      data: { method: 'item/completed', params: { item: { type: 'agentMessage', id: 'm' + i, text: '$$\\frac{\\sqrt{a^2+b^2}}{c}$$ '.repeat(40) } } },
    });
  }
  const past = contextText(events);
  assert.ok(JSON.stringify(past).length > 100000, 'the quoted history alone was over the old limit');
  assert.ok(JSON.stringify(past).length < 900000);
  assert.match(read('app/ai/sessions.cjs'), /JSON\.stringify\(past\)\.length > budget \* 1\.25/);
});

test('a routine "ready" does not wake a sleeping Charles', () => {
  const r = read('src/renderer.ts');
  assert.match(r, /const quiet =\s*sleeping && \(name === 'idle' \|\| name === 'finished'\)/);
  assert.match(r, /if \(!quiet\) touchCharacter\(\);/);
});
