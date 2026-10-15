const test = require('node:test'),
  assert = require('node:assert/strict');
const { performanceIntent } = require('../app/system/performance.cjs');
test('Resource shortcuts do not capture fiction, embedded RAM letters or explanatory questions', () => {
  for (const text of [
    'Mağarayı aramaya çıkıyor. Sadece ailesinin kullanabildiği bir teknik öğreniyor.',
    'Kahraman bir büyü kullanıyor. Bu hikayeyi devam ettir.',
    'Program kullanırken bir karakter çizdim, yorumlar mısın?',
    'RAM nedir, ne için kullanılır?',
    'CPU neden bu kadar çok kullanılıyor?',
    '"Bu hafta RAM en çok ne kullandı" cümlesini çevir.',
    'RAM kullanımını gösterme',
    'Oyuncu: Ada\nYaş: 22\nIrk: İnsan\nRol: Kahraman\nRAM kullanımını göster',
    'Bir karakterin mağarayı aramaya çıktığını ve eski bir teknik kullandığını anlatan hikaye. '.repeat(
      20,
    ),
  ])
    assert.equal(performanceIntent(text), null, text);
});
test('Explicit resource history requests retain Turkish suffix and period support', () => {
  for (const [text, metric] of [
    ['Bu hafta en çok CPU’yu ne kullandı?', 'cpu'],
    ['Son bir saatte RAM ne kullandı', 'ram'],
    ['Son 1 saat GPU en çok ne kullandı', 'gpu'],
    ['Hangi uygulama RAM tüketti?', 'ram'],
    ['Bugün bellek kullanımını göster', 'ram'],
    ['Bu hafta ekran kartını en çok hangi uygulama kullandı?', 'gpu'],
    ['RAM kullanımını listele', 'ram'],
    ['İşlemci kullanımını göster', 'cpu'],
  ])
    assert.equal(performanceIntent(text)?.metric, metric, text);
});
