// v0.9.6 Beta: EVREN - the OpenAI-compatible HTTP account. The API key roundtrip (encrypted
// at rest in %APPDATA%\Charles), the model cache, the error wording, the daily token quota
// (no weekly window on EVREN), the SSE chat stream and every routing list that must know the
// "evren:" prefix. No test touches the network: the fetcher and the encryption are fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Evren, cleanModels, MODEL_ID, MAX_PROMPT } = require('../app/ai/evren.cjs');
const { Providers } = require('../app/ai/providers.cjs');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const KEY = 'evren-test-key-1234567890';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'charles-evren-'));

function fakeEncryption() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^enc:/, ''),
  };
}
function res(status, body, headers = {}) {
  const plain = {};
  for (const [k, v] of Object.entries(headers)) plain[k.toLowerCase()] = String(v);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { ...plain, get: (n) => plain[String(n).toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : body == null ? '' : JSON.stringify(body)),
  };
}
function fetcher(handler) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options, calls.length);
  };
  fn.calls = calls;
  return fn;
}
function sse(chunks) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => '',
    body: {
      getReader() {
        let i = 0;
        return {
          read: async () =>
            i < chunks.length
              ? { value: Buffer.from(chunks[i++], 'utf8'), done: false }
              : { value: undefined, done: true },
        };
      },
    },
  };
}

// ── the key ────────────────────────────────────────────────────────────────────────────────
test('EVREN key: saved encrypted, restored, and never left behind after clearing', () => {
  const dir = tmp();
  try {
    const e = new Evren(dir, fakeEncryption(), null);
    assert.equal(e.hasKey(), false);
    // without Windows safeStorage nothing is written and the user is told
    assert.throws(() => new Evren(dir, null, null).setKey(KEY), /şifreleme/);
    assert.throws(() => e.setKey(''), /Geçersiz anahtar/);
    assert.throws(() => e.setKey('x'.repeat(2001)), /Geçersiz anahtar/);

    assert.deepEqual(e.setKey('  ' + KEY + '  '), { configured: true, verified: false });
    assert.equal(e.hasKey(), true);
    const raw = fs.readFileSync(path.join(dir, 'evren.enc.json'), 'utf8');
    assert.ok(!raw.includes(KEY), 'the key must not sit in the file in plain text');
    assert.ok(raw.includes(Buffer.from('enc:' + KEY).toString('base64')));

    const restored = new Evren(dir, fakeEncryption(), null);
    assert.equal(restored.hasKey(), true);
    assert.equal(restored.key, KEY);
    assert.deepEqual(restored.status(), { configured: true, verified: false });

    assert.deepEqual(e.clearKey(), { configured: false, verified: false });
    assert.equal(e.hasKey(), false);
    assert.ok(!fs.existsSync(path.join(dir, 'evren.enc.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── models ─────────────────────────────────────────────────────────────────────────────────
test('EVREN models: valid ids once each, cached on disk, an empty answer keeps the cache', async () => {
  const dir = tmp();
  try {
    const listing = {
      data: [
        { id: 'zai/glm-5.3-fp8', name: 'GLM 5.3 FP8' },
        { id: 'glm-5.3', name: 'GLM 5.3' },
        { id: 'auto' },
        'deepseek-v4.1-flash',
        { id: 'glm-5.3' },
        { id: 'bad id; echo' },
        { id: 'mimo-v2.6-pro', name: '  Mimo  ' },
        { id: 'qwen/qwen3.8-flash-next' },
        { id: 'google/gemma-4-31b' },
        { id: 'openai/gpt-oss-120b' },
        { id: 'text-embedding-3-small' }, // not a chat model
        { id: 'whisper-large-v3' }, // not a chat model
      ],
    };
    const e = new Evren(dir, fakeEncryption(), fetcher(() => res(200, listing)));
    e.setKey(KEY);
    const models = await e.refreshModels();
    // v0.9.6: every chat model the account lists, in its order, once each; the API's own name
    // when it gives one, else the part of the id after the vendor prefix
    assert.deepEqual(models, [
      ['zai/glm-5.3-fp8', 'GLM 5.3 FP8'],
      ['glm-5.3', 'GLM 5.3'],
      ['auto', 'auto'],
      ['deepseek-v4.1-flash', 'deepseek-v4.1-flash'],
      ['mimo-v2.6-pro', 'Mimo'],
      ['qwen/qwen3.8-flash-next', 'qwen3.8-flash-next'],
      ['google/gemma-4-31b', 'gemma-4-31b'],
      ['openai/gpt-oss-120b', 'gpt-oss-120b'],
    ]);
    // the cache lives under providers/ and comes back on the next start
    assert.ok(fs.existsSync(path.join(dir, 'providers', 'evren-models.json')));
    const restored = new Evren(dir, fakeEncryption(), null);
    assert.deepEqual(restored.models, models);
    // a failing or empty refresh never empties the picker
    const empty = new Evren(dir, fakeEncryption(), fetcher(() => res(200, { data: [] })));
    empty.setKey(KEY);
    assert.deepEqual(await empty.refreshModels(), models);
    assert.deepEqual(cleanModels('nope'), []);
    assert.deepEqual(cleanModels([{ id: 'zai/glm-5.3-fp8' }]), [['zai/glm-5.3-fp8', 'glm-5.3-fp8']]);
    assert.ok(MODEL_ID.test('zai/glm-5.3-fp8'));
    assert.ok(!MODEL_ID.test('glm 5.3'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── errors and terms ───────────────────────────────────────────────────────────────────────
test('EVREN errors: the four answers the service gives, without the key in any of them', async () => {
  const dir = tmp();
  try {
    const cases = [
      [401, { error: { message: 'API anahtarı eksik', code: 'unauthorized' } }, /anahtarı geçersiz veya eksik/],
      [429, { error: { message: 'quota' } }, /günlük kullanım hakkı dolmuş/],
      [503, 'up', /sunucusuna şu an ulaşılamıyor/],
      [400, { error: { message: 'kötü istek' } }, /isteği başarısız oldu: kötü istek/],
    ];
    for (const [status, body, pattern] of cases) {
      const e = new Evren(dir, fakeEncryption(), fetcher(() => res(status, body)));
      e.setKey(KEY);
      await assert.rejects(() => e.request('/v1/models'), (error) => {
        assert.match(error.message, pattern);
        assert.ok(!error.message.includes(KEY), 'the key must never be echoed');
        assert.ok(!/Bearer/i.test(error.message));
        return true;
      });
    }
    // the terms gate is its own code so the card can offer "Şartları kabul et"
    const gated = new Evren(
      dir,
      fakeEncryption(),
      fetcher(() => res(403, { error: { message: 'terms not accepted', code: 'terms_not_accepted' } })),
    );
    gated.setKey(KEY);
    await assert.rejects(() => gated.request('/v1/models'), (error) => {
      assert.equal(error.code, 'terms_not_accepted');
      assert.match(error.message, /kullanım şartları kabul edilmedi/);
      return true;
    });
    // offline: one clear message instead of a stack trace
    const offline = new Evren(dir, fakeEncryption(), fetcher(() => Promise.reject(Error('ECONNRESET'))));
    offline.setKey(KEY);
    await assert.rejects(() => offline.request('/v1/models'), /bağlantı kurulamadı/);
    // a key is required before any request (a fresh dir: nothing on disk, so no request)
    const keyless = tmp();
    try {
      await assert.rejects(() => new Evren(keyless, fakeEncryption(), null).request('/v1/models'), /anahtarı eklenmemiş/);
    } finally {
      fs.rmSync(keyless, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('EVREN terms: every accepted shape is read and acceptance is one POST', async () => {
  const dir = tmp();
  try {
    for (const body of [{ accepted: true }, { terms_accepted: true }, { status: 'accepted' }]) {
      const e = new Evren(dir, fakeEncryption(), fetcher(() => res(200, body)));
      e.setKey(KEY);
      assert.deepEqual(await e.termsStatus(), { accepted: true, version: null });
    }
    const e = new Evren(
      dir,
      fakeEncryption(),
      fetcher((url, options) => {
        if (/terms\/text/.test(url)) return res(200, { terms: 'Metin', version: 'v2' });
        if (/terms\/accept/.test(url)) {
          assert.equal(options.method, 'POST');
          return res(200, {});
        }
        return res(200, { accepted: false, version: 'v2' });
      }),
    );
    e.setKey(KEY);
    assert.deepEqual(await e.termsStatus(), { accepted: false, version: 'v2' });
    assert.deepEqual(await e.termsText(), { text: 'Metin', version: 'v2' });
    assert.deepEqual(await e.acceptTerms(), { accepted: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── daily token quota (EVREN has no weekly window) ─────────────────────────────────────────
test('EVREN quota: the daily window alone, and an unreadable answer says so', async () => {
  const dir = tmp();
  try {
    const e = new Evren(
      dir,
      fakeEncryption(),
      fetcher(() =>
        res(
          200,
          { daily_limit_tokens: 50000, daily_used_tokens: 37655, resets_at: '2026-10-28T00:00:00Z' },
          { 'x-evren-daily-remaining-tokens': '12345' },
        ),
      ),
    );
    e.setKey(KEY);
    const quota = await e.quota();
    assert.equal(quota.provider, 'evren');
    assert.ok(quota.fiveHour && typeof quota.fiveHour.remaining === 'number');
    assert.equal(quota.weekly, null, 'EVREN reports no weekly quota');
    assert.deepEqual(quota.missingWindows, ['weekly']);
    assert.equal(quota.labels.fiveHour, 'Günlük token');
    assert.equal(quota.note, 'Kalan günlük token: 12345');

    // only an absolute count: no percent is invented
    const absolute = new Evren(
      dir,
      fakeEncryption(),
      fetcher(() => res(200, null, { 'x-evren-daily-remaining-tokens': '12345' })),
    );
    absolute.setKey(KEY);
    const only = await absolute.quota();
    assert.match(only.unavailable, /^Kalan günlük token: \d+$/);

    // nothing recognisable: the panel says it could not read the quota
    const weird = new Evren(dir, fakeEncryption(), fetcher(() => res(200, { weird: { shape: true } })));
    weird.setKey(KEY);
    assert.equal((await weird.quota()).unavailable, 'Kota bilgisi okunamadı');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── chat (SSE) ─────────────────────────────────────────────────────────────────────────────
test('EVREN chat: streams deltas, skips comments and reasoning, and can be stopped', async () => {
  const dir = tmp();
  try {
    const e = new Evren(
      dir,
      fakeEncryption(),
      fetcher((url, options) => {
        assert.match(url, /\/v1\/chat\/completions$/);
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'glm-5.3');
        assert.equal(body.stream, true);
        assert.equal(body.thinking, false);
        assert.ok(body.max_tokens >= 2048);
        assert.deepEqual(body.messages, [{ role: 'user', content: 'Merhaba' }]);
        return sse([
          ': keep-alive\n\n',
          'data: {"choices":[{"delta":{"reasoning_content":"düşünüyorum"}}]}\n\ndata: {"choices":[{"delta":{"content":"Merhaba"}}]}\n',
          '\ndata: {"choices":[{"delta":{"content":" dünya"}}]}\n\ndata: [DONE]\n\n',
        ]);
      }),
    );
    e.setKey(KEY);
    const pieces = [];
    const answer = await e.chat({ model: 'glm-5.3', prompt: 'Merhaba', onDelta: (p) => pieces.push(p) });
    assert.equal(answer, 'Merhaba dünya');
    assert.deepEqual(pieces, ['Merhaba', ' dünya']);

    // validation before anything is sent
    await assert.rejects(() => e.chat({ model: 'bad model', prompt: 'x' }), /Geçersiz EVREN modeli/);
    await assert.rejects(() => e.chat({ model: 'glm-5.3', prompt: '   ' }), /boş olamaz/);
    await assert.rejects(
      () => e.chat({ model: 'glm-5.3', prompt: 'x'.repeat(MAX_PROMPT + 1) }),
      /çok uzun/,
    );
    const keyless = tmp();
    try {
      await assert.rejects(
        () => new Evren(keyless, fakeEncryption(), null).chat({ model: 'glm-5.3', prompt: 'x' }),
        /anahtarı eklenmemiş/,
      );
    } finally {
      fs.rmSync(keyless, { recursive: true, force: true });
    }

    // an error inside the stream still fails loudly
    const bad = new Evren(
      dir,
      fakeEncryption(),
      fetcher(() => sse(['data: {"error":{"message":"model yok"}}\n\n'])),
    );
    bad.setKey(KEY);
    await assert.rejects(() => bad.chat({ model: 'glm-5.3', prompt: 'x' }), /isteği başarısız oldu: model yok/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── every routing list knows "evren:" ──────────────────────────────────────────────────────
test('EVREN routing: the subscription prefix reaches chat, images, models and usage', () => {
  for (const f of [
    'app/ai/sessions.cjs',
    'app/ai/ask-once.cjs',
    'app/ai/chat-classifier.cjs',
    'app/modules/host.cjs',
    'app/main.cjs',
    'src/renderer.ts',
    'src/island/usage.ts',
  ])
    assert.match(read(f), /abacus\|evren/, f);
  assert.match(read('app/ai/ask-once.cjs'), /primary === 'evren'\) return 'evren:auto'/);
  assert.match(read('app/modules/host.cjs'), /NO_IMAGE_MODEL = \/\^\(cursor\|abacus\|evren\):\/i/);
  assert.match(read('app/core/reset.cjs'), /'evren\.enc\.json'/);
  assert.match(read('app/core/dash-layout.cjs'), /USAGE_PROVIDERS = \['gpt', 'claude', 'gemini', 'cursor', 'abacus', 'evren'\]/);
  assert.match(read('src/settings/evren-card.ts'), /evrenKeySave/);
  assert.match(read('src/settings/providers.ts'), /evrenCard\(/);
});

// ── the account in Providers ───────────────────────────────────────────────────────────────
test('EVREN account: status rows, the connection test and the model rows', async () => {
  const dir = tmp();
  try {
    const p = new Providers(dir, dir);
    p.evren.encryption = fakeEncryption();
    p.evren.fetcher = fetcher(() => res(200, { data: [{ id: 'auto' }, { id: 'glm-5.3', name: 'GLM 5.3' }] }));

    // keyless: the card shows "Anahtar eklenmedi" and the test refuses to run
    let row = p.status().find((s) => s.id === 'evren');
    assert.deepEqual({ ...row }, { id: 'evren', enabled: false, signedIn: false, configured: false, installed: true });
    assert.match((await p.testEvren()).message, /anahtarı eklenmemiş/);

    // a saved key alone is not "signed in" - the connection test proves it
    p.evrenKeySave(KEY);
    row = p.status().find((s) => s.id === 'evren');
    assert.equal(row.configured, true);
    assert.equal(row.signedIn, false);
    const tested = await p.testEvren();
    assert.equal(tested.ok, true);
    assert.equal(p.status().find((s) => s.id === 'evren').signedIn, true);
    assert.deepEqual(p.evren.status(), { configured: true, verified: true });

    // the model list joins the picker; a model literally called "auto" is the same row once
    const ids = p.allModels().map(([id]) => id);
    assert.deepEqual(ids.filter((id) => id.startsWith('evren:')), ['evren:auto', 'evren:glm-5.3']);
    const names = new Map(p.allModels());
    assert.equal(names.get('evren:glm-5.3'), 'EVREN · GLM 5.3');

    // a failing test takes the account back out of the signed-in list
    p.evren.fetcher = fetcher(() => res(401, { error: { message: 'API anahtarı eksik' } }));
    const failed = await p.testEvren();
    assert.equal(failed.ok, false);
    assert.equal(p.status().find((s) => s.id === 'evren').signedIn, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('EVREN usage: 60 s cache, stale keeps working, clearing the key empties it', async () => {
  const dir = tmp();
  try {
    const p = new Providers(dir, dir);
    p.evren.encryption = fakeEncryption();
    const fetch = fetcher(() =>
      res(200, { daily_limit_tokens: 100, daily_used_tokens: 40 }, { 'x-evren-daily-remaining-tokens': '60' }),
    );
    p.evren.fetcher = fetch;

    // keyless: the panel gets one clear reason instead of a failed request
    const keyless = await p.evrenUsage(true);
    assert.match(keyless.unavailable, /anahtarı eklenmemiş/);
    assert.equal(fetch.calls.length, 0);

    p.evrenKeySave(KEY);
    const first = await p.evrenUsage(true);
    assert.equal(fetch.calls.length, 1);
    assert.ok(first.fiveHour);
    assert.deepEqual(first.missingWindows, ['weekly']);
    assert.equal(first.labels.fiveHour, 'Günlük token');

    // 60 s inside: the cached window is returned without a request
    assert.equal(await p.evrenUsage(), first);
    assert.equal(fetch.calls.length, 1);

    // force re-reads
    await p.evrenUsage(true);
    assert.equal(fetch.calls.length, 2);

    // a failed read keeps the last known window (marked stale) instead of blanking the gauge
    const failing = fetcher(() => res(503, 'down'));
    p.evren.fetcher = failing;
    const stale = await p.evrenUsage(true);
    assert.ok(stale.fiveHour);
    assert.equal(stale.stale, true);
    assert.equal(failing.calls.length, 1);

    // clearing the key removes the account and its cache
    p.evrenKeyClear();
    const gone = await p.evrenUsage(true);
    assert.match(gone.unavailable, /anahtarı eklenmemiş/);
    assert.equal(p.evren.hasKey(), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});