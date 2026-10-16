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
async function sendWhatsApp(cmd, { contacts, openExternal, automate, en = false }) {
  const contact = cmd.to ? contacts.find(cmd.to) : null;
  const phone = contact?.phone.replace(/^\+/, '') || '';
  const text = encodeURIComponent(cmd.message);
  const autoSend = !!contacts.read().autoSend;
  const sentText = (who) =>
    en ? `Sent on WhatsApp to **${who}**: “${cmd.message}”` : `WhatsApp’ta **${who}** kişisine gönderildi: “${cmd.message}”`;
  const typedText = (who) =>
    en
      ? `WhatsApp opened the chat with **${who}** and wrote “${cmd.message}”. Press send.`
      : `WhatsApp’ta **${who}** sohbeti açıldı ve “${cmd.message}” yazıldı. Gönder’e bas.`;
  const web = async () => {
    await openExternal('https://wa.me/' + phone + '?text=' + text);
    return en
      ? `WhatsApp Desktop was not found, so WhatsApp Web opened with your message${contact ? ' to ' + contact.name : ''}. Press send there.`
      : `WhatsApp Desktop bulunamadı; mesajın${contact ? ' ' + contact.name + ' için' : ''} WhatsApp Web’de açıldı. Orada gönder’e bas.`;
  };

  // 1) a saved number: open that chat with the text, then press Enter in WhatsApp
  if (contact) {
    try {
      await openExternal('whatsapp://send?phone=' + phone + '&text=' + text);
    } catch {
      return web();
    }
    if (autoSend && automate) {
      const r = await automate({ mode: 'enter' }).catch(() => ({ ok: false }));
      if (r.ok) return sentText(contact.name);
    }
    return typedText(contact.name);
  }

  // 2) only a name: open WhatsApp, search the person (Ctrl+F) and write the message there
  if (cmd.to && automate) {
    try {
      await openExternal('whatsapp://');
    } catch {
      return web();
    }
    const r = await automate({ mode: 'search', name: cmd.to, message: cmd.message, send: autoSend }).catch(() => ({ ok: false }));
    if (r.ok) return r.sent ? sentText(cmd.to) : typedText(cmd.to);
  }

  // 3) nobody named (or the search did not work): WhatsApp opens with the text
  try {
    await openExternal('whatsapp://send?text=' + text);
  } catch {
    return web();
  }
  const hint = cmd.to ? (en ? `I couldn't open the chat with “${cmd.to}”. ` : `“${cmd.to}” sohbetini açamadım. `) : '';
  return en
    ? `${hint}WhatsApp opened with the message “${cmd.message}”: pick the person and press send. You can save numbers in Settings → Plugins → WhatsApp.`
    : `${hint}WhatsApp “${cmd.message}” mesajıyla açıldı: kişiyi seçip gönder’e bas. Numaraları Ayarlar → Eklentiler → WhatsApp’a kaydedebilirsin.`;
}

/** Runs a short PowerShell script on Windows and resolves its output. */
function runPowerShell(script, timeout = 15000) {
  const { execFile } = require('node:child_process');
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve('');
    execFile(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout },
      (err, out) => resolve(err ? '' : String(out || '')),
    );
  });
}

/**
 * Windows automation for WhatsApp Desktop (v0.7.4). The window is found among the visible
 * windows by its title (the Store app's process often has no main window handle, which is why
 * v0.7.3 never pressed Enter), brought to the front and checked, and only then are keys sent.
 *   mode "enter":  the chat is already open with the text → press Enter
 *   mode "search": Ctrl+F, the person's name, Enter (first result), the message, Enter
 * Prints "sent", "typed" or what went wrong ("no-window", "no-focus").
 */
const WA_SCRIPT = String.raw`
$cfg = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__CFG__')))
$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CharlesWa {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public struct RECT { public int Left, Top, Right, Bottom; }
  static bool IsWhatsAppProcess(IntPtr h) {
    uint pid; GetWindowThreadProcessId(h, out pid);
    try { return System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.StartsWith("WhatsApp", StringComparison.OrdinalIgnoreCase); }
    catch { return false; }
  }
  public static IntPtr Find() {
    IntPtr best = IntPtr.Zero; long area = 0; bool bestIsApp = false;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      var t = sb.ToString();
      if (t.IndexOf("WhatsApp", StringComparison.OrdinalIgnoreCase) < 0) return true;
      RECT r; GetWindowRect(h, out r);
      long w = r.Right - r.Left, ht = r.Bottom - r.Top;
      if (w < 300 || ht < 200) return true;   // notifications, tooltips
      // the WhatsApp app itself wins over a browser tab titled "WhatsApp"
      bool app = IsWhatsAppProcess(h) || t.Trim().Equals("WhatsApp", StringComparison.OrdinalIgnoreCase);
      if ((app && !bestIsApp) || (app == bestIsApp && w * ht > area)) { area = w * ht; best = h; bestIsApp = app; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
  public static void Key(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(40); keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Ctrl(byte vk) { keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(40); keybd_event(vk, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero); }
}
'@
Add-Type -TypeDefinition $sig
function Focus-Wa([double]$seconds) {
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    $h = [CharlesWa]::Find()
    if ($h -ne [IntPtr]::Zero) {
      if ([CharlesWa]::IsIconic($h)) { [CharlesWa]::ShowWindow($h, 9) | Out-Null }
      [CharlesWa]::Key(0x12)            # Alt: lets a background process bring a window forward
      [CharlesWa]::SetForegroundWindow($h) | Out-Null
      Start-Sleep -Milliseconds 350
      if ([CharlesWa]::GetForegroundWindow() -eq $h) { return $h }
    }
    Start-Sleep -Milliseconds 500
  }
  return [IntPtr]::Zero
}
if ($cfg.mode -eq 'enter') {
  Start-Sleep -Milliseconds 2400       # WhatsApp opens the chat and writes the text
  $h = Focus-Wa 12
  if ($h -eq [IntPtr]::Zero) { 'no-focus'; exit }
  Start-Sleep -Milliseconds 400
  [CharlesWa]::Key(0x0D)
  'sent'; exit
}
if ($cfg.mode -eq 'search') {
  $h = Focus-Wa 15
  if ($h -eq [IntPtr]::Zero) { 'no-focus'; exit }
  Start-Sleep -Milliseconds 900
  Set-Clipboard -Value $cfg.name
  [CharlesWa]::Ctrl(0x46); Start-Sleep -Milliseconds 500     # Ctrl+F: search
  [CharlesWa]::Ctrl(0x41); Start-Sleep -Milliseconds 150     # Ctrl+A
  [CharlesWa]::Ctrl(0x56); Start-Sleep -Milliseconds 1300    # Ctrl+V: the name
  [CharlesWa]::Key(0x0D); Start-Sleep -Milliseconds 1100     # Enter: first result
  Set-Clipboard -Value $cfg.message
  [CharlesWa]::Ctrl(0x41); Start-Sleep -Milliseconds 150     # replace any draft
  [CharlesWa]::Ctrl(0x56); Start-Sleep -Milliseconds 450
  if ($cfg.send) {
    $h = Focus-Wa 4
    if ($h -eq [IntPtr]::Zero) { 'typed'; exit }
    [CharlesWa]::Key(0x0D)
    'sent'; exit
  }
  'typed'; exit
}
`;
function waScript(cfg) {
  return WA_SCRIPT.replace('__CFG__', Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64'));
}
/** Runs the WhatsApp automation; `clipboard` (Electron) gets its text back afterwards. */
async function automateWhatsApp(cfg, { clipboard, run = (script) => runPowerShell(script, 45000), log = () => {} } = {}) {
  let old = null;
  try {
    old = clipboard?.readText() ?? null;
  } catch {}
  const out = String(await run(waScript(cfg))).trim();
  const result = /\bsent\b/.test(out) ? 'sent' : /\btyped\b/.test(out) ? 'typed' : out.split(/\s+/).pop() || 'no-output';
  log('whatsapp', cfg.mode, result); // never the message or the name
  if (cfg.mode === 'search' && old !== null)
    setTimeout(() => {
      try {
        clipboard.writeText(old);
      } catch {}
    }, 400);
  return { ok: result === 'sent' || result === 'typed', sent: result === 'sent', result };
}

module.exports = { WA_SCRIPT, waScript, automateWhatsApp, runPowerShell, parseWhatsApp, WhatsAppContacts, sendWhatsApp };
