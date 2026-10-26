# Dosya paylaşımı — v0.9.5 Beta

Charles açıldığında **Dosya alımı Açık** başlar. Alım açık olması otomatik kabul anlamına gelmez; gelen her aktarımda onay istenir. Quick Share, MultiDrop'un Windows motorunu doğrudan kullanır; gerekli çalışma ortamı pakete dahildir. Ağdaki cihazların birbirine ulaşabilmesi gerekir.

- **Açık:** gelen dosyanın adı, boyutu ve eşleşme kodu gösterilir; Kabul et veya Reddet seçilir.
- **Kapalı:** cihaz duyurusu ve gelen dosya alımı kapanır.

Tüm Android cihazlarla yerleşik Quick Share; Apple cihazlarla LocalSend uygulaması üzerinden paylaşım desteklenir. Telefon adı gizlenmişse bağlantıda öğrenilen ad oturum içinde hatırlanır; bilinmeyen telefonlar **Android cihazı** olarak gösterilir. Aynı adlı farklı gerçek cihazlar birleştirilmez.

Windows ilk kullanımda ağ izni isteyebilir. `tools/quickshare/Allow-Local-Network.ps1`, yönetici onayıyla yalnızca özel ağdaki yerel cihazlardan TCP/53318 ve UDP/5353 erişimi sağlar. Slime uyku davranışının gerçek cihaz doğrulaması `VERIFICATION-v0.9.5.md` dosyasında kayıtlıdır.

Dosya seçip yakındaki cihaza tıklamak gönderimi başlatır. Alıcı kabul ettikten sonra ilerleme gösterilir. Alınan dosyalar için **Klasörde göster** kullanılabilir. Aynı adlı dosyalar üzerine yazılmaz; yeni ad verilir. İptal edilen veya eksik aktarım başarılı gösterilmez ve yarım dosyası temizlenir.

QR alanı bu sürümde kaldırılmıştır. Windows'ta iPhone için LocalSend gerekir; Windows Wi-Fi sürücülerinde Apple AWDL desteği yoktur.

Bağlantı aşamaları ve hatalar `%APPDATA%\Charles\logs\quickshare.log` dosyasına yazılır. Dosya içeriği veya şifreleme anahtarları kaydedilmez.

Samsung S24+ ile bilgisayardan telefona gönderim ve telefondan bilgisayara 6.809.750 bayt JPG alımı doğrulandı. Otomatik testler ayrıca bağımsız MultiDrop ile iki yönlü aktarım, boş dosya, yinelenen ad, gecikmeli kabul, iptal ve şifreli mesaj doğrulamasını kapsar.
