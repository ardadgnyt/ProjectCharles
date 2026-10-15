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

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bubble(item) {
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

window.bubble.onItems(({ items, more }) => {
  stack.replaceChildren(...items.map(bubble));
  if (more) stack.append(element('div', 'more', '+' + more + ' bildirim daha'));
  // setTimeout, not requestAnimationFrame: the window is still hidden on first render.
  setTimeout(() => window.bubble.resize(Math.ceil(stack.getBoundingClientRect().height)), 0);
});
