# ProjectCharles — Yama notları

Charles’ın ilk masaüstü sürümünden v0.8.3 Beta’ya kadar eklenen özellikler, değişen davranışlar ve giderilen sorunlar bu dosyada yer alıyor. En yeni sürüm en üstte.

**Sürüm numaraları:** İlk geliştirme döneminde v1, v2 ve v3 adları kullanıldı. Proje beta aşamasında olduğu için v3.2.2’den sonraki sürüm **v0.4 Beta** olarak adlandırıldı. Bu bir geri dönüş değil, numaralandırma değişikliği. Beta boyunca 0.x sürümleri kullanılacak; v1.0 ile beta dönemi tamamlanacak.

## v0.9.1 Beta — 24 Ekim 2026

- **Selamlama:** Charles kod yazarken, terminalde çalışırken ya da okurken selam verdiğinde dört eli oluyordu. Selam sırasında klavyedeki ve kitaptaki eller gizleniyor; el sallayan iki el kalıyor.
- **Kart rafı:** küçük adadaki sohbet geçmişi tuşu kaldırıldı (geçmiş sohbette duruyor).
- **Panel (Çalışma alanı):** Charles kartında Slime yine görünüyor. Panel açılınca Slime kart rafındaki yerine geri taşınıyor ve kart boş kalıyordu.
- **Kota uyarısı:** Codex’in kullanım hakkı varken “%0 kaldı” uyarısı gelebiliyordu. Uyarı artık yalnızca Charles kotayı yeniden okuyup gerçekten azaldığını görürse geliyor. Sıfırlanma zamanı geçmiş eski bir pencere için uyarı yok. Codex’te kredi varsa, 5 saatlik hak dolsa bile Codex kredilerle devam edebildiği için ne uyarı geliyor ne de sohbet engelleniyor.
- **Fotoğraflar büyüyor:** sohbete eklediğin fotoğrafa tıklayınca (ya da Enter’a basınca) büyük önizleme açılıyor; tıklayınca veya Esc ile kapanıyor. Fotoğrafın büyük bir kopyası Charles’ın ürettiği görseller gibi geçmişin yanında saklanıyor. Daha önce gönderilmiş fotoğraflar küçük kopyalarıyla büyütülüyor.
- **Test planından düzeltmeler:**
  - **Güncelleme ve arşiv bütünlüğü:** güncelleme paketi ve dönüştürücünün “çıkar” işlemi artık her dosyanın sağlama toplamını (CRC) kontrol ediyor. Sıkıştırılmamış bir dosyadaki bozuk bayt ya da boyutu yanlış yazılmış bir girdi eskiden fark edilmiyordu.
  - **Windows’a özel adlar:** güncelleme ve modül paketlerinde Windows’un ayrılmış aygıt adları (CON, NUL, COM1…) reddediliyor; dönüştürücü “:” ve benzeri Windows’ta dosya olamayan adları çıkarmıyor.
  - **Güncelleme indirme kaynakları:** güncelleme yalnızca GitHub’ın kendi yayın sunucularından, varsayılan porttan indiriliyor (raw.githubusercontent.com artık kabul edilmiyor). Her yönlendirme, istenmeden önce tek tek denetleniyor.
  - **Modül deposu:** dosyanın kendisi bir bağlantıysa (symlink) okunmuyor; eskiden yalnızca klasörler denetleniyordu.
  - **Arşiv sınırı:** bellekte açıldığı için dönüştürücüde çıkarılabilecek arşiv sınırı 4 GB’tan 1 GB’a indi.
  - **Kullanıcı kılavuzu:** ada bölümü güncel tasarıma göre yeniden yazıldı; Spotify sorun giderme satırı eklendi.

## v0.9.0 Beta — 24 Ekim 2026

- **Spotify v0.8.11’deki gibi:** Spotify’a bağlanan kod v0.8.11’e kadar sorunsuz çalışan sürümüne geri döndü. v0.8.13–v0.8.15’te eklenen pencere başlığından okuma, yeniden başlatma ve kısmi sorgu yolları kaldırıldı. Spotify yine 3 saniyede bir soruluyor. v0.8.12’de bu süre, şarkı çalarken 1 saniyeye inmişti; kayıtlara göre Windows’un medya bağlantısı bundan yarım saat sonra takıldı ve bir daha düzelmedi. Çubuk iki sorgu arasında akıcı ilerlemeye devam ediyor.
- Eski koda yalnızca üç koruma eklendi. Windows’un medya oturum yöneticisi her sorguda baştan istenmiyor; bir kez alınıp kullanılıyor. v0.8.12 bunu saniyede bir yeniden istiyordu ve bağlantı yarım saat sonra takıldı. Kapak resmi okunduktan sonra kapatılıyor. Art arda iki kez “kullanılamıyor” yanıtı veren medya işlemi kapatılıp yenisi başlatılıyor; eskiden takılan işlem sonsuza kadar öyle kalıyordu.
- **Görev çubuğu:** Charles açıkken görev çubuğunda zaman zaman bir düğme beliriyor ve kalıyordu. Ada, masaüstündeki Slime ve bildirimler artık görev çubuğunda görünmüyor; Windows düğmeyi geri getirirse (pencere yeniden gösterildiğinde ya da odak aldığında) hemen yeniden kaldırılıyor. Görev çubuğunda yalnızca uygulama penceresi (Çalışma alanı) açıkken Charles görünüyor.
- **Önemli:** Windows’un medya bağlantısı bir kez takılınca bilgisayardaki tüm uygulamalar için takılı kalabiliyor. Bu bilgisayarda bağlantı 23 Ekim 22:04’ten beri takılı: o zamandan beri yeni başlatılan medya işlemleri de ilk adımda yanıt alamıyor. Güncellemeden sonra bilgisayarı bir kez yeniden başlat; takılı bağlantıyı yalnızca bu sıfırlar.

## v0.8.15 Beta — 24 Ekim 2026

- **Spotify çubuğu ilerliyor:** Windows şarkının adını geç verdiğinde ya da hiç vermediğinde Charles medya bağlantısını yeniden başlatıp bir dakika boyunca yalnızca Spotify penceresine bakıyordu. O sırada şarkının süresi ve konumu bilinmediği için çubuk 0’da kalıyordu. Artık konum, süre ve çalma durumu her seferinde doğrudan okunuyor. Şarkının adı ve kapağı yalnızca şarkı değişince ya da 20 saniyede bir isteniyor; gecikirse ad Spotify penceresinden alınıyor ve çubuk ilerlemeye devam ediyor. Kapak resmi okunduktan sonra kapatılıyor (açık kalan akışlar Spotify’ın medya oturumunu tıkayabiliyordu). Süre hiç bilinmiyorsa 0’da duran bir çubuk yerine çubuk gizleniyor.
- **Spotify daha sık bulunuyor:** Spotify bildirim alanına (tepsiye) küçültülmüşken de penceresinden çalan şarkı okunuyor. Medya bağlantısının nerede takıldığı `logs/perf.log` dosyasına yazılıyor.
- **Adacık tıklamaları:** küçük adada (kart rafı) krem çizgi adayı en küçük hâline getiriyor, boş bir yere tıklamak büyük adayı (sohbet) açıyor. Büyük adada krem çizgi en küçük hâle, boş bir yere tıklamak küçük adaya götürüyor.
- **Hava durumu:** 5 günlük paneldeki gün kartları küçüldü ve balonun alt kenarına değmiyor. Yağış olasılığı hava simgesinin yanında (yağış yoksa gösterilmiyor).

## v0.8.14 Beta — 24 Ekim 2026

- **Spotify yeniden algılanıyor:** Spotify açık ve müzik çalarken Charles bunu göremiyordu. Windows’un medya bağlantısında bir istek takılınca sonraki her istek de 3 saniye bekleyip boş dönüyordu. Artık takılan bağlantı kendini yeniden başlatıyor. Windows Spotify’ı bildirmezse (Spotify’ın bir ayarı bunu kapatabiliyor) ya da bağlantı yanıt vermezse, Spotify penceresinin başlığından çalan şarkı okunuyor; oynat, duraklat, ileri ve geri medya tuşlarıyla çalışıyor. Birden çok Spotify oturumu varsa çalan seçiliyor. Şarkının adı geç gelse bile çalma durumu hemen görünüyor.
- **Müzik kartı Spotify’ı açıyor:** müzik kartına (tuşlar dışında bir yere) tıklamak Spotify’ı açıyor. “Çalmaya başla” Spotify kapalıyken ya da yanıt vermiyorken önce Spotify’ı açıp birkaç saniye içinde çalmayı başlatmayı deniyor.
- **Hava durumu tahmini:** hava durumu kartı artık şehir seçmeye götürmüyor. AI kullanımı paneli boyutunda bir pencere açılıyor: şu anki sıcaklık, hissedilen, nem, rüzgâr ve önümüzdeki 5 gün (en yüksek/en düşük sıcaklık, yağış olasılığı). Şehri buradaki kalem tuşuyla değiştirebilirsin. Şehir seçimi artık sohbet panelinin üstünde açılıyor; kart rafında aşağısı kesiliyordu.
- **Büyük adada (sohbet) boş yere tıklamak** adayı kapatmak yerine kart rafına döndürüyor. Aşağıdaki krem çubuk adayı tamamen kapatmaya devam ediyor.
- **Kart rafında boş yere tıklamak** adayı en küçük hâline (müzik çalmıyorsa ince şeride) döndürüyor. Krem çubuk sohbeti açmaya devam ediyor.
- **Sohbette Charles** biraz daha yukarıda; Slime ile “Charles” yazısı arasında boşluk var.
- **Modül bildirimleri kapanıyor:** Study with Charles gibi modüllerden gelen bildirimler × ile kapanmıyordu. Fare bir bildirimin üzerine geldiğinde bildirim penceresi adanın ve diğer pencerelerin üstüne çıkarılıyor, böylece tıklama ona ulaşıyor. Modül bildirimleri bir dakika sonra kendiliğinden kapanıyor; aynı modülün aynı mesajı üst üste birikmiyor (birini kapatınca altından kopyası çıkmıyor). Bildirime tıklamak o modülün penceresini açıyor; altında artık “Charles anlatsın” yazmıyor ve mesaj iki satıra sığıyor.
- **Hata düzeltmeleri:** müzik kartında oynat/duraklat tuşuna basınca tıklama kartın kendisine ve rafa da ulaşıp adayı kapatabiliyordu; tıklamanın nereden geldiği artık tuşun simgesi yeniden çizilse bile doğru anlaşılıyor. Eski bir ayar dosyasında ses düzeyi eksikse sesler bozulmuyor.

## v0.8.13 Beta — 24 Ekim 2026

- **Bildirimler kapanıyor:** × ile kapatılan e-posta, takvim ve WhatsApp bildirimleri geri gelmiyor. Kapatılan bir WhatsApp sohbeti, fotoğrafı ya da grup adı birkaç saniye sonra geldiğinde yeniden açılıyordu; artık yalnızca o sohbetten yeni bir mesaj gelirse gösteriliyor. Kapatılan bir e-posta aynı kimlikle tekrar eklenmiyor. Bildirimler adanın üstünde duruyor ve adanın görünmeyen geniş yüzeyi bildirimin üzerindeki tıklamaları almıyor (sabitlenmiş ada da dahil).
- **Yalnızca Slime’lı küçük ada kalktı:** müzik çalmıyorken kapanan ada doğrudan ekranın üstündeki ince gizli şeride dönüşüyor. Müzik çalarken müzikli küçük ada görünüyor; şarkı başlayınca şeritten kendiliğinden çıkıyor. Duraklatınca fare uzaklaştığında yeniden şeride dönüyor. Müzik yokken fareyi şeridin üzerinde kısa bir an tutmak kart rafını açıyor.
- **Sohbette daha büyük Charles:** sohbet panelinin üstündeki Slime belirgin biçimde büyüdü; “Charles” ve sürüm yazısı altında.

## v0.8.12 Beta — 23 Ekim 2026

- **Tek parça ada:** adanın zemini tek düz siyah; üstten alta değişen ton ve köşelerdeki renkli parlamalar kalktı. Ada neredeyse opak, arkadaki pencerelerin keskin kenarları (ör. tarayıcının sekme şeridi) artık içinden görünmüyor. Müzikli küçük adada, kart rafında ve sohbet panelinde üst ve alt kısmın ayrı parçalar gibi görünmesi ve sohbetle yazma kutusu arasındaki geçiş bundandı.
- **Sohbet başlığı:** “Hazırım. Birlikte ne yapalım?” yazısı kalktı. Slime ortada, altında “Charles”, onun altında yeşil durum ışığı ve sürüm.
- **Sohbette krem çubuk:** sürükleyince yükseklik ayarlanıyor; tıklayınca ada en küçük hâline dönüyor. Charles panelinde boş bir yere tıklamak da adayı küçültüyor.
- **Şarkıda ileri/geri sarma:** yeni konum hemen görünüyor (notch’taki çubukta yavaş dolma animasyonu yok). Şarkı çalarken konum her saniye okunuyor; Spotify’da yapılan sarma da çabuk yansıyor.
- **Slime’ı sürükleme:** ilk çekişte takılıp başladığı yere dönmüyor, doğrudan masaüstüne sürükleniyor.
- **Sohbet geçmişi tuşu** ve üst çubuktaki diğer tuşlar basılı ya da üzerinde fare varmış gibi kalmıyor.
- **En küçük ada:** şapkalı Slime ile krem çubuk çakışmıyor; çubuk biraz daha aşağıda.
- **Kart rafı:** Charles daha büyük ve yazısıyla arasında boşluk var; şapkası kesilmiyor.
- **AI kullanımı paneli** v0.8.9’daki gibi: sağlayıcı adının yanında parlayan renkli ışık (“● Codex · kredi”), altında sağlayıcının renginde ışıltılı halkalar. Dönüştürücüde kalite ve boyut, dosyanın altında kısa listeler olarak (çok biçim olduğunda kesilmiyor); dönüştürme sırasında yerini dosya dosya ilerleme alıyor.
- **README:** ekran görüntüleri yeni ada tasarımıyla (notch, kart rafı, dönüştürücü, sohbet).

## v0.8.11 Beta — 23 Ekim 2026

- **WhatsApp fotoğrafları:** gelen fotoğraf (ve çıkartma) bildirim balonunda küçük resim olarak, sohbet açılınca büyük görünüyor; fotoğrafın açıklaması altında. Fotoğraf yalnızca bellekte tutuluyor, diske yazılmıyor.
- **Güncelleme notları:** Ayarlar → Güncellemeler’deki sürüm notları Markdown olarak gösteriliyor (kalın, italik, başlık, liste, bağlantı); “\*\*başlık\*\*” gibi görünmüyor.
- **Ada normal boyutta:** kart rafı 1180 × 284’ten 740 × 170’e küçüldü; kartlar, yazılar ve dönüştürücü de buna göre. AI kullanımı paneli rafın tamamını değil, Charles’ın solundaki kısmı kaplıyor; yüzdeler dairelerin tam ortasında.
- **En küçük ada:** müzik çalmıyorken yalnızca ortalanmış Slime (hava durumu, “Charles”, durum yazısı yok); ada da küçülüyor. Müzik çalarken “Charles”ın altında küçük sürüm yazısı var ve Spotify tuşları biraz aşağıda. Dans ederken Slime’ın kenarında görünen kesik pürüzler giderildi.
- **Siyah ada:** adanın zemini v0.8.9’daki gibi yeniden sıcak siyah cam (gri değil), hâlâ hafif saydam.
- **Ada kenarları:** üst kenardaki kıvrımlar artık adayla aynı yüzey: renk ve saydamlık birebir, bir sekmenin üstündeyken altta kalmıyor. Adanın altındaki siyah gölge kalktı.
- **Krem çubuk** Slime’ın tam altında: Charles artık kart rafının tam ortasında (iki yan eşit genişlikte); çubuk bulunduğu şeritte dikey olarak da ortalı.
- **Bildirimlerin × tuşu** (önemli e-posta, WhatsApp) her basışta çalışıyor: bildirimler basılıyken yeniden çizildiğinde tıklama kayboluyordu; artık bastığın anda kapanıyor ve hemen yerine gelen bildirimi açmıyor. Tuşlar biraz daha büyük, WhatsApp’taki × hep hafifçe görünüyor.
- **Müzik kartında Spotify simgesi:** müzik notası yerine bilgisayarda kurulu Spotify uygulamasının kendi simgesi gösteriliyor (Spotify kurulu değilse nota kalıyor).
- **Kart rafında boş bir yere tıklamak** (yalnızca Charles’ın yanı değil) sohbeti açıyor.
- **Dönüştürücü:** TXT, Markdown, Word ve HTML’den PDF artık boş çıkmıyor; metin Windows’un yazı tipiyle (Segoe UI / Arial, Türkçe karakterlerle) PDF’e yazılıyor ve seçilip aranabiliyor. **PDF → Word** eklendi (metin, paragraf paragraf). Dosya bırakıldıktan sonra kartın etrafında kesik çizgi kalmıyor. Dönüştürme bitip ada kapandıktan sonra raf normal kartlara dönüyor. Spotify’ın ilerleme çubuğu kart kenarına değmiyor; dönüştürücüdeki kalite ve boyut seçenekleri sığıyor.

## v0.8.10 Beta — 23 Ekim 2026

- **Adacığın yeni tasarımı (Ada v2):** üç hâl var. **Kapalı:** ekranın üst kenarında küçük bir notch (Charles, durumu ve hava). Müzik çalarken notch’ta karıştır, önceki, oynat/duraklat, sonraki, tekrar ve altta ilerleme çubuğu. **Açık · Ana sayfa:** notch’a tıklayınca ekranın üstünden sarkan kart rafı: AI kullanımı (dokununca kota halkaları), hava durumu, Dönüştürücü, ortada Charles ve müzik kartı (albüm kapağı, kontroller, ilerleme; çalmıyorsa “Çalmaya başla”). ‹ › okları önceki gibi adayı ekranın soluna/sağına yaslıyor (tekrar basınca ortaya dönüyor). Fare raftan ayrılınca raf birkaç saniye sonra notch’a dönüyor (sabitlenmişse kalıyor). **Sohbet:** Charles’a ya da sohbet tuşuna tıklayınca ada aşağı uzayıp sohbet paneline dönüşüyor; Charles başlığı tek satıra iniyor (“● durum · sürüm”), ‹ › burada da sola/sağa yaslıyor, “Sohbet ▾” ve “+ Yeni konuşma” aynı satırda. Akrilik yarı saydam zemin, buzlu cam kartlar ve üst kenardaki kavisli “kulaklar”.
- **Krem çubuk:** adacığın altındaki çubuk daha uzun ve krem tonunda. Notch’ta ve kart rafında tıklayınca panel büyüyüp sohbet açılıyor; sohbette sürükleyince panelin yüksekliği ayarlanıyor (önceki gibi).
- **Dönüştürücü:** kart rafındaki Dönüştürücü kartına dosya sürükleyince (ya da tıklayıp seçince) yalnızca o dosyaların dönüşebileceği biçimler çıkıyor; seçip **Dönüştür**’e basınca sonuç orijinalin yanına kaydediliyor (aynı adda dosya varsa “(2)” ekleniyor, orijinal hiç değişmiyor). **Görsel:** PNG, JPG, WEBP, AVIF, BMP, TIFF, ICO, GIF, PDF (birden fazla görsel tek PDF’te birleştirilebiliyor), boyut seçimi. **Ses:** MP3, M4A, WAV, FLAC, OGG, OPUS. **Video:** MP4, WEBM, MOV, MKV, GIF, videodan ses (MP3, M4A, WAV), çözünürlük seçimi. Kalite: Yüksek / Dengeli / Küçük. **Belge:** Word → PDF, TXT, HTML, Markdown; Markdown ve TXT → PDF, Word, HTML; HTML → PDF, TXT, Markdown; PDF → TXT. **Veri:** CSV, TSV, JSON birbirine. **Altyazı:** SRT ↔ VTT. **Arşiv:** dosyaları ZIP’le, ZIP’i klasöre çıkar (arşivden klasör dışına yazılamıyor). Birden fazla dosya birlikte dönüşüyor, her biri için ilerleme; İptal ve “Klasörde göster”. Dosyalar hiçbir yere yüklenmiyor: ses, video ve görseller Charles’la gelen FFmpeg ile, diğerleri Charles’ın içinde dönüştürülüyor; PDF yazdıran gizli sayfa internete çıkamıyor. Notch’un üstüne dosya sürükleyince raf açılıyor.

## v0.8.9 Beta — 23 Ekim 2026

- **Adacık ↔ büyük panel geçişindeki takılma:** asıl neden sohbet geçmişinin büyüklüğüydü. GPT her mesajda Charles’ın eklediği tüm sohbet bağlamıyla birlikte isteği de kaydediyordu; oluşturulan görseller geçmişin içinde base64 olarak duruyordu ve uzun komut çıktıları olduğu gibi tutuluyordu. Bir kullanıcının geçmiş dosyası ~50 MB’a çıkmıştı ve her birkaç saniyede ana iş parçacığında yazılıyordu. Artık o istek kaydedilmiyor, görseller geçmişin yanındaki `history-images` klasörüne dosya olarak yazılıp gerektiğinde açılıyor, uzun çıktılar kısaltılıyor. Geçmiş arka planda yazılıyor (kapanışta hemen). Sohbet araması ana süreçte yapılıyor; sohbet listesi her olayda tüm sohbetlerin metnini taşımıyor. Geçiş sırasında sohbet yeni genişlikte dizilene kadar gizleniyor, kaydırma yeri korunuyor.
- **WhatsApp grupları:** grup mesajları artık grup olarak görünüyor (grup adı, altta “Yazan: mesaj”). Açınca gruptaki son mesajlar, her birinde yazanın adıyla. “Grup mesajlarını da göster” kapalıyken grup, kanal ve durum mesajları hiç gelmiyor; kapatınca mevcut grup kartları da kalkıyor; ayar artık başka bir işlem sürerken de kaydediliyor.
- **WhatsApp kartı:** gönder tuşu ortalandı. × tuşu kartın içinde ve her tıklamada çalışıyor (penceresinin dışında kalan kısmı tıklanamıyordu); kart hemen kapanıyor. Tuşların üzerinde Windows’un kendi ipucu kutusu çıkmıyor.
- **Adacık uyanırken bildirimler:** adacık büyürken (uykudan uyanma, açılma) bildirim balonu hemen yeni yerine geçiyor; adacık ve balon artık birkaç saniye üst üste binmiyor. Adacık küçülürken balon önceki gibi animasyonun bitmesini bekliyor.
- **README:** Modüller bölümü (resmî modüllerin ekran görüntüleri, Releases → Modules bağlantısı, herkesin modül geliştirebileceği), uygulama içi güncellemenin v0.8.2’den beri kararlı çalıştığı notu.

## v0.8.8 Beta — 23 Ekim 2026

- **Uzun sohbetlerde geçmiş kaybolmuyor:** Claude, Gemini, Cursor ve Abacus AI ile (ve Charles yeniden açıldıktan sonra GPT ile) her mesajda sohbetin yalnızca son 24 mesajı / 30.000 karakteri gidiyordu; uzun bir sohbette baştaki içerik (ör. Charles’ın yazdığı 7 soru) kayboluyor, “7. soru geçmişte yok” deniyordu. Artık sığdığı sürece sohbetin tamamı gidiyor (160.000 karaktere kadar). Sığmazsa sohbetin başı ve son mesajlar tam kalıyor, aradakiler kısaltılıyor ve bu yapay zekâya söyleniyor. Abacus AI’nin komut satırı sınırı için ayrı, küçük bir bütçe var.
- **Projeler:** sohbet listesinde Klasörler’in üstünde **Projeler** var. Klasör sohbetleri yalnızca gruplar; bir projedeki sohbetler ise birbirini biliyor: projeye yeni mesaj yazınca Charles projenin talimatlarını ve projedeki diğer sohbetlerin özetini (en yeni 10 sohbet) de görüyor. Projede yeni sohbet (kalem tuşu), proje talimatları, adlandırma, sohbeti sürükleyerek ya da “Projeye ekle” ile taşıma var. Proje kaldırılınca sohbetleri silinmiyor. Bir sohbet ya bir projede ya bir klasörde duruyor; projedeki sohbetler otomatik klasörlenmiyor.
- **Boş sohbetler birikmiyor:** içine mesaj yazılmamış sohbetler Son sohbetler’de görünmüyor ve kaydedilmiyor; başka sohbete geçince siliniyor. Eski boş sohbetler ilk açılışta temizleniyor.
- **Modüller için Slime:** modüller artık Charles’ın Slime’ını kendi pencerelerinde kullanabiliyor: `<script src="/_charles/slime.js">` ile gelen `CharlesSlime.mount()` aynı çizim motoru, kullanıcının rengi ve aksesuarları (ya da modülün kendi görünümü), imleci izleyen gözler, üzerinde durunca kalp, tıklayınca jöle gibi sallanma, üç hızlı tıkta baş dönmesi, çift tıkta göz kırpma ve Charles’ın sesleriyle geliyor; modüller motorun kopyasını taşımak zorunda değil. Yeni API: `slime.look()` (görünüm), `slime.react()` (selam, göz kırpma, sallanma, baş dönmesi…), `slime.wear()` (yeni **Görünüm** / `appearance` izniyle, modül açıkken masaüstündeki Slime’a geçici aksesuar; modül kapanınca kullanıcının seçimi geri geliyor) ve `on('slime-look')`. `info().features` bunları bildiriyor.
- **Okuma animasyonunda gözlük:** Slime gözlük (ör. yuvarlak gözlük) takarken okuma animasyonu kendi gözlüğünü üstüne çizmiyor; gözler gözlüğün içinde kalıyor.
- **WhatsApp mesajları Charles’ta (deneysel):** Ayarlar → Eklentiler → WhatsApp’tan “WhatsApp’ı bağla” deyip QR kodu okutunca gelen mesajlar adacığın altındaki bildirim balonunda görünüyor: tek mesaj, birden fazla sohbet için “N yeni mesaj” (açılınca liste), ↩ ile **hızlı yanıtlar**, yazıp gönderme (emoji ile), “Mesaj gönderiliyor…”, “Yanıt gönderildi” ve **Sohbeti aç**. Yeni mesajda Slime tepki veriyor. Kayıtlı kişiye “WhatsApp’tan Ahmet’e … at” komutu bağlıyken doğrudan gönderiliyor. Altyapı: açık kaynaklı GOWA köprüsü yalnızca istek üzerine GitHub’dan indiriliyor, SHA-256 ile doğrulanıyor ve yalnızca bu bilgisayarda (127.0.0.1, rastgele port ve parola, imzalı webhook) çalışıyor. Mesajlar diske ya da günlüğe yazılmıyor. Yalnızca sana yazan sohbetlere, sen gönder’e bastığında, dakikada birkaç mesaj gönderilebiliyor. Resmî bir WhatsApp bağlantısı değil.
- **WhatsApp kartı sadeleşti:** kayıtlı kişiler tek bir “Kayıtlı kişiler” satırının arkasında (tıklayınca açılıyor); kişi satırları ve × tuşu düzeltildi.
- **Adacık ↔ büyük panel geçişi:** dönüşte büyük pencere bazen açık kalıp adacık onun ortasında görünüyordu (özellikle uzun sohbetlerde). Pencere boyutu kaydedilemese de geçiş tamamlanıyor, sayfa her zaman gerçek durumu alıyor ve geçişten kısa süre sonra pencereler denetlenip düzeltiliyor. Windows’ta dosyayı bir anlığına kilitleyen (arama dizini, antivirüs, OneDrive) kayıtlar birkaç kez yeniden deneniyor. “Adacığa dön” yazısı tek satırda.

## v0.8.7 Beta — 22 Ekim 2026

- **Modüller kartı:** büyük paneldeki eklenebilir kartlara **Modüller** eklendi (Düzenle → kart ekle). Yüklü modüller üç sütunlu bir ızgarada görünüyor; her birinin **Aç** tuşu modülü kendi penceresinde açıyor. Akıllı ev kartı gibi kartın Düzenle penceresinden hangi modüllerin görüneceği seçilip sürükle-bırak ile sıralanıyor; seçim `companion.json`’da saklanıyor. Kapalı ya da hatalı modüllerin tuşu devre dışı; modül yüklenince veya kaldırılınca kart kendiliğinden yenileniyor.
- **Modüller görsel gönderebiliyor:** `charlesModule.ai.chat` isteğe bağlı bir `images` alanı alıyor (ör. `images: ['courses/k1/sources/s9.png']`). Yollar modülün kendi veri klasöründe çözülüyor, dışarı çıkamıyor; yalnızca PNG, JPG, JPEG ve WebP (en fazla 10 görsel, her biri 20 MB) kabul ediliyor. Mevcut `ai` izni yeterli. Görseller ana sohbetteki eklerle aynı biçimde (`localImage`) yapay zekâya gidiyor. Model Cursor ya da Abacus AI ise istek “Görseller şu an yalnızca GPT, Claude ve Gemini ile çalışıyor.” hatasıyla dönüyor (görseller sessizce atlanmıyor).
- **Yetenek bildirimi:** `charlesModule.info()` artık `features: ['ai.images']` döndürüyor. Modüller bu alana bakarak eski Charles sürümlerinde görsel göndermeyi hiç denemeyip kendi uyarılarını gösterebiliyor.
- **Claude ve Gemini görsel alıyor:** abonelik bağlantıları görselleri destekliyor; bu ana sohbeti de kapsıyor (önceden fotoğraf eklenince “Görsel için GPT seç” hatası çıkıyordu). Claude’a görseller `stream-json` girişiyle mesajın içinde gidiyor; 5 MB’tan büyük fotoğraflar önce küçültülüyor. Gemini’nin (Antigravity) mesaj girişi yalnızca metin aldığı için görseller o mesaja özel geçici bir klasöre kopyalanıyor, Gemini’ye yalnızca dosya okuma izni veriliyor (yazma, komut, internet kapalı) ve yanıt bitince klasör siliniyor.

## v0.8.6 Beta — 22 Ekim 2026

- **Modüller herkese açık:** v0.8.5’teki `trusted.json` (yalnızca tanınan Download paketine izin veren liste) kaldırıldı. **İndirme** (`download`) izni artık diğer izinler gibi çalışıyor: başka geliştiricilerin modülleri de bu izni `manifest.json` içinde isteyebiliyor; kullanıcı kurulum ekranında izni görüp onaylarsa modül Charles’ın indirme altyapısını (yt-dlp, FFmpeg, indirme kuyruğu) kullanabiliyor. Paket özeti, “resmi modül” şartı ve klasörden yüklemede Geliştirici modu şartı yok. Adacığın altındaki indirme kartı ve kopyalanan bağlantı önerileri `download` kimlikli modüle ait.
- İzin açıklaması güncellendi: izni alan modülün indirme kuyruğunu görüp yönetebileceği de yazıyor.

## v0.8.5 Beta — 22 Ekim 2026

- **Formüller kopyalanabiliyor:** satır içi bir formüle tıklayınca, blok formülde ise sağ üstteki düğmeyle formül kopyalanıyor. Panoya LaTeX kaynağı (`$…$` / `$$…$$`) ve Word / OneNote’un denklem olarak yapıştırdığı MathML birlikte gidiyor. İçinde formül olan bir metni seçip kopyalayınca formüller kaybolmuyor, LaTeX olarak geliyor.
- **E-postalar yeni sohbette açılıyor:** Charles bir sohbette (ör. bir projede) çalışırken önemli e-posta balonuna tıklayınca e-posta artık o sohbete düşmüyor; yeni bir sohbet açılıp e-posta orada anlatılıyor, eski sohbetteki iş arka planda sürüyor. Mesaj kutusunda yazdığın yarım metin kaybolmuyor.
- **Ek talimatlar sohbetin içinde:** GPT çalışırken gönderilen ek talimat, gönderildiği yerde duruyor; sonraki adımlar ve yanıtın devamı talimatın altına geliyor (önceden talimat en altta kalıyor, iş onun üstünde büyüyordu). Yanıtını tek seferde veren Claude, Gemini, Cursor ve Abacus AI için sıradaki talimat da mesaj kutusunun üstü yerine sohbette “Ek talimat · sırada” olarak görünüyor; yanıt bitince gönderiliyor, “Şimdi” ve × düğmeleri yerinde.
- **Download araçları Charles ile geliyor:** yt-dlp (2026.10.21) ve FFmpeg (6.0, ffmpeg-static b6.0) SHA-256’ları doğrulanarak Setup’ta `tools\download` içine konuyor. Uygulama içi güncellemede `download-tools` olarak geliyor ve Charles ilk açılışta `tools\download`’a taşıyor. Charles araçları sırasıyla `tools\download`, `download-tools`, `%APPDATA%\Charles\download-tools` ve Charles klasörünün yanındaki `charles-download-module\tools` klasöründe arıyor; sonradan eklenen araçlar yeniden başlatmadan bulunuyor. Download modülünün son hali (kart, küçük resim, boyut tahmini) Charles’a alındı.
- **Güvenlik — Download köprüsü:** internetten indirme, yt-dlp/FFmpeg çalıştırma ve pano okuma artık **İndirme** iznini isteyen ve kullanıcının kurulumda onayladığı modüllere açık (v0.8.5’teki paket listesi v0.8.6’da kaldırıldı). Önceden adı `download` olan herhangi bir modül bu yetkileri izin göstermeden alabiliyordu. Bu yüzden Download modülü 1.0.1’e geçti (1.0.0’ın kuyruğu ve ayarları korunur). Kopyalanan bağlantıları izleme artık varsayılan olarak kapalı; modülden açılıyor.
- **Güvenlik — Gemini klasörleri:** mesajda yazılan bir klasör artık sormadan proje klasörü yapılmıyor; Charles “Bu klasör proje olarak kullanılsın mı?” diye soruyor. Sürücü kökleri (C:\), Windows, Program Files, ProgramData, kullanıcı ve AppData kökleri ile Charles’ın kendi klasörleri hiç önerilmiyor. “Sohbette kal” denen klasör o sohbette tekrar sorulmuyor.
- **Güvenlik — Gemini kotası:** v0.8.4’te eklenen ve Antigravity’nin Google oturum anahtarını Windows Kimlik Bilgisi Yöneticisi’nden okuyup Google’ın iç kota servisine istek atan betik kaldırıldı. Kota yalnızca resmi aracın kendi çıktısından okunuyor.
- **Disk:** Charles.exe’nin her sürümde oluşturduğu ~235 MB’lık `charles-host-*.exe` kopyalarının eskileri artık açılıştan bir dakika sonra siliniyor (çalışan kopya kalıyor).
- **Ekler:** 50 dosyaya kadar ek korunuyor, ama bir mesajdaki eklerin toplam metni en fazla 1.000.000 karakter (önceden her PDF 900.000 karaktere kadar, toplam sınırsızdı).
- **Diğer:** 0.8.1–0.8.4’te eklenip İngilizcesi olmayan metinler çevrildi (TR, EN, DE, FR, ES, ZH). Masaüstü kısayolu betiğindeki sürüm düzeltildi. Windows’a özgü testler (Charles.exe, PowerShell yolları) başka sistemlerde başarısız olmak yerine atlanıyor; güncelleme betiği yol ayırıcısını sisteme göre seçiyor. Download modülü belgesi ana depodan kaldırıldı (modül ayrı zip ile yükleniyor).

## v0.8.4 Beta — 21 Ekim 2026

- Büyük panel ve tüm modül pencereleri ortak Windows kimliği ve Slime simgesi kullanır; eski sabitlenmiş kısayollar güncellenir.
- Download köprüsü adacığın gerçek konumunu ve Charles dilini kullanır; seçilen zaman aralığı uzaktan indirilir. Modül ayrı dağıtılır.
- Gemini kotası yapılandırılmış CLI yanıtı ve gerektiğinde Google’ın doğrudan kota servisiyle okunur. Beş saatlik alan desteklenir; sorgu yalnızca yenilemede ve büyük panel açılışında yapılır. Sağlayıcının göndermediği alanlar uydurulmaz.

## v0.8.3 Beta — 21 Ekim 2026

- Çalışan Electron süreci de Slime simgesi gömülü bir Charles host üzerinden açılır. Eski güncelleyici/kısayol ile açılış otomatik yönlendirilir; orijinal Electron dosyası korunur.
- Windows başlatıcısı Charles.exe artık Slime simgesini kendi kaynaklarında taşır; masaüstü/Başlat kısayolları bu başlatıcıyı kullanır.
- Büyük panel, Başlat menüsü ve masaüstü kısayolları aynı AppUserModelID ile eşleştirilir. Mevcut kurulumun kısayolları ilk büyük panel açılışında düzeltilir.
- Görev çubuğu simgesi değişmez, içerik adresli ICO dosyasından okunur; eski charles.ico yolunda önbelleğe alınmış boş simge yeniden kullanılmaz.
- Pencere simgesi kayıt hataları artık sessizce yutulmaz. Download modülü paketlere dahil değildir.

## v0.8.2 Beta — 20 Ekim 2026

- Slime simgesi kullanıcı verisi klasöründe kalıcı tutulur; büyük panel her gösterildiğinde/odaklandığında görev çubuğu simgesi yenilenir. Masaüstü kısayolu artık Electron yerine Slime simgesini kullanır.
- Adacık ve büyük panelde işlem adımları durum işaretleri, kısa özetler ve açılabilir komut/çıktı alanlarıyla yeniden düzenlendi.
- Yeni sohbete geçildiğinde önceki işin “İş bitti” kartı ve geçici adımları temizlenir.
- Yanıt akarken Markdown, tablolar ve LaTeX denklemleri işlenir. Kullanıcı mesajlarında da Markdown desteklenir; denklemler çevrimdışı MathML olarak gösterilir.
- Seçim, sürükleme, yapıştırma ve gönderim için dosya eki sınırı 50 oldu.
- Gemini'ye mesajda açıkça verilen mevcut Windows klasörü çalışma alanı olarak atanır ve arayüz Proje moduna geçer. Onay iste ayarında salt okuma; düzenleme izni olan ayarlarda dosya düzenleme etkin kalır. Komut izinleri genişletilmez.
- Araçsız sağlayıcılara PDF yolu yerine çıkarılmış metin gönderilir; okunamayan/taranmış PDF'ler açık hata mesajı verir.
- Windows güncelleyicisi bağımsız gizli işlemle başlatılır; çalıştığı doğrulanmadan Charles kapanmaz. Başlatma hata kayıtları _update klasöründedir. Dosya değişimi, yedek ve hata halinde geri alma korunur.
- Setup ve update paketleri isteğe bağlı Download modülü ZIP'ini ve Download araçlarını içermez. Mevcut modül köprüsü uyumluluk için korunur.

**Eski sürümden geçiş:** Eski sürümün güncelleyicisi dosyaları _update içinde bırakıyorsa, bu sürümün Setup paketini bir kez kullanın. Yeni güncelleyici, eski çalışan uygulamayı indirilen ZIP içinden geriye dönük düzeltemez. Sohbetler ve ayarlar %APPDATA%\Charles içinde korunur.

## v0.8.1 Beta — 20 Ekim 2026

- **Charles Download:** Ayrı ZIP modülüyle MP4 video, MP3 ses ve doğrudan dosya indirme; kalite seçimi, zaman aralığı ile kesme ve iki işlik indirme kuyruğu.
- **Pano ve adacık:** Desteklenen video/dosya bağlantısı kopyalanınca adacığın altında seçenek kartı gösterilir. İndirme kullanıcı düğmeye bastığında başlar; pano izleme modül içinden kapatılabilir.
- **İlerleme ve devam:** Gerçek byte/hız/ilerleme bilgisi, iptal, indirme aşamasında duraklatma/devam, geçmiş ve klasörde gösterme. Sunucu HTTP Range desteklemiyorsa doğrudan dosya baştan güvenli biçimde yazılır. Yeniden açılışta yarım işler duraklatılmış kalır.
- **MP4/MP3 kesitleri:** yt-dlp medyayı alır; FFmpeg seçilen zaman aralığını MP4 (H.264/AAC) veya MP3'e dönüştürür. Bu sürüm kesme öncesinde kaynak medyayı indirir; seçilen bölüm kadar trafik garantisi vermez.
- **Modül köprüsü:** İndirme altyapısı app/modules/download/ altında ayrıdır; yalnızca download kimlikli etkin modüle açıktır. Diğer modüllerin ağ ve dosya sistemi sınırları korunur. main.cjs değişmedi.
- **Dağıtım:** İndirme modülü ZIP'i ve indirme araçları kurulum paketine eklenir; README, geliştirici ve modül belgeleri güncellendi. Sürüm 0.8.1-beta.1.

## v0.8.0 Beta — 18 Ekim 2026

- **Modüller:** Charles’a kendi kodu ve arayüzü olan, kendi penceresinde açılan küçük uygulamalar eklenebiliyor. **Ayarlar → Modüller → Modül yükle** ile bir `.zip` modül seçiliyor; kurmadan önce adı, sürümü, yazarı, açıklaması ve istediği izinler (anlaşılır açıklamalarla) gösteriliyor, **Kur / Vazgeç** ile onaylanıyor. Aynı modül yeniden yüklenince güncelleme olarak davranıyor: sürümler gösteriliyor, modülün verisi korunuyor.
- **Güvenlik:** Modül yalnızca Charles’ın verdiği API ve izinlerle çalışıyor; Node.js’e, dosya sistemine ve internete doğrudan erişemiyor. Pencere korumalı (sandbox, ayrı oturum, ağ istekleri ve indirmeler engelli, sıkı içerik güvenlik politikası); `charles-module://` adresi yalnızca o modülün kendi dosyalarını veriyor. Zip paketinde klasör dışına çıkan yollar (zip-slip), mutlak yollar, 2000’den fazla dosya, 100 MB’tan büyük içerik ve çalıştırılabilir dosyalar (`.exe`, `.dll`, `.bat`, `.ps1`, `.vbs`, `.msi`, `.lnk` …) reddediliyor. Bağlantılar yalnızca kullanıcı onaylarsa varsayılan tarayıcıda açılıyor.
- **Modül API’si v1 (`window.charlesModule`):** `info`, `ai.chat` (Charles’ın bağlı modeliyle; sohbet geçmişine yazmaz), `ai.image` (sohbetteki görsel aracıyla; görsel modülün verisine kaydedilir), `storage` (yalnızca modülün kendi veri klasöründe, 500 MB kota), `voice.speak` / `voice.stop`, `slime.emote`, `notify` ve dil değişikliği olayı. Her çağrı, gönderen pencerenin modülüne ve izinlerine göre denetleniyor ve sıklığı sınırlanıyor.
- **Modül kartları:** simge, ad, sürüm, yazar, açıklama, izin etiketleri, **Aç**, açık/kapalı anahtarı ve **Kaldır** (isteğe bağlı “Verilerini de sil”). Kapalı modüller açılamıyor. Sistem tepsisi menüsünde açık modüller için **Modüller** alt menüsü var. Pencerenin boyutu ve konumu hatırlanıyor; aynı modül ikinci kez açılınca mevcut pencere öne geliyor.
- **Geliştirici modu:** **Klasörden yükle** ile bir klasör aynı denetimlerden geçirilip yerinde kullanılıyor; dosyalar değişince açık modül penceresi kendiliğinden yenileniyor.
- **Örnek ve belgeler:** `docs/examples/hello-module` (her API’yi deneyen örnek modül), `npm run module:pack <klasör>` (klasörü denetleyip .zip yapar) ve `docs/MODULES.md` (İngilizce: paket biçimi, manifest, izinler, API, güvenlik sınırları).
- **Abacus AI desteği:** Abacus AI hesabı olanlar, resmi `abacusai` komut satırı aracıyla Charles’a bağlanabiliyor (**Ayarlar → Hesap → Abacus AI hesabı**). Araç Charles ile gelmiyor; kurulu olduğu yer (npm ya da Abacus’un kendi kurulumu) kendiliğinden bulunuyor, npm kurulumu kabuk (cmd) üzerinden değil doğrudan Node ile çalıştırılıyor. Kart diğer hesaplarla aynı düzende: **Charles ile kur** (Slime adım adım anlatıyor: aracı kur, giriş penceresini aç, `/login`, bağlantıyı test et) · **Abacus AI ile giriş** (bir konsol açıyor) · **Bağlantıyı test et** (kısa bir deneme mesajıyla girişi doğruluyor) · **Kurulum sayfası**. Bağlantı doğrulanınca hesaptaki tüm modeller araçtan okunup model listesine ekleniyor; GPT modelleriyle karışmasın diye hepsinin adı “Abacus AI · …” ile başlıyor (ör. “Abacus AI · GPT-6.1-Sol”), **Abacus AI · Otomatik** her zaman var. Sohbet modunda salt okunur çalışıyor (`--permission-mode plan`; kabuk, dosya yazma/okuma ve web kapalı); proje modunda Charles’ın erişim ayarına göre plan ya da kabuksuz düzenleme. İzinleri atlayan mod (yolo) hiç kullanılmıyor; aracın kendi kendini güncellemesi ve AGENTS.md yüklemesi kapalı. Kullanım bilgisi için “Bilgi yok” gösteriliyor.
- **Kalan kullanım kartı özelleştirilebiliyor:** büyük paneldeki kartın başlığındaki ayar düğmesiyle hangi yapay zekâların gösterileceği seçiliyor. Varsayılan “Bağlı olanların hepsi”: Codex ve bağlı her hesap (Claude, Gemini, Cursor, Abacus AI) görünüyor, bağlı olmayanlar gizleniyor. Seçim ana sayfa ayarıyla birlikte saklanıyor.
- **Yerinde güncelleme (GitHub Releases):** **Ayarlar → Genel → Güncellemeler**’de **Güncellemeleri denetle** düğmesi ve **Açılışta otomatik denetle** anahtarı (varsayılan açık). Charles en yeni sürümü `api.github.com/repos/ardadgnyt/ProjectCharles/releases/latest` adresinden alıyor (yalnızca ön sürümler varsa sürüm listesinden; API yanıt vermezse projenin GitHub sayfasından) ve `package.json` sürümüyle semver olarak karşılaştırıyor. Yeni sürüm varsa değişiklik notlarıyla bir kart çıkıyor; **Güncelle** ile sürüme eklenmiş `charles-update-<sürüm>.zip` ve `.sha256` indiriliyor (yalnızca GitHub’dan), SHA-256 doğrulanıyor, zip geçici klasöre (`_update`) zip-slip, boyut, dosya sayısı, uygulama adı ve sürüm denetimleriyle açılıyor. Charles kapanıyor; küçük bir PowerShell betiği yalnızca zip’teki uygulama dosyalarını (app/, dist/, public/, package.json …) değiştiriyor, eskilerini `_update\backup`’a alıyor, hata olursa hepsini geri koyuyor ve Charles’ı yeniden açıyor. `%APPDATA%\Charles` verisine, node_modules’e ve modellere (zip’te yoksa) dokunulmuyor. Sonuç bir sonraki açılışta bildirimle gösteriliyor; ilerleme ve hata metinleri Türkçe ve İngilizce (ve diğer dillerde).
- **`npm run release:pack`:** güncelleme paketini (`release/charles-update-<sürüm>.zip`) ve SHA-256 dosyasını üretiyor; ikisi GitHub sürümüne yükleniyor. Ayrıntılar `docs/UPDATES.md`’de.
- **Kurulumda dil seçimi:** kurulum ilk olarak dili soruyor (varsayılan İngilizce; Türkçe, Deutsch, Français, Español, 中文). Tüm kurulum metinleri seçilen dilde; Charles da ilk açılışta bu dille başlıyor (`charles-install.json`, her kurulumda bir kez uygulanır, sonra Ayarlar’dan değiştirilebilir).
- **Testler:** sürüm karşılaştırma, GitHub API / sayfa yedeği, zip doğrulama (zip-slip, mutlak yol, korunan dosyalar, boyut sınırları, SHA-256), PowerShell betiğinin yedekleme ve geri alma davranışı, release:pack, Abacus AI komut satırı güvenliği ve kurulum dilleri için yeni testler.

## v0.7.9 Beta — 17 Ekim 2026

- **Büyük panelde sohbet yine en üstten başlıyor:** v0.7.7’de sohbetin üstüne eklenen “Şu an ne yapıyorum?” / “İş kuyruğu” şeridi, sohbet ekranının esneyen satırını alıyordu; kısa bir sohbet ve Sohbet/Proje seçicisi ekranın ortasına, aşağıya itiliyordu. Sohbet ekranı artık dört satır (başlık · şerit · sohbet · ipucu); seçici ve ilk mesajlar şeridin hemen altından başlıyor.

## v0.7.8 Beta — 17 Ekim 2026

- **Dosya bırakma ve takılı kalan krem çerçeve:** v0.7.7’de büyük paneldeki Slime animasyonu, bırakılan dosyayı mesaj kutusuna ekleyen dinleyicinin yerini alıyordu; dosya eklenmiyor, adacığın ve büyük panelin etrafındaki krem çerçeve ile + yerindeki kutu Slime ekranda kalıyordu. Artık iki dinleyici birlikte çalışıyor. Ayrıca pencere içinde metin seçip sürüklemek ya da kart/cihaz taşımak artık “dosya bırakma” durumunu açmıyor; sürükleme pencerenin içinde bitse, iptal edilse ya da pencereden çıksa da durum kapanıyor.
- **Akıllı ev düzenleyicisi:** cihazlar sürükle bırakla yeniden yerleştirilebiliyor. Sürüklerken tahta her harekette yeniden çiziliyordu; sürüklenen kutu sayfadan kalkınca sürükleme hemen bitiyordu. Artık yalnızca “Buraya bırak” yeri hareket ediyor.
- **Sohbetin üstü daha sade:** “Şu an ne yapıyorum?” ve “İş kuyruğu” yan yana ve daha küçük; kuyruk açılınca listesi en fazla birkaç kart yüksekliğinde. Dar pencerede yine alt alta.
- **Kurulum:** `install.ps1` içindeki “Windows 11’in” yazısındaki kıvrık kesme işareti PowerShell’de dizeyi kapatıyordu ve kurulum 52. satırda sözdizimi hatası veriyordu. Düzeltildi; kurulum dosyalarında kıvrık tırnak kalmadığı testle denetleniyor.

## v0.7.7 Beta — 17 Ekim 2026

- **“Şu an ne yapıyorum?”:** uygulama penceresinde sohbetin üstünde Charles’ın yürüttüğü iş görünüyor: isteğin kendisi, planın hangi adımında olduğu (ör. “Adım 3/4 · Testleri çalıştır”) ve o an ne yaptığı (komut, web araması, dosya), değiştirdiği dosyalar ve senden beklediği şey (onay ya da cevap, “Göster” ile karta gider). Yanında **Durdur**, **Devam et** ve **Yön değiştir** var; yön değiştirme, çalışan işe ek talimat olarak gider. Süre tahmini yalnızca güvenilir olduğunda gösteriliyor: plan en az üç adımlıysa, en az iki adım tek tek bitmişse ve süreleri birbirine yakınsa.
- **İş kuyruğu:** sohbette kaybolan istekler yerine sıraya konabilen görev kartları (“Şunu araştır”, “Bu dosyayı düzenle”, “Ardından sonucu karşılaştır”). Kartlar sürüklenerek yeniden sıralanıyor; bir kart bir öncekine bağlanabiliyor ve bağlıysa o iş başarıyla bitmeden başlamıyor (“Ardından · 2. işten sonra”). “Sırayla çalıştır” açıkken bir iş bitince sıradaki kendiliğinden başlıyor; durdurulan iş kuyruğu bekletiyor.
- **Değişiklik inceleme ekranı:** Charles’ın değiştirdiği dosyaların önceki ve sonraki hali. Kodda satır numaralı fark görünümü, metin belgelerinde değişen paragraflar (değişen kelimeler işaretli), görsellerde yan yana karşılaştırma. Önceki hali kaydedilen değişikliklerde **Geri al** var; dosya Charles’tan sonra yeniden değiştiyse üzerine yazmamak için geri alınmıyor. Kopyalar yalnızca bellekte tutuluyor (dosya başına en fazla 4 MB, son 60 değişiklik).
- **Özelleştirilebilir ana sayfa:** sağ üstte ayarların yanında **Ana sayfayı düzenle** düğmesi. Düzenleme modunda kartlar sürüklenerek başka yere ya da sütuna taşınıyor, × ile kaldırılıyor; **Kart ekle** ile yeni kartlar seçiliyor (sol/sağ sütun seçilerek). Yeni kartlar: **Hızlı komutlar** (tek tıkla Charles’a giden hazır mesajlar), **Notlar** (kendiliğinden kaydedilir), **Sistem kullanımı** (işlemci, bellek, disk), **Sistem bilgileri** (Windows sürümü, işlemci, bellek, ekran). Yeni kartlar başlangıçta ana sayfada yok.
- **Dosya sürükleyince Slime:** büyük panelde bir dosya sürüklendiğinde mesaj kutusunun + düğmesi, aynı boyutta Charles’ın kendisine dönüşüyor ve adacıktaki gibi dosyayı alma mimiğini yapıyor; bırakınca yutuyor.
- **Kalan kullanım:** yenile düğmesinin oku, kotalar okunurken dönüyor.
- **Home Assistant yeniden bağlanma:** bağlantı koptuğunda hata artık önbelleğe alınmıyor ve tek istek en fazla 15 saniye sürüyor; kart 5 sn, 10 sn, 20 sn, sonra 30 saniyede bir kendiliğinden yeniden deniyor, pencereye dönünce ve ağ gelince hemen deniyor. Charles’ı yeniden başlatmaya gerek kalmıyor. “Yeniden dene” düğmesi de eklendi.
- **Büyük panel sürüklenemiyordu:** pencere bazen başlık çubuğundan tutulup taşınamıyor, olduğu yerde kalıyordu. Sürükleme alanı, sayfa adacıktan pencereye geçince, pencere odak alınca, boyut değişince ve bir pencere/iletişim kutusu kapanınca yeniden bildiriliyor. Artık işe yaramayan eski kenar tutamaçları kaldırıldı.

## v0.7.6 Beta — 17 Ekim 2026

- **Görev çubuğu simgesi:** uygulama penceresi açıkken görev çubuğunda boş Windows program simgesi yerine Charles’ın (Slime renginde) simgesi görünüyor. Pencere kendi uygulama kimliğini ve simgesini Windows’a bildiriyor; Slime rengi değişince görev çubuğu da güncelleniyor.
- **Dar pencerede düzen:** pencere küçültüldüğünde veya ekranın yarısına yaslandığında kartlar artık ekran genişliğine değil kendi genişliklerine göre yerleşiyor:
  - Genel bakış iki sütun sığmıyorsa tek sütuna iniyor; yana kayan çubuk çıkmıyor.
  - Spotify kartında kapak küçülüyor (çok darda gizleniyor), tuşlar ve ilerleme çubuğu kartın dışına taşmıyor.
  - **Kalan kullanım** halkaları sığmazsa 2 × 2 diziliyor.
  - E-posta satırlarında uzun adlar “…” ile kısalıyor, saat dışarı itilmiyor; akıllı ev kutucukları genişliğe göre diziliyor.

## v0.7.5 Beta — 17 Ekim 2026

- **Siyah-krem tema:** gri-mavi yüzeyler sıcak siyaha, yazılar, çizgiler ve vurgular kreme döndü. Adacık hafif şeffaflığını koruyor; uygulama penceresi, kartlar, yan panel, terminal, ayarlar ve sohbet listesi aynı renklerde. Windows başlık çubuğunun rengi de yeni arka plana uyuyor.
- **Adacıkta Spotify tuşları:** daire ve kutular kalktı; Windows medya paneli gibi sade, ince ikonlar (önceki / oynat-duraklat / sonraki), üzerine gelince yumuşak bir vurgu. Küçük adacıkta boyutlar adacığa göre küçülüyor.

## v0.7.4 Beta — 16 Ekim 2026

- **Uygulama penceresi gerçek bir Windows penceresi:** Çalışma alanı artık Windows’un kendi çerçevesiyle açılan ayrı bir pencere; adacık ile aynı sayfayı (sohbet, Slime, kartlar) paylaşıyor, hiçbir şey yeniden yüklenmiyor. Böylece Windows’un yaslama özellikleri çalışıyor: üste sürükleyince yerleşim çubuğu, kenarlara/köşelere yaslama, Win + ok tuşları, büyüt düğmesinin üzerinde bekleyince yerleşim seçenekleri; kenarlardan boyutlandırma ve Windows’un küçült / büyüt / kapat düğmeleri.
- **× ve kapatma:** uygulama penceresinin ×’i, Alt+F4 ve görev çubuğundaki “Pencereyi kapat” Charles’ı adacığa döndürür. Adacık penceresi kapatılmaya çalışılsa da Charles kapanmaz; çıkmak için Shift + × veya sistem tepsisindeki Charles simgesi → Çıkış.
- **Claude 5 saatlik kullanım:** 5 saatlik pencere henüz başlamadıysa artık boş kalmıyor, %100 ve “Henüz başlamadı” gösteriliyor. Kota okunamazsa yenile düğmesi arka planda, sohbette görünmeyen çok küçük bir Claude mesajı (Haiku, araçsız, kayıtsız) gönderip oturumu yeniliyor ve yeniden okuyor; en fazla iki dakikada bir.
- **WhatsApp:** WhatsApp penceresi süreç yerine görünür pencereler arasında başlığından bulunuyor (Store sürümünde süreçte pencere görünmüyordu, bu yüzden Enter hiç basılmıyordu), öne getirilip doğrulanıyor, sonra Enter basılıyor. Numarası kayıtlı olmayan kişide WhatsApp’ta Ctrl+F ile kişi adı aranıp ilk sohbet açılıyor ve mesaj yazılıp gönderiliyor. Panodaki metin sonra geri konuyor.
- **Hatırlatıcılar:** bildirim sesinin yanında panel açılıyor ve hatırlatmayla bir kart çıkıyor (Tamam / **10 dk ertele**); kart parlıyor, Slime tepki veriyor, cevap verilene kadar ses birkaç kez tekrarlanıyor. Windows bildirimi de gösteriliyor.
- **Akıllı ev sensörleri:** “Evin içi kaç derece?”, “Nem oranı ne?”, “Salon kaç derece?” soruları yazılı ve sesli olarak doğrudan Home Assistant’taki sıcaklık/nem sensörlerinden ve termostatlardan cevaplanıyor. Adında “hava” geçen cihazlar (hava temizleyici, “Hava Sıkıcı”) artık dış sensör sayılmıyor. Kısayolun yakalamadığı sorularda (“hava sıkıcı sıcaklık ve nemi ölçüyor”) güncel ölçümler yapay zekâya veriliyor; “erişimim yok” demiyor.
- **Yan panel:**
  - Kodun bir kısmı seçilebiliyor (seçim kapalıydı) ve seçim çubuğuna **Düzeltme öner** eklendi.
  - **Terminalde aç** çalışıyor (komut penceresi hemen kapanıyordu; Windows Terminal varsa o açılıyor).
  - **Notepad++ ile aç** eklendi. VS Code, GitHub Desktop veya Notepad++ yüklü değilse “… bu bilgisayarda yüklü değil” uyarısı çıkıyor.
  - **Dosyada ara** artık araç çubuğunun altında kendi satırında; düğmeler panelin dışına taşmıyor, yazarken odak kaybolmuyor, “2 / 5” gibi sonuç sayısı görünüyor.
- **Haftalık özet:** süreler “72 sa 14 dk” gibi saat ve dakika olarak gösteriliyor.
- Ayarlar ve diğer simge düğmelerinin etrafında bazen kalan kare odak çerçevesi kaldırıldı; çerçeve artık yalnızca Tab tuşuyla gezinirken görünüyor.
- Yan panel “resim çiz” gibi işlerde kendiliğinden açılıp Charles’ın kendi iç komutlarını terminalde gösteriyordu. Artık Charles’ın kendi işleri (görsel oluşturma, sohbet klasörü, veri klasörü) panelde görünmüyor; komutlar paneli hiç kendiliğinden açmıyor (Terminal sekmesi panel açıkken güncelleniyor), panel yalnızca projendeki bir dosya yazılınca açılıyor.
- Denenen “her yerde bas-konuş dikte” bu sürümden çıkarıldı.

## v0.7.3 Beta — 16 Ekim 2026

- **Cursor modelleri:** model listesinde Cursor · Auto’nun yanında hesabındaki **Composer** ve **Grok** modelleri de var. Liste Cursor hesabından okunur ve saklanır; okunamazsa Composer 2.5 gösterilir.
- **Yan panel:** kod ve terminal sekmeleri ilk 10 satırdan sonra kesiliyordu (genel `pre` kuralındaki 200 px sınırı). Artık dosyanın tamamı görünür ve aşağı kaydırılır.
- **Claude kalan kullanımı:** oturum yenilenmediğinde eski bir okuma (“%5 · şimdi” gibi, sıfırlama zamanı geçmiş) gerçek değer gibi gösteriliyordu. Sıfırlama zamanı geçmiş eski değerler artık gösterilmiyor; kalanlar “Son bilinen değer” notuyla görünür. Oturum reddedilirse Claude aracı oturumu yeniler ve bir kez daha denenir; her Claude yanıtından sonra kullanım taze oturumla yeniden okunur.
- **× düğmesi:** büyük paneldeki × artık Charles’ı kapatmıyor, adacığa döndürüyor (uygulama penceresinde de). Charles’tan çıkmak için Shift + × veya sistem tepsisindeki (saatin yanı) Charles simgesi → Çıkış.
- Yeni testler: Cursor model listesi, Claude kullanımının tazeliği, yan panel yüksekliği, × davranışı (toplam 210 test).

## v0.7.2 Beta — 16 Ekim 2026

v0.7.1 SpecialBeta’da denenen **uygulama penceresi (Çalışma alanı)** bu sürümle herkese açıldı. Ayrıntıları aşağıdaki SpecialBeta bölümünde.

### Yeni diller

- **Deutsch, Français, Español ve 中文（简体）** eklendi (Ayarlar → Genel → dil). Arayüz metinlerinin tamamı bu dillere çevrildi; çevirisi henüz olmayan yeni bir metin İngilizce görünür.
- Yanıt dili, sesli görüşme (Gemini Live) dili, tarihler ve takvimdeki ay/gün adları seçili dile uyar.

### Kod ve kopyalanabilir metin kutuları

- Kopyalanacak metinler (mesaj taslağı, komut, kod) artık kendi **kutusunda ve kendi Kopyala düğmesiyle** gelir; hem adacıkta hem uygulama penceresinde. Yapay zekâlara kopyalanacak metni kutuya koymaları söylenir.
- Kod kutularında dil etiketi ve renklendirme (Python, JavaScript/TypeScript, JSON, HTML/CSS, C/C++/C#, Java, Go, Rust, PowerShell/Bash, SQL…).

### Yan panel (uygulama penceresi)

- Sohbetin sağında açılan **dosya / kod / terminal paneli**: Charles bir dosya yazınca, kod verince veya komut çalıştırınca sekme olarak açılır; kod kutularındaki panel düğmesiyle de açılır. Satır numaraları, dosyada arama, yeniden okuma, kopyalama; genişliği sürükleyerek ayarlanır.
- **Aç** menüsü: Visual Studio Code ile aç, GitHub Desktop ile aç, varsayılan uygulamada aç, Terminalde aç, klasörde göster, Farklı kaydet… Kod sekmeleri de bu seçeneklerle açılabilir (önce dosyaya yazılır).
- Metin seçince **Sohbete ekle** (seçili satırlar dosya adı ve satır aralığıyla mesaj kutusuna eklenir) ve **Düzenle** (“Düzenlemeyi açıkla” çubuğu açılır, yazılan istek o parçayla birlikte gönderilir).

### Takvim

- Takvim kartı yenilendi: ay ızgarası, renkli noktalar (Google Takvim, Outlook, hatırlatıcı, tatil), seçili günün etkinlik listesi.
- **Düzenle** büyük bir takvim penceresi açar: ay ve hafta görünümü, etkinlik ekleme, düzenleme ve silme (başlık, tarih, tüm gün, başlangıç/bitiş, takvim, hatırlatma, not). Google Takvim etkinlikleri doğrudan Google Takvim’de güncellenir.
- Seçili dilin ülkesindeki **resmî tatiller ve özel günler** kendiliğinden gösterilir (Türkiye, ABD, Almanya, Fransa, İspanya, Çin); dil değişince takvim de değişir.

### Akıllı ev

- Akıllı ev kartı yenilendi: 3 sütunlu cihaz kutuları, simge, durum ve anahtar; klima, perde ve TV de açılıp kapanabiliyor.
- **Düzenle** ayrı bir pencere açar: cihazlar **sürükle-bırak** ile istenen hücreye taşınır, × ile kaldırılır; **+ Ekle** cihaz seçme penceresini (aramalı) açar.

### WhatsApp

- Yazarak veya sesli: **“WhatsApp’tan Ahmet’e yarın geliyorum mesajını at”**. Charles WhatsApp Desktop’ta kişinin sohbetini mesajla açar. Ayarlar → Eklentiler → **WhatsApp**’a kaydedilen kişilere mesaj otomatik gönderilebilir (kapatılabilir); kayıtlı olmayan kişide WhatsApp mesajla açılır, kişiyi kullanıcı seçer. Numaralar yalnızca bu bilgisayarda tutulur. WhatsApp Desktop yoksa WhatsApp Web açılır.

### Düzeltmeler

- Kota uyarısı (“Bağlı başka bir yapay zekâ yok”) adacıktaki model seçiciyi bozup yalnızca “Model” bırakıyordu: bir hesabın oturum yenilemesi hata verince tüm liste boşalıyordu. Artık hata yutulur, eski liste korunur.
- Uygulama penceresinin sol üstündeki × artık her durumda adacığa döner (önceden pencere kapanıp adacık gelmeyebiliyordu).
- Hava durumu şehri seçili olduğu hâlde yeniden sorulabiliyordu: tercihler dosyasındaki tek bir geçersiz alan tüm dosyanın atılmasına yol açıyordu. Alanlar artık tek tek doğrulanıyor.
- Uygulama penceresinde Gemini’nin kalan kullanımı pencere açılınca hemen gösteriliyor (yenile düğmesine gerek yok).
- “Çanlı kedi tasması” etiketi sığmıyordu: artık **Tasma** (İngilizce: Leash).

### Diğer

- Yeni testler: diller ve çeviri tamlığı, tatiller, yan panelin klasör sınırı, takvim düzenleme/silme, WhatsApp komutları ve kişileri, tercihlerin alan alan doğrulanması, model listesi, kopyalama kutuları (toplam 206 test).

## v0.7.1 SpecialBeta — 16 Ekim 2026 (deneme sürümü)

Büyük güncellemenin ilk adımı. Önce yalnızca bu bilgisayarda deneniyor.

### Uygulama penceresi (Çalışma alanı)

- Adacıkta “Paneli açık tut”un yanındaki yeni düğme Charles’ı **normal bir Windows uygulamasına** dönüştürür (Codex ve Claude uygulamaları gibi); adacık kaybolur. Sağ üstteki **Adacığa dön** (veya ×, Alt+F4) adacığı geri getirir. Pencere görev çubuğunda görünür, taşınır, kenarlarından boyutlandırılır, ekranı kaplayabilir; yeri ve boyutu hatırlanır.
- **Sol sütun:** Charles (canlı Slime, sürüm, durum) ve **Sohbetler**: Yeni sohbet, arama, açılır **Klasörler** (klasör içindeki sohbetler ağaç gibi) ve **Son sohbetler**. Sohbetler sürüklenip klasöre bırakılabilir; ⋯ menüsünde adlandır, sabitle, klasöre taşı, sil.
- **Genel bakış:** Spotify (kapak, kontroller, ilerleme), Hatırlatıcılar (ekle, tamamla), Takvim (ay görünümü, etkinlik ve hatırlatıcı noktaları, sıradaki etkinlik), Önemli e-postalar (tıklayınca Charles anlatır), mesaj kutusu, Akıllı ev (Home Assistant ışıkları, sıcaklık, sahneler) ve Kalan kullanım (Codex, Claude, Gemini, Cursor).
- **Sohbet görünümü:** soldan bir sohbete tıklayınca geniş sohbet ekranı açılır: “← Genel bakış”, sohbet adı ve klasör yolu, sohbette arama, ⋯ işlemleri; kullanıcı mesajları sağda, Charles’ın yanıtları avatar, ad ve model rozetiyle; geniş mesaj çubuğu.
- **Ayarlar** bu pencerede soldan menülü, daha geniş ve rahat bir pencerede açılır.
- Sohbet, onaylar ve sesli özellikler adacıktakiyle aynı koddan çalışır; pencere ile adacık arasında geçince hiçbir şey kaybolmaz.

### İkinci tur düzenlemeler

- **Slime stüdyosu:** aksesuar düğmelerindeki emojilerin yerine aksesuarın kendisinin küçük resmi.
- **Mesaj çubuğu (uygulama penceresi):** +, yazı, model seçimi, mikrofon, sesli sohbet ve gönder aynı hizada; yazı ortalı duruyor, uzun mesajda düğmeler son satırda kalıyor.
- **Akıllı ev:** kalemle düzenleme modu: cihaz ekle (arama ile Home Assistant cihaz listesinden), sırala (← →), kaldır; seçim kaydedilir. Işık, priz, fan, kilit ve otomasyon anahtarları, sensör değerleri ve sahneler. Anahtarlar tıklanınca hemen döner, kartlar yeniden çizilmeden güncellenir (kasma giderildi).
- **E-postalar:** “Tümünü gör” bağlı tüm hesaplardaki en yeni 6 e-postayı gösterir (önemli olup olmamasına bakmadan); tıklanınca Charles anlatır. “Önemlilere dön” ile geri gelinir.
- **Kalan kullanım:** adacıktaki gibi halkalar: her yapay zekâ için 5 saatlik (Cursor’da Auto) ve haftalık (Cursor’da aylık) kalan yüzde ve yenilenme süresi.
- **Google Takvim eklentisi:** Ayarlar → Eklentiler’de yeni kart. Google eklentisinin uygulama kaydıyla yalnızca takvim izni ister. Bağlanınca Takvim kartı Google Takvim ile eşitlenir: ayın tüm etkinlikleri görünür, bir güne tıklayınca o günün etkinlikleri listelenir, **+** ile etkinlik eklenir (süre veya tüm gün) ve Google Takvim’e kaydedilir.
- Sol alttaki “Bağlı · Tüm servisler hazır” yazısı kaldırıldı.
- Adacıktaki uygulama penceresi düğmesi pin düğmesine yaklaştırıldı.

### Sohbet geçmişi

- Klasörlerin yanındaki yan ok yerine **klasör simgesi** var; klasörler ve sohbetler bir bakışta ayrılıyor.

### Ek talimat

- GPT çalışmaya başlarken (iş numarası daha gelmemişken) gönderilen ek talimat artık beklenip iletiliyor; reddedilirse bir kez daha deneniyor.
- Mesaj gönderilirken yazılan ikinci mesaj artık kaybolmuyor; sıraya alınıyor ve iş başlayınca GPT’ye ek talimat olarak gidiyor.
- Sıradaki mesajda **Şimdi** düğmesi: çalışan yanıtı durdurup mesajı hemen gönderir (Claude, Gemini ve Cursor’da da araya girmek için).
- İletilemeyen ek talimatlar için açıklayıcı bildirim.

### Diğer

- Kullanıcının kendi içeriği (sohbet ve klasör adları, e-posta konuları, hatırlatıcılar) İngilizce arayüzde çevrilmeye çalışılmıyor.
- Yeni testler: pencere boyutları, ana süreç geçişleri, kenar çubuğu ve kartlar, klasör simgesi, ek talimat bekleme/yeniden deneme, Google Takvim, çeviriler (toplam 190 test).

## v0.7.1 Beta — 16 Ekim 2026

### Ayarlar: AI Modelleri ve yeni Hesap sekmesi

- “Hesap” sekmesinin adı **AI Modelleri** oldu; tanışma ve yardım metinleri de buna göre güncellendi.
- Yeni **Hesap** sekmesi (en sonda): hangi yapay zekâ hesaplarının bağlı olduğu, **Veri klasörünü aç** (`%APPDATA%\Charles`) ve iki sıfırlama düğmesi:
  - **Hesap bağlantılarını kaldır:** eklentiler, Gemini Live anahtarı, Claude/Gemini girişleri ve ChatGPT girişi kaldırılır; sohbetler ve hafıza kalır.
  - **Tüm verileri sıfırla:** sohbetler, hafıza, ayarlar ve tüm bağlantılar.
  - İkisi de önce **“Emin misin?”** diye sorar. Charles yeniden başlar ve eski dosyalar `%APPDATA%\Charles\reset-backup-<zaman>` klasörüne taşınır; hiçbir şey silinmez. Bir iş çalışırken sıfırlama yapılmaz.

### Yapay zekâ hesapları

- Tüm kartlarda düğmeler **aynı sırada**: **Charles ile kur** · giriş (“✓ … bağlı”) · **Bağlantıyı kontrol et**.
- **Charles ile kur** artık ChatGPT, Claude ve Cursor’da da var: Slime girişi adım adım anlatır, girişi başlatır ve sonunda bağlantıyı kontrol eder.
- ChatGPT girişi bağlı değilken yeşil “bağlı” görünebiliyordu; düzeltildi.

### Gemini Live

- Diğer hesaplar gibi **“✓ Gemini Live bağlı”** durumu.
- Panel sadeleşti: Charles ile kur · durum · test; açma anahtarı ve ses seçimi; anahtar ayarları katlanır **Anahtar ayarları** bölümünde. Açma/kapama ve ses değişikliği hemen kaydedilir.

### Eklentiler

- Bağlı Google/Microsoft hesabında giriş düğmesi **“✓ … bağlı”** olur; Home Assistant ve e-posta için de bağlı durumu gösterilir. Test/kaldır düğmeleri yalnızca bağlıyken görünür.
- **Bağlantıyı kaldır**’dan sonra giriş düğmeleri yeniden kullanılabilir.

### Hava durumu konumu

- Şehir seçme paneli yenilendi: arama kutusu, yazarken canlı arama, il/ülke bilgisiyle sonuç satırları, ok tuşlarıyla seçim, “Şu anki konum” ve kaydedince bildirim.

### Slime’ın aksesuarları

- Yeni: **renkli kulaklık**, **korsan göz bandı**, **siyah papyon**, **çanlı kedi tasması** ve Slime’ın jölesine **batmış ok**.
- Yeniden çizildi: **parti şapkası** (simetrik mavi külah, yıldızlar, yıldız patlaması), **yılbaşı şapkası** (kadife külah, kabarık kürk), **bere** (v0.7.0 biçimi, kırmızı, krem nokta şeridi ve etiket), **yuvarlak gözlük** (büyük kahve çerçeve, cam parlaması), **güneş gözlüğü**, **cadı şapkası**, **simetrik tavşan kulakları** ve **atkı**.
- GitHub tanıtım görselleri (`docs/images/banner.png`, `docs/images/screens.png`) yeni tasarımlar ve AI Modelleri sekmesiyle yenilendi.

### Düzeltmeler

- Ayarlar açıkken büyük adacığın altında beliren **gri gölge** kaldırıldı.
- Bazı düğmelerde durum `undefined` olunca sınıf ters çalışıyordu (bağlı görünme, gizli panelin açılması); düzeltildi.
- Yeni aksesuarlar kaydedilirken “Geçersiz aksesuar” hatası verebiliyordu; kayıt listesi güncellendi.
- İngilizce arayüzde “Default model: Otomatik · …” bildiriminde model adı Türkçe kalıyordu; düzeltildi.

### Diğer

- Yeni metinlerin İngilizce çevirileri (`src/settings/i18n-071.ts`).
- Yeni testler: sıfırlama (hesaplar / tümü / komut dosyası), Hesap sekmesi, tüm yapay zekâlar için Charles ile kur, Gemini Live paneli, eklenti bağlı durumu, yeni aksesuarlar, konum seçici, çeviriler (toplam 181 test).

## v0.7.0 Beta — 16 Ekim 2026

### Mail arama

- Bağlı mail hesaplarında **kelimeye, gönderene ve tarihe göre arama**; yazarak veya sesle: *“Maillerimde fatura ara”*, *“Dün gelen mailleri göster”*, *“Geçen hafta Ahmet’ten gelen mailler”*, *“15 Ekim’deki maillerde staj geçen mailleri bul”*, *“Son 3 günde gelen maillerde "proje teslim" ara”*. İngilizce de olur: *“Search my email for invoice last week”*.
- Anlaşılan tarihler: bugün, dün, bu/geçen hafta, bu/geçen ay, son N gün/hafta/ay, N gün önce, “15 Ekim”, “15.10.2026”, “Ekim ayında”, “10 Ekim’den beri”.
- Bulunanlar konu, gönderen, tarih ve kısa önizlemeyle listelenir. Sonuna *özetle* eklersen mailler okunur ve seçili yapay zekâ özetler. Gmail ve Outlook aramayı sunucuda yapar; IMAP gelen kutusunda sunucuda arar; POP3’te arama olmadığı için en yeni 100 mail taranır.
- Gemini Live sesli görüşmede de çalışır.

### İş sürerken ek talimat

- Yapay zekâ çalışırken yazmaya devam edebilirsin: **Ctrl + Enter** (veya Enter) ile ek talimat gönder. Claude’daki gibi.
- **GPT (Codex)** talimatı o an çalışan işin içinde alır (Codex `turn/steer`). Mesaj sohbette “Ek talimat” etiketiyle görünür.
- **Claude, Gemini ve Cursor** yanıtı tek seferde verdiği için mesaj, kutunun üstünde **Sırada** satırında bekler ve yanıt biter bitmez gönderilir. Tıklayınca düzenlemek için kutuya geri gelir, × ile sıradan çıkar. Durdurursan sıradaki mesaj kutuya geri konur.

### Yapay zekânın soruları

- Soru kartı yenilendi: **sorular tek tek** gelir (üstte adım çizgileri), seçenekler numaralı satırlar halindedir, en altta “Başka bir şey yaz…” alanı vardır. Tek seçimli soruda seçince bir sonrakine geçilir; sonuncuda yanıtlar gönderilir. 1–4 tuşlarıyla da seçilebilir; yanıtlandıktan sonra kart kısa bir özete döner.
- Claude neredeyse her mesajda (tek harf yazınca bile) soru soruyordu. Tüm yapay zekâlara verilen kural sıkılaştırıldı: varsayılan, makul bir varsayımla doğrudan yanıt vermek; selamlaşma, sohbet, bilgi soruları, kısa/anlamsız mesajlarda soru kartı kullanılmaz.
- İş sürerken bir soruyu yanıtlarsan yanıt ek talimat olarak gider.

### Cursor

- **Cursor modeli yanıt vermiyordu:** Cursor Agent yazdırma modunda “Workspace Trust Required” uyarısında durup kapanıyordu. Charles artık yalnızca kendi çalışma klasörüne (veya senin seçtiğin proje klasörüne) güven bilgisini veriyor (`--trust`). İzin atlatan `--force`/`--yolo` kullanılmıyor.
- **Kalan kullanım:** adacıkta Cursor kotası artık görünüyor: bu fatura dönemindeki **Auto** ve **Aylık** paydan kalan yüzde ve sıfırlanma süresi. Bilgi, Cursor’un kendi kullanım servisinden Cursor oturumunla okunur; hiçbir şey yazılmaz.
- Cursor’un adacık rengi **turkuaz** oldu.

### Ayarlar

- **Hesap:** Claude, Gemini ve Cursor da GPT gibi bağlıyken “✓ … bağlı” durumuna geçiyor (giriş düğmesi pasif). GPT kartına **Bağlantıyı kontrol et** eklendi; Codex bağlantı düğmesi yalnızca bağlantı yokken görünüyor. Cursor kartının altındaki **boş baloncuk** kaldırıldı.
- **Genel:** “Dil / Language” yazısı yerine **dünya simgesi**; seçim kutusuyla arasında boşluk var. Hava durumu kartına başlık eklendi; süre kutuları kendi satırında.
- **Düğmeler:** ayarların her yerinde yan yana duran düğmeler artık boşluklu ve dar ekranda alt satıra geçiyor (Hey Charles eğitimi, Gemini Live, eklentiler…).
- **Kartlar:** tüm ayar kartları aynı arka plan, kenar, başlık ve boşluk düzeninde.
- **Görünüm:** **Saydamlık** ayarı kaldırıldı; Charles her zaman tam görünür.
- **Hafıza:** “ChatGPT’den beni tanı” yerine **Kullandığım AI ile beni tanı**. Ayrı, düzenli bir kart: ChatGPT, Claude veya Gemini’yi seç → soru paketi kopyalanır ve o yapay zekâ tarayıcıda açılır → yanıtı yapıştır → kaydedilecekleri seç. Kayıtlı bilgiler kendi başlığı altında, kart kart listeleniyor.
- **Eklentiler:** Vercel, Stripe, Resend, Notion, Cal.com ve n8n kaldırıldı. **GitHub bağlantısı** “İleriki sürümlerde gelecek” olarak duruyor, şimdilik kullanılamaz.

### Tanışma

- Yapay zekâ adımı artık ChatGPT odaklı değil: **ChatGPT, Claude, Gemini ve Cursor** seçenek düğmeleri var. Seçtiğinin girişi başlatılır ve Charles o modelle açılacak şekilde ayarlanır.

### Diğer

- Yeni metinlerin İngilizce çevirileri eklendi (`src/settings/i18n-070.ts`).
- Yeni testler: mail arama (Türkçe/İngilizce tarih ve kelime), Gmail/Outlook sorguları, sesli arama, ek talimat (turn/steer), Cursor güven bayrağı ve kota, soru kartı kuralı, ayar değişiklikleri (toplam 171 test).

## v0.6.5 Beta — 15 Ekim 2026

### Yapay zekânın soruları

- GPT (Codex), Claude, Gemini ve Cursor işe devam etmeden önce bir karar veya eksik bilgi gerektiğinde artık soruyu **düğmeli bir kart** olarak soruyor. Seçeneğe tıkla ya da kendi yanıtını yazıp **Yanıtla**’ya bas; yanıt bir sonraki mesajın olarak gönderilir. Tek soru ve tek seçenekte yanıt hemen gider; çoklu seçim de destekleniyor.
- Soru gelince Slime “Yanıtını bekliyorum” der ve kısa bir ses çalar. Eski mesajlardaki sorular kapalı görünür; yeni mesaj gönderince açık kartlar kapanır.
- Soru bloğu sohbet metninde görünmez ve sesli okumada okunmaz. Codex’in kendi soru kartları eskisi gibi çalışıyor.

### Tarayıcı komutları

- Yazarak veya sesle: *“İnternetten … arat”*, *“Google’da … ara”*, *“YouTube’dan … videosunu aç”*, *“YouTube’da … ara”*, *“github.com sitesini aç”*. İngilizce: *“search the web for …”*, *“play … on YouTube”*, *“open github.com”*.
- Varsayılan tarayıcın açılır. YouTube’da ilk eşleşen video doğrudan açılır; bulunamazsa sonuç sayfası açılır. Bu komutlar yapay zekâya gönderilmez.
- Gemini Live sesli görüşmede de çalışıyor (“YouTube’dan lofi müzik aç” de yeter).

### Gemini Live

- **Daha hızlı algılama:** konuşmanın başı ve sonu daha hassas algılanıyor (sessizlik eşiği 450 ms), mikrofon sesi 4 kat daha küçük parçalarla (yaklaşık 64 ms) gönderiliyor ve araya giren parçalar artık atılmıyor. Söylediklerinin geç algılanması büyük ölçüde azaldı.
- **Ses seviyesi göstergesi:** “Sesli görüşme açık” etiketi sağa alındı ve yanında sesinin gittiğini gösteren canlı bir seviye çubuğu var.
- **Charles ile kur:** Ayarlar → Hesap → Gemini Live’da yeni düğme. Slime, Google AI Studio’da ücretsiz API anahtarının nasıl oluşturulacağını adım adım anlatıyor; anahtarı yapıştırınca kaydedip bağlantıyı test ediyor.

### Gemini hesabı · Charles ile kur

- Ayarlar → Hesap → Gemini hesabında **Charles ile kur** düğmesi. Antigravity giriş penceresini açıyor ve ne seçmen gerektiğini (Google ile giriş, tarayıcıda hesap seçimi) adım adım anlatıyor; sonunda bağlantıyı kontrol ediyor.

### Mikrofon gizliliği

- Panelin sağ üstünde, hoparlörün solunda yeni **mikrofon düğmesi**. Kapatınca (kırmızı, üstü çizili) Hey Charles, dikte, sesli görüşme ve uyandırma eğitimi mikrofonu hiç açamaz; açık olan dinlemeler hemen kapanır. Tercih hatırlanır.
- Engel yalnızca arayüzde değil, ana süreçte de var: mikrofon izni kapalıyken Windows mikrofonuna erişim isteği reddedilir.

### Diğer

- Yeni metinlerin İngilizce çevirileri eklendi.
- Yeni testler: soru kartı ayrıştırma, tarayıcı komutları, Gemini Live ayarları, mikrofon düğmesi ve kurulum rehberleri (toplam 162 test).

## v0.6.4 Beta — 15 Ekim 2026

### GitHub’a hazır

- Dosya adları İngilizce ve GitHub’a uygun hâle getirildi:

  | Eski | Yeni |
  | --- | --- |
  | `CHARLES-BASLAT.cmd` | `Start-Charles.cmd` |
  | `KURULUM.cmd` | `Install.cmd` |
  | `TEMIZ-KURULUM.cmd` | `Reset-Charles.cmd` |
  | `MASAUSTU-KISAYOLU.vbs` | `Create-Desktop-Shortcut.vbs` |
  | `YAMA-NOTLARI.md` | `CHANGELOG.md` |
  | `README-FOR-DEV.md` | `DEVELOPMENT.md` |
  | `DOGRULAMA.md` | `docs/VERIFICATION-v0.4.4.md` |
  | `docs/KULLANIM-REHBERI.md` | `docs/USER-GUIDE.md` |
  | `docs/CHATGPT-TANISMA-SORULARI.md` | `docs/CHATGPT-INTRO-QUESTIONS.md` |
  | `scripts/kurulum.ps1` | `scripts/install.ps1` |
  | `scripts/paketle.py` | `scripts/package.py` |
  | `scripts/sesler.py` | `scripts/generate-sounds.py` |

  Eski masaüstü kısayolları eski klasörü açar; yeni klasörde **Create-Desktop-Shortcut.vbs**’i bir kez çalıştır.
- Yeni **`.gitignore`**: `node_modules/`, `dist/`, `models/`, `tools/`, paketler, günlükler ve kişisel dosyalar (`Charles-creator.json`, `.env`, şifreli anahtar dosyaları…) GitHub’a gitmiyor. **`.gitattributes`** Windows betiklerinin satır sonlarını koruyor.
- Kişisel veri kontrolü: API anahtarları, hesap bağlantıları, sohbetler, hafıza ve ayarların tamamı `%APPDATA%\Charles` içinde (anahtarlar Windows ile şifreli); uygulama klasörüne kişisel bilgi yazılmıyor. Testlerdeki gerçek ad ve okul adresi örnek değerlerle değiştirildi. Kurulum paketi hazırlanırken `Charles-creator.json` ve `_to_delete/` artık pakete girmiyor.
- **docs/PLUGINS-SETUP.md** eski sürüm başlıklarından arındırıldı, İngilizce ve düzenli bir eklenti kurulum rehberi oldu.
- **docs/ARCHITECTURE.md** güncel mimariyle İngilizce yeniden yazıldı. Eski doğrulama notu (**docs/VERIFICATION-v0.4.4.md**) yalnızca yerel kopyada duruyor.
- **docs/USER-GUIDE.md** baştan, güncel ve İngilizce yazıldı (eski sürüm notları yerine: sohbet, proje modu, ses, Slime, ayarlar, kısayollar, sorun giderme).
- README’ye İngilizce kısa tanıtım ve “Kaynak koddan çalıştırma” bölümü eklendi; adım adım GitHub’a yükleme rehberi (**docs/GITHUB.md**) yalnızca yerel kurulumda durur, GitHub deposuna eklenmez.
- `package.json`: ad `project-charles`, yazar ve lisans bilgisi; yeni `npm run setup:voice` komutu. Veri klasörü değişmedi (`%APPDATA%\Charles`).
- **Start-Charles.cmd**, arayüz derlenmemişse ne yapılacağını söylüyor.
- Belgelerdeki belirli bir okula ait sunucu adresleri ve bağlantılar kaldırıldı; okul e-postası rehberi artık her okul için genel (sunucu, protokol, port). Sohbette “okul maillerim” ifadesi aynı şekilde çalışıyor.

### Hata testi ve düzeltmeler

- Kapsamlı test: 155 otomatik test, bütün betiklerin sözdizimi denetimi, TypeScript tür denetimi, ana sürecin sahte Electron ile açılıp 110 arayüz isteğinin tek tek çağrılması ve arayüzün Türkçe/İngilizce iki dilde senaryo testi (masaüstü Slime, fırlatma, ayarların her sekmesi, Slime stüdyosundaki her aksesuar ve renk, her mimik, sohbet).
- **Düzeltildi:** v0.6.3’te güneş gözlüklerinin ifade sırasında alna kayması bozulmuştu (gözlük yerinde kalıyordu); yeniden çalışıyor.
- Kısayol çakışması uyarısı İngilizcede de çevriliyor.

### README, lisans ve setup klasörü

- **README** baştan İngilizce yazıldı; tanıtım görseli, masaüstü sahnesi, uygulama ekran görüntüleri ve mimik tablosu `docs/images/` içinde.
- Charles’ın tasarımının, [Sam Green’in YouTube kanalındaki](https://www.youtube.com/@SamGreen) *Epic Minequest* serisindeki Charles’tan esinlendiği README, LICENSE, LICENSE-ASSETS.md, THIRD-PARTY-NOTICES.md ve DEVELOPMENT.md’de belirtildi.
- **LICENSE** ve **LICENSE-ASSETS.md** İngilizce (haklar aynı: kişisel kullanım serbest; dağıtım, değiştirilmiş sürüm ve ticari kullanım için HzPederPan’ın yazılı izni gerekir).
- Kurulum dosyaları **`setup/`** klasöründe: `Install.cmd`, `install.ps1`, `Create-Desktop-Shortcut.vbs`, `Reset-Charles.cmd`. Charles’ı başlatmak için ana klasördeki **Start-Charles.cmd** kullanılmaya devam ediyor. `setup\Install.cmd` hem kurulum paketinin içinden (Charles.zip ile) hem de tam bir Charles klasörünün içinden çalışıyor.
- İngilizce arayüzde mesaj kutusundaki ipucu yazısı (“Ask Charles…”) da çevriliyor.

### Görünüm

- Adacıktaki **“Charles”** yazısı Slime’a daha az yakın: yazı biraz aşağı alındı (küçük adacıkta da).

## v0.6.3 Beta — 14 Ekim 2026

### Özel günlerde Türk bayrağı 🇹🇷

- **19 Mayıs, 30 Ağustos, 29 Ekim ve 10 Kasım**’da Slime’ın elinde dalgalanan bir **Türk bayrağı** oluyor. Aksesuarlardan seçilmesine gerek yok; bu günlerde kendiliğinden geliyor, gün bitince kalkıyor.
- Yalnızca Charles’ın dili **Türkçe** iken geliyor.
- Bayrak diğer bütün aksesuarlarla (şapka, gözlük, muz, atkı, balkabağı) birlikte duruyor ve **şapkanın önünde** çiziliyor; Slime’ın rengindeki patisiyle tutuyor.

### Mimik düzeltmeleri

- **Fikir ampulü** artık şapkanın arkasında kalmıyor: şapka takılıyken şapkanın yanında, onun önünde beliriyor (şapka yokken eskisi gibi başın üstünde).
- **Terleme** (ör. Limit doldu): ter damlaları artık başın üstünden uçmuyor; Slime’ın iki yanında beliriyor ve aşağı süzülüyor.

### İngilizce dil düzeltmeleri

- Dil English seçildiğinde Türkçe kalan paneller çevrildi; özellikle Ayarlar:
  - Genel (tanışma, ses, ekran), Hesap (varsayılan model, Gemini ses tonları), Görünüm (mimikler, Slime stüdyosu, renk adları), Hafıza, Bağlantılar (kurulum açıklamaları ve rehber adımları), Haftalık özet.
- Adacık, oturumlar, müzik denetimleri, kota göstergeleri, hava durumu, “Charles’ı kişiselleştir” penceresi ve bildirim mesajları da İngilizce.
- İlk açılış tanışması İngilizce seçiliyse baştan İngilizce yazılıyor.
- Sayı veya ad içeren metinler (ör. “5 saatlik Codex kalan kullanım: %72”, “2sa 0dk”) de artık çevriliyor; HTML’deki satır kırılımları çeviriyi engellemiyor. Düğme ipuçları (title) da çevriliyor.

## v0.6.2 Beta — 14 Ekim 2026

### Masaüstündeki Slime: jöle fiziği

- Adacıktan sürükleyip masaüstüne çıkardığın Slime, Slime stüdyosundaki önizlemeyle aynı boyutta (160 px); adacıktakinden biraz büyük.
- **Fırlatma:** Hızlıca sürükleyip bırakınca Slime ekranda uçuyor, yavaşlıyor ve ekranın kenarlarından **sekiyor**. Çarptığı yerde sertçe ezilmeden, yumuşak bir jöle titremesiyle geri sekiyor; kenara yapışmıyor.
- **Bırakma:** Yavaşça bırakınca yassılıyor ve küçük bir **zıplama** yapıyor.
- **Dürtme:** İmleçle hızlıca üstüne gidince **titriyor**.
- **Tıklama:** Tıklayınca önce basılıp yassılıyor, sonra titreyerek toparlanıyor (adacıkta da).
- Çarpma ve bırakma için yumuşak sesler çalıyor; Slime’ın vücudu artık ekran kenarına kadar gidebiliyor.

### Yeni aksesuarlar

- **Göz → Büyük güneş gözlüğü:** kocaman, koyu pilot gözlüğü; camlarda şimşek gibi parlamalar.
- Güneş gözlüğü veya büyük güneş gözlüğü takılıyken Slime bir ifade yaptığında (gülümseme, göz kırpma, baş dönmesi, şaşırma, kalp gözler…) gözlük **alnına kayıyor**, gözler görünüyor; ifade bitince yerine iniyor.
- **Diğer → Muz:** başın yanına saplanmış, alt yarısı jölenin içine gömülü bir muz; ucu kafanın üstünden çıkıyor. Hep kafanın sağ tarafında duruyor. Şapka ve gözlüklerle birlikte takılabiliyor.

### Düzeltmeler

- Slime masaüstündeyken fırlatıldığında bazen çıkan **“A JavaScript error occurred in the main process … PetPhysics.move”** hatası giderildi. Ekranın sol/üst kenarına çok yakın konumlar Windows’a geçersiz bir sayı olarak gidiyordu.

### Fare takibi ve yüz ifadeleri

- Slime fareyi takip etmeye devam ediyor, ama **aşağı bakma sınırlı**. Fare çok aşağıdayken gözler ağza ve bıyığa kayıyordu; yukarı bakma da makul bir sınırda.
- Ağız, bıyık ve yanaklar artık gözlerle **birlikte** kayıyor, yüz düzeni her bakış açısında aynı kalıyor.
- **Mutlu** ve **göz kırpma** ifadesindeki yarım daire gözler küçültüldü ve inceltildi.
- Bıyıklıyken açık ağızlar (gülüş, “o”, asık surat) bıyığın hemen altında görünüyor; önceden bıyığın arkasında kalıyordu.
- **Fötr şapka** biraz daha yukarıda. Aşağı bakarken öne devrilip kafanın içine girmiyor; kenarlarından yeşil görünmüyor.

### İlk açılış tanışması

- Charles ilk kez kurulduğunda Slime kendini tanıtıyor ve ilk adımları sırayla yürütüyor:
  1. Merhaba ve tanışma
  2. Yapay zekâ bağlama (ChatGPT ile giriş; diğerleri Ayarlar → Hesap’tan)
  3. Renk seçimi ve bıyık
  4. “Hey Charles” sesli uyandırmayı açma
  5. Kısa ipuçları
- Her adım geçilebiliyor, tamamı “Tanışmayı atla” ile kapatılabiliyor. Slime yazıları harf harf “söylüyor” ve her adımda farklı bir ifade yapıyor.
- Güncelleme olarak kurulduğunda (sohbet geçmişi veya ayarlar varsa) tanışma çıkmıyor.
- **Ayarlar → Genel → Tanışma → Tanışmayı yeniden başlat** ile istediğin zaman tekrar izlenebiliyor.

## v0.6.1 Beta — 14 Ekim 2026

### Slime stüdyosu: kategoriler

- Aksesuarlar dört kategoriye ayrıldı: **Şapka**, **Göz**, **Yüz** ve **Diğer**. Üstteki sekmelerden birine geçiliyor; her sekmenin altında o an seçili olan küçük bir yazıyla görünüyor.
  - **Şapka:** Mevsime göre, Fötr şapka, Taç, Parti şapkası, Bere, Cadı şapkası, Yılbaşı şapkası, Tavşan kulakları, Fiyonk
  - **Göz:** Güneş gözlüğü, Yuvarlak gözlük, **Tek gözlük** (yeni)
  - **Yüz:** Bıyıksız / Bıyıklı
  - **Diğer:** Balkabağı, Atkı
- Her kategoriden bir tane seçiliyor ve farklı kategorilerdekiler **birlikte takılabiliyor** (ör. Fötr şapka + Tek gözlük + Bıyık + Atkı).
- Çakışan tek ikili balkabağı ve şapka: balkabağı bütün kafayı kapladığı için şapkayla takılamıyor. Biri seçilince diğeri çıkarılıyor ve altta kısa bir uyarı görünüyor.
- **Hepsini çıkar** düğmesi bütün aksesuarları ve bıyığı tek seferde kaldırıyor; Kaydet’e kadar sadece önizlemede.
- Stüdyo tek sütunda, ayarlar paneline sığıyor: en üstte geniş önizleme, altında tek satırda renkler, kategori sekmeleri, iki sütunlu seçenekler; en altta Kaydet, Hepsini çıkar ve durum yazısı.
- “Mevsime göre” seçiliyken mevsimin aksesuarı kendi kategorisine yerleşiyor. Yaz güneş gözlüğü, Göz kategorisi boşsa takılıyor; bir gözlük seçtiysen o kalıyor.
- Önceki sürümlerde takılı olan gözlük, atkı veya balkabağı ilk açılışta kendi kategorisine taşınıyor.

### Yeni aksesuar: Tek gözlük

- Altın çerçeveli tek cam, Slime’ın sağ gözünde. Çerçevesinden yanağa doğru boncuklu bir zincir sarkıyor.
- Şapka, bıyık ve atkıyla birlikte takılabiliyor; her renkte aynı altın renginde.

## v0.6.0 Beta — 14 Ekim 2026

Charles’ın yeni karakteri **Slime** artık ana sürümde. Kod ve tasarım hakları HzPederPan’a aittir.

### Slime

- Charles’ın karakteri baştan çizildi: parlak, renkli bir jöle küp. Koyu renkli kontur, sol üstte parlama, içinde kabarcıklar, parlak gözler, hep pembe yanaklar ve altta yumuşak gölge var. Hafifçe “nefes alıyor”.
- **7 renk:** Yeşil, Turkuaz, Mavi, Mor, Mercan, Sarı, Beyaz.
- **Bıyıklı / Bıyıksız** seçeneği.
- Slime’ın kendi ağzı var ve ifadeye göre değişiyor: normalde küçük gülümseme, mutlu/gururlu/aşıkken açık gülüş, şaşırınca, beklerken veya uyurken küçük “o”, hata ve huysuzlukta asık surat, başı dönünce dalgalı.
- Bütün mimikler, durumlar ve animasyonlar Slime’a uyarlandı: dans, selam, tokat, yuvarlanma, posta kutusuna dönüşme, terleme, kota bitti, uyku. İş animasyonları da uyarlandı: büyüteç, laptop, kâğıt okuma, klavye, çizim, ampul.
  - İş animasyonlarındaki patiler Slime’ın renginde.
  - Bıyık iş eşyalarının arkasında kalıyor.
  - Fikir ampulü kafanın üstünde çıkıyor.

### Slime stüdyosu (Ayarlar → Görünüm)

- Aksesuar paneli yenilendi: renk kutucukları, Bıyıksız/Bıyıklı düğmesi ve aksesuar listesi.
  - Seçimler önce yandaki önizlemede deneniyor, **Kaydet** ile Charles’a uygulanıyor.
  - Kaydedilen renk yeşil bir noktayla işaretli.
- **Yeni aksesuar: Fötr şapka.** Kırmızı bantlı küçük, uzun şapka; kafanın tam üstüne oturuyor.
- Bütün aksesuarlar Slime’ın kafasına göre ayarlandı:
  - Taç ve Yılbaşı şapkası Slime’a göre yeniden boyutlandırıldı.
  - Gözlükler Slime’ın gözlerinin üstüne oturuyor.
  - Balkabağı her renkte aynı turuncu.
- Düzeltme: Kaydet’e basınca aksesuar eskisinde (ör. taçta) kalıyordu. Artık seçilen aksesuar kaydediliyor.
- Design Test sürümünde seçtiğin renk, bıyık ve aksesuar ilk açılışta bu sürüme otomatik aktarılıyor.

### Ad, simge, sesler ve lisans

- Uygulamanın her yerinde, kodda ve belgelerde karakterin adı **Slime**.
- **Yeni uygulama simgesi:** Slime, **seçtiğin renkte**. Slime stüdyosunda renk değişince sistem tepsisi, görev çubuğu ve kısayol simgesi de o renge dönüyor; kısayollardaki simgenin güncellenmesi Windows’un simge önbelleği yüzünden biraz gecikebilir.
- **Yeni arayüz sesleri:** 28 sesin hepsi Charles için yeniden üretildi. Yumuşak, jöle gibi “bloop” sesleri; `scripts/generate-sounds.py` ile oluşturuluyor.
- **Sesler açılıyor:** Yeni seslerin duyulabilmesi için bu sürüme ilk geçişte sesler bir kez açılıyor (ses düzeyi çok düşükse varsayılana getiriliyor); sonrasında anahtar yine senin seçimin.
  - Paneldeki ses düğmesi artık bir hoparlör simgesi; kapalıyken üstü çizili ve kırmızı. Eskiden “♪” olduğu için Spotify düğmesiyle karışıyor ve sesler farkında olmadan kapatılabiliyordu.
  - Sesleri açınca ve ses düzeyini değiştirince kısa bir deneme sesi çalıyor.
- **Lisans:** Charles’ın kodu ve tasarımı, Slime karakteri, simge ve sesler HzPederPan’a ait (**LICENSE**, **LICENSE-ASSETS.md**).
  - Üçüncü taraf bileşenler **THIRD-PARTY-NOTICES.md**’de listeleniyor.
  - Karakter motorunun bazı animasyon kodları MIT lisanslı bir kaynaktan türüyor. Bu bölümler için MIT Lisansı metni **LICENSE** dosyasına eklendi; ayrıca `licenses/engine-MIT-LICENSE.txt` dosyasında da duruyor.
- Eski özellik karşılaştırma belgesi kaldırıldı.

## v0.5.5 Beta — 14 Ekim 2026

### Hafif akrilik tema

- Panel artık buzlu cam görünümünde: hafif renk tonlu zemin, üst köşede sıcak, alt köşede serin yumuşak ışık ve ince bir doku.
- Yazma kutusu, mesaj balonları, model ve mod seçicileri, ayar kartları, menüler ve Sohbet geçmişi yarı saydam cam yüzeylere dönüştü; arkalarındaki içerik bulanık görünüyor.
- Ayarlardaki siyah giriş kutuları (sayılar, seçim listeleri, metin alanları) cam görünümüne geçti; odaklanınca hafifçe aydınlanıyor.
- “Sesler” anahtarıyla ses düzeyi çubuğu aynı satıra hizalandı.
- Masaüstünün kendisi bulanıklaşmıyor (bu, Windows’un pencere malzemesini gerektirir); pencerenin genel saydamlığı yine Ayarlar → Görünüm → Saydamlık’tan ayarlanıyor.

### Görsel oluşturma

- “Görsel oluşturuluyor” kartı yenilendi: hareketli renkli tuval, yüzde halkası, ilerleme çubuğu, geçen süre ve aşama yazısı (Taslak çiziliyor… → Renkler ekleniyor… → Son rötuşlar…).
  - Görsel aracı gerçek ilerleme bildirmediği için yüzde bir tahmindir: bu bilgisayarda son görsellerin ne kadar sürdüğüne göre hesaplanır ve görsel gelmeden %95’i geçmez.
- Görsel bulanıktan netleşerek açılıyor. Alttaki “Görseli kaydet” bağlantısının yerine düğmeler geldi:
  - **İndir:** Kayıt penceresi açılır (varsayılan Resimler klasörü).
  - **Kopyala:** Görseli panoya kopyalar; doğrudan bir sohbete veya belgeye yapıştırabilirsin.
  - **Büyüt:** Görseli tam boy gösterir (görsele tıklamak da aynı işi yapar; Esc ile kapanır).

## v0.5.4 Beta — 14 Ekim 2026

### Hata düzeltmeleri

- **Gizli mail verisi sohbet geçmişinde görünüyordu.** “Maillerimi kontrol eder misin” gibi isteklerde Charles okuduğu mailleri yapay zekâya göndermek için mesajın sonuna ekliyor. Bu ek, sohbet geçmişine ve sohbet adına da kullanıcının mesajıymış gibi kaydediliyordu. Artık geçmişte yalnızca senin yazdığın görünüyor; mail verisi sadece yapay zekâya gidiyor. Eski sohbetlerdeki bu ekler açılışta temizleniyor.
- **Takvim sorusuna verilen cevap anlaşılmıyordu.** Charles’ın e-postadaki tarih için sorduğu “Takvime ekleyeyim mi?” sorusu yapay zekânın konuşmasına hiç girmiyordu; “hayır” yazınca neye hayır dendiği bilinmiyordu. Ayrıca sorunun düğmeleri bir an sonra kayboluyordu.
  - Düğmeler (Takvime ekle + hatırlat · Sadece hatırlat · Gerek yok) artık kalıcı.
  - “evet”, “hayır”, “gerek yok”, “sadece hatırlat”, “hatırlatma kurma” gibi kısa cevaplar doğrudan soruya cevap sayılıyor; Charles işi kendisi yapıyor.
  - Soru ve cevap sohbet geçmişine kaydediliyor; daha uzun bir şey yazarsan yapay zekâ soruyu bilerek yanıtlıyor. Kota uyarısındaki model değiştirme sorusu da aynı şekilde çalışıyor.

## v0.5.3 Beta — 14 Ekim 2026

### Takvim: e-postadaki tarihler

- Önemli bir e-postada son tarih, sınav, toplantı, randevu veya ödeme günü varsa Charles tarihi yakalıyor (“yarın”, “cuma” gibi göreli tarihler de çözülüyor).
- Slime soru işareti yüzüyle bakıyor ve Charles sohbete kendisi yazıyor: “Takvime ekleyip son günden önce hatırlatayım mı?” Panel küçükken soru adacığın altında baloncukla da çıkıyor; tıklayınca panel açılıyor.
- **Takvime ekle + hatırlat:** Son günden önce iki hatırlatma kuruluyor (tüm gün süren tarihlerde bir önceki gün 10:00 ve o gün 09:00; saatli olanlarda 24 saat ve 2 saat önce). Ayrıca etkinlik dosyası (.ics) açılıyor; Windows Takvim veya Outlook’ta **Kaydet** demek yeterli. **Sadece hatırlat** yalnızca Charles hatırlatmalarını kuruyor.
- Tüm hatırlatmalar (sohbetten kurulanlar ve odak sayacı dahil) artık Windows bildirimi yerine adacığın altında baloncukla geliyor.

### Sistem nöbetçisi

- İşlemci iki ölçüm üst üste %85’in, bellek %90’ın üzerine çıkarsa ya da C: diskinde %5’ten (veya 3 GB’tan) az yer kalırsa Slime terliyor.
- Charles hangi uygulamanın en çok kaynak kullandığını söylüyor (“İşlemci %93 dolu — en çok blender kullanıyor”). Aynı uyarı en fazla 20 dakikada bir geliyor. Uyarılar `logs/watchdog.log` dosyasına yazılıyor.
- Nöbetçi, Ayarlar → Performans → **Uygulama kullanımını kaydet** açıkken çalışıyor (varsayılan olarak açık).

### Kota bekçisi

- Seçili yapay zekânın 5 saatlik veya haftalık kullanım hakkı %10’un altına düşünce Slime soru işareti yüzü yapıyor ve Charles sohbette bağlı diğer yapay zekâlara geçmeyi öneriyor (ör. “Gemini · Pro modeline geç”). Düğmeye basınca model değişiyor. Her pencere için bir kez soruluyor, kota yenilenince tekrar.

### Claude, Gemini ve Cursor’a araçlar

- **Proje** modunda Claude, Gemini ve Cursor artık seçilen proje klasöründe çalışıyor: dosyaları okuyup arayabiliyor, web’de araştırabiliyor ve erişim ayarına göre dosya düzenleyebiliyor.
  - **Onay iste:** yalnızca okuma ve plan.
  - **Benim için onayla / Tam erişim:** dosya düzenleme açık.
- Komut çalıştırma (terminal) bu üç sağlayıcıda kapalı; bu araçların izin kontrollerini atlayan modları güvenlik nedeniyle kullanılmıyor. Komut gereken işler için GPT (Codex) modellerini kullan.
- Claude’un yaptığı işler (dosya okuma, düzenleme, web araması) Slime’ın iş animasyonlarında ve etkinlik listesinde görünüyor. Sohbet modu eskisi gibi araçsız.

### Kurulum

- **KURULUM.cmd:** Charles’ı başka bir bilgisayara kurar. Windows’u kontrol eder, Charles’ı `C:\ProjectCharles v0.5.3 Beta` klasörüne kopyalar, dosyaların “başka bilgisayardan geldi” işaretini kaldırır, masaüstü ve Başlat menüsü kısayolu oluşturur. Yönetici izni gerekmez.

## v0.5.2 Beta — 14 Ekim 2026

v0.5.1 olarak hazırlanan değişiklikler bu sürümde toplandı.

### Slime ve tepkiler

- **Mimikleri dene** listesine iş başındaki animasyonlar eklendi: Büyüteçle araştırma, Bilgisayarda kod yazma, Belge okuma, Komut çalıştırma, Çizim yapma ve Fikir bulma (ampul).
- Charles daha çok tepki veriyor: mesajlarındaki çok daha fazla ifadeyi tanıyor (“süper”, “bayıldım”, “geçtim”, “yoruldum”, “of ya”, emojiler…); kendi yanıtının tonuna göre (tebrik, üzgünüm, şaşırma) mimik seçiyor; panel açıkken boşta ara ara göz kırpma, gülümseme gibi küçük canlılık hareketleri yapıyor.

### Varsayılan model ve görünüm

- **Ayarlar → Hesap → Varsayılan model:** Charles açıldığında ve her yeni sohbette seçili gelecek modeli belirler (ör. Claude · Sonnet). “Son kullandığım model” seçilirse eski davranış sürer. Sohbet içinde model değiştirmek bu ayarı değiştirmez.
- Görünüm ayarlarından renk seçenekleri (Renkler bölümü ve Vurgu) kaldırıldı.
- Saydamlık artık %30–100 arasında, birer birer ayarlanabiliyor (önceden %80–100, beşer).


### Gemini Live sesli görüşme

- Görev verince (ör. “tavan lambasını kapat”) Gemini’nin işi yapıp sessiz kalması giderildi. Araç sonucundan sonra kısa sürede konuşmazsa Charles ona sonucu tek cümleyle söylemesini hatırlatıyor.
- Araç çağrısı yapan konuşmalar sohbet geçmişine aktarılıyor. Önceden senin cümlen aracın çağrıldığı turda silindiği için yanıtla eşleşmiyor ve kayıt düşmüyordu.

### Ayarlar

- “Ana yapay zekâ sistemi” seçimi kaldırıldı. Sohbette seçilen model belirleyici: kota paneli onu izliyor, e-posta değerlendirme ve sohbet klasörleme gibi arka plan işleri de son seçilen sağlayıcıyı kullanıyor.
- **Slime aksesuarları:** Yanda önizleme Slime’ı, simgeli seçim kartları ve kaydırma çubuğu. Seçilen aksesuar önce önizlemede deneniyor, **Kaydet** ile Charles’a giydiriliyor.
- **Mimikleri dene:** Ayrı bir önizleme Slime’ında çalışıyor; ana karakteri değiştirmiyor. Mimikler gruplu kartlarla seçiliyor. Başlıktaki üçgen işareti kaldırıldı.
- **Görünüm:** Yazı, panel, karakter ve saydamlık ayarları sütuna sığıyor. Renk seçici ayrı bir satırda; değişiklikler kaydırırken anında uygulanıyor, ayrı “Uygula” düğmesi kalktı.
- **Panel davranışı ve sesler:** Sesler anahtarı ve diğer ayarlar değiştirildiği anda uygulanıyor. Önceden ancak “Ayarları kaydet”e basınca etkili oldukları için işlevsiz görünüyorlardı. Üstteki ♪ düğmesi ile anahtar birbirini izliyor.
- **Kısayollar:** Satırlar sayfaya sığıyor; “CommandOrControl” yerine “Ctrl” gösteriliyor.
- **Haftalık özet:** Sürekli değişen “Proje” alanı kaldırıldı.
- **POP3 / IMAP:** Kart başlığı sadeleşti, açıklama POP3/IMAP destekleyen her e-posta için yazıldı. Belirli bir okula ait hazır ayar düğmesi kaldırıldı.

### Görünüm

- Sohbet ekranındaki “ChatGPT · plus” rozeti kaldırıldı.
- Spotify çalarken küçük adacıktaki sağ sütunun taşması ve hava durumuyla üst üste binmesi giderildi: kapak ve şarkı bilgisi, tek satırda karıştır · önceki · oynat · sonraki · tekrarla, altında ince ilerleme çubuğu.

### Hız

- Hesap kontrolleri (Gemini/Claude/Cursor programları) ayrı bir iş parçacığında çalışıyor. Bu programların başlatılması, özellikle antivirüs taraması sırasında, Charles’ın penceresini yaklaşık yarım saniye donduruyordu.

## v0.5.0 Beta — 13 Ekim 2026

Bu sürüm, v0.4.4 Beta üzerine Claude ile yapılan geliştirmeleri ve **v0.4.4 SpecialBeta** adıyla denenen ara sürümün değişikliklerini birlikte içeriyor. Başlıca yenilikler Claude kullanım kotası, önemli e-posta baloncukları, yenilenen ayarlar ve uzun sohbetlerde beklemeyi azaltan kayıt düzeni.

### Küçük panel ve kullanım hakkı

- Küçük panelin sol tarafı kullanım hakkına ayrıldı. Hava durumu sağ tarafa, Spotify’ın üstüne taşındı. Ortadaki Slime ve Charles başlığı korundu.
- Kota halkaları büyütüldü. Yüzdelerin altında 5 saatlik ve haftalık dönemler, veri bulunduğunda da yenilenmeye kalan süre gösteriliyor. Geri sayım etiketi 30 saniyede bir güncelleniyor.
- Hangi hesabın kotasına bakıldığı başlıkta belirtiliyor. Codex beyaz, Gemini mavi, Claude turuncu renkle ayrılıyor. Kota azaldığında uyarı rengi kullanılıyor; yüzde sıfıra indiğinde gösterge kırmızıya dönüyor.
- Codex’in ek kredi bilgisi panelin altından sağlayıcı başlığının yanına taşındı. Deneme aşamasında kullanılan plan rozeti son tasarımdan kaldırıldı.
- Yenile düğmesi küçük bir simgeye dönüştürüldü. Sorgu sürerken dönerek çalıştığını gösteriyor.
- Kota paneli başlangıçta ayarlarda seçilen ana yapay zekâyı izliyor. Mesaj kutusundan elle başka bir sağlayıcının modeli seçildiğinde o sağlayıcıya geçiyor. Hesap denetimi veya model listesinin yeniden oluşturulması seçimi kendiliğinden GPT’ye çevirmiyor.
- Sağlayıcı değişirken önceden alınmış kota bilgisi varsa hemen gösteriliyor. Önceki sağlayıcıdan geç gelen yanıtın yeni seçimin üzerine yazması engellendi.
- Yenile isteği hangi sağlayıcı için yapıldığını açıkça taşıyor. Gemini veya Claude kotasını yenilerken göstergenin Codex’e dönmesine neden olan durum giderildi.

### Claude kotası

- Charles’a bağlı Claude hesabının 5 saatlik ve haftalık kalan kullanım yüzdeleri küçük panelde gösterilebiliyor. Hesap okuması Charles’ın kullandığı Claude oturumundan yapılıyor.
- Claude kotası belirli aralıklarla, Claude yanıtlarından sonra ve yenile düğmesiyle güncelleniyor. Başarılı sorgular arasında önbellek kullanılıyor.
- Son başarılı değer yerel olarak saklanıyor. Uygulama yeniden açıldığında yeni sorgu tamamlanana kadar bu değer gösterilebiliyor.
- Geçici bağlantı hatasında eldeki geçerli kota bilgisi silinmiyor. Sunucu “çok fazla istek” yanıtı verdiğinde tekrar tekrar sorgu göndermek yerine bildirilen bekleme süresi dikkate alınıyor.
- Gösterilen sayı önbellekten geliyorsa yeni sorgunun henüz tamamlanmadığı bilgisi korunuyor. Bağlantı hatası, kullanım hakkının gerçekten bitmesiyle aynı duruma dönüştürülmüyor.

### Hesap ve model seçimi

- Bağlı olduğu bilinen bir hesabın tek bir başarısız kontrol yüzünden model listesinden kaldırılması önlendi. Hesabı bağlantısız saymadan önce art arda iki başarısız kontrol bekleniyor.
- Ayarlar açıldığında Gemini, Claude ve Cursor araçlarının aynı anda başlatılması kaldırıldı. Hesap kontrolleri sırayla ve arka planda yürütülüyor; otomatik kontroller arasında 10 dakikalık aralık kullanılıyor.
- Bağlı olduğu bilinen bir hesap ana yapay zekâ olarak seçildiğinde aynı hesap yeniden kontrol edilerek seçim bekletilmiyor.
- Claude’a gönderilen her mesajdan önce yapılan ek hesap denetimi kaldırıldı. Mevcut oturum durumu kullanılıyor; bağlantı sorunları ilgili işlem sonucunda ele alınıyor.
- Sohbet değişimi veya hesap listesinin yenilenmesi sırasında görülen kısa süreli sağlayıcı değişimleri azaltıldı.

### Önemli e-postalar ve takvim bildirimleri

- Yeni e-postalar için adacığın altında küçük bildirim baloncukları eklendi. Baloncuk, göndereni veya konuyu ve iletinin neden önemli bulunduğunu kısa biçimde gösteriyor.
- Baloncuğa tıklanınca ilgili ileti sohbet akışına aktarılıyor. Charles, göndereni, istenen işi ve varsa tarih ya da son teslim bilgisini özetleyebiliyor.
- Yeni iletilerin önemini değerlendiren bir adım eklendi. Ana yapay zekâya göre Codex’in varsayılan modeli, Claude Haiku veya Gemini Flash kullanılabiliyor. Aynı kontrolde değerlendirilen yeni posta sayısı sınırlandırılıyor.
- Eklenti ayarlarına kişisel önem kelimeleri eklendi. Bu kelimeler değerlendirmeye bilgi sağlıyor; yapay zekâya ulaşılamadığında sağlayıcının önem işaretleriyle birlikte yedek değerlendirmede kullanılıyor.
- İlk kontrolde eski iletilerin topluca bildirilmemesi ve daha önce ele alınmış iletilerin yeniden gösterilmemesi korunuyor.
- Takvim uyarıları da aynı baloncuk düzeninden gösterilebiliyor.
- Aynı anda üç baloncuk gösteriliyor; sırada en fazla on iki bildirim tutuluyor. Bildirim penceresi, kullanılan uygulamanın odağını almıyor.
- Otomatik posta kontrolü açılıştan yaklaşık 20 saniye sonra başlıyor; sonraki kontrollerin aralığı 5 dakikadan 2 dakikaya indirildi.

### Sohbetten e-posta sorma

- Posta sorularının tanınması genişletildi. “Gelen önemli bir mail var mı?”, “Hotmailime yeni mail geldi mi?” ve “Son maillerim neler?” gibi ifadeler Charles’ın bağlı hesaplarına yönlendiriliyor.
- Bu yönlendirme, seçili yapay zekâdan önce Charles içinde yapılıyor. Böylece bağlı posta hesabı varken Claude veya Gemini’nin yalnızca “erişimim yok” yanıtı vermesine neden olan durumların bir bölümü giderildi.
- Önemli posta soruları için okunmamışları öne alan ve sekiz mesaja kadar inceleyebilen bir sorgu yolu eklendi. Mevcut diğer özet komutlarının kendi mesaj sınırları devam ediyor.
- Posta yazma veya hesap kurulumuyla ilgili soruların, gelen kutusunu okuma komutuyla karıştırılmaması için ayrım yapılıyor.
- Tek bir e-posta açılamadığında bütün sonuç boşa düşmüyor; eldeki başlık ve önizlemeyle liste devam edebiliyor.
- Okul hesabı, Gmail ve Outlook seçimi korunuyor. Okul postası sorusunun başka bir kişisel hesapta aranması yerine Charles’ın kendi okul e-postası bağlantısı kullanılıyor.

### Bağlantı hataları ve istek sırası

- Aynı posta servisine giden istekler sıraya alındı. Birden fazla işlemin aynı anda Gmail veya Outlook’a yüklenmesi azaltıldı.
- `429 / Too Many Requests` ve `503 / Service Unavailable` yanıtlarında kısa bir beklemeyle en fazla iki yeniden deneme eklendi. Sunucunun bildirdiği bekleme süresi dikkate alınıyor.
- Çalışma ortamı desteklediğinde Windows’un güvenilir sertifika deposu da bağlantı doğrulamasına dahil ediliyor. Windows tarafından tanınan bir sertifikayla HTTPS denetimi yapan güvenlik yazılımlarında görülen `SELF_SIGNED_CERT_IN_CHAIN` hatasına yönelik destek eklendi.
- Bu düzenleme Claude kota sorguları, posta servisleri ve hava durumu gibi ana süreçten yapılan ağ isteklerini kapsıyor.

### Slime ve panel davranışı

- Claude, Gemini ve Cursor yanıtlarının ekranda parça parça gösterilmesiyle Slime’ın yazma ve konuşma durumları daha tutarlı hâle getirildi. Bu görünüm, yanıt alındıktan sonra metnin kademeli gösterilmesiyle sağlanıyor.
- Belge ve e-posta okuma işlemleri için okuma durumu daha belirgin kullanılıyor.
- Masaüstüne çıkarılan Slime’ın pencere boyutu 140 pikselden 180 piksele yükseltildi.
- Ayrılmış Slime’ın diğer uygulamaların üzerinde kalması güçlendirildi.
- Sabitleme düğmesi açıkken büyük panel de diğer pencerelerin üzerinde tutuluyor. Otomatik küçülmeyi engelleyen önceki davranış devam ediyor.
- Sağa veya sola yaslı panelin büyürken merkezdeymiş gibi kaymasına neden olan dönüşüm düzeltildi. Panel kendi yerleşimine göre genişleyip daralıyor.
- Kenardaki küçük panelin fareyi kabul eden alanı, yeni yerleşimle eşleştirildi.
- Sağ ve sol taşıma düğmeleri arayüzü işlem sonucunu beklemeden güncelliyor. Yer değiştirmek hava durumunun yeniden sorgulanmasına veya kısa süreli boşalmasına yol açmıyor.

### Hava durumu

- Hava durumu, küçük panelin sağ üstünde daha kısa bir biçimde gösteriliyor: örneğin “🌤️ 16° · Ankara”.
- Hava durumuna tıklandığında önce büyük panel açılıyor, ardından şehir seçimi gösteriliyor. Şehir penceresinin küçük adacığın sınırları dışında kalıp kullanılamaması giderildi.
- Panel küçültüldüğünde şehir seçimi de kapanıyor.

### Ayarlar ve genel görünüm

- Ayarlar geniş pencerede solda kategori listesi, sağda içerik olacak şekilde yeniden düzenlendi. Dar pencerelerde kategoriler üstte yatay düzene geçiyor.
- Ana işlem düğmeleri, yardımcı düğmeler, kart başlıkları, kenar çizgileri ve klavye odak göstergeleri ortak bir tasarım üzerinden düzenlendi.
- Mesaj kutusunun odak durumu, gönder düğmesinin vurgu rengi, bağlantılar ve kod bloklarının görünümü elden geçirildi.
- Kullanıcı mesajlarının köşeleri ve içerik aralıkları yeni tasarımla uyumlu hâle getirildi.
- Büyük panelin kenarında soluk bir dikdörtgen gibi görünen, pencere sınırında kesilmiş dış gölge kaldırıldı.
- Ayarlar ve diğer diyaloglar açıldığında Charles’ın çevresinde oluşan siyah dikdörtgenin önüne geçmek için diyalog arka katmanı saydamlaştırıldı.
- Başlıklar, kota metinleri ve düğmeler sürükleme sırasında yanlışlıkla seçilmiyor. Sohbet mesajlarında, kodda ve giriş alanlarında metin seçimi korunuyor.

### Beklemeler ve kayıt işlemleri

- Sohbet geçmişi kaydedilirken eski JSON dosyasının tamamını okuyup yeniden yazma işlemi kaldırıldı. Önceki dosya yedek konumuna taşınarak korunuyor.
- Geçici dosyaya yazma ve güvenli değiştirme düzeni sürdürüldü. Ana kayıt dosyası bulunamadığında geçici dosyadan veya yedekten toparlanabilen durumlar eklendi.
- Sohbet kayıtları daha uzun aralıkta birleştiriliyor: kayıt beklemesi 250 ms’den 1,5 saniyeye çıkarıldı. Uzun bir yanıt boyunca büyük geçmiş dosyasının art arda yazılması azaltıldı.
- Hesap kontrollerinin arka plana alınması, her mesajda tekrar eden Claude kontrolünün kaldırılması ve taşıma düğmelerinin beklemeden güncellenmesiyle ana süreçteki iş yükü azaltıldı.
- Bu sürümdeki hız çalışması, düğmeye basıldıktan sonra yapılan işleri azaltmaya odaklanıyor. Her bilgisayarda aynı süreyi veya bütün takılmaların ortadan kalktığını garanti eden bir ölçüm bulunmuyor.

### Gemini Live

- Mikrofon hazırlığı ve sesli görüşme bağlantısı aynı anda başlatılıyor. Birinin tamamlanması için diğerinin beklemesi kaldırıldı.
- Bağlanma sürerken ses düğmesine yeniden basıldığında görüşme iptal edilebiliyor.
- İptal edilmiş veya daha yeni bir görüşmeyle değiştirilmiş bağlantıdan geç gelen sonuçların oturumu tekrar açması engelleniyor.

### Tanı kayıtları ve kod düzeni

- `%APPDATA%\Charles\logs` altında posta, kota ve performans sorunlarını incelemeye yardımcı kısa günlükler eklendi: `mail.log`, `usage.log` ve `perf.log`.
- Performans günlüğü, 150 ms’yi aşan arayüz isteklerini ve ana süreçteki uzun duraklamaları kaydediyor.
- Günlükler yaklaşık 200 KB’ye ulaştığında eski dosya döndürülüyor; tek bir kayıt dosyasının sürekli büyümesi önleniyor.
- Ana süreç dosyaları `core`, `ai`, `usage`, `plugins`, `voice`, `personal`, `system` ve `files` klasörlerine ayrıldı. Arayüzde de sohbet, adacık, ayarlar ve ses kodları ayrı klasörlerde toplandı.
- Eski sürüm numaralarıyla adlandırılmış dosyalara görevlerini anlatan adlar verildi. Örneğin ayar sayfaları `settings-pages.ts`, kısayollar `shortcuts.ts` altında; tema katmanları `public/styles` içinde bulunuyor.
- Kod biçimlendirmesi ortaklaştırıldı. Kullanıcı rehberi, geliştirici rehberi ve mimari açıklamalar yenilendi.
- Bu dosya düzenlemesi sırasında mevcut POP3, Gemini kotası ve sesli eklenti özellikleri yeni klasörlerine taşındı; ilk eklendikleri sürümler aşağıda belirtiliyor.
- Claude kotası, posta önem değerlendirmesi, bildirim baloncukları, posta yönlendirmesi, istek sırası ve sertifika desteği için testler eklendi. Otomatik test kapsamı v0.4.4’teki 112 testten 124 teste çıktı.

## v0.4.4 Beta — 13 Ekim 2026

Bu sürümde panel animasyonunun uzunluğundan çok, tıklamanın ve ilk sürükleme hareketinin işlenmesi üzerinde çalışıldı.

- Panel düğmesi fare tuşu bırakıldığında değil, basıldığı anda açılmaya başlıyor. Klavye ile etkinleştirme korunuyor.
- Ekranın kenarına alınmış panelin görünen alanıyla fareyi kabul eden alanı arasındaki uyumsuzluk düzeltildi.
- Slime’ın ilk sürükleme hareketi, periyodik imleç kontrolünü beklemeden işlenmeye başladı. Sürüklemenin başladığı konum arka tarafa iletiliyor.
- Ses dosyalarının toplu yüklenmesi ilk tıklamanın üzerinden alınıp boşta çalışma zamanına taşındı.
- Eklentiler içindeki servis başlığı ve içerik tek kartta toplandı. Servis satırlarının iç içe kutular gibi görünmesi azaltıldı.
- Kısayol çakışmasında görünen `pet` gibi teknik adlar yerine “Slime’ı masaüstüne gönder” gibi anlaşılır adlar kullanılmaya başlandı. Sorunlu satır işaretleniyor ve farklı bir tuş birleşimi seçilmesi açıklanıyor.

## v0.4.3 Beta — 13 Ekim 2026

- Ayar içerikleri ortak kart düzenine geçirildi. Başlangıç, görünüm, ekran, hafıza, kısayollar, haftalık özet ve kaynak geçmişi bölümlerinin yüzeyleri eşleştirildi.
- Genel ayarlardaki “Alan seç” düğmesi kaldırıldı. Ekrandan alan seçme kısayolu kullanılmaya devam etti.
- Panelin boyutunu her karede yeniden hesaplayan geçiş, grafik katmanında ölçekleme kullanan animasyonla değiştirildi. Uzun sohbetlerde görünür alanın dışındaki mesajların çizim yükü azaltıldı.
- Hava durumu ve kullanım hakkı alanı sadeleştirildi. Büyük yarım dairelerin yerini ince halkalar, küçük süre etiketleri ve sağlayıcı adı aldı.
- Gemini’nin Antigravity `/usage` çıktısından 5 saatlik ve haftalık kalan yüzdeleri okunmaya başladı. Gemini seçiliyken küçük yenile düğmesi eklendi; bu aşamada açılış, sağlayıcı değişimi ve elle yenileme kullanıldı.
- Spotify’ın karıştır ve tekrar düğmelerindeki kutular kaldırıldı. Etkin durum yalnızca simge rengiyle gösteriliyor.
- Dağıtımdan kaynak ve test dosyaları, kullanılmayan eski Gemini CLI, ayrı Node kopyası ve bazı geliştirme araçları çıkarıldı. Yerel ses modelleri ve kullanılan sağlayıcı araçları korundu; açılmış paket yaklaşık 210 MB küçüldü.

## v0.4.2 Beta — 13 Ekim 2026

- Ayarlardaki solgun metinler, vurgu renkleri, seçili sekmeler ve açık anahtarlar daha belirgin hâle getirildi.
- Renk seçicilerin küçük, zor görünen örnek alanları düzeltildi.
- Sohbetin sağ altındaki “Codex bağlı” yazısı kaldırıldı.
- Proje klasörü seçimi küçük klasör simgesi, tek satırlık metin ve ince bir alanla sadeleştirildi. Sohbet modunda gizli kalması korundu.

## v0.4.1 Beta — 13 Ekim 2026

- Panel animasyonundan önceki iki karelik hazırlık beklemesi kaldırıldı.
- Yalnızca sağa veya sola taşınırken boyut değişmiyorsa gereksiz büyüme/küçülme animasyonu çalıştırılmaması sağlandı.
- Geçiş sırasında tıklamaları bütünüyle engelleyen durum kaldırıldı; hızlı yön değiştirme ve art arda büyütüp küçültme kontrol edildi.
- Uzun sohbet içeriğinin geçişin her karesinde yeniden yerleşmesi azaltıldı.
- Yan okların üzerine gelince oluşan koyu kutu kaldırıldı.

## v0.4 Beta — 13 Ekim 2026

### Sohbet geçmişi

- Sohbetler için klasör ve alt klasör oluşturma, yeniden adlandırma, taşıma ve silme eklendi.
- Sohbetler ve klasörler sürükleyerek veya taşıma menüsünden düzenlenebiliyor. Bir klasör silindiğinde içindeki sohbetler silinmiyor; üst klasöre taşınıyor.
- İçeriğe göre AI sınıflandırması eklendi. Dersler, Normal Sohbet, FRP ve Projeler gibi başlıklar veya uygun mevcut klasör kullanılabiliyor.
- Kullanıcının elle taşıdığı sohbetlere otomatik sınıflandırmanın yeniden müdahale etmesi engellendi.
- Geçmiş penceresi arama, klasör yolu ve küçük işlem menüleriyle sadeleştirildi.

### Masaüstü ve görünüm

- Büyük panelin üstüne sabitleme düğmesi eklendi. Etkinken başka uygulamaya tıklamak veya fareyi uzaklaştırmak paneli otomatik küçültmüyor.
- Başlıktaki GPT rozeti kaldırıldı. Charles adı ortalandı; altına küçük sürüm etiketi yerleştirildi.
- Panelin bir kısmı saydam, bir kısmı düz görünmesin diye yüzeyler ortaklaştırıldı ve saydamlık azaltıldı.
- Ayarlar, geçmiş, mesaj kutusu ve simgeler daha küçük kontroller ve dengeli boşluklarla düzenlendi.
- Masaüstü Slime sürüklemesinde tutulan noktanın korunması, gereksiz boyut değişimlerinin kaldırılması ve hareketin daha sık izlenmesi üzerinde çalışıldı.

### Haftalık kullanım

- “Bu hafta” ve “Geçen hafta” seçimi eklendi. Haftanın tamamlanmasını beklemeden o ana kadarki veriler görülebiliyor.
- Bilgisayarda geçirilen süreye, önde kullanılan uygulama ve oyunların süreleri eklendi.
- Kayıtlar yerelde tutuluyor. Charles açıkken ölçülüyor; kilit ve uyku süresi sayılmıyor. Eski kullanım süreleri geriye dönük oluşturulmuyor.

## v3.2.2 — 12 Ekim 2026

- Okul e-postasına IMAP yanında POP3 + TLS desteği eklendi. POP3 için port `995` kullanılıyor.
- POP3 okuması sunucudan mesaj silmeden çalışacak şekilde hazırlandı. Yeni mesaj takibi UIDL kimlikleriyle yapılıyor.
- “Okul mailimi kontrol eder misin, önemli bir mail var mı gelen?” gibi birleşik soruların doğru hesaba yönlenmesi düzeltildi.
- Sesli araç çağrısında geç veya parça parça gelen konuşma dökümü için bekleme eklendi. Konuşma tamamlanma olayıyla aynı anda gelen metnin kaybolması ve eski komutun tekrar kullanılması önlendi.
- “Home Assistant, tavan lambasını kapatır mısın?” gibi hitap ve noktalama içeren ifadelerin tanınması iyileştirildi.
- Gmail rehberi 9, Outlook rehberi 7 kısa adıma ayrıldı. Google test kullanıcısı, doğru OAuth istemci türü, Microsoft hesap türü, istemci kimliği, yönlendirme adresi ve izin adımları daha açık anlatıldı.
- Rehberde resmi sayfayı yeniden açma ve Microsoft dönüş adresini kopyalama kolaylaştırıldı.

## v3.2.1 — 12 Ekim 2026

- Home Assistant cihazları, kullanıcıya görünen adlarıyla bulunup kontrol edilmeye başladı. Aynı adla birden fazla cihaz varsa seçim netleştiriliyor; erişilemeyen cihaz için başarı yanıtı verilmiyor.
- Gmail, Outlook ve okul e-postasını okuma ve özetleme işlemleri Charles’ın kendi bağlantılarına yönlendirildi. Sesli eklenti işlemlerinde de bu bağlantılar kullanılmaya başladı.
- Okul kutusundaki son iletileri okumayı engelleyen 7 günlük filtre kaldırıldı.
- Posta listeleme ve arama kontrolleri ayarlardan çıkarıldı; bu işlemler sohbete taşındı. Çalışan entegrasyonu bulunmayan Shazam paneli kaldırıldı.
- Yeni okunmamış posta ve takvim bildirimleri temiz kurulumda etkin hâle getirildi. İlk kontrolde eski iletilerin topluca bildirilmemesi korundu.
- Gmail ve Outlook için “Charles ile kur” rehberi eklendi. Resmi kurulum sayfası açılıyor; Slime masaüstüne çıkıp yanında kısa adım açıklamaları gösteriyor.
- Google’ın masaüstü OAuth JSON dosyasını içe aktarma ve Microsoft istemci kimliğinin nereden alınacağını gösterme eklendi.
- Kısayolları metin olarak yazmak yerine düğmeye basıp tuş birleşimini yakalama eklendi. Kayıt sırasında mevcut kısayollar geçici duruyor; vazgeçme, odak kaybı ve zaman aşımında geri geliyor.
- Haftalık rapora bilgisayarda toplam açık oturum ve aktif kullanım süreleri eklendi.
- Sesli yanıt metninin sesin önüne geçmemesi için metin, ses oynatma kuyruğunun tamamlanmasına bağlandı. Kelime kelime altyazı zamanlaması eklenmedi.

## v3.2 — 12 Ekim 2026

- “Hey Charles” uyandırması geliştirildi. Üç örnekli eğitimle yerel algılama eşiğini ve tanınan hitap biçimini ayarlama eklendi.
- Dikte ve sesli görüşme düğmeleri ayrıldı. Dikte metni gönderilmeden önce düzenlenebiliyor.
- Cursor hesabıyla giriş ve doğrulanan hesaba ait model seçenekleri eklendi.
- Sohbeti açma, sesli görüşme, dikte, önceki/sonraki sohbet, ekran seçimi, masaüstü Slime ve gardırop gibi işlemler için özelleştirilebilir kısayollar eklendi.
- Türkçe ve İngilizce arayüz seçimi getirildi.
- Sohbet ve işlem ayrıntıları daha sade bir düzene alındı. Görsel üretimi beklenirken noktalı animasyon eklendi.
- Pazartesi sabahı önceki haftanın etkinliklerini gösteren haftalık özet eklendi. Oturumlar, işlem süresi, dosyalar, değişen satırlar, komutlar, izinler, öne çıkan model/proje ve yoğun gün bilgileri rapora alındı.
- Gmail, Google Calendar, Google Drive, Outlook, okul e-postası ve Home Assistant eklentileri ortak bir ayar alanında toplandı. Eski GitHub ve benzeri servis kartları da bu alana taşındı.
- Model değiştirildiğinde önceki sağlayıcının bitmiş kotasından kalan yorgun mimik temizlenmeye başladı.
- Gemini abonelik bağlantısında desteklenmeyen görsel ekler için açık hata gösterilmesi ve ekin korunması sağlandı.

## v3.1.3 — 11 Ekim 2026

- Gemini Live’dan istenen bilgisayar ve dosya işlemlerini bağlı GPT/Codex hesabına aktarabilen bağlantı eklendi. İşlem sonucu sesli oturuma geri dönüyor.
- Sesli görüşmenin açık, bağlanıyor veya işlem yapıyor olduğunu gösteren durum alanı eklendi. Buradan görüşme sonlandırılabiliyor.
- Masaüstüne çıkarılan Slime’ın arkasındaki siyah kutu ve yatay kayma sorunu düzeltildi.
- Karakter biraz aşağı alındı; parti şapkası ve uzun aksesuarlar için üstte boşluk bırakıldı.

## v3.1.2 — 11 Ekim 2026

- Spotify çalmıyorken süre, ilerleme, karıştırma ve tekrar kontrolleri gizlenmeye başladı.
- Gemini Live için 30 hazır ses ve varsayılan ses seçeneği eklendi. Kaydedilen ses bir sonraki görüşmede kullanılıyor.
- Google oturumunu yanlış ortamda kontrol eden durum düzeltildi. Bağlı hesabın Gemini modelleri listede görünmeye başladı; zaten bağlı hesap için tekrar giriş terminali açılması önlendi.

## v3.1.1 — 11 Ekim 2026

- Charles’ın sohbetine bağlanmayan “Ücretsiz Claude’u tarayıcıda aç” düğmesi kaldırıldı.
- Model seçici yalnızca doğrulanan hesaplara ait seçenekleri gösterecek şekilde düzenlendi. Giriş sonrası otomatik kontrol ve elle bağlantı kontrolü eklendi.
- GPT, Gemini ve Claude hesap kartları aynı düzene getirildi.
- Spotify ilerleme çizgisi ve tutamacı inceltildi; sürükleme alanı korundu.
- Aksesuarların sabit çizimleri önbelleğe alındı. Karaktere aksesuar takıldığında oluşan ek çizim yükü azaltıldı.
- Nokta içeren yeni Gemini anahtar biçimleri kabul edilmeye başladı. Yeni anahtar yazılıp kaydedilmeden eski anahtarla test yapılması engellendi.
- Genel kimlik doğrulama hatalarının doğrudan “anahtar geçersiz” diye gösterilmesi düzeltildi. Anahtarların hata metninde gizlenmesi geliştirildi.

## v3.1 — 11 Ekim 2026

- Gemini bireysel hesap bağlantısı, artık desteklenmeyen eski giriş yolundan resmi Antigravity CLI’a taşındı.
- Gemini ve Claude için giriş pencerelerinin açılması, giriş sonrası kontrol ve hesap durumunun gösterilmesi düzenlendi.
- Ücretsiz Claude web hesabıyla Claude Code erişimi arasındaki fark ayarlarda açıklandı.
- Gemini Live anahtarını kaydetme, bağlantıyı test etme ve görüşmenin açılır açılmaz kapanmasına yol açan durumlar üzerinde düzeltmeler yapıldı.

## v3.0 — 11 Ekim 2026

- GPT’nin yanına Gemini ve Claude hesap bağlantıları eklendi. Yeni sohbetlerin varsayılan sağlayıcısını belirleyen “Ana yapay zekâ sistemi” ayarı getirildi.
- Kullanım panelinde ana sağlayıcının adı gösterilmeye başladı. Bu sürümde gerçek kota yüzdeleri Codex için okunuyordu; diğer sağlayıcıların kota desteği sonraki sürümlerde genişletildi.
- Gemini Live ile sesli görüşme eklendi. Live bağlantısı, abonelik hesabından ayrı API anahtarıyla kuruluyor.
- “Hey Charles” uyandırmasının ilk sürümü eklendi. Yerel Whisper tiny dinleme için, Whisper small dikte için kullanılmaya devam etti.
- Spotify’a parça süresi, ilerleme çubuğu, sürükleyerek ileri/geri gitme, karıştırma ve tekrar kontrolleri eklendi.
- Slime’ı sürükleyerek panelden ayırma ve masaüstünde bırakma eklendi. Çift tıklamayla panele dönme sağlandı.
- Yeni karakter, dans ve aksesuar animasyonları Charles’ın mevcut durumlarıyla birleştirildi.
- Gizliyken karakter çizimi durduruldu; boşta kare hızı ve bazı arka plan medya kontrolleri azaltıldı.

## v2.2.4 — 6 Ekim 2026

- “Tekniğe odaklandım” ve “Karaktere odaklanalım” gibi normal sohbet ifadelerinin odak sayacını başlatması engellendi.
- Sayaç ve hatırlatıcılar için açık bir eylem isteği aranması sağlandı. “Hatırlatıcı kurdum” gibi bir olayı anlatan cümleler komut olarak ele alınmıyor.

## v2.2.3 — 5 Ekim 2026

- Uzun bir hikâye veya karakter metni içinde geçen harflerin CPU/RAM/GPU sorgusu sanılması düzeltildi. Kaynak kullanım komutlarında kelime sınırları dikkate alınmaya başladı.
- Normal sohbetin “RAM Kullanımı” yanıtına yönlenmesine neden olan eşleşmeler daraltıldı.
- Büyük panel açıldıktan sonra sohbet bölümünde yeniden başlayan hareket efekti kaldırıldı.

## v2.2.2 — 5 Ekim 2026

- Uzun mesajlarda yazı alanının genişliği düzenlendi; kontroller alt satıra geçerken kaydırma çubuğu sağ kenarda kalıyor.
- Büyüme ve küçülme sırasında Windows penceresinin yüzeyi sabit tutulup görünen panelin boyutlandırılması üzerinde çalışıldı.
- Geçişlerde görülen kısa yatay ve aşağı yönlü kaymalar azaltıldı.
- Charles başlığının hizası düzeltildi.

## v2.2.1 — 5 Ekim 2026

- En küçük, küçük ve büyük panel arasındaki geçişler için arayüz animasyonları düzenlendi.
- Uzun metin alanlarının kaydırma çubukları inceltildi.
- Küçük panelde hava durumunun altına Codex’in 5 saatlik ve haftalık kalan kullanım yüzdeleri ile ek kredi bilgisi eklendi.
- Kota bitince Charles’ın limit/yorgun durumuna geçmesi, hak yenilendiğinde yıldız gözlü kutlama yapması bağlandı.
- Spotify boşta olduğunda başlık ve kontrollerin yukarı yaslanması yerine ortalanması sağlandı.

## v2.2 — 5 Ekim 2026

- Küçük panelde Slime ortaya, hava durumu sola, Spotify sağa alındı. Büyük panelde de karakter ve Charles başlığı ortalandı.
- Hava durumuna ayrılan alandaki “Hazırım” ve öneri cümleleri kaldırıldı.
- Mesaj ekleri için küçük resim görünümü eklendi.
- Düzenlenen mesajların alternatif akışları arasında geçiş yapılabilen önceki/sonraki düğmeleri getirildi.
- Yazdıkça büyüyen daha küçük mesaj kutusu ve model seçicisi hazırlandı. Artı menüsünde dosya/fotoğraf ekleme, görsel oluşturma, web arama ve derin araştırma seçenekleri toplandı.
- Spotify albüm kapağı küçük panele eklendi.
- Renk özelleştirmesi ve kategorilere ayrılmış ayarlar getirildi.
- Paneli ekranın soluna, ortasına ve sağına yerleştirme tamamlandı.
- CPU, RAM ve erişilebilen GPU kullanımını kaydetme ve belirli zaman aralıkları için sohbetten sorgulama eklendi.
- Sohbet modunda proje klasörü seçicisinin görünmesi ve önizlemede Slime’ın kaybolması gibi yerleşim sorunları giderildi.

## v2.1.2 — 4 Ekim 2026

- “ChatGPT’den beni tanı” akışı ve ayrıntılı tanışma soru paketi eklendi. Kullanıcının tercihleri, çalışma biçimi ve Charles’ın nasıl davranması gerektiği için bilgi aktarımı sağlandı.
- ChatGPT’den alınan metin özetini inceleyip Charles’ın yerel hafızasına kaydetme yolu hazırlandı. ChatGPT web hafızasının kendiliğinden aktarılmadığı açıklandı.
- Charles’ın kim olduğu ve HzPederPan tarafından hazırlandığına ilişkin temel tanım eklendi.
- Standart kurulumdan ayrı tutulabilen `Charles-creator.json` yaratıcı profili desteği getirildi.
- Düğmelerin üzerine gelince görünen Windows tarzı açıklama kutuları kaldırıldı.

## v2.1 ve v2.1.1 — 4 Ekim 2026

- Kısa durum bildirimleri sohbet/proje seçimiyle hesap etiketi arasındaki alana taşındı; bir süre sonra kendiliğinden kaybolmaları sağlandı.
- Başlık altında tekrarlanan uygulama ve kaynak bilgileri sadeleştirildi.
- “Hava nasıl?” ve “Şu an kaç derece?” gibi sorular seçili şehir için yerel hava durumu bağlantısına yönlendirildi.
- Ayarlar başlığı sabit tutulup içerik kaydırılabilir hâle getirildi.
- Uzun durum yazıları için kayarak gösterme eklendi.

## v2.0 — 4 Ekim 2026

- Siyah ağırlıklı panel tasarımı ve ekran kenarına yerleştirme geliştirildi.
- Panelin alt kenarından sürükleyerek yükseklik ayarlama ve boyutu saklama eklendi.
- Hava durumu, şehir seçimi, kalıcı hafıza ve kullanıcının tercih ettiği hitap biçimi eklendi.
- Terminal, web araması, dosya okuma, kod ve görsel işlemleri için karakter tepkileri çeşitlendirildi. Uygun çalışma akışlarında Eureka/ampul tepkisi kullanıldı.
- Seçili metni Charles’a sürükleyip ek olarak bırakma getirildi.
- Etkin uygulamaya göre yerel bağlam ve öneri altyapısı geliştirildi.

## v1.1.1 — 2 Ekim 2026

- Dosya bırakma ve ekran alanı seçme akışları geliştirildi. Seçilen alan, gönderilmeden önce mesaj eki olarak gösteriliyor.
- İşlem ayrıntıları katlanabilir bölüme alındı; GIF desteği eklendi.
- Dosya sürüklerken panelin otomatik küçülmesi bekletildi.
- Temiz kurulum, bozuk kayıtları toparlama ve Windows başlangıcında açılma düzenlendi.

## v1.1 — 2 Ekim 2026

- Mesaj düzenleme ve önceki işlem bağlamını kullanabilen çalışma günlüğü eklendi.
- Kullanıcının seçtiği klasörlerde dosya arama, PDF ve DOCX metinlerini inceleme geliştirildi.
- Birden fazla uygulamayı açmak gibi kullanıcıya özel kısa komutlar eklendi.
- Sohbet geçmişine dönme, son çalışma modu ve proje klasörünü koruma akışları düzenlendi.

## v1 Beta — 30 Eylül–1 Ekim 2026

- İlk Windows masaüstü asistanı hazırlandı.
- ChatGPT hesabıyla Codex sohbeti ve proje çalışması, araç onayları, birden fazla oturum ve sistem tepsisi eklendi.
- Fare takibi, dokunma tepkileri, otomatik küçülme ve ekranın üst kenarına gizlenme getirildi.
- Dosya ekleri, GitHub, Vercel, Stripe, Resend, Notion, Cal.com ve n8n servis kartları için temel yapı kuruldu.
- Yerel Whisper ile ses tanıma, Windows seslendirmesi, hatırlatıcılar ve odak sayacı eklendi.

## Güncelleme ve kontrol bilgisi

Yeni sürümü ayrı bir klasöre çıkarıp `CHARLES-BASLAT.cmd` ile açmak yeterli. Sohbetler, hafıza, ayarlar ve hesap bağlantıları `%APPDATA%\Charles` altında tutuluyor. `Reset-Charles.cmd`, yerel verileri sıfırlamak istendiğinde kullanılan ayrı bir işlem; normal güncelleme için gerekmiyor.

Bu notlar v0.4.4 kaynakları, v0.5.0 kodu ve yerel Git geçmişi karşılaştırılarak; eski sürüm bölümleri de önceki paketlerin açıklamaları ve geliştirme kayıtları incelenerek düzenlendi. v0.4.4 SpecialBeta’daki değişiklikler v0.5.0 bölümüne dahil edildi; ara tasarımların sonradan kaldırılan parçaları güncel özellik gibi yazılmadı.

13 Ekim 2026 kontrolünde **124 otomatik testin tamamı geçti**. v0.5.0 klasöründe test derleyicisi `esbuild` bulunmadığından iki arayüz testinin ihtiyacı mevcut geliştirme kopyasından geçici olarak karşılandı; uygulama kodu değiştirilmedi. Bu çalışma yama notlarını doğrulamak için yapıldı; kişisel hesaplarla yeni bir canlı posta, kota veya akıllı ev denemesi yapılmadı.
