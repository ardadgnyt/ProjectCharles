// Renders the notification bubbles sent by app/plugins/mail-bubble.cjs.
// Content is always inserted as text, never as HTML: mail subjects are untrusted.
const stack = document.getElementById('stack');
// v0.8.8: the bubbles follow Charles' language (main sends it with the items)
// v1.0.0: and the texts of that language (app/plugins/notice-text.cjs), so the page has no table
let lang = 'tr';
let WORDS = {};
const T = (s) => (lang !== 'tr' && WORDS[s]) || s;
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

// v1.0.0: line icons on a 24 px grid, drawn like the app window's (src/workspace/icons.ts); a card
// names one (app/plugins/notice-cards.cjs). An unknown name, an emoji included, draws nothing.
const ICONS = {
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0',
  timer: 'M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM12 9.5v4l2.5 1.5M10 2.5h4M12 2.5V6',
  check: 'M5 12.5 9.5 17 19 7.5',
  alert: 'M12 4 3 19.5h18zM12 10v4.5M12 17h.01',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  mail: 'M3.5 6h17v12h-17zM4 6.5l8 6.5 8-6.5',
  calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5V7M15.5 3.5V7',
  chat: 'M4 5.5h16v10H10l-4 3.5v-3.5H4z',
  gauge: 'M4.5 16a7.5 7.5 0 1 1 15 0M12 16l3.5-4.5M3.5 19.5h17',
  cpu: 'M8 8h8v8H8zM5 6h14v12H5zM9 3v3M15 3v3M9 18v3M15 18v3M2 10h3M2 14h3M19 10h3M19 14h3',
  ram: 'M3 8h18v7H3zM3 18h18M7 8v7M11 8v7M15 8v7M19 8v7',
  disk: 'M3.5 13.5h17v5h-17zM5 13.5 7 5.5h10l2 8M16.5 16h.01',
  puzzle: 'M9 4h4v2a1.8 1.8 0 1 0 3.6 0V4H20v5.5h-2a1.8 1.8 0 1 0 0 3.6h2V20h-5.5v-2a1.8 1.8 0 1 0-3.6 0v2H4v-6.4h2a1.8 1.8 0 1 0 0-3.6H4V4h5z',
  file: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4',
  send: 'M21 3 3 10.5l7.5 3L13.5 21 21 3zM10.5 13.5 21 3',
  lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  x: 'M7 7l10 10M17 7 7 17',
};
function lineIcon(name, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

// v1.0.0 (bughunt): numbers in the interface language's format ("4,2 GB" in Turkish and German,
// "4.2 GB" in English), with the same locales as the app's pages (src/settings/weekly-model.ts)
const LOCALES = { tr: 'tr-TR', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', zh: 'zh-CN' };
const num = (n) => new Intl.NumberFormat(LOCALES[lang] || 'tr-TR', { maximumFractionDigits: 1 }).format(n);

/** A field of a card: Charles' own text (listed in item.t) is translated and its {name}s filled.
 *  A number var is written in the language's format, also in a field that is not translated. */
function field(item, key) {
  const value = item[key];
  if (value === undefined || value === null || value === '') return '';
  const own = Array.isArray(item.t) && item.t.includes(key);
  let out = own ? T(String(value)) : String(value);
  for (const [k, v] of Object.entries(item.vars || {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out = out.split('{' + k + '}').join(num(v));
    else if (own) out = out.split('{' + k + '}').join(T(String(v)));
  }
  return out;
}

// v1.0.0: one card for every kind: [icon] source line (only when it says something), title, text,
// then the action or the choices; × on the top right
function mailCard(item) {
  const mailKind = !!SOURCES[item.kind] && item.kind !== 'charles';
  const icon = ICONS[item.icon] ? item.icon : '';
  const card = element('div', 'bubble' + (icon ? '' : ' no-icon') + (item.tone === 'error' ? ' error' : ''));
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  const title = field(item, 'title') || T('(Konusuz)');
  card.setAttribute('aria-label', title);
  if (icon) card.append(lineIcon(icon, 'n-icon'));
  const text = element('div', 'text');
  const source = field(item, 'source') || (mailKind ? T(SOURCES[item.kind]) : '');
  const meta = [source, item.from ? String(item.from) : ''].filter(Boolean).join(' · ');
  if (meta) text.append(element('div', 'meta', meta));
  text.append(element('div', 'subject', title));
  const reason = field(item, 'reason');
  if (reason) text.append(element('div', 'reason', reason));
  card.append(text);
  // v0.9.21: a card that asks: its buttons answer, so there is no × and a click on it does nothing
  if (Array.isArray(item.choices)) {
    card.removeAttribute('role');
    card.tabIndex = -1;
    card.classList.add('asking');
    const row = element('div', 'choices');
    for (const choice of item.choices) {
      const b = element('button', 'choice' + (choice.primary ? ' primary' : ''), T(choice.label));
      b.type = 'button';
      actOnPress(b, () => {
        for (const x of row.querySelectorAll('button')) x.disabled = true;
        window.bubble.choice(item.id, choice.id);
      });
      row.append(b);
    }
    text.append(row);
    return card;
  }
  // the action says what a click on the card does, and does the same
  const action = field(item, 'action');
  if (action) {
    const b = element('button', 'act', action);
    b.type = 'button';
    actOnPress(b, () => {
      if (!quiet()) window.bubble.open(item.id);
    });
    text.append(element('div', 'actions', b));
  }
  const close = element('button', 'close');
  close.append(lineIcon('x', 'x-icon'));
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
  let lastOpen = 0;
  const openCard = () => {
    const now = Date.now();
    if (quiet() || now - lastOpen < 350) return;
    lastOpen = now;
    window.bubble.open(item.id);
  };
  // v1.0.3: act on pointerdown as well as click so WS_EX_NOACTIVATE (focusable: false) cards
  // on Windows never drop clicks when opening a notification.
  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    openCard();
  });
  card.onclick = (e) => {
    if (e.target.closest('button')) return;
    openCard();
  };
  card.onkeydown = (e) => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') openCard();
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
  let lastRun = 0;
  const go = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastRun < 300) return;
    lastRun = now;
    quietUntil = now + 450;
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
function actOnPress(button, fn) {
  let lastRun = 0;
  const go = (e) => {
    if (button.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastRun < 280) return;
    lastRun = now;
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
// v1.0.4: with no card drawn the stack is only its padding: 0 then, so an empty, see-through window
// never stays on screen taking the clicks meant for what is under it
const resize = () =>
  // setTimeout, not requestAnimationFrame: the window is still hidden on first render.
  setTimeout(() => window.bubble.resize(!waHost.childElementCount && !mailHost.childElementCount ? 0 : Math.ceil(stack.getBoundingClientRect().height)), 0);
const waHost = element('div', 'wa-host');
const mailHost = element('div', 'mail-host');
waHost.hidden = true;
mailHost.hidden = true;
stack.append(waHost, mailHost);
window.bubble.onItems((data = {}) => {
  let { items, more, wa, language, words } = data;
  if (typeof language === 'string') lang = language;
  if (words && typeof words === 'object') WORDS = words;
  if (data.palette !== undefined)
    document.documentElement.dataset.palette = data.palette === 'blue' ? 'blue' : 'cream';
  for (const i of [...(items || []), ...(Array.isArray(wa) ? wa : [])]) if (closed(i)) window.bubble.dismiss(i.id);
  items = (items || []).filter((i) => !closed(i));
  wa = Array.isArray(wa) ? wa.filter((i) => !closed(i)) : [];
  document.documentElement.lang = lang;
  waUpdate(Array.isArray(wa) ? wa : []);
  waHost.hidden = !waHost.childElementCount;
  mailHost.replaceChildren(...items.map(mailCard));
  if (more) mailHost.append(element('div', 'more', T('{n} bildirim daha').split('{n}').join(String(more))));
  mailHost.hidden = !mailHost.childElementCount;
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
  actOnPress(b, fn);
  return b;
}
function avatar(item, small = false) {
  const a = element('span', 'wa-avatar' + (small ? ' small' : ''), initials(item.name));
  a.setAttribute('translate', 'no');
  if (item.unread) a.append(element('i', 'wa-dot'));
  return a;
}
// v1.0.0: the WhatsApp logo the owner supplied (public/images, resized only), preloaded by
// bubble.html so the first card of a new card window never shows an empty tile
function brand() {
  const b = element('span', 'wa-brand');
  const img = document.createElement('img');
  img.className = 'wa-logo';
  img.alt = '';
  img.draggable = false;
  img.src = 'images/whatsapp-mark-20.png';
  img.srcset = 'images/whatsapp-mark-20.png 1x, images/whatsapp-mark-40.png 2x, images/whatsapp-mark-60.png 3x';
  b.append(img);
  return b;
}
const find = (chat) => waItems.find((i) => i.chat === chat);
function setView(next) {
  const was = waView.mode;
  waView = { ...waView, ...next };
  const typing = waView.mode === 'compose';
  if (typing !== (was === 'compose') || typing) void window.bubble.wa('focus', { on: typing }).catch(() => {});
  paintWa();
}
function waUpdate(list) {
  waItems = list;
  if (!list.length) {
    if (waView.mode === 'compose') void window.bubble.wa('focus', { on: false }).catch(() => {});
    waView = { mode: 'collapsed', chat: '', draft: '', error: '' };
    waHost.replaceChildren();
    waHost.hidden = true;
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
  r.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || quiet()) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    onOpen();
  });
  r.onclick = (e) => {
    if (e.target.closest('button')) return;
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
  if (!item) {
    waHost.replaceChildren();
    waHost.hidden = true;
    return;
  }
  let view;
  if (mode === 'collapsed' && waItems.length > 1) view = foldedCard();
  else if (mode === 'list') view = listCard();
  else if (mode === 'quick') view = quickCard(item);
  else if (mode === 'compose' || mode === 'sending') view = composeCard(item);
  else if (mode === 'sent') view = sentCard(item);
  else view = singleCard(item);
  waHost.replaceChildren(view);
  waHost.hidden = false;
  if (mode === 'compose') {
    const input = view.querySelector('textarea');
    if (input) {
      setTimeout(() => {
        try {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        } catch {}
      }, 0);
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
function dismissButton(singleItem = null) {
  // v0.8.9: the card goes at once; Charles forgets the notifications after it
  // v0.8.11: on pointerdown (see dismissOnPress), so a redraw can never swallow it
  // v0.9.13: the same × as the mail / reminder cards (no floating circle on the corner)
  const b = element('button', 'close wa-x', lineIcon('x', 'x-icon'));
  b.type = 'button';
  b.setAttribute('aria-label', T('WhatsApp bildirimlerini kapat'));
  dismissOnPress(b, () => {
    sendSeq++;
    if (waView.mode === 'compose') void window.bubble.wa('focus', { on: false }).catch(() => {});
    if (singleItem && waItems.length > 1) {
      forget(singleItem);
      const rest = waItems.filter((i) => i.id !== singleItem.id);
      waView = { mode: rest.length > 1 ? 'list' : 'collapsed', chat: '', draft: '', error: '' };
      waUpdate(rest);
      resize();
      window.bubble.dismiss(singleItem.id);
      return;
    }
    const closing = [...waItems];
    for (const i of closing) forget(i);
    waUpdate([]);
    resize();
    // v1.0.3: dismiss directly on MailBubble as well as via bubble-wa so closing never stalls
    for (const i of closing) window.bubble.dismiss(i.id);
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
  r.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || quiet() || e.target.closest('button')) return;
    e.preventDefault();
    setView({ mode: 'list' });
  });
  r.onclick = (e) => {
    if (e.target.closest('button')) return;
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
  return card(head, list, dismissButton());
}
function quickCard(item) {
  const head = element('div', 'wa-head');
  const t = element('strong', 'wa-title', T('Hızlı yanıtlar'));
  const to = element('small', 'wa-to', item.name);
  to.setAttribute('translate', 'no');
  head.append(glyph(G.quick, 'wa-glyph wa-head-icon'), element('span', 'wa-head-text', t, to), iconButton('close', T('Kapat'), () => setView({ mode: waItems.length > 1 ? 'list' : 'collapsed', chat: '' })));
  const list = element('div', 'wa-quick');
  for (const text of item.quickReplies || []) {
    const b = element('button', 'wa-quick-row');
    b.type = 'button';
    b.append(element('span', '', text), glyph(G.next));
    actOnPress(b, () => void send(item, text));
    list.append(b);
  }
  const own = element('button', 'wa-quick-row own');
  own.type = 'button';
  own.append(element('span', '', T('Kendim yazayım…')), glyph(G.next));
  actOnPress(own, () => openChat(item.chat));
  list.append(own);
  return card(head, list, dismissButton(item));
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
  if (!item) return box;
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
    iconButton('back', T('Geri'), () => {
      sendSeq++;
      setView({ mode: waItems.length > 1 ? 'list' : 'collapsed', chat: '', error: '' });
    }),
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
    return card(...body, dismissButton(item));
  }
  const box = element('div', 'wa-compose');
  const input = element('textarea', 'wa-input');
  input.rows = 2;
  input.maxLength = 4000;
  input.placeholder = T('Yanıt yaz…');
  input.setAttribute('aria-label', T('Yanıt yaz'));
  input.value = waView.draft || '';
  input.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    void window.bubble.wa('focus', { on: true }).catch(() => {});
  });
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
    if (e.key === 'Escape') setView({ mode: waItems.length > 1 ? 'list' : 'collapsed', chat: '', error: '' });
  };
  const emoji = element('div', 'wa-emoji');
  emoji.hidden = true;
  for (const e of EMOJIS) {
    const b = element('button', '', e);
    b.type = 'button';
    actOnPress(b, () => {
      const at = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, at) + e + input.value.slice(input.selectionEnd ?? at);
      sync();
      input.focus();
      emoji.hidden = true;
      resize();
    });
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
  return card(...body, dismissButton(item));
}
function sentCard(item) {
  const ok = element('div', 'wa-sent');
  const text = element('span', 'wa-sent-text', waView.sentText || '');
  text.setAttribute('translate', 'no');
  ok.append(glyph(G.check, 'wa-glyph wa-ok'), element('span', 'wa-sent-body', element('strong', '', T('Yanıt gönderildi')), text));
  const open = element('button', 'wa-open');
  open.type = 'button';
  open.append(glyph(G.open), element('span', '', T('Sohbeti aç')));
  actOnPress(open, () => void window.bubble.wa('open', { chat: item.chat }).catch(() => {}));
  const r = row({ ...item, unread: 0 }, () => openChat(item.chat));
  return card(r, element('div', 'wa-done', ok, open), dismissButton(item));
}
let sentTimer = 0;
let sendSeq = 0;
async function send(item, text) {
  text = String(text || '').trim();
  if (!text) return;
  const seq = ++sendSeq;
  setView({ mode: 'sending', chat: item.chat, error: '' });
  void window.bubble.wa('focus', { on: false }).catch(() => {});
  let timeoutId = 0;
  try {
    await Promise.race([
      window.bubble.wa('reply', { chat: item.chat, text }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(Error('Yanıt zaman aşımına uğradı; tekrar dene.')), 15000);
      }),
    ]);
    if (seq !== sendSeq) return;
    clearTimeout(sentTimer);
    setView({ mode: 'sent', chat: item.chat, draft: '', sentText: text });
    sentTimer = setTimeout(() => {
      if (waView.mode === 'sent' && waView.chat === item.chat) {
        waView = { mode: 'collapsed', chat: '', draft: '', error: '' };
        void window.bubble.dismiss('wa|' + item.chat);
      }
    }, 8000);
  } catch (e) {
    if (seq !== sendSeq) return;
    setView({ mode: 'compose', chat: item.chat, draft: text, error: String(e.message || e).replace(/^Error: /, '') });
  } finally {
    clearTimeout(timeoutId);
  }
}
