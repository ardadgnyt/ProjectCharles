const { normalize, parseCommand } = require('../system/desktop.cjs');
// Only explicit requests invoke local actions; ordinary discussion falls through to GPT.
async function conversationTools(prompt, { personal, library, desktop, pickFolder, changed }) {
  const raw = prompt.trim().replace(/[.!?]+$/, '');
  const text = normalize(raw).replace(/^(?:charles[, ]+|lutfen )/, '');
  const reply = (message) => ({ message });
  if (
    /^(?:arama (?:icin )?)?klasor (?:ekle|sec)(?:r misin)?$/.test(text) ||
    /^(?:dosya arama|dosyalarimi arama) (?:klasoru|klasorlerini) (?:sec|ekle)$/.test(text)
  ) {
    const folder = await pickFolder();
    if (!folder) return reply('Klasör seçimi iptal edildi.');
    library.add(folder);
    changed();
    return reply('Aramaya ekledim 📁 ' + folder + '\nArtık aradığın dosyayı bana yazabilirsin.');
  }
  if (/^(?:arama klasorlerini|klasorlerimi|aranan klasorleri)(?: (?:goster|listele))?$/.test(text))
    return reply(
      library.roots().length
        ? 'Arama klasörlerin:\n' +
            library
              .roots()
              .map((p) => '• ' + p)
              .join('\n')
        : 'Henüz klasör seçilmedi. “Arama için klasör ekle” yazabilirsin.',
    );
  const folderEdit = raw.match(/^["“](.+?)["”]\s+(?:klasörünü\s+)?aramadan\s+(çıkar|kaldır)$/iu);
  if (folderEdit) {
    const folder = library.roots().find((p) => normalize(p) === normalize(folderEdit[1]));
    if (!folder)
      return reply('Bu klasör arama listesinde yok. “Arama klasörlerini listele” yazabilirsin.');
    library.remove(folder);
    changed();
    return reply('Klasörü aramadan çıkardım. Dosyaların yerinde duruyor.');
  }
  if (/^(?:kisisel )?komutlar(?:imi|i)?(?: (?:goster|listele|duzenle))?$/.test(text))
    return reply(
      (personal.data.commands.length
        ? personal.data.commands
            .map((c) => '• **' + c.phrase + '** → ' + c.apps.join(', '))
            .join('\n')
        : 'Henüz kişisel komut yok.') +
        '\n\nÖğret veya değiştir: Ben “atölyeyi aç” dediğimde Steam ve Spotify aç.\nSil: “atölyeyi aç” komutunu sil.',
    );
  const remove = raw.match(/^["“](.+?)["”]\s+komutunu\s+(?:sil|unut|kaldır)$/iu);
  if (remove) {
    const c = personal.data.commands.find((c) => normalize(c.phrase) === normalize(remove[1]));
    if (!c) return reply('Bu isimde kayıtlı komut yok.');
    personal.edit('command-delete', { id: c.id });
    changed();
    return reply('“' + c.phrase + '” komutunu sildim.');
  }
  const teach = raw.match(/^(?:ben\s+)?["“'](.+?)["”']\s+dediğimde\s+(.+?)\s+aç$/iu);
  if (teach) {
    const names = teach[2]
      .replace(/ uygulamalarını$/iu, '')
      .split(/,|\s+ve\s+/iu)
      .map((n) => n.trim())
      .filter(Boolean);
    const catalog = await desktop.apps();
    const apps = names.map((n) => {
      const parsed = parseCommand(n + ' aç');
      const found = catalog.find((a) => normalize(a.Name) === (parsed?.name || normalize(n)));
      if (!found) throw Error('Uygulama bulunamadı: ' + n);
      return found.Name;
    });
    const old = personal.data.commands.find((c) => normalize(c.phrase) === normalize(teach[1]));
    personal.edit('command-save', { id: old?.id, phrase: teach[1], apps });
    changed();
    return reply(
      (old ? 'Komutu güncelledim' : 'Komutu öğrendim') +
        ' ✨ **' +
        teach[1] +
        '** → ' +
        apps.join(', ') +
        '.',
    );
  }
  if (
    /(?:dosya|pdf|rapor|formul|klasor)/.test(text) &&
    /\b(?:bul|ara|nerede|neredeydi)\b/.test(text)
  ) {
    if (!library.roots().length) {
      const folder = await pickFolder();
      if (!folder)
        return reply('Arama için bir klasör seçmelisin. Hazır olduğunda isteğini tekrar yaz.');
      library.add(folder);
      changed();
    }
    const result = await library.search(prompt);
    return {
      message:
        (result.items.length
          ? 'Bulduğum dosyalar 📁\n' +
            result.items.map((i, n) => `${n + 1}. ${i.name} — ${i.path}`).join('\n')
          : 'Eşleşen dosya bulunamadı.') +
        '\n\n' +
        result.note,
      search: result,
    };
  }
  return null;
}
module.exports = { conversationTools };
