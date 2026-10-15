// Validates the optional task label sent with a chat message.
const instructions = {
  web: 'Kullanıcı Web’de arama seçti. Bu soruyu mevcut web arama aracıyla güncel kaynaklardan araştır. Gerçekten açtığın kaynakları bağlantılarıyla belirt. Araç kullanılamıyorsa bunu açıkça söyle.',
  research:
    'Kullanıcı Derin araştırma seçti. Charles araştırma modunda mevcut web aracıyla birden fazla güvenilir kaynağı incele, iddiaları karşılaştır, tarih ve belirsizlikleri belirt, kaynak bağlantılarıyla kapsamlı bir rapor hazırla. Bu mod mevcut Codex modeliyle çalışır; ayrı ChatGPT Deep Research hizmetini çağırdığını iddia etme. Araç yoksa açıkça belirt.',
  image:
    'Kullanıcı Görsel oluştur seçti. Mevcut yerleşik image_generation aracıyla kullanıcının tarifindeki görseli üret veya ekli görseli düzenle. Kullanılamıyorsa sebebini söyle; ücretli API alternatifi çalıştırma ve görsel üretmiş gibi davranma.',
};
function taskMode(task = '') {
  if (task && !Object.hasOwn(instructions, task)) throw Error('Geçersiz araç seçimi.');
  return {
    instruction: instructions[task] || '',
    config:
      task === 'web' || task === 'research'
        ? { web_search: 'live' }
        : task === 'image'
          ? { 'features.image_generation': true }
          : null,
  };
}
module.exports = { taskMode };
