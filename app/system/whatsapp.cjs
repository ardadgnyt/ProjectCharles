// v0.7.2: "WhatsApp'tan Ahmet'e 'geliyorum' mesajını at" — typed or spoken.
// Opens WhatsApp Desktop with the message written in the chat of the saved contact
// (Ayarlar → Eklentiler → WhatsApp kişileri) and, when "send automatically" is on, presses
// Enter in WhatsApp to send it. Without a saved number WhatsApp opens with the message and
// the user picks the person. Nothing goes through an AI.
const path = require('node:path');
const { readStore, writeStore } = require('../core/store.cjs');

const lower = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const WA = "(?:whatsapp|whats app|watsap|vatsap|wp|wapp)(?:'?(?:tan|dan|ta|da|la|le|tan bana))?";
const VERB =
  '(?:at|atar mısın|atar misin|atsana|gönder|gonder|gönderir misin|gonderir misin|gönder bakalım|yolla|yollar mısın|yollar misin|yaz|yazar mısın|yazar misin|ilet|söyle|soyle|de)';
// "anneme", "babama": family words without an apostrophe
const FAMILY = {
  anneme: 'Annem',
  babama: 'Babam',
  kardeşime: 'Kardeşim',
  kardesime: 'Kardeşim',
  eşime: 'Eşim',
  esime: 'Eşim',
  ablama: 'Ablam',
  abime: 'Abim',
  ağabeyime: 'Ağabeyim',
  dedeme: 'Dedem',
  nenene: 'Nenem',
  anneanneme: 'Anneannem',
  babaanneme: 'Babaannem',
  teyzeme: 'Teyzem',
  halama: 'Halam',
  dayıma: 'Dayım',
  amcama: 'Amcam',
  sevgilime: 'Sevgilim',
};

function cleanMessage(s) {
  return String(s || '')
    .replace(/\s+(?:diye|şeklinde|seklinde)$/u, '')
    .replace(/\s+(?:mesajını|mesajini|mesajı|mesaji|mesaj|yazısını|yazisini)$/u, '')
    .replace(/\s+(?:diye|şeklinde|seklinde)$/u, '')
    .replace(/^["“”'«]+|["“”'»]+$/g, '')
    .trim();
}
function cleanName(s) {
  const t = String(s || '').trim();
  if (FAMILY[t]) return FAMILY[t];
  return t
    .replace(/'(?:y?e|y?a|n?e|n?a)$/u, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();
}

/** → { to, message } or null. Works on the original text so the message keeps its letters. */
function parseWhatsApp(text) {
  const original = String(text || '').replace(/\s+/g, ' ').trim();
  const t = lower(original).replace(/[.!?]+$/, '');
  if (!new RegExp('(?:^|\\s)' + WA + '(?:\\s|$)').test(t) || t.length > 600) return null;
  // English: "send hello to John on WhatsApp", "WhatsApp John saying hello"
  let m = t.match(new RegExp(`^(?:please\\s+)?(?:send|text)\\s+(.+?)\\s+to\\s+(.+?)\\s+(?:on|via|over)\\s+${WA}$`));
  if (m) return pick(original, t, m[2], m[1]);
  m = t.match(new RegExp(`^${WA}\\s+(.+?)\\s+(?:saying|that)\\s+(.+)$`));
  if (m) return pick(original, t, m[1], m[2]);
  // Turkish: put the WhatsApp words aside, then "<kişi>'e <mesaj> (mesajını) <fiil>"
  const rest = t
    .replace(/^(?:hey\s+)?charles[,\s]+/, '')
    .replace(/^(?:lütfen|lutfen)\s+/, '')
    .replace(new RegExp('(?:^|\\s)' + WA + '(?:\\s+(?:üzerinden|uzerinden|ile))?(?=\\s|$)'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
  m = rest.match(new RegExp(`^(\\S+?'(?:y?e|y?a|n?e|n?a)|${Object.keys(FAMILY).join('|')})\\s+(.+?)\\s+${VERB}$`, 'u'));
  if (m) return pick(original, t, m[1], m[2]);
  // "<mesaj> diye <kişi>'e mesaj at"
  m = rest.match(new RegExp(`^(.+?)\\s+diye\\s+(\\S+?'(?:y?e|y?a|n?e|n?a)|${Object.keys(FAMILY).join('|')})\\s+(?:mesaj\\s+)?${VERB}$`, 'u'));
  if (m) return pick(original, t, m[2], m[1]);
  // no person: "WhatsApp'tan 'geliyorum' mesajını at"
  m = rest.match(new RegExp(`^(.+?)\\s+(?:mesajını|mesajini|mesajı|mesaji)\\s+${VERB}$`, 'u'));
  if (m) return pick(original, t, '', m[1]);
  return null;
}
// keeps the message as typed (upper case, Turkish letters) by finding it in the original text
function pick(original, t, who, msg) {
  let message = cleanMessage(msg);
  const at = t.indexOf(message);
  if (at >= 0 && original.length >= t.length) {
    const slice = original.slice(at, at + message.length);
    if (lower(slice) === message) message = slice;
  }
  message = cleanMessage(message);
  // "Ahmet'e mesaj at" without a message: let the AI ask what to write
  if (!message || /^(?:bir\s+)?(?:mesaj|bi mesaj|message|a message)$/i.test(message)) return null;
  const to = cleanName(who);
  return { to: to ? to.charAt(0).toLocaleUpperCase('tr-TR') + to.slice(1) : '', message };
}

// ── saved contacts ─────────────────────────────────────────────────────────────
class WhatsAppContacts {
  constructor(dir) {
    this.file = path.join(dir, 'whatsapp.json');
    const loaded = readStore(this.file, (v) => v && typeof v === 'object' && Array.isArray(v.contacts));
    this.data = { contacts: [], autoSend: true, ...(loaded.value || {}) };
  }
  read() {
    return this.data;
  }
  save(v) {
    if (!v || typeof v !== 'object') throw Error('Geçersiz WhatsApp ayarı.');
    const contacts = Array.isArray(v.contacts) ? v.contacts : this.data.contacts;
    if (contacts.length > 200) throw Error('En fazla 200 kişi.');
    this.data = {
      autoSend: typeof v.autoSend === 'boolean' ? v.autoSend : this.data.autoSend,
      contacts: contacts.map((c) => {
        const name = String(c?.name || '').trim().slice(0, 60);
        const phone = String(c?.phone || '').replace(/[^\d+]/g, '').replace(/^00/, '+').slice(0, 20);
        if (!name || !/^\+?\d{8,16}$/.test(phone))
          throw Error('Her kişi için ad ve ülke koduyla telefon numarası yaz (ör. +905551112233).');
        return { name, phone };
      }),
    };
    writeStore(this.file, this.data);
    return this.data;
  }
  find(name) {
    const q = lower(name);
    if (!q) return null;
    const all = this.data.contacts;
    return (
      all.find((c) => lower(c.name) === q) ||
      all.find((c) => lower(c.name).startsWith(q)) ||
      all.find((c) => lower(c.name).split(' ').includes(q)) ||
      null
    );
  }
}

/** Opens WhatsApp with the message and, if allowed, sends it. → message for the chat */
async function sendWhatsApp(cmd, { contacts, openExternal, pressEnter, en = false }) {
  const contact = cmd.to ? contacts.find(cmd.to) : null;
  const phone = contact?.phone.replace(/^\+/, '') || '';
  const text = encodeURIComponent(cmd.message);
  const app = 'whatsapp://send?' + (phone ? 'phone=' + phone + '&' : '') + 'text=' + text;
  try {
    await openExternal(app);
  } catch {
    // no WhatsApp Desktop: WhatsApp Web
    await openExternal('https://wa.me/' + phone + '?text=' + text);
    return en
      ? `WhatsApp Desktop was not found, so WhatsApp Web opened with your message${contact ? ' to ' + contact.name : ''}. Press send there.`
      : `WhatsApp Desktop bulunamadı; mesajın${contact ? ' ' + contact.name + ' için' : ''} WhatsApp Web’de açıldı. Orada gönder’e bas.`;
  }
  if (!contact) {
    const hint = cmd.to
      ? en
        ? `I don't have a number for “${cmd.to}”. `
        : `“${cmd.to}” için kayıtlı numara yok. `
      : '';
    return en
      ? `${hint}WhatsApp opened with the message “${cmd.message}”: pick the person and press send. You can save numbers in Settings → Plugins → WhatsApp contacts.`
      : `${hint}WhatsApp “${cmd.message}” mesajıyla açıldı: kişiyi seçip gönder’e bas. Numaraları Ayarlar → Eklentiler → WhatsApp kişileri’ne kaydedebilirsin.`;
  }
  if (contacts.read().autoSend && pressEnter) {
    const sent = await pressEnter().catch(() => false);
    if (sent)
      return en
        ? `Sent on WhatsApp to **${contact.name}**: “${cmd.message}”`
        : `WhatsApp’ta **${contact.name}** kişisine gönderildi: “${cmd.message}”`;
  }
  return en
    ? `WhatsApp opened with your message to **${contact.name}**: “${cmd.message}”. Press send.`
    : `WhatsApp’ta **${contact.name}** sohbeti mesajınla açıldı: “${cmd.message}”. Gönder’e bas.`;
}

/** Runs a short PowerShell script on Windows and resolves its output. */
function runPowerShell(script) {
  const { execFile } = require('node:child_process');
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve('');
    execFile(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000 },
      (err, out) => resolve(err ? '' : String(out || '')),
    );
  });
}

/** Windows: wait for WhatsApp to come to the front, then press Enter once. */
function pressEnterInWhatsApp(run = runPowerShell) {
  const script = [
    '$ws = New-Object -ComObject WScript.Shell',
    'Start-Sleep -Milliseconds 2200',
    '$ok = $false',
    'for ($i = 0; $i -lt 10 -and -not $ok; $i++) { $ok = $ws.AppActivate("WhatsApp"); if (-not $ok) { Start-Sleep -Milliseconds 400 } }',
    'if ($ok) { Start-Sleep -Milliseconds 500; $ws.SendKeys("{ENTER}"); "sent" } else { "no" }',
  ].join('; ');
  return run(script).then((out) => /sent/.test(String(out)));
}

module.exports = { runPowerShell, parseWhatsApp, WhatsAppContacts, sendWhatsApp, pressEnterInWhatsApp };
