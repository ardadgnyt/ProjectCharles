// v0.7.0: mail search, extra instructions while working, Cursor fixes, settings and tour
// changes, calmer AI questions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const NOW = new Date(2026, 9, 16, 10, 0); // Friday 16 October 2026
const day = (s) => (s ? new Date(s).toLocaleDateString('tr-TR') : null);

test('mail search: keyword, sender and date phrases (Turkish and English)', () => {
  const { parseMailSearch } = require('../app/plugins/mail-search.cjs');
  const cases = [
    ['maillerimde fatura ara', 'mail', 'fatura', null, null],
    ['Maillerimde staj ile ilgili mail var mı?', 'mail', 'staj', null, null],
    ['dün gelen mailleri göster', 'mail', '', '15.10.2026', '16.10.2026'],
    ["geçen hafta Ahmet'ten gelen mailleri bul", 'mail', 'ahmet', '05.10.2026', '12.10.2026'],
    ["15 Ekim'deki maillerde burs geçen mailleri bul", 'mail', 'burs', '15.10.2026', '16.10.2026'],
    ['okul mailimde sınav ara', 'school', 'sınav', null, null],
    ['son 3 günde gelen maillerde "proje teslim" ara', 'mail', 'proje teslim', '14.10.2026', '17.10.2026'],
    ["Gmail'de Trendyol siparişi ara", 'gmail', 'trendyol siparişi', null, null],
    ['search my email for invoice last week', 'mail', 'invoice', '05.10.2026', '12.10.2026'],
    ['find emails from john', 'mail', 'john', null, null],
    ['bu ay gelen okul maillerini listele', 'school', '', '01.10.2026', '17.10.2026'],
    ['01.10.2026 tarihli mailleri göster', 'mail', '', '01.10.2026', '02.10.2026'],
    ['10 ekimden beri gelen maillerde kargo ara', 'mail', 'kargo', '10.10.2026', '17.10.2026'],
  ];
  for (const [text, kind, keywords, since, until] of cases) {
    const r = parseMailSearch(text, NOW);
    assert.ok(r, text);
    assert.equal(r.kind, kind, text);
    assert.equal(r.search.keywords, keywords, text);
    assert.equal(day(r.search.since), since, text);
    assert.equal(day(r.search.until), until, text);
  }
  assert.equal(parseMailSearch('ekim ayında gelen mailleri özetle', NOW).summary, true);
  for (const text of [
    'maillerimi özetle',
    'önemli mail var mı',
    'okul mailimi kontrol et',
    'maile fatura yazıp gönder',
    'mail nasıl bağlarım',
    'internetten fatura ara',
    'maillerimde fatura arama',
    'bu kodu açıkla',
  ])
    assert.equal(parseMailSearch(text, NOW), null, text);
  // the chat and voice parser routes searches, older commands keep working
  const { parse } = require('../app/plugins/plugin-commands.cjs');
  assert.ok(parse('maillerimde fatura ara').search);
  assert.deepEqual(parse('Okul mailimi kontrol et ve kısaca özetle'), {
    kind: 'school',
    query: '',
    summary: true,
  });
});

test('mail search: results are listed with subject, sender and date', () => {
  const { formatResults, inRange, matches } = require('../app/plugins/mail-search.cjs');
  const request = { search: { keywords: 'fatura', since: null, until: null, label: null } };
  const rows = [
    { title: 'Ekim faturası', from: 'fatura@ornek.com', date: '2026-10-15T09:00:00Z', text: 'Son ödeme 20 Ekim', unread: true },
  ];
  const tr = formatResults(rows, request, false);
  assert.match(tr, /“fatura” için 1 mail buldum/);
  assert.match(tr, /\*\*Ekim faturası\*\* · fatura@ornek\.com/);
  assert.match(tr, /okunmamış/);
  assert.match(formatResults([], request, true), /No emails found for “fatura”/);
  assert.equal(inRange({ date: '2026-10-15T09:00:00Z' }, { since: '2026-10-15T00:00:00Z', until: '2026-10-16T00:00:00Z' }), true);
  assert.equal(inRange({ date: '2026-10-17T09:00:00Z' }, { since: null, until: '2026-10-16T00:00:00Z' }), false);
  assert.equal(matches({ title: 'Sınav takvimi', from: '', text: '' }, 'sinav'), true);
  assert.equal(matches({ title: 'Duyuru', from: '', text: '' }, 'sınav'), false);
});

test('mail search: Gmail query, Outlook search, results merged across accounts', async () => {
  const { Plugins } = require('../app/plugins/plugins.cjs');
  const calls = [];
  const fake = Object.create(Plugins.prototype);
  fake.data = { tokens: { google: {}, microsoft: {} }, configs: {} };
  fake.cache = {};
  fake.list = async (kind, q) => {
    calls.push(['list', kind, q]);
    return [{ id: 'g1', title: 'Fatura', from: 'a@b.c', date: '2026-10-15T10:00:00Z', text: '' }];
  };
  fake.get = async (id, url) => {
    calls.push(['get', id, url]);
    return { value: [{ id: 'o1', subject: 'Fatura hatırlatma', from: { emailAddress: { address: 'x@y.z' } }, bodyPreview: 'fatura', receivedDateTime: '2026-10-14T10:00:00Z', isRead: false }] };
  };
  const rows = await fake.search('mail', { keywords: 'fatura', since: new Date(2026, 9, 10).toISOString(), until: new Date(2026, 9, 17).toISOString() });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.account), ['gmail', 'outlook']);
  assert.match(calls[0][2], /^fatura after:2026\/10\/10 before:2026\/10\/17$/);
  assert.match(decodeURIComponent(calls[1][2]), /\$search="fatura"/);
  assert.ok(fake.cache.mail.some((r) => r.id === 'gmail|g1'));
});

test('voice: mail search runs through the connected_plugin tool', async () => {
  const { runVoicePlugin } = require('../app/voice/live-plugins.cjs');
  const plugins = {
    search: async (kind, s) => {
      assert.equal(kind, 'mail');
      assert.equal(s.keywords, 'fatura');
      return [{ title: 'Ekim faturası', from: 'x', date: '2026-10-15T09:00:00Z', text: '' }];
    },
  };
  const r = await runVoicePlugin({ plugins, transcript: 'maillerimde fatura ara' });
  assert.match(r.result, /1 mail buldum/);
  assert.match(read('app/main.cjs'), /pluginRequest\?\.search/);
});

test('extra instructions: Codex turn/steer, queue for one-shot providers, Ctrl+Enter', async () => {
  const { Agent } = require('../app/ai/agent.cjs');
  const a = new Agent(root);
  a.ready = true;
  a.busy = true;
  a.threadId = 'th';
  a.turnId = 'tu';
  let sent;
  a.rpc = { request: async (method, params) => ((sent = { method, params }), { turnId: 'tu' }) };
  await a.steer('Başlıkları da ekle');
  assert.equal(sent.method, 'turn/steer');
  assert.deepEqual(sent.params, {
    threadId: 'th',
    expectedTurnId: 'tu',
    input: [{ type: 'text', text: 'Başlıkları da ekle', text_elements: [] }],
  });
  a.busy = false;
  await assert.rejects(() => a.steer('x'));
  const sessions = read('app/ai/sessions.cjs');
  assert.match(sessions, /async steer\(text\)/);
  assert.match(sessions, /providerModel\) throw Error/);
  assert.match(read('app/preload.cjs'), /steer: \(text\) => invoke\('steer', text\)/);
  const renderer = read('src/renderer.ts');
  assert.match(renderer, /e\.key === 'Enter' && e\.ctrlKey/);
  assert.match(renderer, /steer\.send\(prompt\.value\)/);
  assert.match(read('src/chat/steer.ts'), /queue\.push\(text\)/);
});

test('Cursor: print mode trusts its workspace (no bypass flags) and reads usage', async () => {
  const { launchPlan } = require('../app/ai/provider-tools.cjs');
  for (const mode of ['chat', 'project'])
    for (const access of ['ask', 'auto', 'full']) {
      const cli = launchPlan({ provider: 'cursor', model: 'auto', mode, access, projectDir: 'C:/p', workspace: 'C:/w' }).cli;
      assert.ok(cli.includes('--trust'));
      assert.doesNotMatch(cli.join(' '), /--force|--yolo|-f\b/);
    }
  const { cursorUsage, fromPeriod } = require('../app/usage/cursor-usage.cjs');
  const g = fromPeriod({ billingCycleEnd: '1793000000000', planUsage: { totalPercentUsed: 40, autoPercentUsed: 25, limit: 2000, includedSpend: 800 } });
  assert.deepEqual(g, { fiveHour: { remaining: 75, resetsAt: 1793000000 }, weekly: { remaining: 60, resetsAt: 1793000000 } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-'));
  const file = path.join(dir, 'auth.json');
  assert.match((await cursorUsage({ file })).unavailable, /giriş/);
  fs.writeFileSync(file, JSON.stringify({ accessToken: 'x'.repeat(40) }));
  let request;
  const ok = await cursorUsage({
    file,
    fetcher: async (url, init) => ((request = { url, init }), { ok: true, status: 200, json: async () => ({ billingCycleEnd: '1793000000000', planUsage: { totalPercentUsed: 10 } }) }),
  });
  assert.match(request.url, /DashboardService\/GetCurrentPeriodUsage$/);
  assert.equal(request.init.headers.Authorization, 'Bearer ' + 'x'.repeat(40));
  assert.equal(ok.weekly.remaining, 90);
  assert.equal(ok.labels.weekly, 'Aylık');
  const expired = await cursorUsage({ file, fetcher: async () => ({ ok: false, status: 401 }) });
  assert.match(expired.unavailable, /yenilenmeli/);
  assert.match(read('src/island/usage.ts'), /cursor: '#3fd8c8'/);
});

test('AI questions: strict format and a one-at-a-time card', () => {
  const { ASK_FORMAT } = require('../app/core/ask-format.cjs');
  assert.match(ASK_FORMAT, /ASLA soru kartı kullanma/);
  assert.match(ASK_FORMAT, /tek harf/);
  const card = read('src/chat/ai-questions.ts');
  assert.match(card, /one question at a time/);
  assert.match(card, /ai-q-option/);
});

test('settings: GitHub only (coming soon), no opacity, AI-agnostic memory import, tour offers every AI', () => {
  const extras = read('src/settings/extras.ts');
  assert.doesNotMatch(extras, /vercel: 'Vercel'|stripe: 'Stripe'|n8n: 'n8n'/);
  assert.match(extras, /İleriki sürümlerde gelecek/);
  assert.match(read('public/index.html'), /<label hidden\s*\n?\s*>Saydamlık/);
  assert.match(read('src/settings/profile-transfer.ts'), /Kullandığım AI ile beni tanı/);
  assert.doesNotMatch(read('src/settings/profile-transfer.ts'), /ChatGPT’den beni tanı/);
  const tour = read('src/island/onboarding.ts');
  for (const id of ["'gpt'", "'claude'", "'gemini'", "'cursor'"]) assert.ok(tour.includes(id));
  assert.match(read('src/settings/polish-070.ts'), /language-icon/);
  assert.match(read('src/settings/providers.ts'), /gpt-check/);
  assert.match(read('public/styles/7-settings-v070.css'), /settings-card:not\(:has/);
});

test('English: the new texts are translated', () => {
  const esbuild = require('esbuild');
  const code = esbuild.transformSync(read('src/settings/i18n-070.ts'), { loader: 'ts', format: 'cjs' }).code;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  for (const k of ['Ek talimat', 'Kullandığım AI ile beni tanı', 'Charles soruyor', 'Aylık', 'İleriki sürümlerde gelecek'])
    assert.ok(mod.exports.english070[k], k);
  assert.match(read('src/settings/i18n.ts'), /english063, english070/);
});
