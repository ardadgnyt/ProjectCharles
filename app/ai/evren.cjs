// v0.9.6: EVREN - an OpenAI-compatible HTTP API (no CLI, no sign-in window). The API key is
// the only credential and it lives encrypted in %APPDATA%\Charles\evren.enc.json with Windows
// safeStorage (the same store as the Gemini Live key). Nothing personal is ever written to the
// project folder, and the key is never logged, echoed in errors or shipped in a release.
//
// API (see docs/EVREN.md in the service's own documentation):
//   GET  /v1/models                  model list (cached in providers/evren-models.json)
//   POST /v1/chat/completions        streaming answer (SSE; ":" comment lines are skipped)
//   GET  /v1/terms/status|text       usage terms gate -> POST /v1/terms/accept (else 403)
//   GET  /v1/quota                   daily token quota (+ x-evren-daily-remaining-tokens)
const fs = require('node:fs');
const path = require('node:path');
const { readStore, writeStore } = require('../core/store.cjs');

const BASE = 'https://evren-llmapi.ssyz.org.tr';
const MODEL_ID = /^[a-z0-9][a-z0-9._/:@-]{0,120}$/i;
const MAX_MODELS = 60;
const MAX_PROMPT = 60000;
const MAX_KEY = 2000;

function defaultEncryption() {
  try {
    return require('electron').safeStorage;
  } catch {
    return null;
  }
}

/** Turkish, key-free messages for the API's error answers. */
function evrenError(status, body) {
  const text = String(body || '').slice(0, 400);
  let code = '';
  let message = '';
  try {
    const parsed = JSON.parse(text);
    message = String(parsed?.error?.message || parsed?.message || '');
    code = String(parsed?.error?.code || parsed?.code || '');
  } catch {}
  if (status === 403 && /terms/i.test(code) && /terms/i.test(message))
    return Object.assign(Error('EVREN kullanım şartları kabul edilmedi. Ayarlardaki EVREN kartından şartları okuyup kabul et.'), {
      code: 'terms_not_accepted',
    });
  if (status === 401 || status === 403)
    return Error('EVREN API anahtarı geçersiz veya eksik. Ayarlar → AI Modelleri bölümünden anahtarını kontrol et.');
  if (status === 429)
    return Error('EVREN günlük kullanım hakkı dolmuş görünüyor. Bir süre sonra yeniden dene.');
  if (status >= 500) return Error('EVREN sunucusuna şu an ulaşılamıyor. Bir süre sonra yeniden dene.');
  return Error('EVREN isteği başarısız oldu' + (message ? ': ' + message.slice(0, 160) : ' (' + status + ')'));
}

class Evren {
  /**
   * @param directory %APPDATA%\Charles - the ONLY place the key and the caches are written.
   * @param encryption safeStorage-like ({isEncryptionAvailable, encryptString, decryptString});
   *   defaults to Electron's safeStorage, tests pass a fake.
   * @param fetcher fetch implementation (tests pass a fake).
   */
  constructor(directory, encryption = null, fetcher = null) {
    this.directory = directory;
    this.encryption = encryption;
    this.fetcher = fetcher;
    this.base = BASE;
    this.file = path.join(directory, 'evren.enc.json');
    this.stateFile = path.join(directory, 'providers', 'evren.json');
    this.modelsFile = path.join(directory, 'providers', 'evren-models.json');
    // v0.9.6: each model's own effort level names ("xLow" is one of them), read from the
    // listing's capabilities. Kept beside the model cache; ids and labels only.
    this.effortsFile = path.join(directory, 'providers', 'evren-efforts.json');
    this.key = null;
    this.verified = false;
    try {
      const saved = readStore(this.stateFile).value;
      this.verified = saved?.verified === true;
    } catch {}
    this.models = [];
    this.efforts = {};
    try {
      const saved = JSON.parse(fs.readFileSync(this.modelsFile, 'utf8'));
      this.models = cleanModels(saved);
    } catch {}
    try {
      const saved = JSON.parse(fs.readFileSync(this.effortsFile, 'utf8'));
      if (saved && typeof saved === 'object') this.efforts = saved;
    } catch {}
    this.loadKey();
  }

  crypto() {
    return this.encryption || (this.encryption = defaultEncryption());
  }

  loadKey() {
    this.key = null;
    try {
      const saved = readStore(this.file).value;
      const enc = this.crypto();
      if (!saved?.secret || !enc) return;
      this.key = enc.decryptString(Buffer.from(saved.secret, 'base64'));
    } catch {
      this.key = null;
    }
    return this.key;
  }

  hasKey() {
    return typeof this.key === 'string' && this.key.length > 0;
  }

  setKey(key) {
    const value = typeof key === 'string' ? key.trim() : '';
    if (!value || value.length > MAX_KEY) throw Error('Geçersiz anahtar.');
    const enc = this.crypto();
    if (!enc || !enc.isEncryptionAvailable())
      throw Error('Windows güvenli şifreleme kullanılamıyor. Anahtar kaydedilmedi.');
    this.key = value;
    this.verified = false;
    this.saveState();
    writeStore(this.file, {
      v: 1,
      secret: enc.encryptString(value).toString('base64'),
      updatedAt: Date.now(),
    });
    return this.status();
  }

  clearKey() {
    this.key = null;
    this.verified = false;
    this.saveState();
    try {
      for (const suffix of ['', '.bak', '.tmp']) fs.rmSync(this.file + suffix, { force: true });
    } catch {}
    return this.status();
  }

  saveState() {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      writeStore(this.stateFile, { verified: this.verified, updatedAt: Date.now() });
    } catch {}
  }

  status() {
    return { configured: this.hasKey(), verified: this.verified };
  }

  headers(extra = {}) {
    return { 'content-type': 'application/json', authorization: 'Bearer ' + this.key, ...extra };
  }

  /** One JSON request. Errors never carry the key or the headers. */
  async request(pathname, { method = 'GET', body, signal, expect = 'json' } = {}) {
    if (!this.hasKey()) throw Error('EVREN API anahtarı eklenmemiş. Ayarlardan anahtarını kaydet.');
    let res;
    try {
      res = await this.fetch(this.base + pathname, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw Error('EVREN sunucusuna bağlantı kurulamadı. İnternet, VPN ve güvenlik duvarını kontrol et.');
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) throw evrenError(res.status, text + ' ' + (res.headers.get('x-evren-error') || ''));
    if (expect === 'raw') return { text, headers: res.headers };
    try {
      return JSON.parse(text);
    } catch {
      throw Error('EVREN yanıtı okunamadı.');
    }
  }

  async fetch(url, options) {
    return (this.fetcher || globalThis.fetch)(url, options);
  }

  // ── usage terms (mandatory before the first call: else 403 terms_not_accepted) ──────────
  async termsStatus() {
    const data = await this.request('/v1/terms/status');
    return {
      accepted: data?.accepted === true || data?.terms_accepted === true || data?.status === 'accepted',
      version: typeof data?.version === 'string' ? data.version : null,
    };
  }

  async termsText() {
    const data = await this.request('/v1/terms/text');
    return {
      text: String(data?.text ?? data?.terms ?? data?.content ?? ''),
      version: typeof data?.version === 'string' ? data.version : null,
    };
  }

  async acceptTerms() {
    await this.request('/v1/terms/accept', { method: 'POST', body: {} });
    return { accepted: true };
  }

  // ── model list ───────────────────────────────────────────────────────────────────────────
  async refreshModels() {
    const data = await this.request('/v1/models');
    const list = cleanModels(data?.data);
    if (list.length) {
      this.models = list;
      // v0.9.6: the level names come with the listing (ModelCapabilities.reasoning_effort_values)
      // and are printed exactly as the API spells them ("xLow" stays "xLow").
      const caps = new Map();
      for (const entry of data?.data || [])
        if (typeof entry?.id === 'string' && entry.capabilities && typeof entry.capabilities === 'object')
          caps.set(entry.id, entry.capabilities);
      const efforts = {};
      for (const [id] of list) {
        const values = effortValuesFrom(caps.get(id));
        efforts[id] = values === null ? DEFAULT_EFFORTS : values;
      }
      this.efforts = efforts;
      try {
        fs.mkdirSync(path.dirname(this.modelsFile), { recursive: true });
        // stored as { id, name } objects - the same shape the API listing has, so the next
        // start can run it through cleanModels again and get the same pairs back
        fs.writeFileSync(this.modelsFile, JSON.stringify(list.map(([id, name]) => ({ id, name }))));
        fs.writeFileSync(this.effortsFile, JSON.stringify(efforts));
      } catch {}
    }
    return this.models;
  }

  /**
   * The effort levels one model takes, spelled the way the account's table spells them.
   * [] = the model takes no level at all (locked on "Otomatik"); a model the listing said
   * nothing about offers the three standard ones.
   */
  effortValues(id) {
    const saved = this.efforts[String(id || '')];
    if (Array.isArray(saved)) return saved.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
    return [...DEFAULT_EFFORTS];
  }

  // ── daily token quota ────────────────────────────────────────────────────────────────────
  async quota() {
    const { evrenQuota } = require('../usage/evren-usage.cjs');
    const { text, headers } = await this.request('/v1/quota', { expect: 'raw' });
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {}
    return evrenQuota({ headers, body, now: Date.now() });
  }

  // ── chat (SSE) ───────────────────────────────────────────────────────────────────────────
  /**
   * Streams one answer. onDelta receives plain text; reasoning deltas are dropped.
   * Resolves with the full text. Throws the same Turkish errors as request().
   */
  async chat({ model, prompt, signal, onDelta, maxTokens = 8192, thinking = false, effort = '' }) {
    if (!this.hasKey()) throw Error('EVREN API anahtarı eklenmemiş. Ayarlardan anahtarını kaydet.');
    if (!MODEL_ID.test(String(model || ''))) throw Error('Geçersiz EVREN modeli. Model listesini yenile.');
    const text = String(prompt || '');
    if (!text.trim()) throw Error('Mesaj boş olamaz.');
    if (text.length > MAX_PROMPT) throw Error('Mesaj EVREN için çok uzun. Kısaltıp yeniden gönder.');
    // v0.9.6: the level the panel chose, checked against this model's own set. The field only
    // travels when a level was picked; the gateway resolves its own aliases on top of it.
    const level = String(effort || '').trim();
    if (level && !this.effortValues(model).includes(level))
      throw Error('Bu EVREN modeli için geçerli bir efor seçimi değil.');
    let res;
    try {
      res = await this.fetch(this.base + '/v1/chat/completions', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }],
          stream: true,
          // a chosen level means the model should reason; reasoning needs room for the answer too
          thinking: thinking || !!level,
          max_tokens: Math.max(2048, (maxTokens | 0 || 8192) * (level ? 2 : 1)),
          ...(level ? { reasoning_effort: level } : {}),
        }),
        signal,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw Error('EVREN sunucusuna bağlantı kurulamadı. İnternet, VPN ve güvenlik duvarını kontrol et.');
    }
    if (!res.ok) throw evrenError(res.status, await res.text().catch(() => ''));
    return readSse(res, onDelta);
  }
}

// v0.9.6: every chat model the account's /v1/models lists is offered (the user asked for all
// of them, not a fixed table). Models that cannot chat (embeddings, speech, rerankers,
// moderation, image generators) are left out. The ids may come prefixed with their vendor
// ("zai/glm-5.3-fp8"); the picker shows the part after the last "/".
const NOT_CHAT = /(?:^|[/_.-])(?:embed(?:ding)?s?|text-embedding|whisper|tts|speech|audio|transcri\w*|rerank\w*|moderation|dall-e|image-gen|stable-diffusion|flux)(?:$|[/_.-])/i;
/** The name shown for one model id, or null when it is not a chat model. */
function chatModelName(entry, id) {
  if (NOT_CHAT.test(id)) return null;
  const type = String(entry?.type || entry?.capabilities?.type || '').toLowerCase();
  if (type && !/chat|text|llm|completion/.test(type)) return null;
  const name = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : String(id).split('/').pop();
  return name.slice(0, 80);
}

/** The standard level names; a model whose listing said nothing offers these three. */
const DEFAULT_EFFORTS = ['low', 'medium', 'high'];
/**
 * The level names one model's capabilities declare, printed exactly as the account's table
 * spells them. `[]` = the model takes no level (capabilities say reasoning_effort is off);
 * `null` = the listing said nothing specific (use DEFAULT_EFFORTS).
 */
function effortValuesFrom(caps) {
  if (!caps || typeof caps !== 'object') return null;
  if (caps.reasoning_effort === false) return [];
  const values = Array.isArray(caps.reasoning_effort_values)
    ? caps.reasoning_effort_values.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : [];
  return values.length ? values : null;
}

/** [[id, name]] from an OpenAI-style list: chat models once each, ids but no prompts or keys. */
function cleanModels(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const id = typeof entry === 'string' ? entry : typeof entry?.id === 'string' ? entry.id : '';
    if (!id || !MODEL_ID.test(id) || seen.has(id)) continue;
    const name = chatModelName(typeof entry === 'string' ? null : entry, id);
    if (!name) continue;
    seen.add(id);
    out.push([id, name]);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

/**
 * SSE reader: "data: {...}" chunks, "[DONE]" ends, ":" comment lines are passed through
 * (the service sends them as keep-alives). Reasoning deltas are ignored on purpose.
 */
async function readSse(res, onDelta) {
  const body = res.body;
  if (!body) throw Error('EVREN yanıtı boş.');
  const decoder = new TextDecoder();
  const reader = typeof body.getReader === 'function' ? body.getReader() : null;
  let buffer = '';
  let answer = '';
  const emit = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return;
    const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!payload || payload === '[DONE]') return payload === '[DONE]' ? false : true;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return true;
    }
    if (event?.error) throw evrenError(200, JSON.stringify(event));
    const delta = event?.choices?.[0]?.delta;
    const piece = typeof delta?.content === 'string' ? delta.content : '';
    if (piece) {
      answer += piece;
      if (onDelta) onDelta(piece);
    }
    return true;
  };
  const take = (chunk) => {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) if (emit(line) === false) return false;
    return true;
  };
  if (reader) {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (take(value) === false) break;
    }
  } else {
    for await (const chunk of body) if (take(chunk) === false) break;
  }
  if (buffer.trim()) emit(buffer);
  return answer;
}

module.exports = { Evren, cleanModels, evrenError, readSse, MODEL_ID, MAX_PROMPT, BASE };