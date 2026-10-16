// v0.7.0: Cursor quota for the island gauges.
//
// The bundled Cursor Agent CLI keeps its sign-in in %APPDATA%\Cursor\auth.json (written by
// `cursor-agent login`). With that session Charles asks Cursor's own usage service — the
// same one the CLI's usage screen uses — how much of the plan is used this billing cycle.
// Nothing is written; if the session has expired the CLI renews it on its next answer.
//
// Result (same shape as the other providers):
//   fiveHour → "Auto" share left this cycle, weekly → whole plan left this cycle,
//   both resetting at the end of the billing cycle. labels tell the island what to call them.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BASE = 'https://api2.cursor.sh';

function authFile(env = process.env) {
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Cursor', 'auth.json');
}

function readToken(file = authFile()) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof v?.accessToken === 'string' && v.accessToken.length > 20 ? v.accessToken : null;
  } catch {
    return null;
  }
}

const pct = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : null);
const left = (used) => (used === null ? null : Math.round((100 - used) * 10) / 10);

// Connect-JSON answer of aiserver.v1.DashboardService/GetCurrentPeriodUsage → gauges.
function fromPeriod(r) {
  const u = r?.planUsage;
  if (!u) return null;
  const limit = Number(u.limit) || 0;
  const total =
    pct(u.totalPercentUsed) ??
    (limit > 0 ? pct(((Number(u.includedSpend) || 0) / limit) * 100) : null);
  const auto = pct(u.autoPercentUsed);
  const end = Number(r.billingCycleEnd) || 0;
  const resetsAt = end > 0 ? Math.round(end / 1000) : null;
  if (total === null && auto === null) return null;
  return {
    fiveHour: auto === null ? null : { remaining: left(auto), resetsAt },
    weekly: total === null ? null : { remaining: left(total), resetsAt },
  };
}

async function cursorUsage({ fetcher = fetch, file, now = Date.now() } = {}) {
  const base = {
    provider: 'cursor',
    fiveHour: null,
    weekly: null,
    credits: null,
    blocked: null,
    labels: { fiveHour: 'Auto', weekly: 'Aylık' },
    updatedAt: now,
  };
  const token = readToken(file);
  if (!token) return { ...base, unavailable: 'Cursor’a giriş yapılmadı' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetcher(BASE + '/aiserver.v1.DashboardService/GetCurrentPeriodUsage', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: '{}',
      signal: ctl.signal,
    });
    if (res.status === 401 || res.status === 403)
      return { ...base, unavailable: 'Cursor oturumu yenilenmeli · bir mesaj gönder' };
    if (!res.ok) return { ...base, unavailable: 'Cursor kotası okunamadı' };
    const gauges = fromPeriod(await res.json());
    if (!gauges) return { ...base, unavailable: 'Bu plan için kota bilgisi yok' };
    // blocked stays null: Cursor may still answer with Auto after the plan share is used.
    return { ...base, ...gauges };
  } catch {
    return { ...base, unavailable: 'Cursor kotası okunamadı' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { cursorUsage, fromPeriod, readToken, authFile };
