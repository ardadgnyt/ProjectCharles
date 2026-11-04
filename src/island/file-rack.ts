// v0.9.15: Dosya Rafı — the third page of Dosyalar. Files dropped here stay until they are removed
// (the copies live in app/files/file-rack.cjs); a row is dragged out as a real file. Ctrl+V works
// only while the focus is inside the shelf, so the chat's own paste never comes here.
import { el, icon } from '../workspace/icons';

type Item = { id: string; name: string; size: number; addedAt: number };
type Deps = {
  api: any;
  notice: (s: string) => void;
  attempt: (fn: () => Promise<any>) => Promise<void>;
};

function sizeText(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

export function fileRack({ api, notice, attempt }: Deps) {
  const root = el('div', 'rack');
  root.dataset.drop = 'rack';
  root.tabIndex = -1;
  root.setAttribute('aria-label', 'Dosya Rafı');
  const list = el('div', 'rack-list');
  const empty = el('div', 'rack-empty', el('span', 'rack-empty-icon', icon('folder')), el('strong', '', 'Raf boş'));
  const hint = el('small', 'rack-hint', 'Dosyaları buraya sürükle · Ctrl+V ile ekran görüntüsü ekle');
  root.append(empty, list, hint);

  const row = (item: Item) => {
    const name = el('strong', 'rack-name', item.name);
    name.translate = false;
    name.title = item.name;
    const remove = el('button', 'rack-remove', icon('x'));
    remove.type = 'button';
    remove.title = 'Raftan sil';
    remove.setAttribute('aria-label', 'Raftan sil: ' + item.name);
    // The shelf may hold the only copy left, so a slip of the mouse deletes nothing
    let armed = 0;
    const disarm = () => {
      window.clearTimeout(armed);
      armed = 0;
      remove.classList.remove('armed');
      remove.replaceChildren(icon('x'));
      remove.title = 'Raftan sil';
    };
    remove.onclick = () => {
      if (!armed) {
        armed = window.setTimeout(disarm, 3000);
        remove.classList.add('armed');
        remove.replaceChildren(icon('trash'));
        remove.title = 'Silmek için tekrar bas';
        return;
      }
      disarm();
      void attempt(async () => show((await api.rackRemove(item.id)).items));
    };
    const line = el('div', 'rack-item', el('span', 'rack-item-icon', icon('file')), el('span', 'rack-text', name, el('small', '', sizeText(item.size))), remove);
    line.draggable = true;
    line.dataset.rackItem = item.id;
    // Windows runs the drag (main → startDrag). A cancelled page drag never fires dragend, so it
    // is sent here: otherwise later drops from outside would still count as internal drags.
    line.ondragstart = (e) => {
      e.preventDefault();
      document.dispatchEvent(new Event('dragend'));
      void attempt(() => api.rackDrag(item.id));
    };
    return line;
  };
  function show(items: Item[]) {
    list.replaceChildren(...items.map(row));
    list.hidden = !items.length;
    empty.hidden = !!items.length;
  }
  function received({ result, error }: { result?: { items: Item[]; skipped: string[] }; error?: string }) {
    if (error) return notice(error);
    if (!result) return;
    show(result.items);
    if (result.skipped.length) notice('Klasörler rafa eklenemez.');
  }
  root.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.code !== 'KeyV') return;
    e.preventDefault();
    void attempt(async () => show((await api.rackPaste()).items));
  });
  show([]);
  return {
    root,
    received,
    open() {
      root.focus({ preventScroll: true });
      void attempt(async () => show(await api.rackList()));
    },
  };
}
