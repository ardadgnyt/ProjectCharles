// Parses the Antigravity /usage table into island gauge values.
function geminiUsage(text) {
  const result = {
    provider: 'gemini',
    fiveHour: null,
    weekly: null,
    credits: null,
    blocked: null,
    updatedAt: Date.now(),
  };
  for (const line of String(text)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split(/\r?\n/)) {
    const parts = line.split('\t');
    if (parts.length < 3 || !/^Gemini Models$/i.test(parts[0].trim())) continue;
    const key = /five hour/i.test(parts[1])
      ? 'fiveHour'
      : /weekly/i.test(parts[1])
        ? 'weekly'
        : null;
    const match = parts[2].trim().match(/^(\d+(?:\.\d+)?)%$/);
    if (!key || !match) continue;
    const remaining = Number(match[1]);
    if (remaining > 100) continue;
    const reset = Date.parse(parts[3]);
    result[key] = { remaining, resetsAt: Number.isFinite(reset) ? Math.floor(reset / 1000) : null };
  }
  if (result.fiveHour && result.weekly)
    result.blocked = result.fiveHour.remaining === 0 || result.weekly.remaining === 0;
  if (!result.fiveHour && !result.weekly) result.unavailable = 'Kota bilgisi okunamadı';
  return result;
}
module.exports = { geminiUsage };
