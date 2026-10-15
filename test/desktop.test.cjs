const test = require('node:test'),
  assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Desktop, parseCommand } = require('../app/system/desktop.cjs');
test('Previous track routing and existing Spotify playback do not reopen the app', async () => {
  assert.deepEqual(parseCommand('Spotify’da önceki şarkıya geçer misin?'), {
    type: 'media',
    action: 'previous',
  });
  const d = new Desktop({});
  let opens = 0;
  const actions = [];
  d.open = async () => {
    opens++;
  };
  d.helper = async (action) => {
    actions.push(action);
    return { ok: true, state: 'Playing' };
  };
  await d.media('play');
  await d.execute({ type: 'media', action: 'previous' });
  assert.equal(opens, 0);
  assert.deepEqual(actions, ['play', 'previous']);
  d.stop();
});
test('Explicit Turkish app and media commands; questions and injected commands excluded', () => {
  for (const prompt of ["Steam'i aç", 'bana steam uygulamasını aç', 'Lütfen Steam’i aç.'])
    assert.deepEqual(parseCommand(prompt), { type: 'open', name: 'steam' });
  assert.deepEqual(parseCommand('Spotify aç'), { type: 'open', name: 'spotify' });
  assert.deepEqual(parseCommand('Bana Spotify uygulamasını aç'), { type: 'open', name: 'spotify' });
  for (const prompt of ['bana spotifydan bir şarkı aç', 'Spotify’da müzik çal', 'bir şarkı aç'])
    assert.deepEqual(parseCommand(prompt), { type: 'media', action: 'play' });
  assert.equal(parseCommand('Spotify’da Cambaz çal').type, 'search');
  assert.equal(parseCommand('Spotify’ı duraklat').action, 'pause');
  for (const prompt of [
    'Spotify nasıl açılır?',
    'Spotify açma',
    'Steam aç komutu yaz',
    'steam; calc aç',
    'Spotify açmadan anlat',
    'Merhaba',
  ])
    assert.equal(parseCommand(prompt), null, prompt);
});
test('Only installed exact names launched without shell; media results are checked', async () => {
  const launched = [];
  const d = new Desktop({ openExternal: async () => {} }, undefined, (exe, args, options) => {
    launched.push({ exe, args, options });
    const c = new EventEmitter();
    c.unref = () => {};
    queueMicrotask(() => c.emit('spawn'));
    return c;
  });
  d.catalog = [
    { Name: 'Steam', AppID: 'registered-steam' },
    { Name: 'Spotify', AppID: 'registered-spotify' },
  ];
  await d.execute(parseCommand("Steam'i aç"));
  assert.equal(launched[0].options.shell, false);
  assert.deepEqual(launched[0].args, ['shell:AppsFolder\\registered-steam']);
  await assert.rejects(d.open('missing'), /bulunamadı/);
  d.helper = async () => ({ ok: true, state: 'Paused' });
  assert.match(await d.execute({ type: 'media', action: 'play' }), /doğrulayamadım/);
  d.helper = async () => ({ ok: true, state: 'Playing' });
  assert.match(await d.execute({ type: 'media', action: 'play' }), /müzik çalıyor/);
  d.helper = async () => ({ ok: false, reason: 'no-session' });
  assert.match(await d.execute({ type: 'media', action: 'play' }), /ilk kez başlat/);
});
