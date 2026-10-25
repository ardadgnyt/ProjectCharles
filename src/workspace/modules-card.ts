import { el, icon, iconButton } from "./icons";
import { modal } from "./modal";

export function modulesCard(d: any) {
  const { api } = d;
  let mods: any[] = [];
  let open: string[] = [];
  let layout: string[] | null = null;
  let loaded = false;
  let error = "";
  const stateLine = el("span", "ws-pill-state", el("i", "ws-dot"), el("span", "", "Y\xFCkleniyor\u2026"));
  const editB = el("button", "ws-edit-btn", icon("pencil"), el("span", "", "D\xFCzenle"));
  editB.type = "button";
  editB.onclick = () => openEditor();
  const card = el("section", "ws-card ws-dash ws-modules-card");
  card.append(
    el("div", "ws-card-head ws-home-head", el("span", "ws-card-icon", icon("puzzle")), el("div", "ws-head-text", el("h2", "", "Mod\xFCller"), stateLine), editB)
  );
  const grid = el("div", "ws-home-grid ws-mod-grid");
  const count = el("small", "ws-home-count");
  card.append(grid, count);
  const byId = (id: string) => mods.find((m) => m.id === id);
  const shown = () => (layout ?? mods.map((m) => m.id)).filter((id) => !!byId(id));
  function iconOf(m: any, cls: string) {
    if (m.icon) {
      const img = el("img", cls + " ws-mod-img") as HTMLImageElement;
      img.src = m.icon;
      img.alt = "";
      return img;
    }
    const letter = el("span", cls + " ws-mod-letter", (m.name || "?").slice(0, 1).toLocaleUpperCase("tr"));
    letter.translate = false;
    return letter;
  }
  async function save(ids: string[]) {
    const before = layout;
    layout = ids;
    paint();
    if (editor.isOpen()) paintEditor();
    try {
      const v = await d.save({ modules: ids });
      layout = Array.isArray(v?.modules) ? v.modules : ids;
    } catch (e: any) {
      layout = before;
      paint();
      if (editor.isOpen()) paintEditor();
      d.notice(e.message);
    }
  }
  async function openModule(m: any, b: HTMLButtonElement) {
    b.disabled = true;
    try {
      await api.modulesOpen(m.id);
      if (!open.includes(m.id)) open = [...open, m.id];
      paint();
    } catch (e: any) {
      d.notice(e.message);
    } finally {
      b.disabled = !m.enabled || !!m.error;
    }
  }
  function tile(m: any) {
    const name = el("strong", "ws-ht-name", m.name);
    name.translate = false;
    const run = el("button", "ws-mod-open", icon("play"), el("span", "", "A\xE7"));
    run.type = "button";
    run.disabled = !m.enabled || !!m.error;
    run.title = m.error ? m.error : m.enabled ? m.name : "Kapal\u0131 mod\xFCller a\xE7\u0131lamaz";
    run.onclick = (e) => {
      e.stopPropagation();
      void openModule(m, run);
    };
    const state = el("small", "ws-ht-state", m.error ? "Hata" : !m.enabled ? "Kapal\u0131" : open.includes(m.id) ? "A\xE7\u0131k" : "v" + (m.version || ""));
    const t = el("div", "ws-ht ws-mod-tile", el("span", "ws-ht-icon", iconOf(m, "ws-mod-icon")), name, el("span", "ws-ht-foot", state, run));
    t.classList.toggle("off", !m.enabled || !!m.error);
    t.classList.toggle("on", open.includes(m.id));
    if (m.description) t.title = m.description;
    return t;
  }
  function paint() {
    const ok = loaded && !error;
    stateLine.classList.toggle("on", ok && mods.length > 0);
    stateLine.lastChild!.textContent = !loaded ? "Y\xFCkleniyor\u2026" : error ? "Okunamad\u0131" : mods.length ? mods.length + " mod\xFCl y\xFCkl\xFC" : "Mod\xFCl yok";
    editB.hidden = !ok || !mods.length;
    if (!loaded) return;
    if (error) {
      grid.replaceChildren(el("p", "ws-empty", error));
      count.textContent = "";
      return;
    }
    if (!mods.length) {
      const b = el("button", "", "Mod\xFCl y\xFCkle");
      b.type = "button";
      b.onclick = () => d.openSettings("modules");
      grid.replaceChildren(el("p", "ws-empty", "Hen\xFCz mod\xFCl yok. Ayarlar \u2192 Mod\xFCller\u2019den bir .zip mod\xFCl y\xFCkleyebilirsin."), b);
      count.textContent = "";
      return;
    }
    const list = shown().map(byId).filter(Boolean);
    grid.replaceChildren(...(list.length ? list.map(tile) : [el("p", "ws-empty", "G\xF6sterilecek mod\xFCl yok. D\xFCzenle ile mod\xFCl ekleyebilirsin.")]));
    count.textContent = list.length + " mod\xFCl";
  }
  let loading: Promise<void> | null = null;
  function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const s = await api.modulesList();
        mods = Array.isArray(s?.modules) ? s.modules : [];
        open = Array.isArray(s?.open) ? s.open : [];
        error = "";
      } catch (e: any) {
        error = e.message;
      }
      loaded = true;
      paint();
      if (editor.isOpen() && !dragId) paintEditor();
    })().finally(() => (loading = null));
    return loading;
  }
  function set(dash: any) {
    layout = Array.isArray(dash?.modules) ? dash.modules.filter((x: any) => typeof x === "string") : null;
    paint();
  }
  api.onModulesChanged?.(() => {
    if (card.isConnected) void load();
  });
  const editor = modal({ icon: "puzzle", title: "Mod\xFClleri d\xFCzenle", cls: "ws-home-editor ws-mod-editor" });
  const addB = el("button", "ws-primary", icon("plus"), el("span", "", "Ekle"));
  addB.type = "button";
  addB.onclick = () => openPicker();
  const board = el("div", "ws-board");
  editor.body.append(
    el("div", "ws-board-head", el("div", "", el("h3", "", "Mod\xFCl yerle\u015Fimi"), el("p", "", "Mod\xFClleri s\xFCr\xFCkleyip istedi\u011Fin s\u0131raya b\u0131rak.")), addB),
    board,
    el("p", "ws-board-note", "Yeni mod\xFCller eklendik\xE7e alt sat\u0131rlar olu\u015Fur.")
  );
  const editCount = el("span", "ws-foot-status");
  const doneB = el("button", "ws-primary", "Bitti");
  doneB.type = "button";
  doneB.onclick = () => editor.close();
  editor.foot.append(editCount, el("span", "ws-foot-actions", doneB));
  let dragId = "";
  let dropAt = -1;
  const slot = el("div", "ws-cell ws-slot", icon("plus"), el("span", "", "Buraya b\u0131rak"));
  const DRAG_TYPE = "application/x-charles-module";
  let cells: HTMLElement[] = [];
  let free: HTMLElement | null = null;
  function paintEditor() {
    const ids = shown();
    cells = [];
    ids.forEach((id, i) => {
      const m = byId(id);
      if (!m) return;
      const name = el("strong", "", m.name);
      name.translate = false;
      const remove = iconButton("x", m.name + " \xB7 kald\u0131r", () => void save(shown().filter((x) => x !== id)), "ws-icon ws-cell-x");
      const cell = el("div", "ws-cell", el("span", "ws-cell-icon", iconOf(m, "ws-mod-icon")), name, el("span", "ws-grip", icon("grip")), remove);
      cell.draggable = true;
      cell.dataset.index = String(i);
      cell.dataset.id = id;
      cell.ondragstart = (e) => {
        dragId = id;
        dropAt = -1;
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData(DRAG_TYPE, id);
        window.setTimeout(() => cell.classList.add("dragging"), 0);
      };
      cell.ondragend = () => {
        cell.classList.remove("dragging");
        slot.remove();
        dragId = "";
        dropAt = -1;
      };
      cells.push(cell);
    });
    free = el("div", "ws-cell ws-free");
    free.onclick = () => openPicker();
    free.title = "Mod\xFCl ekle";
    board.replaceChildren(...cells, free);
    editCount.textContent = ids.length + " mod\xFCl \xB7 3 s\xFCtun";
  }
  function placeSlot(at: number) {
    if (at === dropAt && slot.isConnected) return;
    dropAt = at;
    const before = cells.filter((c) => c.dataset.id !== dragId)[at] || free;
    board.insertBefore(slot, before);
  }
  board.ondragover = (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    const others = cells.filter((c) => c.dataset.id !== dragId);
    let at = others.length;
    for (let i = 0; i < others.length; i++) {
      const r = others[i].getBoundingClientRect();
      if (e.clientY < r.bottom && (e.clientY < r.top || e.clientX < r.left + r.width / 2)) {
        at = i;
        break;
      }
    }
    placeSlot(at);
  };
  board.ondrop = (e) => {
    e.preventDefault();
    if (!dragId) return;
    const ids = shown().filter((x) => x !== dragId);
    const at = dropAt < 0 ? ids.length : Math.min(dropAt, ids.length);
    ids.splice(at, 0, dragId);
    dragId = "";
    dropAt = -1;
    slot.remove();
    void save(ids);
  };
  const picker = modal({ icon: "plus", title: "Mod\xFClleri ekle".replace("Mod\xFClleri", "Mod\xFCl"), subtitle: "Y\xFCkl\xFC mod\xFCllerinden se\xE7", cls: "ws-picker-modal" });
  const results = el("div", "ws-picker-list");
  picker.body.append(results);
  const pickDone = el("button", "ws-primary", "Tamam");
  pickDone.type = "button";
  pickDone.onclick = () => picker.close();
  const manage = el("button", "", "Mod\xFClleri y\xF6net");
  manage.type = "button";
  manage.onclick = () => {
    picker.close();
    editor.close();
    d.openSettings("modules");
  };
  picker.foot.append(el("span", "ws-foot-status", ""), el("span", "ws-foot-actions", manage, pickDone));
  function paintPicker() {
    const have = new Set(shown());
    const list = mods.filter((m) => !have.has(m.id));
    results.replaceChildren(
      ...list.map((m) => {
        const name = el("strong", "", m.name);
        name.translate = false;
        const kind = el("small", "", "v" + (m.version || "") + (m.enabled ? "" : " \xB7 kapal\u0131"));
        kind.translate = false;
        const b = el("button", "ws-picker-row", el("span", "ws-cell-icon", iconOf(m, "ws-mod-icon")), el("span", "ws-picker-text", name, kind), icon("plus"));
        b.type = "button";
        b.onclick = () => void save([...shown(), m.id]).then(paintPicker);
        return b;
      })
    );
    if (!list.length) results.append(el("p", "ws-empty", "Eklenecek ba\u015Fka mod\xFCl yok."));
  }
  function openPicker() {
    picker.open();
    paintPicker();
  }
  function openEditor() {
    editor.open();
    paintEditor();
  }
  return { element: card, load, set };
}
