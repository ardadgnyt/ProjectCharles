# Dosya paylaşımı — v0.9.2 Beta

Charles açıkken **Herkes** veya **Otomatik** alım modu, paylaşım paneli kapalı olsa da bilgisayarı aynı yerel ağda görünür tutar. Uyku dönüşünde ve ağ adresi değiştiğinde keşif yenilenir. Telefonun Quick Share ekranında Wi-Fi ve Bluetooth açık olmalıdır; ağ yönlendiricisinin cihazlar arası iletişime izin vermesi gerekir.

- **Herkes:** gelen dosyanın adı, boyutu ve eşleşme kodu gösterilir; Kabul et veya Reddet seçilir.
- **Otomatik:** gelen dosyalar onay beklemeden İndirilenler klasörüne kaydedilir.
- **Kapalı:** cihaz duyurusu ve gelen dosya alımı kapanır.

Dosya seçip yakındaki cihaza tıklamak gönderimi başlatır. Alıcı kabul ettikten sonra ilerleme gösterilir. Alınan dosyalar için **Klasörde göster** kullanılabilir. Aynı adlı dosyalar üzerine yazılmaz; yeni ad verilir. İptal edilen veya eksik aktarım başarılı gösterilmez ve yarım dosyası temizlenir.

QR alanı bu sürümde kaldırılmıştır. Windows'ta iPhone için LocalSend gerekir; Windows Wi-Fi sürücülerinde Apple AWDL desteği yoktur.

Bağlantı aşamaları ve hatalar `%APPDATA%\Charles\logs\quickshare.log` dosyasına yazılır. Dosya içeriği veya şifreleme anahtarları kaydedilmez.

Samsung S24+ ile bilgisayardan telefona gönderim ve telefondan bilgisayara 6.809.750 bayt JPG alımı doğrulandı. Otomatik testler ayrıca bağımsız MultiDrop ile iki yönlü aktarım, boş dosya, yinelenen ad, gecikmeli kabul, iptal ve şifreli mesaj doğrulamasını kapsar.
