// Parses explicit mail/calendar/drive/Home Assistant requests from chat.
function parse(text) {
  const t = String(text).trim();
  if (t.length > 400 || t.includes('\n')) return null;
  const control =
    /^\/(?:home|ev)\s+([a-z_]+\.[a-zA-Z0-9_]+)\s+(turn_on|turn_off|toggle|media_play|media_pause|open_cover|close_cover|stop_cover|lock|unlock|trigger)$/.exec(
      t,
    );
  if (control) return { entity: control[1], action: control[2] };
  const direct =
    /^\/(gmail|outlook|calendar|outlook-calendar|drive|school|home)(?:\s+(.{0,300}))?$/.exec(t);
  if (direct) return { kind: direct[1], query: direct[2] || '' };
  const q = t.toLocaleLowerCase('tr-TR').replace(/[?!.]+$/, '');
  for (const [pattern, kind] of [
    [
      /^(gmail(?:'deki)? (?:maillerimi|postalarımı|gelen kutumu) (?:göster|listele)|show my gmail)$/,
      'gmail',
    ],
    [
      /^(outlook(?:'taki)? (?:maillerimi|postalarımı|gelen kutumu) (?:göster|listele)|show my outlook)$/,
      'outlook',
    ],
    [/^(okul (?:maillerimi|postalarımı) (?:göster|listele)|show my school mail)$/, 'school'],
    [/^(takvimimi göster|bu haftaki etkinliklerimi göster|show my calendar)$/, 'calendar'],
    [/^(evdeki cihazları (?:göster|listele)|show my home devices)$/, 'home'],
  ])
    if (pattern.test(q)) return { kind, query: '' };
  return natural(t);
}
module.exports = { parse, natural, resolveHome, mailQuestion };

function norm(value) {
  return String(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function natural(text) {
  // v0.7.0: "maillerimde fatura ara", "dün gelen mailleri göster" (keyword / date search)
  const search = require('./mail-search.cjs').parseMailSearch(text);
  if (search) return search;
  const q = norm(text)
    .replace(/[?!.]+$/, '')
    .replace(/^(?:hey charles[, ]*|charles[, ]*|lutfen |simdi |bana )+/, '')
    .replace(/,\s*/g, ' ')
    .replace(/\s+lutfen$/, '');
  if (q.length > 240 || /[\n"“”]/.test(q)) return null;
  // A read request can contain a second question ("önemli bir mail var mı?").
  // Keep the account explicit and match the entire request so quoted stories,
  // setup questions and send/delete commands cannot become mailbox reads.
  const inbox =
    /^(?:(okul|gmail|outlook)(?: hesabimdaki)? )?(?:e-postami|e-postalarimi|mailimi|maillerimi|postalarimi|gelen kutumu|gelen mailleri) (.+)$/.exec(
      q,
    );
  if (inbox) {
    const tail = inbox[2]
      .replace(/[?!.;,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const check =
      '(?:kontrol (?:et|eder misin|edebilir misin|edip)|incele|inceler misin|bak|bakar misin)';
    const important =
      '(?:(?:gelen )?(?:onemli|yeni|acil) (?:bir )?(?:mail|e-posta|mesaj) var mi(?: gelen)?)';
    const summarize = '(?:ozetle|ozetler misin|ozetleyebilir misin|kisaca ozetle)';
    if (
      new RegExp(
        '^(?:' +
          check +
          '(?: (?:ve )?(?:' +
          important +
          '|' +
          summarize +
          '))?|' +
          important +
          '|' +
          summarize +
          ')$',
      ).test(tail)
    )
      return {
        kind: inbox[1] === 'okul' ? 'school' : inbox[1] || 'mail',
        query: '',
        summary: true,
      };
  }
  const importantInbox =
    /^(okul|gmail|outlook) (?:mailimde|maillerimde|postalarimda|gelen kutumda) (?:onemli|yeni|acil) (?:bir )?(?:mail|e-posta|mesaj) var mi(?: gelen)?$/.exec(
      q,
    );
  if (importantInbox)
    return {
      kind: importantInbox[1] === 'okul' ? 'school' : importantInbox[1],
      query: '',
      summary: true,
    };
  if (
    /^(?:maillerimi|postalarimi|gelen mailleri) (?:ozetle|ozetler misin|ozetleyebilir misin)$/.test(
      q,
    )
  )
    return { kind: 'mail', query: '', summary: true };
  const englishMail =
    /^(?:please )?(summarize|read|show) my (?:(school|gmail|outlook) )?(?:mail|emails|latest email)$/.exec(
      q,
    );
  if (englishMail)
    return {
      kind: englishMail[2] === 'school' ? 'school' : englishMail[2] || 'mail',
      query: '',
      summary: englishMail[1] === 'summarize',
      latest: q.endsWith('latest email'),
    };
  const summary =
    /^(okul|gmail|outlook) (?:e-postalarimi|maillerimi|mailimi|postalarimi|son maillerimi)(?: kontrol (?:et|edip))? (?:ozetle|ozetler misin|ozetleyebilir misin)$/.exec(
      q,
    );
  if (summary)
    return { kind: summary[1] === 'okul' ? 'school' : summary[1], query: '', summary: true };
  const mail =
    /^(okul|gmail|outlook) (?:e-postami|e-postalarimi|mailimi|maillerimi|postalarimi|gelen kutumu)(?: kontrol (?:et|edip))?(?: (?:son|en son) gelen (?:maili|e-postayi|mesaji))? (goster|listele|soyle|soyler misin|gosterir misin|kontrol et|kontrol eder misin|oku|okur musun)$/.exec(
      q,
    );
  if (mail)
    return {
      kind: mail[1] === 'okul' ? 'school' : mail[1],
      query: '',
      latest: /son gelen|\boku|okur/.test(q),
    };
  const latest =
    /^(okul|gmail|outlook)(?: hesabima| mailime)? (?:en son|son) gelen (?:maili|e-postayi|mesaji) (?:goster|soyle|soyler misin|oku|okur musun)$/.exec(
      q,
    );
  if (latest) return { kind: latest[1] === 'okul' ? 'school' : latest[1], query: '', latest: true };
  const question = mailQuestion(q);
  if (question) return question;
  const explicit = /^home ?ass?istan(?:t)?(?: ile| uzerinden)? /.test(q);
  const h = q.replace(/^home ?ass?istan(?:t)?(?: ile| uzerinden)? /, '');
  const control =
    /^(.{1,100}?) (ac|kapat|acabilir misin|kapatabilir misin|acar misin|kapatir misin)$/.exec(h);
  if (
    !control ||
    (!explicit &&
      !/lamba|isik|avize|priz|perde|panjur|fan|vantilator|klima|televizyon|light|switch/.test(
        control[1],
      ))
  )
    return null;
  if (
    !/^[a-z0-9_. -]+$/.test(control[1]) ||
    /\b(?:nasil|neden|ornek[a-z]*|hikaye[a-z]*|dedim|dedi|acma|kapatma)\b/.test(control[1])
  )
    return null;
  return { homeName: control[1], action: control[2].startsWith('ac') ? 'turn_on' : 'turn_off' };
}
function resolveHome(request, rows) {
  const target = norm(request.homeName),
    matches = rows.filter((r) => {
      const names = [norm(r.title), norm(r.id)];
      return names.some((n) => [n, n + 'i', n + 'u', n + 'ni', n + 'nu'].includes(target));
    });
  if (matches.length !== 1)
    return {
      message: matches.length
        ? 'Birden fazla cihaz eşleşti. Cihaz adını daha açık yaz: ' +
          matches.map((r) => r.title + ' (' + r.id + ')').join(', ')
        : 'Bu adla Home Assistant cihazı bulunamadı. “Evdeki cihazları göster” yazarak kayıtlı adları görebilirsin.',
    };
  const device = matches[0];
  if (['unavailable', 'unknown'].includes(device.text))
    return { message: device.title + ' şu anda Home Assistant’ta erişilemez görünüyor.' };
  return {
    entity: device.id,
    title: device.title,
    action: device.id.startsWith('cover.')
      ? request.action === 'turn_on'
        ? 'open_cover'
        : 'close_cover'
      : request.action,
  };
}

// Everyday read-only questions about the user's mail, phrased freely:
// "gelen önemli bir mail var mı bana", "hotmailime yeni mail geldi mi", "son maillerim neler".
// They must mention mail AND ask to look/check/list; anything that writes, sends,
// deletes, asks how to set up, negates ("bakma") or quotes/translates is left to the AI.
function mailQuestion(q) {
  if (q.length > 160) return null;
  const mailWord =
    /(?:^|\s)(?:e-?posta\w*|mail\w*|maıl\w*|hotmail\w*|gmail\w*|outlook\w*|posta(?:lar)?\w*|gelen kutu\w*|inbox)(?=\s|$)/;
  if (!mailWord.test(q)) return null;
  if (
    /(?:gonder|yolla|sil\b|silebilir|yaz\b|yazar mi|yazabilir|cevapla|yanitla|taslak|ilet\b|nasil|bagla|kurulum|kurabilir|ayar|sifre|ornek|hikaye|cevir|dedim|dedi\b|diye|etme\b|bakma\b|okuma\b|acma\b|kontrol etme)/.test(
      q,
    )
  )
    return null;
  if (
    !/(?:var mi|geldi mi|gelmis mi|gelen|bak\b|bakar|bakabilir|kontrol|goster|listele|ozetle|ozetler|oku\b|okur|okuyabilir|neler|ne var|kimden|son mail|yeni mail)/.test(
      q,
    )
  )
    return null;
  const kind = /\b(?:okul|school)\b/.test(q)
    ? 'school'
    : /gmail|google/.test(q)
      ? 'gmail'
      : /outlook|hotmail|live\.com|microsoft/.test(q)
        ? 'outlook'
        : 'mail';
  return { kind, query: '', summary: true, ...(/onemli|acil/.test(q) ? { important: true } : {}) };
}
