// v1.0.0: chat, composer, history and dialogs (design pass). Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english100DChat: Record<string, string> = {
  // status lines without emoji or exclamation marks; one name for one action ("Yeni sohbet")
  'Belgeyi okuyorum…': 'Reading the document…',
  'Yeni sohbet hazır.': 'New chat ready.',
  'Yeni sohbet. Seçili proje üzerinden başlayabiliriz.': 'New chat. We can start on the selected project.',
  // the picture card: no printed percentage, only the usual time left
  'yaklaşık {n} sn kaldı': 'about {n} s left',
  // a queued instruction with files
  '{n} dosya': '{n} files',
  // the chat history header's "Düzenle" menu
  'AI ile otomatik': 'Automatic with AI',
  // the colour picker's shades row
  Tonlar: 'Shades',
  // the first keyboard stop (CH-532)
  'Mesaj kutusuna geç': 'Skip to the message box',
  // (bughunt) the answer's read-aloud button, now translated like its Kopyala neighbour
  // (an English text the four other tables already hold)
  Seslendir: 'Read the answer aloud',
  // (bughunt) the push-to-talk key field's name (Settings, Shortcuts) had no row
  'Bas-konuş kısayolu': 'Push to talk',
};
export const patterns100DChat: [RegExp, (...m: string[]) => string][] = [
  // the model chosen for the next message, above the composer's model picker (chat/model-note.ts)
  [
    /^Sonraki mesaj: (.+)$/,
    (_, n) => `Next message: ${n.replace(/Otomatik/g, 'Auto').replace('Önce hesap bağla', 'Connect an account first')}`,
  ],
];
