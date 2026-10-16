// Claude subscription quota for the island gauges.
//
// Claude Code keeps its claude.ai OAuth session in <CLAUDE_CONFIG_DIR>/.credentials.json.
// Charles points CLAUDE_CONFIG_DIR at <userData>/providers/claude (see ai/providers.cjs),
// so the same session that answers Claude chats can read the plan's usage windows from
// the endpoint Claude Code's own /usage screen uses. The token never leaves this process.
const fs = require('node:fs');
const path = require('node:path');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';
const PLAN_NAMES = { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise' };

function readCredentials(configDir) {
  try {
    const raw = fs.readFileSync(path.join(configDir, '.credentials.json'), 'utf8');
    const oauth = JSON.parse(raw.replace(/^﻿/, ''))?.claudeAiOauth;
    if (!oauth || typeof oauth.accessToken !== 'string' || !oauth.accessToken) return null;
    return {
      accessToken: oauth.accessToken,
      expiresAt: Number(oauth.expiresAt) || 0,
      plan: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
    };
  } catch {
    return null;
  }
}

// Converts one usage window ({ utilization: percent used, resets_at }) into the island format.
function usageWindow(value) {
  if (!value || typeof value !== 'object') return null;
  const used = Number(value.utilization);
  if (!Number.isFinite(used)) return null;
  const reset =
    typeof value.resets_at === 'number' ? value.resets_at * 1000 : Date.parse(value.resets_at);
  return {
    remaining: Math.max(0, Math.min(100, Math.round((100 - used) * 10) / 10)),
    resetsAt: Number.isFinite(reset) ? Math.floor(reset / 1000) : null,
  };
}

function claudeUsage(body, plan = null) {
  const fiveHour = usageWindow(body?.five_hour);
  const weekly = usageWindow(body?.seven_day);
  const result = {
    provider: 'claude',
    fiveHour,
    weekly,
    credits: null,
    plan: PLAN_NAMES[plan] || (plan ? String(plan) : null),
    blocked: null,
    updatedAt: Date.now(),
  };
  const extra = body?.extra_usage;
  if (extra?.is_enabled && Number.isFinite(Number(extra.utilization)))
    result.credits = 'Ek kullanım %' + Math.max(0, Math.round(100 - Number(extra.utilization)));
  if (fiveHour || weekly)
    result.blocked = fiveHour?.remaining === 0 || weekly?.remaining === 0 ? true : false;
  else result.unavailable = 'Kota bilgisi okunamadı';
  return result;
}

class ClaudeUsage {
  // refreshSession: optional async callback that lets the Claude CLI renew an expired token.
  // cacheFile: where the last good reading is kept, so a restart shows numbers immediately.
  // log: optional diagnostic logger (status codes only, never tokens).
  constructor(
    configDir,
    {
      fetcher = fetch,
      refreshSession = null,
      now = Date.now,
      cacheFile = null,
      log = () => {},
    } = {},
  ) {
    this.configDir = configDir;
    this.fetch = fetcher;
    this.refreshSession = refreshSession;
    this.now = now;
    this.cacheFile = cacheFile;
    this.log = log;
    this.cache = null;
    this.pending = null;
    this.good = null;
    try {
      if (cacheFile) this.good = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch {}
  }
  unavailable(message) {
    return {
      provider: 'claude',
      fiveHour: null,
      weekly: null,
      credits: null,
      blocked: null,
      unavailable: message,
      updatedAt: this.now(),
    };
  }
  remember(value) {
    this.good = value;
    if (!this.cacheFile) return;
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(value));
    } catch {}
  }
  /**
   * v0.7.3: the last good reading, without the windows that have reset since. Old numbers
   * whose reset time has passed (e.g. "5% left · resets now") are wrong, not just old.
   */
  staleCopy(reason = 'Oturum yenilenince görünecek') {
    if (!this.good) return null;
    const now = this.now() / 1000;
    const fresh = (w) => (w && (!w.resetsAt || w.resetsAt > now) ? w : null);
    const fiveHour = fresh(this.good.fiveHour);
    const weekly = fresh(this.good.weekly);
    if (!fiveHour && !weekly) return null;
    return { ...this.good, fiveHour, weekly, stale: true, staleReason: reason, updatedAt: this.now() };
  }
  /** Forget the cached reading (after a Claude chat the CLI has a fresh session). */
  invalidate() {
    this.cache = null;
    this.backoffUntil = 0;
  }
  async read(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.cache && this.now() - this.cache.updatedAt < 60000) return this.cache;
    // After a "too many requests" answer, wait before asking again.
    if (this.now() < (this.backoffUntil || 0))
      return this.staleCopy('Birazdan yenilenecek') || this.unavailable('Birazdan yenilenecek');
    this.pending = this.load()
      .then((value) => {
        if (!value.unavailable) {
          this.remember(value);
          return value;
        }
        // Keep the last good numbers through temporary failures (network, rate limit,
        // a session the CLI has not renewed yet) instead of blanking the gauges.
        if (this.good && value.unavailable !== 'Claude hesabı bağlı değil') {
          const old = this.staleCopy(value.unavailable);
          if (old) return (this.cache = old);
        }
        return value;
      })
      .finally(() => (this.pending = null));
    return this.pending;
  }
  async load(retry = true) {
    let credentials = readCredentials(this.configDir);
    if (credentials && credentials.expiresAt && credentials.expiresAt < this.now() + 60000) {
      this.log('claude token expiring; asking CLI to renew');
      await this.refreshSession?.().catch(() => {});
      credentials = readCredentials(this.configDir);
    }
    if (!credentials) return (this.cache = this.unavailable('Claude hesabı bağlı değil'));
    if (credentials.expiresAt && credentials.expiresAt < this.now())
      return (this.cache = this.unavailable('Oturum yenilenince görünecek'));
    try {
      const response = await this.fetch(USAGE_URL, {
        headers: {
          Authorization: 'Bearer ' + credentials.accessToken,
          'anthropic-beta': OAUTH_BETA,
          'User-Agent': 'ProjectCharles',
        },
        signal: AbortSignal.timeout(15000),
      });
      this.log('claude usage status', response.status);
      if (response.status === 401 || response.status === 403) {
        // the token was revoked or renewed elsewhere: let the CLI renew it and try once more
        if (retry) {
          await this.refreshSession?.().catch(() => {});
          const next = readCredentials(this.configDir);
          if (next && next.accessToken !== credentials.accessToken) return this.load(false);
        }
        return (this.cache = this.unavailable('Oturum yenilenince görünecek'));
      }
      if (response.status === 429) {
        const wait = Number(response.headers?.get?.('retry-after')) || 300;
        this.backoffUntil = this.now() + Math.min(3600, Math.max(60, wait)) * 1000;
        return (this.cache = this.unavailable('Birazdan yenilenecek'));
      }
      if (!response.ok) return (this.cache = this.unavailable('Kota yenilenemedi'));
      return (this.cache = claudeUsage(await response.json(), credentials.plan));
    } catch (error) {
      this.log('claude usage error', error?.name || 'Error', error?.cause?.code || '');
      return (this.cache = this.unavailable('Kota yenilenemedi'));
    }
  }
}

module.exports = { ClaudeUsage, claudeUsage, readCredentials, USAGE_URL };
