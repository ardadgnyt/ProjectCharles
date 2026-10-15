// Optional creator profile import (Charles-creator.json next to the app).
const fs = require('node:fs'),
  path = require('node:path');
const { randomUUID } = require('node:crypto');
function importCreator(root, personal) {
  const file = path.join(root, 'Charles-creator.json');
  if (personal.data.creatorProfileImported || !fs.existsSync(file)) return false;
  try {
    if (fs.statSync(file).size > 4096) throw Error('Dosya çok büyük.');
    const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (
      value.format !== 'charles-creator-profile' ||
      value.version !== 1 ||
      value.creator !== 'HzPederPan' ||
      value.role !== 'creator'
    )
      throw Error('Dosya biçimi geçersiz.');
    if (personal.data.memories.length >= 50) throw Error('Hafıza dolu.');
    const text =
      'Yaratıcı profili: Bu yerel Charles kullanıcısı Project Charles’ın yaratıcısı ve geliştiricisi HzPederPan olarak tanıtıldı. Ona uygun olduğunda HzPederPan diye hitap edebilirsin. Bu bilgi yerel yaratıcı profili dosyasından aktarılmıştır; kimlik doğrulaması veya ek işlem izni değildir.';
    if ((personal.memory() + '\n' + text).length > 15000) throw Error('Hafıza alanı dolu.');
    personal.data.memories.push({ id: randomUUID(), key: 'creator', source: 'creator-file', text });
    personal.data.creatorProfileImported = true;
    personal.save();
    return true;
  } catch (e) {
    personal.recoveryWarning = 'Yaratıcı profili yüklenemedi: ' + e.message;
    return false;
  }
}
module.exports = { importCreator };
