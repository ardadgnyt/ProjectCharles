// Accounts (Gmail, Outlook, calendars, Drive, school mail, Home Assistant): OAuth, encrypted store, polling.
const path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto');
const { readStore, writeStore } = require('../core/store.cjs');
const OAUTH = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope:
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly',
  },
  // v0.7.1 SpecialBeta: Google Takvim with write access (add events). Uses the same Google
  // OAuth client as the Google plugin; only the calendar permission is asked.
  gcal: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/calendar.events',
  },
  microsoft: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access Mail.Read Calendars.Read',
  },
};
function serverURL(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || !['https:', 'http:'].includes(u.protocol))
    throw Error('Invalid server URL');
  if (
    u.protocol === 'http:' &&
    !/^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/.test(
      u.hostname,
    )
  )
    throw Error('Remote servers require HTTPS');
  return u.href.replace(/\/$/, '');
}
function important(item, rules) {
  if (item.important) return true;
  const text = (item.title + ' ' + (item.from || '')).toLocaleLowerCase('tr-TR');
  return String(rules || '')
    .split(',')
    .map((s) => s.trim().toLocaleLowerCase('tr-TR'))
    .filter(Boolean)
    .some((s) => text.includes(s));
}
const PLUGIN_IDS = ['google', 'gcal', 'microsoft', 'home', 'school'];
const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);
function defaultServices(id) {
  if (id === 'google') return { gmail: 'unknown', calendar: 'unknown', drive: 'unknown' };
  if (id === 'gcal') return { calendarWrite: 'unknown' };
  if (id === 'microsoft') return { mail: 'unknown', calendar: 'unknown' };
  return {};
}
function parseScopes(scopeStr) {
  if (typeof scopeStr !== 'string' || !scopeStr.trim()) return null;
  return new Set(scopeStr.trim().split(/\s+/));
}
function hasGoogleServiceScope(scopes, service) {
  if (!scopes) return true;
  if (service === 'gmail')
    return (
      scopes.has('https://www.googleapis.com/auth/gmail.readonly') ||
      scopes.has('https://www.googleapis.com/auth/gmail.modify') ||
      scopes.has('https://mail.google.com/')
    );
  if (service === 'calendar')
    return (
      scopes.has('https://www.googleapis.com/auth/calendar.readonly') ||
      scopes.has('https://www.googleapis.com/auth/calendar') ||
      scopes.has('https://www.googleapis.com/auth/calendar.events')
    );
  if (service === 'drive')
    return (
      scopes.has('https://www.googleapis.com/auth/drive.readonly') ||
      scopes.has('https://www.googleapis.com/auth/drive')
    );
  return true;
}
function hasGcalWriteScope(scopes) {
  if (!scopes) return true;
  return (
    scopes.has('https://www.googleapis.com/auth/calendar.events') ||
    scopes.has('https://www.googleapis.com/auth/calendar')
  );
}
function isNetworkError(e) {
  if (!e) return false;
  if (e.status === 429 || e.status === 500 || e.status === 502 || e.status === 503 || e.status === 504)
    return true;
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  const code = e.code || e.cause?.code || '';
  if (NETWORK_CODES.has(code)) return true;
  if (!e.status) {
    const msg = String(e.message || '');
    if (
      /\b(ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|fetch failed|network error|timed out|timeout|aborted)\b/i.test(
        msg,
      )
    )
      return true;
  }
  return false;
}
function isApiDisabledError(e) {
  if (e?.status !== 403) return false;
  const reasons = Array.isArray(e.errorReasons) ? e.errorReasons : [];
  if (reasons.some((r) => /accessNotConfigured|SERVICE_DISABLED/i.test(String(r)))) return true;
  return /has not been used|is disabled|not enabled/i.test(String(e.apiMessage || ''));
}
function isScopeError(e) {
  return e?.status === 403 && !isApiDisabledError(e);
}
function isAuthError(e) {
  if (!e) return false;
  if (e.authState === 'reauth_required' || e.status === 401) return true;
  if (['invalid_grant', 'invalid_client', 'unauthorized_client', 'no_refresh_token'].includes(e.reason))
    return true;
  return /Reconnect account|authentication failed|invalid credentials|AUTH/i.test(String(e.message || ''));
}
function networkErrorMessage(e) {
  if (e?.status === 429)
    return 'Sağlayıcı şu an çok fazla istek aldığını söylüyor (429). Biraz sonra tekrar dene.';
  if (e?.status >= 500) return 'Sunucu geçici olarak yanıt vermiyor. Biraz sonra tekrar dene.';
  return 'Ağ veya zaman aşımı hatası oluştu. İnternet bağlantını kontrol edip tekrar dene.';
}
function scopeMissingMessage(id, services) {
  if (id === 'gcal') return 'Takvim yazma izni eksik. Yeniden yetkilendir.';
  const labels =
    id === 'google'
      ? { gmail: 'Gmail', calendar: 'Takvim', drive: 'Drive' }
      : { mail: 'Outlook', calendar: 'Takvim' };
  const missing = Object.entries(labels)
    .filter(([k]) => services[k] === 'missing_scope')
    .map(([, label]) => label);
  if (!missing.length) return 'Eksik hesap izni var. Yeniden yetkilendir.';
  return (
    missing.join(', ') +
    (id === 'google'
      ? ' izni eksik. Tüm servisler için yeniden yetkilendir.'
      : ' izni eksik. Yeniden yetkilendir.')
  );
}
function sanitizeMessage(text) {
  const s = String(text || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/GOCSPX-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/\{[\s\S]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, 240) || 'Bağlantı kontrol edilirken hata oluştu.';
}
class Plugins {
  constructor(dir, encryption, open, notify, fetcher = fetch) {
    this.file = path.join(dir, 'plugins.enc.json');
    this.encryption = encryption;
    this.open = open;
    this.notify = notify;
    this.fetch = fetcher;
    this.data = {
      configs: {},
      tokens: {},
      seen: {},
      rules: 'acil,urgent,sınav,exam,son tarih,deadline',
      monitor: true,
      // v0.9.25: new mail is sorted by local rules; the AI sees it only when the user turns this on
      aiTriage: false,
    };
    this.cache = {};
    this.errors = {};
    this.health = {};
    this.epoch = {};
    this.pending = new Map();
    try {
      const saved = readStore(this.file, (v) => v && typeof v.secret === 'string').value;
      if (saved)
        this.data = {
          ...this.data,
          ...JSON.parse(encryption.decryptString(Buffer.from(saved.secret, 'base64'))),
        };
    } catch {
      this.errors.storage = 'Saved credentials cannot be decrypted; reconnect.';
    }
  }
  save() {
    if (!this.encryption.isEncryptionAvailable()) throw Error('Windows encryption unavailable');
    writeStore(this.file, {
      secret: this.encryption.encryptString(JSON.stringify(this.data)).toString('base64'),
    });
  }
  detailFor(id) {
    const h = this.health?.[id];
    const isOAuth = !!OAUTH[id];
    const cfg = isOAuth ? this.oauthConfig(id) : this.data?.configs?.[id];
    const hasConfig = isOAuth
      ? Boolean(cfg?.clientId)
      : id === 'home'
        ? Boolean(cfg?.url && cfg?.token)
        : Boolean(cfg?.host && cfg?.user && cfg?.password);
    const token = isOAuth ? this.data?.tokens?.[id] : null;
    const hasToken = isOAuth ? Boolean(token) : hasConfig;
    const canCheck = hasToken;
    if (!hasConfig) {
      return {
        state: 'unconfigured',
        checkedAt: null,
        services: defaultServices(id),
        message:
          id === 'gcal'
            ? 'Önce Google hesabını bağla; Google Takvim aynı uygulama kaydını kullanır.'
            : isOAuth
              ? 'Yapılandırma yok · Önce uygulama kaydı ekle.'
              : 'Bağlı değil',
        canCheck: false,
      };
    }
    if (isOAuth && !hasToken) {
      if (h?.state === 'reauth_required') {
        return {
          state: 'reauth_required',
          checkedAt: typeof h.checkedAt === 'number' ? h.checkedAt : null,
          services: { ...defaultServices(id), ...(h.services || {}) },
          message:
            h.message ||
            'Oturumun süresi doldu ya da izin geri alındı. Yeniden yetkilendir.',
          canCheck: false,
        };
      }
      return {
        state: 'configured',
        checkedAt: null,
        services: defaultServices(id),
        message:
          id === 'google'
            ? 'Yapılandırma kayıtlı · Google ile giriş yaparak yetkilendir.'
            : id === 'gcal'
              ? 'Yapılandırma kayıtlı · Bağlanınca Google, Charles’ın takvimine etkinlik ekleyip düzenleyebilmesi için izin ister.'
              : 'Yapılandırma kayıtlı · Microsoft ile giriş yaparak yetkilendir.',
        canCheck: false,
      };
    }
    if (h) {
      return {
        state: h.state,
        checkedAt: typeof h.checkedAt === 'number' ? h.checkedAt : null,
        services: { ...defaultServices(id), ...(h.services || {}) },
        message: h.message || '',
        canCheck,
      };
    }
    if (isOAuth && token?.scope) {
      const scopes = parseScopes(token.scope);
      if (id === 'gcal' && !hasGcalWriteScope(scopes)) {
        return {
          state: 'scope_missing',
          checkedAt: null,
          services: { calendarWrite: 'missing_scope' },
          message: scopeMissingMessage('gcal', { calendarWrite: 'missing_scope' }),
          canCheck,
        };
      }
      if (id === 'google') {
        const services = {
          gmail: hasGoogleServiceScope(scopes, 'gmail') ? 'unknown' : 'missing_scope',
          calendar: hasGoogleServiceScope(scopes, 'calendar') ? 'unknown' : 'missing_scope',
          drive: hasGoogleServiceScope(scopes, 'drive') ? 'unknown' : 'missing_scope',
        };
        if (Object.values(services).includes('missing_scope')) {
          return {
            state: 'scope_missing',
            checkedAt: null,
            services,
            message: scopeMissingMessage('google', services),
            canCheck,
          };
        }
      }
    }
    return {
      state: 'connected',
      checkedAt: null,
      services: defaultServices(id),
      message: '',
      canCheck,
    };
  }
  status() {
    return {
      configs: Object.fromEntries(
        Object.entries(this.data.configs).map(([id, c]) => [
          id,
          {
            clientId: c.clientId || '',
            url: c.url || '',
            host: c.host || '',
            protocol: c.protocol || 'imap',
            port: c.port || 993,
            user: c.user || '',
            hasSecret: !!(c.secret || c.password || c.token),
          },
        ]),
      ),
      connected: Object.fromEntries(
        PLUGIN_IDS.map((id) => [
          id,
          id === 'google' || id === 'microsoft' || id === 'gcal'
            ? !!this.data.tokens[id]
            : !!this.data.configs[id]?.[id === 'home' ? 'token' : 'password'],
        ]),
      ),
      details: Object.fromEntries(PLUGIN_IDS.map((id) => [id, this.detailFor(id)])),
      monitor: this.data.monitor,
      rules: this.data.rules,
      aiTriage: this.data.aiTriage === true,
      errors: this.errors,
    };
  }
  configure(id, value) {
    if (
      !['google', 'microsoft', 'home', 'school'].includes(id) ||
      !value ||
      typeof value !== 'object'
    )
      throw Error('Invalid plugin');
    this.health = this.health || {};
    const old = this.data.configs[id] || {},
      c = {};
    if (OAUTH[id]) {
      if (
        typeof value.clientId !== 'string' ||
        !value.clientId.trim() ||
        value.clientId.length > 250
      )
        throw Error('OAuth Client ID required');
      c.clientId = value.clientId.trim();
      c.secret = String(value.secret || old.secret || '').slice(0, 4000);
      if (c.clientId !== old.clientId) {
        delete this.data.tokens[id];
        this.epoch[id] = (this.epoch[id] || 0) + 1;
        this.queues?.clear?.();
        if (id === 'google') {
          delete this.data.tokens.gcal;
          this.epoch.gcal = (this.epoch.gcal || 0) + 1;
          delete this.health.gcal;
          delete this.errors.gcal;
        }
      } else if (id === 'google' && c.secret !== old.secret) {
        this.epoch.google = (this.epoch.google || 0) + 1;
        this.epoch.gcal = (this.epoch.gcal || 0) + 1;
        delete this.health.gcal;
        delete this.errors.gcal;
      }
    } else if (id === 'home') {
      c.url = serverURL(value.url);
      c.token = String(value.token || old.token || '');
      if (!c.token || c.token.length > 10000) throw Error('Home Assistant token required');
    } else {
      if (!/^[a-zA-Z0-9.-]+$/.test(value.host || '')) throw Error('IMAP host required');
      c.host = value.host;
      c.protocol = value.protocol || old.protocol || 'imap';
      if (!['imap', 'pop3'].includes(c.protocol)) throw Error('IMAP veya POP3 seç.');
      c.port = Number(value.port) || (c.protocol === 'pop3' ? 995 : 993);
      if (c.port < 1 || c.port > 65535) throw Error('Invalid IMAP port');
      c.user = String(value.user || '').trim();
      c.password = String(value.password || old.password || '');
      if (!c.user || !c.password || c.user.length > 320 || c.password.length > 4000)
        throw Error('IMAP user and password required');
    }
    if (
      id === 'school' &&
      ['host', 'user', 'protocol'].some((k) => (old[k] || '') !== (c[k] || ''))
    )
      delete this.data.seen.school;
    this.data.configs[id] = c;
    delete this.health[id];
    delete this.errors[id];
    this.cache = {};
    this.save();
    return this.status();
  }
  settings(v) {
    this.data.monitor = v.monitor === true;
    this.data.rules = String(v.rules || '').slice(0, 2000);
    if (typeof v.aiTriage === 'boolean') this.data.aiTriage = v.aiTriage;
    this.save();
    return this.status();
  }
  disconnect(id) {
    if (!PLUGIN_IDS.includes(id)) throw Error('Invalid plugin');
    this.health = this.health || {};
    this.epoch[id] = (this.epoch[id] || 0) + 1;
    this.queues?.clear?.();
    this.pending.get(id)?.();
    delete this.data.tokens[id];
    delete this.health[id];
    delete this.errors[id];
    if (id === 'gcal') {
      this.cache = {};
      this.save();
      return this.status();
    }
    // Google Takvim uses the Google client: removing Google removes it too
    if (id === 'google') {
      this.epoch.gcal = (this.epoch.gcal || 0) + 1;
      this.pending.get('gcal')?.();
      delete this.data.tokens.gcal;
      delete this.health.gcal;
      delete this.errors.gcal;
    }
    delete this.data.configs[id];
    for (const kind of id === 'google'
      ? ['gmail', 'calendar', 'drive']
      : id === 'microsoft'
        ? ['outlook', 'outlook-calendar']
        : [id]) {
      delete this.data.seen[kind];
      delete this.data.seen[kind + '-reminders'];
    }
    this.cache = {};
    this.save();
    return this.status();
  }
  // Requests to the same service run one at a time (Gmail answers 429 to bursts of parallel
  // calls) and "too many requests" / "unavailable" answers are retried twice after a pause.
  async json(url, options = {}) {
    const host = new URL(url).host;
    this.queues = this.queues || new Map();
    const previous = this.queues.get(host) || Promise.resolve();
    const run = previous.catch(() => {}).then(() => this.request(url, options));
    this.queues.set(host, run);
    return run;
  }
  async request(url, options) {
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetch(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if ((r.status === 429 || r.status === 503) && attempt < 2) {
        const wait = Math.min(8, Number(r.headers?.get?.('retry-after')) || 1 + attempt * 2);
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        continue;
      }
      if (!r.ok) {
        // v0.9.9: OAuth token endpoints answer 400 with a reason ("invalid_grant": the sign-in
        // expired or was revoked; "invalid_client": the client secret is wrong or was replaced).
        // The reason is kept so the caller can say what to do instead of a bare "HTTP 400".
        let reason = '',
          errorReasons = [],
          apiMessage = '';
        try {
          const body = await r.json();
          reason = typeof body?.error === 'string' ? body.error : String(body?.error?.status || '');
          if (typeof body?.error === 'string') errorReasons.push(body.error);
          if (typeof body?.error?.status === 'string') errorReasons.push(body.error.status);
          for (const item of body?.error?.errors || [])
            if (typeof item?.reason === 'string') errorReasons.push(item.reason);
          for (const item of body?.error?.details || [])
            if (typeof item?.reason === 'string') errorReasons.push(item.reason);
          if (typeof body?.error?.message === 'string') apiMessage = body.error.message.slice(0, 200);
        } catch {}
        const error = Error(
          r.status === 401
            ? 'Bağlantı reddedildi (401). Token veya hesap oturumunu yenile.'
            : r.status === 403
              ? 'Erişim reddedildi (403). Hesap/cihaz izinlerini kontrol et.'
              : r.status === 429
                ? 'E-posta sağlayıcısı şu an çok fazla istek aldığını söylüyor (429). Biraz sonra tekrar dene.'
                : 'Bağlantı başarısız (HTTP ' +
                  r.status +
                  (reason ? ' · ' + reason.slice(0, 60) : '') +
                  '). Sunucu adresini ve kurulumu kontrol et.',
        );
        error.status = r.status;
        error.reason = reason;
        error.errorReasons = errorReasons;
        error.apiMessage = apiMessage;
        throw error;
      }
      return r.json();
    }
  }
  /** OAuth client settings; Google Takvim shares the Google plugin's client. */
  oauthConfig(id) {
    return this.data.configs[id] || (id === 'gcal' ? this.data.configs.google : undefined);
  }
  async login(id) {
    if (!OAUTH[id]) throw Error('Invalid OAuth provider');
    if (this.pending.has(id)) throw Error('Login already open');
    const c = this.oauthConfig(id);
    if (!c?.clientId)
      throw Error(
        id === 'gcal'
          ? 'Önce yukarıdaki Google eklentisini “Charles ile kur” ile kur; Google Takvim aynı uygulama kaydını kullanır.'
          : 'Save OAuth Client ID first',
      );
    const epoch = this.epoch[id] || 0,
      state = crypto.randomBytes(24).toString('hex'),
      verifier = crypto.randomBytes(32).toString('base64url'),
      redirect = 'http://127.0.0.1:42813/callback',
      config = OAUTH[id];
    return new Promise((resolve, reject) => {
      let timer,
        finished = false;
      const finish = (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        server.close();
        this.pending.delete(id);
        err ? reject(err) : resolve(this.status());
      };
      const server = http.createServer(async (req, res) => {
        const u = new URL(req.url, redirect);
        if (u.pathname !== '/callback' || u.searchParams.get('state') !== state) {
          res.writeHead(400);
          res.end('Invalid callback');
          return;
        }
        if (!u.searchParams.get('code')) {
          res.end('Login cancelled. Return to Charles.');
          finish(Error('Login cancelled'));
          return;
        }
        try {
          const params = {
            client_id: c.clientId,
            code: u.searchParams.get('code'),
            grant_type: 'authorization_code',
            redirect_uri: redirect,
            code_verifier: verifier,
            ...(c.secret ? { client_secret: c.secret } : {}),
          };
          const token = await this.json(config.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params),
          }).catch((e) => {
            throw this.oauthFailure(id, e, epoch);
          });
          if (epoch !== (this.epoch[id] || 0)) throw Error('Login cancelled');
          if (typeof token.access_token !== 'string' || !token.access_token)
            throw Error('No access token returned');
          this.health = this.health || {};
          this.epoch[id] = (this.epoch[id] || 0) + 1;
          this.data.tokens[id] = {
            ...token,
            expires: Date.now() + (token.expires_in || 3600) * 1000,
          };
          delete this.health[id];
          delete this.errors[id];
          this.save();
          res.end('Connected. You can close this page and return to Charles.');
          finish();
        } catch (e) {
          res.end('Connection failed. Return to Charles.');
          finish(e);
        }
      });
      this.pending.set(id, () => finish(Error('Login cancelled')));
      server.once('error', () => finish(Error('Login callback port 42813 is unavailable.')));
      server.listen(42813, '127.0.0.1', () => {
        const url = new URL(config.authorize);
        url.search = new URLSearchParams({
          client_id: c.clientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: config.scope,
          state,
          code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
          code_challenge_method: 'S256',
          ...(id === 'google' || id === 'gcal' ? { access_type: 'offline', prompt: 'consent' } : {}),
        }).toString();
        void this.open(url.href).catch(finish);
      });
      timer = setTimeout(() => finish(Error('Login timed out')), 180000);
    });
  }
  async token(id, { forceRefresh = false } = {}) {
    let t = this.data.tokens[id];
    if (!t) throw Error('Hesap bağlı değil. Ayarlar’daki Eklentiler sayfasında ilgili hesabı bağla.');
    if (!forceRefresh && t.expires > Date.now() + 60000) return t.access_token;
    const c = this.oauthConfig(id),
      epoch = this.epoch[id] || 0;
    if (!t.refresh_token) {
      const err = Error('Reconnect account');
      err.authState = 'reauth_required';
      err.reason = 'no_refresh_token';
      throw err;
    }
    let next;
    try {
      next = await this.json(OAUTH[id].token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.clientId,
          grant_type: 'refresh_token',
          refresh_token: t.refresh_token,
          ...(c.secret ? { client_secret: c.secret } : {}),
        }),
      });
    } catch (e) {
      throw this.oauthFailure(id, e, epoch);
    }
    if (epoch !== (this.epoch[id] || 0)) throw Error('Account disconnected');
    if (typeof next.access_token !== 'string' || !next.access_token) {
      const err = Error('Reconnect account');
      err.authState = 'reauth_required';
      err.reason = 'invalid_grant';
      throw err;
    }
    t = this.data.tokens[id] = {
      ...t,
      ...next,
      refresh_token: next.refresh_token || t.refresh_token,
      scope: next.scope || t.scope,
      expires: Date.now() + (next.expires_in || 3600) * 1000,
    };
    this.save();
    return t.access_token;
  }
  /**
   * v0.9.9: what a failed token request means for the user. A Google project left in "Testing"
   * gives sign-ins that end after 7 days ("invalid_grant"); Google also no longer shows a client
   * secret again, so a lost or replaced one ends in "invalid_client". The dead sign-in is removed
   * so the card no longer claims "✓ bağlı".
   */
  oauthFailure(id, e, epoch = this.epoch[id] || 0) {
    const name = id === 'microsoft' ? 'Microsoft' : 'Google';
    if (!['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(e?.reason) && e?.status !== 401)
      return e;
    const isClientError = ['invalid_client', 'unauthorized_client'].includes(e?.reason);
    const message = !isClientError
      ? name +
        ' oturumunun süresi doldu ya da izin geri alındı. Ayarlar’daki Eklentiler sayfasında Yeniden yetkilendir’e bas. (Google projesi “Testing / Test” durumundaysa oturum 7 günde bir sona erer; Charles ile kur’un son adımı bunu kalıcı yapmayı anlatıyor.)'
      : name +
        ' istemci kimliği veya gizli anahtarı artık geçerli değil. Charles ile kur’dan yeni bir gizli anahtar (Add secret) oluşturup kimlikle birlikte yapıştır.';
    if (epoch === (this.epoch[id] || 0)) {
      this.health = this.health || {};
      const prevCheckedAt = this.health[id]?.checkedAt ?? null;
      delete this.data.tokens[id];
      this.errors[id] = message;
      this.health[id] = {
        state: 'reauth_required',
        checkedAt: prevCheckedAt,
        services: defaultServices(id),
        message,
      };
      this.save();
    }
    const err = Error(message);
    err.authState = 'reauth_required';
    err.reason = e?.reason || 'unauthorized';
    err.status = e?.status || 401;
    return err;
  }
  async verify(id) {
    if (!PLUGIN_IDS.includes(id)) throw Error('Invalid plugin');
    this.health = this.health || {};
    const epoch = this.epoch[id] || 0;
    const prevCheckedAt = this.health[id]?.checkedAt ?? null;
    const isStale = () => epoch !== (this.epoch[id] || 0);
    const commit = (entry) => {
      if (isStale()) return this.status();
      this.health[id] = entry;
      if (entry.state === 'connected') delete this.errors[id];
      else if (entry.message) this.errors[id] = entry.message;
      return this.status();
    };
    if (OAUTH[id]) {
      const cfg = this.oauthConfig(id);
      if (!cfg?.clientId) {
        if (!isStale()) delete this.health[id];
        return this.status();
      }
      if (!this.data.tokens[id]) {
        if (!isStale() && this.health[id]?.state !== 'reauth_required') delete this.health[id];
        return this.status();
      }
      let accessToken;
      let refreshed = false;
      try {
        const hadExpired = (this.data.tokens[id]?.expires || 0) <= Date.now() + 60000;
        accessToken = await this.token(id);
        refreshed = hadExpired;
      } catch (e) {
        if (isStale()) return this.status();
        if (isNetworkError(e)) {
          return commit({
            state: 'network_error',
            checkedAt: prevCheckedAt,
            services: defaultServices(id),
            message: networkErrorMessage(e),
          });
        }
        if (isAuthError(e)) {
          if (this.data.tokens[id]) this.oauthFailure(id, { status: 401, reason: e.reason || 'invalid_grant' }, epoch);
          return this.status();
        }
        return commit({
          state: 'error',
          checkedAt: prevCheckedAt,
          services: defaultServices(id),
          message: sanitizeMessage(e?.message),
        });
      }
      if (isStale()) return this.status();
      const probeSpecs =
        id === 'google'
          ? [
              ['gmail', 'Gmail', 'https://gmail.googleapis.com/gmail/v1/users/me/profile'],
              ['calendar', 'Takvim', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1'],
              ['drive', 'Drive', 'https://www.googleapis.com/drive/v3/about?fields=user'],
            ]
          : id === 'gcal'
            ? [
                [
                  'calendarWrite',
                  'Google Takvim',
                  'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=items(id)',
                ],
              ]
            : [
                ['mail', 'Outlook', 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=1&$select=id'],
                ['calendar', 'Takvim', 'https://graph.microsoft.com/v1.0/me/events?$top=1&$select=id'],
              ];
      const runProbes = async (bearer) => {
        const services = defaultServices(id);
        const disabled = [];
        const failed = [];
        let networkErr = null;
        for (const [key, label, url] of probeSpecs) {
          if (isStale()) return { stale: true };
          try {
            await this.json(url, { headers: { Authorization: 'Bearer ' + bearer } });
            services[key] = 'ok';
          } catch (e) {
            if (isStale()) return { stale: true };
            if (e?.status === 401) return { unauthorized: true, error: e };
            if (isNetworkError(e)) {
              networkErr = e;
              break;
            }
            if (isApiDisabledError(e)) {
              services[key] = 'error';
              disabled.push(label);
            } else if (isScopeError(e)) {
              services[key] = 'missing_scope';
            } else {
              services[key] = 'error';
              failed.push(label);
            }
          }
        }
        return { services, disabled, failed, networkErr };
      };
      let result = await runProbes(accessToken);
      if (result.stale || isStale()) return this.status();
      if (result.unauthorized && !refreshed && this.data.tokens[id]?.refresh_token) {
        try {
          accessToken = await this.token(id, { forceRefresh: true });
          refreshed = true;
        } catch (e) {
          if (isStale()) return this.status();
          if (isNetworkError(e)) {
            return commit({
              state: 'network_error',
              checkedAt: prevCheckedAt,
              services: defaultServices(id),
              message: networkErrorMessage(e),
            });
          }
          if (this.data.tokens[id]) this.oauthFailure(id, { status: 401, reason: e.reason || 'invalid_grant' }, epoch);
          return this.status();
        }
        if (isStale()) return this.status();
        result = await runProbes(accessToken);
        if (result.stale || isStale()) return this.status();
      }
      if (result.unauthorized) {
        this.oauthFailure(id, { status: 401, reason: 'invalid_grant' }, epoch);
        return this.status();
      }
      if (result.networkErr) {
        return commit({
          state: 'network_error',
          checkedAt: prevCheckedAt,
          services: result.services,
          message: networkErrorMessage(result.networkErr),
        });
      }
      const scopes = parseScopes(this.data.tokens[id]?.scope);
      if (id === 'gcal' && scopes && !hasGcalWriteScope(scopes) && result.services.calendarWrite === 'ok') {
        result.services.calendarWrite = 'missing_scope';
      }
      if (id === 'google' && scopes) {
        for (const key of ['gmail', 'calendar', 'drive']) {
          if (result.services[key] === 'ok' && !hasGoogleServiceScope(scopes, key))
            result.services[key] = 'missing_scope';
        }
      }
      if (Object.values(result.services).includes('missing_scope')) {
        return commit({
          state: 'scope_missing',
          checkedAt: Date.now(),
          services: result.services,
          message: scopeMissingMessage(id, result.services),
        });
      }
      if (result.disabled.length) {
        return commit({
          state: 'error',
          checkedAt: prevCheckedAt,
          services: result.services,
          message:
            result.disabled.join(', ') +
            ' API etkin değil. Google Cloud projesinde ilgili API’yi etkinleştir.',
        });
      }
      if (result.failed.length) {
        return commit({
          state: 'error',
          checkedAt: prevCheckedAt,
          services: result.services,
          message: result.failed.join(', ') + ' bağlantısında hata oluştu. Tekrar dene.',
        });
      }
      return commit({
        state: 'connected',
        checkedAt: Date.now(),
        services: result.services,
        message:
          id === 'google'
            ? 'Gmail, Takvim ve Drive doğrulandı.'
            : id === 'gcal'
              ? 'Google Takvim yazma bağlantısı doğrulandı.'
              : 'Outlook ve Takvim doğrulandı.',
      });
    }
    const cfg = this.data.configs[id];
    const hasConfig =
      id === 'home' ? Boolean(cfg?.url && cfg?.token) : Boolean(cfg?.host && cfg?.user && cfg?.password);
    if (!hasConfig) {
      if (!isStale()) delete this.health[id];
      return this.status();
    }
    try {
      const rows = await this.list(id, '');
      if (isStale()) return this.status();
      const message =
        id === 'home'
          ? 'Bağlantı başarılı · ' +
            rows.length +
            ' cihaz/varlık bulundu.' +
            (rows.length
              ? ' Örnek: ' +
                rows
                  .slice(0, 3)
                  .map((r) => r.title)
                  .join(', ')
              : '')
          : 'Bağlantı başarılı. Posta kutusu okunabiliyor.';
      return commit({
        state: 'connected',
        checkedAt: Date.now(),
        services: {},
        message,
      });
    } catch (e) {
      if (isStale()) return this.status();
      if (isNetworkError(e)) {
        return commit({
          state: 'network_error',
          checkedAt: prevCheckedAt,
          services: {},
          message: networkErrorMessage(e),
        });
      }
      if (isAuthError(e) || e?.status === 403) {
        return commit({
          state: 'reauth_required',
          checkedAt: prevCheckedAt,
          services: {},
          message:
            id === 'home'
              ? 'Home Assistant token’ı reddedildi. Yeni uzun ömürlü erişim token’ı kaydet.'
              : 'E-posta kullanıcı adı veya şifresi reddedildi. Bilgileri kontrol edip tekrar kaydet.',
        });
      }
      return commit({
        state: 'error',
        checkedAt: prevCheckedAt,
        services: {},
        message: sanitizeMessage(e?.message),
      });
    }
  }
  async get(id, url) {
    return this.json(url, { headers: { Authorization: 'Bearer ' + (await this.token(id)) } });
  }
  async list(kind, query = '') {
    query = String(query).slice(0, 300);
    let rows = [];
    if (kind === 'mail') {
      const kinds = [
        ...(this.data.tokens.google ? ['gmail'] : []),
        ...(this.data.tokens.microsoft ? ['outlook'] : []),
        ...(this.data.configs.school?.password ? ['school'] : []),
      ];
      if (!kinds.length)
        throw Error(
          'Henüz mail hesabı bağlı değil. Ayarlar’daki Eklentiler sayfasından bir hesap bağla.',
        );
      for (const source of kinds) {
        try {
          const items = await this.list(source, query);
          rows.push(
            ...items.map((r) => ({
              ...r,
              id: source + '|' + r.id,
              title: source + ' · ' + r.title,
              mailKind: source,
            })),
          );
        } catch (e) {
          rows.push({
            id: source + '|error',
            title: source + ' bağlantı hatası',
            text: e.message,
            mailError: true,
          });
        }
      }
    } else if (kind === 'gmail') {
      const list = await this.get(
        'google',
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=' +
          encodeURIComponent(query || 'in:inbox newer_than:7d'),
      );
      for (const m of list.messages || []) {
        const d = await this.get(
          'google',
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
            encodeURIComponent(m.id) +
            '?format=metadata',
        );
        const header = (n) =>
          (d.payload?.headers || []).find((h) => h.name.toLowerCase() === n)?.value || '';
        rows.push({
          id: d.id,
          title: header('subject'),
          from: header('from'),
          text: d.snippet || '',
          date: new Date(Number(d.internalDate)).toISOString(),
          important: d.labelIds?.includes('IMPORTANT'),
          unread: d.labelIds?.includes('UNREAD'),
        });
      }
    } else if (kind === 'outlook') {
      const d = await this.get(
        'microsoft',
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime%20desc&$select=id,subject,from,bodyPreview,receivedDateTime,importance,isRead',
      );
      rows = (d.value || []).map((m) => ({
        id: m.id,
        title: m.subject,
        from: m.from?.emailAddress?.address || '',
        text: m.bodyPreview,
        date: m.receivedDateTime,
        important: m.importance === 'high',
        unread: !m.isRead,
      }));
      if (query)
        rows = rows.filter((r) =>
          (r.title + ' ' + r.from + ' ' + r.text).toLowerCase().includes(query.toLowerCase()),
        );
    } else if (kind === 'calendar' || kind === 'outlook-calendar') {
      const now = new Date(),
        end = new Date(+now + 7 * 86400000);
      if (kind === 'calendar') {
        const d = await this.get(
          this.data.tokens.gcal ? 'gcal' : 'google',
          'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=' +
            encodeURIComponent(now.toISOString()) +
            '&timeMax=' +
            encodeURIComponent(end.toISOString()),
        );
        rows = (d.items || [])
          .filter((m) => m.status !== 'cancelled')
          .map((m) => ({
            id: m.id,
            title: m.summary || 'Event',
            text: m.description || '',
            date: m.start?.dateTime || m.start?.date,
            important: true,
          }));
      } else {
        const d = await this.get(
          'microsoft',
          'https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=' +
            now.toISOString() +
            '&endDateTime=' +
            end.toISOString() +
            '&$top=50&$select=id,subject,start,bodyPreview,isCancelled',
        );
        rows = (d.value || [])
          .filter((m) => !m.isCancelled)
          .map((m) => ({
            id: m.id,
            title: m.subject,
            text: m.bodyPreview,
            date: m.start?.dateTime + (m.start?.timeZone === 'UTC' ? 'Z' : ''),
            important: true,
          }));
      }
    } else if (kind === 'drive') {
      const q = query
        ? "trashed = false and (name contains '" +
          query.replace(/\\/g, '\\\\').replace(/'/g, "\\'") +
          "')"
        : 'trashed = false';
      const d = await this.get(
        'google',
        'https://www.googleapis.com/drive/v3/files?pageSize=30&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q=' +
          encodeURIComponent(q),
      );
      rows = (d.files || []).map((f) => ({
        id: f.id,
        title: f.name,
        text: f.mimeType,
        date: f.modifiedTime,
        url: f.webViewLink,
      }));
    } else if (kind === 'school') {
      rows = await this.school();
      if (query)
        rows = rows.filter((r) =>
          (r.title + ' ' + r.from).toLowerCase().includes(query.toLowerCase()),
        );
    } else if (kind === 'home') {
      const c = this.data.configs.home;
      if (!c?.token)
        throw Error(
          'Home Assistant bağlı değil. Ayarlar’daki Eklentiler sayfasında Home Assistant kartına sunucu adresini ve uzun ömürlü erişim token’ını kaydet, sonra Bağlantıyı kontrol et’e bas.',
        );
      const data = await this.json(c.url + '/api/states', {
        headers: { Authorization: 'Bearer ' + c.token },
      });
      rows = data.map((s) => ({
        id: s.entity_id,
        title: s.attributes?.friendly_name || s.entity_id,
        text: s.state,
        date: s.last_changed,
        unit: typeof s.attributes?.unit_of_measurement === 'string' ? s.attributes.unit_of_measurement : '',
        // v0.7.4: what kind of sensor it is, and a thermostat's own readings
        deviceClass: typeof s.attributes?.device_class === 'string' ? s.attributes.device_class : '',
        attrs: String(s.entity_id).startsWith('climate.')
          ? {
              current_temperature: s.attributes?.current_temperature,
              current_humidity: s.attributes?.current_humidity,
              temperature: s.attributes?.temperature,
              temperature_unit: s.attributes?.temperature_unit,
            }
          : undefined,
      }));
    } else throw Error('Unknown plugin');
    this.cache[kind] = rows;
    delete this.errors[kind];
    return rows;
  }
  // v0.7.0: keyword / date search (app/plugins/mail-search.cjs parses the request).
  // s = { keywords, since, until } with ISO dates; until is exclusive.
  async search(kind, s) {
    const { inRange, matches } = require('./mail-search.cjs');
    const keywords = String(s?.keywords || '').slice(0, 80);
    const since = s?.since ? new Date(s.since) : null,
      until = s?.until ? new Date(s.until) : null;
    const ymd = (d) => d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    let rows = [];
    if (kind === 'mail') {
      const kinds = [
        ...(this.data.tokens.google ? ['gmail'] : []),
        ...(this.data.tokens.microsoft ? ['outlook'] : []),
        ...(this.data.configs.school?.password ? ['school'] : []),
      ];
      if (!kinds.length)
        throw Error('Henüz mail hesabı bağlı değil. Ayarlar’daki Eklentiler sayfasından bir hesap bağla.');
      for (const source of kinds) {
        try {
          const items = await this.search(source, s);
          rows.push(...items.map((r) => ({ ...r, id: source + '|' + r.id, title: r.title, account: source, mailKind: source })));
        } catch (e) {
          rows.push({ id: source + '|error', title: source + ' bağlantı hatası', text: e.message, mailError: true });
        }
      }
      const errors = rows.filter((r) => r.mailError);
      rows = rows.filter((r) => !r.mailError).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
      if (!rows.length && errors.length === kinds.length) throw Error(errors.map((r) => r.text).join(' · '));
      this.cache.mail = [...(this.cache.mail || []).filter((r) => !rows.some((x) => x.id === r.id)), ...rows].slice(-200);
      return rows;
    }
    if (kind === 'gmail') {
      const q = [
        keywords.replace(/[()"]/g, ' ').trim(),
        since ? 'after:' + ymd(since) : '',
        until ? 'before:' + ymd(until) : '',
        keywords || since || until ? '' : 'in:inbox',
      ]
        .filter(Boolean)
        .join(' ');
      rows = await this.list('gmail', q);
    } else if (kind === 'outlook') {
      const select = '$select=id,subject,from,bodyPreview,receivedDateTime,importance,isRead';
      const url = keywords
        ? 'https://graph.microsoft.com/v1.0/me/messages?$top=40&' + select + '&$search=' + encodeURIComponent('"' + keywords.replace(/"/g, ' ') + '"')
        : 'https://graph.microsoft.com/v1.0/me/messages?$top=40&$orderby=receivedDateTime%20desc&' + select +
          '&$filter=' + encodeURIComponent([since ? 'receivedDateTime ge ' + since.toISOString() : '', until ? 'receivedDateTime lt ' + until.toISOString() : ''].filter(Boolean).join(' and ') || 'receivedDateTime ge 1970-01-01T00:00:00Z');
      const d = await this.get('microsoft', url);
      rows = (d.value || []).map((m) => ({
        id: m.id,
        title: m.subject,
        from: m.from?.emailAddress?.address || '',
        text: m.bodyPreview,
        date: m.receivedDateTime,
        important: m.importance === 'high',
        unread: !m.isRead,
      }));
      this.cache.outlook = [...(this.cache.outlook || []).filter((r) => !rows.some((x) => x.id === r.id)), ...rows].slice(-200);
    } else if (kind === 'school') {
      rows = await this.schoolSearch({ keywords, since, until });
    } else throw Error('Bu hesapta mail araması yapılamaz.');
    // Providers search loosely (Gmail stems, Outlook ignores dates in $search): check again here.
    return rows
      .filter((r) => inRange(r, { since: since?.toISOString(), until: until?.toISOString() }))
      .filter((r) => kind === 'gmail' || kind === 'outlook' || r.serverMatched || matches(r, keywords))
      .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  }
  async schoolSearch({ keywords, since, until }) {
    const c = this.data.configs.school;
    if (!c?.password)
      throw Error(
        'Okul e-postası bağlı değil. Ayarlar’daki Eklentiler sayfasında Okul e-postası kartına POP3/IMAP sunucusunu, e-posta adresini ve şifreni kaydet.',
      );
    // v0.9.25: the answer says how far a POP3 search looked (CH-426: an older mail got only
    // "bulamadım", with no word about the limit)
    this.searchLimit = c.protocol === 'pop3' ? 100 : 0;
    if (c.protocol === 'pop3') {
      // POP3 has no search: look through the newest 100 headers.
      this.schoolQueue = (this.schoolQueue || Promise.resolve())
        .catch(() => {})
        .then(() => require('./pop3.cjs').readPOP3(c, null, undefined, 100));
      const rows = await this.schoolQueue;
      this.cache.school = rows;
      return rows;
    }
    const { ImapFlow } = require('imapflow'),
      client = new ImapFlow({
        host: c.host,
        port: c.port,
        secure: true,
        auth: { user: c.user, pass: c.password },
        logger: false,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        tls: { rejectUnauthorized: true },
      });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      try {
        const query = {};
        if (since) query.since = since;
        if (until) query.before = until;
        if (keywords) query.or = [{ subject: keywords }, { from: keywords }, { body: keywords }];
        if (!Object.keys(query).length) query.all = true;
        const uids = ((await client.search(query, { uid: true })) || []).slice(-30);
        const rows = [];
        if (uids.length)
          for await (const m of client.fetch(uids.join(','), { envelope: true, flags: true }, { uid: true }))
            rows.push({
              id: String(client.mailbox.uidValidity) + ':' + m.uid,
              title: m.envelope.subject || '',
              from: (m.envelope.from || []).map((x) => x.address).join(', '),
              date: m.envelope.date?.toISOString(),
              text: '',
              unread: !m.flags.has('\\Seen'),
              important: m.flags.has('\\Flagged'),
            });
        this.cache.school = [...(this.cache.school || []).filter((r) => !rows.some((x) => x.id === r.id)), ...rows].slice(-200);
        // Body matches are already filtered by the server.
        return rows.map((r) => ({ ...r, serverMatched: true }));
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }
  async school(selected) {
    const c = this.data.configs.school;
    if (!c?.password)
      throw Error(
        'Okul e-postası bağlı değil. Ayarlar’daki Eklentiler sayfasında Okul e-postası kartına POP3/IMAP sunucusunu, e-posta adresini ve şifreni kaydet.',
      );
    if (c.protocol === 'pop3') {
      this.schoolQueue = (this.schoolQueue || Promise.resolve())
        .catch(() => {})
        .then(() => require('./pop3.cjs').readPOP3(c, selected));
      return this.schoolQueue;
    }
    const { ImapFlow } = require('imapflow'),
      client = new ImapFlow({
        host: c.host,
        port: c.port,
        secure: true,
        auth: { user: c.user, pass: c.password },
        logger: false,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        tls: { rejectUnauthorized: true },
      });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      try {
        if (selected) {
          const [validity, uid] = selected.split(':');
          if (String(client.mailbox.uidValidity) !== validity || !/^\d+$/.test(uid))
            throw Error('Refresh mailbox first');
          const m = await client.fetchOne(
            uid,
            { source: { start: 0, maxLength: 262144 } },
            { uid: true },
          );
          if (!m?.source) throw Error('Message unavailable');
          const parsed = await require('mailparser').simpleParser(m.source, {
            maxHtmlLengthToParse: 200000,
          });
          return String(parsed.text || '').slice(0, 30000);
        }
        const count = client.mailbox.exists;
        if (!count) return [];
        const rows = [];
        for await (const m of client.fetch(Math.max(1, count - 24) + ':' + count, {
          envelope: true,
          flags: true,
        })) {
          rows.push({
            id: String(client.mailbox.uidValidity) + ':' + m.uid,
            title: m.envelope.subject || '',
            from: (m.envelope.from || []).map((x) => x.address).join(', '),
            date: m.envelope.date?.toISOString(),
            text: '',
            unread: !m.flags.has('\\Seen'),
            important: m.flags.has('\\Flagged'),
          });
        }
        return rows.reverse();
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }
  async read(kind, id) {
    const row = this.cache[kind]?.find((r) => r.id === id);
    if (!row) throw Error('List items first');
    let text = row.text || '';
    if (kind === 'mail') {
      if (row.mailError) return row;
      const source = row.mailKind;
      const value = await this.read(source, id.slice(source.length + 1));
      return { ...value, id, title: source + ' · ' + value.title };
    }
    if (kind === 'gmail') {
      const m = await this.get(
        'google',
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
          encodeURIComponent(id) +
          '?format=full',
      );
      const parts = [];
      const walk = (p) => {
        if (p.mimeType === 'text/plain' && p.body?.data)
          parts.push(Buffer.from(p.body.data, 'base64url').toString('utf8'));
        for (const child of p.parts || []) walk(child);
      };
      walk(m.payload || {});
      text = parts.join('\n') || m.snippet || '';
    } else if (kind === 'outlook') {
      const m = await this.json(
        'https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id) + '?$select=body',
        {
          headers: {
            Authorization: 'Bearer ' + (await this.token('microsoft')),
            Prefer: 'outlook.body-content-type="text"',
          },
        },
      );
      text = m.body?.content || '';
    } else if (kind === 'school') text = await this.school(id);
    else if (kind === 'drive') {
      const type = row.text;
      if (!['text/plain', 'text/markdown', 'application/vnd.google-apps.document'].includes(type))
        throw Error(
          'This file type can be opened in Google Drive; text import supports Google Docs and text files.',
        );
      const url =
        'https://www.googleapis.com/drive/v3/files/' +
        encodeURIComponent(id) +
        (type === 'application/vnd.google-apps.document'
          ? '/export?mimeType=text/plain'
          : '?alt=media');
      const r = await this.fetch(url, {
        headers: { Authorization: 'Bearer ' + (await this.token('google')) },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw Error('Could not read file');
      const reader = r.body.getReader();
      let count = 0,
        buffers = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          count += value.length;
          if (count > 500000) throw Error('File exceeds text import limit');
          buffers.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      text = Buffer.concat(buffers).toString('utf8');
    }
    return { ...row, text: text.slice(0, 30000) };
  }
  // v0.7.1 SpecialBeta: the workspace calendar shows a whole month and can add events.
  async calendarRange(from, to) {
    const id = this.data.tokens.gcal ? 'gcal' : this.data.tokens.google ? 'google' : null;
    if (!id) return [];
    const a = new Date(from),
      b = new Date(to);
    if (Number.isNaN(+a) || Number.isNaN(+b) || b <= a || b - a > 100 * 86400000)
      throw Error('Geçersiz tarih aralığı.');
    const d = await this.get(
      id,
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=' +
        encodeURIComponent(a.toISOString()) +
        '&timeMax=' +
        encodeURIComponent(b.toISOString()),
    );
    return (d.items || [])
      .filter((m) => m.status !== 'cancelled')
      .map((m) => ({
        id: m.id,
        title: m.summary || 'Etkinlik',
        date: m.start?.dateTime || m.start?.date,
        end: m.end?.dateTime || m.end?.date,
        allDay: !m.start?.dateTime,
        description: String(m.description || '').slice(0, 2000),
        reminder: m.reminders?.useDefault === false ? (m.reminders.overrides?.[0]?.minutes ?? null) : undefined,
        kind: 'calendar',
      }));
  }
  /** The Google event body for an add or an edit (v0.7.2: end time, note, reminder). */
  eventBody(ev) {
    const title = String(ev?.title || '').trim().slice(0, 200);
    if (!title) throw Error('Etkinliğe bir ad ver.');
    const start = new Date(ev.start);
    if (Number.isNaN(+start)) throw Error('Geçerli bir başlangıç zamanı seç.');
    const allDay = !!ev.allDay;
    const day = (d) =>
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let end = ev.end ? new Date(ev.end) : null;
    if (!end || Number.isNaN(+end) || end <= start)
      end = new Date(+start + Math.max(5, Math.min(24 * 60, Number(ev.minutes) || 60)) * 60000);
    const body = allDay
      ? { summary: title, start: { date: day(start) }, end: { date: day(new Date(+start + 86400000)) } }
      : { summary: title, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } };
    if (ev.description !== undefined) body.description = String(ev.description || '').slice(0, 2000);
    if (ev.reminder !== undefined)
      body.reminders =
        ev.reminder === null || ev.reminder === ''
          ? { useDefault: true }
          : { useDefault: false, overrides: [{ method: 'popup', minutes: Math.max(0, Math.min(40320, Number(ev.reminder) || 0)) }] };
    return body;
  }
  async calendarUpdate(id, ev) {
    if (!this.data.tokens.gcal) throw Error('Etkinlik düzenlemek için Ayarlar’daki Eklentiler sayfasında Google Takvim’i bağla.');
    if (typeof id !== 'string' || !/^[\w-]{1,200}$/.test(id)) throw Error('Geçersiz etkinlik.');
    const r = await this.json('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + (await this.token('gcal')), 'Content-Type': 'application/json' },
      body: JSON.stringify(this.eventBody(ev)),
    });
    delete this.cache.calendar;
    return { id: r.id, title: r.summary };
  }
  async calendarDelete(id) {
    if (!this.data.tokens.gcal) throw Error('Etkinlik silmek için Ayarlar’daki Eklentiler sayfasında Google Takvim’i bağla.');
    if (typeof id !== 'string' || !/^[\w-]{1,200}$/.test(id)) throw Error('Geçersiz etkinlik.');
    const r = await this.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + (await this.token('gcal')) },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok && r.status !== 410 && r.status !== 404) throw Error('Etkinlik silinemedi (HTTP ' + r.status + ').');
    delete this.cache.calendar;
    return true;
  }
  /** The calendar Charles can write to, if one is connected (Outlook's connection reads only). */
  calendarWriter() {
    return this.data.tokens.gcal ? { name: 'Google Takvim', add: (ev) => this.calendarAdd(ev) } : null;
  }
  async calendarAdd(ev) {
    if (!this.data.tokens.gcal)
      throw Error('Etkinlik eklemek için Ayarlar’daki Eklentiler sayfasında Google Takvim’i bağla.');
    const body = this.eventBody(ev);
    if (typeof ev.uid === 'string' && /^[a-v0-9]{5,1024}$/.test(ev.uid)) body.id = ev.uid;
    const r = await this.json('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + (await this.token('gcal')),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch((e) => {
      // v0.9.20: Google already has this id: an answer that was lost, or the same mail twice
      if (body.id && /HTTP 409/.test(e.message)) return null;
      throw e;
    });
    delete this.cache.calendar;
    if (!r) return { id: body.id, existed: true };
    return { id: r.id, title: r.summary, date: r.start?.dateTime || r.start?.date, link: r.htmlLink || null };
  }
  async homeAction(entity, action, signal) {
    if (!/^[a-z_]+\.[a-zA-Z0-9_]+$/.test(entity)) throw Error('Invalid entity');
    const domain = entity.split('.')[0],
      allowed = {
        light: ['turn_on', 'turn_off', 'toggle'],
        switch: ['turn_on', 'turn_off', 'toggle'],
        input_boolean: ['turn_on', 'turn_off', 'toggle'],
        fan: ['turn_on', 'turn_off'],
        media_player: ['media_play', 'media_pause', 'turn_on', 'turn_off'],
        cover: ['open_cover', 'close_cover', 'stop_cover'],
        climate: ['turn_on', 'turn_off'],
        lock: ['lock', 'unlock'],
        scene: ['turn_on'],
        script: ['turn_on'],
        automation: ['turn_on', 'turn_off', 'trigger'],
      };
    if (!allowed[domain]?.includes(action)) throw Error('Unsupported device action');
    const states = await this.list('home');
    if (!states.some((s) => s.id === entity)) throw Error('Device not found');
    if (signal?.aborted) throw Error('İşlem iptal edildi.');
    const c = this.data.configs.home;
    return this.json(c.url + '/api/services/' + domain + '/' + action, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entity }),
    });
  }
  async poll() {
    if (this.polling || !this.data.monitor) return;
    this.polling = true;
    this.log?.('poll start');
    try {
      const kinds = [
        ...(this.data.tokens.google ? ['gmail'] : []),
        ...(this.data.tokens.google || this.data.tokens.gcal ? ['calendar'] : []),
        ...(this.data.tokens.microsoft ? ['outlook', 'outlook-calendar'] : []),
        ...(this.data.configs.school ? ['school'] : []),
      ];
      const fresh = [];
      for (const kind of kinds) {
        try {
          const rows = await this.list(kind),
            seen = this.data.seen[kind],
            calendar = kind.includes('calendar');
          const ids = rows.map((r) => (calendar ? r.id + ':' + r.date : r.id));
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (!seen || seen.includes(ids[i])) continue;
            this.log?.('poll new', kind, r.unread ? 'unread' : 'read');
            // New mail is collected and judged together; calendar events are shown directly.
            if (!calendar) {
              if (r.unread) fresh.push({ ...r, kind });
            } else this.notify({ kind, id: r.id, title: r.title, reason: 'Yeni takvim etkinliği' });
          }
          if (calendar && seen) {
            const reminders = this.data.seen[kind + '-reminders'] || [];
            for (const r of rows) {
              const until = Date.parse(r.date) - Date.now(),
                key = r.id + ':' + r.date;
              if (until > 0 && until <= 15 * 60000 && !reminders.includes(key)) {
                this.notify({
                  kind,
                  id: r.id,
                  title: r.title,
                  reason: '15 dakika içinde başlıyor',
                });
                reminders.push(key);
              }
            }
            this.data.seen[kind + '-reminders'] = reminders.slice(-2000);
          }
          this.data.seen[kind] = [...new Set([...(seen || []), ...ids])].slice(-2000);
        } catch (e) {
          this.errors[kind] = 'Connection failed. Check plugin settings.';
          this.log?.('poll failed', kind, String(e?.message || e).slice(0, 120));
        }
      }
      this.save();
      if (fresh.length && this.onMail) await this.onMail(fresh).catch(() => {});
    } finally {
      this.polling = false;
    }
  }
  stop() {
    for (const cancel of this.pending.values()) cancel();
  }
}
module.exports = { Plugins, OAUTH, serverURL, important };
