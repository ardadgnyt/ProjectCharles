// v0.9.6: EVREN daily token quota for the island gauges.
//
// EVREN is an OpenAI-compatible HTTP API: GET /v1/quota answers with a JSON body and repeats
// the remaining tokens in the x-evren-daily-remaining-tokens header. The body's exact shape is
// not fixed, so this parser reads defensively - it recognises what it can (remaining/used/limit
// tokens, a percentage, a reset time) and never invents a number it did not see.
//
// Result (same shape as the other providers):
//   fiveHour  - the daily token window ("Günlük token" on the gauges), weekly - null (no
//               weekly window exists), labels name the window, note / unavailable carry the
//               absolute token count when no percentage can be counted from the answer.
const number = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text);
  // "12.345" / "1.234.567" / "1,234,567" - thousands separators, not decimals
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text)) return Number(text.replace(/[.,]/g, ''));
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return null;
};

// Field names the answer may use, most specific first. Looked up case-insensitively anywhere
// in the body (top level and the usual nesting one or two levels down).
const REMAINING_TOKENS = [
  'daily_remaining_tokens', 'dailyremainingtokens', 'remaining_tokens', 'remainingtokens',
  'tokens_remaining', 'tokensremaining', 'tokens_left', 'tokensleft', 'remaining_quota',
  'remaining', 'left',
];
const LIMIT_TOKENS = [
  'daily_limit_tokens', 'dailylimittokens', 'limit_tokens', 'limittokens', 'token_limit',
  'tokenlimit', 'daily_limit', 'dailylimit', 'daily_quota', 'quota_limit', 'total_tokens',
  'totaltokens', 'limit',
];
const USED_TOKENS = ['used_tokens', 'usedtokens', 'tokens_used', 'tokensused', 'consumed_tokens', 'used'];
const REMAINING_PCT = [
  'remaining_percent', 'remainingpercent', 'percent_remaining', 'percentremaining',
  'remaining_percentage', 'remaining_pct', 'remaining_ratio',
];
const USED_PCT = ['used_percent', 'usedpercent', 'percent_used', 'percentused', 'utilization', 'usage_percent'];
const FRACTION = ['remaining_fraction', 'remainingfraction', 'fraction_remaining', 'fraction'];
const RESET_AT = [
  'resets_at', 'resetsat', 'reset_at', 'resetat', 'reset_time', 'resettime', 'reset_date',
  'resetdate', 'next_reset', 'nextreset', 'daily_reset', 'dailyreset', 'expires_at', 'expiresat',
  'quota_reset', 'reset',
];
const RESET_IN = ['resets_in', 'resetsin', 'retry_after', 'retryafter', 'seconds_until_reset'];

/** Every scalar near the top of the body, keyed by its lowercase name. */
function collect(body) {
  const out = new Map();
  const walk = (value, depth) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return;
    for (const [key, v] of Object.entries(value)) {
      const name = key.toLowerCase();
      if (out.has(name)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) out.set(name, v);
      else if (typeof v === 'string' && v.trim()) out.set(name, v.trim());
      else if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(body, 0);
  return out;
}

function pick(fields, names) {
  for (const name of names) {
    if (!fields.has(name)) continue;
    const value = number(fields.get(name));
    if (value !== null) return value;
  }
  return null;
}

function pickTime(fields, names, now) {
  for (const name of names) {
    if (!fields.has(name)) continue;
    const raw = fields.get(name);
    const value = number(raw);
    if (value !== null) {
      // epoch seconds or milliseconds; a small number is not a timestamp
      if (value > 1e12) return Math.round(value / 1000);
      if (value > 1e9) return Math.round(value);
    }
    const parsed = Date.parse(String(raw));
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

function pickDelay(fields, names, now) {
  for (const name of names) {
    const value = number(fields.get(name));
    if (value !== null && value >= 0 && value < 1e7) return Math.floor(now / 1000 + value);
  }
  return null;
}

const clampPct = (x) => Math.max(0, Math.min(100, Math.round(x * 10) / 10));

/**
 * One quota answer. `headers` may be a Headers object or a plain object.
 * Never throws: an unreadable answer becomes `unavailable`, not an error.
 */
function evrenQuota({ headers = null, body = null, now = Date.now() } = {}) {
  const base = {
    provider: 'evren',
    fiveHour: null,
    weekly: null,
    credits: null,
    blocked: null,
    updatedAt: now,
    // EVREN has one window: the daily token quota. The weekly gauge stays hidden.
    labels: { fiveHour: 'Günlük token' },
    missingWindows: ['weekly'],
  };
  const header = (name) => {
    try {
      return headers && (typeof headers.get === 'function' ? headers.get(name) : headers[name]);
    } catch {
      return null;
    }
  };
  const fields = collect(body);
  const put = (name, value) => {
    if (value !== null && value !== undefined && !fields.has(name)) fields.set(name, value);
  };
  put('daily_remaining_tokens', header('x-evren-daily-remaining-tokens'));
  put('daily_limit_tokens', header('x-evren-daily-limit-tokens') || header('x-evren-daily-limit'));
  put('remaining_percent', header('x-evren-daily-remaining-percent'));
  put('resets_at', header('x-evren-daily-resets-at') || header('x-evren-daily-reset'));

  const remaining = pick(fields, REMAINING_TOKENS);
  const limit = pick(fields, LIMIT_TOKENS);
  const used = pick(fields, USED_TOKENS);
  const fraction = pick(fields, FRACTION);
  let percent = pick(fields, REMAINING_PCT);
  if (percent === null && fraction !== null) percent = fraction <= 1 ? fraction * 100 : fraction;
  if (percent === null && limit > 0 && remaining !== null) percent = (remaining / limit) * 100;
  if (percent === null && limit > 0 && used !== null) percent = 100 - (used / limit) * 100;
  const usedPct = pick(fields, USED_PCT);
  if (percent === null && usedPct !== null) percent = 100 - usedPct;
  if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
    if (percent > 100) percent = 100;
    else percent = null; // a used-percentage over 100 is not a remaining value
  }

  const resetsAt =
    pickTime(fields, RESET_AT, now) ?? pickDelay(fields, RESET_IN, now);

  if (percent !== null) {
    const left = clampPct(percent);
    base.fiveHour = { remaining: left, resetsAt };
    base.blocked = left === 0;
    if (remaining !== null || limit !== null)
      base.note = 'Kalan günlük token: ' + (remaining ?? Math.round((left / 100) * (limit || 0)));
  } else if (remaining !== null) {
    // absolute count only: no percentage to draw, the count is the answer
    base.blocked = remaining <= 0;
    base.unavailable = 'Kalan günlük token: ' + Math.max(0, Math.round(remaining));
    base.credits = String(Math.max(0, Math.round(remaining)));
    base.note = base.unavailable;
  } else {
    base.unavailable = 'Kota bilgisi okunamadı';
  }
  return base;
}

module.exports = { evrenQuota, number: number };