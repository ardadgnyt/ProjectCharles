'use strict';
// GitHub Copilot remaining usage / quota reader for the island gauges.
//
// Reads quota data only when genuinely exposed by an official source:
//   1. Authenticated GitHub Copilot entitlement/quota payload (quota_snapshots, limited_user_quotas /
//      monthly_quotas, or rate-limit headers) when a token or fetcher is available.
//   2. Copilot CLI ACP session metadata (--acp initialize / session/new) or CLI usage output.
//
// Upstream note: Copilot CLI v1.0.109 (--acp) exposes the signed-in account's availableModels and
// each model's premium request multiplier (_meta.copilotUsage, e.g. "1x"), not the account's
// remaining monthly premium request count. When only model multipliers or an unlimited/enterprise
// plan without numeric quota fields are returned, this module never fabricates 0, 100, or an
// estimate — it reports `unavailable` honestly in Turkish.
const fs = require('node:fs');
const path = require('node:path');
const { KITS, copilotAcpSession } = require('../ai/cli-kits.cjs');

const COPILOT_USER_URL = 'https://api.github.com/copilot_internal/user';
const CACHE_TTL_MS = 60 * 1000;

const PLAN_LABELS = {
  free: 'Free',
  individual: 'Pro',
  individual_pro: 'Pro',
  pro: 'Pro',
  pro_plus: 'Pro+',
  business: 'Business',
  enterprise: 'Enterprise',
};

function toFiniteNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const clean = v.trim().replace(/%$/, '');
    if (/^-?\d+(?:\.\d+)?$/.test(clean)) {
      const n = Number(clean);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function parseResetTimestamp(raw, now = Date.now()) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1e12) return Math.floor(raw / 1000);
    if (raw > 1e9) return Math.floor(raw);
    if (raw > 0 && raw < 1e7) return Math.floor(now / 1000 + raw);
    return null;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return parseResetTimestamp(Number(s), now);
    const parsed = Date.parse(s);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

/**
 * Parses one quota bucket object (e.g. quota_snapshots.premium_interactions or chat).
 * Returns { remaining, resetsAt, unlimited, overagePermitted, rawRemaining, rawLimit } or null.
 * Never fabricates numbers when fields are missing.
 */
function parseQuotaBucket(bucket, defaultResetAt = null, now = Date.now()) {
  if (!bucket || typeof bucket !== 'object') return null;
  const unlimited = bucket.unlimited === true;
  const overagePermitted = bucket.overage_permitted === true || bucket.overagePermitted === true;
  const resetsAt =
    parseResetTimestamp(
      bucket.reset_date ??
        bucket.resetDate ??
        bucket.resets_at ??
        bucket.resetsAt ??
        bucket.reset_time ??
        bucket.resetTime,
      now,
    ) ?? defaultResetAt;

  const pctRem = toFiniteNumber(
    bucket.percent_remaining ??
      bucket.percentRemaining ??
      bucket.remaining_percent ??
      bucket.remainingPercent,
  );
  const pctUsed = toFiniteNumber(
    bucket.percent_used ??
      bucket.percentUsed ??
      bucket.used_percent ??
      bucket.usedPercent ??
      bucket.utilization,
  );
  const fraction = toFiniteNumber(bucket.remaining_fraction ?? bucket.remainingFraction);
  const rem = toFiniteNumber(bucket.remaining ?? bucket.left ?? bucket.quota_remaining);
  const limit = toFiniteNumber(
    bucket.entitlement ?? bucket.limit ?? bucket.total ?? bucket.monthly_limit ?? bucket.quota_limit,
  );
  const used = toFiniteNumber(bucket.used ?? bucket.consumed ?? bucket.quota_used);

  let pct = null;
  if (pctRem !== null && pctRem >= 0 && pctRem <= 100) {
    pct = pctRem;
  } else if (fraction !== null && fraction >= 0 && fraction <= 1) {
    pct = fraction * 100;
  } else if (limit !== null && limit > 0 && rem !== null && rem >= 0) {
    pct = (Math.min(limit, rem) / limit) * 100;
  } else if (limit !== null && limit > 0 && used !== null && used >= 0) {
    pct = ((limit - Math.min(limit, used)) / limit) * 100;
  } else if (pctUsed !== null && pctUsed >= 0 && pctUsed <= 100) {
    pct = 100 - pctUsed;
  }

  if (pct === null) {
    if (unlimited) return { unlimited: true, remaining: null, resetsAt, overagePermitted };
    if (rem !== null && rem >= 0) {
      return {
        unlimited: false,
        remaining: null,
        rawRemaining: Math.round(rem),
        rawLimit: limit !== null && limit > 0 ? Math.round(limit) : null,
        resetsAt,
        overagePermitted,
      };
    }
    return null;
  }

  return {
    unlimited: false,
    remaining: clampPct(pct),
    rawRemaining: rem !== null && rem >= 0 ? Math.round(rem) : null,
    rawLimit: limit !== null && limit > 0 ? Math.round(limit) : null,
    resetsAt,
    overagePermitted,
  };
}

function parseTextQuota(text, now = Date.now()) {
  const clean = String(text || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').trim();
  if (!clean) return null;
  // Explicit pattern: "Premium requests: 180 / 300 remaining" or "Premium requests remaining: 75%"
  const ratioMatch = /premium\s+(?:requests?|interactions?)[^\n\d]{0,30}(\d+)\s*\/\s*(\d+)\s*(remaining|left|used)?/i.exec(clean);
  if (ratioMatch) {
    const a = Number(ratioMatch[1]);
    const b = Number(ratioMatch[2]);
    const mode = (ratioMatch[3] || 'remaining').toLowerCase();
    if (b > 0 && a >= 0 && a <= b) {
      const rem = mode === 'used' ? b - a : a;
      return {
        fiveHour: { remaining: clampPct((rem / b) * 100), resetsAt: null },
        rawRemaining: rem,
        rawLimit: b,
      };
    }
  }
  const pctMatch = /premium\s+(?:requests?|interactions?)\s+(?:remaining|left)\s*[:|-]?\s*(\d+(?:\.\d+)?)%/i.exec(clean);
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    if (pct >= 0 && pct <= 100) {
      return {
        fiveHour: { remaining: clampPct(pct), resetsAt: null },
      };
    }
  }
  return null;
}

/**
 * Pure parser: converts a Copilot quota payload (JSON object, string, or ACP session result)
 * into Charles's island usage format. Never fabricates quota numbers when absent.
 */
function parseCopilotUsage(input, { now = Date.now() } = {}) {
  const base = {
    provider: 'copilot',
    fiveHour: null,
    weekly: null,
    credits: null,
    plan: null,
    blocked: null,
    labels: { fiveHour: 'Premium', weekly: 'Sohbet' },
    missingWindows: [],
    updatedAt: now,
  };

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{')) {
      try {
        return parseCopilotUsage(JSON.parse(trimmed), { now });
      } catch {}
    }
    const fromText = parseTextQuota(trimmed, now);
    if (fromText?.fiveHour) {
      base.fiveHour = fromText.fiveHour;
      base.missingWindows = ['weekly'];
      base.blocked = fromText.fiveHour.remaining === 0;
      if (fromText.rawRemaining !== undefined && fromText.rawLimit !== undefined) {
        base.note = `Kalan premium istek: ${fromText.rawRemaining} / ${fromText.rawLimit}`;
      }
      return base;
    }
    return { ...base, unavailable: 'Kota bilgisi okunamadı' };
  }

  if (!input || typeof input !== 'object') {
    return { ...base, unavailable: 'Kota bilgisi okunamadı' };
  }

  const data = input.quota_snapshots || input.limited_user_quotas || input.copilot_plan
    ? input
    : input.quota && typeof input.quota === 'object'
      ? input.quota
      : input.usage && typeof input.usage === 'object'
        ? input.usage
        : input.session && typeof input.session === 'object'
          ? input.session
          : input;

  const rawPlan = String(
    data.copilot_plan || data.copilotPlan || data.plan || data.sku || data.access_type_sku || '',
  )
    .trim()
    .toLowerCase();
  if (rawPlan) {
    base.plan = PLAN_LABELS[rawPlan] || rawPlan.replace(/_/g, ' ');
  }

  const defaultReset = parseResetTimestamp(
    data.quota_reset_date_utc ??
      data.quota_reset_date ??
      data.quotaResetDate ??
      data.limited_user_reset_date ??
      data.reset_date ??
      data.resets_at,
    now,
  );

  const snapshots = data.quota_snapshots || data.quotaSnapshots || null;
  let primaryBucket = null;
  let secondaryBucket = null;
  let primaryLabel = 'Premium';
  let secondaryLabel = 'Sohbet';

  if (snapshots && typeof snapshots === 'object') {
    primaryBucket = parseQuotaBucket(
      snapshots.premium_interactions || snapshots.premium_requests || snapshots.premiumInteractions || snapshots.premium,
      defaultReset,
      now,
    );
    secondaryBucket = parseQuotaBucket(
      snapshots.chat || snapshots.completions,
      defaultReset,
      now,
    );
    if (!primaryBucket && secondaryBucket) {
      primaryBucket = secondaryBucket;
      primaryLabel = snapshots.chat ? 'Sohbet' : 'Tamamlama';
      secondaryBucket = snapshots.chat && snapshots.completions
        ? parseQuotaBucket(snapshots.completions, defaultReset, now)
        : null;
      secondaryLabel = 'Tamamlama';
    }
  } else if (
    data.limited_user_quotas &&
    typeof data.limited_user_quotas === 'object' &&
    data.monthly_quotas &&
    typeof data.monthly_quotas === 'object'
  ) {
    // Copilot Free tier: limited_user_quotas holds remaining counts, monthly_quotas holds total limits
    const remChat = toFiniteNumber(data.limited_user_quotas.chat);
    const limChat = toFiniteNumber(data.monthly_quotas.chat);
    const remComp = toFiniteNumber(data.limited_user_quotas.completions);
    const limComp = toFiniteNumber(data.monthly_quotas.completions);
    if (remChat !== null && limChat !== null && limChat > 0) {
      primaryBucket = parseQuotaBucket({ remaining: remChat, limit: limChat }, defaultReset, now);
      primaryLabel = 'Sohbet';
    }
    if (remComp !== null && limComp !== null && limComp > 0) {
      secondaryBucket = parseQuotaBucket({ remaining: remComp, limit: limComp }, defaultReset, now);
      secondaryLabel = 'Tamamlama';
    }
  } else {
    // Direct / flat fields if provided
    const directPremium = data.premium_interactions || data.premium_requests || data.premiumRequests || data.fiveHour;
    const directChat = data.chat || data.weekly || data.monthly;
    if (directPremium && typeof directPremium === 'object') {
      primaryBucket = parseQuotaBucket(directPremium, defaultReset, now);
    } else if (
      data.remaining !== undefined ||
      data.percent_remaining !== undefined ||
      data.percentRemaining !== undefined
    ) {
      primaryBucket = parseQuotaBucket(data, defaultReset, now);
    }
    if (directChat && typeof directChat === 'object') {
      secondaryBucket = parseQuotaBucket(directChat, defaultReset, now);
    }
  }

  const finitePrimary = primaryBucket && typeof primaryBucket.remaining === 'number' ? primaryBucket : null;
  const finiteSecondary = secondaryBucket && typeof secondaryBucket.remaining === 'number' ? secondaryBucket : null;

  if (finitePrimary && finiteSecondary) {
    base.fiveHour = { remaining: finitePrimary.remaining, resetsAt: finitePrimary.resetsAt };
    base.weekly = { remaining: finiteSecondary.remaining, resetsAt: finiteSecondary.resetsAt };
    base.labels = { fiveHour: primaryLabel, weekly: secondaryLabel };
    base.missingWindows = [];
    const pBlocked = finitePrimary.remaining === 0 && !finitePrimary.overagePermitted;
    const sBlocked = finiteSecondary.remaining === 0 && !finiteSecondary.overagePermitted;
    base.blocked = pBlocked || sBlocked;
  } else if (finitePrimary || finiteSecondary) {
    const single = finitePrimary || finiteSecondary;
    const label = finitePrimary ? primaryLabel : secondaryLabel;
    base.fiveHour = { remaining: single.remaining, resetsAt: single.resetsAt };
    base.weekly = null;
    base.labels = { fiveHour: label };
    base.missingWindows = ['weekly'];
    base.blocked = single.remaining === 0 && !single.overagePermitted;
  } else if (primaryBucket?.rawRemaining !== undefined && primaryBucket?.rawRemaining !== null) {
    base.missingWindows = ['weekly'];
    base.blocked = primaryBucket.rawRemaining <= 0 && !primaryBucket.overagePermitted;
    base.credits = String(primaryBucket.rawRemaining);
    base.unavailable = `Kalan premium istek: ${primaryBucket.rawRemaining}`;
    base.note = base.unavailable;
    return base;
  } else if (primaryBucket?.unlimited || secondaryBucket?.unlimited) {
    base.unavailable = 'Bu plan için kota sınırı paylaşılmıyor';
    base.note = 'GitHub Copilot planında sınırlı kota penceresi bildirilmedi.';
    return base;
  } else if (/^(business|enterprise)$/i.test(rawPlan)) {
    base.unavailable = 'Bu abonelik planı için kota verisi paylaşılmıyor';
    return base;
  } else {
    // Check if this is an ACP session result that only lists models + multipliers
    const models = data?.models?.availableModels;
    if (Array.isArray(models)) {
      base.unavailable = 'Copilot CLI kalan kota verisi paylaşmıyor';
      return base;
    }
    base.unavailable = 'Kota bilgisi okunamadı';
    return base;
  }

  const noteParts = [];
  if (finitePrimary?.rawRemaining !== null && finitePrimary?.rawRemaining !== undefined) {
    noteParts.push(
      finitePrimary.rawLimit
        ? `Kalan ${primaryLabel.toLowerCase()}: ${finitePrimary.rawRemaining} / ${finitePrimary.rawLimit}`
        : `Kalan ${primaryLabel.toLowerCase()}: ${finitePrimary.rawRemaining}`,
    );
  }
  if (noteParts.length) base.note = noteParts.join(' · ');
  return base;
}

function readEnvToken(env = process.env) {
  for (const key of ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']) {
    const val = env?.[key];
    if (typeof val === 'string' && val.trim().length > 10) return val.trim();
  }
  return null;
}

class CopilotUsage {
  constructor({
    cacheFile = null,
    fetcher = typeof fetch === 'function' ? fetch : null,
    acpProbe = copilotAcpSession,
    findCli = (env) => KITS.copilot.find(env),
    env = process.env,
    now = Date.now,
    log = () => {},
  } = {}) {
    this.cacheFile = cacheFile;
    this.fetch = fetcher;
    this.acpProbe = acpProbe;
    this.findCli = findCli;
    this.env = env;
    this.now = now;
    this.log = log;
    this.cache = null;
    this.pending = null;
    this.good = null;
    this.backoffUntil = 0;
    this.seq = 0;
    try {
      if (cacheFile && fs.existsSync(cacheFile)) {
        const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (saved && (saved.fiveHour || saved.weekly)) this.good = saved;
      }
    } catch {}
  }

  unavailable(message) {
    return {
      provider: 'copilot',
      fiveHour: null,
      weekly: null,
      credits: null,
      blocked: null,
      unavailable: message,
      updatedAt: this.now(),
    };
  }

  remember(value) {
    if (!value || value.unavailable || (!value.fiveHour && !value.weekly)) return;
    this.good = value;
    if (!this.cacheFile) return;
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify(value));
    } catch {}
  }

  /**
   * Returns a stale copy of the last valid measurement, preserving its true `updatedAt`
   * timestamp and dropping any window whose reset time has already passed.
   */
  staleCopy(reason = 'Son bilinen değer') {
    if (!this.good) return null;
    const nowSec = this.now() / 1000;
    const fresh = (w) => (w && (!w.resetsAt || w.resetsAt > nowSec) ? w : null);
    const fiveHour = fresh(this.good.fiveHour);
    const weekly = fresh(this.good.weekly);
    if (!fiveHour && !weekly) return null;
    return {
      ...this.good,
      fiveHour,
      weekly,
      stale: true,
      staleReason: reason,
      // Preserve the real timestamp when the measurement was actually taken!
      updatedAt: this.good.updatedAt || this.now(),
    };
  }

  invalidate() {
    this.cache = null;
    this.backoffUntil = 0;
  }

  async read(force = false, { signedIn = true, spec = null, cwd = process.cwd(), token = null } = {}) {
    if (this.pending) return this.pending;
    if (!force && this.cache && this.now() - (this.cache.checkedAt || this.cache.updatedAt || 0) < CACHE_TTL_MS) {
      return this.cache;
    }
    if (this.now() < this.backoffUntil) {
      return this.staleCopy('Çok fazla istek yapıldı · birazdan yenilenecek') ||
        this.unavailable('Çok fazla istek yapıldı · birazdan yenilenecek');
    }

    const reqSeq = ++this.seq;
    this.pending = this.load({ signedIn, spec, cwd, token })
      .then((value) => {
        // Never overwrite newer cached data with an older delayed response
        if (reqSeq < this.seq && this.cache) return this.cache;
        const checkedAt = this.now();
        if (!value.unavailable && (value.fiveHour || value.weekly)) {
          const stamped = { ...value, checkedAt };
          this.remember(stamped);
          this.cache = stamped;
          return stamped;
        }
        // Keep last good measurement marked stale on transient errors (not when signed out)
        const authFailure = /oturumu açık değil|giriş yapılmadı|bulunamadı/i.test(String(value.unavailable || ''));
        if (this.good && !authFailure) {
          const old = this.staleCopy(value.unavailable);
          if (old) {
            this.cache = { ...old, checkedAt };
            return this.cache;
          }
        }
        this.cache = { ...value, checkedAt };
        return this.cache;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  async load({ signedIn = true, spec = null, cwd = process.cwd(), token = null } = {}) {
    const authToken = token || readEnvToken(this.env);
    if (authToken && this.fetch) {
      try {
        const res = await this.fetch(COPILOT_USER_URL, {
          headers: {
            Authorization: 'Bearer ' + authToken,
            Accept: 'application/json',
            'User-Agent': 'ProjectCharles',
          },
          signal: AbortSignal.timeout(12000),
        });
        this.log('copilot usage http status', res.status);
        if (res.status === 401 || res.status === 403) {
          return this.unavailable('GitHub Copilot oturumu açık değil veya süresi dolmuş');
        }
        if (res.status === 429) {
          const wait = Number(res.headers?.get?.('retry-after')) || 300;
          this.backoffUntil = this.now() + Math.min(3600, Math.max(60, wait)) * 1000;
          return this.unavailable('Çok fazla istek yapıldı · birazdan yenilenecek');
        }
        if (!res.ok) {
          return this.unavailable('GitHub Copilot kotası okunamadı');
        }
        const body = await res.json();
        return parseCopilotUsage(body, { now: this.now() });
      } catch (err) {
        this.log('copilot usage http error', err?.name || 'Error');
        return this.unavailable('Bağlantı kurulamadı · kota okunamadı');
      }
    }

    const found = spec && spec.exe ? spec : this.findCli ? this.findCli(this.env) : null;
    if (!found || !found.exe) {
      return this.unavailable('GitHub Copilot aracı bulunamadı');
    }
    if (signedIn === false) {
      return this.unavailable('GitHub Copilot’a giriş yapılmadı');
    }

    if (!this.acpProbe) {
      return this.unavailable('Copilot CLI kalan kota verisi paylaşmıyor');
    }

    try {
      const acp = await this.acpProbe(found.exe, found.args || [], {
        cwd,
        env: KITS.copilot.env(this.env),
        timeoutMs: 15000,
      });
      if (!acp || !acp.ok) {
        if (acp?.reason === 'login') {
          return this.unavailable('GitHub Copilot oturumu açık değil veya süresi dolmuş');
        }
        if (acp?.reason === 'timeout') {
          return this.unavailable('Bağlantı zaman aşımına uğradı · kota okunamadı');
        }
        if (acp?.reason === 'missing') {
          return this.unavailable('GitHub Copilot aracı bulunamadı');
        }
        return this.unavailable('GitHub Copilot kotası okunamadı');
      }
      return parseCopilotUsage(acp.session || acp.init || {}, { now: this.now() });
    } catch {
      return this.unavailable('GitHub Copilot kotası okunamadı');
    }
  }
}

let defaultReader = null;
async function copilotUsage(options = {}) {
  const {
    force = false,
    cacheFile = null,
    fetcher,
    acpProbe,
    findCli,
    env,
    now,
    log,
    signedIn = true,
    spec = null,
    cwd = process.cwd(),
    token = null,
  } = options;
  if (fetcher || acpProbe || findCli || env || now || cacheFile) {
    const reader = new CopilotUsage({ cacheFile, fetcher, acpProbe, findCli, env, now, log });
    return reader.read(force, { signedIn, spec, cwd, token });
  }
  if (!defaultReader) defaultReader = new CopilotUsage();
  return defaultReader.read(force, { signedIn, spec, cwd, token });
}

module.exports = {
  CopilotUsage,
  copilotUsage,
  parseCopilotUsage,
  parseQuotaBucket,
  COPILOT_USER_URL,
};
