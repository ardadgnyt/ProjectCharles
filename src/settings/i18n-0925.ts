// v0.9.25: mail sorting by AI is a choice, the reload notice, stop and failure notes.
export const english0925: Record<string, string> = {
  'Önemi yapay zekâ belirlesin (yeni e-postanın göndereni, konusu ve kısa önizlemesi seçili yapay zekâya gider)':
    'Let the AI decide what matters (the sender, subject and a short preview of new mail go to the selected AI)',
  'Hesabında önemli işaretli e-postalar ve bu kelimeleri içerenler adacığın altında baloncuk olarak görünür; bu sıralama bilgisayarında yapılır. Baloncuğa tıklayınca Charles e-postayı sana anlatır.':
    'Mail your account marks as important and mail with these words appears as a bubble under the island; this sorting happens on your computer. Click a bubble and Charles explains the email.',
  'Yanıt alınamadı:': 'No answer:',
  'Codex işi tamamlayamadı.': 'Codex could not finish the task.',
  'Durdur: çalışan komut da sonlandırıldı.': 'Stop: the running command was ended too.',
  'Arayüz beklenmedik biçimde kapandı ve yeniden açıldı. Son eklediğin dosya çok büyük olabilir.':
    'The interface closed unexpectedly and was opened again. The file you added last may be too large.',
  // pictures and the + menu on every AI
  'Seçili yapay zekâ bunu yapamıyor.': 'The selected AI cannot do this.',
  'Bu bağlantı görsel alamıyor.': 'This connection cannot take pictures.',
  'Çizim resme dönüştürülemedi.': 'The drawing could not be turned into a picture.',
  'Görsel oluşturma bu yapay zekâ bağlantısında çalışmıyor.': 'Creating images does not work with this AI connection.',
  'Web’de arama bu yapay zekâ bağlantısında çalışmıyor.': 'Web search does not work with this AI connection.',
  'Derin araştırma bu yapay zekâ bağlantısında çalışmıyor.': 'Deep research does not work with this AI connection.',
  'Cursor görselleri güvenle açamıyor: kurulum dosyaları eksik. Kurulumu onar ya da başka bir model seç.':
    'Cursor cannot open pictures safely: setup files are missing. Repair the installation or choose another model.',
  'EVREN bir mesajda en fazla 8 görsel alabilir.': 'EVREN takes at most 8 pictures in one message.',
};
export const patterns0925: [RegExp, (...a: string[]) => string][] = [
  [/^(.+): GIF açılamadı; dosya bozuk olabilir\.$/, (_, f) => `${f}: the GIF could not be opened; the file may be damaged.`],
  [
    /^Bu Cursor modeli (.+) planında kullanılamıyor\. .+ planında yalnız şunlar var: (.+)\. Model listesi güncelleniyor; listeden başka bir model seç\.$/,
    (_, tier, models) => `This Cursor model is not included in the ${tier} plan. ${tier} includes only: ${models}. The model list is being updated; choose another model.`,
  ],
  [
    /^Antigravity bu iş için Charles’ın bu sohbette vermediği bir izin istedi \((.+)\)\. İsteği izin gerektirmeyecek biçimde yeniden yaz ya da Proje modunu kullan\.$/,
    (_, what) => `Antigravity asked for a permission Charles does not give in this chat (${what}). Rephrase the request so it needs no permission, or use Project mode.`,
  ],
];
