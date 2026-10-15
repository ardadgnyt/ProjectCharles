// Chat commands for nickname and work-topic memory.
const { normalize } = require('../system/desktop.cjs');
function remember(personal, key, text) {
  const old = personal.data.memories.find((m) => m.key === key);
  personal.edit('memory-save', { id: old?.id, text });
  const item = old || personal.data.memories.at(-1);
  item.key = key;
  item.updatedAt = Date.now();
  personal.save();
}
function memoryCommand(prompt, personal) {
  const raw = prompt.trim();
  let m = raw.match(/^bana\s+[“"']?(.+?)[”"']?\s+diye hitap et[.!]?$/iu);
  if (m) {
    const name = m[1].trim();
    if (name.length > 70) throw Error('Hitap en fazla 70 karakter olabilir.');
    remember(personal, 'address', 'Kullanıcıya ' + name + ' diye hitap et.');
    return 'Tamam ' + name + ' 😊 Hitap tercihini hatırlayacağım.';
  }
  m = raw.match(
    /^(?:bugün\s+)?(.{2,120}?)\s+(?:çalışıyoruz|çalışıyorum|çalışıyorduk|çalışacağız)[.!]?$/iu,
  );
  if (m) {
    const subject = m[1].trim();
    remember(
      personal,
      'study',
      'Çalışılan konu: ' + subject + '. Kayıt zamanı: ' + new Date().toLocaleDateString('tr-TR'),
    );
    return (
      subject + ' çalıştığımızı kaydettim 📚 Yeni sohbette de “Ne çalışıyorduk?” diye sorabilirsin.'
    );
  }
  const text = normalize(raw).replace(/[.!?]+$/, '');
  if (/^(?:bugun |en son )?ne calisiyorduk$|^nerede kalmistik$/.test(text))
    return (
      personal.data.memories.find((m) => m.key === 'study')?.text ||
      'Henüz çalışma konusu kaydetmedik. Örneğin “Bugün MAT101 çalışıyoruz” diyebilirsin.'
    );
  const del = text.match(/^(\d+) (?:numarali )?hafiza(?: kaydini)? (?:sil|unut)$/);
  if (del) {
    const item = personal.data.memories[Number(del[1]) - 1];
    if (!item) return 'Bu numarada bir hafıza kaydı yok.';
    personal.edit('memory-delete', { id: item.id });
    return 'Bu hafıza kaydını unuttum.';
  }
  return null;
}
module.exports = { memoryCommand };
