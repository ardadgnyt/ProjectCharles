// v0.9.15: Dosya Rafı — the third page of Dosyalar. Files dropped here stay until they are removed
// (the copies live in app/files/file-rack.cjs); a row is dragged out as a real file.
// v0.9.16: Ctrl+V works while the shelf is on screen. It used to be heard only with the focus on
// the shelf's own box, and a removed row, a click beside the list or a redraw leaves the focus on
// <body> with nothing on screen to show it. Text boxes keep their own paste.
import { el, icon } from '../workspace/icons';

type Item = { id: string; name: string; size: number; addedAt: number };
type Deps = {
  api: any;
  notice: (s: string) => void;
  attempt: (fn: () => Promise<any>) => Promise<void>;
};

const GHOST_W = 180;
const GHOST_H = 112;
const dragScale = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));

/**
 * The name in up to two lines, broken between words; what still does not fit goes from the middle
 * of the second line, so its end (the extension, a date) stays.
 */
function nameLines(x: CanvasRenderingContext2D, name: string, width: number) {
  if (x.measureText(name).width <= width) return [name];
  let cut = name.length;
  while (cut > 1 && x.measureText(name.slice(0, cut)).width > width) cut--;
  const space = name.lastIndexOf(' ', cut);
  if (space > cut * 0.45) cut = space;
  const first = name.slice(0, cut).trimEnd();
  const rest = name.slice(cut).trimStart();
  if (x.measureText(rest).width <= width) return [first, rest];
  let tail = rest;
  while (tail.length > 1 && x.measureText('…' + tail).width > width) tail = tail.slice(1);
  return [first, '…' + tail.trimStart()];
}

/**
 * What follows the pointer, in the look of a file dragged from the desktop: the picture on nothing,
 * its name under it in white with a soft shadow. v0.9.18: no card behind them any more, everything
 * around the picture and the name is fully transparent.
 * Electron's startDrag writes the file's whole path beside the picture it is given and cuts it to
 * "C:\Users\User\..." (it cannot be turned off); a picture this wide leaves that text no room.
 */
function dragCard(name: string, thumb: HTMLImageElement | null) {
  const scale = dragScale();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(GHOST_W * scale);
  canvas.height = Math.round(GHOST_H * scale);
  const x = canvas.getContext('2d');
  if (!x) return '';
  x.scale(scale, scale);
  const box = 76;
  const top = 2;
  if (thumb?.complete && thumb.naturalWidth) {
    const k = Math.min(box / thumb.naturalWidth, box / thumb.naturalHeight);
    const w = thumb.naturalWidth * k;
    const h = thumb.naturalHeight * k;
    x.save();
    x.shadowColor = 'rgba(0, 0, 0, 0.4)';
    x.shadowBlur = 5;
    x.shadowOffsetY = 1;
    x.drawImage(thumb, (GHOST_W - w) / 2, top + (box - h) / 2, w, h);
    x.restore();
  }
  x.font = '12px "Segoe UI Variable Text", "Segoe UI", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0, 0, 0, 0.9)';
  x.shadowBlur = 3;
  x.shadowOffsetY = 1;
  nameLines(x, name, GHOST_W - 8).forEach((line, i) => x.fillText(line, GHOST_W / 2, top + box + 16 + i * 15));
  return canvas.toDataURL('image/png');
}

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
    // a picture of the file itself: Windows' own preview, or the file type's icon
    const preview = el('span', 'rack-item-icon', icon('file'));
    const thumb = el('img', 'rack-thumb') as HTMLImageElement;
    thumb.alt = '';
    void Promise.resolve(api.rackThumb?.(item.id))
      .then((src: string | null) => {
        if (typeof src !== 'string' || !src.startsWith('data:image/')) return;
        thumb.onload = () => preview.replaceChildren(thumb);
        thumb.src = src;
      })
      .catch(() => {});
    const line = el('div', 'rack-item', preview, el('span', 'rack-text', name, el('small', '', sizeText(item.size))), remove);
    line.draggable = true;
    line.dataset.rackItem = item.id;
    // Windows runs the drag (main → startDrag). A cancelled page drag never fires dragend, so it
    // is sent here: otherwise later drops from outside would still count as internal drags.
    line.ondragstart = (e) => {
      e.preventDefault();
      document.dispatchEvent(new Event('dragend'));
      void attempt(() => api.rackDrag(item.id, dragCard(item.name, thumb), dragScale()));
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
  const onScreen = () => root.isConnected && root.offsetParent !== null;
  const typing = (node: EventTarget | null) => node instanceof HTMLElement && node.matches('input, textarea, select, [contenteditable="true"]');
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.code !== 'KeyV' || e.repeat) return;
    if (!onScreen() || typing(e.target)) return;
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
