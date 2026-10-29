# Dosya paylaşımı — v0.9.6

Charles açıldığında **Dosya alımı Açık** başlar ve paylaşım paneli hiç açılmasa da arka planda açık kalır. Alım açık olması otomatik kabul anlamına gelmez; gelen her aktarımda onay istenir. Quick Share motoru, pakete dahil edilen kendi Windows çalışma ortamını (`tools/quickshare`, [MultiDrop](https://github.com/digitaldanis/multidrop) tabanlı) kullanır; üçüncü taraf lisans ve telif bildirimleri `THIRD-PARTY-NOTICES.md` dosyasındadır.

- **Açık:** gelen dosyanın adı, boyutu ve eşleşme kodu gösterilir; Kabul et veya Reddet seçilir.
- **Kapalı:** cihaz duyurusu ve gelen dosya alımı kapanır.

Tüm Android cihazlarla yerleşik Quick Share; Apple cihazlarla LocalSend uygulaması üzerinden paylaşım desteklenir. Telefon adı gizlenmişse bağlantıda öğrenilen ad oturum içinde hatırlanır; bilinmeyen telefonlar **Android cihazı** olarak gösterilir.

## Telefonda görünme (v0.9.6)

- Charles, Quick Share duyurusunu birkaç saniyede bir kendiliğinden tekrarlar; telefon paylaşım ekranını açtığında bilgisayarın görünmesi için paylaşım panelini açmak gerekmez.
- Duyuru yalnızca gerçek ağ bağdaştırıcılarında yapılır (VirtualBox, Hyper-V, WSL, VPN gibi sanal bağdaştırıcılar atlanır) ve telefona yalnızca kendi ağındaki adres verilir. Böylece telefon ulaşamayacağı bir adrese bağlanmaya çalışıp “Bağlanıyor…” durumunda kalmaz.
- Uykudan dönüşte ve kilit açılınca duyuru yeni soketlerle baştan yapılır; çok noktaya yayın üyeliği dakikada bir tazelenir.
- Bazı modemler Wi-Fi cihazları arasında çok noktaya yayını iletmez. Charles bu yüzden ağda mDNS konuşan cihazlara (telefon dahil) duyurunun bir kopyasını doğrudan da gönderir.

Telefonların bilgisayarı görebilmesi için Windows güvenlik duvarının Quick Share çalışma ortamına izin vermesi gerekir. İzin yoksa (ya da Windows'un ilk açılış sorusu kapatıldığı için bir engelleme kuralı varsa) Charles bunu fark eder: paylaşım panelinde **Ağ izni ver** düğmesi çıkar ve açılıştan kısa süre sonra bir kez hatırlatır. Düğme, Windows onayıyla `tools/quickshare/Allow-Local-Network.ps1` betiğini çalıştırır: yalnızca özel/etki alanı ağındaki yerel cihazlardan TCP/53318 ve UDP/5353 erişimine izin verir ve yalnızca bu çalışma ortamı için yazılmış engelleme kurallarını kaldırır.

## Gönderme ve alma

Dosya seçip yakındaki cihaza tıklamak gönderimi başlatır. Alıcı kabul ettikten sonra ilerleme gösterilir. Alınan dosyalar için **Klasörde göster** kullanılabilir. Aynı adlı dosyalar üzerine yazılmaz; yeni ad verilir. İptal edilen veya eksik aktarım başarılı gösterilmez ve yarım dosyası temizlenir. Windows'ta iPhone için LocalSend gerekir; Windows Wi-Fi sürücülerinde Apple AWDL desteği yoktur.

Bağlantı aşamaları ve hatalar `%APPDATA%\Charles\logs\quickshare.log` dosyasına yazılır. Dosya içeriği, cihaz adları veya şifreleme anahtarları kaydedilmez.

## Cihaz testi

1. Charles'ı kapat, bir dakika bekle ve aç. Paylaşım paneline dokunmadan telefonda Quick Share ile dosya gönder: bilgisayar birkaç saniye içinde listelenmeli ve aktarım tamamlanmalı.
2. Aynı işlemi Slime uyurken ve adacık küçükken tekrarla.
3. Bilgisayarı uyku moduna al, uyandır; telefondan yeniden gönder.
4. Ardı ardına iki dosya gönder; her birinde onay istenmeli.
