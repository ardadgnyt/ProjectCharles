// v1.0.0: every notification card Charles shows in the card window (mail-bubble.cjs) is built here,
// so all kinds share one shape:
//   { id, kind, icon, source?, from?, title, reason?, action?, vars?, t? , ...behaviour fields }
// icon: a name from public/bubble.js ICONS (line icons, never emoji). source: a small line above the
// title only when it says something (Gmail · sender, Quick Share, a module's name); Charles' own cards
// have none. reason: the text. action: the label of the card's click (same as clicking the card).
// t: the fields that are Charles' own Turkish text, translated in the card window (notice-text.cjs);
// vars fill {name} in them. Untrusted text (mail subjects, senders, file names) is never in t.
'use strict';
const PROTOCOLS = { localsend: 'LocalSend', airdrop: 'AirDrop' };
const SOURCES = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  school: 'Okul e-postası',
  calendar: 'Google Takvim',
  'outlook-calendar': 'Outlook Takvim',
};
const ICON_NAMES = [
  'bell', 'timer', 'check', 'alert', 'download', 'mail', 'calendar', 'chat', 'gauge', 'cpu', 'ram',
  'disk', 'puzzle', 'file', 'send', 'lock',
];
const clip = (s, n) => String(s ?? '').slice(0, n);

function card(fields) {
  const out = { kind: 'charles', ...fields };
  if (!ICON_NAMES.includes(out.icon)) delete out.icon;
  return out;
}

/** A reminder or the end of a focus timer (main.cjs showAlert). */
function reminder(item) {
  const focus = item.kind === 'focus';
  if (focus)
    return card({ id: 'charles|reminder|' + item.id, icon: 'timer', title: 'Odak süresi bitti', reason: clip(item.title, 200), t: ['title'] });
  const at = new Date(Number(item.due) || Date.now());
  const time = String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
  return card({ id: 'charles|reminder|' + item.id, icon: 'bell', title: clip(item.title, 200), reason: 'Saat {time} için hatırlatma', vars: { time }, t: ['reason'] });
}

/** After an in-place update: installed (a click shows the release notes) or rolled back. */
function updated({ ok, version, label }) {
  if (ok)
    return card({ id: 'update|' + version, icon: 'check', updateNotes: version, title: 'Charles güncellendi', reason: '{v} kuruldu', vars: { v: label }, action: 'Yenilikleri gör', t: ['title', 'reason', 'action'] });
  return card({ id: 'update|' + Date.now(), icon: 'alert', tone: 'error', plain: true, title: 'Güncelleme kurulamadı', reason: 'Charles önceki sürümle açıldı. Ayrıntılar _update\\update.log dosyasında.', t: ['title', 'reason'] });
}

/** The automatic check found a newer version. */
function updateAvailable({ version, label }) {
  return card({ id: 'update-available|' + version, icon: 'download', title: 'Güncelleme var', reason: '{v} hazır. Ayarlar’ın Genel sayfasından kurabilirsin.', vars: { v: label }, t: ['title', 'reason'] });
}

/** v1.0.0: the second part of an update (a newer Electron) is downloaded; a restart puts it in place. */
function runtimeReady({ version }) {
  return card({
    id: 'runtime-ready|' + version,
    icon: 'download',
    runtimeRestart: true,
    title: 'Güncellemenin ikinci bölümü hazır',
    reason: 'Charles yeniden başlayınca birkaç saniyede kurulur.',
    action: 'Şimdi yeniden başlat',
    t: ['title', 'reason', 'action'],
  });
}

/** An important mail (mail-alerts.cjs). reason comes from mail-triage.cjs or the AI. */
function mail(m, reason) {
  const r = String(reason || '');
  const word = /^“(.+)” içeriyor$/.exec(r);
  return card({
    id: m.kind + '|' + m.id,
    kind: m.kind,
    icon: 'mail',
    mailId: m.id,
    source: SOURCES[m.kind] || m.kind,
    from: m.from,
    title: m.title,
    date: m.date,
    preview: m.text || '',
    reason: word ? '“{x}” içeriyor' : r,
    ...(word ? { vars: { x: word[1] } } : {}),
    action: 'Charles anlatsın',
    t: ['source', 'reason', 'action'],
  });
}

/** A calendar event: new, or starting in 15 minutes (plugins.cjs → mail-alerts.cjs). */
function calendar(event) {
  return card({
    id: event.kind + '|' + (event.id || event.title) + '|' + event.reason,
    kind: event.kind,
    icon: 'calendar',
    source: SOURCES[event.kind] || event.kind,
    title: event.title,
    reason: event.reason,
    action: 'Charles anlatsın',
    t: ['source', 'reason', 'action'],
  });
}

/** Charles asks something in the chat (a date in a mail) while the panel is small. */
function proposal(p) {
  return card({ id: 'charles|' + p.id, icon: 'chat', title: 'Charles soruyor', reason: String(p.text || '').replace(/\*\*/g, '').slice(0, 140), t: ['title'] });
}

/** The page's own card (src/renderer.ts: the usage limit is running low); texts already translated. */
function quota(v) {
  return card({ id: 'charles|' + clip(v.id, 80), icon: 'gauge', title: clip(v.title || 'Charles', 120), reason: clip(v.reason, 160) });
}

/** The system watchdog (system/watchdog.cjs): processor, memory, disk. */
function watchdog(w) {
  const n = Math.round(Number(w.value) || 0);
  const app = w.app ? String(w.app) : '';
  let reason, vars;
  if (w.metric === 'disk') {
    reason = 'C: diskinde yalnızca {gb} GB boş yer kaldı.';
    // a number: the card window writes it in the interface language ("4,2" / "4.2")
    vars = { gb: Math.round(Number(w.freeGb || 0) * 10) / 10 };
  } else {
    const what = w.metric === 'cpu' ? 'İşlemci' : 'Bellek';
    reason = app ? what + ' %{n} dolu. En çok {app} kullanıyor.' : what + ' %{n} dolu.';
    vars = { n, app };
  }
  return card({
    id: 'charles|sweat|' + w.metric + '|' + Date.now(),
    icon: w.metric === 'disk' ? 'disk' : w.metric === 'cpu' ? 'cpu' : 'ram',
    tone: 'sweat',
    title: w.metric === 'disk' ? 'Disk doluyor' : 'Bilgisayar zorlanıyor',
    reason,
    vars,
    t: ['title', 'reason'],
  });
}

/** A module's notice (modules/host.cjs ui.notify); a click opens the module. Texts are the module's. */
function moduleNotice({ title, text, moduleId = null, icon = 'puzzle' }) {
  return card({
    id: 'module|' + Date.now() + '|' + Math.random().toString(36).slice(2, 6),
    icon,
    module: moduleId || null,
    title: clip(title, 60),
    reason: text,
    ttl: 60000,
  });
}

/** A module saved a file (files.save); a click shows it in its folder. */
function saved({ moduleName, name, file }) {
  return card({
    id: 'module-saved|' + Date.now() + '|' + Math.random().toString(36).slice(2, 6),
    icon: 'file',
    reveal: file,
    source: clip(moduleName, 60),
    title: 'Dosya kaydedildi',
    reason: clip(name, 80),
    action: 'Klasörde göster',
    ttl: 60000,
    t: ['title', 'action'],
  });
}

/** Windows Firewall keeps phones from seeing this PC (Quick Share). */
function firewall({ publicNet }) {
  return card({
    id: 'charles|quickshare-firewall',
    icon: 'lock',
    title: 'Quick Share için ağ izni gerekiyor',
    reason: publicNet
      ? 'Bu Wi-Fi Windows’ta “Ortak ağ” olarak ayarlı. Telefonların bu bilgisayarı görmesi için ağı “Özel” yap.'
      : 'Telefonların bu bilgisayarı görmesi için Gönder kartında “Ağ izni ver”e bas.',
    ttl: 5 * 60000,
    t: ['title', 'reason'],
  });
}

/**
 * v1.0.4: a card's action failed (the mail could not be read, the saved file is gone). The card that
 * was clicked has already gone; this one says so. Its line under the title is the clicked card's own
 * title (outside text: never translated, inserted as text). No lifetime, like the other error cards;
 * a click opens Charles.
 */
function openFailed(item = {}) {
  return card({
    id: 'charles|open-failed|' + Date.now() + '|' + Math.random().toString(36).slice(2, 6),
    icon: 'alert',
    tone: 'error',
    from: clip(item.title, 80),
    title: 'Bildirim açılamadı',
    reason: 'İçeriği şu an açılamadı. Charles’ı açıp ona sorabilirsin.',
    t: ['title', 'reason'],
  });
}

const protocol = (p) => PROTOCOLS[p] || 'Quick Share';

module.exports = {
  card,
  reminder,
  updated,
  updateAvailable,
  runtimeReady,
  mail,
  calendar,
  proposal,
  quota,
  watchdog,
  moduleNotice,
  saved,
  firewall,
  openFailed,
  protocol,
  SOURCES,
  ICON_NAMES,
};
