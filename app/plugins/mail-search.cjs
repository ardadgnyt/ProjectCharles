// v0.7.0: search connected mailboxes by keyword and/or date, typed or spoken.
//   "maillerimde fatura ara", "dün gelen mailleri göster", "geçen hafta Ahmet'ten gelen mailler",
//   "15 Ekim'deki maillerde staj geçen mailleri bul", "search my email for invoice last week".
// parseMailSearch(text, now) → { kind, keywords, since, until, label, summary } | null
// Dates are local-time Date objects; `until` is exclusive.

const MONTHS_TR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_SHORT_EN = MONTHS_EN.map((m) => m.slice(0, 3));

// One character in → one character out, so positions in `fold` match `low`.
function foldChar(c) {
  return { ı: 'i', ş: 's', ç: 'c', ğ: 'g', ö: 'o', ü: 'u', â: 'a', î: 'i', û: 'u' }[c] || c;
}
const fold = (s) => [...s].map(foldChar).join('');

const MAIL_WORD =
  /(?:^|[\s'])(?:e-?posta\w*|e-?mail\w*|mail\w*|maıl\w*|ileti\w*|inbox|gelen kutu\w*|hotmail\w*|gmail\w*|outlook\w*)(?=[\s'?.!,]|$)/;
const WRITE =
  /\b(?:gonder\w*|yolla\w*|sil|silebilir\w*|silsene|yaz|yazar\w*|yazabilir\w*|cevapla\w*|yanitla\w*|taslak\w*|ilet|iletir\w*|nasil|bagla\w*|kurulum\w*|ayarla\w*|sifre\w*|ornek\w*|hikaye\w*|cevir\w*|dedim|dedi|send|delete|reply|forward|draft|write|translate|how do|set up|setup)\b/;
const SEARCH_VERB =
  /\b(?:ara|arat|aratir misin|arar misin|arayabilir misin|araştır|arastir|bul|bulur musun|bulabilir misin|bulsana|search|find|look for|look up)\b/;
const CONTENT_MARK =
  /\b(?:ile ilgili|hakkinda\w*|iceren|gecen (?:mail\w*|e-?posta\w*)|konulu|basligi|konusu|from|about|containing|mentioning)\b|'(?:den|dan|ten|tan) gelen\b/;
const LIST_VERB =
  /\b(?:goster\w*|listele\w*|var mi|geldi mi|gelmis mi|neler|ne var|getir\w*|ac|oku\w*|ozetle\w*|show|list|any|did i get|what)\b/;
const SUMMARY = /\b(?:ozetle\w*|summari[sz]e)\b/;

function day(d, add = 0) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
}
function monthStart(d, add = 0) {
  return new Date(d.getFullYear(), d.getMonth() + add, 1);
}
function monday(d) {
  const x = day(d);
  return day(x, -((x.getDay() + 6) % 7));
}
function fmt(d, en) {
  return d.toLocaleDateString(en ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Finds the first date phrase. Returns { since, until, label, start, end } (positions in fold).
function findDate(f, now) {
  const today = day(now);
  const N = '(\\d{1,3}|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on|one|two|three|four|five|six|seven|eight|nine|ten)';
  const num = (s) =>
    /^\d+$/.test(s)
      ? Number(s)
      : { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }[s] || 1;
  const rules = [
    [/\b(?:son|last|past) N (gun|hafta|ay|days?|weeks?|months?)(?:dir|tir|da|de|ta|te|daki|deki|icinde|icindeki)?\b/, (m) => {
      const n = num(m[1]);
      const unit = m[2];
      const since = /^(?:gun|day)/.test(unit) ? day(today, -(n - 1)) : /^(?:hafta|week)/.test(unit) ? day(today, -(7 * n - 1)) : new Date(today.getFullYear(), today.getMonth() - n, today.getDate() + 1);
      return { since, until: day(today, 1), label: { tr: `son ${n} ${/^(?:gun|day)/.test(unit) ? 'gün' : /^(?:hafta|week)/.test(unit) ? 'hafta' : 'ay'}`, en: `last ${n} ${/^(?:gun|day)/.test(unit) ? 'day' : /^(?:hafta|week)/.test(unit) ? 'week' : 'month'}${n > 1 ? 's' : ''}` } };
    }],
    [/\bN (gun|hafta|ay|days?|weeks?|months?) (?:once|onceki|ago)(?:ki)?\b/, (m) => {
      const n = num(m[1]);
      const u = m[2];
      const d = /^(?:gun|day)/.test(u) ? day(today, -n) : /^(?:hafta|week)/.test(u) ? day(today, -7 * n) : new Date(today.getFullYear(), today.getMonth() - n, today.getDate());
      return { since: d, until: day(d, 1) };
    }],
    [/\b(?:bugun|today)(?:k[iu])?\b/, () => ({ since: today, until: day(today, 1), label: { tr: 'bugün', en: 'today' } })],
    [/\b(?:dun|yesterday)(?:k[iu])?\b/, () => ({ since: day(today, -1), until: today, label: { tr: 'dün', en: 'yesterday' } })],
    [/\b(?:evvelsi gun|onceki gun|day before yesterday)(?:k[iu])?\b/, () => ({ since: day(today, -2), until: day(today, -1) })],
    [/\b(?:bu hafta|this week)(?:ki)?\b/, () => ({ since: monday(today), until: day(today, 1), label: { tr: 'bu hafta', en: 'this week' } })],
    [/\b(?:gecen hafta|last week|previous week)(?:ki)?\b/, () => ({ since: day(monday(today), -7), until: monday(today), label: { tr: 'geçen hafta', en: 'last week' } })],
    [/\b(?:bu ay|this month)(?:ki)?\b/, () => ({ since: monthStart(today), until: day(today, 1), label: { tr: 'bu ay', en: 'this month' } })],
    [/\b(?:gecen ay|last month|previous month)(?:ki)?\b/, () => ({ since: monthStart(today, -1), until: monthStart(today), label: { tr: 'geçen ay', en: 'last month' } })],
    // 15.10.2026, 15/10, 15-10-26
    [/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?:'?(?:de|da|te|ta|deki|daki|teki|taki|tarihli|tarihinde|tarihindeki))?\b/, (m) => exact(Number(m[1]), Number(m[2]) - 1, m[3])],
    // 15 ekim (2026), 15 ekim'de, october 15
    [new RegExp(`\\b(\\d{1,2}) (${MONTHS_TR.join('|')}|${MONTHS_EN.join('|')})(?: (\\d{4}))?(?:'?(?:de|da|te|ta|deki|daki|teki|taki|den|dan|ten|tan|tarihli|tarihinde))?\\b`), (m) => exact(Number(m[1]), monthIndex(m[2]), m[3])],
    [new RegExp(`\\b(${MONTHS_EN.join('|')}|${MON_SHORT_EN.join('|')}) (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`), (m) => exact(Number(m[2]), monthIndex(m[1]), m[3])],
    // ekim ayında, in october
    [new RegExp(`\\b(?:in )?(${MONTHS_TR.join('|')}|${MONTHS_EN.join('|')})(?: ayi\\w*| (\\d{4}))?\\b`), (m) => {
      const mi = monthIndex(m[1]);
      let y = m[2] ? Number(m[2]) : today.getFullYear();
      if (!m[2] && new Date(y, mi, 1) > today) y--;
      return { since: new Date(y, mi, 1), until: new Date(y, mi + 1, 1) };
    }],
  ];
  function monthIndex(s) {
    const i = MONTHS_TR.indexOf(s);
    if (i >= 0) return i;
    const j = MONTHS_EN.indexOf(s);
    return j >= 0 ? j : MON_SHORT_EN.indexOf(s);
  }
  function exact(d, m, y) {
    if (!(m >= 0 && m < 12 && d >= 1 && d <= 31)) return null;
    let year = y ? Number(y.length === 2 ? '20' + y : y) : today.getFullYear();
    let since = new Date(year, m, d);
    if (!y && since > today) since = new Date(--year, m, d);
    return { since, until: day(since, 1) };
  }
  for (const [pattern, make] of rules) {
    const re = new RegExp(pattern.source.replace(/N/g, N));
    const m = re.exec(f);
    if (!m) continue;
    const r = make(m);
    if (!r) continue;
    // "15 ekimden beri / sonra" → open-ended; "… önce" (not "N gün önce") → until
    const after = f.slice(m.index + m[0].length);
    const text = m[0];
    if (/^(?:'?(?:den|dan|ten|tan))? ?(?:beri|sonra|itibaren)\b|^ ?(?:since|onwards)\b/.test(after) || /(?:den|dan|ten|tan)$/.test(text) && /^ ?(?:beri|sonra|itibaren)/.test(after)) {
      const extra = /^(?:'?(?:den|dan|ten|tan))? ?(?:beri|sonra|itibaren|since|onwards)/.exec(after)[0].length;
      return { since: r.since, until: day(today, 1), start: m.index, end: m.index + text.length + extra };
    }
    if (/^ ?(?:once|before)\b/.test(after) && !/(?:gun|hafta|ay|days?|weeks?|months?)$/.test(text)) {
      const extra = /^ ?(?:once|before)/.exec(after)[0].length;
      return { since: null, until: r.since, start: m.index, end: m.index + text.length + extra };
    }
    if (/^(?:since|after) /.test(f.slice(Math.max(0, m.index - 6), m.index)))
      return { since: r.since, until: day(today, 1), start: m.index - 6, end: m.index + text.length };
    return { ...r, start: m.index, end: m.index + text.length };
  }
  return null;
}

// Words that describe the request, not what to look for.
const FILLER = new RegExp(
  '\\b(?:' +
    [
      "hey charles", 'charles', 'lutfen', 'please', 'bana', 'benim', 'my', 'me', 'for', 'the', 'in', 'on', 'all', 'any', 'can you', 'could you', 'i got', 'did i get', 'i received', 'received',
      'okul(?:daki|umdaki|um)?', 'gmail\\w*', 'outlook\\w*', 'hotmail\\w*', 'hesab\\w*', 'school', 'account', 'inbox',
      'e-?posta\\w*', 'e-?mail\\w*', 'mail\\w*', 'ileti\\w*', 'gelen kutu\\w*',
      'ara', 'arat', 'aratir misin', 'arar misin', 'arayabilir misin', 'arastir\\w*', 'bul', 'bulur musun', 'bulabilir misin', 'bulsana', 'search', 'find', 'look for', 'look up',
      'goster\\w*', 'listele\\w*', 'var mi', 'geldi mi', 'gelmis mi', 'neler', 'ne var', 'getir\\w*', 'oku\\w*', 'ozetle\\w*', 'show', 'list', 'summari[sz]e', 'what', 'were', 'was', 'there', 'are', 'is',
      'ile ilgili', 'hakkinda\\w*', 'iceren', 'gecen', 'konulu', 'basligi', 'konusu', 'olan', 'gelen', 'tum', 'butun', 'tarihli', 'tarihinde\\w*', 'about', 'containing', 'mentioning', 'with', 'from', 'that', 'which', 've', 'and', 'icin', 'icinde', 'arasinda', 'bir', 'herhangi', 'hic', 'son', 'yeni',
    ].join('|') +
    ")\\b",
  'g',
);

function parseMailSearch(text, now = new Date()) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw.length > 240 || raw.includes('\n')) return null;
  const low = raw.toLocaleLowerCase('tr-TR').replace(/[’`´]/g, "'").replace(/[?!.;]+$/, '');
  const f = fold(low);
  if (!MAIL_WORD.test(f) || WRITE.test(f)) return null;
  if (/\b(?:etme|bakma|arama|bulma|gosterme)\b/.test(f)) return null; // negated
  const date = findDate(f, now);
  const searching = SEARCH_VERB.test(f) || CONTENT_MARK.test(f);
  if (!searching && !(date && LIST_VERB.test(f))) return null;

  // Exact phrase in quotes wins.
  let keywords = '';
  const quoted = /["“”«]([^"“”»]{1,80})["“”»]/.exec(raw);
  if (quoted) keywords = quoted[1].trim();
  else {
    // Work on the original letters, with the date phrase cut out.
    let work = low;
    let w = f;
    if (date) {
      work = work.slice(0, date.start) + ' ' + work.slice(date.end);
      w = w.slice(0, date.start) + ' ' + w.slice(date.end);
    }
    // "Ahmet'ten gelen" / "from ahmet": the sender is the keyword
    const sender = /(\S+?)'?(?:den|dan|ten|tan) gelen\b/.exec(w) || /\bfrom (\S+)/.exec(w);
    if (sender && !MAIL_WORD.test(' ' + sender[1] + ' ')) {
      const i = sender.index + (sender[0].startsWith('from ') ? 5 : 0);
      keywords = work.slice(i, i + sender[1].length);
    } else {
      // remove filler on the folded copy, keep the same characters from the original
      const keep = [...w];
      FILLER.lastIndex = 0;
      let m;
      while ((m = FILLER.exec(w))) for (let i = m.index; i < m.index + m[0].length; i++) keep[i] = ' ';
      keywords = [...work]
        .map((c, i) => (keep[i] === ' ' ? ' ' : c))
        .join('')
        .replace(/'\S*/g, ' ') // case endings after an apostrophe
        .replace(/[,:;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    keywords = keywords.replace(/'\S*$/, '').replace(/^["']|["']$/g, '').trim();
  }
  if (keywords.length > 80) keywords = keywords.slice(0, 80);
  if (!keywords && !date) return null;
  const kind = /\b(?:okul\w*|school)\b/.test(f)
    ? 'school'
    : /\bgmail|google\b/.test(f)
      ? 'gmail'
      : /\boutlook|hotmail|microsoft\b/.test(f)
        ? 'outlook'
        : 'mail';
  return {
    kind,
    search: {
      keywords,
      since: date?.since ? date.since.toISOString() : null,
      until: date?.until ? date.until.toISOString() : null,
      label: date?.label || null,
    },
    summary: SUMMARY.test(f),
    query: '',
  };
}

function inRange(row, s) {
  const t = Date.parse(row.date);
  if (!Number.isFinite(t)) return !s.since && !s.until;
  return (!s.since || t >= Date.parse(s.since)) && (!s.until || t < Date.parse(s.until));
}
function matches(row, keywords) {
  if (!keywords) return true;
  const hay = fold(String((row.title || '') + ' ' + (row.from || '') + ' ' + (row.text || '')).toLocaleLowerCase('tr-TR'));
  return fold(keywords.toLocaleLowerCase('tr-TR'))
    .split(/\s+/)
    .filter(Boolean)
    .every((k) => hay.includes(k));
}

function describe(s, en) {
  const parts = [];
  if (s.keywords) parts.push('“' + s.keywords + '”');
  let range = '';
  if (s.label) range = en ? s.label.en : s.label.tr;
  else if (s.since && s.until) {
    const a = new Date(s.since),
      b = new Date(Date.parse(s.until) - 1);
    range = a.toDateString() === b.toDateString() ? fmt(a, en) : fmt(a, en) + ' – ' + fmt(b, en);
  } else if (s.since) range = (en ? 'since ' : '') + fmt(new Date(s.since), en) + (en ? '' : ' tarihinden beri');
  else if (s.until) range = (en ? 'before ' : '') + fmt(new Date(s.until), en) + (en ? '' : ' tarihinden önce');
  return { what: parts.join(' '), range };
}

/** Chat/voice answer listing what was found. */
function formatResults(rows, request, en = false) {
  const s = request.search;
  const { what, range } = describe(s, en);
  const shown = rows.slice(0, 10);
  const head = en
    ? `🔎 ${rows.length ? `Found ${rows.length} email${rows.length > 1 ? 's' : ''}` : 'No emails found'}${what ? ' for ' + what : ''}${range ? ' · ' + range : ''}.`
    : `🔎 ${what ? what + ' için ' : ''}${range ? range + ' ' : ''}${rows.length ? rows.length + ' mail buldum.' : 'mail bulamadım.'}`;
  if (!rows.length)
    return (
      head +
      (en
        ? ' Try other words or a wider date range.'
        : ' Başka bir kelime ya da daha geniş bir tarih aralığı deneyebilirsin.')
    );
  const lines = shown.map((r, i) => {
    const d = Date.parse(r.date);
    const when = Number.isFinite(d)
      ? new Date(d).toLocaleString(en ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    const snippet = String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    return (
      `${i + 1}. **${(r.title || (en ? '(no subject)' : '(Konu yok)')).replace(/\*/g, '')}**` +
      [r.from, when].filter(Boolean).map((x) => ' · ' + x).join('') +
      (r.unread ? (en ? ' · unread' : ' · okunmamış') : '') +
      (snippet ? `\n   ${snippet}` : '')
    );
  });
  const more = rows.length > shown.length ? (en ? `\n\n…and ${rows.length - shown.length} more.` : `\n\n…ve ${rows.length - shown.length} mail daha.`) : '';
  return head + '\n\n' + lines.join('\n') + more;
}

module.exports = { parseMailSearch, formatResults, inRange, matches, fold, findDate };
