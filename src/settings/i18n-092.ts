// v0.9.2: the share sheet (file picker, receive mode, nearby devices, transfers).
// v0.9.6: the combined "Quick Share & AirDrop" wording was dropped - the sheet labels each
// device with the protocol it actually speaks (Quick Share, LocalSend, AirDrop) instead of
// promising one name for everything. The strings below are the ones share.ts really shows.
export const english092: Record<string, string> = {
  'Dosya seç veya bırak': 'Choose or drop files',
  'Dosya alımı': 'Receiving',
  'Dosya alımı açılıyor…': 'Starting the receiver…',
  'Dosya alımını aç; gelen dosya için kabul sorulur': 'Turn receiving on; incoming files ask for your approval',
  'Dosya alımını kapat; bilgisayardan dosya göndermeye devam edebilirsin':
    'Turn receiving off; you can still send files from this computer',
  'Alım kapalı': 'Receive is off',
  'Paylaşıma açık': 'Open for sharing',
  'Yakındaki cihazlar': 'Nearby devices',
  'Aynı ağdaki cihazlar burada görünür. Telefonunda Quick Share’i aç.':
    'Devices on the same network appear here. Open Quick Share on your phone.',
  'Aktarılıyor…': 'Transferring…',
  Cihaz: 'Device',
  'Dosya aktarımı': 'File transfer',
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