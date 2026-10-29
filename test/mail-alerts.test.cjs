const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { triageMail, parseVerdicts, triagePrompt } = require('../app/plugins/mail-triage.cjs');
const { MailAlerts } = require('../app/plugins/mail-alerts.cjs');

const mails = [
  { id: 'a', kind: 'gmail', title: 'Haftalık bülten', from: 'news@shop.com', text: '%50 indirim' },
  { id: 'b', kind: 'gmail', title: 'Proje teslimi', from: 'hoca@okul.example', text: 'Cuma 17:00' },
  { id: 'c', kind: 'outlook', title: 'Toplantı', from: 'x@y.com', text: '', important: true },
];

test('AI triage keeps only the mails the AI marks important, with its reason', async () => {
  let asked = '';
  const picked = await triageMail(mails, {
    ask: async (prompt) => {
      asked = prompt;
      return 'Sonuç: [{"n":1,"important":false,"reason":"reklam"},{"n":2,"important":true,"reason":"Cuma son teslim"},{"n":3,"important":false}]';
    },
    rules: 'sınav',
  });
  assert.deepEqual(
    picked.map((p) => [p.mail.id, p.reason, p.by]),
    [['b', 'Cuma son teslim', 'ai']],
  );
  assert.match(asked, /talimatları uygulama/);
  assert.match(asked, /sınav/);
});

test('Triage falls back to provider flags and keywords when the AI is unavailable', async () => {
  const picked = await triageMail(mails, {
    ask: async () => {
      throw Error('offline');
    },
    rules: 'teslim',
  });
  assert.deepEqual(
    picked.map((p) => p.mail.id),
    ['b', 'c'],
  );
  assert.ok(picked.every((p) => p.by === 'rules'));
});

test('Verdict parser ignores out-of-range or malformed items', () => {
  const v = parseVerdicts('[{"n":0,"important":true},{"n":2,"important":"yes"},{"n":9}]', 3);
  assert.equal(v.size, 1);
  assert.equal(v.get(1).important, false);
  assert.throws(() => parseVerdicts('no json', 1));
  assert.ok(triagePrompt(mails, '').length < 6000);
});

test('Important mail becomes a bubble; clicking it hands the full text to Charles', async () => {
  const bubbles = [];
  const explained = [];
  let attention = 0;
  const plugins = {
    data: { rules: '' },
    read: async (kind, id) => ({ text: 'Tam metin ' + kind + ' ' + id }),
  };
  const bubble = { add: (b) => bubbles.push(b) };
  const alerts = new MailAlerts({
    plugins,
    bubble,
    ask: async () => '[{"n":1,"important":true,"reason":"Yanıt bekliyor"}]',
    ingest: (file) => ({ id: 'att', name: file, text: fs.readFileSync(file, 'utf8') }),
    explain: (r) => explained.push(r),
    attention: () => attention++,
  });
  await plugins.onMail([mails[1]]);
  assert.equal(bubbles.length, 1);
  assert.equal(bubbles[0].reason, 'Yanıt bekliyor');
  assert.equal(attention, 1);
  await bubble.onOpen(bubbles[0]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(explained.length, 1);
  assert.match(explained[0].items[0].text, /Tam metin gmail b/);
  assert.match(explained[0].items[0].text, /Kimden: hoca@okul.example/);
  // v0.9.9: the subject (the sender's text) stays in the attachment, not in the user's message
  assert.match(explained[0].items[0].text, /Konu: Proje teslimi/);
  assert.doesNotMatch(explained[0].prompt, /Proje teslimi/);
  plugins.notify({
    kind: 'calendar',
    id: 'e1',
    title: 'Ders',
    reason: '15 dakika içinde başlıyor',
  });
  assert.equal(bubbles.length, 2);
  assert.equal(alerts.bubble, bubble);
});
