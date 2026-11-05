// v0.9.18: the right-click menu for text: Kopyala, Yapıştır, Charles'a sor.
// The menu is a popover, so it also sits above an open <dialog>, and its buttons never take the
// focus: the selection stays as it was, also while an answer is being written next to it.
import { t } from '../settings/i18n';

type Deps = { api: any; notice: (s: string) => void; ask: (text: string, code: boolean) => void };
type Item = { label: string; run?: () => void; off?: boolean };

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'tel', 'number', '']);
const QUOTE_LIMIT = 6000;

/** A box the user can type in: an <input>, a <textarea> or an editable element. */
function editableOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const box = node.closest<HTMLElement>('input, textarea, [contenteditable="true"], [contenteditable=""]');
  if (!box) return null;
  if (box instanceof HTMLInputElement && !TEXT_INPUTS.has(box.type) && box.type !== 'password') return null;
  if ((box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) && (box.disabled || box.readOnly)) return null;
  return box;
}

function selectedIn(box: HTMLElement | null) {
  if (box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) {
    try {
      return box.value.slice(box.selectionStart ?? 0, box.selectionEnd ?? 0);
    } catch {
      return ''; // number and email boxes have no selection range
    }
  }
  return String(window.getSelection() || '');
}

/** The text of a quote for the message box: "> " lines, or a code block for code. */
export function quoteFor(text: string, code = false) {
  const body = text.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  const short = body.length > QUOTE_LIMIT ? body.slice(0, QUOTE_LIMIT) + '\n…' : body;
  if (code) return '```\n' + short + '\n```\n\n';
  return short.split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
}

export function contextMenu({ api, notice, ask }: Deps) {
  const menu = document.createElement('div');
  menu.id = 'text-menu';
  menu.setAttribute('role', 'menu');
  menu.popover = 'manual';
  document.body.append(menu);
  let open = false;
  function close() {
    if (!open) return;
    open = false;
    try {
      menu.hidePopover();
    } catch {}
  }
  // the buttons keep the selection and the focus where they are
  menu.addEventListener('pointerdown', (e) => e.preventDefault());
  menu.addEventListener('mousedown', (e) => e.preventDefault());
  function fill(items: Item[]) {
    menu.replaceChildren(
      ...items.map((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.textContent = t(item.label);
        b.disabled = !!item.off;
        b.onclick = () => {
          close();
          item.run?.();
        };
        return b;
      }),
    );
  }
  function place(x: number, y: number) {
    menu.showPopover();
    open = true;
    // inside what is really on screen: the island's window is larger than the island
    const frame = document.querySelector('main.island')?.getBoundingClientRect();
    const box = document.body.classList.contains('workspace') || !frame ? new DOMRect(0, 0, innerWidth, innerHeight) : frame;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = Math.max(box.left + 6, Math.min(x, box.right - width - 6)) + 'px';
    menu.style.top = Math.max(box.top + 6, Math.min(y, box.bottom - height - 6)) + 'px';
  }
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#text-menu')) return e.preventDefault();
    const box = editableOf(target);
    const secret = box instanceof HTMLInputElement && box.type === 'password';
    const text = selectedIn(box);
    close();
    if (!box && !text.trim()) return; // nothing to act on: no menu, as before
    e.preventDefault();
    const code = !box && !!target.closest('pre, code');
    const items: Item[] = [];
    if (!secret)
      items.push({
        label: 'Kopyala',
        off: !text,
        run: () => {
          // the page's own copy keeps formulas (the chat's copy handler); text is the fallback
          if (document.execCommand('copy')) return;
          void api.copy(text).catch((err: Error) => notice(err.message));
        },
      });
    if (box)
      items.push({
        label: 'Yapıştır',
        run: () => {
          box.focus();
          void api.editPaste().catch((err: Error) => notice(err.message));
        },
      });
    if (text.trim() && !secret && box?.id !== 'prompt') items.push({ label: 'Charles’a sor', run: () => ask(text, code) });
    fill(items);
    place(e.clientX, e.clientY);
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (open && !(e.target as HTMLElement).closest?.('#text-menu')) close();
    },
    true,
  );
  // captured first: Esc closes the menu, not the island behind it
  document.addEventListener(
    'keydown',
    (e) => {
      if (!open || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    },
    true,
  );
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', close, true);
  api.onView?.(close);
}
