const { normalize } = require('../system/desktop.cjs');
// Only explicit local requests are handled here. Other messages go to the model.
function personalCommand(prompt, personal, now = Date.now()) {
  if (typeof prompt !== 'string' || prompt.length > 2500) return null;
  const s = normalize(prompt).replace(/[.!?]+$/, '');
  const remember = prompt.match(/^bunu hatırla\s*:\s*(.+)$/is);
  if (remember) {
    personal.edit('memory-save', { text: remember[1] });
    return 'Hafızama kaydettim. Ayarlar → Hafıza bölümünden düzenleyebilir veya silebilirsin.';
  }
  if (/^(?:hafizami|hatirladiklarini)(?: listele| goster)$/.test(s))
    return (
      personal.data.memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n') ||
      'Henüz hafıza kaydım yok.'
    );
  if (/^(?:hatirlaticilarimi|hatirlaticilari|sayaclari)(?: listele| goster)?$/.test(s))
    return personal.data.reminders.length
      ? personal.data.reminders
          .map(
            (r, i) =>
              `${i + 1}. ${r.title} · ${r.status === 'done' ? 'Tamamlandı' : r.status === 'paused' ? 'Duraklatıldı' : new Date(r.due).toLocaleString('tr-TR')}`,
          )
          .join('\n') + '\n\nKaldırmak için “1 numaralı hatırlatıcıyı sil” yazabilirsin.'
      : 'Kayıtlı hatırlatıcı yok.';
  const remove = s.match(/^(\d+) (?:numarali )?hatirlaticiyi (?:sil|kaldir|iptal et)$/);
  if (remove) {
    const r = personal.data.reminders[Number(remove[1]) - 1];
    if (!r)
      return 'Bu numarada bir hatırlatıcı yok. “Hatırlatıcılarımı göster” yazarak listeyi görebilirsin.';
    personal.edit('reminder-delete', { id: r.id });
    return `“${r.title}” hatırlatıcısını kaldırdım.`;
  }
  if (/^(?:odak sayacini|odaklanmayi) (?:duraklat|devam ettir|surdur)$/.test(s)) {
    const pause = s.endsWith('duraklat');
    const r = [...personal.data.reminders]
      .reverse()
      .find((r) => r.kind === 'focus' && r.status === (pause ? 'active' : 'paused'));
    if (!r) return 'Bu işlem için uygun bir odak sayacı yok.';
    personal.edit('timer-toggle', { id: r.id });
    return pause ? 'Odak sayacını duraklattım.' : 'Odak sayacı devam ediyor.';
  }
  if (
    /\b(?:nasil|ornek|kod|komut\w*|yaz|kurma|hatirlatma|odaklanma|istemi|istemiyorum|anlat|nedir)\b/.test(
      s,
    ) ||
    /[\n`]/.test(s) ||
    /^["“]/.test(s)
  )
    return null;
  // Require a request, not a verb prefix inside ordinary conversation.
  const reminder =
    /\bhatirlatici\b.*\b(?:kur|kurar misin|ekle|olustur)\b/.test(s) ||
    /\bhatirlat(?:ir misin)?$/.test(s);
  const durationPattern = /\d+(?:[.,]\d+)?\s*(?:saniye|sn|dakika|dk|saat)\b/g;
  const focusRequest = s.replace(/^(?:(?:charles|bana|lutfen)[, ]+)+/, '');
  const focusSkeleton = focusRequest
    .replace(durationPattern, ' ')
    .replace(/\b(?:boyunca|sureyle|bir)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const timedFocus =
    /\d/.test(focusRequest) &&
    /^(?:odaklan|odaklanalim|odaklanmak istiyorum|odaklanacagim)$/.test(focusSkeleton);
  const explicitTimer = /^odak sayaci(?:ni)? (?:baslat|kur|baslatir misin|kurar misin)$/.test(
    focusSkeleton,
  );
  const focus = timedFocus || explicitTimer;
  if (!reminder && !focus) return null;
  if (
    /\b(?:yarin|bugun|haftaya|pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar)\b|\d{1,2}:\d{2}/.test(
      s,
    )
  )
    return 'Şimdilik süreyle hatırlatıcı kurabiliyorum. Örneğin: “2 saat sonra toplantıyı hatırlat”.';
  const durations = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*(saniye|sn|dakika|dk|saat)\b/g)];
  if (!durations.length)
    return 'Ne kadar sonra hatırlatayım? Örneğin: “5 dakika sonra su içmeyi hatırlat” veya “25 dakika odaklan”.';
  const ms = durations.reduce(
    (n, m) =>
      n +
      Number(m[1].replace(',', '.')) *
        { saniye: 1000, sn: 1000, dakika: 60000, dk: 60000, saat: 3600000 }[m[2]],
    0,
  );
  if (ms < 1000 || ms > 366 * 86400000) return 'Süre 1 saniye ile 366 gün arasında olmalı.';
  let title = focus
    ? 'Odak süren tamamlandı. Mola zamanı!'
    : prompt
        .replace(/\d+(?:[.,]\d+)?\s*(saniye|sn|dakika|dk|saat)\b/gi, '')
        .replace(/sonrasına|sonrasinda|sonrasında|sonra/gi, '')
        .replace(/(?:bana\s+)?(?:bir\s+)?hatırlatıcı\s+(?:kurar mısın|kur|ekle|oluştur)/gi, '')
        .replace(/hatırlat(?:ır mısın)?[.!?]?/gi, '')
        .replace(/^(?:bana|lütfen)\s+/i, '')
        .trim();
  if (!title) title = 'Hatırlatma zamanı geldi.';
  personal.edit('reminder-add', {
    title: title.slice(0, 200),
    due: now + ms,
    kind: focus ? 'focus' : 'reminder',
  });
  return `${focus ? 'Odak sayacını başlattım' : 'Hatırlatıcıyı kurdum'}: **${title}**\n\n${new Date(now + ms).toLocaleString('tr-TR')} tarihinde bildireceğim. Charles’ın açık kalması gerekiyor. “Hatırlatıcılarımı göster” diyerek kontrol edebilirsin.`;
}
module.exports = { personalCommand };
