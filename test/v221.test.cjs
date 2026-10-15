const test = require('node:test'),
  assert = require('node:assert/strict');
const { usageSnapshot } = require('../app/usage/codex-usage.cjs');
const window = (usedPercent, windowDurationMins) => ({
  usedPercent,
  windowDurationMins,
  resetsAt: 2000000000,
});
test('Codex core bucket, actual durations and remaining percentages are used', () => {
  const v = usageSnapshot({
    rateLimits: { primary: window(99, 300) },
    rateLimitsByLimitId: {
      other: { primary: window(100, 300) },
      codex: {
        primary: window(35, 10080),
        secondary: window(1, 300),
        credits: { hasCredits: true, unlimited: false, balance: '144.63398' },
      },
    },
  });
  assert.equal(v.fiveHour.remaining, 99);
  assert.equal(v.weekly.remaining, 65);
  assert.equal(v.credits, '144,63');
  assert.equal(v.blocked, false);
});
test('Unknown limits and credits remain unknown; exhausted windows and server limit states block', () => {
  let v = usageSnapshot({ rateLimits: { primary: window(25, 15), credits: null } });
  assert.equal(v.fiveHour, null);
  assert.equal(v.weekly, null);
  assert.equal(v.credits, null);
  assert.equal(v.blocked, null);
  v = usageSnapshot({
    rateLimits: {
      primary: window(100, 300),
      secondary: window(1, 10080),
      credits: { hasCredits: false, unlimited: false, balance: null },
    },
  });
  assert.equal(v.blocked, true);
  assert.equal(v.credits, '0');
  assert.equal(
    usageSnapshot({ rateLimits: { rateLimitReachedType: 'rate_limit_reached' } }).blocked,
    true,
  );
  assert.equal(
    usageSnapshot({ rateLimitsByLimitId: { other: { primary: window(100, 300) } } }).blocked,
    null,
  );
  assert.equal(
    usageSnapshot({ rateLimits: { credits: { hasCredits: true, unlimited: false, balance: '' } } })
      .credits,
    null,
  );
});
test('Reset is confirmed by fresh positive windows, not by reset time alone', () => {
  const v = usageSnapshot({
    rateLimits: { primary: { ...window(100, 300), resetsAt: 1 }, secondary: window(5, 10080) },
  });
  assert(v.blocked);
  assert.equal(
    usageSnapshot({ rateLimits: { primary: window(0, 300), secondary: window(5, 10080) } }).blocked,
    false,
  );
  assert.equal(usageSnapshot({ rateLimits: { primary: window(0, 300) } }).blocked, null);
});
