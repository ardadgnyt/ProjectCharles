// v0.5.4: hidden mail data stays out of the history; Charles' own questions keep their context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Sessions } = require('../app/ai/sessions.cjs');

function loadTs(file) {
  const esbuild = require('esbuild');
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const m = { exports: {} };
  const code = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  new Function('module', 'exports', 'require', code)(m, m.exports, (name) =>
    name === './markdown' ? { updateMarkdown() {} } : require(name),
  );
  return m.exports;
}

function fakeSend(s) {
  const sent = [];
  s.current.agent.ready = true;
  s.current.agent.send = async (a) => {
    sent.push(a);
    Object.assign(s.current.agent, {
      threadId: 't1',
      cwd: a.cwd,
      mode: a.mode,
      access: a.access || 'ask',
      task: a.task || '',
    });
    return {};
  };
  return sent;
}

test('mail data goes to the AI but the history keeps only what the user typed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v054-'));
  const s = new Sessions(process.cwd(), dir);
  const sent = fakeSend(s);
  const typed = 'maillerimi kontrol eder misin';
  const prompt =
    typed +
    '\n\nCharles kullanıcının bağlı mail hesaplarından son mailleri okudu; aşağıdadır.\n<mail_verisi>\nx · Temu\n</mail_verisi>';
  await s.send({ cwd: process.cwd(), model: 'test', mode: 'chat', prompt, displayPrompt: typed });
  assert.match(sent[0].prompt, /<mail_verisi>/);
  assert.equal(s.current.events.at(-1).data, typed);
  assert.equal(s.current.name, typed);
  s.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('old histories with the mail data in the user message are cleaned on load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-v054-old-'));
  const s = new Sessions(process.cwd(), dir);
  s.local('x', 'y');
  s.current.events[0].data =
    'maillerimi kontrol eder misin\n\nCharles kullanıcının bağlı mail hesaplarından son mailleri okudu.\n<mail_verisi>\nTemu\n</mail_verisi>';
  s.close();
  s.stop();
  const again = new Sessions(process.cwd(), dir);
  const room = [...again.rooms.values()].find((r) => r.events.length);
  assert.equal(room.events[0].data, 'maillerimi kontrol eder misin');
  again.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Charles' own question and the answer reach the AI on the next message", async () => {
  const s = new Sessions(process.cwd());
  const sent = fakeSend(s);
  await s.send({ cwd: process.cwd(), model: 'test', mode: 'chat', prompt: 'Merhaba' });
  // calendar suggestion written by Charles, then answered with a button
  s.local('', '📅 “Seminer” e-postasında bir tarih yakaladım: 22 Ekim. Takvime ekleyeyim mi?');
  s.local('Gerek yok', 'Peki, eklemedim.');
  assert.equal(s.current.events.filter((e) => e.type === 'history-user' && !e.data).length, 0);
  await s.send({ cwd: process.cwd(), model: 'test', mode: 'chat', prompt: 'Neden sordun?' });
  assert.match(sent[1].prompt, /Seminer/);
  assert.match(sent[1].prompt, /Gerek yok/);
  assert.match(sent[1].prompt, /Neden sordun/);
  await s.send({ cwd: process.cwd(), model: 'test', mode: 'chat', prompt: 'Teşekkürler' });
  assert.doesNotMatch(sent[2].prompt, /Seminer/);
  s.stop();
});

test('typed answers map to the open question’s buttons', () => {
  const { typedChoice } = loadTs('src/chat/proposals.ts');
  const calendar = [{ id: 'calendar', primary: true }, { id: 'remind' }, { id: 'no' }];
  assert.equal(typedChoice('hayır', calendar), 'no');
  assert.equal(typedChoice('Hayır, teşekkürler.', calendar), 'no');
  assert.equal(typedChoice('hatırlatma kurma', calendar), 'no');
  assert.equal(typedChoice('gerek yok', calendar), 'no');
  assert.equal(typedChoice('evet', calendar), 'calendar');
  assert.equal(typedChoice('Evet ekle!', calendar), 'calendar');
  assert.equal(typedChoice('sadece hatırlat', calendar), 'remind');
  assert.equal(typedChoice('hatırlatma kur', calendar), 'remind');
  assert.equal(typedChoice('bugün hava nasıl', calendar), null);
  assert.equal(
    typedChoice('hayır ama 21 Ekim akşamı hatırlat bana lütfen olur mu', calendar),
    null,
  );
  const quota = [{ id: 'gemini:pro', primary: true }, { id: 'stay' }];
  assert.equal(typedChoice('olur', quota), 'gemini:pro');
  assert.equal(typedChoice('böyle kalsın', quota), 'stay');
  assert.equal(typedChoice('sadece hatırlat', quota), null);
});

test('v0.5.5 image progress estimate rises smoothly and never claims 100 %', () => {
  const { estimate } = loadTs('src/chat/image-card.ts');
  assert.equal(estimate(0, 40000), 0);
  const mid = estimate(20000, 40000);
  assert.ok(mid > 50 && mid < 80, String(mid));
  assert.ok(estimate(40000, 40000) >= 85);
  assert.equal(estimate(10 * 60000, 40000), 95);
  let last = -1;
  for (let t = 0; t < 120000; t += 1000) {
    const p = estimate(t, 30000);
    assert.ok(p >= last);
    last = p;
  }
});
