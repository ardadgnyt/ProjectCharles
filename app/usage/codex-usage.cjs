// Converts Codex rate-limit responses into island gauge values.
function usageSnapshot(response, now = Date.now()) {
  const bucket =
    response?.rateLimitsByLimitId?.codex ||
    (response?.rateLimits?.limitId == null || response?.rateLimits?.limitId === 'codex'
      ? response?.rateLimits
      : null);
  const windows = [bucket?.primary, bucket?.secondary].filter(Boolean);
  const windowFor = (minutes) => {
    const w = windows.find((w) => w.windowDurationMins === minutes);
    if (!w || !Number.isFinite(w.usedPercent)) return null;
    return {
      remaining: Math.max(0, Math.min(100, 100 - w.usedPercent)),
      resetsAt: Number.isFinite(w.resetsAt) ? w.resetsAt : null,
    };
  };
  const c = bucket?.credits;
  let credits = null;
  if (c?.unlimited) credits = 'Sınırsız';
  else if (
    c &&
    c.balance !== null &&
    c.balance !== undefined &&
    String(c.balance).trim() !== '' &&
    Number.isFinite(Number(c.balance))
  )
    credits = Number(c.balance).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  else if (c?.hasCredits === false) credits = '0';
  const fiveHour = windowFor(300),
    weekly = windowFor(10080);
  // v0.9.1: with credits left Codex keeps answering after a window runs out: not blocked
  const paid = credits === 'Sınırsız' || (credits !== null && Number(c?.balance) > 0);
  const blocked = bucket?.rateLimitReachedType
    ? true
    : paid
      ? false
      : fiveHour?.remaining === 0 || weekly?.remaining === 0
        ? true
        : fiveHour && weekly
          ? false
          : null;
  return { fiveHour, weekly, credits, paid, blocked, updatedAt: now };
}
module.exports = { usageSnapshot };
