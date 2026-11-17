import { english0922, patterns0922 } from './i18n-0922';
import { english0925, patterns0925 } from './i18n-0925';
import { english0926, patterns0926 } from './i18n-0926';
import { english0927, patterns0927 } from './i18n-0927';
import { english100Panel, patterns100Panel } from './i18n-100-panel';
import { english100Picker, patterns100Picker } from './i18n-100-picker';
import { english100Summary, patterns100Summary } from './i18n-100-summary';
import { english100Settings, patterns100Settings } from './i18n-100-settings';
import { english100Core, patterns100Core } from './i18n-100-core';
import { english100DShelf, patterns100DShelf } from './i18n-100-dshelf';
import { english100DChat, patterns100DChat } from './i18n-100-dchat';
import { english100DTour, patterns100DTour } from './i18n-100-dtour';
import { english101, patterns101 } from './i18n-101';
import { english063, englishPatterns } from './i18n-063';
import { english070 } from './i18n-070';
import { english071 } from './i18n-071';
import { englishSpecial, specialPatterns } from './i18n-special';
import { english072, patterns072 } from './i18n-072';
import { english077, patterns077 } from './i18n-077';
import { english080, patterns080 } from './i18n-080';
import { english085, patterns085 } from './i18n-085';
import { english087, patterns087 } from './i18n-087';
import { english088, patterns088 } from './i18n-088';
import { english089 } from './i18n-089';
import { english0810, patterns0810 } from './i18n-0810';
import { english0811 } from './i18n-0811';
import { english0814 } from './i18n-0814';
import { english0815 } from './i18n-0815';
import { english092, patterns092 } from './i18n-092';
import { english096, patterns096 } from './i18n-096';
import { english0913, patterns0913 } from './i18n-0913';
import { english0914, patterns0914 } from './i18n-0914';
import { english0915 } from './i18n-0915';
import { english0916 } from './i18n-0916';
import { english0918 } from './i18n-0918';
import { english0919 } from './i18n-0919';
import { german } from './lang/de';
import { french } from './lang/fr';
import { spanish } from './lang/es';
import { chinese } from './lang/zh';
const english: Record<string, string> = {
  Ayarlar: 'Settings',
  Genel: 'General',
  Hesap: 'Account',
  Görünüm: 'Appearance',
  Hafıza: 'Memory',
  Erişim: 'Access',
  Eklentiler: 'Plugins',
  Bağlantılar: 'Connections',
  Kısayollar: 'Shortcuts',
  'Haftalık özet': 'Weekly summary',
  Performans: 'Performance',
  Sohbet: 'Chat',
  SOHBET: 'CHAT',
  'Charles’a bir şey sor…': 'Ask Charles…',
  'Aklında ne var?': 'What’s on your mind?',
  'Sohbet edelim': 'Let’s chat',
  'Birlikte planlayalım': 'Let’s plan',
  Gönder: 'Send',
  'Yanıtı durdur': 'Stop response',
  'Dikte et': 'Dictate',
  'Dikteyi bitir': 'Finish dictation',
  'Sesli görüşme': 'Voice conversation',
  'Sesli görüşmeyi bitir': 'End voice conversation',
  'Sesli görüşme açık': 'Voice conversation active',
  '◉ Sesli görüşme açık': '◉ Voice conversation active',
  '◉ Sesli görüşme · İşlem yapılıyor': '◉ Voice conversation · Working',
  '◉ Sesli görüşme · Bağlanıyor': '◉ Voice conversation · Connecting',
  'Düşünme ve işlem adımları': 'Thinking and activity',
  'İşlem ayrıntıları': 'Activity details',
  'Görsel oluşturuluyor…': 'Creating image…',
  Kaydet: 'Save',
  Kapat: 'Close',
  Vazgeç: 'Cancel',
  Sil: 'Delete',
  Yenile: 'Refresh',
  'Varsayılana dön': 'Reset to default',
  'Büyük': 'Large',
  'Bağlı değil': 'Not connected',
  'Bağlantı kayıtlı': 'Connection saved',
  'Giriş yapılmadı': 'Not signed in',
  'Bağlantıyı kontrol et': 'Check connection',
  'Hesaba bağlan': 'Connect account',
  'Bağlantıyı kaldır': 'Disconnect',
  'Kaydedildi.': 'Saved.',
  Arama: 'Search',
  'Sonuç yok.': 'No results.',
  Başlangıç: 'Startup',
  'Windows açılınca başlat': 'Start with Windows',
  'Ayarları kaydet': 'Save settings',
  Sesler: 'Sounds',
  'Panel davranışı ve sesler': 'Panel behavior and sounds',
  'Yanıtları sesli oku': 'Read responses aloud',
  'Hava durumu': 'Weather',
  'Konum seç': 'Choose location',
  'Şimdilik geç': 'Skip for now',
  'GPT hesabı': 'GPT account',
  'Antigravity hesabı': 'Antigravity account',
  'Claude hesabı': 'Claude account',
  'Cursor hesabı': 'Cursor account',
  'ChatGPT ile giriş': 'Sign in with ChatGPT',
  'Codex’e bağlan': 'Connect to Codex',
  "Codex'e bağlan": 'Connect to Codex',
  'Antigravity ile giriş': 'Sign in with Antigravity',
  'Claude ile giriş': 'Sign in with Claude',
  'Cursor ile giriş': 'Sign in with Cursor',
  'Hesap kontrol ediliyor…': 'Checking account…',
  'Giriş bekleniyor': 'Waiting for sign-in',
  'Anahtarı sil': 'Delete key',
  'Gemini Live sesi': 'Gemini Live voice',
  'Gemini varsayılanı': 'Gemini default',
  'Gemini Live · sesli görüşme': 'Gemini Live · voice conversation',
  'Gemini API anahtarı': 'Gemini API key',
  'Mikrofon düğmesinde Gemini Live kullan': 'Enable Gemini Live voice conversations',
  'Projem Free Tier; faturalandırması kapalı': 'My project uses Free Tier; billing is disabled',
  'Hey Charles diyerek sesli görüşmeyi başlat': 'Start a voice conversation with Hey Charles',
  'Hey Charles eğitimi': 'Hey Charles training',
  'Eğitimi başlat': 'Start training',
  'Sonraki örneği kaydet': 'Record next sample',
  'Algılamayı test et': 'Test detection',
  'Eğitimi sıfırla': 'Reset training',
  'Şimdi “Hey Charles” söyle…': 'Say “Hey Charles” now…',
  'Kayıt inceleniyor…': 'Analyzing recording…',
  'Eğitim kaydedildi. Algılamayı test edebilirsin.': 'Training saved. You can test detection now.',
  'Eğitim sıfırlandı.': 'Training reset.',
  'Üç kez “Hey Charles” söyle. Her kayıt 3 saniye sürer. Ses yerel olarak işlenir; kayıtlar eğitim sonunda tutulmaz. Bu özellik ses kimliği doğrulaması yapmaz.':
    'Say “Hey Charles” three times. Each recording lasts 3 seconds and is processed locally. Audio is not retained. This is not voice identity verification.',
  'Mikrofon seviyesi': 'Microphone level',
  'Hey Charles için mikrofon dinleniyor · yerel': 'Listening for Hey Charles · local',
  'Uyandırma dinlemesi beklemede.': 'Wake listening paused.',
  Kapalı: 'Off',
  'Sohbeti aç': 'Open chat',
  'Uyarıya atla': 'Jump to alert',
  'Son terminal işlemi': 'Latest terminal activity',
  'Sonraki sohbet': 'Next chat',
  'Önceki sohbet': 'Previous chat',
  'Slime’ı masaüstüne gönder': 'Move Slime to desktop',
  Gardırop: 'Wardrobe',
  'Ekrandan alan seç': 'Capture screen region',
  'Kısayolları kaydet': 'Save shortcuts',
  'Kısayollar herhangi bir uygulamadayken çalışır.': 'Shortcuts work from any application.',
  'Geçen hafta': 'Last week',
  'Çalışma süresi': 'Active task time',
  Oturumlar: 'Sessions',
  İşlemler: 'Tasks',
  Dosyalar: 'Files',
  'Eklenen satır': 'Lines added',
  'Silinen satır': 'Lines removed',
  Komutlar: 'Commands',
  'İzin istekleri': 'Approval requests',
  Proje: 'Project',
  'En yoğun gün': 'Busiest day',
  'Charles açıkken kaydedilen işlemler kullanılır. Pazartesi 09.00’da veya sonraki açılışta gösterilir. Süre, isteklerin çalıştığı süredir; bilgisayar başında geçirilen toplam süre değildir.':
    'Uses activity recorded while Charles is running. Shown Monday at 09:00 or on the next launch. Time measures running tasks, not your total time at the computer.',
  Renkler: 'Colors',
  'GPT etiketi': 'GPT badge',
  'Gönder düğmesi': 'Send button',
  'Senin mesajların': 'Your messages',
  'Charles’ın mesajları': 'Charles messages',
  'Renkleri kaydet': 'Save colors',
  'Renkler kaydedildi.': 'Colors saved.',
  'Slime stüdyosu': 'Slime studio',
  'Slime aksesuarı': 'Slime accessory',
  'Aksesuar yok': 'No accessory',
  'Parti şapkası': 'Party hat',
  Bere: 'Beanie',
  Taç: 'Crown',
  'Güneş gözlüğü': 'Sunglasses',
  'Yuvarlak gözlük': 'Round glasses',
  Fiyonk: 'Bow',
  Atkı: 'Scarf',
  'Cadı şapkası': 'Witch hat',
  Balkabağı: 'Pumpkin',
  'Yılbaşı şapkası': 'Santa hat',
  'Tavşan kulakları': 'Bunny ears',
  'Onay iste': 'Ask for approval',
  'Benim için onayla': 'Approve for me',
  'Tam erişim': 'Full access',
  'Fotoğraf ve dosya ekle': 'Add photos and files',
  'Görsel oluştur': 'Create image',
  'Web’de arama': 'Search the web',
  'Derin araştırma': 'Deep research',
  'Ekle ve araçlar': 'Add and tools',
  'Kaynak kullanım geçmişi': 'Resource usage history',
  'Uygulama kullanımını kaydet': 'Record resource usage',
  'Kullanım geçmişini temizle': 'Clear usage history',
  'Evet, kayıtları sil': 'Yes, delete records',
  'Mail, takvim ve Drive bağlantıları salt okunurdur. Hesap bilgileri Windows şifrelemesiyle saklanır. Gelen içerikler kendi başına komut çalıştırmaz.':
    'Mail, calendar and Drive connections are read-only. Credentials use Windows encryption. Incoming content cannot run commands on its own.',
  'Önemli kelimeler': 'Important keywords',
  'Bildirimleri kaydet': 'Save notifications',
  'Charles’a sor': 'Ask Charles',
  Uygula: 'Apply',
  'IMAP sunucusu': 'IMAP server',
  'TLS portu': 'TLS port',
  'Şifre / uygulama şifresi': 'Password / app password',
  'Okul e-postası': 'School email',
  'Okul e-postası · IMAP': 'School email · IMAP',
  'Tarayıcıda girişini tamamla…': 'Finish signing in in your browser…',
  'Kayıtlı · değiştirmek için gir': 'Saved · enter a replacement',
  'Charles açıkken 5 dakikada bir kontrol edilir. İlk kontrol bildirim göndermez. Önem etiketi veya bu kelimeler eşleşirse bildirim gelir; yeni takvim olayları da bildirilir.':
    'Checked every 5 minutes while Charles is running. The first check establishes a baseline. Important flags, keyword matches and new calendar events trigger notifications.',
  'Bağlantı başarılı. Gemini Live sesli görüşmeye hazır.':
    'Connection successful. Gemini Live is ready.',
  'Sesi durdur': 'Stop audio',
  'Konuşman bilgisayarında yazıya çevriliyor…': 'Transcribing locally…',
  'Mikrofon hazırlanıyor…': 'Preparing microphone…',
  'Sohbet geçmişi': 'Chat history',
  Geçmiş: 'History',
  Servisler: 'Services',
  'Takibi duraklat': 'Pause monitoring',
  Otomatik: 'Auto',
  'Yerel uygulama': 'Local app',
  Önizleme: 'Preview',
  'Sola taşı veya ortaya dön': 'Move left or return to center',
  'Sağa taşı veya ortaya dön': 'Move right or return to center',
};
Object.assign(english, {
  Türkçe: 'Türkçe',
  'Aktif uygulamaya göre\n              öneriler': 'Suggestions based on active app',
  'Seyrek AI önerileri': 'Occasional AI suggestions',
  'Hava durumu şehrini seç': 'Choose weather city',
  'Şehir seçilmedi': 'No city selected',
  'Windows açılınca\n            başlat': 'Start with Windows',
  'Kullanılmadığında\n                  üst kenara gizlen': 'Hide at the top when idle',
  'Fare uzaklaşınca\n                  paneli küçült': 'Collapse when the pointer moves away',
  'Faremin olduğu ekran': 'Screen with my pointer',
  'Alan seç · Ctrl+Shift+S': 'Capture region · Ctrl+Shift+S',
  'Uyandırma sözü bilgisayarında aranır. Özellik açıkken mikrofon dinlemede kalır. “Hey Charles” dedikten sonra panelin açılmasını bekleyip konuş. Gemini Live seçiliyse sonraki görüşme Google’a gönderilir.':
    'The wake phrase is detected locally. Your microphone remains active while enabled. Say Hey Charles, wait for the panel, then speak. The following Gemini Live conversation is sent to Google.',
  'ChatGPT hesabınla Codex üzerinden bağlan. Giriş tamamlandığında GPT modelleri mesaj kutusundaki model listesine eklenir.':
    'Connect your ChatGPT account through Codex. GPT models appear in the model list after sign-in.',
  'Google hesabınla Antigravity üzerinden bağlan. Açılan pencerede Google OAuth seç. Gemini Live API bağlantısı ayrıdır.':
    'Connect your Google account through Antigravity. Choose Google OAuth in the sign-in window. Gemini Live uses a separate API connection.',
  'Claude hesabınla Claude Code üzerinden bağlan. Claude Code erişimi olan bir abonelik gerekir; ücretsiz web hesabı bu erişimi sağlamaz.':
    'Connect through Claude Code. A plan with Claude Code access is required; a free web account does not provide this access.',
  'Cursor hesabınla resmi Cursor Agent üzerinden bağlan. Bağlantı sohbet modunda çalışır.':
    'Connect your Cursor account through the official Cursor Agent. This connection supports chat.',
  'Sohbet etmek için proje seçmen gerekmiyor.': 'You do not need a project to chat.',
  'Mikrofonla doğrudan Gemini ile konuş. Ses Google’a gönderilir; bilgisayar işlemleri bağlı GPT/Codex hesabına mevcut izin ayarlarınla aktarılır; ücretsiz katmanda içerik ürün geliştirmek için kullanılabilir. Faturalandırması kapalı Free Tier projesi kullan. Anahtarın planı Charles tarafından doğrulanamaz.':
    'Talk directly to Gemini. Audio is sent to Google; computer actions go to your connected GPT/Codex account with your selected permissions. Free-tier content may be used to improve products. Use a Free Tier project with billing disabled. Charles cannot verify your billing plan.',
  'Kore · Kararlı': 'Kore · Firm',
  'Orus · Kararlı': 'Orus · Firm',
  'Laomedeia · Neşeli': 'Laomedeia · Upbeat',
  'Sadachbia · Canlı': 'Sadachbia · Lively',
  'Puck · Neşeli': 'Puck · Upbeat',
  'Fenrir · Heyecanlı': 'Fenrir · Excitable',
  'Algieba · Akıcı': 'Algieba · Smooth',
  'Algenib · Pürüzlü': 'Algenib · Gravelly',
  'Achernar · Yumuşak': 'Achernar · Soft',
  'Zubenelgenubi · Gündelik': 'Zubenelgenubi · Casual',
  'Charon · Anlatıcı': 'Charon · Informative',
  'Leda · Genç': 'Leda · Youthful',
  'Despina · Akıcı': 'Despina · Smooth',
  'Rasalgethi · Anlatıcı': 'Rasalgethi · Informative',
  'Alnilam · Kararlı': 'Alnilam · Firm',
  'Sulafat · Sıcak': 'Sulafat · Warm',
  'Anahtar eklenmedi. Mevcut yerel ses kullanılacak.':
    'No API key saved. Local dictation is available.',
  Tamamlandı: 'Completed',
  Yazı: 'Text',
  Saydamlık: 'Opacity',
  'Ana ekran · Windows ana ekranı': 'Main screen · Windows primary display',
  'Faremin olduğu ekran · Açılışta ve ekran değişiminde':
    'Pointer screen · At startup and when displays change',
  'Ekranları yenile': 'Refresh displays',
  'Her kullanıcı kendi ChatGPT hesabından bir özet alır. Otomatik eşitleme yapılmaz. Bilgiler bu Windows kullanıcısının Charles hafızasına kaydedilir; ChatGPT hesabını değiştirmek bu yerel kayıtları otomatik değiştirmez.':
    'Each user obtains a summary from their own ChatGPT account. There is no automatic sync. The imported information is saved for this Windows user; switching ChatGPT accounts does not change the local memory.',
  'Aşağıdaki paketi kopyalayıp kendi ChatGPT sohbetine yapıştır. Yanıtın tamamını al. Charles kendiliğinden mesaj göndermez.':
    'Copy the questionnaire into your own ChatGPT chat and copy the entire response back. Charles does not send the message automatically.',
  '2 · Yanıtı buraya yapıştır': '2 · Paste the response here',
  '3 · Kaydedilecekleri seç ve düzenle': '3 · Select and edit what to save',
  'Yalnızca seçtiğin bölümler kaydedilir. Yanlış veya eski bilgileri düzelt. Bilgilerin sonraki Charles mesajlarında modelle paylaşılır. Mevcut hafızayı Ayarlar → Hafıza’dan düzenleyebilir veya silebilirsin.':
    'Only selected sections are saved. Correct outdated or inaccurate information. Saved context is shared with the model in future messages. Edit or remove it in Settings → Memory.',
  'Seçtiklerimi hafızaya ekle': 'Add selected sections to memory',
  'Taslağı temizle': 'Clear draft',
  'Yalnızca eklediğin bilgiler saklanır ve yanıt hazırlarken\n              kullanılır. Sohbette “Bunu hatırla: …” da yazabilirsin.':
    'Only information you add is stored and used for responses. You can also say “Remember this: …” in chat.',
  'Hafıza özeti içe aktar': 'Import memory summary',
  'ChatGPT web hafızası otomatik eşitlenmez. Kendi metin özetini içe\n              aktar, inceleyip Kaydet.':
    'ChatGPT web memory does not sync automatically. Import your text summary, review it and save.',
  'Erişim ve onaylar': 'Access and approvals',
  "Onay iste: dosya ve komut izinlerini sorar. Benim için onayla:\n              proje klasöründe sormadan düzenleme yapar; proje dışına veya\n              ağa çıkan her istek için yine onayını sorar. Tam erişim: Charles'ın\n              dosya/komut onayları ve Codex sandbox sınırı kaldırılır; mevcut\n              Windows hesabının erişebildiği dosyalarda ve ağda işlem yapabilir.\n              Windows yönetici izinlerini aşmaz.":
    'Ask for approval: asks about file and command permissions. Approve for me: edits inside the project folder without asking, and still asks you about anything that leaves the project or uses the network. Full access: removes Charles file/command approval prompts and the Codex sandbox boundary, within the permissions of your Windows account. It does not bypass Windows administrator permissions.',
  'Anahtarlar Windows şifrelemesiyle saklanır. Kartlar açık panelde\n                60 saniyede bir yenilenir.':
    'Keys are protected with Windows encryption. Cards refresh every 60 seconds while the panel is open.',
  'Bağlantı kurulmadı': 'Not connected',
  'Charles açıkken yaklaşık dakikada bir CPU, RAM ve erişilebilen GPU verileri bu bilgisayara kaydedilir. Geçmiş 8 gün tutulur. Kaydın öncesi görülemez.':
    'Records CPU, RAM and available GPU statistics about once a minute while Charles is running. History is kept for 8 days. Earlier activity is unavailable.',
  'Henüz örnek yok. İzleme açıksa ilk iki ölçümden sonra kayıt oluşur.':
    'No samples yet. With monitoring enabled, history appears after the first two readings.',
});
Object.assign(english, {
  'Charles ile kur': 'Set up with Charles',
  'Google ile giriş yap': 'Sign in with Google',
  'Microsoft ile giriş yap': 'Sign in with Microsoft',
  'Bağlantı ayarları': 'Connection settings',
  'Bağlantı ayarlarını kaydet': 'Save connection settings',
  'Google JSON dosyasını içe aktar': 'Import Google JSON file',
  'Google JSON dosyasını seç': 'Select Google JSON file',
  'Hesap bağlı': 'Account connected',
  'Tuşları kaydet': 'Record keys',
  'Tuşlara bas…': 'Press your shortcut…',
  Atanmadı: 'Not assigned',
  Kaldır: 'Remove',
  Geri: 'Back',
  Sonraki: 'Next',
  'Daha sonra': 'Later',
  'Kurulumu bitir': 'Finish setup',
  'Google OAuth istemci kimliği': 'Google OAuth client ID',
  'Google masaüstü istemci gizli anahtarı': 'Google desktop client secret',
  'Home Assistant sunucu adresi': 'Home Assistant server URL',
  'Uzun ömürlü erişim token’ı': 'Long-lived access token',
  '1 · Google Cloud projesi': '1 · Google Cloud project',
  '2 · Gmail erişimi': '2 · Gmail access',
  '3 · Takvim erişimi': '3 · Calendar access',
  '4 · Drive erişimi': '4 · Drive access',
  '6 · Masaüstü uygulaması': '6 · Desktop application',
  '1 · Microsoft uygulama kaydı': '1 · Microsoft app registration',
  '2 · Hesap türü': '2 · Account type',
  'İlk bağlantıda bir defalık uygulama kaydı gerekir. Charles adım adım yardımcı olur. Sonraki girişlerde doğrudan hesabını seçebilirsin.':
    'The first connection requires a one-time app registration. Charles guides you through it. Later sign-ins go straight to account selection.',
  'Hesaplarını burada bağla. Mail okumak veya özetlemek için sohbetten ya da sesli görüşmeden iste. Örneğin: “Okul maillerimi özetle”.':
    'Connect accounts here. Ask in chat or voice to read or summarize mail, for example: “Summarize my school mail”.',
  'Kaydet düğmesine tıkla, ardından kısayol tuşlarına birlikte bas. Esc ile vazgeç.':
    'Click Record keys, then press the shortcut together. Press Esc to cancel.',
});
Object.assign(english, english063, english070, english071, englishSpecial, english072, english077, english080, english085, english087, english088, english089, english0810, english0811, english0814, english0815, english092, english096, english0913, english0914, english0915, english0916, english0918, english0919, english0922, english0925, english0926, english0927, english100Core, english100Settings, english100Summary, english100Picker, english100Panel, english100DShelf, english100DChat, english100DTour, english101);

// v0.6.3: look-up that ignores line breaks/indentation from the HTML, then the patterns
// (texts with numbers or names inside).
const collapsed = new Map<string, string>();
for (const [k, v] of Object.entries(english)) collapsed.set(k.replace(/\s+/g, ' ').trim(), v);
const allPatterns = [...englishPatterns, ...specialPatterns, ...patterns072, ...patterns077, ...patterns080, ...patterns085, ...patterns087, ...patterns088, ...patterns0810, ...patterns092, ...patterns096, ...patterns0913, ...patterns0914, ...patterns0922, ...patterns0925, ...patterns0926, ...patterns0927, ...patterns100Core, ...patterns100Settings, ...patterns100Summary, ...patterns100Picker, ...patterns100Panel, ...patterns100DShelf, ...patterns100DChat, ...patterns100DTour, ...patterns101];
// v0.9.22: a pattern is a short interface text with a number or a name in it. Without this limit
// every line of a command's output went through all of them.
const PATTERN_MAX = 600;
const patternResults = new Map<string, string | undefined>();
// v1.0.0: what a pattern made, as a template for the other languages: the English with {a}, {b}, …
// where the captured parts go, and those parts (still Turkish). "Klasör: X" →
// "Folder: {a}" + ['X'].
type PatternMade = { template: string; parts: string[] };
const patternMade = new Map<string, PatternMade | undefined>();
const SLOTS = 'abcdefgh';
function templateOf(fn: (...m: string[]) => string, m: string[]): PatternMade | undefined {
  if (m.length < 2 || m.length > SLOTS.length + 1) return undefined;
  try {
    // a group the match left out (an optional part) stays undefined, so the pattern's function
    // leaves out its text as it does for the English, and the template has no slot for it
    const template = fn(m[0], ...m.slice(1).map((v, i) => (v === undefined ? (v as unknown as string) : '{' + SLOTS[i] + '}')));
    return typeof template === 'string' && /\{[a-h]\}/.test(template) ? { template, parts: m.slice(1) } : undefined;
  } catch {
    return undefined;
  }
}
function toEnglish(source: string): string | undefined {
  const key = source.replace(/\s+/g, ' ').trim();
  if (!key) return undefined;
  const hit = english[source.trim()] ?? collapsed.get(key);
  if (hit !== undefined) return hit;
  if (key.length > PATTERN_MAX) return undefined;
  if (patternResults.has(key)) return patternResults.get(key);
  let result: string | undefined;
  let made: PatternMade | undefined;
  for (const [re, fn] of allPatterns) {
    const m = key.match(re);
    if (m) {
      result = fn(...(m as unknown as string[]));
      made = templateOf(fn, [...m] as string[]);
      break;
    }
  }
  if (patternResults.size >= 4000) (patternResults.clear(), patternMade.clear());
  patternResults.set(key, result);
  patternMade.set(key, made);
  return result;
}

// v0.7.2: German, French, Spanish and Chinese translate from the English text. A text with
// no entry there stays in English.
export type Language = 'tr' | 'en' | 'de' | 'fr' | 'es' | 'zh';
export const LANGUAGES: [Language, string][] = [
  ['tr', 'Türkçe'],
  ['en', 'English'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['zh', '中文（简体）'],
];
// v1.0.0 (perf2 P9.2): in the page bundle these four imports are empty: scripts/build.mjs writes
// each table to dist/lang/<code>.js and the page loads only the one in use (loadLanguage) before
// it applies that language. Tests and tools that bundle this file get the tables as before.
// A script (not fetch) because a script added before the page's load event holds that event, and
// the window is shown after it: at start-up the table is in before anything is on screen.
const fromEnglishTables: Partial<Record<Language, Record<string, string> | undefined>> = {
  de: german,
  fr: french,
  es: spanish,
  zh: chinese,
};
const tablesLoading = new Map<Language, Promise<void>>();
/** Makes `language`'s table available to t(); resolves (never rejects) once it is in or failed. */
export function loadLanguage(language: Language): Promise<void> {
  if (language === 'tr' || language === 'en' || fromEnglishTables[language]) return Promise.resolve();
  let loading = tablesLoading.get(language);
  if (!loading) {
    (window as any).charlesLanguageTable ??= (code: Language, table: Record<string, string>) => {
      if (!(code in fromEnglishTables) || !table || typeof table !== 'object') return;
      fromEnglishTables[code] = table;
      collapsedTables.delete(code);
    };
    loading = new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = 'lang/' + language + '.js';
      // a missing file leaves that language in English (as a missing row does)
      script.onload = script.onerror = () => {
        script.remove();
        if (!fromEnglishTables[language]) tablesLoading.delete(language);
        resolve();
      };
      document.head.append(script);
    });
    tablesLoading.set(language, loading);
  }
  return loading;
}
const collapsedTables = new Map<Language, Map<string, string>>();
function fromEnglish(language: Language, en: string): string {
  const table = fromEnglishTables[language];
  if (!table) return en;
  let collapsedTable = collapsedTables.get(language);
  if (!collapsedTable) {
    collapsedTable = new Map(Object.entries(table).map(([k, v]) => [k.replace(/\s+/g, ' ').trim(), v]));
    collapsedTables.set(language, collapsedTable);
  }
  const key = en.replace(/\s+/g, ' ').trim();
  const hit = table[en] ?? collapsedTable.get(key);
  if (hit !== undefined) return hit;
  // numbers inside ("3 devices" → "{n} devices")
  const numbers = key.match(/\d+(?:[.,]\d+)?/g);
  if (numbers) {
    const template = collapsedTable.get(key.replace(/\d+(?:[.,]\d+)?/g, '{n}'));
    if (template !== undefined) {
      let i = 0;
      return template.replace(/\{n\}/g, () => numbers[i++] ?? '');
    }
  }
  // "<name> · actions": translate the known part after the dot
  const dot = key.match(/^(.+) · ([^·]+)$/);
  if (dot && collapsedTable.has(dot[2])) return dot[1] + ' · ' + collapsedTable.get(dot[2]);
  return en;
}
/** A Turkish UI text in `language`; undefined when there is no translation. */
function translated(language: Language, source: string): string | undefined {
  if (language === 'tr') return undefined;
  const en = toEnglish(source);
  if (en === undefined) return undefined;
  if (language === 'en') return en;
  const out = fromEnglish(language, en);
  if (out !== en) return out;
  // v1.0.0: a pattern-made text with no row of its own: its template's row, with the captured
  // parts put back (each in this language when it is an interface text itself)
  const made = patternMade.get(source.replace(/\s+/g, ' ').trim());
  return made ? (fromTemplate(language, made) ?? en) : en;
}
function fromTemplate(language: Language, made: PatternMade): string | undefined {
  const row = fromEnglish(language, made.template);
  if (row === made.template) return undefined;
  // a slot with no value never reaches the page: the caller shows the English instead
  let missing = false;
  const out = row.replace(/\{([a-h])\}/g, (all, slot: string) => {
    const part = made.parts[SLOTS.indexOf(slot)];
    if (part === undefined) return ((missing = true), all);
    return translated(language, part) ?? part;
  });
  return missing ? undefined : out;
}

let currentLanguage: Language = 'tr';
/** The UI language (v0.6.3). */
export function uiLanguage() {
  return currentLanguage;
}
/** Translate a Turkish UI text now (for text that is typed out or built piece by piece). */
export function t(text: string): string {
  return translated(currentLanguage, text) ?? text;
}
export function languageUI(api: any) {
  let language: Language = 'tr';
  // a text we wrote earlier in any language → still the same Turkish source
  const isTranslationOf = (old: string, current: string) =>
    LANGUAGES.some(([code]) => code !== 'tr' && translated(code, old) === current);
  const originals = new WeakMap<Node, string>(),
    attributes = new WeakMap<Element, Map<string, string>>();
  const panel = document.createElement('section');
  panel.className = 'setting-section';
  const label = document.createElement('label');
  label.textContent = 'Dil / Language';
  const select = document.createElement('select');
  select.id = 'language';
  for (const [code, name] of LANGUAGES) select.add(new Option(name, code));
  select.setAttribute('translate', 'no');
  label.append(select);
  panel.append(label);
  document.querySelector('.settings-page[data-category=general]')!.prepend(panel);
  // what people, tools and the AI wrote is not interface text (`#feed pre`: a command's output)
  const NOT_INTERFACE = '#feed .message,#feed pre,#requests,.plugin-results,.history-entry,[translate="no"],textarea,script,style';
  function translate(root: Node) {
    // (a text box's own text is never translated, but its placeholder is — see below)
    const skipText = root instanceof Element && !!root.closest(NOT_INTERFACE);
    const nodes: Node[] = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    if (!skipText) {
      if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
      while (walk.nextNode()) nodes.push(walk.currentNode);
    }
    for (const node of nodes) {
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest(NOT_INTERFACE)
      )
        continue;
      const current = node.textContent || '',
        old = originals.get(node);
      const source = old && (current === old || isTranslationOf(old, current)) ? old : current;
      const en = toEnglish(source);
      if (en === undefined || en === source.trim()) continue;
      originals.set(node, source);
      const next = language === 'tr' ? source : (translated(language, source) ?? source);
      if (current !== next) node.textContent = next;
    }
    const elements =
      root instanceof Element ? [root, ...root.querySelectorAll('[aria-label],[placeholder],[title],[aria-description],[data-tip]')] : [];
    for (const el of elements) {
      if (el.closest('#feed .message,.plugin-results,.history-entry,[translate="no"]')) continue;
      let saved = attributes.get(el);
      if (!saved) {
        saved = new Map();
        attributes.set(el, saved);
      }
      for (const key of ['aria-label', 'placeholder', 'title', 'aria-description', 'data-tip']) {
        const current = el.getAttribute(key);
        if (!current) continue;
        const old = saved.get(key),
          source = old && (current === old || isTranslationOf(old, current)) ? old : current;
        const en = toEnglish(source);
        if (en === undefined || en === source) continue;
        saved.set(key, source);
        const next = language === 'tr' ? source : (translated(language, source) ?? source);
        if (next !== current) el.setAttribute(key, next);
      }
    }
  }
  let translatedOnce = false;
  function apply(value: string) {
    language = (LANGUAGES.find(([code]) => code === value)?.[0] || 'tr') as Language;
    if (language !== 'tr') translatedOnce = true;
    currentLanguage = language;
    select.value = language;
    document.documentElement.lang = language;
    translate(document.body);
    document.dispatchEvent(new CustomEvent('charles-language', { detail: language }));
    // v1.0.0 (perf2): start-up timing, and a hint so the next start loads this table at once
    performance.mark('charles-language');
    try {
      localStorage.setItem(LANGUAGE_HINT, language);
    } catch {}
  }
  const watching = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'placeholder', 'title', 'aria-description', 'data-tip'],
  };
  // v0.9.22: each added message used to walk the whole chat again (the record's target is the list
  // it was added to), so opening a long chat froze the panel for seconds. Only what changed is
  // read now, and in Turkish nothing has to be done: the page is written in it.
  // v1.0.0 (perf2): unless another language was used in this session: a panel built then and kept
  // off the page (the shelf's panels are detached when closed) comes back in that language
  const observer = new MutationObserver((records) => {
    if (language === 'tr' && !translatedOnce) return;
    observer.disconnect();
    const changed = new Set<Node>();
    for (const r of records) {
      if (r.type === 'childList') for (const n of r.addedNodes) changed.add(n);
      else changed.add(r.target);
    }
    for (const n of changed) if (n.isConnected) translate(n);
    observer.observe(document.body, watching);
  });
  observer.observe(document.body, watching);
  // v1.0.0 (perf2 P9.2): a language is applied only once its table is in (a local file), so nothing
  // is drawn half in English; the last choice wins when the list is changed quickly.
  const valid = (v: string) => (LANGUAGES.find(([code]) => code === v)?.[0] || 'tr') as Language;
  let choice = 0;
  const choose = (value: string, saved: Promise<unknown> = Promise.resolve()) => {
    const mine = ++choice;
    return Promise.all([saved, loadLanguage(valid(value))]).then(() => {
      if (mine === choice) apply(value);
    });
  };
  select.onchange = () => void choose(select.value, api.companionSave({ language: select.value }));
  try {
    const hint = localStorage.getItem(LANGUAGE_HINT);
    if (hint) void loadLanguage(valid(hint));
  } catch {}
  void api.companionRead().then((v: any) => choose(v.language || v.preferences?.language || 'tr'));
}
const LANGUAGE_HINT = 'charles-language';

/** The English for a Turkish UI text, if there is one (tests). */
export function englishFor(text: string): string | undefined {
  return toEnglish(text);
}

/** Every Turkish → English pair (tests, translation tooling). */
export function englishEntries(): [string, string][] {
  return Object.entries(english);
}

/** A Turkish UI text in any language, or undefined (tests, translation tooling). */
export function translatedFor(language: Language, text: string): string | undefined {
  return translated(language, text);
}

/** An English text in German, French, Spanish or Chinese, as `t()` would make it (tests). */
export function fromEnglishIn(language: Language, en: string): string {
  return fromEnglish(language, en);
}

/** The Turkish → English patterns (translation tooling: .qa/h100/polish/pattern-gaps.cjs). */
export function patternEntries(): [RegExp, (...m: string[]) => string][] {
  return allPatterns as [RegExp, (...m: string[]) => string][];
}

/** What `t()` shows in `language` for a pattern match `m` (m[0] the text, then the groups,
 *  undefined for a group the match left out) of the pattern function `fn` (tests, tooling). */
export function patternTranslatedFor(language: Language, fn: (...m: string[]) => string, m: (string | undefined)[]): string {
  const en = fn(...(m as string[]));
  if (language === 'tr' || language === 'en') return en;
  const out = fromEnglish(language, en);
  if (out !== en) return out;
  const made = templateOf(fn, m as string[]);
  return made ? (fromTemplate(language, made) ?? en) : en;
}
