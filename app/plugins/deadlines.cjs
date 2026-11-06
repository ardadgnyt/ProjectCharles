// Takvim: dates found in important e-mails ("son başvuru 20 Ekim", "toplantı yarın 14:00").
//
// Mail triage (mail-triage.cjs) also returns a deadline for each important mail. Charles then
// asks in the chat whether to put it in the calendar. Accepting adds two Charles reminders
// before the last day (they pop up as island bubbles).
//
// v0.9.20: no program is opened unasked. Opening the .ics file was what started Outlook: Windows
// hands the file to its default calendar app, which stays open, and the event exists only once the
// user presses Save there. With a calendar Charles can write to (Google Takvim) the event is added
// directly; without one, the file is a button of its own that says what it does.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// "2026-10-20" or "2026-10-20T14:00" (local time). Returns { at: ms, allDay } or null.
function parseDeadline(value, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value || '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const allDay = m[4] === undefined;
  const date = allDay
    ? new Date(y, mo - 1, d, 23, 59)
    : new Date(y, mo - 1, d, Number(m[4]), Number(m[5]));
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  const at = date.getTime();
  if (!Number.isFinite(at) || at <= now + 30 * 60000 || at > now + 366 * 86400000) return null;
  return { at, allDay };
}

// Reminder times before a deadline: all-day → previous day 10:00 and the day itself 09:00;
// timed → 24 hours and 2 hours before. Times already in the past are skipped.
function reminderTimes({ at, allDay }, now = Date.now()) {
  const list = [];
  if (allDay) {
    const day = new Date(at);
    list.push(
      new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 10, 0).getTime(),
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0).getTime(),
    );
  } else list.push(at - 24 * 3600000, at - 2 * 3600000);
  const future = list.filter((t) => t > now + 60000);
  // Very close deadline: one reminder 15 minutes from now is still better than none.
  if (!future.length && at - now > 20 * 60000) future.push(now + 15 * 60000);
  return future;
}

function when({ at, allDay }) {
  const date = new Date(at);
  const day = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  return allDay
    ? day
    : day + ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

const pad = (n) => String(n).padStart(2, '0');
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsTime = (d) => `${icsDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsText = (s) =>
  String(s || '')
    .replace(/[\\;,]/g, (c) => '\\' + c)
    .replace(/\r?\n/g, '\\n')
    .slice(0, 300);

// A minimal single-event iCalendar file (local "floating" time).
function icsFile({ title, at, allDay, note = '', uid = '' }, now = Date.now()) {
  const start = new Date(at);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProjectCharles//Takvim//TR',
    'BEGIN:VEVENT',
    `UID:${uid || `${at}-${Math.random().toString(36).slice(2)}`}@charles`,
    `DTSTAMP:${icsTime(new Date(now))}`,
  ];
  if (allDay) {
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(next)}`);
  } else lines.push(`DTSTART:${icsTime(start)}`, `DTEND:${icsTime(new Date(at + 3600000))}`);
  lines.push(
    `SUMMARY:${icsText(title)}`,
    ...(note ? [`DESCRIPTION:${icsText(note)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(title)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n') + '\r\n';
}

// Builds the chat proposal for one important mail with a date.
// personal: Personal instance; dir: where .ics files go; open(file): opens it in Windows, resolves
// to an error text or ''. calendar: { name, add(event) } when a calendar can be written, else null.
function deadlineProposal({ mail, deadline, event, personal, dir, open, calendar = null, now = Date.now() }) {
  const parsed = parseDeadline(deadline, now);
  if (!parsed) return null;
  const title = String(event || mail.title || 'E-postadaki tarih')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const text =
    `📅 “${String(mail.title || 'Konusuz').slice(0, 120)}” e-postasında bir tarih yakaladım: ` +
    `**${title}** — ${when(parsed)}. ` +
    (calendar
      ? `${calendar.name}’e ekleyip son günden önce adacıktan hatırlatayım mı?`
      : 'Son günden önce adacıktan hatırlatayım mı?');
  // the same mail and date give the same id: answering twice never makes a second event
  const uid = crypto
    .createHash('sha1')
    .update([mail.id || mail.title || '', title, parsed.at].join('|'))
    .digest('hex');
  const remind = () => {
    const times = reminderTimes(parsed, Date.now());
    const name = `📅 ${title} — ${when(parsed)}`;
    for (const due of times) {
      if (personal.data?.reminders?.some((r) => r.title === name && r.due === due)) continue;
      personal.edit('reminder-add', { title: name, due, kind: 'reminder' });
    }
    return times;
  };
  const describe = (times) =>
    times.length
      ? `Tamam! ${times
          .map((t) =>
            new Date(t).toLocaleString('tr-TR', {
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            }),
          )
          .join(' ve ')} tarihinde adacıktan hatırlatacağım.`
      : 'Son tarih çok yakın; hatırlatma kuramadım.';
  const toCalendar = {
    id: 'calendar',
    label: `${calendar?.name || 'Takvim'}’e ekle + hatırlat`,
    primary: true,
    run: async () => {
      // a calendar that refuses leaves nothing half done, and the question stays for a new try
      const added = await calendar.add({
        title,
        start: parsed.at,
        allDay: parsed.allDay,
        description: 'Kaynak e-posta: ' + (mail.title || ''),
        reminder: 1440,
        uid,
      });
      const first = added?.existed ? `Bu etkinlik ${calendar.name}’de zaten var.` : `${calendar.name}’e ekledim.`;
      return first + ' ' + describe(remind());
    },
  };
  return {
    text,
    actions: [
      ...(calendar ? [toCalendar] : []),
      { id: 'remind', label: calendar ? 'Sadece hatırlat' : 'Hatırlat', primary: !calendar, run: () => describe(remind()) },
      {
        // the only path that opens a program, and only on this button
        id: 'file',
        label: 'Takvim dosyasını aç (Outlook açılabilir)',
        run: async () => {
          fs.mkdirSync(dir, { recursive: true });
          const name =
            title
              .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
              .trim()
              .slice(0, 60) || 'Charles etkinlik';
          const file = path.join(dir, name + '.ics');
          fs.writeFileSync(
            file,
            icsFile({ title, ...parsed, uid, note: 'Kaynak e-posta: ' + (mail.title || '') }),
          );
          const error = await open(file);
          if (error) throw Error('Takvim dosyası açılamadı: ' + error);
          return (
            describe(remind()) +
            ' Takvim dosyasını açtım. Etkinlik, açılan uygulamada **Kaydet** dediğinde takvimine eklenir.'
          );
        },
      },
      { id: 'no', label: 'Gerek yok', run: () => 'Peki, eklemedim.' },
    ],
  };
}

module.exports = { parseDeadline, reminderTimes, icsFile, deadlineProposal, when };
