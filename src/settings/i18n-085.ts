export const english085: Record<string, string> = {
  "\u0130ndirme": "Download",
  "\u0130nternetten video, ses ve dosya indirip \u0130ndirilenler klas\xF6r\xFCne kaydeder; bunun i\xE7in Charles\u2019\u0131n yt-dlp ve FFmpeg ara\xE7lar\u0131n\u0131 \xE7al\u0131\u015Ft\u0131r\u0131r, indirme kuyru\u011Funu g\xF6rebilir ve y\xF6netebilir. \u0130stersen panoya kopyalad\u0131\u011F\u0131n ba\u011Flant\u0131lar\u0131 da izler.":
    "Downloads videos, audio and files from the internet into your Downloads folder, using Charles\u2019 yt-dlp and FFmpeg tools; it can see and manage the download queue. If you want, it also watches links you copy.",
  "Bu API yaln\u0131zca etkin Charles Download mod\xFCl\xFCne a\xE7\u0131kt\u0131r.":
    "This API is only available to the enabled Charles Download module.",
  "Charles Download host eklentisi kurulu de\u011Fil.": "The Charles Download host extension is not installed.",
  "Kaydedilen dosya bulunamad\u0131.": "The saved file was not found.",
  "Eklerin metni bir mesaj i\xE7in \xE7ok uzun (toplam en fazla 1.000.000 karakter). Daha az dosya ekle ya da belgeleri ayr\u0131 mesajlarda g\xF6nder.":
    "The attachments\u2019 text is too long for one message (at most 1,000,000 characters in total). Attach fewer files or send the documents in separate messages.",
  "Form\xFCl\xFC kopyala": "Copy formula",
  "Form\xFCl\xFC kopyalamak i\xE7in t\u0131kla": "Click to copy the formula",
  "Form\xFCl kopyaland\u0131.": "Formula copied.",
  "Sesli g\xF6r\xFC\u015Fme a\xE7\u0131kken e-posta a\xE7\u0131lamaz. G\xF6r\xFC\u015Fme bitince tekrar dene.":
    "An e-mail can\u2019t be opened during a voice conversation. Try again when it ends.",
  "Bir mesaj g\xF6nderiliyor; birka\xE7 saniye sonra e-postay\u0131 tekrar a\xE7.":
    "A message is being sent; open the e-mail again in a few seconds.",
  "Ek talimat \xB7 s\u0131rada": "Extra instruction \xB7 queued",
  "Kotay\u0131 okumak i\xE7in yenile": "Refresh to read the quota",
  "Gemini bu hesap i\xE7in 5 saatlik kota verisi payla\u015Fm\u0131yor.":
    "Gemini does not share 5-hour quota data for this account.",
  "G\xFCncelleyici ba\u015Flat\u0131lamad\u0131; Charles a\xE7\u0131k b\u0131rak\u0131ld\u0131.":
    "The updater could not be started; Charles was left open.",
  "\u0130\u015Flem": "Step",
  "Bir seferde tek \xE7al\u0131\u015Fma klas\xF6r\xFC belirt; di\u011Fer klas\xF6r\xFC ayr\u0131 bir mesajda se\xE7ebilirsin.":
    "Name one working folder at a time; you can choose the other folder in a separate message.",
  "PDF i\xE7inde okunabilir metin yok. Taranm\u0131\u015F belgede \xF6nce OCR kullan veya sayfalar\u0131 g\xF6rsel olarak GPT\u2019ye ekle.":
    "The PDF has no readable text. For a scanned document use OCR first, or add the pages to GPT as images.",
  "En fazla 50 dosya se\xE7in.": "Choose at most 50 files.",
  "En fazla 50 dosya eklenebilir.": "At most 50 files can be attached.",
  "Bu mod\xFCl\xFCn \u201C\u0130ndirme\u201D izni yok (manifest.json \u2192 permissions).":
    "This module does not have the \u201CDownload\u201D permission (manifest.json \u2192 permissions)."
};

export const patterns085: [RegExp, (...m: string[]) => string][] = [
  [
    /^(.+): PDF okunamadı; dosya bozuk veya parola korumalı olabilir\.$/,
    (_, f) => `${f}: the PDF could not be read; it may be damaged or password-protected.`
  ]
];
