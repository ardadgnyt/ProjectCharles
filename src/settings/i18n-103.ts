// v1.0.3. Turkish → English; other languages: src/settings/lang/*.ts.
export const english103: Record<string, string> = {
  // Google & plugin verification / connection states (plugins.ts, gcal-card.ts, plugins.cjs, oauth-setup.cjs)
  'Yeniden yetkilendir': 'Re-authorise',
  'Hazır': 'Ready',
  'İzin eksik': 'Permission missing',
  'Hata': 'Error',
  'Takvim': 'Calendar',
  'Seçilen dosya geçerli bir JSON değil. Google Cloud’dan aldığın masaüstü OAuth JSON dosyasını seç.':
    'The selected file is not valid JSON. Choose the desktop OAuth JSON file downloaded from Google Cloud.',
  'Yapılandırma yok · Önce uygulama kaydı ekle.':
    'Not configured · Add an app registration first.',
  'Yapılandırma kayıtlı · Google ile giriş yaparak yetkilendir.':
    'Configuration saved · Sign in with Google to authorise.',
  'Yapılandırma kayıtlı · Bağlanınca Google, Charles’ın takvimine etkinlik ekleyip düzenleyebilmesi için izin ister.':
    'Configuration saved · When connecting, Google will ask for permission so Charles can add and edit events on your calendar.',
  'Yapılandırma kayıtlı · Microsoft ile giriş yaparak yetkilendir.':
    'Configuration saved · Sign in with Microsoft to authorise.',
  'Oturumun süresi doldu ya da izin geri alındı. Yeniden yetkilendir.':
    'Session expired or permission was revoked. Re-authorise.',
  'Sağlayıcı şu an çok fazla istek aldığını söylüyor (429). Biraz sonra tekrar dene.':
    'The provider reports too many requests right now (429). Try again shortly.',
  'Sunucu geçici olarak yanıt vermiyor. Biraz sonra tekrar dene.':
    'The server is temporarily unavailable. Try again shortly.',
  'Ağ veya zaman aşımı hatası oluştu. İnternet bağlantını kontrol edip tekrar dene.':
    'Network or timeout error. Check your internet connection and try again.',
  'Takvim yazma izni eksik. Yeniden yetkilendir.':
    'Calendar write permission is missing. Re-authorise.',
  'Eksik hesap izni var. Yeniden yetkilendir.':
    'Account permission is missing. Re-authorise.',
  'Bağlantı kontrol edilirken hata oluştu.':
    'An error occurred while checking the connection.',
  'Gmail, Takvim ve Drive doğrulandı.':
    'Gmail, Calendar, and Drive verified.',
  'Google Takvim yazma bağlantısı doğrulandı.':
    'Google Calendar write connection verified.',
  'Outlook ve Takvim doğrulandı.':
    'Outlook and Calendar verified.',
  'Home Assistant token’ı reddedildi. Yeni uzun ömürlü erişim token’ı kaydet.':
    'Home Assistant token was rejected. Save a new long-lived access token.',
  'E-posta kullanıcı adı veya şifresi reddedildi. Bilgileri kontrol edip tekrar kaydet.':
    'Email username or password was rejected. Check your credentials and save again.',
  'Google oturumunun süresi doldu ya da izin geri alındı. Ayarlar’daki Eklentiler sayfasında Yeniden yetkilendir’e bas. (Google projesi “Testing / Test” durumundaysa oturum 7 günde bir sona erer; Charles ile kur’un son adımı bunu kalıcı yapmayı anlatıyor.)':
    'Your Google session expired or permission was revoked. Click Re-authorise on the Plugins page in Settings. (If your Google project is in “Testing” mode, sessions expire every 7 days; the final step of Set up with Charles explains how to make it permanent.)',
  'Microsoft oturumunun süresi doldu ya da izin geri alındı. Ayarlar’daki Eklentiler sayfasında Yeniden yetkilendir’e bas.':
    'Your Microsoft session expired or permission was revoked. Click Re-authorise on the Plugins page in Settings.',
  // Subagent tracker tooltips & custom select fallback (subagents-view.ts, custom-select.ts)
  'Alt ajan ayrıntılarını göster': 'Show subagent details',
  'Alt ajan ayrıntılarını gizle': 'Hide subagent details',
  'Seçim': 'Selection',
};

const serviceStatusEn = (s: string) =>
  s === 'Hazır' ? 'Ready' : s === 'İzin eksik' ? 'Permission missing' : s === 'Hata' ? 'Error' : s;

const serviceListEn = (list: string) => list.replace(/\bTakvim\b/g, 'Calendar');

const EXTRA_HEAD_EN: Record<string, string> = {
  'Etkinlikleri uygulama penceresindeki takvimden ekleyebilirsin.':
    'You can add events from the calendar in the app window.',
};

function translatePartEn(part: string): string {
  if (/^\{[a-h]\}$/.test(part)) return part;
  if (english103[part]) return english103[part];
  if (EXTRA_HEAD_EN[part]) return EXTRA_HEAD_EN[part];
  let m = /^(.+?) izni eksik\. Tüm servisler için yeniden yetkilendir\.$/.exec(part);
  if (m) return `${serviceListEn(m[1])} permission missing. Re-authorise for all services.`;
  m = /^(.+?) izni eksik\. Yeniden yetkilendir\.$/.exec(part);
  if (m) return `${serviceListEn(m[1])} permission missing. Re-authorise.`;
  m = /^(.+?) API etkin değil\. Google Cloud projesinde ilgili API’yi etkinleştir\.$/.exec(part);
  if (m) return `${serviceListEn(m[1])} API is not enabled. Enable the corresponding API in your Google Cloud project.`;
  m = /^(.+?) bağlantısında hata oluştu\. Tekrar dene\.$/.exec(part);
  if (m) return `Error connecting to ${serviceListEn(m[1])}. Try again.`;
  m = /^Gmail: (Hazır|İzin eksik|Hata) · Takvim: (Hazır|İzin eksik|Hata) · Drive: (Hazır|İzin eksik|Hata)$/.exec(part);
  if (m) return `Gmail: ${serviceStatusEn(m[1])} · Calendar: ${serviceStatusEn(m[2])} · Drive: ${serviceStatusEn(m[3])}`;
  m = /^Outlook: (Hazır|İzin eksik|Hata) · Takvim: (Hazır|İzin eksik|Hata)$/.exec(part);
  if (m) return `Outlook: ${serviceStatusEn(m[1])} · Calendar: ${serviceStatusEn(m[2])}`;
  return part;
}

export const patterns103: [RegExp, (...m: string[]) => string][] = [
  [/^Son kontrol: (\d{2}:\d{2})$/, (_m, time) => `Last checked: ${time}`],
  [
    /^(.+?) izni eksik\. Tüm servisler için yeniden yetkilendir\.$/,
    (_m, services) => `${serviceListEn(services)} permission missing. Re-authorise for all services.`,
  ],
  [
    /^(.+?) izni eksik\. Yeniden yetkilendir\.$/,
    (_m, services) => `${serviceListEn(services)} permission missing. Re-authorise.`,
  ],
  [
    /^(.+?) API etkin değil\. Google Cloud projesinde ilgili API’yi etkinleştir\.$/,
    (_m, services) => `${serviceListEn(services)} API is not enabled. Enable the corresponding API in your Google Cloud project.`,
  ],
  [
    /^(.+?) bağlantısında hata oluştu\. Tekrar dene\.$/,
    (_m, services) => `Error connecting to ${serviceListEn(services)}. Try again.`,
  ],
  [
    /^Gmail: (Hazır|İzin eksik|Hata) · Takvim: (Hazır|İzin eksik|Hata) · Drive: (Hazır|İzin eksik|Hata)$/,
    (_m, g, c, d) =>
      `Gmail: ${serviceStatusEn(g)} · Calendar: ${serviceStatusEn(c)} · Drive: ${serviceStatusEn(d)}`,
  ],
  [
    /^Outlook: (Hazır|İzin eksik|Hata) · Takvim: (Hazır|İzin eksik|Hata)$/,
    (_m, o, c) => `Outlook: ${serviceStatusEn(o)} · Calendar: ${serviceStatusEn(c)}`,
  ],
  [
    /^Gmail: (Hazır|İzin eksik|Hata) · Takvim: (Hazır|İzin eksik|Hata) · Drive: (Hazır|İzin eksik|Hata) · Son kontrol: (\d{2}:\d{2})$/,
    (_m, g, c, d, time) =>
      `Gmail: ${serviceStatusEn(g)} · Calendar: ${serviceStatusEn(c)} · Drive: ${serviceStatusEn(d)} · Last checked: ${time}`,
  ],
  [
    /^Outlook: (Hazır|İzin eksik|Hata) · Takvim: (Hazır|İzin eksik|Hata) · Son kontrol: (\d{2}:\d{2})$/,
    (_m, o, c, time) =>
      `Outlook: ${serviceStatusEn(o)} · Calendar: ${serviceStatusEn(c)} · Last checked: ${time}`,
  ],
  [
    /^(.+?) · (Gmail: (?:Hazır|İzin eksik|Hata) · Takvim: (?:Hazır|İzin eksik|Hata) · Drive: (?:Hazır|İzin eksik|Hata)) · Son kontrol: (\d{2}:\d{2})$/,
    (_m, head, summary, time) => `${translatePartEn(head)} · ${translatePartEn(summary)} · Last checked: ${time}`,
  ],
  [
    /^(.+?) · (Outlook: (?:Hazır|İzin eksik|Hata) · Takvim: (?:Hazır|İzin eksik|Hata)) · Son kontrol: (\d{2}:\d{2})$/,
    (_m, head, summary, time) => `${translatePartEn(head)} · ${translatePartEn(summary)} · Last checked: ${time}`,
  ],
  [
    /^(.+?) · (Gmail: (?:Hazır|İzin eksik|Hata) · Takvim: (?:Hazır|İzin eksik|Hata) · Drive: (?:Hazır|İzin eksik|Hata))$/,
    (_m, head, summary) => `${translatePartEn(head)} · ${translatePartEn(summary)}`,
  ],
  [
    /^(.+?) · (Outlook: (?:Hazır|İzin eksik|Hata) · Takvim: (?:Hazır|İzin eksik|Hata))$/,
    (_m, head, summary) => `${translatePartEn(head)} · ${translatePartEn(summary)}`,
  ],
  [
    /^(.+?) · Son kontrol: (\d{2}:\d{2})$/,
    (_m, head, time) => `${translatePartEn(head)} · Last checked: ${time}`,
  ],
];
