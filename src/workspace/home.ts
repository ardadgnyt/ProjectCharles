// v0.7.2: the smart home card of the app window and its editor ("Akıllı evi düzenle").
// Home Assistant devices in a 3-column grid; the editor places them by drag and drop and
// adds new ones from a separate "Cihaz ekle" panel. The chosen devices and their order are
// kept in companion.json (main: workspace-home-layout).
import { el, icon, iconButton } from './icons';
import { modal } from './modal';

export type HomeDeps = {
  api: any;
  notice: (s: string) => void;
  openSettings: (category: string) => void;
};

const TOGGLE = /^(light|switch|fan|input_boolean|automation|lock|media_player|cover|climate)\./;
const ACTION = /^(scene|script)\./;
const PICKABLE = /^(light|switch|fan|input_boolean|automation|lock|scene|script|sensor|binary_sensor|climate|cover|media_player)\./;

const isOn = (r: any) => {
  const id = r.id as string;
  if (/^lock\./.test(id)) return r.text === 'locked';
  if (/^cover\./.test(id)) return r.text === 'open' || r.text === 'opening';
  if (/^(media_player|climate)\./.test(id)) return !['off', 'unavailable', 'unknown', 'standby'].includes(r.text);
  return r.text === 'on';
};
function iconFor(id: string, title = '') {
  const t = (id + ' ' + title).toLocaleLowerCase('tr');
  if (/^light\./.test(id)) return 'bulb';
  if (/^media_player\./.test(id) || /tv|televizyon/.test(t)) return 'tv';
  if (/^cover\./.test(id) || /perde|curtain|blind|panjur/.test(t)) return 'curtain';
  if (/^climate\./.test(id) || /klima|ac\b|air/.test(t)) return 'snow';
  if (/^lock\./.test(id)) return 'lock';
  if (/^sensor\./.test(id) && /temp|sıcak|sicak/.test(t)) return 'thermo';
  if (/^(switch|input_boolean)\./.test(id) || /priz|plug|socket/.test(t)) return 'plug';
  if (/^fan\./.test(id)) return 'fan';
  if (ACTION.test(id)) return 'bolt';
  return 'home';
}
function stateText(r: any) {
  const id = r.id as string;
  if (/^lock\./.test(id)) return r.text === 'locked' ? 'Kilitli' : 'Açık';
  if (/^cover\./.test(id)) return isOn(r) ? 'Açık' : 'Kapalı';
  if (TOGGLE.test(id)) return isOn(r) ? 'Açık' : 'Kapalı';
  if (ACTION.test(id)) return 'Sahne';
  const raw = String(r.text ?? '').trim();
  const n = parseFloat(raw);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(raw))
    return (
      n.toLocaleString('tr-TR') +
      (r.unit ? (r.unit === '°C' || r.unit === '°F' ? '°' : ' ' + r.unit) : /temp|sıcak|sicak/i.test(id + ' ' + r.title) ? '°' : '')
    );
  return raw || '—';
}
function actionFor(r: any) {
  const id = r.id as string;
  const on = isOn(r);
  if (/^lock\./.test(id)) return on ? 'unlock' : 'lock';
  if (/^cover\./.test(id)) return on ? 'close_cover' : 'open_cover';
  return on ? 'turn_off' : 'turn_on';
}
const flip = (r: any) => {
  const id = r.id as string;
  const on = isOn(r);
  r.text = /^lock\./.test(id) ? (on ? 'unlocked' : 'locked') : /^cover\./.test(id) ? (on ? 'closed' : 'open') : on ? 'off' : 'on';
};

export function homeCard(d: HomeDeps) {
  const { api } = d;
  let rows: any[] = [];
  let layout: string[] | null = null;
  let connected = false;
  let error = '';
  const tiles = new Map<string, HTMLElement>();

  // ── card ────────────────────────────────────────────────────────────────────
  const stateLine = el('span', 'ws-pill-state', el('i', 'ws-dot'), el('span', '', 'Home Assistant'));
  const editB = el('button', 'ws-edit-btn', icon('pencil'), el('span', '', 'Düzenle'));
  editB.type = 'button';
  editB.onclick = () => openEditor();
  const card = el('section', 'ws-card ws-dash ws-home-card');
  card.append(
    el('div', 'ws-card-head ws-home-head', el('span', 'ws-card-icon', icon('home')), el('div', 'ws-head-text', el('h2', '', 'Akıllı ev'), stateLine), editB),
  );
  const grid = el('div', 'ws-home-grid');
  const count = el('small', 'ws-home-count');
  card.append(grid, count);

  function autoLayout() {
    const switches = rows.filter((r) => /^(light|switch|fan)\./.test(r.id) && ['on', 'off'].includes(r.text)).slice(0, 4);
    const temp = rows.find((r) => /^sensor\./.test(r.id) && /temp|sıcak|sicak/i.test(r.id + ' ' + r.title) && Number.isFinite(parseFloat(r.text)));
    const scenes = rows.filter((r) => ACTION.test(r.id)).slice(0, 2);
    return [...switches, ...(temp ? [temp] : []), ...scenes].map((r) => r.id);
  }
  const shown = () => (layout ?? autoLayout()).filter((id) => rows.some((r) => r.id === id));
  async function save(ids: string[]) {
    layout = ids;
    paint();
    if (editor.isOpen()) paintEditor();
    try {
      layout = await api.workspaceHomeLayout(ids);
    } catch (e) {
      d.notice((e as Error).message);
    }
  }
  async function act(r: any, tile: HTMLElement) {
    try {
      if (TOGGLE.test(r.id)) {
        const action = actionFor(r);
        flip(r);
        patch(tile, r);
        await api.workspaceHomeAction(r.id, action);
      } else if (ACTION.test(r.id)) {
        tile.classList.add('pressed');
        window.setTimeout(() => tile.classList.remove('pressed'), 350);
        await api.workspaceHomeAction(r.id, 'turn_on');
      } else return;
      window.setTimeout(() => void load(true), 1500);
    } catch (e) {
      d.notice((e as Error).message);
      void load(true);
    }
  }
  function patch(t: HTMLElement, r: any) {
    const on = isOn(r);
    t.classList.toggle('on', TOGGLE.test(r.id) && on);
    t.setAttribute('aria-checked', String(on));
    t.querySelector('.ws-ht-state')!.textContent = stateText(r);
    (t.querySelector('.ws-ht-name') as HTMLElement).textContent = r.title;
  }
  function tile(r: any) {
    let t = tiles.get(r.id);
    if (!t) {
      const name = el('strong', 'ws-ht-name', r.title);
      name.translate = false;
      t = el('div', 'ws-ht', el('span', 'ws-ht-icon', icon(iconFor(r.id, r.title))), name, el('span', 'ws-ht-foot', el('small', 'ws-ht-state', '')));
      const foot = t.querySelector('.ws-ht-foot')!;
      if (TOGGLE.test(r.id)) {
        t.classList.add('toggle');
        t.setAttribute('role', 'switch');
        t.tabIndex = 0;
        foot.append(el('i', 'ws-switch'));
      } else if (ACTION.test(r.id)) {
        t.classList.add('action');
        t.setAttribute('role', 'button');
        t.tabIndex = 0;
        foot.append(el('span', 'ws-run', icon('play')));
      } else t.classList.add('value');
      const self = t;
      t.onclick = () => {
        const row = rows.find((x) => x.id === r.id);
        if (row) void act(row, self);
      };
      t.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.click();
        }
      };
      tiles.set(r.id, t);
    }
    patch(t, r);
    return t;
  }
  /** Replaces children only where they differ, so the switches keep animating smoothly. */
  function sync(host: HTMLElement, next: Node[]) {
    next.forEach((node, i) => {
      if (host.childNodes[i] !== node) host.insertBefore(node, host.childNodes[i] || null);
    });
    while (host.childNodes.length > next.length) host.lastChild!.remove();
  }
  function paint() {
    stateLine.classList.toggle('on', connected && !error);
    stateLine.lastChild!.textContent = connected ? (error ? 'Home Assistant · hata' : 'Home Assistant · Bağlı') : 'Bağlı değil';
    editB.hidden = !connected || !!error;
    if (!connected) {
      const b = el('button', '', 'Eklentiler’den bağla');
      b.type = 'button';
      b.onclick = () => d.openSettings('connections');
      grid.replaceChildren(el('p', 'ws-empty', 'Işıkları, prizleri ve sahneleri buradan kontrol etmek için Home Assistant’ı bağla.'), b);
      count.textContent = '';
      return;
    }
    if (error) {
      grid.replaceChildren(el('p', 'ws-empty', error));
      count.textContent = '';
      return;
    }
    const list = shown()
      .map((id) => rows.find((r) => r.id === id))
      .filter(Boolean);
    sync(grid, list.length ? list.map(tile) : [el('p', 'ws-empty', 'Gösterilecek cihaz yok. Düzenle ile cihaz ekleyebilirsin.')]);
    count.textContent = list.length + ' cihaz';
  }
  async function load(force = false) {
    try {
      const [v, l] = await Promise.all([api.workspaceHome(force), layout === null ? api.workspaceHomeLayout() : Promise.resolve(layout)]);
      connected = !!v.connected;
      error = v.error || '';
      rows = v.rows || [];
      layout = l;
    } catch (e) {
      error = (e as Error).message;
    }
    paint();
    if (editor.isOpen()) paintEditor();
  }

  // ── editor: drag and drop placement ─────────────────────────────────────────
  const editor = modal({ icon: 'home', title: 'Akıllı evi düzenle', cls: 'ws-home-editor' });
  const addB = el('button', 'ws-primary', icon('plus'), el('span', '', 'Ekle'));
  addB.type = 'button';
  addB.onclick = () => openPicker();
  const board = el('div', 'ws-board');
  editor.body.append(
    el('div', 'ws-board-head', el('div', '', el('h3', '', 'Cihaz yerleşimi'), el('p', '', 'Cihazları sürükleyip istediğin hücreye bırak.')), addB),
    board,
    el('p', 'ws-board-note', 'Yeni cihazlar eklendikçe alt satırlar oluşur.'),
  );
  const editCount = el('span', 'ws-foot-status');
  const doneB = el('button', 'ws-primary', 'Bitti');
  doneB.type = 'button';
  doneB.onclick = () => editor.close();
  editor.foot.append(editCount, el('span', 'ws-foot-actions', doneB));
  let dragId = '';
  let dropAt = -1;
  function paintEditor() {
    const ids = shown();
    board.replaceChildren();
    const cells: HTMLElement[] = [];
    ids.forEach((id, i) => {
      const r = rows.find((x) => x.id === id);
      if (!r) return;
      const name = el('strong', '', r.title);
      name.translate = false;
      const remove = iconButton('x', r.title + ' · kaldır', () => void save(shown().filter((x) => x !== id)), 'ws-icon ws-cell-x');
      const cell = el('div', 'ws-cell', el('span', 'ws-cell-icon', icon(iconFor(r.id, r.title))), name, el('span', 'ws-grip', icon('grip')), remove);
      cell.draggable = true;
      cell.dataset.index = String(i);
      cell.ondragstart = (e) => {
        dragId = id;
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', id);
        window.setTimeout(() => cell.classList.add('dragging'), 0);
      };
      cell.ondragend = () => {
        dragId = '';
        dropAt = -1;
        paintEditor();
      };
      cells.push(cell);
    });
    // the drop slot follows the pointer ("Buraya bırak")
    const slot = el('div', 'ws-cell ws-slot', icon('plus'), el('span', '', 'Buraya bırak'));
    const free = el('div', 'ws-cell ws-free');
    free.onclick = () => openPicker();
    free.title = 'Cihaz ekle';
    const nodes: HTMLElement[] = [...cells];
    if (dragId && dropAt >= 0) nodes.splice(Math.min(dropAt, nodes.length), 0, slot);
    nodes.push(free);
    board.append(...nodes);
    editCount.textContent = ids.length + ' cihaz · 3 sütun';
  }
  board.ondragover = (e) => {
    if (!dragId) return;
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>('.ws-cell');
    if (!target || target.classList.contains('ws-slot')) return;
    let at = target.classList.contains('ws-free') ? shown().length : Number(target.dataset.index);
    const r = target.getBoundingClientRect();
    if (!target.classList.contains('ws-free') && e.clientX > r.left + r.width / 2) at += 1;
    if (at !== dropAt) {
      dropAt = at;
      paintEditor();
    }
  };
  board.ondrop = (e) => {
    e.preventDefault();
    if (!dragId) return;
    const ids = shown();
    const from = ids.indexOf(dragId);
    let to = dropAt < 0 ? ids.length : dropAt;
    if (from >= 0) {
      ids.splice(from, 1);
      if (to > from) to -= 1;
    }
    ids.splice(Math.max(0, Math.min(to, ids.length)), 0, dragId);
    dragId = '';
    dropAt = -1;
    void save(ids);
  };

  // ── "Cihaz ekle" ────────────────────────────────────────────────────────────
  const picker = modal({ icon: 'plus', title: 'Cihaz ekle', subtitle: 'Home Assistant’taki cihazlarından seç', cls: 'ws-picker-modal' });
  const search = el('input', 'ws-picker-search');
  search.type = 'search';
  search.placeholder = 'Cihaz ara (ışık, priz, TV, perde, klima, sensör, sahne…)';
  search.setAttribute('aria-label', 'Cihaz ara');
  const results = el('div', 'ws-picker-list');
  picker.body.append(search, results);
  const pickDone = el('button', 'ws-primary', 'Tamam');
  pickDone.type = 'button';
  pickDone.onclick = () => picker.close();
  picker.foot.append(el('span', 'ws-foot-status', ''), el('span', 'ws-foot-actions', pickDone));
  function paintPicker() {
    const q = search.value.trim().toLocaleLowerCase('tr');
    const have = new Set(shown());
    const list = rows
      .filter((r) => PICKABLE.test(r.id) && !have.has(r.id))
      .filter((r) => !q || (r.title + ' ' + r.id).toLocaleLowerCase('tr').includes(q))
      .slice(0, 80);
    results.replaceChildren(
      ...list.map((r) => {
        const name = el('strong', '', r.title);
        name.translate = false;
        const kind = el('small', '', r.id.split('.')[0] + ' · ' + stateText(r));
        kind.translate = false;
        const b = el('button', 'ws-picker-row', el('span', 'ws-cell-icon', icon(iconFor(r.id, r.title))), el('span', 'ws-picker-text', name, kind), icon('plus'));
        b.type = 'button';
        b.onclick = () => void save([...shown(), r.id]).then(paintPicker);
        return b;
      }),
    );
    if (!list.length) results.append(el('p', 'ws-empty', 'Eklenecek başka cihaz bulunamadı.'));
  }
  search.oninput = paintPicker;
  function openPicker() {
    search.value = '';
    picker.open();
    paintPicker();
    search.focus();
  }
  function openEditor() {
    editor.open();
    paintEditor();
  }

  return { element: card, load, paint };
}
