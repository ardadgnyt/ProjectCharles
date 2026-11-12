// v0.9.6: EVREN - an OpenAI-compatible HTTP API (no CLI, no sign-in window). The API key is
// the only credential and it lives encrypted in %APPDATA%\Charles\evren.enc.json with Windows
// safeStorage (the same store as the Gemini Live key). Nothing personal is ever written to the
// project folder, and the key is never logged, echoed in errors or shipped in a release.
//
// API (see docs/EVREN.md in the service's own documentation):
//   GET  /v1/models                  model list (cached in providers/evren-models.json)
//   POST /v1/chat/completions        streaming answer (SSE; ":" comment lines are skipped)
//   GET  /v1/terms/status|text       EVREN's own terms -> POST /v1/terms/accept { version }
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
  // v0.9.27: the gate is EVREN's own (the account, not Charles, has to accept). Either field may
  // name it; the old test wanted both and read a plain "forbidden" message as a bad key.
  if (status === 403 && (/terms/i.test(code) || /terms_not_accepted/i.test(text)))
    return Object.assign(Error('EVREN bu hesap için kendi kullanım şartlarının kabul edilmesini istiyor. Bağlantı, şartlar EVREN tarafında kabul edilince kurulur.'), {
      code: 'terms_not_accepted',
    });
  if (status === 401 || status === 403)
    return Object.assign(Error('EVREN API anahtarı geçersiz veya eksik. Ayarlar → AI Modelleri bölümünden anahtarını kontrol et.'), {
      code: 'invalid_key',
    });
  if (status === 408 || status === 504)
    return Object.assign(Error('EVREN zamanında yanıt vermedi. Bir süre sonra yeniden dene.'), { code: 'timeout' });
  if (status === 409 && /terms|version/i.test(code + ' ' + message))
    return Object.assign(Error('EVREN kullanım şartları bu sırada güncellenmiş. Yeni metni okuyup yeniden dene.'), {
      code: 'terms_version',
    });
  if (status === 422)
    return Object.assign(Error('EVREN isteği kabul etmedi (geçersiz istek). Charles’ı güncelleyip yeniden dene.'), {
      code: 'invalid_request',
    });
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
    this.timeout = 20000;
    this.file = path.join(directory, 'evren.enc.json');
    this.stateFile = path.join(directory, 'providers', 'evren.json');
    this.modelsFile = path.join(directory, 'providers', 'evren-models.json');
    // v0.9.6: each model's own effort level names ("xLow" is one of them), read from the
    // listing's capabilities. Kept beside the model cache; ids and labels only.
    this.effortsFile = path.join(directory, 'providers', 'evren-efforts.json');
    // v0.9.25: which models can see pictures (capabilities.vision), ids and true/false only
    this.visionFile = path.join(directory, 'providers', 'evren-vision.json');
    this.vision = {};
    try {
      const saved = JSON.parse(fs.readFileSync(this.visionFile, 'utf8'));
      if (saved && typeof saved === 'object') for (const [k, v] of Object.entries(saved)) if (typeof v === 'boolean') this.vision[k] = v;
    } catch {}
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
    // v0.9.27: a server that never answers used to leave "testing…" on screen for good
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), this.timeout);
    const stop = () => limit.abort();
    if (signal) signal.aborted ? stop() : signal.addEventListener('abort', stop, { once: true });
    let res;
    let text = '';
    try {
      res = await this.fetch(this.base + pathname, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: limit.signal,
      });
      text = await res.text().catch(() => '');
    } catch (e) {
      if (signal?.aborted) throw e?.name === 'AbortError' ? e : Object.assign(Error('İstek durduruldu.'), { name: 'AbortError' });
      if (limit.signal.aborted)
        throw Object.assign(Error('EVREN zamanında yanıt vermedi. İnternet bağlantını kontrol edip yeniden dene.'), { code: 'timeout' });
      throw Object.assign(Error('EVREN sunucusuna bağlantı kurulamadı. İnternet, VPN ve güvenlik duvarını kontrol et.'), { code: 'network' });
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', stop);
    }
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

  // ── EVREN's own usage terms ──────────────────────────────────────────────────────────────
  // The service refuses an account that has not accepted them (403 terms_not_accepted). Charles
  // has no terms step of its own (v0.9.27): these are only reached after such a refusal.
  // Shapes from EVREN's OpenAPI document: status { current_version: int, is_material, accepted },
  // text { version: int, content }, accept wants { version: int } - exactly the current one.
  // Up to v0.9.26 accept sent {} and the service answered with a version error.
  async termsStatus() {
    const data = await this.request('/v1/terms/status');
    return { accepted: data?.accepted === true, version: termsVersion(data?.current_version ?? data?.version) };
  }

  async termsText() {
    const data = await this.request('/v1/terms/text');
    return { text: String(data?.content ?? data?.text ?? ''), version: termsVersion(data?.version) };
  }

  /** Accepts the version the user was shown. Never guesses one: no version, no request. */
  async acceptTerms(version) {
    const v = termsVersion(version);
    if (v === null) throw Object.assign(Error('EVREN kullanım şartlarının sürümü okunamadı. Metni yeniden açıp tekrar dene.'), { code: 'terms_version' });
    const data = await this.request('/v1/terms/accept', { method: 'POST', body: { version: v } });
    return { accepted: true, version: termsVersion(data?.accepted_version) ?? v };
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
      const vision = {};
      for (const [id] of list) if (typeof caps.get(id)?.vision === 'boolean') vision[id] = caps.get(id).vision;
      this.vision = vision;
      try {
        fs.writeFileSync(this.visionFile, JSON.stringify(vision));
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
  /**
   * v0.9.25: `images` are [{ mime, data }] (base64) and go as image_url parts. A model the listing
   * says cannot see pictures hands a message with pictures to "auto", which can.
   */
  async chat({ model, prompt, signal, onDelta, maxTokens = 8192, thinking = false, effort = '', images = null }) {
    if (!this.hasKey()) throw Error('EVREN API anahtarı eklenmemiş. Ayarlardan anahtarını kaydet.');
    if (!MODEL_ID.test(String(model || ''))) throw Error('Geçersiz EVREN modeli. Model listesini yenile.');
    // v0.9.26: a model that is not one of EVREN's chat models never gets the message (a choice
    // saved before the list was cleaned up, or a reading model): nothing is sent to it quietly
    if (model !== 'auto' && this.models.length && !this.models.some(([id]) => id === model))
      throw Error('Bu EVREN modeli sohbet için listelenmiyor. Model listesinden EVREN · Otomatik ya da başka bir model seç.');
    const text = String(prompt || '');
    if (!text.trim()) throw Error('Mesaj boş olamaz.');
    if (text.length > MAX_PROMPT) throw Error('Mesaj EVREN için çok uzun. Kısaltıp yeniden gönder.');
    // v0.9.6: the level the panel chose, checked against this model's own set. The field only
    // travels when a level was picked; the gateway resolves its own aliases on top of it.
    const level = String(effort || '').trim();
    if (level && !this.effortValues(model).includes(level))
      throw Error('Bu EVREN modeli için geçerli bir efor seçimi değil.');
    const pictures = Array.isArray(images) ? images.filter((i) => i && typeof i.data === 'string' && /^image\/(png|jpeg|webp)$/.test(i.mime)) : [];
    if (pictures.length > 8) throw Error('EVREN bir mesajda en fazla 8 görsel alabilir.');
    const seeing = pictures.length && this.vision[model] === false ? 'auto' : model;
    const content = pictures.length
      ? [{ type: 'text', text }, ...pictures.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))]
      : text;
    let res;
    try {
      res = await this.fetch(this.base + '/v1/chat/completions', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: seeing,
          messages: [{ role: 'user', content }],
          stream: true,
          // a chosen level means the model should reason; reasoning needs room for the answer too
          thinking: thinking || !!level,
          max_tokens: Math.max(2048, (maxTokens | 0 || 8192) * (level ? 2 : 1)),
          ...(level && seeing === model ? { reasoning_effort: level } : {}),
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
/**
 * v0.9.26: EVREN's own chat models, by the family the account's listing names them with (EVREN's
 * model table: "Akıl yürütme · Kod · Ajan"). The listing also carries reading (OCR) and other
 * special models, and its `task` field calls some of them chat too (qwen3-vl-30b reads pictures
 * for the OCR service); the cache kept only ids and names, so after a restart even the task
 * filter was gone. A model shows in the picker only when it is in this table; a new chat model
 * EVREN adds is a line here. Matched on the id after its vendor, with an optional suffix such as
 * "-fp8" or a version date, never on words found anywhere in the name.
 */
const EVREN_CHAT_MODELS = ['gemma-4-31b', 'glm-5.3', 'qwen3.8-flash-next', 'deepseek-v4.1-flash'];
function evrenChatModel(id) {
  const base = String(id || '').split('/').pop().toLowerCase();
  return EVREN_CHAT_MODELS.some((m) => base === m || base.startsWith(m + '-fp') || /^-(?:\d{4,8}|v\d+|instruct|chat)$/.test(base.slice(m.length)) && base.startsWith(m));
}
/** The name shown for one model id, or null when it is not a chat model. */
function chatModelName(entry, id) {
  if (NOT_CHAT.test(id)) return null;
  if (!evrenChatModel(id)) return null;
  // v0.9.25: the listing names each model's task; only chat models go in the picker (OCR, speech,
  // embeddings, guards and "decision" models such as clef and laya stay out)
  const task = String(entry?.task || '').toLowerCase();
  if (task && !['chat', 'vision_chat'].includes(task)) return null;
  const type = String(entry?.type || entry?.capabilities?.type || '').toLowerCase();
  if (type && !/chat|text|llm|completion/.test(type)) return null;
  const name = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : String(id).split('/').pop();
  return name.slice(0, 80);
}

/** A terms version as EVREN numbers them (a whole number from 0 up), or null. */
function termsVersion(value) {
  const n = typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value;
  return Number.isInteger(n) && n >= 0 ? n : null;
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

module.exports = { Evren, cleanModels, evrenError, readSse, MODEL_ID, MAX_PROMPT, BASE, EVREN_CHAT_MODELS, evrenChatModel };