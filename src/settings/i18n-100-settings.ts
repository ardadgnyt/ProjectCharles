// v1.0.0: plainer settings pages, WhatsApp status, GitHub draft removed. Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100Settings: Record<string, string> = {
  // the shared connected state (connected-state.ts): the status line's text after "Bağlı · "
  'Modeller kullanıma hazır.': 'Models are ready.',
  // polish D3: a connection check's answer without the "Bağlı · " prefix (providers.cjs)
  'Abacus AI yanıt verdi.': 'Abacus AI answered.',
  'GitHub Copilot yanıt verdi.': 'GitHub Copilot answered.',
  // polish D6: the small word before the automatic effort level in the composer
  Efor: 'Effort',
  // polish: settings texts the language scan found with no row (evren-card.ts, plugins.ts)
  'EVREN sayfası': 'EVREN page',
  'Eski JSON dosyasını içe aktar': 'Import old JSON file',
  'İstemci kimliği ve gizli anahtar, Google Cloud → Google Auth Platform → Clients → Desktop app kaydını oluştururken gösterilir. Google artık JSON dosyası indirtmiyor ve gizli anahtarı sonradan göstermiyor: kaybettiysan istemcide Add secret ile yenisini oluştur. Eski bir JSON dosyan varsa içe aktarabilirsin.':
    'The client ID and client secret are shown when you create the Desktop app client in Google Cloud, under Google Auth Platform, Clients. Google no longer offers a JSON download and does not show the secret again: if you lost it, create a new one with Add secret on the client. If you have an old JSON file, you can import it.',
  // AI Modelleri
  'ChatGPT hesabınla Codex üzerinden bağlan.': 'Connect with your ChatGPT account through Codex.',
  'Google hesabınla Antigravity üzerinden bağlan.': 'Connect with your Google account through Antigravity.',
  'Claude hesabınla Claude Code üzerinden bağlan. Pro veya Max aboneliği gerekir; ücretsiz hesap yetmez.':
    'Connect with your Claude account through Claude Code. It needs a Pro or Max plan; a free account is not enough.',
  'Cursor hesabınla resmi Cursor Agent üzerinden bağlan. Yalnızca sohbet modunda çalışır.':
    'Connect with your Cursor account through the official Cursor Agent. It works in chat mode only.',
  'Abacus AI’ın resmi komut satırı aracıyla bağlan. Araç Charles ile gelmez; Kurulum sayfası’ndaki adımlarla kur, sonra Abacus AI ile giriş’e bas ve açılan pencerede /login yaz. Sohbette salt okunur çalışır.':
    'Connect with the official Abacus AI command line tool. It does not come with Charles: install it with the steps on the Setup page, then press Sign in with Abacus AI and type /login in the window that opens. It is read-only in chat.',
  'Abacus AI bu bilgisayarda bulunamadı. Kurulum sayfası’ndaki adımlarla kur, sonra Bağlantıyı kontrol et’e bas.':
    'Abacus AI was not found on this computer. Install it with the steps on the Setup page, then press Check connection.',
  'Araç kurulu. Giriş yaptıktan sonra Bağlantıyı kontrol et’e bas.':
    'The tool is installed. After signing in, press Check connection.',
  'Giriş penceresi açıldı. /login yazıp hesabınla giriş yap, sonra /exit yaz ve burada Bağlantıyı kontrol et’e bas.':
    'The sign-in window is open. Type /login and sign in with your account, then type /exit and press Check connection here.',
  'EVREN API anahtarınla bağlan. Anahtar bu bilgisayarda Windows şifrelemesiyle saklanır.':
    'Connect with your EVREN API key. The key is stored on this computer with Windows encryption.',
  'Anahtar kayıtlı ama bağlantı doğrulanmadı. Bağlantıyı kontrol et’e bas.':
    'The key is saved but the connection is not verified. Press Check connection.',
  'GitHub hesabınla GitHub Copilot’un komut satırı aracı üzerinden bağlan. Modeller hesabının Copilot planına göre listelenir.':
    'Connect with your GitHub account through the GitHub Copilot command line tool. Models are listed by your account’s Copilot plan.',
  'Anahtar eklenmedi. Kurmak için Charles ile kur’a bas.': 'No key yet. Press Set up with Charles to set it up.',
  'Sesli görüşme için Ayarlar’daki AI Modelleri sayfasında Gemini Live’ı aç.':
    'For voice conversations, turn on Gemini Live on the AI models page in Settings.',
  'Anahtar geçerli, ama EVREN bu hesap için kendi kullanım şartlarının kabulünü istiyor. Metni EVREN kartındaki EVREN şartlarını göster düğmesiyle okuyup kabul edebilirsin.':
    'The key is valid, but EVREN asks this account to accept its terms of use. Read and accept them with the Show EVREN’s terms button on the EVREN card.',
  'Bağlantıyı kontrol et’e bas. Charles, Abacus AI’a kısa bir deneme mesajı gönderir; yanıt gelirse Abacus AI · Otomatik model listesine eklenir.':
    'Press Check connection. Charles sends Abacus AI a short test message; if it answers, Abacus AI · Auto is added to the model list.',
  // Eklentiler
  Bildirimler: 'Notifications',
  'Bağladığın hesapları sohbette de kullanabilirsin, örneğin “Okul maillerimi özetle”.':
    'You can also use your connected accounts in chat, for example “Summarize my school mail”.',
  'Önemi yapay zekâ belirlesin': 'Let the AI decide what is important',
  'Açıkken yeni e-postanın göndereni, konusu ve kısa önizlemesi seçili yapay zekâya gönderilir.':
    'When on, the sender, subject and a short preview of new mail are sent to the selected AI.',
  'Kapalıyken sıralama bu bilgisayarda yapılır: önemli işaretli e-postalar ve bu kelimeleri içerenler adacığın altında baloncuk olarak görünür. Baloncuğa tıklayınca Charles e-postayı anlatır.':
    'When off, sorting happens on this computer: mail marked important and mail with these words shows as a bubble under the island. Click the bubble and Charles explains the mail.',
  'İlk bağlantıda bir defalık uygulama kaydı gerekir; Charles ile kur adım adım gösterir.':
    'The first connection needs a one-time app registration; Set up with Charles shows it step by step.',
  'Sunucu adresi (ör. http://homeassistant.local:8123) ve bir uzun ömürlü erişim token’ı gerekir; token’ı Home Assistant profilinin Güvenlik sekmesinde oluşturabilirsin. Cihazlara Home Assistant’taki adlarıyla seslen.':
    'It needs the server address (e.g. http://homeassistant.local:8123) and a long-lived access token; you can create the token on the Security tab of your Home Assistant profile. Call devices by their names in Home Assistant.',
  'POP3 veya IMAP destekleyen bir e-posta hesabını (okul, iş, kendi alan adın) bağla. Charles yalnızca okur; e-postalar sunucudan silinmez.':
    'Connect any mail account that supports POP3 or IMAP (school, work, your own domain). Charles only reads; mail is not deleted from the server.',
  'Kaydedildi. Bağlantıyı kontrol et ile deneyebilirsin.': 'Saved. You can try it with Check connection.',
  'Uygulama penceresindeki takvim Google Takvim’inle eşitlenir: etkinliklerin ay görünümünde görünür, eklediğin etkinlik Google Takvim’e kaydedilir.':
    'The calendar in the app window syncs with your Google Calendar: your events show in the month view and events you add are saved to Google Calendar.',
  'Etkinlikleri uygulama penceresindeki takvimden ekleyebilirsin.': 'You can add events from the calendar in the app window.',
  'Önce Google hesabını bağla; Google Takvim aynı uygulama kaydını kullanır.':
    'Connect your Google account first; Google Calendar uses the same app registration.',
  'WhatsApp’ı bir kez QR kodla bağla; gelen mesajlar adacığın altında görünür, oradan yanıt verebilirsin. Mesajlar yalnızca bu bilgisayarda, bellekte tutulur.':
    'Link WhatsApp once with a QR code; incoming messages show under the island and you can reply from there. Messages are kept only in memory on this computer.',
  'QR kodu bekleniyor': 'Waiting for the QR code',
  'WhatsApp’ın ayarlarında Bağlı cihazlar’ı açıp Cihaz bağla’ya dokun.':
    'In WhatsApp’s settings, open Linked devices and tap Link a device.',
  'Her satıra bir yanıt (en fazla 8). Adacığın altındaki mesajın yanıt düğmesiyle açılır.':
    'One reply per line (up to 8). They open from the reply button of a message under the island.',
  // Erişim
  'Dosya düzenlemeden ve komut çalıştırmadan önce izin ister.': 'Asks before editing files or running commands.',
  'Proje klasöründe sormadan düzenler; proje dışına veya ağa çıkan her işlem için yine izin ister.':
    'Edits in the project folder without asking; still asks for anything outside the project or on the network.',
  'Charles’ın onayları ve Codex sandbox sınırı kalkar; Windows hesabının erişebildiği dosyalarda ve ağda işlem yapabilir. Windows yönetici izinlerini aşmaz.':
    'Charles’ approvals and the Codex sandbox limit are off; it can work on any file and network your Windows account can reach. It never goes beyond Windows administrator permissions.',
  // Görünüm, notices
  Boyutlar: 'Sizes',
  'Adacık boyutu': 'Island size',
  'Alan eklendi. Ne sormak istersin?': 'Region added. What would you like to ask?',
  'Haftalık özetin hazır; Ayarlar’daki Haftalık özet sayfasında.':
    'Your weekly summary is ready on the Weekly summary page in Settings.',
  // polish D2: places in Charles said as a sentence, no "Ayarlar → …" paths
  'Açılan pencerede girişi tamamla, sonra Devam’a bas. Yardım istersen Ayarlar’daki AI Modelleri sayfasında Charles ile kur’a bas.':
    'Finish signing in in the window that opened, then press Continue. For help, press Set up with Charles on the AI models page in Settings.',
  'Bu açıkken “Hey Charles” dediğinde sesli görüşme başlar. Uyandırma sözü bilgisayarında aranır; açık olduğu sürece mikrofon dinlemede kalır. İstediğin zaman Ayarlar’daki Genel sayfasından kapatabilirsin.':
    'While this is on, saying “Hey Charles” starts a voice conversation. The wake phrase is detected on your computer; the microphone keeps listening while it is on. You can turn it off any time on the General page in Settings.',
  'Bağlı başka bir yapay zekâ yok; Ayarlar’daki AI Modelleri sayfasından ekleyebilirsin.':
    'No other AI is connected; you can add one on the AI models page in Settings.',
  'Google Takvim’e eklemek için Ayarlar’daki Eklentiler sayfasında Google Takvim’i bağla. Şimdilik Charles hatırlatıcısı olarak kaydedilir.':
    'To add it to Google Calendar, connect Google Calendar on the Plugins page in Settings. For now it is saved as a Charles reminder.',
  'Henüz modül yok. Ayarlar’daki Modüller sayfasından bir .zip modül yükleyebilirsin.':
    'No modules yet. You can install a .zip module on the Modules page in Settings.',
  'Yeni anahtar henüz kaydedilmedi. Önce Anahtarı kaydet’e, ardından Bağlantıyı kontrol et’e bas.':
    'The new key is not saved yet. Press Save key first, then Check connection.',
  'Bu modül kapalı. Ayarlar’daki Modüller sayfasından aç.':
    'This module is off. Turn it on from the Modules page in Settings.',
  'Etkinlik eklemek için Ayarlar’daki Eklentiler sayfasında Google Takvim’i bağla.':
    'To add events, connect Google Calendar on the Plugins page in Settings.',
  'EVREN API anahtarı geçersiz veya eksik. Ayarlar’daki AI Modelleri sayfasında EVREN kartından anahtarını kontrol et.':
    'The EVREN API key is invalid or missing. Check your key on the EVREN card of the AI models page in Settings.',
  'Abacus AI komut satırı aracı bulunamadı. Kurduktan sonra Ayarlar’daki AI Modelleri sayfasında Bağlantıyı kontrol et’e bas.':
    'The Abacus AI command line tool was not found. Install it, then press Check connection on the AI models page in Settings.',
};
export const patterns100Settings: [RegExp, (...m: string[]) => string][] = [
  // GPT's status line: "<plan> · Modeller kullanıma hazır."
  [/^(.+) · Modeller kullanıma hazır\.$/, (_, n) => `${n} · Models are ready.`],
  // polish D3: a connection check's answer for a tool without its own row
  [/^(.{1,40}) yanıt verdi\.$/, (_, n) => `${n} answered.`],
];
