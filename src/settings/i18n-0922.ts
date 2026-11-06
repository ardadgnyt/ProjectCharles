// v0.9.22: the push-to-talk key in Settings.
export const english0922: Record<string, string> = {
  'Tek tuşa ya da iki tuşa birlikte bas. Esc ile vazgeç.': 'Press one key, or two keys together. Press Esc to cancel.',
  'Kısayol kaydedildi.': 'Shortcut saved.',
  DOSYA: 'FILE',
  'Bu tuş desteklenmiyor. Ok, F veya Ctrl/Alt ile bir birleşim seç.': 'This key is not supported. Choose an arrow, an F key or a combination with Ctrl/Alt.',
  'Bu tuş tek başına kullanılamaz; yazmayı bozardı. Ok, F veya Ctrl/Alt ile bir birleşim seç.': 'This key cannot be used alone; it would get in the way of typing. Choose an arrow, an F key or a combination with Ctrl/Alt.',
  'Bir kısayolda en fazla iki tuş olabilir.': 'A shortcut can have at most two keys.',
  'İki tuşlu birleşime Ctrl, Alt veya Shift eklenemez.': 'Ctrl, Alt or Shift cannot be added to a two-key combination.',
  'İki tuşlu birleşimde yalnızca ok, gezinme ve F tuşları kullanılabilir.': 'A two-key combination can only use arrow, navigation and F keys.',
};
export const patterns0922: [RegExp, (...a: string[]) => string][] = [
  [/^Bu kısayol zaten kullanılıyor: (.+)\. Başka bir tuş seç\.$/, (_, name) => `This shortcut is already used: ${name}. Choose another key.`],
];
