// v1.0.0: the default model list. Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100Picker: Record<string, string> = {
  'Hesap bağlı değil. Hesabı bağla ya da başka bir model seç.':
    'Account not connected. Connect it or choose another model.',
  'Bu model artık listede yok. Başka bir model seç.': 'This model is no longer listed. Choose another model.',
  'Modellerde ara': 'Search models',
  'Eşleşen model yok': 'No matching models',
  'Modeller yükleniyor…': 'Loading models…',
  Kullanılamıyor: 'Unavailable',
  'Sabit bir model yok': 'No fixed model',
  'Bağlı yapay zekâ yok. Aşağıdan bir hesap bağla.': 'No AI connected. Connect an account below.',
};
export const patterns100Picker: [RegExp, (...m: string[]) => string][] = [];
