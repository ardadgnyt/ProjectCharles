// v1.0.0: the app window. Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100Panel: Record<string, string> = {
  // dpanel: "Düzeni sıfırla" in the home page's edit mode
  'Düzeni sıfırla': 'Reset layout',
  'Evet, sıfırla': 'Yes, reset',
  'Varsayılan düzene dönülsün mü?': 'Go back to the default layout?',
  'Kartlar ilk yerlerine döner, kaldırdıkların geri gelir.': 'Cards return to their first places, and the ones you removed come back.',
};
export const patterns100Panel: [RegExp, (...m: string[]) => string][] = [];
