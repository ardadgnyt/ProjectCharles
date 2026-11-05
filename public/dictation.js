// v0.9.18: what Bas-konuş is doing. All text goes in as text, never as HTML.
const card = document.getElementById('card');
const EN = {
  Dinliyorum: 'Listening',
  'Dinliyorum · eller serbest': 'Listening · hands-free',
  'Yazıya çevriliyor…': 'Turning speech into text…',
  'İptal edildi': 'Cancelled',
  'Eklendi': 'Inserted',
  'Esc: iptal': 'Esc: cancel',
  Kopyala: 'Copy',
  'Yine de ekle': 'Insert anyway',
  Kapat: 'Close',
};
let lang = 'tr';
const T = (s) => (lang !== 'tr' && EN[s]) || s;
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const line = (text, hint) => {
  const row = el('div', 'row');
  row.append(el('span', 'dot'), el('span', 'text', text));
  if (hint) row.append(el('span', 'hint', hint));
  return row;
};
const button = (label, name, primary) => {
  const b = el('button', primary ? 'primary' : '', T(label));
  b.type = 'button';
  b.onclick = () => window.dictation.act(name);
  return b;
};
window.dictation.onState((v) => {
  lang = v.language || 'tr';
  card.className = v.state;
  if (v.state === 'recording') card.replaceChildren(line(T(v.mode === 'free' ? 'Dinliyorum · eller serbest' : 'Dinliyorum'), T('Esc: iptal')));
  else if (v.state === 'processing') card.replaceChildren(line(T('Yazıya çevriliyor…'), T('Esc: iptal')));
  else if (v.state === 'done') card.replaceChildren(line(v.text || T('Eklendi')));
  else if (v.state === 'cancelled') card.replaceChildren(line(T('İptal edildi')));
  else if (v.state === 'error') card.replaceChildren(line(v.text || ''));
  else if (v.state === 'choice') {
    const actions = el('div', 'actions');
    actions.append(button('Kopyala', 'copy', true));
    if (v.canInsert) actions.append(button('Yine de ekle', 'insert'));
    actions.append(button('Kapat', 'close'));
    card.replaceChildren(line(v.why || ''), el('div', 'result', v.text || ''), actions);
  }
});
