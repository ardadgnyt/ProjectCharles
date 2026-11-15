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
// v1.0.0: a turn that carries outside content (mail, attached file, page) gets no web tools: a
// planted instruction could otherwise send what it read to an address of its choice. Image
// creation stays: no connection can reach the network through it (Codex image_generation, agy's
// own generator, or an SVG whose outside links cleanSvg removes).
const WEB_TASKS = ['web', 'research'];
function untrustedTask(task = '', untrusted = false) {
  return untrusted && WEB_TASKS.includes(task) ? { task: '', dropped: task } : { task, dropped: '' };
}
module.exports = { taskMode, untrustedTask };
