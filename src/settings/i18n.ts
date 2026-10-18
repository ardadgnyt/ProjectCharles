import { english063, englishPatterns } from './i18n-063';
import { english070 } from './i18n-070';
import { english071 } from './i18n-071';
import { englishSpecial, specialPatterns } from './i18n-special';
import { english072, patterns072 } from './i18n-072';
import { english077, patterns077 } from './i18n-077';
import { english080, patterns080 } from './i18n-080';
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
  'Proje · Kod yaz': 'Project · Code',
  'Yeni konuşma': 'New chat',
  'Charles’a bir şey sor…': 'Ask Charles…',
  'Aklında ne var?': 'What’s on your mind?',
  'Bir fikir, küçük bir soru, yeni bir şey.': 'An idea, a quick question, something new.',
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
  'Bağlı değil': 'Not connected',
  'Bağlantı kayıtlı': 'Connection saved',
  'Giriş yapılmadı': 'Not signed in',
  'Bağlı · Modeller kullanıma hazır': 'Connected · Models ready',
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
  'Ses ve ekran': 'Voice and screen',
  'Yanıtları sesli oku': 'Read responses aloud',
  'Hava durumu': 'Weather',
  'Konum seç': 'Choose location',
  'Şimdilik geç': 'Skip for now',
  'Ana yapay zekâ sistemi': 'Primary AI provider',
  'GPT hesabı': 'GPT account',
  'Gemini hesabı': 'Gemini account',
  'Claude hesabı': 'Claude account',
  'Cursor hesabı': 'Cursor account',
  'ChatGPT ile giriş': 'Sign in with ChatGPT',
  'Codex’e bağlan': 'Connect to Codex',
  "Codex'e bağlan": 'Connect to Codex',
  'Gemini ile giriş': 'Sign in with Gemini',
  'Claude ile giriş': 'Sign in with Claude',
  'Cursor ile giriş': 'Sign in with Cursor',
  'Hesap kontrol ediliyor…': 'Checking account…',
  'Giriş bekleniyor': 'Waiting for sign-in',
  'Bağlantıyı test et': 'Test connection',
  'Anahtarı sil': 'Delete key',
  'Gemini Live sesi': 'Gemini Live voice',
  'Gemini varsayılanı': 'Gemini default',
  'Gemini Live · sesli görüşme': 'Gemini Live · voice conversation',
  'AI Studio’da ücretsiz anahtar oluştur': 'Create a free key in AI Studio',
  'Gemini API anahtarı': 'Gemini API key',
  'Mikrofon düğmesinde Gemini Live kullan': 'Enable Gemini Live voice conversations',
  'Projem Free Tier; faturalandırması kapalı': 'My project uses Free Tier; billing is disabled',
  'Yeni anahtar henüz kaydedilmedi. Önce Kaydet’e bas, ardından bağlantıyı test et.':
    'Save the new key before testing the connection.',
  'Sesi seçip Kaydet’e bas. Yeni ses sonraki görüşmede kullanılır; açık görüşme kaydederken sonlandırılır.':
    'Choose a voice and save. It applies to the next conversation; saving ends the current call.',
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
  'Kısayolu yaz veya alana odaklanıp tuşlara bas. Boş bırakırsan devre dışı kalır.':
    'Type a shortcut or focus the field and press the keys. Leave it blank to disable.',
  'Geçen hafta': 'Last week',
  'Pazartesi sabahı haftalık özeti göster': 'Show weekly summary on Monday morning',
  'Özeti yenile': 'Refresh summary',
  'Çalışma süresi': 'Active task time',
  Oturumlar: 'Sessions',
  İşlemler: 'Tasks',
  Dosyalar: 'Files',
  'Eklenen satır': 'Lines added',
  'Silinen satır': 'Lines removed',
  Komutlar: 'Commands',
  'İzin istekleri': 'Approval requests',
  'En çok kullanılan ajan': 'Top agent',
  Proje: 'Project',
  'En yoğun gün': 'Busiest day',
  'En uzun işlem': 'Longest task',
  'En uzun oturum': 'Longest session',
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
  'Mevsime göre': 'Seasonal',
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
  'Bağlantı kurulum rehberi': 'Connection setup guide',
  'Mail, takvim ve Drive bağlantıları salt okunurdur. Hesap bilgileri Windows şifrelemesiyle saklanır. Gelen içerikler kendi başına komut çalıştırmaz.':
    'Mail, calendar and Drive connections are read-only. Credentials use Windows encryption. Incoming content cannot run commands on its own.',
  'Önemli mail ve takvim bildirimleri': 'Important mail and calendar notifications',
  'Önemli kelimeler': 'Important keywords',
  'Bildirimleri kaydet': 'Save notifications',
  'Listele / Yenile': 'List / Refresh',
  'Charles’a sor': 'Ask Charles',
  Uygula: 'Apply',
  'IMAP sunucusu': 'IMAP server',
  'TLS portu': 'TLS port',
  'E-posta / kullanıcı adı': 'Email / username',
  'Şifre / uygulama şifresi': 'Password / app password',
  'Okul e-postası': 'School email',
  'Okul e-postası · IMAP': 'School email · IMAP',
  'Tarayıcıda girişini tamamla…': 'Finish signing in in your browser…',
  'Kayıtlı · değiştirmek için gir': 'Saved · enter a replacement',
  'Charles açıkken 5 dakikada bir kontrol edilir. İlk kontrol bildirim göndermez. Önem etiketi veya bu kelimeler eşleşirse bildirim gelir; yeni takvim olayları da bildirilir.':
    'Checked every 5 minutes while Charles is running. The first check establishes a baseline. Important flags, keyword matches and new calendar events trigger notifications.',
  'ShazamKit’in resmi Windows SDK’sı bulunmadığından bu sürümde bağlanamaz. ChatGPT’deki Shazam oturumu Charles’a aktarılamaz.':
    'ShazamKit has no official Windows SDK, so it cannot connect in this release. ChatGPT’s Shazam session cannot be transferred to Charles.',
  'Bağlantı başarılı. Gemini Live sesli görüşmeye hazır.':
    'Connection successful. Gemini Live is ready.',
  'Sesi durdur': 'Stop audio',
  'Metni kontrol et, ardından Gönder’e bas.': 'Review the text, then press Send.',
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
  'Baş dönmesi': 'Dizzy',
  Şaşkınlık: 'Surprised',
  'Göz kırpma': 'Wink',
  Düşünme: 'Thinking',
  Çalışma: 'Working',
  Tamamlandı: 'Completed',
  'Yalnızca karakterin tepkisini gösterir. Yaklaşık 3 saniye sonra\n              normal ifadesine döner.':
    'Shows a character reaction for about 3 seconds, then returns to the normal expression.',
  Yazı: 'Text',
  Saydamlık: 'Opacity',
  'Charles hangi ekranda görünsün?': 'Which screen should Charles use?',
  'Ana ekran · Windows ana ekranı': 'Main screen · Windows primary display',
  'Faremin olduğu ekran · Açılışta ve ekran değişiminde':
    'Pointer screen · At startup and when displays change',
  'Ekranları yenile': 'Refresh displays',
  'ChatGPT’den beni tanı': 'Get to know me from ChatGPT',
  'ChatGPT’den kişisel bilgi aktarımı': 'Import personal context from ChatGPT',
  'Her kullanıcı kendi ChatGPT hesabından bir özet alır. Otomatik eşitleme yapılmaz. Bilgiler bu Windows kullanıcısının Charles hafızasına kaydedilir; ChatGPT hesabını değiştirmek bu yerel kayıtları otomatik değiştirmez.':
    'Each user obtains a summary from their own ChatGPT account. There is no automatic sync. The imported information is saved for this Windows user; switching ChatGPT accounts does not change the local memory.',
  '1 · Soru paketini ChatGPT’ye gönder': '1 · Send the questionnaire to ChatGPT',
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
  "Onay iste: dosya ve komut izinlerini sorar. Benim için onayla:\n              projede düzenleme yapar; ek izin taleplerini Codex risk\n              değerlendirmesine gönderir. Gerekli işlemler engellenebilir veya\n              kullanıcı müdahalesi gerekebilir. Tam erişim: Charles'ın\n              dosya/komut onayları ve Codex sandbox sınırı kaldırılır; mevcut\n              Windows hesabının erişebildiği dosyalarda ve ağda işlem yapabilir.\n              Windows yönetici izinlerini aşmaz.":
    'Ask for approval: asks about file and command permissions. Approve for me: edits the project and sends additional permission requests to Codex risk review; some actions may require your input. Full access: removes Charles file/command approval prompts and the Codex sandbox boundary, within the permissions of your Windows account. It does not bypass Windows administrator permissions.',
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
  'Yeni mail ve takvim bildirimleri': 'New mail and calendar notifications',
  'Bilgiler kayıtlı · bağlantıyı test et': 'Settings saved · test the connection',
  'Hesap bağlı': 'Account connected',
  'Tuşları kaydet': 'Record keys',
  'Tuşlara bas…': 'Press your shortcut…',
  Atanmadı: 'Not assigned',
  Kaldır: 'Remove',
  Geri: 'Back',
  Sonraki: 'Next',
  'Daha sonra': 'Later',
  'Kurulumu bitir': 'Finish setup',
  'Bilgisayarda toplam süre': 'Total computer time',
  'Aktif bilgisayar kullanımı': 'Active computer use',
  'Charles işlem süresi': 'Charles task time',
  'Okul e-posta adresin': 'Your school email address',
  'IMAP sunucu adresi': 'IMAP server address',
  'Google OAuth istemci kimliği': 'Google OAuth client ID',
  'Google masaüstü istemci gizli anahtarı': 'Google desktop client secret',
  'Home Assistant sunucu adresi': 'Home Assistant server URL',
  'Uzun ömürlü erişim token’ı': 'Long-lived access token',
  '1 · Google Cloud projesi': '1 · Google Cloud project',
  '2 · Gmail erişimi': '2 · Gmail access',
  '3 · Takvim erişimi': '3 · Calendar access',
  '4 · Drive erişimi': '4 · Drive access',
  '5 · İzin ekranı': '5 · Consent screen',
  '6 · Masaüstü uygulaması': '6 · Desktop application',
  '7 · Charles’a bağla': '7 · Connect to Charles',
  '1 · Microsoft uygulama kaydı': '1 · Microsoft app registration',
  '2 · Hesap türü': '2 · Account type',
  '3 · Masaüstü bağlantısı': '3 · Desktop connection',
  '4 · Posta ve takvim izinleri': '4 · Mail and calendar permissions',
  '5 · Charles’a bağla': '5 · Connect to Charles',
  'İlk bağlantıda bir defalık uygulama kaydı gerekir. Charles adım adım yardımcı olur. Sonraki girişlerde doğrudan hesabını seçebilirsin.':
    'The first connection requires a one-time app registration. Charles guides you through it. Later sign-ins go straight to account selection.',
  'Hesaplarını burada bağla. Mail okumak veya özetlemek için sohbetten ya da sesli görüşmeden iste. Örneğin: “Okul maillerimi özetle”.':
    'Connect accounts here. Ask in chat or voice to read or summarize mail, for example: “Summarize my school mail”.',
  'Kaydet düğmesine tıkla, ardından kısayol tuşlarına birlikte bas. Esc ile vazgeç.':
    'Click Record keys, then press the shortcut together. Press Esc to cancel.',
});
Object.assign(english, english063, english070, english071, englishSpecial, english072, english077, english080);

// v0.6.3: look-up that ignores line breaks/indentation from the HTML, then the patterns
// (texts with numbers or names inside).
const collapsed = new Map<string, string>();
for (const [k, v] of Object.entries(english)) collapsed.set(k.replace(/\s+/g, ' ').trim(), v);
function toEnglish(source: string): string | undefined {
  const key = source.replace(/\s+/g, ' ').trim();
  if (!key) return undefined;
  const hit = english[source.trim()] ?? collapsed.get(key);
  if (hit !== undefined) return hit;
  for (const [re, fn] of [...englishPatterns, ...specialPatterns, ...patterns072, ...patterns077, ...patterns080]) {
    const m = key.match(re);
    if (m) return fn(...(m as unknown as string[]));
  }
  return undefined;
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
const fromEnglishTables: Partial<Record<Language, Record<string, string>>> = {
  de: german,
  fr: french,
  es: spanish,
  zh: chinese,
};
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
  return language === 'en' ? en : fromEnglish(language, en);
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
/** An English text (from the island engine) in the UI language. */
export function fromEnglishText(en: string): string {
  return currentLanguage === 'tr' || currentLanguage === 'en' ? en : fromEnglish(currentLanguage, en);
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
  function translate(root: Node) {
    // (a text box's own text is never translated, but its placeholder is — see below)
    const skipText =
      root instanceof Element &&
      !!root.closest('#feed .message,#requests,.plugin-results,.history-entry,[translate="no"],textarea,script,style');
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
        parent.closest(
          '#feed .message,#requests,.plugin-results,.history-entry,[translate="no"],textarea,script,style',
        )
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
      root instanceof Element ? [root, ...root.querySelectorAll('[aria-label],[placeholder],[title]')] : [];
    for (const el of elements) {
      if (el.closest('#feed .message,.plugin-results,.history-entry,[translate="no"]')) continue;
      let saved = attributes.get(el);
      if (!saved) {
        saved = new Map();
        attributes.set(el, saved);
      }
      for (const key of ['aria-label', 'placeholder', 'title']) {
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
  function apply(value: string) {
    language = (LANGUAGES.find(([code]) => code === value)?.[0] || 'tr') as Language;
    currentLanguage = language;
    select.value = language;
    document.documentElement.lang = language;
    translate(document.body);
    document.dispatchEvent(new CustomEvent('charles-language', { detail: language }));
  }
  const observer = new MutationObserver((records) => {
    observer.disconnect();
    for (const r of records) translate(r.target);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'placeholder', 'title'],
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'placeholder', 'title'],
  });
  select.onchange = () =>
    void api.companionSave({ language: select.value }).then(() => apply(select.value));
  void api.companionRead().then((v: any) => apply(v.language || v.preferences?.language || 'tr'));
}

/** The English for a Turkish UI text, if there is one (tests). */
export function englishFor(text: string): string | undefined {
  return toEnglish(text);
}

/** Every Turkish → English pair (tests, translation tooling). */
export function englishEntries(): [string, string][] {
  return Object.entries(english);
}
