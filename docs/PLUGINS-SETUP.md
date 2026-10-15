## v3.2.2 · Kısa bağlantı rehberi

Rehber balonları kısaltıldı. Google test kullanıcıları adımı doğrudan Audience sayfasını açar ve aynı projeyi kullanmayı hatırlatır. Microsoft rehberi yeni ekranın düğme adlarını, kişisel hesap destekleyen hesap türünü ve Settings sekmesindeki public client ayarını gösterir.

# v3.2.2 · Okul e-postası (POP3 / IMAP)

Ayarlar → Eklentiler → Okul e-postası. Okulunun bilgi işlem sayfasındaki sunucu adresini, protokolü (**POP3 · TLS** veya **IMAP · TLS**) ve portu (genellikle POP3 için **995**, IMAP için **993**) gir. Tam okul e-posta adresini ve şifreni yaz; ayarları kaydet ve bağlantıyı test et.

POP3 okuma sunucudan mesaj silmez. Yeni mail takibi sabit UIDL kimlikleriyle yapılır; POP3 okunmuş durumunu bildirmez. İlk liste başlangıç kabul edilir.

# v3.2.1: Charles ile kur

Ayarlar → Eklentiler → Google/Microsoft → **Charles ile kur** resmi siteyi açar ve Slime yanında yönlendirme gösterir. Google için indirilen **Desktop app OAuth JSON** dosyasını seçebilirsin; API anahtarı veya servis hesabı dosyası kullanma. Microsoft için **Application (client) ID**, uygulama kaydının Overview sayfasındadır; e-posta adresi değildir.

Bağlantı kurulunca mailleri ayarlardan okumak yerine sohbetten veya sesli görüşmeden iste. “Okul maillerimi özetle”, “Gmail maillerimi özetle”, “Maillerimi özetle” ve “Tavan lambasını kapat” desteklenir. Hesap/IMAP bilgileri kayıtlı olması bağlantının başarılı olduğu anlamına gelmez; **Bağlantıyı test et** ile doğrula.

Temiz kurulumda yeni okunmamış mail bildirimleri açıktır. Beş dakikalık kontrol yalnızca Charles açıkken çalışır; ilk kontrol geçmişi bildirmez. Bildirim anahtar kelimeleri artık gerekli değildir. Aşağıdaki eski teknik kurulum ayrıntılarındaki anahtar kelime/panel açıklamaları yerine bu davranış geçerlidir.

# Charles v3.2 · Eklenti kurulumu / Plugin setup

Hesapları **Ayarlar → Eklentiler** bölümünden bağla. ChatGPT eklenti oturumları Charles'a aktarılmaz. Her kullanıcı kendi hesabını bağlar. Anahtarlar, şifreler ve OAuth oturumları Windows şifrelemesiyle yerel olarak saklanır; kurulum paketine girmez.

## Google: Gmail, Calendar, Drive

1. [Google Cloud Console](https://console.cloud.google.com/) üzerinde bir proje oluştur. Gmail API, Google Calendar API ve Google Drive API'yi etkinleştir.
2. OAuth consent screen / Google Auth Platform bölümünü yapılandır. Uygulama test modundaysa kendi Google hesabını test kullanıcısı ekle.
3. OAuth Client oluştur; uygulama türü **Desktop app** olsun. Client ID ve varsa Client Secret değerini Charles'taki Google kartına girip Kaydet'e bas.
4. **Hesaba bağlan** ile sistem tarayıcısında giriş yap. İstenen izinler Gmail, takvim ve Drive için salt okunurdur. Giriş callback adresi `http://127.0.0.1:42813/callback`; state ve PKCE denetlenir.
5. Eklenti listesinden Gmail / Google Calendar / Google Drive seç, Listele'ye bas. Drive araması dosya adıyla çalışır. Google Docs, TXT ve Markdown içerikleri Charles'a aktarılabilir; diğer biçimlerde dosyayı Drive'da açıp Charles'a ekle.

Test modundaki Google uygulamaları tekrar giriş isteyebilir. Başkalarına dağıtılan bir OAuth uygulaması Google doğrulaması ve ilgili veri politikalarını gerektirebilir. Charles bu kaydı senin adına yapmaz.

## Microsoft: Outlook ve takvim

1. [Microsoft Entra](https://entra.microsoft.com/) → App registrations → New registration. Kullanacağın hesap türlerini seç (kişisel Outlook hesabı için personal Microsoft accounts desteği gerekir).
2. Authentication → **Mobile and desktop applications**. Redirect URI olarak `http://127.0.0.1:42813/callback` kaydet. Bu bir public desktop client'tır; Charles Microsoft client secret istemez.
3. Delegated Microsoft Graph izinleri: `Mail.Read`, `Calendars.Read`, `offline_access`.
4. Application (client) ID değerini Charles'a kaydet, **Hesaba bağlan** düğmesini kullan. Kurum hesabında yönetici onayı gerekebilir.

## Okul e-postası: TLS IMAP

- Sunucu adresini, portu ve kullanıcı adını okulunun bilgi işlem birimiyle doğrula; IMAP veya POP3 erişiminin hesabında açık olması gerekir. Önerilen IMAP TLS portu `993`, POP3 TLS portu `995`.
- Hesap veya uygulama şifreni yalnızca Charles ayarlarına gir. Sertifika doğrulaması kapatılamaz. INBOX salt okunur açılır; mail okunmuş işaretlenmez veya silinmez.
- Liste son 7 gündeki en yeni 25 iletiyi getirir. Seçilen iletinin metni en fazla 30.000 karakter olarak aktarılır; büyük iletiler sınırlanır. Ekler otomatik indirilmez.
- Okul webmail'i oturumunu kazıma veya güvenlik adımlarını atlama kullanılmaz. IMAP kurumda kapalıysa bu bağlantı çalışmaz; webmail üzerinden devam et.

## Home Assistant

1. Home Assistant profilinde bir **Long-lived access token** oluştur.
2. Sunucu URL'sini (`http://homeassistant.local:8123` gibi) ve token'ı Charles'a kaydet. Uzak sunucularda HTTPS gerekir.
3. Listeden Home Assistant seç. Cihazın desteklenen işlemini seçip Uygula → Onayla kullan.
4. Sohbette `/home` cihazları listeler. `/ev light.salon turn_on` gibi bir komut cihazı çalıştırır. Tam erişimde doğrudan uygulanır; diğer erişim modlarında onay kartı gösterilir.

Desteklenen alanlar: light, switch, fan, media_player, cover, lock, scene, script ve automation. İşlem seçenekleri cihazın alanına göre gösterilir. Sunucu işlemi reddederse Charles başarılı saymaz. Home Assistant sunucusu, adresi ve token'ı gerekir; Google Home hesabı doğrudan bağlanmaz.

## Bildirimler

Önemli mail ve takvim bildirimlerini aç. Charles çalışırken 5 dakikada bir kontrol eder; kapalıyken izlemez. İlk kontrol yalnızca başlangıç listesini kaydeder. Sonraki kontrollerde yeni okunmamış maillerin sağlayıcı önem etiketi veya belirlediğin virgülle ayrılmış kelimeler değerlendirilir. Takvimde yeni olaylar ve 15 dakika içinde başlayacak olaylar bildirilir. Aynı olay tekrar tekrar bildirilmez. Sınıflandırma yerel kurallarla yapılır; gelen mail talimatları cihaz çalıştırmaz veya mesaj göndermez.

Sohbet komutları: `/gmail`, `/outlook`, `/calendar`, `/outlook-calendar`, `/school`, `/drive aranan ad`, `/home`. “Gmail maillerimi göster”, “okul maillerimi göster” ve “takvimimi göster” de kullanılabilir. Eklenti panelinde **Charles'a sor** seçilen metni taslağa koyar; sen Gönder dediğinde seçtiğin AI sağlayıcısına gider.

## Cursor ve Shazam

Cursor, Ayarlar → Hesap bölümünde resmi Windows Cursor Agent üzerinden tarayıcı girişiyle bağlanır. Cursor erişimi olan kendi hesabını kullanırsın. Bağlandıktan sonra Cursor Auto model listesinde görünür. Bu sürümde Cursor bağlantısı sohbet içindir; dosya/terminal araçları kapalıdır. Proje işlemlerinde GPT/Codex kullan. Cursor kotası sayısal olarak alınamadığında kullanım paneli bunu açıkça belirtir.

ShazamKit'in resmi Windows SDK'sı bulunmadığı için Shazam bu sürümde çalışır bir eklenti değildir. ChatGPT'deki Shazam bağlantısı taşınmaz. [Apple ShazamKit](https://developer.apple.com/shazamkit/).

## English quick setup

Settings → General → Language → English switches the interface. Under Plugins, configure your own Google Desktop OAuth client or Microsoft public desktop application (callback `http://127.0.0.1:42813/callback`). Google requires Gmail, Calendar and Drive APIs with read-only scopes; Microsoft requires delegated Mail.Read, Calendars.Read and offline_access. Sign in using the system browser.

School mail uses verified TLS IMAP. Enter the server, port, username and password in Settings. Confirm the server address and IMAP/POP3 availability with your school's IT department. Home Assistant requires your server URL and a long-lived token. Credentials are encrypted locally and never included in the installation package. Monitoring runs every five minutes while Charles is open. The first check establishes a baseline; later checks notify you about important new mail and calendar events. This is rule-based filtering, not a background AI call.

## Technical references

- [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/)
- [Cursor CLI authentication](https://cursor.com/docs/cli/reference/authentication)
- [ImapFlow](https://imapflow.com/docs/)
