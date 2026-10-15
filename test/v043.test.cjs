const test = require('node:test'),
  assert = require('node:assert/strict');
const { geminiUsage } = require('../app/usage/gemini-usage.cjs');
test('Gemini quota uses Gemini pool only, distinguishes unknown and zero, validates reset', () => {
  const s = geminiUsage(
    'Gemini Models\tWeekly Limit Remaining\t64%\t2026-10-18T17:06:01Z\nGemini Models\tFive Hour Limit Remaining\t0%\t2026-10-13T15:09:50Z\nClaude and GPT models\tWeekly Limit Remaining\t100%\t2026-10-20T10:09:50Z',
  );
  assert.equal(s.weekly.remaining, 64);
  assert.equal(s.fiveHour.remaining, 0);
  assert.equal(s.blocked, true);
  assert.equal(s.weekly.resetsAt, Date.parse('2026-10-18T17:06:01Z') / 1000);
  assert.equal(geminiUsage('Error').blocked, null);
  assert(geminiUsage('Gemini Models\tWeekly Limit Remaining\t200%').unavailable);
  assert.equal(
    geminiUsage('Gemini Models\tWeekly Limit Remaining\t50%\tunknown').weekly.resetsAt,
    null,
  );
});
