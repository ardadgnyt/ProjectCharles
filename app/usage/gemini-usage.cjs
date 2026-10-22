// Parses the Antigravity /usage table into island gauge values.
function geminiUsage(text) {
  if (typeof text === 'object' && text) return geminiSummary(text);
  if (String(text).trim().startsWith('{')) {
    try { const json=JSON.parse(text); return json.command?.data || json.groups ? geminiSummary(json.command?.data || json) : geminiUsage(json.response || ''); } catch {}
  }
  const result = {
    provider: 'gemini',
    fiveHour: null,
    weekly: null,
    credits: null,
    blocked: null,
    updatedAt: Date.now(),
  };
  for (const line of String(text)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)) {
    const parts = line.trim().split(/\t+|\s*│\s*|\s*\|\s*| {2,}/).filter(Boolean);
    if (parts.length < 3 || !/^Gemini Models$/i.test(parts[0].trim())) continue;
    const key = /(?:five[ -]?hour|5[ -]?(?:hour|hr)|5h)\b/i.test(parts[1])
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
  const windows = [result.fiveHour, result.weekly].filter(Boolean);
  if (windows.length) result.blocked = windows.some(w => w.remaining === 0);
  result.missingWindows = !result.fiveHour && result.weekly ? ['fiveHour'] : [];
  if (result.missingWindows.length) result.note = 'Gemini bu hesap için 5 saatlik kota verisi paylaşmıyor.';
  if (!result.fiveHour && !result.weekly) result.unavailable = 'Kota bilgisi okunamadı';
  return result;
}
function geminiSummary(data) {
  const lines=[];
  for (const group of data.groups || []) {
    if (!/^Gemini Models$/i.test(group.name || group.displayName || '')) continue;
    for (const b of group.buckets || []) {
      if (b.disabled) continue;
      const window=String(b.window || b.name || b.displayName || '').toLowerCase();
      const key=/^(5h|18000s)$|five[ -]?hour|5[ -]?hour/.test(window)?'Five Hour':/weekly|7d|604800s/.test(window)?'Weekly':null;
      const fraction=b.remaining_fraction ?? b.remainingFraction;
      if (!key || typeof fraction!=='number' || !Number.isFinite(fraction) || fraction<0 || fraction>1) continue;
      lines.push(['Gemini Models',key+' Limit Remaining',String(fraction*100)+'%',b.reset_time || b.resetTime || ''].join('\t'));
    }
  }
  return {...geminiUsage(lines.join('\n')),source:'provider-quota'};
}
module.exports = { geminiUsage, geminiSummary };
