# Charles Download 1.0.0 — kurulum

1. Charles → Ayarlar → Modüller → Modül yükle → `download-1.0.0.zip`. Aynı sürüm numarasıyla yeniden yükleme onayını kabul et.
2. Bir video veya dosya bağlantısı kopyala: seçenek kartı Charles adacığının hemen altında açılır
   (Video indir / kalite, Ses indir, Video kes). Adacık paneli açıkken kart, adacık küçülünce görünür.
3. Tüm seçenekler ve indirme listesi için kartın sağındaki ⌄ düğmesine bas ya da modülü aç.

Bu ZIP yalnızca arayüzü içerir (HTML/JS/CSS/SVG/JSON). İndirme altyapısı (`host/bridge.cjs`,
`host/engine.cjs`) ve indirme araçları (yt-dlp, FFmpeg) Charles tarafında bulunur; modül klasörü
araç tutmaz. Kartın adacığın altına yerleşmesi ve kapak resmi/boyut bilgisi, güncel `host/`
dosyalarının Charles'a kurulmasını gerektirir. Araçlar Charles'ta yoksa modül "Araçlar eksik"
uyarısı gösterir.
