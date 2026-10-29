/** v0.9.6: an upward popup may reach past the top or a side edge of the window (long model
 *  lists on a short panel); nudge it back inside before it is shown. */
export function clampMenu(menu: HTMLElement) {
  menu.style.position = '';
  menu.style.left = '';
  menu.style.top = '';
  menu.style.right = '';
  menu.style.bottom = '';
  const box = menu.getBoundingClientRect();
  const pad = 8;
  const dx =
    box.left < pad ? pad - box.left : box.right > window.innerWidth - pad ? window.innerWidth - pad - box.right : 0;
  const dy = box.top < pad ? pad - box.top : 0;
  if (!dx && !dy) return;
  menu.style.position = 'fixed';
  menu.style.left = box.left + dx + 'px';
  menu.style.top = box.top + dy + 'px';
  menu.style.right = 'auto';
  menu.style.bottom = 'auto';
}

// v0.9.6: the model menu opens on the providers; resting on one (or clicking it) opens a second
// panel beside it with that provider's models. The rows no longer repeat the provider's name.
export const PROVIDERS: [string, string][] = [
  ['gpt', 'OpenAI'],
  ['gemini', 'AntiGravity'],
  ['claude', 'Claude'],
  ['cursor', 'Cursor'],
  ['abacus', 'Abacus AI'],
  ['evren', 'Evren'],
];
const PREFIX = /^(?:Cursor|Antigravity|AntiGravity|Gemini|Claude|Abacus AI|EVREN|Evren|OpenAI)\s*·\s*/;

/** The provider an option belongs to ('' = no provider, e.g. "Önce hesap bağla"). */
export function optionProvider(option: HTMLOptionElement) {
  const m = /^(gemini|claude|cursor|abacus|evren):/.exec(option.value);
  if (m) return m[1];
  return option.value || /^Otomatik · /.test(option.text) ? 'gpt' : '';
}
/** The model's own name without its provider ("Claude · Opus" → "Opus"). */
export function shortModelName(option: HTMLOptionElement) {
  const text = option.text.trim();
  if (!option.value && /^Otomatik · /.test(text)) return 'Otomatik';
  return text.replace(PREFIX, '') || text;
}
const providerName = (id: string) => PROVIDERS.find(([key]) => key === id)?.[1] || '';

export function modelPicker(select: HTMLSelectElement) {
  const button = document.getElementById('model-button') as HTMLButtonElement;
  const menu = document.getElementById('model-menu')!;
  const sub = document.createElement('div');
  sub.id = 'model-submenu';
  sub.setAttribute('role', 'listbox');
  sub.hidden = true;
  menu.after(sub);
  let openProvider = '';

  function close() {
    menu.hidden = true;
    sub.hidden = true;
    openProvider = '';
    button.setAttribute('aria-expanded', 'false');
  }
  function sync() {
    const option = select.selectedOptions[0];
    if (!option) button.textContent = 'Model';
    else {
      const short = shortModelName(option);
      // "Otomatik" alone would not say whose default it is
      button.textContent = short === 'Otomatik' || short === 'Auto' ? `${short} · ${providerName(optionProvider(option))}` : short;
    }
    button.disabled = select.disabled;
    if (select.disabled) close();
  }
  function choose(option: HTMLOptionElement) {
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
    close();
    button.focus();
  }
  function groups() {
    const out = new Map<string, HTMLOptionElement[]>();
    for (const option of select.options) {
      const provider = optionProvider(option);
      out.set(provider, [...(out.get(provider) || []), option]);
    }
    return out;
  }
  function placeSub(row: HTMLElement) {
    // Absolute inside .model-picker (a transformed body would shift a fixed panel). It goes
    // beside the provider panel on the side with more room inside the visible panel (the island
    // is narrower than its window), narrowing to fit; with no room at all it covers the list.
    // v0.9.6: its height is limited to the panel too (it scrolls inside instead of spilling out).
    const parent = (sub.offsetParent as HTMLElement | null) || button.parentElement!;
    const base = parent.getBoundingClientRect();
    const area = (
      document.body.classList.contains('workspace')
        ? document.documentElement
        : document.querySelector('main.island') || document.documentElement
    ).getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    // the panel's own header (Charles, the bar buttons) is drawn above the chat: stay below it
    const feed = document.getElementById('feed')?.getBoundingClientRect();
    const ceiling = feed && feed.height > 0 ? Math.max(area.top, feed.top) : area.top;
    const gap = 4;
    // keep clear of the island's rounded corners and its edge
    const margin = 16;
    const leftRoom = box.left - area.left - margin - gap;
    const rightRoom = area.right - box.right - margin - gap;
    const room = Math.max(leftRoom, rightRoom);
    let width = Math.min(200, room);
    let left: number;
    if (width >= 140) left = leftRoom >= rightRoom ? box.left - gap - width : box.right + gap;
    else {
      width = Math.max(140, box.width);
      left = box.left;
    }
    sub.style.width = width + 'px';
    // never taller than the space between the panel's top and the message box
    const bottom = Math.min(area.bottom - margin, box.bottom);
    const maxHeight = Math.max(120, bottom - (ceiling + 8));
    sub.style.maxHeight = maxHeight + 'px';
    const height = Math.min(sub.scrollHeight, maxHeight);
    const top = Math.max(ceiling + 8, Math.min(r.top - 4, bottom - height));
    sub.style.left = left - base.left + 'px';
    sub.style.top = top - base.top + 'px';
  }
  function showModels(provider: string, row: HTMLElement, focus = false) {
    openProvider = provider;
    for (const b of menu.querySelectorAll<HTMLElement>('[data-provider]'))
      b.classList.toggle('open', b.dataset.provider === provider);
    sub.replaceChildren();
    for (const option of groups().get(provider) || []) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = shortModelName(option);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.onclick = () => choose(option);
      sub.append(item);
    }
    sub.hidden = false;
    placeSub(row);
    if (focus) ((sub.querySelector('[aria-selected=true]') || sub.querySelector('button')) as HTMLElement)?.focus();
  }
  function open() {
    if (select.disabled) return;
    menu.replaceChildren();
    sub.hidden = true;
    const all = groups();
    const current = select.selectedOptions[0];
    const currentProvider = current ? optionProvider(current) : '';
    for (const [id, name] of PROVIDERS) {
      if (!all.get(id)?.length) continue;
      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.provider = id;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-haspopup', 'listbox');
      row.setAttribute('aria-selected', String(id === currentProvider));
      row.append(Object.assign(document.createElement('span'), { textContent: name }));
      row.append(Object.assign(document.createElement('i'), { textContent: '›', ariaHidden: 'true' }));
      row.addEventListener('pointerenter', () => showModels(id, row));
      row.onclick = () => showModels(id, row, true);
      menu.append(row);
    }
    // options that belong to no provider ("Önce hesap bağla")
    for (const option of all.get('') || []) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = option.text;
      item.setAttribute('role', 'option');
      item.onclick = () => choose(option);
      menu.append(item);
    }
    menu.hidden = false;
    clampMenu(menu);
    button.setAttribute('aria-expanded', 'true');
    const start = (menu.querySelector('[aria-selected=true]') || menu.querySelector('button')) as HTMLElement | null;
    start?.focus();
    if (start?.dataset.provider) showModels(start.dataset.provider, start);
  }
  button.onclick = () => (menu.hidden ? open() : close());
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  const move = (list: HTMLElement, e: KeyboardEvent) => {
    const items = [...list.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    const next =
      items[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      ];
    next?.focus();
    return next;
  };
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      button.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const row = move(menu, e);
      if (row?.dataset.provider) showModels(row.dataset.provider, row);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const row = document.activeElement as HTMLElement;
      if (row?.dataset.provider) {
        e.preventDefault();
        showModels(row.dataset.provider, row, true);
      }
    } else if (e.key === 'Tab') close();
  });
  sub.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      (menu.querySelector(`[data-provider="${openProvider}"]`) as HTMLElement)?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) move(sub, e);
    else if (e.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!button.parentElement?.contains(e.target as Node)) close();
  });
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true });
  select.addEventListener('change', sync);
  // Programmatic selection changes do not fire DOM events (session restore, default load).
  window.setInterval(sync, 300);
  sync();
}
