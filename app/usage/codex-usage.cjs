// Converts Codex rate-limit responses into island gauge values.
function usageSnapshot(response) {
  const bucket =
    response?.rateLimitsByLimitId?.codex ||
    (response?.rateLimits?.limitId == null || response?.rateLimits?.limitId === 'codex'
      ? response?.rateLimits
      : null);
  const windows = [bucket?.primary, bucket?.secondary].filter(Boolean);
  const windowFor = (minutes) => {
    const w = windows.find((w) => w.windowDurationMins === minutes);
    return w && Number.isFinite(w.usedPercent)
      ? {
          remaining: Math.max(0, Math.min(100, 100 - w.usedPercent)),
          resetsAt: Number.isFinite(w.resetsAt) ? w.resetsAt : null,
        }
      : null;
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
  const blocked =
    bucket?.rateLimitReachedType || fiveHour?.remaining === 0 || weekly?.remaining === 0
      ? true
      : fiveHour && weekly
        ? false
        : null;
  return { fiveHour, weekly, credits, blocked, updatedAt: Date.now() };
}
module.exports = { usageSnapshot };
