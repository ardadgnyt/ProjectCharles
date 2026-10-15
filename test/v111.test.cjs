const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { conversationTools } = require('../app/ai/conversation-tools.cjs'),
  { Personal } = require('../app/personal/personal.cjs'),
  { Library } = require('../app/files/library.cjs');
test('Conversation adds folders, searches, lists and removes roots without settings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-chat-'));
  try {
    const personal = new Personal(dir),
      library = new Library(personal);
    let picks = 0;
    const ctx = {
      personal,
      library,
      desktop: {},
      pickFolder: async () => {
        picks++;
        return dir;
      },
      changed: () => {},
    };
    fs.writeFileSync(path.join(dir, 'deney.txt'), 'doğrultucu');
    let r = await conversationTools('Doğrultucu raporu neredeydi?', ctx);
    assert(r.search.items.some((i) => i.name === 'deney.txt'));
    assert.equal(picks, 1);
    assert.match(
      (await conversationTools('Arama klasörlerini listele', ctx)).message,
      /Arama klasörlerin/,
    );
    await conversationTools('“' + dir + '” klasörünü aramadan çıkar', ctx);
    assert.equal(library.roots().length, 0);
    await conversationTools('Arama için klasör ekle', ctx);
    assert.equal(library.roots().length, 1);
    assert.equal(await conversationTools('klasör arama nasıl çalışır', ctx), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Conversation teaches, updates, lists and deletes only registered app macros', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-macro-'));
  try {
    const personal = new Personal(dir),
      ctx = {
        personal,
        library: new Library(personal),
        desktop: { apps: async () => [{ Name: 'Steam' }, { Name: 'Spotify' }] },
        pickFolder: async () => null,
        changed: () => {},
      };
    await conversationTools('Ben “atölyeyi aç” dediğimde Steam ve Spotify aç', ctx);
    assert.equal(personal.data.commands.length, 1);
    await conversationTools('Ben “atölyeyi aç” dediğimde Spotify aç', ctx);
    assert.deepEqual(personal.data.commands[0].apps, ['Spotify']);
    assert.match(
      (await conversationTools('Kişisel komutlarımı listele', ctx)).message,
      /atölyeyi aç/,
    );
    await assert.rejects(() => conversationTools('Ben “hata” dediğimde Bilinmeyen aç', ctx));
    await conversationTools('“atölyeyi aç” komutunu sil', ctx);
    assert.equal(personal.data.commands.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
