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

/**
 * v1.0.0: where the saved layout's cards are drawn. The saved columns are read as they are (a layout
 * from an older version needs no conversion); the cards in `topIds` are drawn across the top, in
 * their saved order, and every other card stays in its column and order.
 */
export function arrange(layout: string[][], topIds: string[]) {
  const onTop = new Set(topIds);
  return {
    top: layout.flat().filter((id) => onTop.has(id)),
    cols: layout.map((col) => col.filter((id) => !onTop.has(id))),
  };
}

/** v1.0.0: two layouts place the same cards in the same columns and order. */
export function sameLayout(a: string[][], b: string[][]) {
  return [0, 1].every((i) => (a[i] || []).join() === (b[i] || []).join());
}
/** v1.0.0: "Düzeni sıfırla" — a fresh copy of the default layout (nothing hidden, default order). */
export function resetLayout(defaults: string[][]) {
  return [defaults[0] || [], defaults[1] || []].map((c) => c.slice());
}

export function dashEditor(o: {
  root: HTMLElement;
  cols: HTMLElement[];
  /** v1.0.0: the default layout, restored by "Düzeni sıfırla" in the edit bar. */
  defaults?: string[][];
  /**
   * v1.0.0: cards drawn across the full width above the columns (the message box). The saved
   * layout is unchanged: such a card keeps its place in a column's list, it is only drawn on top.
   * It can be removed and added like any card, but not dragged.
   */
  top?: { element: HTMLElement; ids: string[] };
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
  // v1.0.0: "Düzeni sıfırla" asks in the bar itself (like "Eminim, geri al" in the review), then
  // restores the default layout and stays in the edit mode so the result is seen
  const resetB = el('button', 'ws-home-reset', icon('undo'), el('span', '', 'Düzeni sıfırla'));
  resetB.type = 'button';
  const yesB = el('button', 'ws-home-reset ws-home-reset-yes', el('span', '', 'Evet, sıfırla'));
  yesB.type = 'button';
  const noB = el('button', 'ws-home-reset', el('span', '', 'Vazgeç'));
  noB.type = 'button';
  const text = el('div', 'ws-home-editbar-text', el('strong', '', 'Ana sayfayı düzenliyorsun'), el('small', '', 'Kartları tutup sürükleyerek yerini veya sütununu değiştir; × ile kaldır.'));
  const ask = el('div', 'ws-home-editbar-text', el('strong', '', 'Varsayılan düzene dönülsün mü?'), el('small', '', 'Kartlar ilk yerlerine döner, kaldırdıkların geri gelir.'));
  const bar = el('div', 'ws-home-editbar', el('span', 'ws-home-editbar-icon', icon('grip')), text, ask, resetB, noB, yesB, doneB);
  bar.hidden = true;
  function asking(v: boolean) {
    text.hidden = v;
    resetB.hidden = v || !o.defaults;
    doneB.hidden = v;
    ask.hidden = !v;
    noB.hidden = !v;
    yesB.hidden = !v;
    if (v) noB.focus();
  }
  asking(false);
  resetB.onclick = () => asking(true);
  noB.onclick = () => {
    asking(false);
    resetB.focus();
  };
  yesB.onclick = () => {
    asking(false);
    if (o.defaults) layout = resetLayout(o.defaults);
    commit();
    doneB.focus();
  };

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
    resetB.disabled = !o.defaults || sameLayout(layout, o.defaults);
    const onTop = new Set(o.top?.ids || []);
    const drawn = arrange(layout, o.top?.ids || []);
    if (o.top) {
      o.top.element.replaceChildren(...drawn.top.map((id) => byId.get(id)!.element));
      o.top.element.hidden = !drawn.top.length;
    }
    o.cols.forEach((col, i) => {
      const ids = drawn.cols[i] || [];
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
      c.element.draggable = on && !onTop.has(c.id);
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
    asking(false);
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
