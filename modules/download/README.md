# Charles Download

HzPederPan için geliştirilen Charles indirme modülü. Koyu cam yüzeyler, yeşil vurgular,
pano bağlantı kartı, MP4/MP3 ve zaman aralığıyla kesme.

## Kurulum

**Charles → Ayarlar → Modüller → Modül yükle → download-1.0.0.zip.** Ayrıntılar: KURULUM.md.

## Kullanım

- Desteklenen bir video/dosya bağlantısını kopyala; kart Charles adacığının hemen altında açılır.
  Panel açıkken beklenir, adacık küçülünce gösterilir.
- **Video indir** (⌄ ile kalite ve tahmini boyut), **Ses indir** (MP3), **Video kes**
  (tutamaçları sürükle, ok tuşlarıyla 1 sn / Shift ile 10 sn, ya da zaman balonuna yaz).
- İndirme, kesme ve tamamlanma durumu aynı kartta görünür; duraklat/devam, iptal, klasörde göster.
- Modül penceresi: bağlantı yapıştırma, aynı seçenekler ve indirme listesi.

## Sınırlar

- Kesitlerde yt-dlp / FFmpeg yalnızca seçilen zaman aralığını uzaktan ister. Yakın anahtar kareler ve medya başlıkları ek veri gerektirebilir; tam video önce indirilmez.
  Yalnızca seçilen saniyeler kadar ağ trafiği kullanıldığı iddia edilmez.
- MP4 H.264/AAC olarak yeniden kodlanır. Büyük 4K dosyalarda dönüştürme zaman alabilir.
- Devam özelliği sunucu/yt-dlp desteğine bağlıdır. HTTP Range yoksa doğrudan dosya baştan indirilir.
- Dönüştürme aşamasında iptal vardır, duraklatma yoktur. Yeniden açılan yarım işler kullanıcı devam edene kadar bekler.
- Önizleme oynatıcısı, GIF, oynatma listesi, tarayıcı indirmelerini yakalama, hesap/cookie aktarımı ve canlı yayın kaydı yoktur.
- DRM koruması aşılmaz; yalnızca indirme hakkın olan içerikleri kaydet.
- Site desteği yt-dlp sürümüne bağlıdır; her sitenin her videosu için çalışma garantisi yoktur.
- İki eşzamanlı iş; en fazla 50 bitmemiş iş ve son 200 kayıt.

## Geliştirme

```powershell
npm install
npm test            # gerçek medya testleri için: $env:CHARLES_DOWNLOAD_TOOLS="C:\...\Charles\tools\download"
npm run pack        # dist/ + download-1.0.0.zip + .sha256
```

`src/`: modül arayüzü (tam pencere ve `?compact=1` adacık kartı). `host/`: Charles'a kurulan
indirme motoru ve pano/kart köprüsü. Kart, yüksekliğini sayfa başlığıyla bildirir
(`charles-download|h=…|hold=…`); köprü pencereyi buna göre boyutlandırıp adacığın altına yerleştirir.

yt-dlp ve FFmpeg bu klasörde tutulmaz ve modül ZIP'ine girmez; Charles tarafından sağlanır
(`tools/download/`). Lisans metinleri `licenses/download/`.

## Doğrulama

`npm test`, oluşturulmuş yerel test videosuyla gerçek MP4/MP3 kesit üretimini ve
çıktıların çözülerek süre kontrolünü yapar. HTTP Range devam, Range'i yok sayan sunucu,
404, kuyruk kalıcılığı ve girdi doğrulamasını da kapsar.
`scripts/ui-check.cjs`, yalıtılmış Electron profiliyle gerçek modül preload/IPC hattını dener;
sonuçlar ve ekran görüntüleri `.test-output/` altında kalır, ZIP'e eklenmez.

## Kaynaklar

- Tasarım/akış referansı: https://www.lynxdownloadmanager.com/
- İndirme motoru: https://github.com/yt-dlp/yt-dlp
- Dönüştürme/kesme: https://ffmpeg.org/

Lynx'in kodu veya markalı varlıkları kullanılmadı; arayüz bu proje için yazıldı.
