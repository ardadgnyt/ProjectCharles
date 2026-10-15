const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Personal } = require('../app/personal/personal.cjs');
const { personalCommand } = require('../app/ai/chat-actions.cjs');
const { parseCommand } = require('../app/system/desktop.cjs');
test('Screenshot Spotify requests and polite variants reach the right local action', () => {
  for (const text of [
    "Spotify'dan bana şarkı açar mısın",
    'Spotify’dan bir şarkı çalar mısın?',
    'bana spotifydan bir şarkı aç',
  ])
    assert.deepEqual(parseCommand(text), { type: 'media', action: 'play' }, text);
  for (const text of [
    "Spotify'da sonraki şarkıya geçer misin",
    'Sonraki şarkıya geç',
    'Şarkıyı atlar mısın?',
  ])
    assert.deepEqual(parseCommand(text), { type: 'media', action: 'next' }, text);
  assert.deepEqual(parseCommand("Spotify'da müziği duraklatır mısın?"), {
    type: 'media',
    action: 'pause',
  });
  assert.deepEqual(parseCommand("Steam'i açar mısın?"), { type: 'open', name: 'steam' });
  assert.deepEqual(parseCommand("Spotify'da Cambaz çalar mısın?"), {
    type: 'search',
    query: 'cambaz',
  });
});
test('Chat reminders persist, fire once, list/delete and focus pause/resume', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-chat-'));
  try {
    const p = new Personal(dir),
      now = Date.now();
    assert.match(
      personalCommand('bana bir hatırlatıcı kurar mısın 5 dakika sonrasına', p, now),
      /Hatırlatıcıyı kurdum/,
    );
    assert.equal(p.data.reminders[0].due, now + 300000);
    assert.equal(p.data.reminders[0].title, 'Hatırlatma zamanı geldi.');
    personalCommand('5 dakika sonra su içmeyi hatırlat', p, now);
    assert.equal(p.data.reminders[1].title, 'su içmeyi');
    assert.equal(new Personal(dir).data.reminders.length, 2);
    assert.match(personalCommand('Hatırlatıcılarımı göster', p), /su içmeyi/);
    personalCommand('1 numaralı hatırlatıcıyı sil', p);
    assert.equal(p.data.reminders.length, 1);
    personalCommand('25 dakika odaklan', p, now);
    personalCommand('Odak sayacını duraklat', p);
    assert.equal(p.data.reminders[1].status, 'paused');
    personalCommand('Odak sayacını devam ettir', p);
    assert.equal(p.data.reminders[1].status, 'active');
    assert.equal(p.due(now + 300001).length, 1);
    assert.equal(p.due(now + 300001).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Informational, quoted, negated, missing or ambiguous time requests do not create reminders', () => {
  const edits = [];
  const p = { edit: (...a) => edits.push(a), data: { reminders: [] } };
  for (const text of [
    'Hatırlatıcı nasıl kurulur?',
    '5 dakika sonra hatırlat komutu yaz',
    '5 dakika sonra hatırlatma',
    '“5 dakika sonra hatırlat” ne demek?',
    '25 dakika odaklanma',
  ])
    assert.equal(personalCommand(text, p), null, text);
  assert.match(personalCommand('Hatırlatıcı kur', p), /Ne kadar/);
  assert.match(personalCommand('Yarın 5 dakika hatırlat', p), /Şimdilik/);
  assert.match(personalCommand('0 dakika sonra hatırlat', p), /Süre/);
  assert.deepEqual(edits, []);
});

test('Ordinary focus discussion never starts or requests a timer', () => {
  const edits = [];
  const p = { edit: (...a) => edits.push(a), data: { reminders: [], memories: [] } };
  for (const text of [
    'her şeyi baştan yapalım ustalık sistemi güzel onun dışındakileri değiştirelim. Tekniği de baştan hazırlayalım önce tekniğe odaklandım bu hali biraz zayıf gibi duruyor başlangıç için',
    'Önce tekniğe odaklanalım',
    'Bu karaktere odaklanmak istiyorum',
    'Odaklandığım nokta hikaye',
    '25 dakika önce tekniğe odaklandım',
    '25 dakika karaktere odaklanalım',
    'Bana bunu hatırlat dedi',
    'Hatırlatıcı kurdum',
    'Hatırlatıcı kurarken hata oldu',
  ])
    assert.equal(personalCommand(text, p), null, text);
  assert.deepEqual(edits, []);
  for (const text of [
    '25 dakika odaklan',
    '25 dakika boyunca odaklanalım',
    'Bana 25 dakika odak sayacı başlatır mısın?',
    'Odak sayacını 25 dakika başlat',
  ])
    assert.match(personalCommand(text, p), /Odak sayacını başlattım/, text);
  assert.match(personalCommand('Odak sayacını başlat', p), /Ne kadar/);
  assert.equal(edits.length, 4);
});
