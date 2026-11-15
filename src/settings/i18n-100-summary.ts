// v1.0.0: weekly summary and usage summary. Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100Summary: Record<string, string> = {
  'Bu hafta': 'This week',
  'Geçen hafta': 'Last week',
  Yenile: 'Refresh',
  'Pazartesi sabahı özet göster': 'Show the summary on Monday morning',
  'Nasıl hesaplanır?': 'How is it calculated?',
  'Yalnızca bu bilgisayarda, Charles açıkken ölçülür. Uyku ve kilit süresi sayılmaz.':
    'Measured only on this computer, while Charles is open. Sleep and lock time are not counted.',
  'Aktif kullanım için son 5 dakikada klavye veya fare hareketi gerekir; geri kalanı boşta sayılır.':
    'Active use needs keyboard or mouse input in the last 5 minutes; the rest counts as idle.',
  'Uygulama süreleri 15 saniyede bir, öndeki pencereden kaydedilir. Yalnızca adlar ve süreler saklanır.':
    'App times are recorded every 15 seconds from the window in front. Only names and times are kept.',
  'AI istekleri: Charles üzerinden gönderilen her mesaj, tüm modeller birlikte. Çalışma süresi, gönderildiği andan yanıtın bittiği ana kadardır.':
    'AI requests: every message sent through Charles, all models together. Working time runs from sending until the answer is finished.',
  'Bu özet kalan kullanım hakkını veya maliyeti göstermez; kalan haklar AI kullanımı kartındadır.':
    'This summary shows no remaining quota and no cost; remaining usage is on the AI usage card.',
  'Charles kapalıyken geçen günler “—” ile gösterilir: ölçüm yoktur, sıfır değildir.':
    'Days when Charles was closed show “—”: nothing was measured, which is not zero.',
  'Özet Pazartesi 09.00’da veya sonraki açılışta gösterilir.':
    'The summary is shown on Monday at 09:00 or at the next start.',
  'Pazartesiden bu yana': 'Since Monday',
  'Pazartesi – Pazar': 'Monday to Sunday',
  'bu bilgisayar': 'this computer',
  'Ölçüm bu dönemin ortasında başladı:': 'Measuring began during this period:',
  'Önceki günler bilinmiyor.': 'Earlier days are unknown.',
  'Bu dönem için ölçüm yok': 'Nothing measured for this period',
  'Charles açık kaldıkça bilgisayar süresi ve AI istekleri burada birikir.':
    'While Charles is open, computer time and AI requests add up here.',
  'Geçen hafta Charles hiç açık değildi ya da ölçüm daha yeni başladı.':
    'Charles was not open last week, or measuring began only recently.',
  'Bilgisayar başında': 'At the computer',
  'öndeki pencereye göre': 'by the window in front',
  'Aktif kullanım': 'Active use',
  'Toplam süre': 'Total time',
  Boşta: 'Idle',
  Aktif: 'Active',
  'Ölçüm yok': 'Not measured',
  'Günlük, saat': 'Per day, hours',
  'Charles ile AI istekleri': 'AI requests through Charles',
  'tüm modeller': 'all models',
  İstekler: 'Requests',
  'AI çalışma süresi': 'AI working time',
  Sohbetler: 'Chats',
  İstek: 'Requests',
  'Günlük, adet': 'Per day, count',
  'Modellere göre istek': 'Requests by model',
  'Değişen dosyalar': 'Changed files',
  'Eklenen satır': 'Lines added',
  'Silinen satır': 'Lines removed',
  Komutlar: 'Commands',
  'En uzun sohbet': 'Longest chat',
  'En yoğun gün': 'Busiest day',
  'Uygulamalar ve oyunlar': 'Apps and games',
  'toplam · aktif': 'total · active',
  'Bu dönem için uygulama verisi yok.': 'No app data for this period.',
  'Tekrar dene': 'Try again',
  'Yenilenemedi.': 'Could not refresh.',
  'Gösterilen değerler şu saatte okundu:': 'The values shown were read at:',
  'Özet okunamadı': 'Could not read the summary',
  'Yükleniyor…': 'Loading…',
};
export const patterns100Summary: [RegExp, (...m: string[]) => string][] = [
  [/^Diğer (\d+) uygulama$/, (_m, n) => `${n} other apps`],
];
