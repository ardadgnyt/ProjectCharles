# ProjectCharles v0.4.4 Beta

Designed by HzPederPan with GPT 6 Astra Asistant

Windows 10/11 x64 için masaüstü asistanı. Siyah arayüz, yerel sohbet geçmişi ve kişisel hafıza; ChatGPT hesabıyla Codex bağlantısı. GPT bulutta çalışır. Mikrofon kaydını yazıya çeviren Whisper small modeli bilgisayarında çalışır ve pakete dahildir.

## v0.4.4 Beta

Panel düğmesi basma anında tepki verir; fare tuşunu bırakmayı beklemez. Kenara yerleşimde tıklama alanı görünen panelle eşleştirildi. İlk Slime sürükleme hareketi doğrudan işlenir; seslerin ilk yüklenmesi tıklama yolundan çıkarıldı. Servisler tek kartta toplandı. Çakışan kısayolun teknik adı yerine açıklaması ve çözüm yolu gösterilir.

### Korunan özellikler

- Ayar içerikleri ortak kart tasarımında. Alan seç düğmesi ayarlardan kaldırıldı; ekran yakalama kısayolu korunur.
- Panel geçişi her karede boyut hesaplamak yerine grafik katmanında ölçeklenir. Uzun sohbetlerde yalnızca görünür mesajlar çizilir.
- Spotify karıştır/tekrar düğmeleri kutusuzdur; etkin durum simge rengiyle gösterilir.
- Küçük panelde ince kullanım halkaları, sağlayıcı adı ve hava durumu bulunur. Gemini varsayılan seçiliyken ↻ düğmesi resmi Antigravity /usage komutundan 5 saatlik ve haftalık kalan yüzdeleri yeniler. Açılış ve sağlayıcı değişiminde de okunur; Gemini için periyodik kota sorgusu yapılmaz. Gemini Live API kotası bu abonelik kotasından ayrıdır.
- Klasörler, AI sınıflandırması, sabitleme ve haftalık bilgisayar/uygulama süreleri korunur.
- Dağıtım yalnızca çalıştırma dosyalarını içerir; kaynak/test/derleme araçları ve kullanılmayan eski Gemini CLI ile ayrı Node kopyası pakete eklenmez. Yerel ses modelleri ve etkin sağlayıcı araçları korunur.

### Güncelleme

Eski Charles’ı kapat. ZIP’i yeni bir klasöre çıkarıp **Start-Charles.cmd** çalıştır; sohbetler ve hesap ayarları korunur. **Reset-Charles.cmd** yalnızca yerel ayarlarını sıfırlamak istersen kullanılmalı. Beta sürümleri 0.x; v1.0 ile beta tamamlanır.

Gemini kota kaynağı: https://www.antigravity.google/docs/cli/commands/usage

## Sıfırdan kurulum

v3.2.2 mail düzeltmesi: “Okul mailimi kontrol eder misin önemli bir mail var mı gelen” gibi birleşik sorular da Charles’ın okul maili bağlantısını kullanır. Mevcut hesap ayarlarını korumak için yeni klasörde **Start-Charles.cmd** çalıştır; **Reset-Charles.cmd** ayarları sıfırlamak içindir.

1. Eski Charles açıksa sistem tepsisinden **Çıkış** yap.
2. **ProjectCharles v0.4.4 Beta.zip** dosyasının tamamını ayıkla. ZIP'in içinden çalıştırma.
3. Çıkan klasörü kalıcı bir konuma koy. Eski kurulumun üzerine kopyalamak yerine ayrı klasör kullan.
4. Önceki Charles ayarlarını temizlemek için **setup\Reset-Charles.cmd** çalıştır. Eski yerel veriler yedeklenir; ChatGPT hesabının oturumu silinmez. İlk defa kuruyorsan **Start-Charles.cmd** de kullanılabilir.
5. İlk açılışta hava durumu şehrini seç veya **Şimdilik geç** de. Ayarlar'dan değiştirebilirsin.
6. Ayarlar'da **Codex'e bağlan**, ardından gerekiyorsa **ChatGPT ile giriş** kullan. Kendi Codex erişimi olan hesabın ve internet gerekir.
7. İstersen **setup\Create-Desktop-Shortcut.vbs** dosyasını çalıştır. Otomatik başlangıç için Ayarlar → **Windows açılınca başlat** seçeneğini aç.

Sonraki açılışlarda **Start-Charles.cmd** veya masaüstü kısayolunu kullan. Node.js kurulumu gerekmez. Başlatma penceresi kapansa da Charles çalışır. Dosya sürüklemek için Charles'ı normal kullanıcı olarak aç. Klasörü taşırsan kısayolu yeniden oluştur ve otomatik başlangıcı kapatıp aç.

Her açılışta önceki sohbet/proje konuşması geçmişe alınır; boş bir konuşmayla başlanır. Geçmiş, konuşma balonu simgesindedir. Bu paket kişisel sohbet, giriş bilgisi, servis anahtarı veya hazırlayan kişinin tercihlerini içermez.

## v3.2.2

- Okul e-postasında IMAP yanında **POP3 + TLS** desteği. Ayarlar → Eklentiler → Okul e-postası bölümünde okulunun sunucu adresini, POP3 · TLS ve `995` portunu seç (IMAP için `993`). Tam e-posta adresini/şifreni girip Kaydet ve Bağlantıyı test et kullan. Mevcut IMAP ayarı otomatik değiştirilmez.
- POP3 yalnızca okur; sunucudan mesaj silmez. Bildirim takibinde UIDL kimlikleri kullanılır. Sunucu okunmuş/okunmamış durumunu POP3 üzerinden sunmadığı için ilk kontrolden sonra görülen yeni kimlikler bildirilir. Son 25 mesaj listelenir, özet için son 5 mesaj okunur. Çok büyük mesajlar webmail üzerinden açılmalıdır.
- Sesli araç çağrısında geç gelen/parçalı döküm kısa süre beklenir; aynı olayda turnComplete geldiğinde ilgili döküm korunur. Önceki konuşmanın komutu yeniden kullanılmaz. “Home Assistant, tavan lambasını kapatır mısın?” gibi virgüllü ve hitaplı ifadeler desteklenir.
- Gmail rehberi 9, Outlook rehberi 7 küçük adıma ayrıldı. Ekranda aranacak düğmeler, ne zaman sonraki adıma geçileceği, test kullanıcısı, doğru istemci türü ve kimlik açıklanır. Microsoft dönüş adresi tek düğmeyle kopyalanır; resmi adım sayfası yeniden açılabilir.

## v3.2.1

- Home Assistant cihazları görünen adlarıyla kontrol edilir: “Tavan lambasını kapatabilir misin?” Aynı adda birden fazla cihaz varsa seçim netleştirilir; erişilemez cihazda başarı söylenmez. Ayarlardaki bağlantı testi sunucu/token durumunu ve bulunan cihazları gösterir. Onay tercihin korunur.
- Okul e-postası, Gmail ve Outlook sohbetten veya Gemini Live’dan okunur: “Okul mailimi kontrol edip son gelen maili söyler misin?”, “Gmail maillerimi özetle”, “Maillerimi özetle”. Son komut bağlı mail hesaplarını birleştirir. Özet için en fazla son 5 mesaj okunur. Okul kutusunda 7 günlük kısıtlama kaldırıldı.
- Sesli eklenti işlemleri Charles’ın kendi bağlantılarını kullanır; başka hesapları aramak için Codex’e yönlendirilmez. Okunan içerik özeti Gemini Live veya seçili sohbet modeline gönderilir.
- Yeni okunmamış mail ve takvim bildirimleri temiz kurulumda açıktır; Eklentiler başlığından kapatabilirsin. Charles açıkken 5 dakikada bir kontrol edilir. İlk kontrol geçmiş mailleri topluca bildirmez. Anahtar kelime yazmak gerekmez.
- Shazam, mail listeleme ve ayrı bildirim ayarı panelleri kaldırıldı. Ayarlar hesap bağlama içindir; okuma ve özetleme sohbetten yapılır.
- Gmail/Outlook için **Charles ile kur**: resmi kurulum sayfası açılır, Slime masaüstüne çıkar ve yanında adım adım rehber balonu görünür. Adımları sen ilerletirsin; Charles tarayıcı ekranını kendiliğinden okumaz. Google’ın Desktop OAuth JSON dosyası içe aktarılabilir. Microsoft uygulama kimliğinin nereden alınacağı açıklanır. Rehber kapanınca önceki panele dönülür. İlk uygulama kaydı hâlâ gerekir; Charles’a ait hazır, doğrulanmış ortak OAuth kaydı bulunmuyor.
- Kısayollar: **Tuşları kaydet** → tuşlara birlikte bas → **Kısayolları kaydet**. Kayıt sırasında Charles’ın eski kısayolları geçici durur; Esc/odak kaybı/30 saniye zaman aşımı ile geri gelir.
- Haftalık raporda Charles işlem süresine ek olarak bilgisayarda toplam açık oturum süresi ve aktif kullanım gösterilir. Yalnızca Charles çalışırken ölçülür; kilit/uyku sayılmaz. Aktif kullanım, son 5 dakikada klavye/fare etkinliği olmasıdır. Geçmişe dönük Windows süresi çıkarılmaz.
- Sesli yanıt metni artık ses oynatma kuyruğu bittikten sonra görünür; sesin önüne geçmez. Kelime bazlı altyazı zamanlaması değildir.

## v3.2

- “Hey Charles” ile Gemini Live görüşmesini başlatma. Ayarlar → Genel içindeki üç örnekli eğitim, yerel algılama eşiğini ve tanınan hitap biçimini ayarlar. Bu bir ses kimliği doğrulaması değildir. Wake algılama yerel Whisper tiny kullanır; görüşme için Gemini Live kurulumu gerekir.
- Dikte için mikrofon, sesli görüşme için ayrı dalga düğmesi. Dikte metni gönderilmeden önce düzenlenebilir.
- Cursor hesabıyla giriş ve doğrulanmış hesaplara ait modeller. Cursor bağlantısı sohbet içindir; proje/dosya işlemleri GPT üzerinden yapılır.
- Ayarlar → Kısayollar: sohbet, bildirim, işlem ayrıntıları, önceki/sonraki sohbet, ses, dikte, ekran seçimi, masaüstü Slime ve gardırop. Çakışan kısayollar kaydedilmez.
- Türkçe/İngilizce arayüz seçimi, daha sade sohbet ve işlem ayrıntıları, görsel üretim sırasında noktalı bekleme animasyonu.
- Haftalık özet: Charles açıkken Pazartesi 09.00’dan itibaren önceki haftanın kayıtlı etkinliklerini gösterir. Aktif işlem süresi, oturumlar, dosyalar, değişen satırlar, komutlar, izinler, en çok kullanılan model/proje, yoğun gün ve uzun oturum. Ölçüm bu sürümle başlar; eski geçmişten süre uydurulmaz.
- Eklentiler: kendi OAuth uygulamanla Gmail, Google Calendar, Drive ve Outlook; TLS IMAP ile okul e-postası; Home Assistant sunucu adresi ve token ile cihaz kontrolü. Eski servis kartları da bu kategoridedir. Kurulum: **docs/PLUGINS-SETUP.md**.
- İsteğe bağlı bildirimler: uygulama açıkken beş dakikada bir yeni önemli posta ve takvim kontrolü. Önem değerlendirmesi sağlayıcı işareti ve düzenlenebilir anahtar kelimelerle yapılır. İlk kontrol mevcut iletileri topluca bildirmez.
- Model değişiminde önceki sağlayıcının limit mimiği kaldırılır. Gerçek kota yenilenmesinde yıldız gözlü kutlama korunur.

### Bağlantıların sınırları

Antigravity abonelik bağlantısının otomatik mesaj protokolü yalnızca metin kabul ediyor. Bu nedenle Gemini’ye fotoğraf gönderme bu sürümde desteklenmiyor; açık hata verilir ve ek korunur, GPT seçerek gönderebilirsin. Gemini Live API bağlantısı bu abonelik bağlantısından ayrıdır. [Resmi protokol belgesi](https://www.antigravity.google/docs/cli/headless/).

Shazam için resmi Windows entegrasyonu sunulmadığından aktif tanıma eklenmedi. Gmail/Outlook/Drive oturumları ChatGPT’den aktarılmaz; kendi OAuth uygulama bilgilerin gerekir. Okulunun IMAP/POP3 adres ve port desteğini kurumunla doğrulamalısın. Harici hesapların canlı bağlantıları kullanıcı tarafından kurulum sonrası doğrulanmalıdır.

## v3.1.3

- Gemini Live, açıkça istediğin bilgisayar ve dosya işlemlerini bağlı GPT/Codex hesabına aktarır. Örneğin “Masaüstüne merhaba.txt oluştur, içine merhaba ben Charles yaz.” İşlem için GPT hesabının bağlı olması gerekir; Charles’taki erişim seçimin uygulanır. Sonuç Gemini’ye geri aktarılır. Görüşmeyi kapatmak bekleyen işlemi durdurur; tamamlanmış dosya değişikliklerini geri almaz.
- Sohbet/proje seçiminin yanındaki gösterge sesli görüşmenin açık olduğunu ve işlem durumunu gösterir. Göstergeye tıklayarak görüşmeyi bitirebilirsin.
- Masaüstüne ayrılan Slime’ın siyah kutusu ve yatay kayması giderildi. Çift tıklayınca panele döner.
- Slime biraz aşağı alındı; uzun şapka ve kulaklar için çizim alanında boşluk bırakıldı.

## v3.1.2

- Spotify çalmıyorken süre/ilerleme, karıştır ve tekrar kontrolleri gizlenir. Çalma başlayınca geri gelir.

- Ayarlar → Hesap → Gemini Live → **Gemini Live sesi**: 30 hazır ses veya Gemini varsayılanı. Seçip Kaydet’e bas; ses sonraki görüşmede uygulanır. Kaydederken açık görüşme sonlandırılır.
- Google oturumu yerel ortamda doğrulanır. Yanlış SSH kontrolü kaldırıldı; bağlı hesabın Gemini modelleri otomatik görünür. Zaten bağlı hesap için tekrar terminal açılmaz.
- Ses ayarı resmi [Gemini Live yapılandırması](https://ai.google.dev/gemini-api/docs/live-api/capabilities#change-voice-and-language) üzerinden gönderilir. Sesler Google’ın [hazır ses listesinden](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-language-voice#voices_supported) seçilir.

## v3.1.1

Ücretsiz Claude web düğmesi kaldırıldı. Spotify ilerleme çizgisi 2 piksele, tutamacı 7 piksele inceltildi; sürükleme alanı korundu. Aşağıdaki API anahtarı düzeltmeleri bu pakete dahildir.

- Model seçicisi yalnızca doğrulanan hesapları gösterir. Eski elle etkinleştirme kutucuğu kaldırıldı. Giriş sonrası otomatik kontrol ve elle bağlantı kontrolü eklendi.
- GPT, Gemini ve Claude hesap kartları aynı düzende sunulur.
- Aksesuarların sabit çizimleri iki katmanda önbelleğe alınır; takma ve hareket animasyonları ekranın kare zamanlamasıyla çizilir. Gizliyken çizim durur.

### API anahtarı düzeltmesi

- Nokta içeren yeni yetkilendirme anahtarları, eski anahtar biçimine zorlanmadan kaydedilir. Boşluk/satır sonu içeren yapıştırmalar yine reddedilir.
- Yeni anahtar yazılmış ama henüz kaydedilmemişse bağlantı testi eski kayıtla çalışmaz; önce Kaydet düğmesini ister.
- Yerel kayıt doğrulaması, Google'ın anahtarı kabul ettiği anlamına gelmez. Kaydettikten sonra Bağlantıyı test et düğmesini kullan.
- Genel kimlik doğrulama hatası artık kesin olarak "anahtar geçersiz" şeklinde sunulmaz. Yeni yetkilendirme anahtarları hata çıktılarında da gizlenir.

## v3.1 R2 — Hesap bağlantıları

- Gemini bireysel hesap bağlantısı artık resmi Antigravity CLI 1.3.3 üzerinden çalışır. Eski Gemini CLI yolu kullanılmaz. Ayarlar → Hesap → **Gemini ile giriş** seç. Açılan pencerede **Google OAuth** seçip Enter'a bas; tarayıcıdaki Google girişini kendin tamamla. Giriş doğrulanınca modeller otomatik görünür.
- Antigravity'nin ücretsiz erişimi Google'ın hesap uygunluğu, bölge ve kullanım kotasına bağlıdır. Otomatik ücretli API veya ek krediye geçiş yapılmaz.
- **Ücretsiz Claude hesabı Claude Code erişimi vermez.** **Claude ile giriş** yalnızca Claude Code erişimi olan planlar içindir. API/Console kullanımı eklenmedi.
- Giriş penceresinin açılması, hesabın doğrulandığı anlamına gelmez. Google/Claude girişini tamamlaman gerekir. Bu paket kimsenin hesabını veya giriş bilgisini içermez.
- Gemini Live sesli görüşmesi ayrı bir API bağlantısıdır; Antigravity oturumu Live API anahtarı sağlamaz.

## v3.1 düzeltmeleri

- Gemini ve Claude girişleri ayrı, etkileşimli Windows konsolunda açılır. Başlatma hataları artık gizlenmez; hesap bölümünde görünür. Sistemde Node kurulumu gerekmez. Gemini bağlantısı R2’de Antigravity ile değiştirilmiştir.
- Anahtarın kayıtlı olduğu, Free Tier seçimi ve Live tercihi yeniden açılışta gösterilir. Anahtar metni güvenlik için yeniden ekrana doldurulmaz; boş alan, kaydın silindiği anlamına gelmez.
- Windows tarafından çözülemeyen eski anahtar, kullanılabilir olarak gösterilmez. Böyle bir mesaj alırsan Ayarlar → Hesap bölümünde anahtarı yeniden gir, Free Tier ve Live seçeneklerini işaretleyip Kaydet'e bas.
- **Bağlantıyı test et** düğmesi kayıtlı anahtarla Gemini Live oturumu açıp kapatır; mikrofon açmaz ve ses göndermez. Test gerçek ağ bağlantısı kurar; Google'ın erişim/kota kuralları geçerlidir.
- Bağlantı kurulmadan kapanma, iptal ve geç gelen yanıtlar ele alınır. Mikrofon yalnızca başarılı bağlantıdan sonra açılır. Kota, erişim, ağ ve anahtar hataları kalıcı durum metninde belirtilir; hata çıktılarında anahtar gizlenir.

## v3.0 yenilikleri

- **Ana yapay zekâ sistemi:** Ayarlar → Hesap bölümünden GPT, Gemini veya Claude seç. Yeni sohbetlerin varsayılan modeli buna göre değişir. Gemini ve Claude için önce aynı bölümde resmi giriş penceresini aç, kendi hesabınla giriş yap. Modeller giriş doğrulamasından sonra otomatik eklenir. Sohbet aboneliğinin ilgili resmi CLI erişimini kapsaması gerekir. Bu iki bağlantı metin sohbeti ve metin belgeleri içindir; proje işlemleri ve görseller için GPT kullanılır.
- **Kullanım paneli:** Seçilen ana sağlayıcının adı gösterilir. GPT için gerçek Codex limitleri okunur. Gemini ve Claude kalan kota yüzdeleri bu sürümde alınamıyor; panel bunu açıkça belirtir. Sohbet abonelikleri birbirinin kotasını kullanmaz.
- **Gemini Live:** İsteğe bağlı, tamamen Gemini ile sesli görüşme. Ayarlar → Hesap → Gemini Live bölümünde AI Studio bağlantısını açıp faturalandırması kapalı Free Tier projesinin anahtarını ekle. Google hesabına giriş yapmak tek başına Charles'a API anahtarı sağlamaz. Anahtar Windows şifrelemesiyle yerelde saklanır; pakete veya sohbet geçmişine eklenmez. Charles projenin faturalandırma durumunu doğrulayamaz. Ücretli bir projenin anahtarını kullanma. Ücretsiz kullanımın kendi kotası vardır; ses ve metin Google'a gönderilir ve ücretsiz katmanda ürün geliştirmek için kullanılabilir. Sesli oturumda bilgisayar araçları yoktur; her oturum en fazla 15 dakika sürer. Kapanınca mikrofon bırakılır, otomatik yeniden bağlantı yapılmaz.
- **Hey Charles:** Ayarlar → Genel'den açılır; varsayılan olarak kapalıdır. Uyandırma sözü yerel Whisper tiny ile aranır. Panel açılınca konuşmaya başla. Live etkinse Gemini görüşmesi; değilse mevcut yerel dikte açılır. Bu seçenek açıkken mikrofon dinlemede kalır; sessizliğin her karesinde model çalıştırılmaz. Bilgisayar kilitlenince dinleme durur.
- **Yerel ses korunur:** Live kapalıysa Whisper small ile dikte ve Windows Türkçe seslendirme devam eder. Tiny ve small modelleri pakettedir; ilk kurulumda ayrıca model indirmek gerekmez.
- **Spotify:** Kapak ve önceki/sonraki kontrollerine süre, ilerleme çubuğu, sürükleyerek ileri/geri gitme, karıştırma ve tekrar eklendi. Windows medya oturumunun desteklemediği kontroller pasif kalır. Bazı Spotify sürümleri bu kontrollerin tamamını Windows'a sunmayabilir.
- **Masaüstünde Slime:** Karakteri sürükleyerek panelden ayır ve istediğin yere bırak. Çift tıkla, panele dönsün. Konumu ekran sınırları içinde tutulur.
- **Yeni animasyonlar ve aksesuarlar:** Dans ve aksesuar hareketleri Charles'ın okuma, araç ve Eureka animasyonlarıyla birleştirildi. Ayarlar → Görünüm'de aksesuar veya mevsimsel seçim bulunur.
- **Daha az boşta çalışma:** Gizliyken karakter çizimi durur; açılınca devam eder. Boşta kare hızı ve arka plan medya sorguları azaltılır.

Gemini/Claude abonelik bağlantıları ücretli API anahtarlarına otomatik geçmez. Gemini Live ayrı ve açıkça etkinleştirilen bir API bağlantısıdır. Bu sürümün canlı hesap girişi ve gerçek Gemini ses kalitesi, kullanıcının kendi hesabıyla denenmelidir.

## v2.2.4 düzeltmesi

“Tekniğe odaklandım”, “karaktere odaklanalım” gibi sohbet ifadeleri artık odak sayacına yönlendirilmez. Sayaç için açık bir istek gerekir: “25 dakika odaklan” veya “Odak sayacını başlat”. Hatırlatıcı fiillerinde kelime sınırları da korunur; “hatırlatıcı kurdum/kurarken” gibi anlatımlar komut sayılmaz.

## v2.2.3 düzeltmeleri

- Kaynak kullanım kısayolu artık kelime içindeki RAM/CPU/GPU harflerini eşleştirmez. Uzun metinler ve karakter/hikâye içerikleri normal sohbet yolunda kalır. Yalnızca açık kullanım sorguları yerel rapora yönlendirilir.
- Sohbet panelinin boyut geçişi tamamlandığında yeniden başlayan hareket efekti kaldırıldı. Sohbet içeriği son boyutu hazır olunca hafifçe görünür; eski okuma konumu veya en alttaki mesaj konumu korunur.

## v2.2.2 yenilikleri

- Uzun mesajlarda yazı alanı tüm satırı kaplar, kaydırma çubuğu sağ kenarda kalır. Ekle, model, mikrofon ve gönder düğmeleri alt satıra geçer. Kısa mesajlarda tek satırlık kompakt düzen korunur.
- Büyüme/küçülme sırasında Windows’un saydam dış penceresi sabit kalır; görünen panel kendi içinde boyut değiştirir. Ekrandaki merkez veya kenar bağlantısı korunur. Yazılar tüm panelle birlikte esnetilmez. Saydam alanlar masaüstü tıklamalarına bırakılır.
- Slime çizim alanı ve Charles GPT yazısı aynı merkez çizgisine hizalanmıştır.

## v2.2.1 yenilikleri

- Küçük/büyük panel ve gizli şerit geçişleri 320 ms arayüz animasyonuyla yapılır; Windows penceresini her karede yeniden boyutlandırma kaldırılmıştır (v2.2.2’de geçiş başındaki/sonundaki boyut değişiklikleri de kaldırılmıştır). Windows’ta azaltılmış hareket tercihine uyulur.
- Uzun mesajlarda ince, saydam ve üzerine gelince belirginleşen kaydırma çubuğu.
- Küçük panelde üstte hava durumu; altında gerçek Codex hesabının 5 saatlik ve haftalık kalan kullanım yüzdeleri, en altta ek kredi bakiyesi. Genel ChatGPT sohbet limiti değildir. Veri alınamazsa çizgi gösterilir.
- Kullanım yaklaşık 60 saniyede bir, bağlantı/hesap değişimlerinde ve bildirilen yenilenme zamanı yakınında kontrol edilir. Bu kontrol model yanıtı üretmez ve kullanım sıfırlama hakkını tüketmez.
- Limit dolduğunda Charles limit mimiğinde kalır. Ağ hatası veya yeni sohbet bunu sıfırlamaz. Yeni kullanım verisi hakkın yenilendiğini doğrulayınca bir kez 2,8 saniyelik yıldız gözlü **Gururlanma** mimiği yapar.
- Spotify kartı, kapak yokken de küçük panelde dikey olarak ortalanır.

## v2.2 yenilikleri

- Küçük panel: ortada Slime ve altında Charles GPT; solda hava durumu, sağda Spotify kapağı ve kontroller. Spotify Windows’a kapak sağlamıyorsa kapak gösterilmez. Kapaklar üçüncü taraf servise gönderilmez.
- Büyük panel: daha büyük ortalanmış Slime; aynı hizada ayar/geçmiş ve pencere düğmeleri. Açılırken yumuşak genişleme animasyonu.
- Tek satırdan başlayıp yazdıkça büyüyen mesaj kutusu. + menüsünde fotoğraf/dosya, görsel oluştur, web arama ve derin araştırma.
- Web seçimi mevcut Codex web aracını canlı arama moduna alır. Derin araştırma aynı modelle çok kaynaklı rapor hazırlama talimatıdır; ayrı ChatGPT Deep Research hizmeti değildir. Görsel oluştur mevcut Codex image_generation aracını ister; hesabın/modelin bu aracı sunmaması veya limitin dolması halinde oluşturma başarısız olabilir. Ayrı ücretli API çağrısı veya gizli API anahtarı kullanılmaz. Bu seçenekler Codex kullanımına tabidir.
- Gönderilen yeni görsellerin küçük önizlemesi dosya adıyla birlikte yerel sohbet geçmişine kaydedilir. Önceki sürümde hiç önizleme kaydedilmemiş eski mesajların resimleri geriye dönük üretilemez.
- Düzenlenen mesajların altında ‹ 1 / 2 › gibi gezinme vardır. Her sürüm kendi sonraki konuşmasıyla korunur. Düzenleme eski dosya değişikliklerini geri almaz.
- Ayarlar: Genel, Hesap, Görünüm, Hafıza, Erişim, Bağlantılar ve Performans. Görünüm bölümünde GPT etiketi, gönder düğmesi ve iki mesaj balonu için ayrı renk seçimi.

### CPU, RAM ve GPU geçmişi

Charles açıkken yaklaşık dakikada bir Windows’un erişime izin verdiği süreçler ölçülür. Aynı işlem adına sahip süreçler uygulama grubu olarak birleştirilir. Veriler bu Windows kullanıcısının Charles veri klasöründeki `resource-history.sqlite` dosyasında saklanır; son 8 gün tutulur. Başka kullanıcıların ölçümleri pakette bulunmaz. Yönetici erişimi istenmez.

Sohbette örnekler:
- “Bu hafta en çok CPU’yu ne kullandı?”
- “Son 1 saatte GPU’yu en çok hangi uygulama kullandı?”
- “Son 3 saatte en çok RAM tüketen uygulamalar hangileri?”
- “Bugün işlemciyi en çok ne kullandı?”

İlk karşılaştırma iki ölçümden sonra, yaklaşık bir dakika içinde oluşur. Yanıtta ilk 5 uygulama, ölçüm sayısı ve kayıt aralığı yazılır. Bu sorular yerel kayıttan yanıtlanır; Codex kullanım hakkı harcamaz. Kayıtlar modele topluca gönderilmez. Sonuç mesajı yerel sohbet geçmişine alınır; daha sonra aynı konuşma modele aktarılırsa bu özet geçmişin parçasıdır.

CPU: mantıksal çekirdek sayısına göre toplam sistem kapasitesinin yüzdesi. RAM: süreçlerin çalışma kümesi toplamı (MB; paylaşılan bellek birden fazla süreçte sayılabilir). GPU: her uygulamanın en yoğun GPU motorunun örneklenmiş yüzdesi. Bunlar kayıtlı örneklerin ortalamasıdır; toplam tüketim veya kesintisiz tepe ölçümü değildir. Dakikalar arasındaki kısa sıçramalar kaçabilir. Charles kapalıyken, uyku sırasında veya kurulumdan önce ölçüm yoktur. GPU sayacı Windows/sürücü tarafından sağlanmıyorsa açıkça bildirilir; sıfır kullanım olarak gösterilmez.

Ayarlar → Performans’tan izlemeyi kapatabilir ve kayıtları temizleyebilirsin. Kapatmak önceki kayıtları silmez. Temizlemek için düğmeye ikinci kez basarak onay verilir.

## v2.1.2 — kişisel bilgi aktarımı ve yaratıcı profili

### ChatGPT’den beni tanı

Ayarlar → Hafıza → **ChatGPT’den beni tanı** düğmesini aç.
1. Soru paketini kopyala ve kendi ChatGPT hesabındaki bir sohbete yapıştır.
2. ChatGPT’nin JSON yanıtının tamamını Charles’a yapıştır, **Bilgileri incele** de.
3. Bölümleri oku, yanlış/eski bilgileri düzelt, istemediğin bölümlerin seçimini kaldır.
4. **Seçtiklerimi hafızaya ekle** düğmesine bas. Kayıtlar sonraki mesajda modele verilir; yeniden açılışta korunur.

Soru paketi; kimlik ve hitap, okul/iş, devam eden projeler, öğrenme hedefleri, teknik ortam, iletişim, kodlama/teslim tercihleri, tasarım, ilgi alanları, çalışma alışkanlıkları, sınırlar ve güncel bağlamı kapsar. Bilinmeyen bilgileri uydurmamasını ve özel anahtar/parola gibi bilgileri dahil etmemesini ister. Tam metin **docs/CHATGPT-INTRO-QUESTIONS.md** dosyasındadır.

Bu işlem ChatGPT’nin kendiliğinden okunması veya hesap eşitlemesi değildir. Her kullanıcı kendi özetini getirir. Yerel hafıza Windows kullanıcısı bazındadır: ChatGPT hesabını değiştirince eski yerel hafıza otomatik değişmez; ortak bilgisayarda ayrı Windows profili veya yerel hafızayı temizleme kullan. İçe aktarılmış bilgiler Charles yanıt hazırlarken modelle paylaşılır. Kayıtları Ayarlar → Hafıza’dan düzenleyebilir/silebilirsin. Her bölüm 2000 karakter, toplam etkin hafıza 15.000 karakter ve 50 kayıt sınırındadır. Sınırı aşan aktarım kaydedilmez; daha az bölüm seç. Aynı metin ikinci kez eklenmez.

### Charles'ın kimliği

Her kurulum Charles’ın HzPederPan tarafından GPT desteğiyle geliştirilmiş bir Windows masaüstü asistanı olduğunu bilir. OpenAI modellerini ve kaynağı korunan Slime karakterini kullanır. Geliştirici kimliği ile mevcut kullanıcının kimliği ayrıdır; her kullanıcıya yaratıcı diye hitap etmez.

### Ayrı yaratıcı dosyası

**Charles-creator.json standart ZIP’e dahil değildir.** Ayrı dosyayı Start-Charles.cmd ile aynı klasöre koyup Charles’ı başlat. Bulunduğunda yaratıcı profili yerel hafızaya bir kez alınır. Sonradan koyarsan bir sonraki açılışta algılanır. Bu yalnızca yerel tanıtım bilgisidir; kimlik doğrulama, gizli parola veya erişim yetkisi değildir. Kopyasına sahip başka biri de yükleyebilir. Kaydı Hafıza’dan silersen normal açılışta tekrar eklenmez; temiz kurulumdan sonra dosya duruyorsa tekrar alınır. Dosyayı kaldırmak önceden kaydedilen hafızayı silmez.

### Açıklama balonları

Müzik kontrolü dahil arayüzde Windows tarzı yerel açıklama balonları kapatıldı. Düğmelerin ekran okuyucu etiketleri korunur. Kayan durum yazısı devam eder.

## v2.1 kullanım düzeltmeleri

- Bildirimler Sohbet/Proje seçimi ile hesap etiketi arasındaki küçük alanda görünür; 6,5 saniye sonra kaybolur.
- Başlığın altındaki tekrarlanan uygulama/kaynak satırı kaldırıldı. Hava durumu kaynağı Ayarlar'da kalır.
- “Hava durumu ne?”, “Hava nasıl?” ve “Şu an kaç derece?” seçili şehir için canlı/önbellekli yerel hava durumu bağlantısından yanıtlanır. Başka şehir ve ileri tarih soruları normal AI sohbetine gider.
- Ayarlar başlığı sabit, gövdesi pencerenin içinde sonuna kadar kaydırılabilir.
- Durum metni alana sığmadığında yavaşça kayar. Fare üzerindeyken de devam eder; Windows açıklama balonu çıkmaz. Kısa yazılar sabittir. Bu okunabilirlik kaydırması azaltılmış hareket açıkken de çalışır. Uzun metin bir kez sonuna kadar görünmeden boşta durum mesajı değiştirilmez.
- Paneli alttan sürükleyerek uzatıp kısaltma korunur.
- Üst kenara gizlenince kalan parça siyah ve yumuşak köşelidir.

## v2.0 yenilikleri ve denemeler

### Yerleşim ve siyah görünüm

- Ortadayken **‹ / ›** paneli sola/sağa taşır; kenardaki içe bakan ok ortaya döndürür. Ekran seçimi Ayarlar → Görünüm bölümündedir.
- Açık panelin en altındaki ince çizgiyi sürükleyerek yüksekliği anlık değiştir. Yükseklik kaydedilir; ekranın çalışma alanını aşmaz. Çizgiye klavyeyle odaklanıp yukarı/aşağı ok da kullanabilirsin.
- Açık panel daha dar, yüzeyler siyah ağırlıklı; küçük görünümde karakter ve Charles adı arasında daha fazla boşluk var.

### Hava durumu

Küçük panelin sol tarafında seçtiğin şehrin hava durumu gösterilir. Şehri ilk açılışta veya Ayarlar → Genel bölümünde seçebilirsin. “Hava durumu ne?” sorusu kayıtlı konumu kullanır. Boşta AI önerileri ve etkin uygulama önerileri v2.2’de kaldırıldı; bu amaçla otomatik Codex isteği yapılmaz.

### Kalıcı hafıza ve hitap

- **Bana Peder diye hitap et** → hitap tercihi kaydolur, sonraki konuşmalarda modele iletilir.
- **Bugün MAT101 çalışıyoruz** → çalışma konusu kaydolur. Yeni sohbet açıp **Ne çalışıyorduk?** yaz.
- Genel bilgiler için mevcut **Bunu hatırla: ...** komutu ve Ayarlar → Hafıza kullanılır. Kayıtlar yerel JSON dosyasında saklanır; düzenlenebilir ve silinebilir.
- ChatGPT web hafızası/son konuşmaları için bu Codex bağlantısında doğrulanmış otomatik okuma erişimi yok. **Ayarlar → Hafıza özetini içe aktar** ile seçtiğin TXT/MD özeti al; kontrol edip Kaydet'e bas. Kayıt başına en fazla 2000 karakter. Otomatik hesap hafızası eşitlemesi değildir.

### Yapılan işe göre karakter

| Gerçek ajan olayı | Görünüm |
| --- | --- |
| Terminal komutu | Klavye ve hareket eden eller |
| Web araması | Büyüteç |
| Dosya okuma / PDF veya DOCX sorusu | Gözlük ve kâğıt |
| Dosya/kod düzenleme | Laptop |
| Görsel üretme aracı | Çizim tahtası |
| En az 8 saniye düşünme/araştırma ardından kod düzenleme | Kısa ampul parlaması |

Animasyonlar gelen araç olaylarından türetilir. Terminal içindeki yaygın okuma/yazma komutları ayırt edilir; tanınmayan komut klavye görünür. Görsel animasyonu, hesabında bir görsel üretme aracı varsa tetiklenir; bu sürüm ayrıca görsel üretme servisi veya API aboneliği kurmaz. Yanıt, iptal ve hata sonrasında normal görünüme döner.

### Seçili metni sürükleme

Tarayıcıda bir paragraf seç, küçük Charles'a veya açık panele sürükle. **Seçili metin.txt** eki oluşur. Sorunu yazıp gönder; kendiliğinden gönderilmez. Düz metin olarak sürükleme sağlayan uygulamalar desteklenir; bazı siteler yalnızca bağlantı veya görsel sürükleme sunabilir. Metin sınırı 200 KB. PDF, DOCX, görsel, GIF ve Ctrl+V desteği korunur.

## Bağlantılar ve kullanım sınırları

Google Home bu sürüme dahil değildir. ChatGPT web hafızası otomatik çekilmez. Charles'ın GPT mesajları ve AI önerileri Codex hesabının kullanım sınırlarına bağlıdır; model değiştirmek paylaşılan kotayı yenilemez. Charles API anahtarı veya ayrı ücretli OpenAI API entegrasyonu istemez.

Yerel hatırlatıcılar için Charles açık kalmalı. Türkçe seslendirme Windows'taki kurulu sese bağlıdır. Spotify kontrolleri Spotify'ın Windows medya oturumunu kullanır; ilk parçayı Spotify'da başlatman gerekebilir. Whisper CPU üzerinde çalışır, laptop performansına göre yavaşlayabilir.

## Kaynak düzeni

Yeni özellikler **app/features** ve **src/features** modüllerindedir. Dosya sorumlulukları **docs/ARCHITECTURE.md**, doğrulama bilgileri **docs/VERIFICATION-v0.4.4.md** içindedir. Kaynaklar okunabilir biçimde düzenlenmiştir. Aşağıdaki kullanım açıklamaları önceki özellikler için de geçerlidir.

## Erişim ve onaylar

- **Onay iste:** varsayılan. Proje dosyaları ve komutlar için Codex onay ister.
- **Benim için onayla:** seçilen projede düzenleme yapar; ek izin taleplerini Codex otomatik risk değerlendirmesine gönderir (`approvalsReviewer: auto_review`). İşleme göre izin verilebilir, işlem engellenebilir veya kullanıcı müdahalesi gerekebilir. Sohbet modu normalde salt okunur kalır.
- **Tam erişim:** Codex onay politikası “never”, sandbox “danger-full-access”. Sohbet ve proje modlarında Windows hesabının erişebildiği dosyalarda ve ağda işlem yapabilir. İşletim sistemi yetkilerini veya kurum politikalarını aşmaz. Bu seçeneği kullanıcı Ayarlar'dan seçer; uygulama kendiliğinden etkinleştirmez.

Erişim değişikliği sonraki mesajda uygulanır; çalışan işler önce durdurulmalıdır. Önceki sohbet bağlamı korunur. Teknik eşleme resmî App Server belgeleri ve paketteki Codex sürümüyle kontrol edildi: https://learn.chatgpt.com/docs/app-server

## Ekrandan alan sor

**Ctrl+Shift+S** veya mesaj kutusunun altındaki alan seçme simgesi. Fare hangi ekrandaysa o ekran açılır; sürükleyerek bir alan seç. Esc iptal eder. Seçim mesaj eki olur; açıklamanı yazıp Gönder'e bas. Kendiliğinden GPT'ye gönderilmez. “Charles, şuna bak” da seçimi açar. Kısayol başka uygulama tarafından kullanılıyorsa simgeyi kullan. Seçim tek ekran içindedir.

## Belgeler ve karakter

- PDF veya Word (DOCX) ekleyip soru sorarken Charles gözlük takıp belge okur. Gözler satır takip eder, kâğıt ve eller hafif hareket eder. Kullanıcının Charles-okuyor.gif referansına dayanır; mevcut karakter motorunda vektör olarak çizilir.
- İlgili takip sorularında okuma görünümü tekrar açılır. Yanıt, iptal, hata veya onay bekleme durumunda okuma sona erer.
- Odak sayacı aktifken hareketler sakinleşir. İş bitince kısa mutluluk/gurur tepkisi verir. Spotify çalarken ve Charles boşta iken hafifçe sallanır; bu ritmik hareket ses analiziyle eşzamanlı değildir.
- GPT yanıtlarında bağlama uygun 1–2 emoji kullanması istenir.
- Ctrl+V ile görsel yapıştırabilir, dosyayı küçük Charles'ın üzerine bırakabilirsin. Panel açılır, dosya alma tepkisi ve “Bununla ne yapalım?” seçenekleri görünür. Seçenekler soruyu hazırlar; gönderme sana aittir.

## Dosya arama

Sohbete **“Arama için klasör ekle”** yaz. Klasör seçimi açılır. Hiç klasör seçmeden bir dosyayı ararsan önce klasör seçimi açılır, sonra araman yapılır. **“Arama klasörlerini listele”** ile listeyi gör; **“C:\Belgeler” klasörünü aramadan çıkar** ile bir klasörü listeden kaldır. Örnekler: “Doğrultucu raporu neredeydi?”, “Dosyalarımda doğrultucu ara”, “İçinde \"V=I*R\" geçen PDF bul”. Sonuçlarda Aç ve Klasörde göster bulunur. Dosyaları uygulama kendiliğinden değiştirmez.

Dosya adı ve içerikte sözcük/eşleşme araması yapılır; anlamsal bir arama modeli değildir. PDF içindeki seçilebilir metin, Word DOCX, metin ve yaygın kod dosyaları desteklenir. Taranmış PDF görüntülerinde OCR yoktur. “Geçen hafta” son 7–14 günün dosya değiştirme tarihini filtreler. Bir arama en fazla 8.000 dosya ve yaklaşık 30 saniyeyle sınırlıdır; okunamayan ve sınır nedeniyle atlanan dosyalar bildirilir. PDF başına ilk 150 sayfa işlenir. Arama önbelleği bellekte tutulur; seçilmemiş klasörler taranmaz.

## Kişisel komutlar

Sohbette **Ben “atölyeyi aç” dediğimde Steam ve Spotify aç** yaz. Kaydetmek uygulamaları başlatmaz; sohbete tam ifadeyi yazınca açılır. Aynı ifadeyi farklı uygulamalarla yeniden öğretmek mevcut komutu günceller.

**“Kişisel komutlarımı listele”** kayıtlarını gösterir. **“atölyeyi aç” komutunu sil** kaydı kaldırır. Uygulama adları Windows Başlat listesinde bulunmalıdır. Bir komut 1–8 kurulu uygulama açabilir.

## v1.1.1 kullanım düzeltmeleri

- Klasör ve kişisel komut yönetimi ayarlardan kaldırıldı; sohbetten yapılır.
- Dosyalar küçük karaktere veya açık sohbet penceresine bırakılabilir. Ekler mesaj kutusunda görünür; göndermeden önce soru yazabilirsin.
- Ekran seçimi simgesine tıkla veya Ctrl+Shift+S kullan. Görüntü hazır olduğunda alanı sürükleyerek seç. Esc iptal eder. Kısayol başka uygulamadaysa simgeyi kullan.
- Komutlar, araç çıktıları, planlar ve ilerleme açıklamaları kapalı **› İşlem ayrıntıları** bölümündedir. Açmak için başlığı tıkla. Gerçek onay talepleri ve son yanıt görünür kalır.

## Mesaj düzenleme ve çalışma günlüğü

Kendi mesajının altındaki kalem simgesi önceki konuşmayı koruyup o mesajın öncesinden yeni bir dal açar. Metni değiştirip gönder. Sonraki yanıtlar eski konuşmada kalır. Önceden yapılmış dosya değişiklikleri veya açılmış uygulamalar geri alınmaz; eski ekler gerekirse yeniden eklenir.

“Az önce ne yaptık?” mevcut konuşmanın son sonuçlarını, kayda geçen dosya değişikliklerini ve bekleme durumunu gösterir. “Bugün Charles'a neler ekledik?” bugünkü yerel konuşma kayıtlarından çalışma günlüğü çıkarır. Charles dışında yapılan değişiklikleri bilemez; bu kayıt özeti GPT tarafından yeni bir proje taraması yapılması anlamına gelmez.

## Önceki özellikler

Yerel Whisper small mikrofon tanıması; Windows Türkçe seslendirme; model seçimi; ayrı yerel geçmişte arama, adlandırma, sabitleme ve silme; yönetilebilir hafıza; süreli hatırlatıcılar ve odak sayacı; ekran ve görünüm seçimi; Spotify önceki/oynat/duraklat/sonraki kontrolleri korunur. Bildirimler için Charles açık kalmalıdır.

## Lisans ve geliştirme

Charles'ın kodu ve tasarımı, Slime karakteri, simgesi ve sesleri HzPederPan'a aittir (LICENSE, LICENSE-ASSETS.md). Kişisel kullanım serbesttir; dağıtım yazılı izin gerektirir. Üçüncü taraf bileşenlerin lisansları THIRD-PARTY-NOTICES.md'de listelenir ve pakette korunur. Bu resmî bir OpenAI, Anthropic veya Google ürünü değildir.

Kaynak kodu geliştirmek için Node.js 24 ile `npm.cmd ci`, `npm.cmd run setup`, `npm.cmd run build` kullanılabilir. Normal paket başlatıcısı Node.js gerektirmez. Kişisel veriler Windows Charles kullanıcı verisi klasöründedir; kurulum ZIP'ine alınmaz.

## v1.1.1 yeniden paketleme · Sürükleme düzeltmesi

Sürükleme sırasında otomatik küçülme/gizlenme geçici olarak bekletilir. PDF, DOCX, PNG/JPG/WebP ve GIF eklenebilir. GIF küçük resmi hareketlidir; modele ilk karesi PNG olarak gönderilir, animasyonun tamamı incelenmez. Dosya seçme düğmesi de GIF kabul eder. Windows üzerinden dosya bırakırken Charles normal kullanıcı olarak çalışmalıdır.

## Temiz başlangıç ve bozuk kayıt kurtarma
Eski Charles'ı sistem tepsisinden tamamen kapatıp setup\Reset-Charles.cmd dosyasını çalıştır. Yerel sohbet geçmişi, kişisel ayarlar, görünüm/başlangıç tercihleri ve proje seçimi ayrı bir yerel yedek klasörüne alınır; varsayılanlarla açılır. ChatGPT oturum bilgileri değişmez. Sonraki normal açılışlarda Start-Charles.cmd kullan.
Bozuk ayar/geçmiş uygulamayı kapatmaz; dosya korunur, varsa sağlam yedek kullanılır. Kayıtlar diske yazıldıktan sonra yerlerine taşınır ve önceki sağlam sürüm saklanır.
