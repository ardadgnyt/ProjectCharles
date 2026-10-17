// v0.7.7: the customizable home page of the app window. "Düzenle" (next to the settings
// button in the title bar) turns on the edit mode: every card gets a handle and ×, cards are
// dragged to another place or column, and "Kart ekle" opens a picker with every card that is
// not on the page yet. The layout is kept in companion.json (main: workspace-dash).
import { el, icon, iconButton } from './icons';
import { modal } from './modal';

export type CardDef = {
  id: string;
  title: string;
  text: string;
  icon: string;
  element: HTMLElement;
  /** Called when the card is put on the page / taken off it. */
  placed?: (on: boolean) => void;
};

export function dashEditor(o: {
  root: HTMLElement;
  cols: HTMLElement[];
  cards: CardDef[];
  save: (cols: string[][]) => Promise<void>;
  /** Shows / hides the home page title bar button state. */
  editing?: (on: boolean) => void;
}) {
  const byId = new Map(o.cards.map((c) => [c.id, c]));
  let layout: string[][] = [[], []];
  let on = false;
  let dragId = '';
  const slot = el('div', 'ws-card-slot', el('span', '', 'Buraya bırak'));

  // edit bar at the top of the page
  const doneB = el('button', 'ws-primary', icon('check'), el('span', '', 'Bitti'));
  doneB.type = 'button';
  doneB.onclick = () => setEditing(false);
  const bar = el(
    'div',
    'ws-home-editbar',
    el('span', 'ws-home-editbar-icon', icon('grip')),
    el('div', 'ws-home-editbar-text', el('strong', '', 'Ana sayfayı düzenliyorsun'), el('small', '', 'Kartları tutup sürükleyerek yerini veya sütununu değiştir; × ile kaldır.')),
    doneB,
  );
  bar.hidden = true;

  // empty page
  const emptyAdd = el('button', 'ws-primary', icon('plus'), el('span', '', 'Kart ekle'));
  emptyAdd.type = 'button';
  emptyAdd.onclick = () => openPicker(0);
  const empty = el(
    'div',
    'ws-home-empty',
    el('span', 'ws-home-empty-icon', icon('home')),
    el('strong', '', 'Ana sayfan boş'),
    el('small', '', 'İstediğin kartları ekleyip yerlerini kendin belirleyebilirsin.'),
    emptyAdd,
  );
  empty.hidden = true;

  // card chrome (handle and ×), added once to every card
  for (const c of o.cards) {
    c.element.dataset.card = c.id;
    const chrome = el(
      'div',
      'ws-card-chrome',
      el('span', 'ws-card-grip', icon('grip')),
      iconButton('x', c.title + ' · kaldır', () => remove(c.id), 'ws-icon ws-card-x'),
    );
    c.element.append(chrome);
    c.element.addEventListener('dragstart', (e) => {
      if (!on) return e.preventDefault();
      dragId = c.id;
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('application/x-charles-card', c.id);
      window.setTimeout(() => c.element.classList.add('dragging'), 0);
    });
    c.element.addEventListener('dragend', () => {
      c.element.classList.remove('dragging');
      dragId = '';
      slot.remove();
    });
  }

  function paint() {
    // the bar and the empty page sit next to the cards once the page is in the window
    if (o.root.parentElement && !bar.isConnected) {
      o.root.before(bar);
      o.root.after(empty);
    }
    const placed = new Set(layout.flat());
    o.cols.forEach((col, i) => {
      const ids = layout[i] || [];
      const nodes: Node[] = ids.map((id) => byId.get(id)!.element);
      if (on) {
        const add = el('button', 'ws-card-add', icon('plus'), el('span', '', 'Kart ekle'));
        add.type = 'button';
        add.onclick = () => openPicker(i);
        nodes.push(add);
      }
      col.replaceChildren(...nodes);
    });
    for (const c of o.cards) {
      c.element.draggable = on;
      const was = c.element.dataset.placed === '1';
      const now = placed.has(c.id);
      c.element.dataset.placed = now ? '1' : '';
      if (was !== now) c.placed?.(now);
    }
    empty.hidden = on || placed.size > 0;
    o.root.hidden = !on && placed.size === 0;
  }
  function set(next: string[][]) {
    layout = [next[0] || [], next[1] || []].map((c) => c.filter((id) => byId.has(id)));
    paint();
  }
  function commit() {
    paint();
    void o.save(layout.map((c) => c.slice()));
  }
  function remove(id: string) {
    layout = layout.map((c) => c.filter((x) => x !== id));
    commit();
  }
  function setEditing(v: boolean) {
    on = v;
    o.root.classList.toggle('editing', on);
    bar.hidden = !on;
    paint();
    o.editing?.(on);
    if (!on) picker.close();
  }

  // drag and drop between the two columns
  function dropIndex(col: HTMLElement, y: number) {
    const cards = [...col.querySelectorAll<HTMLElement>(':scope > .ws-card:not(.dragging)')];
    let i = 0;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y > r.top + r.height / 2) i++;
    }
    return { i, cards };
  }
  o.cols.forEach((col, ci) => {
    col.addEventListener('dragover', (e) => {
      if (!on || !dragId) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      const { i, cards } = dropIndex(col, e.clientY);
      const before = cards[i] || col.querySelector(':scope > .ws-card-add');
      if (slot.parentElement !== col || slot.nextSibling !== before) col.insertBefore(slot, before || null);
    });
    col.addEventListener('drop', (e) => {
      if (!on || !dragId) return;
      e.preventDefault();
      const { i, cards } = dropIndex(col, e.clientY);
      const target = cards[i]?.dataset.card;
      layout = layout.map((c) => c.filter((x) => x !== dragId));
      const list = layout[ci];
      const at = target ? list.indexOf(target) : list.length;
      list.splice(at < 0 ? list.length : at, 0, dragId);
      dragId = '';
      slot.remove();
      commit();
    });
  });

  // ── "Kart ekle" ──────────────────────────────────────────────────────────────
  let targetCol = 0;
  const picker = modal({ icon: 'plus', title: 'Kart ekle', subtitle: 'Ana sayfana eklemek istediğin kartı seç', cls: 'ws-picker-modal ws-card-picker' });
  const colSwitch = el('div', 'ws-seg');
  const segs = ['Sol sütun', 'Sağ sütun'].map((t, i) => {
    const b = el('button', '', el('span', '', t));
    b.type = 'button';
    b.onclick = () => {
      targetCol = i;
      paintPicker();
    };
    colSwitch.append(b);
    return b;
  });
  const gallery = el('div', 'ws-card-gallery');
  picker.body.append(el('div', 'ws-picker-top', el('small', '', 'Nereye eklensin?'), colSwitch), gallery);
  const pickDone = el('button', 'ws-primary', 'Tamam');
  pickDone.type = 'button';
  pickDone.onclick = () => picker.close();
  const pickCount = el('span', 'ws-foot-status');
  picker.foot.append(pickCount, el('span', 'ws-foot-actions', pickDone));
  function paintPicker() {
    segs.forEach((b, i) => b.classList.toggle('on', i === targetCol));
    const placed = new Set(layout.flat());
    gallery.replaceChildren(
      ...o.cards.map((c) => {
        const have = placed.has(c.id);
        const b = el(
          'button',
          'ws-card-option' + (have ? ' added' : ''),
          el('span', 'ws-card-option-icon', icon(c.icon)),
          el('span', 'ws-card-option-text', el('strong', '', c.title), el('small', '', c.text)),
          el('span', 'ws-card-option-state', have ? icon('check') : icon('plus')),
        );
        b.type = 'button';
        b.title = have ? 'Ana sayfada · kaldırmak için tıkla' : 'Ekle';
        b.onclick = () => {
          if (have) layout = layout.map((col) => col.filter((x) => x !== c.id));
          else layout[targetCol].push(c.id);
          commit();
          paintPicker();
        };
        return b;
      }),
    );
    pickCount.textContent = placed.size + ' / ' + o.cards.length;
  }
  function openPicker(col: number) {
    targetCol = col;
    picker.open();
    paintPicker();
  }

  return {
    set,
    setEditing,
    isEditing: () => on,
    placed: (id: string) => layout.some((c) => c.includes(id)),
    layout: () => layout,
  };
}
