# ProjectCharles v0.6.4 Beta

> **English:** Charles is an animated AI companion that lives on the Windows 10/11 desktop
> (Electron). A little Slime character reacts to what you and the AI are doing; the island at
> the top of the screen shows weather, music, quota and important mail, and opens into a chat
> and project workspace. The interface is available in Turkish and English. See
> *Running from source* below; all personal data stays in `%APPDATA%\Charles`, never in this
> folder.

Windows 10/11 (x64) masaüstünde yaşayan animasyonlu yapay zekâ asistanı. Fikir ve yön: **HzPederPan**.

Küçük adacıkta hava durumu, Spotify, seçili yapay zekânın kalan kullanım hakkı ve önemli
e-posta baloncukları görünür. Genişletince sohbet ve proje çalışma alanına dönüşür.
Slime karakteri konuşmaya ve yapılan işe göre mimik değiştirir.

## Başka bir bilgisayara kurulum

Kurulum klasörünü (Install.cmd + install.ps1 + Charles.zip) diğer bilgisayara kopyala ve
**Install.cmd** dosyasına çift tıkla. Charles `C:\ProjectCharles v0.6.4 Beta` klasörüne kurulur,
masaüstü ve Başlat menüsü kısayolu oluşturulur. Charles klasörünün tamamını kopyaladıysan aynı
dosya bu klasörün içinde de çalışır.

## Başlatma

1. Eski Charles açıksa sistem tepsisinden **Çıkış** yap (aynı anda yalnızca bir Charles çalışır).
2. Bu klasörde **Start-Charles.cmd** dosyasını çalıştır. Node.js gerekmez.
3. İstersen **Create-Desktop-Shortcut.vbs** ile masaüstüne kısayol oluştur.
   Windows açılışında başlatmak için: Ayarlar → **Windows açılınca başlat**.

## Kaynak koddan çalıştırma (GitHub) · Running from source

GitHub’daki depo yalnızca kaynak kodu içerir; `node_modules/`, `dist/`, `models/` ve `tools/`
klasörleri büyük olduğu ya da bilgisayarda üretildiği için depoda yoktur. Gereken:
Windows 10/11 x64 ve [Node.js](https://nodejs.org) 22 veya üstü.

```cmd
npm ci
npm run setup
npm run build
npm start
```

İsteğe bağlı: bilgisayarda çalışan konuşma tanıma (Whisper) için `npm run setup:voice`
(yaklaşık 500 MB indirir). Testler: `npm test`.

## Verilerin nerede?

Sohbet geçmişi, ayarlar, hafıza ve hesap bağlantıları bu klasörde değil,
**`%APPDATA%\Charles`** içinde tutulur (Gezgin adres çubuğuna yazıp açabilirsin).

- Yeni bir sürümü başka klasöre kurduğunda aynı verileri kullanmaya devam eder.
- Başka bir bilgisayarda ilk açılışta bu klasör yoksa otomatik oluşturulur.
- Eklenti hesapları Windows ile şifrelenir; başka bilgisayarda bunları yeniden bağlaman gerekir.
- **Reset-Charles.cmd** ayarları sıfırlar (önce yedek alır ve onay ister). Normal kullanımda gerekmez.

## Bu sürümde neler var?

- Adacık: solda yalnızca kalan kullanım (Codex · Gemini · Claude), sağda hava durumu ve Spotify.
- Önemli e-postalar adacığın altında baloncukla gelir; tıklayınca Charles e-postayı anlatır.
  Sohbette "önemli mail var mı?" gibi sorular her yapay zekâda bağlı hesaplarından yanıtlanır.
- Masaüstüne çıkan Slime daha büyük ve her zaman en üstte; ayarlar yeni tasarımda.
- Düğmeler daha hızlı tepki verir; Claude ve Gemini yanıtlarında da Slime animasyonları çalışır.
- v0.5.3: E-postadaki son tarihleri takvime ekleyip önceden hatırlatma önerisi; bilgisayar
  zorlanınca terleyen Slime; kota azalınca başka yapay zekâya geçme önerisi; proje modunda
  Claude, Gemini ve Cursor için dosya araçları.
- v0.5.4: Mail verisi artık sohbet geçmişinde görünmüyor; takvim sorusuna yazılan
  “evet / hayır” cevapları doğru anlaşılıyor.
- v0.5.5: Hafif akrilik (buzlu cam) tema; yüzdeli görsel oluşturma kartı ve görseller için
  İndir · Kopyala · Büyüt düğmeleri.
- **v0.6.0: Yeni karakter Slime** — 7 renk, bıyıklı/bıyıksız, Fötr şapka; yeni simge ve sesler.
  Ayarlar → Görünüm → **Slime stüdyosu**.
- v0.6.1: Aksesuarlar Şapka · Göz · Yüz · Diğer kategorilerinde; farklı kategorilerdekiler
  birlikte takılabiliyor. Yeni aksesuar: Tek gözlük.
- v0.6.2: Masaüstündeki Slime için jöle fiziği (fırlatma, sekme, zıplama, titreme);
  ilk açılışta Slime’ın kendini tanıttığı tanışma turu; muz ve büyük güneş gözlüğü.
- v0.6.3: Özel günlerde (19 Mayıs, 30 Ağustos, 29 Ekim, 10 Kasım) Slime’ın elinde Türk bayrağı;
  İngilizce arayüzde Türkçe kalan paneller çevrildi.
- v0.6.4: GitHub’a hazır: İngilizce dosya adları, `.gitignore`; kapsamlı hata testi ve düzeltmeler.

Tüm değişiklikler: **CHANGELOG.md** · GitHub’a yükleme: **docs/GITHUB.md** · Ayrıntılı kullanım: **docs/USER-GUIDE.md** ·
Eklenti kurulumu: **docs/PLUGINS-SETUP.md** · Geliştirici rehberi: **DEVELOPMENT.md**

## Lisans

Kod ve tasarım hakları **HzPederPan**'a aittir: Charles, Slime karakteri, simge ve sesler
(**LICENSE**, **LICENSE-ASSETS.md**). Kişisel kullanım serbesttir; başkalarına dağıtmak yazılı izin
gerektirir. Üçüncü taraf bileşenlerin lisansları **THIRD-PARTY-NOTICES.md**'de listelenir.
Bu resmî bir OpenAI, Anthropic veya Google ürünü değildir.
