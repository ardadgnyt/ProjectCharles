// v0.6.5: questions from the AI, browser commands, Gemini Live tuning, microphone switch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function loadTs(file) {
  const esbuild = require('esbuild');
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const m = { exports: {} };
  const code = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('AI questions: the block is hidden and parsed, also while streaming', () => {
  const { splitQuestions, parseQuestion, answerText } = loadTs('src/chat/ai-questions.ts');
  const text =
    'Bunu yapabilirim.\n\n<charles-soru>{"soru": "Hangi dilde?", "secenekler": ["Türkçe", "İngilizce"]}</charles-soru>';
  const r = splitQuestions(text);
  assert.equal(r.visible, 'Bunu yapabilirim.');
  assert.equal(r.questions.length, 1);
  assert.deepEqual(r.questions[0], { question: 'Hangi dilde?', options: ['Türkçe', 'İngilizce'], multi: false });
  // half-streamed block stays hidden
  const partial = splitQuestions('Tamam.\n<charles-soru>{"soru": "Han');
  assert.equal(partial.visible, 'Tamam.');
  assert.equal(partial.questions.length, 0);
  // English keys, multi-select, plain text
  assert.deepEqual(parseQuestion('{"question":"Which?","options":["a","b"],"multi":true}'), {
    question: 'Which?',
    options: ['a', 'b'],
    multi: true,
  });
  assert.equal(parseQuestion(' Ne zaman? ').question, 'Ne zaman?');
  assert.equal(parseQuestion('{}'), null);
  assert.equal(answerText([{ question: 'A?' }], ['x']), 'x');
  assert.equal(answerText([{ question: 'A?' }, { question: 'B?' }], ['x', 'y']), 'A? → x\nB? → y');
});

test('AI questions: every provider is told how to ask', () => {
  const { ASK_FORMAT } = require('../app/core/ask-format.cjs');
  assert.match(ASK_FORMAT, /<charles-soru>/);
  assert.match(read('app/core/policy.cjs'), /ASK_FORMAT/);
  assert.match(read('app/ai/providers.cjs'), /ASK_FORMAT/);
  // the question block is never read aloud
  assert.match(read('src/voice/voice.ts'), /splitQuestions\(item\.text\)\.visible/);
});

test('browser commands: Turkish and English searches, YouTube and sites', () => {
  const { parseWebCommand } = require('../app/system/web-commands.cjs');
  const s = parseWebCommand('Bana internetten yapay zeka haberlerini arat');
  assert.equal(s.kind, 'search');
  assert.equal(s.query, 'yapay zeka haberlerini');
  assert.match(s.url, /^https:\/\/www\.google\.com\/search\?q=/);
  assert.equal(parseWebCommand("google'da hava durumu ara").query, 'hava durumu');
  const y = parseWebCommand("YouTube'dan Barış Manço Gülpembe videosunu aç");
  assert.equal(y.kind, 'youtube');
  assert.equal(y.query, 'barış manço gülpembe');
  assert.equal(parseWebCommand("youtube'da lofi müzik ara").kind, 'youtube-search');
  assert.equal(parseWebCommand('play lofi beats on youtube').kind, 'youtube');
  assert.equal(parseWebCommand('search the web for electron ipc').query, 'electron ipc');
  const site = parseWebCommand('github.com sitesini aç');
  assert.equal(site.kind, 'site');
  assert.equal(site.url, 'https://github.com/');
  // ordinary chat is not a browser command
  for (const t of ['Bu kodu açıkla', 'Merhaba nasılsın', 'Dosyayı aç', 'internet nedir'])
    assert.equal(parseWebCommand(t), null, t);
});

test('browser commands: YouTube opens the first video, otherwise the results page', async () => {
  const { parseWebCommand, openWeb, firstVideoId } = require('../app/system/web-commands.cjs');
  assert.equal(firstVideoId('..."videoRenderer":{"videoId":"abcDEF12345"...'), 'abcDEF12345');
  assert.equal(firstVideoId('nothing'), null);
  const opened = [];
  const cmd = parseWebCommand("YouTube'dan kedi videosu aç");
  const msg = await openWeb(cmd, {
    openExternal: async (u) => opened.push(u),
    fetch: async () => ({ ok: true, text: async () => '"videoId":"abcDEF12345"' }),
  });
  assert.equal(opened[0], 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.match(msg, /YouTube/);
  await openWeb(cmd, {
    openExternal: async (u) => opened.push(u),
    fetch: async () => {
      throw Error('offline');
    },
    en: true,
  });
  assert.match(opened[1], /results\?search_query=/);
  // main process answers locally, never sends it to an AI
  assert.match(read('app/main.cjs'), /parseWebCommand/);
  assert.match(read('app/voice/gemini-live.cjs'), /open_web/);
});

test('Gemini Live: faster voice detection and small audio chunks', () => {
  const live = read('app/voice/gemini-live.cjs');
  assert.match(live, /START_SENSITIVITY_HIGH/);
  assert.match(live, /silenceDurationMs:\s*450/);
  const ui = read('src/voice/gemini-live.ts');
  assert.match(ui, /createScriptProcessor\(1024/);
  assert.match(ui, /live-meter/);
});

test('microphone switch: saved, kept by other settings and enforced in the main process', () => {
  const { Extras } = require('../app/core/extras.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-mic-'));
  const enc = { encryptString: (s) => Buffer.from(s), decryptString: (b) => String(b), isEncryptionAvailable: () => true };
  const e = new Extras(dir, enc);
  assert.equal(e.prefs.micOff, false);
  e.setMicOff(true);
  assert.equal(new Extras(dir, enc).prefs.micOff, true);
  // saving the general settings does not switch the microphone back on
  e.settings({ sound: true, volume: 0.1, autoHide: true, hideSeconds: 60, screen: 'primary' });
  assert.equal(new Extras(dir, enc).prefs.micOff, true);
  const main = read('app/main.cjs');
  for (const h of ['voice-arm', 'wake-arm', 'wake-training-arm', 'live-voice-arm'])
    assert.match(main, new RegExp(`safeHandler\\('${h}'[^]{0,80}micBlocked\\(\\)`), h);
  assert.equal((main.match(/!micBlocked\(\) &&/g) || []).length, 2); // both permission handlers
  assert.match(read('app/preload.cjs'), /micPrivacy:/);
  assert.match(read('public/index.html'), /id="mic-privacy"[^>]*><\/button><button id="sound"/);
});

test('Gemini: "Set up with Charles" guides for the account sign-in and the Live API key', () => {
  const { setupURL } = require('../app/plugins/oauth-setup.cjs');
  assert.equal(setupURL('gemini'), 'https://aistudio.google.com/api-keys');
  assert.equal(setupURL('gemini-login'), null); // console window, no web page
  assert.throws(() => setupURL('gemini', 3));
  const guide = read('src/settings/plugin-guide.ts');
  assert.match(guide, /'gemini-login': \[/);
  assert.match(guide, /providersLogin\('gemini'\)/);
  assert.match(guide, /liveVoiceSave\(/);
  assert.match(read('src/voice/gemini-live.ts'), /id="live-guide"/);
  assert.match(read('src/settings/providers.ts'), /guide\('gemini-login'\)/);
  assert.match(read('app/main.cjs'), /if \(!demo && url\) await shell\.openExternal\(url\)/);
});
