# ProjectCharles — Geliştirici Rehberi (DEVELOPMENT)

Sürüm: **v0.6.4 Beta** · Fikir ve yön: **HzPederPan**

Bu belge, Charles'ın kaynak kodunda neyin nerede olduğunu, uygulamanın nasıl çalıştığını ve
bir değişikliğin nasıl derlenip test edileceğini anlatır. Kullanıcı kurulumu için `README.md`,
sürüm geçmişi için `CHANGELOG.md` dosyasına bak.

---

## 1. Ana klasörün düzeni

```
ProjectCharles v0.6.4 Beta/
├── Start-Charles.cmd            Charles'ı mevcut verilerle açar (Node.js gerekmez)
├── setup/                       Kurulum araçları:
│   ├── Install.cmd              Başka bilgisayara kurulum (install.ps1'i çalıştırır)
│   ├── install.ps1              Kurulumun kendisi
│   ├── Create-Desktop-Shortcut.vbs  Masaüstüne kısayol oluşturur
│   └── Reset-Charles.cmd        Yerel ayarları yedekleyip sıfırlar (dikkat: sohbetleri arşivler)
├── README.md                    Kullanıcı rehberi
├── CHANGELOG.md                 Sürüm sürüm yapılan değişiklikler
├── DEVELOPMENT.md               Bu belge
├── .gitignore / .gitattributes  GitHub'a gitmeyecek dosyalar / Windows satır sonları
├── package.json              Uygulama tanımı; "main": app/main.cjs
├── biome.json                Kod biçimlendirme kuralları
│
├── app/                      ANA SÜREÇ (Electron main, Node.js) — bilgisayara erişen taraf
├── src/                      ARAYÜZ KAYNAĞI (TypeScript) — derlenince dist/renderer.js olur
├── public/                   ARAYÜZ VARLIKLARI (HTML, CSS, sesler) — dist/ içine kopyalanır
├── dist/                     ÇALIŞAN ARAYÜZ (derleme çıktısı; elle düzenleme; GitHub'a gitmez)
├── test/                     Otomatik testler (node --test)
├── scripts/                  Derleme / başlatma / kurulum betikleri
├── docs/                     Mimari, eklenti kurulumu, profil soruları
├── licenses/                 Üçüncü taraf lisansları
│
├── node_modules/             Çalışma bileşenleri (Electron, Codex, Claude Code, …)
├── models/                   Yerel Whisper ses modelleri (small + tiny)
└── tools/                    Antigravity (Gemini), Cursor ve Whisper araçları
```

**Kullanıcı verisi bu klasörde DEĞİLDİR.** Sohbetler, ayarlar, hafıza ve hesap bağlantıları
Windows'un uygulama veri klasöründe tutulur: `%APPDATA%\Charles`
(ör. `C:\Users\<kullanıcı>\AppData\Roaming\Charles`). Bkz. bölüm 6.

---

## 2. Uygulama nasıl çalışır (kısa akış)

```
 Windows ── electron.exe ── app/main.cjs  (ana süreç: pencere, IPC, dosya, ağ, alt süreçler)
                               │  ▲
              app/preload.cjs  │  │  yalnızca izin verilen çağrılar (window.charles.*)
                               ▼  │
                         dist/index.html + dist/renderer.js   (arayüz, sandbox içinde)
```

1. `main.cjs` tek pencere açar (şeffaf, çerçevesiz, her zaman üstte) ve `charles://app/`
   protokolüyle **yalnızca `dist/`** içindeki dosyaları sunar.
2. Arayüz Node.js'e doğrudan erişemez. Her işlem `preload.cjs` içindeki bir fonksiyonla
   `ipcMain.handle` ucuna gider. Uçlar `safeHandler` ile tanımlıdır ve gönderen pencereyi doğrular.
3. Sohbet: GPT modelleri için `app/ai/agent.cjs` yerel Codex app-server'ı başlatır;
   Gemini / Claude / Cursor için `app/ai/providers.cjs` ilgili aboneliğin CLI aracını çalıştırır.
4. Mesaj göndermeden önce `main.cjs` → `safeHandler('send')` bazı istekleri **yerelde** yanıtlar
   (Spotify, uygulama açma, hava durumu, eklenti komutları, hafıza). Diğerleri yapay zekâya gider.

---

## 3. `app/` — ana süreç modülleri

| Klasör | Ne yapar | Önemli dosyalar |
| --- | --- | --- |
| `app/` (kök) | Giriş noktaları | `main.cjs` (pencere, yerleşim, IPC uçları), `preload.cjs` (arayüz köprüsü) |
| `app/core/` | Temel altyapı | `store.cjs` (güvenli JSON kaydı), `policy.cjs` (Codex izinleri), `layout.cjs` (panel ölçüleri), `preferences.cjs`, `shortcuts.cjs`, `startup.cjs`, `extras.cjs` (görünüm tercihleri + ekler), `desktop-pet.cjs`, `task-mode.cjs`, **`proposals.cjs`** (Charles’ın sohbette düğmeli soruları) |
| `app/ai/` | Yapay zekâ ve sohbetler | `agent.cjs` + `rpc.cjs` (Codex), `providers.cjs` (Gemini/Claude/Cursor), **`provider-tools.cjs`** (proje modunda erişim ayarına göre araç izinleri; izin atlatma modu yok), `sessions.cjs` (sohbet geçmişi), `chat-folders.cjs`, `chat-classifier.cjs`, `ask-once.cjs` (arka plan tek soru), `chat-actions.cjs`, `conversation-tools.cjs` |
| `app/usage/` | Adacıktaki kalan kullanım | `codex-usage.cjs`, `gemini-usage.cjs`, `claude-usage.cjs` |
| `app/plugins/` | Hesaplar ve bildirimler | `plugins.cjs` (Gmail, Outlook, takvim, Drive, okul e-postası, Home Assistant), `pop3.cjs`, `plugin-commands.cjs`, `oauth-setup.cjs`, **`mail-triage.cjs`** (önem değerlendirme), **`mail-alerts.cjs`** (akış), **`mail-bubble.cjs`** + `bubble-preload.cjs` (adacık baloncukları), **`deadlines.cjs`** (e-postadaki tarihler → hatırlatma + .ics) |
| `app/voice/` | Ses | `voice.cjs` + `voice.ps1` (Whisper, Windows sesi), `gemini-live.cjs`, `live-computer.cjs`, `live-plugins.cjs`, `wake-profile.cjs` |
| `app/personal/` | Kişisel veriler | `personal.cjs` (hafıza, hatırlatıcı, görünüm, erişim), `memory.cjs`, `profile-transfer.cjs`, `creator-profile.cjs`, `companion.cjs`, `weather.cjs`, `weather-chat.cjs` |
| `app/system/` | Windows ile çalışan parçalar | `desktop.cjs` + `.ps1` (uygulama açma, Spotify), `media-worker.*`, `performance.*`, **`watchdog.cjs`** (sistem nöbetçisi: CPU/RAM/disk → Slime terler), `foreground.*`, `computer-time.cjs`, `weekly.cjs`, `capture.cjs` (ekrandan alan seçme) |
| `app/files/` | Dosyalar | `library.cjs` (seçili klasörlerde arama), `docx.cjs`, `pdf-text.cjs` |

Her dosyanın ilk satırında ne işe yaradığını anlatan kısa bir açıklama vardır.

**Kural:** `.ps1` yardımcıları, onları çalıştıran `.cjs` ile aynı klasörde durur
(`path.join(__dirname, 'x.ps1')` ile okunur). Birini taşırsan diğerini de taşı.

---

## 4. `src/` — arayüz (TypeScript)

| Klasör | Ne yapar |
| --- | --- |
| `src/renderer.ts` | Arayüzün giriş noktası: sohbet akışı, gönderme, onaylar, karakter tepkileri |
| `src/chat/` | Mesajlar: `markdown.ts` (güvenli markdown, `html: false`), `model-picker.ts`, `history-folders.ts`, `activity.ts`, `reactions.ts`, `reading.ts`, `status-scroll.ts` |
| `src/island/` | Küçük adacık ve Slime: `usage.ts` (kalan kullanım halkaları), `panel-motion.ts` (büyüme/küçülme animasyonu), `companion.ts` (yerleşim, hava durumu), `desktop-pet.ts`, `wardrobe.ts`, `animation-loop.ts` |
| `src/settings/` | Ayarlar sayfaları: `settings-pages.ts`, `settings-cards.ts`, `providers.ts`, `plugins.ts`, `plugin-guide.ts`, `shortcuts.ts`, `personal.ts`, `extras.ts`, `workspace.ts`, `profile-transfer.ts`, `i18n.ts` |
| `src/voice/` | Ses arayüzü: `voice.ts`, `wake.ts`, `wake-training.ts`, `gemini-live.ts` |
| `src/ui/` | Ortak yardımcılar |
| `src/vendor/` | Slime karakter motoru, aksesuarlar, sesler ve animasyon yardımcıları (lisans: THIRD-PARTY-NOTICES.md) |

---

## 5. `public/` — HTML ve stiller

| Dosya | Görev |
| --- | --- |
| `index.html` | Ana pencerenin iskeleti |
| `bubble.html/.css/.js` | Önemli e-posta baloncukları (ayrı küçük pencere) |
| `capture.html/.css/.js` | Ekrandan alan seçme katmanı |
| `styles/1-base.css` | Temel yerleşim ve bileşenler |
| `styles/2-panel-layout.css` | Panel yerleşimi, ayarlar, kenara yaslama |
| `styles/3-island.css` | Küçük adacık, kullanım halkaları, masaüstü Slime |
| `styles/4-polish.css` | Kart tasarımı ve ince ayarlar |
| `styles/5-design-system.css` | **Tasarım sistemi**: renk değişkenleri (`--sb-*`), yüzeyler, odak, hareket |
| `styles/6-acrylic.css` | **Akrilik tema** (v0.5.5): cam yüzeyler (`--ac-*`), görsel oluşturma kartı |

Stiller sırayla yüklenir; sonraki dosya öncekini ezer. **Yeni görsel değişiklikleri
`6-acrylic.css` içine yaz**, renkleri `5-design-system.css` (`--sb-*`) ve `6-acrylic.css`
(`--ac-*`) içindeki `:root` değişkenlerinden al.

---

## 6. Kullanıcı verisi (`%APPDATA%\Charles`)

| Dosya / klasör | İçerik |
| --- | --- |
| `charles-history.json` (+ `.bak`) | Sohbet geçmişi, klasörler, düzenleme dalları |
| `personal.json` | Hafıza, hatırlatıcılar, görünüm, erişim modu |
| `companion.json` | Şehir, yerleşim tarafı, öneri tercihleri |
| `display.json` | Ekran, otomatik kapanma, varsayılan model |
| `plugins.enc.json` | Eklenti hesapları — **Windows ile şifreli** (DPAPI; başka bilgisayarda açılmaz, yeniden bağlanmak gerekir) |
| `gemini-live.enc.json` | Gemini Live API anahtarı — şifreli |
| `providers/` | Gemini / Claude / Cursor oturumları, `enabled.json` (ana yapay zekâ) |
| `computer-time.json`, `weekly.json`, `resource-history.sqlite` | Kullanım istatistikleri |

Uygulama adı `app.setName('Charles')` ile sabittir; bu yüzden **her Charles sürümü aynı veriyi
kullanır**. Klasör yoksa ilk açılışta oluşturulur. Aynı anda yalnızca bir Charles çalışabilir
(tek örnek kilidi), böylece iki sürüm aynı dosyaya birlikte yazmaz.

Kayıtlar `app/core/store.cjs` ile yazılır: önce `.tmp`, diske zorla yazma (fsync), sonra
yeniden adlandırma; bozulan dosya silinmez, `.corrupt-…` olarak kenara alınır.

---

## 7. Önemli akışlar

### Kalan kullanım (adacık)
`src/island/usage.ts` seçili modelin sağlayıcısını izler ve `usageRead(force, provider)` ile
sorar. Her istek bir sıra numarası taşır; kullanıcı bu arada sağlayıcı değiştirdiyse eski yanıt
atılır. Ana süreç tarafı: `main.cjs` → `safeHandler('usage-read')`:
- **Codex** → çalışan app-server'dan (`agent.usage()`), 60 sn'de bir
- **Claude** → `app/usage/claude-usage.cjs`: Claude Code'un kendi oturumuyla
  `https://api.anthropic.com/api/oauth/usage` (5 saatlik + haftalık pencere), 5 dk'da bir
- **Gemini** → Antigravity `/usage` (yalnızca açılışta, sağlayıcı değişince ve ↻ ile)

### Önemli e-posta baloncukları
```
plugins.poll() (5 dk)  →  yeni okunmamış e-postalar  →  mail-alerts.mail()
   → mail-triage.triageMail()  (tek AI isteği; AI yoksa işaret + anahtar kelime kuralları)
   → mail-bubble.add()  →  adacığın altında baloncuk (ayrı pencere, odak çalmaz)
   → tıklama  →  e-postanın tam metni ek dosya olur  →  arayüze 'mail-explain'
   → renderer.ts mesajı gönderir, Charles e-postayı anlatır
```
Takvim hatırlatmaları da aynı baloncuklarda görünür. Windows bildirimi yalnızca kişisel
hatırlatıcılar için kullanılır.

### Panel animasyonu
`app/main.cjs` → `position()` hedef ölçüyü hesaplar ve `ui-layout` olayı gönderir.
`src/island/panel-motion.ts` gövdeyi son ölçüye getirip eski ölçüden ölçekler. Ortadaki panel
`translateX(-50%)` ile, kenara yaslı panel dönüşümsüz çizilir. Fare alanı (`visibleBounds`)
aynı kurala göre hesaplanır; bunlardan biri değişirse diğeri de değişmelidir.

---

## 8. Geliştirme

Gerekenler: **Node.js 24** (yalnızca geliştirme için; kullanıcı paketi Node istemez).

```bat
npm.cmd ci                  :: bağımlılıklar (ilk kez)
npm.cmd run build           :: public/ → dist/ kopyala + src/ → dist/renderer.js derle
npm.cmd test                :: tüm otomatik testler
npm.cmd run dev             :: derle ve Electron ile aç
```

Biçimlendirme (isteğe bağlı): `npx @biomejs/biome format --write app src test scripts`
(kurallar `biome.json` içinde: 2 boşluk, 100 karakter satır, tek tırnak).

### Yeni bir özellik eklerken
1. Ana süreç kodunu uygun `app/<alan>/` klasörüne koy; ilk satıra kısa açıklama yaz.
2. Arayüzün çağıracağı ucu `main.cjs` içinde `safeHandler('ad', …)` ile aç,
   `preload.cjs` içine `ad: (...) => invoke('ad', ...)` ekle.
3. Arayüz kodunu `src/<alan>/` altına koy ve `src/renderer.ts` içinden çağır.
4. Görünümü `public/styles/6-acrylic.css` içine yaz.
5. `test/` altına test ekle, `npm.cmd test` ve `npm.cmd run build` çalıştır.

### Güvenlik kuralları (değiştirme)
- Arayüz penceresinde `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Yapay zekâ yanıtları ve e-posta içerikleri HTML olarak değil, metin olarak işlenir.
- Hesap anahtarları yalnızca `safeStorage` (Windows şifreleme) ile kaydedilir.
- Gemini / Claude / Cursor sohbet bağlantıları araçsız (salt sohbet) modda çalışır.

---

## 9. Paket hazırlama

Kullanıcıya verilecek klasör: bu klasörün tamamı. ZIP'ten çıkarılınca
`Start-Charles.cmd` ile açılır. `test/`, `src/`, `scripts/` olmadan da çalışır;
bunlar geliştirme içindir.
