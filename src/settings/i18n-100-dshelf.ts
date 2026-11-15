// v1.0.0: the island shelf, cards and tools (design pass). Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100DShelf: Record<string, string> = {
  // the timer's end texts, without exclamation marks
  'Odak bitti': 'Focus done',
  'Mola bitti': 'Break over',
  'Süre doldu': 'Time’s up',
  // Dosyalar → the third button, in sentence case
  'Dosya rafı': 'File shelf',
  'Dosya rafı · dosya bırak veya seç': 'File shelf · drop a file or choose',
  // the other two buttons' names had no English row (screen readers heard Turkish)
  'Dönüştür · dosya bırak veya seç': 'Convert · drop a file or choose',
  'Gönder · dosya bırak veya seç': 'Send · drop a file or choose',
  // Sistem izleyici: the reset button's extra sentence (it had no English row)
  'Grafik geçmişini sil': 'Clear the chart history',
};
export const patterns100DShelf: [RegExp, (...m: string[]) => string][] = [];
