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

// v0.9.20: the measures of a desktop icon, side by side with Windows': a 48 px picture over a
// column of about eleven letters. The picture stays this wide and clear at the sides on purpose:
// Electron's startDrag writes the file's path in whatever room is left beside it, and this leaves
// none (it cannot be turned off).
const GHOST_W = 180;
const ICON = 48;
const ICON_TOP = 2;
const NAME_W = 74;
const LINE = 16;
const MAX_LINES = 6;
const dragScale = () => Math.max(1, Math.min(4, window.devicePixelRatio || 1));

/**
 * The name as Windows writes it under a desktop icon: broken at a space when one is near, otherwise
 * between any two letters, so a long name with no spaces is read in full. Only a name too long for
 * MAX_LINES loses its middle, and its end (the extension) stays.
 */
export function nameLines(measure: (text: string) => number, name: string, width: number, max = MAX_LINES) {
  const lines: string[] = [];
  let rest = name.trim();
  while (rest && lines.length < max) {
    if (measure(rest) <= width) {
      lines.push(rest);
      rest = '';
      break;
    }
    let cut = 1;
    while (cut < rest.length && measure(rest.slice(0, cut + 1)) <= width) cut++;
    const space = rest.lastIndexOf(' ', cut);
    if (space > cut * 0.5) cut = space;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (!rest) return lines;
  // too long even so: the last line ends with the end of the name
  const whole = name.trim();
  let tail = 1;
  while (tail < whole.length && measure('…' + whole.slice(-(tail + 1))) <= width) tail++;
  lines[lines.length - 1] = '…' + whole.slice(-tail);
  return lines;
}

/**
 * What follows the pointer, in the look of a file dragged from the desktop: the picture on nothing,
 * its name under it in white with a soft shadow, and fully transparent around them.
 * v0.9.20: the name breaks in a narrow column as under a desktop icon, and the picture is as tall as
 * the name needs. In a wider column it reached the sides and was cut there.
 */
function dragCard(name: string, thumb: HTMLImageElement | null) {
  const scale = dragScale();
  const canvas = document.createElement('canvas');
  const x = canvas.getContext('2d');
  if (!x) return '';
  const font = '12px "Segoe UI Variable Text", "Segoe UI", sans-serif';
  x.font = font;
  const lines = nameLines((t) => x.measureText(t).width, name, NAME_W);
  const box = ICON;
  const top = ICON_TOP;
  canvas.width = Math.round(GHOST_W * scale);
  canvas.height = Math.round((top + box + 9 + lines.length * LINE) * scale);
  x.scale(scale, scale); // setting the canvas size cleared the context
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
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0, 0, 0, 0.9)';
  x.shadowBlur = 3;
  x.shadowOffsetY = 1;
  lines.forEach((line, i) => x.fillText(line, GHOST_W / 2, top + box + 15 + i * LINE));
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
