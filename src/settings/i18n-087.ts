// v0.8.7: English for the "Modüller" card and the image messages of the Claude / Gemini
// connections. The other languages (de, fr, es, zh) translate from this English (src/settings/lang/*).
export const english087: Record<string, string> = {
  "Yüklü modüllerin, hızlı açma tuşlarıyla": "Your installed modules, with quick open buttons",
  "Yükleniyor…": "Loading…",
  "Okunamadı": "Could not be read",
  "Modül yok": "No modules",
  "Henüz modül yok. Ayarlar → Modüller’den bir .zip modül yükleyebilirsin.": "No modules yet. You can install a .zip module in Settings → Modules.",
  "Gösterilecek modül yok. Düzenle ile modül ekleyebilirsin.": "No modules to show. Use Edit to add modules.",
  "Modülleri düzenle": "Edit modules",
  "Modül yerleşimi": "Module layout",
  "Modülleri sürükleyip istediğin sıraya bırak.": "Drag the modules into the order you want.",
  "Yeni modüller eklendikçe alt satırlar oluşur.": "New rows appear as you add more modules.",
  "Modül ekle": "Add module",
  "Yüklü modüllerinden seç": "Choose from your installed modules",
  "Modülleri yönet": "Manage modules",
  "Eklenecek başka modül yok.": "There are no other modules to add.",
  "Geçersiz modül kartı seçimi.": "Invalid module card selection.",
  "Görseller şu an yalnızca GPT, Claude ve Gemini ile çalışıyor.": "Images currently work only with GPT, Claude and Gemini.",
  "Bu sağlayıcının Charles bağlantısı bu ek türünü desteklemiyor.": "Charles’ connection to this provider does not support this type of attachment.",
  "Görseller PNG, JPG ya da WebP olmalı.": "Images must be PNG, JPG or WebP.",
  "Görsel bulunamadı; yeniden ekleyin.": "The image was not found; add it again.",
  "Görsel çok büyük (en fazla 5 MB).": "The image is too large (at most 5 MB).",
  "Görsel boş.": "The image is empty.",
  "Bir mesajda en fazla 10 görsel gönderilebilir.": "At most 10 images can be sent in one message.",
  "Belge okunuyor": "Reading the document",
  "Görsel inceleniyor": "Looking at the image",
};
export const patterns087: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) modül yüklü$/, (_, n) => `${n} ${n === '1' ? 'module' : 'modules'} installed`],
  [/^(\d+) modül$/, (_, n) => `${n} ${n === '1' ? 'module' : 'modules'}`],
  [/^(\d+) modül · 3 sütun$/, (_, n) => `${n} ${n === '1' ? 'module' : 'modules'} · 3 columns`],
];
