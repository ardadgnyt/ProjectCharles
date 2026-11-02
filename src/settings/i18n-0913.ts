// v0.9.13: the redesigned island home page (src/island/shelf.ts, usage-all.ts, converter.ts,
// share.ts) and the Quick Share firewall notes.
import { english0814 } from './i18n-0814';

export const english0913: Record<string, string> = {
  'Dönüştür veya gönder': 'Convert or send',
  'Görsel, belge ve arşivleri başka formata çevir': 'Turn images, documents and archives into another format',
  'Yakındaki cihaza Quick Share ile gönder': 'Send to a nearby device with Quick Share',
  'BUGÜN · SAATLİK': 'TODAY · HOURLY',
  '5 GÜNLÜK': '5-DAY',
  'KALAN KULLANIM': 'REMAINING USAGE',
  'YAKINDAKİ CİHAZLAR': 'NEARBY DEVICES',
  'Aynı ağdaki cihazlar burada görünür.': 'Devices on the same network show up here.',
  'Göremediğin cihazda Quick Share’i aç': 'Turn on Quick Share on a device you can’t see',
  'Bağlı olanların hepsi': 'All connected',
  'Bir dosya seç; dönüştürülebileceği biçimler burada görünür.': 'Choose a file; the formats it can become show up here.',
  'Dosya alımı açık; gelen dosya için kabul sorulur': 'Receiving is on; you are asked before a file is accepted',
  'Dosya alımı kapalı; göndermeye devam edebilirsin': 'Receiving is off; you can still send',
  'Dosya alımı açılıyor…': 'Turning on receiving…',
  'Ağ izni ver': 'Allow network access',
  'Yeniden denetle': 'Check again',
  "Bu Wi-Fi Windows'ta “Ortak ağ” olarak ayarlı; telefonların bilgisayarı görmesi için Ayarlar → Ağ ve İnternet'ten “Özel ağ” seç.":
    'This Wi-Fi is set to “Public network” in Windows; for phones to see the PC, choose “Private network” in Settings → Network & internet.',
  'Telefonların bu bilgisayarı her zaman görebilmesi için Windows ağ izni gerekiyor.':
    'Windows network permission is needed so phones can always see this PC.',
  'Kurallar yazıldı ama Windows hâlâ izin vermiyor; bilgisayarı yeniden başlatıp tekrar dene.':
    'The rules were written but Windows still blocks it; restart the PC and try again.',
  'Aktarım tamamlanamadı': 'The transfer could not be completed',
  'Spotify · Hazır': 'Spotify · Ready',
  'Spotify · Şimdi çalıyor': 'Spotify · Now playing',
  'Spotify · Duraklatıldı': 'Spotify · Paused',
  'Sohbeti aç': 'Open the chat',
  'Geri': 'Back',
  'Şehri değiştir': 'Change city',
  Kredi: 'Credits',
  'Veri bekleniyor': 'Waiting for data',
  "Windows güvenlik duvarı Quick Share'i engelliyor; telefonlar bu bilgisayarı göremeyebilir.": 'Windows Firewall is blocking Quick Share; phones may not see this PC.',
};

/** A weather condition ("Parçalı bulutlu") in English, if it is one. */
const sky = (text: string) => english0814[text.trim()] ?? text;

export const patterns0913: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) sağlayıcı$/, (_, n) => (n === '1' ? '1 provider' : `${n} providers`)],
  [/^(.+) · aynı ağ$/, (_, p) => `${p} · same network`],
  // the Hava durumu card: "11° · Ankara · Parçalı bulutlu"
  [/^(-?\d+°) · ([^·]+) · ([^·]+)$/, (_, deg, city, text) => `${deg} · ${city.trim()} · ${sky(text)}`],
  [/^([^·]+) · Yükleniyor…$/, (_, city) => `${city.trim()} · Loading…`],
  [
    /^Windows güvenlik duvarı Quick Share'i engelliyor(?: \((.+)\))?; telefonlar bu bilgisayarı göremeyebilir\.$/,
    (_, names) => `Windows Firewall is blocking Quick Share${names ? ` (${names})` : ''}; phones may not see this PC.`,
  ],
];
