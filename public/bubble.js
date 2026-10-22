// Renders the notification bubbles sent by app/plugins/mail-bubble.cjs.
// Content is always inserted as text, never as HTML: mail subjects are untrusted.
const stack = document.getElementById('stack');
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
  const card = element('div', 'bubble' + (charles ? ' charles' : '') + (item.tone === 'sweat' ? ' sweat' : ''));
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute(
    'aria-label',
    (charles ? 'Charles: ' : calendar ? 'Takvim: ' : 'Önemli e-posta: ') + item.title,
  );
  card.append(element('div', 'icon', item.icon || (charles ? '?' : calendar ? '📅' : '✉')));
  const text = element('div', 'text');
  const source = charles ? 'Charles' : SOURCES[item.kind] || item.kind;
  text.append(
    element(
      'div',
      'meta',
      calendar || charles ? source : source + (item.from ? ' · ' + item.from : ''),
    ),
    element('div', 'subject', item.title || '(Konusuz)'),
    element('div', 'reason', item.reason || ''),
  );
  card.append(text);
  const close = element('button', 'close', '×');
  close.type = 'button';
  close.title = 'Kapat';
  close.setAttribute('aria-label', 'Bildirimi kapat');
  close.onclick = (e) => {
    e.stopPropagation();
    window.bubble.dismiss(item.id);
  };
  card.append(close);
  card.onclick = () => window.bubble.open(item.id);
  card.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') window.bubble.open(item.id);
  };
  return card;
}

const resize = () =>
  // setTimeout, not requestAnimationFrame: the window is still hidden on first render.
  setTimeout(() => window.bubble.resize(Math.ceil(stack.getBoundingClientRect().height)), 0);
const waHost = element('div', 'wa-host');
window.bubble.onItems(({ items, more, wa }) => {
  waUpdate(Array.isArray(wa) ? wa : []);
  stack.replaceChildren(...(waHost.childElementCount ? [waHost] : []), ...items.map(mailCard));
  if (more) stack.append(element('div', 'more', '+' + more + ' bildirim daha'));
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
  if (s < 60) return 'şimdi';
  if (s < 3600) return Math.floor(s / 60) + ' dk';
  return new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
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
  b.title = label;
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
  r.append(avatar(item), body, element('small', 'wa-time', ago(item.at)));
  r.onclick = onOpen;
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
    iconButton('reply', 'Hızlı yanıtlar', () => setView({ mode: 'quick', chat: item.chat })),
    iconButton('next', 'Yanıt yaz', () => openChat(item.chat)),
  );
  r.append(actions);
  r.querySelector('.wa-time').remove();
  r.querySelector('.wa-line').append(element('small', 'wa-time', ago(item.at)));
  return card(r, dismissButton());
}
function dismissButton() {
  const x = iconButton('close', 'WhatsApp bildirimlerini kapat', () => void window.bubble.wa('dismiss-all').catch(() => {}), 'wa-x');
  return x;
}
function foldedCard() {
  // first names keep the line short ("Mert, Zeynep ve 1 kişi daha")
  const people = waItems.map((i) => (/^\+?\d/.test(i.name) ? i.name : String(i.name).split(/\s+/)[0]));
  const count = waItems.reduce((n, i) => n + (Number(i.unread) || 1), 0);
  const stackEl = element('span', 'wa-stack');
  for (const i of waItems.slice(0, 3)) stackEl.append(avatar({ ...i, unread: 0 }, true));
  const who =
    people.length <= 2 ? people.join(', ') : `${people.slice(0, 2).join(', ')} ve ${people.length - 2} kişi daha`;
  const title = element('strong', 'wa-name', count + ' yeni mesaj');
  const sub = element('span', 'wa-text', who);
  sub.setAttribute('translate', 'no');
  const r = element('div', 'wa-row folded');
  r.tabIndex = 0;
  r.setAttribute('role', 'button');
  r.setAttribute('aria-expanded', 'false');
  r.append(brand(), stackEl, element('span', 'wa-body', title, sub), iconButton('down', 'Mesajları göster', () => setView({ mode: 'list' })));
  r.onclick = () => setView({ mode: 'list' });
  return card(r, dismissButton());
}
function listCard() {
  const head = element('div', 'wa-head');
  head.append(brand(), element('strong', 'wa-title', 'WhatsApp · ' + waItems.length + ' sohbet'), iconButton('down', 'Daralt', () => setView({ mode: 'collapsed', chat: '' }), 'flip'));
  const list = element('div', 'wa-list');
  for (const i of waItems) {
    const r = row(i, () => openChat(i.chat));
    r.append(iconButton('reply', 'Hızlı yanıtlar', () => setView({ mode: 'quick', chat: i.chat })));
    list.append(r);
  }
  return card(head, list);
}
function quickCard(item) {
  const head = element('div', 'wa-head');
  const t = element('strong', 'wa-title', 'Hızlı yanıtlar');
  const to = element('small', 'wa-to', item.name);
  to.setAttribute('translate', 'no');
  head.append(glyph(G.quick, 'wa-glyph wa-head-icon'), element('span', 'wa-head-text', t, to), iconButton('close', 'Kapat', () => setView({ mode: waItems.length > 1 ? 'list' : 'collapsed' })));
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
  own.append(element('span', '', 'Kendim yazayım…'), glyph(G.next));
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
function thread(item) {
  const box = element('div', 'wa-thread');
  const list = waConversation?.chat === item.chat ? waConversation.messages.slice(-4) : [{ text: item.text, media: item.media, mine: false }];
  for (const m of list) {
    const line = element('p', 'wa-msg' + (m.mine ? ' mine' : ''), m.text || m.media || '');
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
    iconButton('back', 'Geri', () => setView({ mode: waItems.length > 1 ? 'list' : 'collapsed' })),
    avatar(item),
    element('span', 'wa-head-text', name),
    element('small', 'wa-time', ago(item.at)),
  );
  const body = [head, thread(item)];
  if (waView.mode === 'sending') {
    const box = element('div', 'wa-sending');
    const bar = element('span', 'wa-bar', element('i'));
    box.append(element('span', 'wa-spin'), element('span', 'wa-sending-text', element('span', '', 'Mesaj gönderiliyor…'), bar));
    body.push(box);
    return card(...body);
  }
  const box = element('div', 'wa-compose');
  const input = element('textarea', 'wa-input');
  input.rows = 2;
  input.maxLength = 4000;
  input.placeholder = 'Yanıt yaz…';
  input.setAttribute('aria-label', 'Yanıt yaz');
  input.value = waView.draft || '';
  const sendB = iconButton('send', 'Gönder', () => void send(item, input.value), 'wa-send');
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
  const smile = iconButton('smile', 'Emoji', () => {
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
  ok.append(glyph(G.check, 'wa-glyph wa-ok'), element('span', 'wa-sent-body', element('strong', '', 'Yanıt gönderildi'), text));
  const open = element('button', 'wa-open');
  open.type = 'button';
  open.append(glyph(G.open), element('span', '', 'Sohbeti aç'));
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
