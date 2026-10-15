# Charles’ı GitHub’a yükleme

Bu klasör GitHub’a yüklenmeye hazırdır. `.gitignore` dosyası büyük ve kişisel dosyaların
GitHub’a gitmesini zaten engeller:

| GitHub’a **gitmez** | Neden |
| --- | --- |
| `node_modules/`, `dist/` | `npm ci` ve `npm run build` ile her bilgisayarda yeniden oluşur |
| `models/`, `tools/` | Çok büyük (yaklaşık 1 GB); `npm run setup:voice` indirir |
| `Charles-creator.json`, `_to_delete/`, `*.zip`, `*.log` | Kişisel ya da geçici dosyalar |

Sohbet geçmişi, hafıza, ayarlar ve **bütün API anahtarları / hesap bağlantıları** bu klasörde
değil, `%APPDATA%\Charles` içinde saklanır (anahtarlar Windows ile şifreli). O klasör GitHub’a
hiçbir zaman gitmez.

## En kolay yol: GitHub Desktop

1. <https://github.com> adresinde bir hesap aç (varsa giriş yap).
2. <https://desktop.github.com> adresinden **GitHub Desktop**’ı kur ve GitHub hesabınla giriş yap.
3. GitHub Desktop’ta **File → Add local repository…** seç ve Charles klasörünü göster
   (ör. `C:\ProjectCharles v0.6.4 Beta`).
4. “This directory does not appear to be a Git repository” uyarısında **create a repository**
   bağlantısına tıkla. Ad: `ProjectCharles`. *Git ignore* ve *License* alanlarını **None** bırak
   (ikisi de klasörde zaten var), **Create repository**’ye bas.
5. Sol altta özet olarak `v0.6.4 Beta` yaz ve **Commit to main**’e bas.
   Sol listede `node_modules`, `models`, `tools` veya `dist` görünmemeli; görünüyorsa dur ve
   `.gitignore` dosyasının klasörde olduğunu kontrol et.
6. Üstteki **Publish repository**’ye bas.
   - Kodun yalnızca sende kalmasını istiyorsan **Keep this code private** işaretli kalsın.
   - Herkese açmak istiyorsan işareti kaldır. `LICENSE` dosyası kodun izinsiz kullanılmasını
     yasaklar; açık depo yalnızca okunabilir demektir.
7. Sonraki sürümlerde: değişiklikleri yap → GitHub Desktop’ta özet yaz → **Commit** →
   **Push origin**.

## Yeni bir sürümü etiketlemek (isteğe bağlı)

GitHub’da depo sayfasında **Releases → Draft a new release** ile `v0.6.4-beta` etiketi açıp,
`scripts/package.py` ile hazırlanan kurulum paketini (Install.cmd + install.ps1 + Charles.zip)
ek olarak yükleyebilirsin. Böylece Node.js kurmak istemeyenler hazır paketi indirir.

## Başkası kaynak koddan nasıl çalıştırır?

```cmd
git clone https://github.com/<kullanıcı-adın>/ProjectCharles.git
cd ProjectCharles
npm ci
npm run setup
npm run build
npm start
```

## Yüklemeden önce son kontrol

- Klasörde kendi eklediğin özel bir not, ekran görüntüsü veya `.env` dosyası var mı?
  `.gitignore` bilinen kişisel dosyaları dışarıda tutar ama yeni eklediğin dosyaları bilemez.
- GitHub Desktop commit ekranında listelenen dosyalara bir göz at; bir dosyanın gitmesini
  istemiyorsan sağ tıklayıp **Ignore file** seçebilirsin.
