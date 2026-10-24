// Renders the notification bubbles sent by app/plugins/mail-bubble.cjs.
// Content is always inserted as text, never as HTML: mail subjects are untrusted.
const stack = document.getElementById('stack');
// v0.8.8: the bubbles follow Charles' language (main sends it with the items)
let lang = 'tr';
const WORDS = {"en": {"Okul e-postası": "School email","Google Takvim": "Google Calendar","Outlook Takvim": "Outlook Calendar","Takvim: ": "Calendar: ","Önemli e-posta: ": "Important email: ","(Konusuz)": "(No subject)","Kapat": "Close","Bildirimi kapat": "Close notification"," bildirim daha": " more notifications","Charles anlatsın →": "Let Charles explain →","şimdi": "now"," dk": " min","Hızlı yanıtlar": "Quick replies","Yanıt yaz": "Write a reply","WhatsApp bildirimlerini kapat": "Close WhatsApp notifications"," yeni mesaj": " new messages"," ve ": " and "," kişi daha": " more","Mesajları göster": "Show messages"," sohbet": " chats","Daralt": "Collapse","Kendim yazayım…": "I’ll write my own…","Geri": "Back","Yanıt yaz…": "Write a reply…","Gönder": "Send","Emoji": "Emoji","Mesaj gönderiliyor…": "Sending message…","Yanıt gönderildi": "Reply sent","Sohbeti aç": "Open chat"},"de": {"Okul e-postası": "Schul-E-Mail","Google Takvim": "Google Kalender","Outlook Takvim": "Outlook-Kalender","Takvim: ": "Kalender: ","Önemli e-posta: ": "Wichtige E-Mail: ","(Konusuz)": "(Kein Betreff)","Kapat": "Schließen","Bildirimi kapat": "Benachrichtigung schließen"," bildirim daha": " weitere Benachrichtigungen","Charles anlatsın →": "Charles erklärt es →","şimdi": "jetzt"," dk": " Min.","Hızlı yanıtlar": "Schnellantworten","Yanıt yaz": "Antwort schreiben","WhatsApp bildirimlerini kapat": "WhatsApp-Benachrichtigungen schließen"," yeni mesaj": " neue Nachrichten"," ve ": " und "," kişi daha": " weitere","Mesajları göster": "Nachrichten anzeigen"," sohbet": " Chats","Daralt": "Einklappen","Kendim yazayım…": "Selbst schreiben…","Geri": "Zurück","Yanıt yaz…": "Antwort schreiben…","Gönder": "Senden","Emoji": "Emoji","Mesaj gönderiliyor…": "Nachricht wird gesendet…","Yanıt gönderildi": "Antwort gesendet","Sohbeti aç": "Chat öffnen"},"fr": {"Okul e-postası": "E-mail scolaire","Google Takvim": "Google Agenda","Outlook Takvim": "Calendrier Outlook","Takvim: ": "Agenda : ","Önemli e-posta: ": "E-mail important : ","(Konusuz)": "(Sans objet)","Kapat": "Fermer","Bildirimi kapat": "Fermer la notification"," bildirim daha": " autres notifications","Charles anlatsın →": "Charles explique →","şimdi": "maintenant"," dk": " min","Hızlı yanıtlar": "Réponses rapides","Yanıt yaz": "Écrire une réponse","WhatsApp bildirimlerini kapat": "Fermer les notifications WhatsApp"," yeni mesaj": " nouveaux messages"," ve ": " et "," kişi daha": " autres","Mesajları göster": "Afficher les messages"," sohbet": " discussions","Daralt": "Réduire","Kendim yazayım…": "J’écris moi-même…","Geri": "Retour","Yanıt yaz…": "Écrire une réponse…","Gönder": "Envoyer","Emoji": "Emoji","Mesaj gönderiliyor…": "Envoi du message…","Yanıt gönderildi": "Réponse envoyée","Sohbeti aç": "Ouvrir la discussion"},"es": {"Okul e-postası": "Correo escolar","Google Takvim": "Google Calendar","Outlook Takvim": "Calendario de Outlook","Takvim: ": "Calendario: ","Önemli e-posta: ": "Correo importante: ","(Konusuz)": "(Sin asunto)","Kapat": "Cerrar","Bildirimi kapat": "Cerrar notificación"," bildirim daha": " notificaciones más","Charles anlatsın →": "Que Charles lo explique →","şimdi": "ahora"," dk": " min","Hızlı yanıtlar": "Respuestas rápidas","Yanıt yaz": "Escribir respuesta","WhatsApp bildirimlerini kapat": "Cerrar notificaciones de WhatsApp"," yeni mesaj": " mensajes nuevos"," ve ": " y "," kişi daha": " más","Mesajları göster": "Mostrar mensajes"," sohbet": " chats","Daralt": "Contraer","Kendim yazayım…": "Escribiré yo…","Geri": "Atrás","Yanıt yaz…": "Escribe una respuesta…","Gönder": "Enviar","Emoji": "Emoji","Mesaj gönderiliyor…": "Enviando mensaje…","Yanıt gönderildi": "Respuesta enviada","Sohbeti aç": "Abrir chat"},"zh": {"Okul e-postası": "学校邮箱","Google Takvim": "Google 日历","Outlook Takvim": "Outlook 日历","Takvim: ": "日历：","Önemli e-posta: ": "重要邮件：","(Konusuz)": "（无主题）","Kapat": "关闭","Bildirimi kapat": "关闭通知"," bildirim daha": " 条更多通知","Charles anlatsın →": "让 Charles 解释 →","şimdi": "刚刚"," dk": " 分钟","Hızlı yanıtlar": "快速回复","Yanıt yaz": "写回复","WhatsApp bildirimlerini kapat": "关闭 WhatsApp 通知"," yeni mesaj": " 条新消息"," ve ": "和"," kişi daha": " 人","Mesajları göster": "显示消息"," sohbet": " 个对话","Daralt": "收起","Kendim yazayım…": "我自己写…","Geri": "返回","Yanıt yaz…": "写回复…","Gönder": "发送","Emoji": "表情","Mesaj gönderiliyor…": "正在发送消息…","Yanıt gönderildi": "回复已发送","Sohbeti aç": "打开对话"}};
const T = (s) => (lang !== 'tr' && WORDS[lang]?.[s]) || s;
const SOURCES = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  school: 'Okul e-postası',
  calendar: 'Google Takvim',
  'outlook-calendar': 'Outlook Takvim',
};

// v0.8.8: children may be text (always as text, never HTML) or elements
function element(tag, className, ...content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const c of content)
    if (c !== undefined && c !== null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

function mailCard(item) {
  const calendar = String(item.kind).includes('calendar');
  const charles = item.kind === 'charles';
  // v0.8.14: a module's notice opens that module (no "Charles anlatsın" hint)
  const card = element('div', 'bubble' + (charles ? ' charles' : '') + (item.module ? ' module' : '') + (item.tone === 'sweat' ? ' sweat' : ''));
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute(
    'aria-label',
    (charles ? 'Charles: ' : calendar ? T('Takvim: ') : T('Önemli e-posta: ')) + item.title,
  );
  card.append(element('div', 'icon', item.icon || (charles ? '?' : calendar ? '📅' : '✉')));
  const text = element('div', 'text');
  const source = charles ? 'Charles' : T(SOURCES[item.kind] || item.kind);
  text.append(
    element(
      'div',
      'meta',
      calendar || charles ? source : source + (item.from ? ' · ' + item.from : ''),
    ),
    element('div', 'subject', item.title || T('(Konusuz)')),
    element('div', 'reason', item.reason || ''),
  );
  card.append(text);
  const close = element('button', 'close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', T('Bildirimi kapat'));
  // v0.8.11: × acts on pointerdown: a click could be lost when the bubbles were redrawn
  // between pressing and releasing the mouse (a new mail, a WhatsApp photo arriving)
  dismissOnPress(close, () => {
    forget(item);
    card.remove();
    resize();
    window.bubble.dismiss(item.id);
  });
  card.append(close);
  card.onclick = () => {
    if (quiet()) return;
    window.bubble.open(item.id);
  };
  card.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') window.bubble.open(item.id);
  };
  return card;
}

// v0.8.13: a closed card is never drawn again, also when a list sent before Charles heard about
// the × arrives afterwards; Charles is told again if it still lists the card.
// A WhatsApp card counts with its last message: a new message brings the chat back.
const gone = new Map();
const goneKey = (item) => String(item.id) + '|' + String(item.last || '');
function forget(item) {
  gone.set(goneKey(item), Date.now() + 60000);
}
function closed(item) {
  const key = goneKey(item);
  const until = gone.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    gone.delete(key);
    return false;
  }
  return true;
}
// after a × the click that follows must not open the card that moved into its place
let quietUntil = 0;
const quiet = () => Date.now() < quietUntil;
function dismissOnPress(button, fn) {
  let done = false;
  const go = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (done) return;
    done = true;
    quietUntil = Date.now() + 450;
    fn();
  };
  button.addEventListener('pointerdown', (e) => {
    if (e.button === 0) go(e);
  });
  button.addEventListener('click', go);
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') go(e);
  });
}
const resize = () =>
  // setTimeout, not requestAnimationFrame: the window is still hidden on first render.
  setTimeout(() => window.bubble.resize(Math.ceil(stack.getBoundingClientRect().height)), 0);
const waHost = element('div', 'wa-host');
window.bubble.onItems(({ items, more, wa, language }) => {
  if (typeof language === 'string') lang = language;
  for (const i of [...(items || []), ...(Array.isArray(wa) ? wa : [])]) if (closed(i)) window.bubble.dismiss(i.id);
  items = (items || []).filter((i) => !closed(i));
  wa = Array.isArray(wa) ? wa.filter((i) => !closed(i)) : [];
  document.documentElement.lang = lang;
  document.documentElement.style.setProperty('--hint', JSON.stringify('  · ' + T('Charles anlatsın →')));
  waUpdate(Array.isArray(wa) ? wa : []);
  stack.replaceChildren(...(waHost.childElementCount ? [waHost] : []), ...items.map(mailCard));
  if (more) stack.append(element('div', 'more', '+' + more + T(' bildirim daha')));
  resize();
});
new ResizeObserver(resize).observe(stack);

// ── v0.8.8: WhatsApp ────────────────────────────────────────────────────────────
// One card for every chat that wrote: a single chat shows its message; several are folded into
// "N yeni mesaj" and open as a list. From a chat: quick replies, or type a reply; it is sent
// only when the user presses send. Everything is text, never HTML.
const SVG = 'http://www.w3.org/2000/svg';
function glyph(d, cls = 'wa-glyph') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  for (const part of d.split('|')) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', part);
    svg.append(p);
  }
  return svg;
}
const G = {
  chat: 'M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8.5L6 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z|M8.5 11.3h.01M12 11.3h.01M15.5 11.3h.01',
  reply: 'M9.5 7 5 11.5l4.5 4.5|M5.5 11.5h8a5 5 0 0 1 5 5v.5',
  next: 'm9.5 6 6 6-6 6',
  down: 'm6 9.5 6 6 6-6',
  back: 'm14.5 6-6 6 6 6',
  close: 'M7 7l10 10M17 7 7 17',
  send: 'M4.5 12 19.5 5l-4 14-3.5-5.5L4.5 12z|M12 13.5 19.5 5',
  smile: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z|M8.7 14.2c1.8 2 4.8 2 6.6 0|M9.3 9.8h.01M14.7 9.8h.01',
  check: 'm6 12.5 4 4 8-9',
  open: 'M14 4.5h5.5V10|M19.5 4.5 11 13|M18 14v4a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7.5A1.5 1.5 0 0 1 6 6h4',
  quick: 'M4.5 11.5 20 4.5l-6.5 15-2.5-6z|M11 13.5 20 4.5',
};
const EMOJIS = ['👍', '🙂', '😂', '❤️', '🙏', '👌', '😊', '🎉'];
let waItems = [];
let waView = { mode: 'collapsed', chat: '', draft: '', error: '' };
let waConversation = null;
const ago = (t) => {
  const s = Math.max(0, (Date.now() - Number(t || 0)) / 1000);
  if (s < 60) return T('şimdi');
  if (s < 3600) return Math.floor(s / 60) + T(' dk');
  return new Date(t).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : lang, { hour: '2-digit', minute: '2-digit' });
};
const initials = (name) =>
  String(name || '?')
    .replace(/^\+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toLocaleUpperCase('tr-TR') || '?';
function iconButton(g, label, fn, cls = '') {
  const b = element('button', 'wa-btn ' + cls);
  b.type = 'button';
  // v0.8.9: no title: Windows showed its own tooltip box over the card
  b.setAttribute('aria-label', label);
  b.append(glyph(G[g]));
  b.onclick = (e) => {
    e.stopPropagation();
    fn();
  };
  return b;
}
function avatar(item, small = false) {
  const a = element('span', 'wa-avatar' + (small ? ' small' : ''), initials(item.name));
  a.setAttribute('translate', 'no');
  if (item.unread) a.append(element('i', 'wa-dot'));
  return a;
}
function brand() {
  const b = element('span', 'wa-brand');
  b.append(glyph(G.chat));
  return b;
}
const find = (chat) => waItems.find((i) => i.chat === chat);
function setView(next) {
  const was = waView.mode;
  waView = { ...waView, ...next };
  const typing = waView.mode === 'compose';
  if (typing !== (was === 'compose')) void window.bubble.wa('focus', { on: typing }).catch(() => {});
  paintWa();
}
function waUpdate(list) {
  waItems = list;
  if (!list.length) {
    if (waView.mode === 'compose') void window.bubble.wa('focus', { on: false }).catch(() => {});
    waView = { mode: 'collapsed', chat: '', draft: '', error: '' };
    waHost.replaceChildren();
    return;
  }
  // a reply being typed or sent is never redrawn under the user's hands
  if (['compose', 'sending'].includes(waView.mode) && find(waView.chat)) return;
  if (waView.chat && !find(waView.chat)) waView = { mode: 'collapsed', chat: '', draft: '', error: '' };
  paintWa();
}
function row(item, onOpen) {
  const r = element('div', 'wa-row');
  r.tabIndex = 0;
  r.setAttribute('role', 'button');
  const name = element('strong', 'wa-name', item.name);
  name.setAttribute('translate', 'no');
  const text = element('span', 'wa-text', item.text || item.media || '');
  text.setAttribute('translate', 'no');
  const head = element('span', 'wa-line', name);
  const body = element('span', 'wa-body', head, text);
  r.append(avatar(item), body);
  // v0.8.11: a photo shows as a small picture at the end of the row
  if (photoOk(item.image)) r.append(photo(item.image, 'wa-thumb'));
  r.append(element('small', 'wa-time', ago(item.at)));
  r.onclick = () => {
    if (!quiet()) onOpen();
  };
  r.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') onOpen();
  };
  return r;
}
function card(...kids) {
  const c = element('section', 'wa-card');
  c.setAttribute('aria-label', 'WhatsApp');
  c.append(...kids);
  return c;
}
function paintWa() {
  const mode = waView.mode;
  const item = find(waView.chat) || waItems[0];
  if (!item) return;
  let view;
  if (mode === 'collapsed' && waItems.length > 1) view = foldedCard();
  else if (mode === 'list') view = listCard();
  else if (mode === 'quick') view = quickCard(item);
  else if (mode === 'compose' || mode === 'sending') view = composeCard(item);
  else if (mode === 'sent') view = sentCard(item);
  else view = singleCard(item);
  waHost.replaceChildren(view);
  if (mode === 'compose') {
    const input = view.querySelector('textarea');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  resize();
}
function singleCard(item) {
  const r = row(item, () => openChat(item.chat));
  r.prepend(brand());
  const actions = element('span', 'wa-actions');
  actions.append(
    iconButton('reply', T('Hızlı yanıtlar'), () => setView({ mode: 'quick', chat: item.chat })),
    iconButton('next', T('Yanıt yaz'), () => openChat(item.chat)),
  );
  r.append(actions);
  r.querySelector('.wa-time').remove();
  r.querySelector('.wa-line').append(element('small', 'wa-time', ago(item.at)));
  return card(r, dismissButton());
}
function dismissButton() {
  // v0.8.9: the card goes at once; Charles forgets the notifications after it
  // v0.8.11: on pointerdown (see dismissOnPress), so a redraw can never swallow it
  const b = element('button', 'wa-btn wa-x');
  b.type = 'button';
  b.setAttribute('aria-label', T('WhatsApp bildirimlerini kapat'));
  b.append(glyph(G.close));
  dismissOnPress(b, () => {
    for (const i of waItems) forget(i);
    waUpdate([]);
    resize();
    void window.bubble.wa('dismiss-all').catch(() => {});
  });
  return b;
}
function foldedCard() {
  // first names keep the line short ("Mert, Zeynep ve 1 kişi daha")
  const people = waItems.map((i) => (/^\+?\d/.test(i.name) ? i.name : String(i.name).split(/\s+/)[0]));
  const count = waItems.reduce((n, i) => n + (Number(i.unread) || 1), 0);
  const stackEl = element('span', 'wa-stack');
  for (const i of waItems.slice(0, 3)) stackEl.append(avatar({ ...i, unread: 0 }, true));
  const who =
    people.length <= 2 ? people.join(', ') : `${people.slice(0, 2).join(', ')}${T(' ve ')}${people.length - 2}${T(' kişi daha')}`;
  const title = element('strong', 'wa-name', count + T(' yeni mesaj'));
  const sub = element('span', 'wa-text', who);
  sub.setAttribute('translate', 'no');
  const r = element('div', 'wa-row folded');
  r.tabIndex = 0;
  r.setAttribute('role', 'button');
  r.setAttribute('aria-expanded', 'false');
  r.append(brand(), stackEl, element('span', 'wa-body', title, sub), iconButton('down', T('Mesajları göster'), () => setView({ mode: 'list' })));
  r.onclick = () => {
    if (!quiet()) setView({ mode: 'list' });
  };
  return card(r, dismissButton());
}
function listCard() {
  const head = element('div', 'wa-head');
  head.append(brand(), element('strong', 'wa-title', 'WhatsApp · ' + waItems.length + T(' sohbet')), iconButton('down', T('Daralt'), () => setView({ mode: 'collapsed', chat: '' }), 'flip'));
  const list = element('div', 'wa-list');
  for (const i of waItems) {
    const r = row(i, () => openChat(i.chat));
    r.append(iconButton('reply', T('Hızlı yanıtlar'), () => setView({ mode: 'quick', chat: i.chat })));
    list.append(r);
  }
  return card(head, list);
}
function quickCard(item) {
  const head = element('div', 'wa-head');
  const t = element('strong', 'wa-title', T('Hızlı yanıtlar'));
  const to = element('small', 'wa-to', item.name);
  to.setAttribute('translate', 'no');
  head.append(glyph(G.quick, 'wa-glyph wa-head-icon'), element('span', 'wa-head-text', t, to), iconButton('close', T('Kapat'), () => setView({ mode: waItems.length > 1 ? 'list' : 'collapsed' })));
  const list = element('div', 'wa-quick');
  for (const text of item.quickReplies || []) {
    const b = element('button', 'wa-quick-row');
    b.type = 'button';
    b.append(element('span', '', text), glyph(G.next));
    b.onclick = () => void send(item, text);
    list.append(b);
  }
  const own = element('button', 'wa-quick-row own');
  own.type = 'button';
  own.append(element('span', '', T('Kendim yazayım…')), glyph(G.next));
  own.onclick = () => openChat(item.chat);
  list.append(own);
  return card(head, list);
}
async function openChat(chat) {
  waConversation = null;
  setView({ mode: 'compose', chat, error: '' });
  try {
    waConversation = await window.bubble.wa('conversation', { chat });
    void window.bubble.wa('read', { chat }).catch(() => {});
    if (waView.mode === 'compose' && waView.chat === chat) {
      const box = waHost.querySelector('.wa-thread');
      if (box) box.replaceWith(thread(find(chat)));
      resize();
    }
  } catch {}
}
function photoOk(src) {
  return typeof src === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src);
}
function photo(src, cls) {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = 'Fotoğraf';
  img.decoding = 'async';
  img.src = src;
  img.onload = () => resize();
  return img;
}
function thread(item) {
  const box = element('div', 'wa-thread');
  const list =
    waConversation?.chat === item.chat
      ? waConversation.messages.slice(item.group ? -6 : -4)
      : [{ text: item.group ? String(item.text || '').replace(/^[^:]{1,80}: /, '') : item.text, media: item.media, image: item.image, mine: false, name: item.sender }];
  for (const m of list) {
    const line = element('p', 'wa-msg' + (m.mine ? ' mine' : ''));
    // v0.8.9: in a group every message says who wrote it
    if (item.group && !m.mine && m.name) line.append(element('strong', 'wa-from', m.name));
    // v0.8.11: photos (and stickers) are shown; their caption, if any, goes below
    if (photoOk(m.image)) {
      line.classList.add('has-photo');
      line.append(photo(m.image, 'wa-photo'));
      if (m.text) line.append(element('span', 'wa-caption', m.text));
    } else line.append(document.createTextNode(m.text || m.media || ''));
    line.setAttribute('translate', 'no');
    box.append(line);
  }
  return box;
}
function composeCard(item) {
  const head = element('div', 'wa-head');
  const name = element('strong', 'wa-name', item.name);
  name.setAttribute('translate', 'no');
  head.append(
    iconButton('back', T('Geri'), () => setView({ mode: waItems.length > 1 ? 'list' : 'collapsed' })),
    avatar(item),
    element('span', 'wa-head-text', name),
    element('small', 'wa-time', ago(item.at)),
  );
  const body = [head, thread(item)];
  if (waView.mode === 'sending') {
    const box = element('div', 'wa-sending');
    const bar = element('span', 'wa-bar', element('i'));
    box.append(element('span', 'wa-spin'), element('span', 'wa-sending-text', element('span', '', T('Mesaj gönderiliyor…')), bar));
    body.push(box);
    return card(...body);
  }
  const box = element('div', 'wa-compose');
  const input = element('textarea', 'wa-input');
  input.rows = 2;
  input.maxLength = 4000;
  input.placeholder = T('Yanıt yaz…');
  input.setAttribute('aria-label', T('Yanıt yaz'));
  input.value = waView.draft || '';
  const sendB = iconButton('send', T('Gönder'), () => void send(item, input.value), 'wa-send');
  const sync = () => {
    waView.draft = input.value;
    sendB.disabled = !input.value.trim();
  };
  input.oninput = sync;
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) void send(item, input.value);
    }
    if (e.key === 'Escape') setView({ mode: waItems.length > 1 ? 'list' : 'collapsed' });
  };
  const emoji = element('div', 'wa-emoji');
  emoji.hidden = true;
  for (const e of EMOJIS) {
    const b = element('button', '', e);
    b.type = 'button';
    b.onclick = () => {
      const at = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, at) + e + input.value.slice(input.selectionEnd ?? at);
      sync();
      input.focus();
      emoji.hidden = true;
      resize();
    };
    emoji.append(b);
  }
  const smile = iconButton('smile', T('Emoji'), () => {
    emoji.hidden = !emoji.hidden;
    resize();
  });
  box.append(smile, input, sendB);
  sync();
  body.push(box, emoji);
  if (waView.error) body.push(element('p', 'wa-error', waView.error));
  return card(...body);
}
function sentCard(item) {
  const ok = element('div', 'wa-sent');
  const text = element('span', 'wa-sent-text', waView.sentText || '');
  text.setAttribute('translate', 'no');
  ok.append(glyph(G.check, 'wa-glyph wa-ok'), element('span', 'wa-sent-body', element('strong', '', T('Yanıt gönderildi')), text));
  const open = element('button', 'wa-open');
  open.type = 'button';
  open.append(glyph(G.open), element('span', '', T('Sohbeti aç')));
  open.onclick = () => void window.bubble.wa('open', { chat: item.chat }).catch(() => {});
  const r = row({ ...item, unread: 0 }, () => openChat(item.chat));
  return card(r, element('div', 'wa-done', ok, open));
}
let sentTimer = 0;
async function send(item, text) {
  text = String(text || '').trim();
  if (!text) return;
  setView({ mode: 'sending', chat: item.chat, error: '' });
  void window.bubble.wa('focus', { on: false }).catch(() => {});
  try {
    await window.bubble.wa('reply', { chat: item.chat, text });
    clearTimeout(sentTimer);
    setView({ mode: 'sent', chat: item.chat, draft: '', sentText: text });
    sentTimer = setTimeout(() => {
      if (waView.mode === 'sent' && waView.chat === item.chat) {
        waView = { mode: 'collapsed', chat: '', draft: '', error: '' };
        void window.bubble.dismiss('wa|' + item.chat);
      }
    }, 8000);
  } catch (e) {
    setView({ mode: 'compose', chat: item.chat, draft: text, error: String(e.message || e).replace(/^Error: /, '') });
  }
}
