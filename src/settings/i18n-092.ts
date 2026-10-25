export const english092: Record<string, string> = {
  'Gönder · Quick Share ve AirDrop': 'Send · Quick Share & AirDrop',
  'Gönder · Quick Share & AirDrop': 'Send · Quick Share & AirDrop',
  'Quick Share · AirDrop': 'Quick Share · AirDrop',
  'Dosya seç veya bırak': 'Choose or drop files',
  'Yakındaki cihazlar (Quick Share & AirDrop)': 'Nearby devices (Quick Share & AirDrop)',
  'Cihaz aranıyor… Telefonunda Quick Share veya AirDrop’u aç.':
    'Searching for devices… Open Quick Share or AirDrop on your phone.',
  'Alım: Herkese açık': 'Receive: Everyone',
  'Alım: Otomatik kabul': 'Receive: Auto-accept',
  'Alım: Kapalı': 'Receive: Off',
  'Kabul et': 'Accept',
  Reddet: 'Decline',
  Tara: 'Scan',
  Temizle: 'Clear',
  'Gelen dosya var': 'Incoming file',
  'İndirilenler klasörüne kaydedildi': 'Saved to Downloads',
  Gönderildi: 'Sent',
};

export const patterns092: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) cihaz yakınında$/, (_, n) => `${n} nearby`],
  [/^(\d+) dosya seçildi$/, (_, n) => `${n} files selected`],
  [/^Gönderiliyor · %(\d+)$/, (_, n) => `Sending · ${n}%`],
  [/^Alınıyor · %(\d+)$/, (_, n) => `Receiving · ${n}%`],
];
