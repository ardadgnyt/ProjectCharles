// v0.9.22: an attachment inside the message box: its preview, and its name under it (never on it).
import { lightbox } from './image-card';

export type AttachmentFile = { id: string; name: string; kind?: string; thumbnail?: string };

const NAME_MAX = 34;
/** A name that fits two lines stays whole; a longer one keeps its start and its extension. */
export function shortName(name: string, max = NAME_MAX) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : '';
  const end = ext ? 6 + ext.length : 8;
  return name.slice(0, max - end - 1).trimEnd() + '…' + name.slice(name.length - end);
}
/** The short word on a file's card: PDF, DOCX, … */
export function fileBadge(name: string) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
  return /^[A-Z0-9]{1,5}$/.test(ext) ? ext : 'DOSYA';
}
const quiet = (badge: HTMLElement, word: string) => {
  badge.textContent = word;
  if (word !== 'DOSYA') badge.setAttribute('translate', 'no');
};
const FILE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/></svg>';

/**
 * The whole name, above the card, while the pointer or the keyboard is on it. Charles turns native
 * tooltips off (ui/no-native-tooltips.ts) and the line of cards clips anything that leaves it, so
 * this stands in the message box itself.
 */
export function attachmentNames(box: HTMLElement) {
  const tip = document.createElement('div');
  tip.className = 'attachment-tip';
  tip.setAttribute('translate', 'no');
  tip.hidden = true;
  box.parentElement!.append(tip);
  const show = (e: Event) => {
    const card = (e.target as Element).closest<HTMLElement>('.attachment-card');
    if (!card) return;
    const frame = box.parentElement!.getBoundingClientRect();
    tip.textContent = card.dataset.name || '';
    tip.hidden = false;
    const left = card.getBoundingClientRect().left - frame.left;
    tip.style.left = Math.max(0, Math.min(left, frame.width - tip.offsetWidth)) + 'px';
  };
  const hide = () => (tip.hidden = true);
  box.addEventListener('pointerover', show);
  box.addEventListener('focusin', show);
  box.addEventListener('pointerleave', hide);
  box.addEventListener('focusout', hide);
  return hide;
}

/** A sent file in the chat: icon, name and type. A sent picture is only the picture. */
export function sentFile(file: { name: string; kind?: string }) {
  const card = document.createElement('div');
  card.className = 'sent-file';
  card.setAttribute('aria-label', file.name);
  card.dataset.kind = file.kind || '';
  const glyph = document.createElement('span');
  glyph.className = 'sent-file-icon';
  glyph.innerHTML = FILE_ICON; // a constant, no part of the file's name
  const text = document.createElement('span');
  text.className = 'sent-file-text';
  const name = document.createElement('strong');
  name.textContent = file.name;
  name.setAttribute('translate', 'no');
  const type = document.createElement('small');
  quiet(type, fileBadge(file.name));
  text.append(name, type);
  card.append(glyph, text);
  return card;
}

export function attachmentCard(api: any, file: AttachmentFile, remove: () => void) {
  const card = document.createElement('div');
  card.className = 'attachment-card';
  card.dataset.name = file.name;
  let preview: HTMLElement;
  if (file.thumbnail) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'attachment-preview';
    open.setAttribute('aria-label', file.name + ' · büyüt');
    const img = document.createElement('img');
    img.src = file.thumbnail;
    img.alt = '';
    open.append(img);
    open.onclick = () => {
      const whole = !file.thumbnail!.startsWith('data:image/gif') && file.id;
      if (!whole) return lightbox(file.thumbnail!, file.name);
      void api
        .attachmentImage(file.id)
        .then((src: string) => lightbox(src, file.name))
        .catch(() => lightbox(file.thumbnail!, file.name));
    };
    preview = open;
  } else {
    preview = document.createElement('div');
    preview.className = 'attachment-preview attachment-file';
    preview.dataset.kind = file.kind || '';
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', file.name);
    preview.innerHTML = FILE_ICON; // a constant, no part of the file's name
    const badge = document.createElement('span');
    badge.className = 'attachment-badge';
    quiet(badge, fileBadge(file.name));
    preview.append(badge);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'attachment-remove';
  close.textContent = '×';
  close.title = 'Eki kaldır: ' + file.name;
  close.setAttribute('aria-label', close.title);
  close.onclick = remove;
  const name = document.createElement('span');
  name.className = 'attachment-name';
  name.textContent = shortName(file.name);
  name.setAttribute('translate', 'no');
  card.append(preview, close, name);
  return card;
}
