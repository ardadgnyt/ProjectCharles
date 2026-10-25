export const english087: Record<string, string> = {
  "Y\xFCkl\xFC mod\xFCllerin, h\u0131zl\u0131 a\xE7ma tu\u015Flar\u0131yla": "Your installed modules, with quick open buttons",
  "Y\xFCkleniyor\u2026": "Loading\u2026",
  "Okunamad\u0131": "Could not be read",
  "Mod\xFCl yok": "No modules",
  "Hen\xFCz mod\xFCl yok. Ayarlar \u2192 Mod\xFCller\u2019den bir .zip mod\xFCl y\xFCkleyebilirsin.":
    "No modules yet. You can install a .zip module in Settings \u2192 Modules.",
  "G\xF6sterilecek mod\xFCl yok. D\xFCzenle ile mod\xFCl ekleyebilirsin.":
    "No modules to show. Use Edit to add modules.",
  "Mod\xFClleri d\xFCzenle": "Edit modules",
  "Mod\xFCl yerle\u015Fimi": "Module layout",
  "Mod\xFClleri s\xFCr\xFCkleyip istedi\u011Fin s\u0131raya b\u0131rak.": "Drag the modules into the order you want.",
  "Yeni mod\xFCller eklendik\xE7e alt sat\u0131rlar olu\u015Fur.": "New rows appear as you add more modules.",
  "Mod\xFCl ekle": "Add module",
  "Y\xFCkl\xFC mod\xFCllerinden se\xE7": "Choose from your installed modules",
  "Mod\xFClleri y\xF6net": "Manage modules",
  "Eklenecek ba\u015Fka mod\xFCl yok.": "There are no other modules to add.",
  "Ge\xE7ersiz mod\xFCl kart\u0131 se\xE7imi.": "Invalid module card selection.",
  "G\xF6rseller \u015Fu an yaln\u0131zca GPT, Claude ve Gemini ile \xE7al\u0131\u015F\u0131yor.":
    "Images currently work only with GPT, Claude and Gemini.",
  "Bu sa\u011Flay\u0131c\u0131n\u0131n Charles ba\u011Flant\u0131s\u0131 bu ek t\xFCr\xFCn\xFC desteklemiyor.":
    "Charles\u2019 connection to this provider does not support this type of attachment.",
  "G\xF6rseller PNG, JPG ya da WebP olmal\u0131.": "Images must be PNG, JPG or WebP.",
  "G\xF6rsel bulunamad\u0131; yeniden ekleyin.": "The image was not found; add it again.",
  "G\xF6rsel \xE7ok b\xFCy\xFCk (en fazla 5 MB).": "The image is too large (at most 5 MB).",
  "G\xF6rsel bo\u015F.": "The image is empty.",
  "Bir mesajda en fazla 10 g\xF6rsel g\xF6nderilebilir.": "At most 10 images can be sent in one message.",
  "Belge okunuyor": "Reading the document",
  "G\xF6rsel inceleniyor": "Looking at the image"
};

export const patterns087: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) modül yüklü$/, (_, n) => `${n} ${n === "1" ? "module" : "modules"} installed`],
  [/^(\d+) modül$/, (_, n) => `${n} ${n === "1" ? "module" : "modules"}`],
  [/^(\d+) modül · 3 sütun$/, (_, n) => `${n} ${n === "1" ? "module" : "modules"} \xB7 3 columns`]
];
