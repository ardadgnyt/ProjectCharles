// v0.8.5: English for the new texts and for the 0.8.1–0.8.4 texts that had none.
// The other languages (de, fr, es, zh) translate from this English (src/settings/lang/*).
export const english085: Record<string, string> = {
  "İndirme": "Download",
  "İnternetten video, ses ve dosya indirip İndirilenler klasörüne kaydeder; bunun için Charles’ın yt-dlp ve FFmpeg araçlarını çalıştırır, indirme kuyruğunu görebilir ve yönetebilir. İstersen panoya kopyaladığın bağlantıları da izler.": "Downloads videos, audio and files from the internet into your Downloads folder, using Charles’ yt-dlp and FFmpeg tools; it can see and manage the download queue. If you want, it also watches links you copy.",
  "Bu API yalnızca etkin Charles Download modülüne açıktır.": "This API is only available to the enabled Charles Download module.",
  "Charles Download host eklentisi kurulu değil.": "The Charles Download host extension is not installed.",
  "Kaydedilen dosya bulunamadı.": "The saved file was not found.",
  "Eklerin metni bir mesaj için çok uzun (toplam en fazla 1.000.000 karakter). Daha az dosya ekle ya da belgeleri ayrı mesajlarda gönder.": "The attachments’ text is too long for one message (at most 1,000,000 characters in total). Attach fewer files or send the documents in separate messages.",
  "Formülü kopyala": "Copy formula",
  "Formülü kopyalamak için tıkla": "Click to copy the formula",
  "Formül kopyalandı.": "Formula copied.",
  "Sesli görüşme açıkken e-posta açılamaz. Görüşme bitince tekrar dene.": "An e-mail can’t be opened during a voice conversation. Try again when it ends.",
  "Bir mesaj gönderiliyor; birkaç saniye sonra e-postayı tekrar aç.": "A message is being sent; open the e-mail again in a few seconds.",
  "Ek talimat · sırada": "Extra instruction · queued",
  "Kotayı okumak için yenile": "Refresh to read the quota",
  "Antigravity bu hesap için 5 saatlik kota verisi paylaşmıyor.": "Antigravity does not share 5-hour quota data for this account.",
  "Güncelleyici başlatılamadı; Charles açık bırakıldı.": "The updater could not be started; Charles was left open.",
  "İşlem": "Step",
  "Bir seferde tek çalışma klasörü belirt; diğer klasörü ayrı bir mesajda seçebilirsin.": "Name one working folder at a time; you can choose the other folder in a separate message.",
  "PDF içinde okunabilir metin yok. Taranmış belgede önce OCR kullan veya sayfaları görsel olarak GPT’ye ekle.": "The PDF has no readable text. For a scanned document use OCR first, or add the pages to GPT as images.",
  "En fazla 50 dosya seçin.": "Choose at most 50 files.",
  "En fazla 50 dosya eklenebilir.": "At most 50 files can be attached.",
  "Bu modülün “İndirme” izni yok (manifest.json → permissions).": "This module does not have the “Download” permission (manifest.json → permissions).",
};
export const patterns085: [RegExp, (...m: string[]) => string][] = [
  [/^(.+): PDF okunamadı; dosya bozuk veya parola korumalı olabilir\.$/, (_, f) => `${f}: the PDF could not be read; it may be damaged or password-protected.`],
];
