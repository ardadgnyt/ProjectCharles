// Takvim: dates found in important e-mails ("son başvuru 20 Ekim", "toplantı yarın 14:00").
//
// Mail triage (mail-triage.cjs) also returns a deadline for each important mail. Charles then
// asks in the chat whether to put it in the calendar. Accepting adds two Charles reminders
// before the last day (they pop up as island bubbles) and, if wanted, opens an .ics file so
// Windows Takvim / Outlook can add the event to the user's own calendar.
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
function icsFile({ title, at, allDay, note = '' }, now = Date.now()) {
  const start = new Date(at);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProjectCharles//Takvim//TR',
    'BEGIN:VEVENT',
    `UID:${at}-${Math.random().toString(36).slice(2)}@charles`,
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
// personal: Personal instance; dir: where .ics files go; open(file): opens it in Windows.
function deadlineProposal({ mail, deadline, event, personal, dir, open, now = Date.now() }) {
  const parsed = parseDeadline(deadline, now);
  if (!parsed) return null;
  const title = String(event || mail.title || 'E-postadaki tarih')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const text =
    `📅 “${String(mail.title || 'Konusuz').slice(0, 120)}” e-postasında bir tarih yakaladım: ` +
    `**${title}** — ${when(parsed)}. Takvime ekleyip son günden önce adacıktan hatırlatayım mı?`;
  const remind = () => {
    const times = reminderTimes(parsed, Date.now());
    for (const due of times)
      personal.edit('reminder-add', {
        title: `📅 ${title} — ${when(parsed)}`,
        due,
        kind: 'reminder',
      });
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
  return {
    text,
    actions: [
      {
        id: 'calendar',
        label: 'Takvime ekle + hatırlat',
        primary: true,
        run: () => {
          const times = remind();
          fs.mkdirSync(dir, { recursive: true });
          const name =
            title
              .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
              .trim()
              .slice(0, 60) || 'Charles etkinlik';
          const file = path.join(dir, name + '.ics');
          fs.writeFileSync(
            file,
            icsFile({ title, ...parsed, note: 'Kaynak e-posta: ' + (mail.title || '') }),
          );
          open(file);
          return (
            describe(times) +
            ' Takvim dosyasını da açtım; Windows Takvim veya Outlook’ta **Kaydet** demen yeterli.'
          );
        },
      },
      { id: 'remind', label: 'Sadece hatırlat', run: () => describe(remind()) },
      { id: 'no', label: 'Gerek yok', run: () => 'Peki, eklemedim.' },
    ],
  };
}

module.exports = { parseDeadline, reminderTimes, icsFile, deadlineProposal, when };
