// v1.0.3: custom select dropdown for Settings controls (inspired by src/settings/default-model.ts).
// Keeps the native <select> in the DOM for full backwards-compatibility with existing listeners,
// programmatic .value updates, and i18n option translation, while rendering an accessible
// custom trigger and fixed-position popup that never clips inside scrolling settings pages.

import { t } from '../settings/i18n';

const CHEVRON =
  '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK =
  '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M2.6 7.3 5.7 10.3 11.4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export interface EnhanceSelectOptions {
  portal?: HTMLElement | null;
  descriptions?: Record<string, string>;
}

export interface EnhancedSelectHandle {
  sync: () => void;
  close: (restoreFocus?: boolean) => void;
  destroy: () => void;
  trigger: HTMLButtonElement;
  field: HTMLElement;
  popup: HTMLElement;
}

const enhanced = new WeakMap<HTMLSelectElement, EnhancedSelectHandle>();
let openHandles = new Set<EnhancedSelectHandle>();
let uidCounter = 0;

function readSelectLabel(select: HTMLSelectElement, field: HTMLElement): string {
  const direct = select.getAttribute('aria-label');
  if (direct && direct.trim()) return direct.trim();
  const label = select.closest('label');
  if (label) {
    const labelAria = label.getAttribute('aria-label');
    if (labelAria && labelAria.trim()) return labelAria.trim();
    for (const child of Array.from(label.children)) {
      if (child === select || child === field || child.classList.contains('language-icon')) continue;
      const txt = (child.textContent || '').trim();
      if (txt) return txt;
    }
  }
  const section = select.closest('.setting-section');
  const heading = section?.querySelector('h3');
  if (heading && (heading.textContent || '').trim()) {
    return (heading.textContent || '').trim();
  }
  return select.id || 'Seçim';
}

function patchValueProperty(select: HTMLSelectElement, onChange: () => void): () => void {
  const proto = HTMLSelectElement.prototype;
  const valueDesc = Object.getOwnPropertyDescriptor(proto, 'value');
  const indexDesc = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');
  let internal = false;

  if (valueDesc?.get && valueDesc?.set) {
    Object.defineProperty(select, 'value', {
      configurable: true,
      enumerable: true,
      get() {
        return valueDesc.get!.call(this);
      },
      set(v: string) {
        valueDesc.set!.call(this, v);
        if (!internal) {
          internal = true;
          try {
            onChange();
          } finally {
            internal = false;
          }
        }
      }
    });
  }

  if (indexDesc?.get && indexDesc?.set) {
    Object.defineProperty(select, 'selectedIndex', {
      configurable: true,
      enumerable: true,
      get() {
        return indexDesc.get!.call(this);
      },
      set(v: number) {
        indexDesc.set!.call(this, v);
        if (!internal) {
          internal = true;
          try {
            onChange();
          } finally {
            internal = false;
          }
        }
      }
    });
  }

  return () => {
    delete (select as any).value;
    delete (select as any).selectedIndex;
  };
}

export function enhanceSelect(
  select: HTMLSelectElement,
  opts?: EnhanceSelectOptions
): EnhancedSelectHandle {
  const existing = enhanced.get(select);
  if (existing) {
    existing.sync();
    return existing;
  }

  const uid = `cs-${select.id || ++uidCounter}`;
  const listId = `${uid}-list`;

  select.classList.add('cs-native-hidden');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const field = document.createElement('div');
  field.className = 'cs-field';
  if (select.id) field.dataset.for = select.id;
  field.setAttribute('translate', 'no');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cs-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', listId);

  const valueWrap = document.createElement('span');
  valueWrap.className = 'cs-value';
  const nameEl = document.createElement('span');
  nameEl.className = 'cs-name';
  valueWrap.append(nameEl);

  const chevEl = document.createElement('span');
  chevEl.className = 'cs-chevron';
  chevEl.innerHTML = CHEVRON;

  trigger.append(valueWrap, chevEl);
  field.append(trigger);
  select.before(field);

  const popup = document.createElement('div');
  popup.className = 'cs-popup';
  if (select.id) popup.dataset.for = select.id;
  popup.hidden = true;
  popup.setAttribute('translate', 'no');

  const list = document.createElement('div');
  list.className = 'cs-list';
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  popup.append(list);

  const resolvePortal = (): HTMLElement =>
    opts?.portal ||
    (select.closest('#settings-panel') as HTMLElement | null) ||
    document.body;

  resolvePortal().append(popup);

  let isOpen = false;
  let activeIndex = -1;
  let optionRows: HTMLElement[] = [];

  function ensurePlacementInDom() {
    if (select.parentElement && field.parentElement !== select.parentElement) {
      select.before(field);
    }
    const targetPortal = resolvePortal();
    if (popup.parentElement !== targetPortal) {
      targetPortal.append(popup);
    }
  }

  function enabledIndices(): number[] {
    const out: number[] = [];
    Array.from(select.options).forEach((opt, idx) => {
      if (!opt.disabled) out.push(idx);
    });
    return out;
  }

  function setActive(index: number, scroll = true) {
    activeIndex = index;
    optionRows.forEach((row, idx) => {
      const on = idx === activeIndex;
      row.classList.toggle('cs-active', on);
      if (on) {
        trigger.setAttribute('aria-activedescendant', row.id);
        if (scroll) {
          const top = row.offsetTop;
          const bottom = top + row.offsetHeight;
          if (top < list.scrollTop) list.scrollTop = top;
          else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
        }
      }
    });
    if (activeIndex < 0) {
      trigger.removeAttribute('aria-activedescendant');
    }
  }

  function place() {
    if (!isOpen) return;
    const r = trigger.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      close(false);
      return;
    }
    const page = trigger.closest('.settings-body')?.getBoundingClientRect();
    if (page && (r.bottom < page.top + 4 || r.top > page.bottom - 4)) {
      close(false);
      return;
    }
    const panel = select.closest('#settings-panel') as HTMLDialogElement | null;
    const frame =
      panel && panel.open
        ? panel.getBoundingClientRect()
        : {
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: window.innerHeight
          };
    const zoom = (popup as any).currentCSSZoom || 1;
    const pad = 8 * zoom;
    const gap = 5 * zoom;
    const bounds = {
      left: Math.max(0, frame.left) + pad,
      top: Math.max(0, frame.top) + pad,
      right: Math.min(window.innerWidth, frame.right) - pad,
      bottom: Math.min(window.innerHeight, frame.bottom) - pad
    };

    const s = popup.style;
    s.left = '0px';
    s.top = '0px';
    s.maxHeight = 'none';

    const minW = Math.max(r.width, 168 * zoom);
    const maxW = Math.max(160 * zoom, bounds.right - bounds.left);
    const width = Math.min(minW, maxW);
    s.width = `${width / zoom}px`;

    // Measure popup's (0, 0) origin in viewport space to compensate for any containing block
    // created by transform or backdrop-filter on #settings-panel (mirrors default-model.ts).
    const origin = popup.getBoundingClientRect();
    const naturalHeight = origin.height || Math.min(260 * zoom, (list.scrollHeight + 12) * zoom);
    const spaceBelow = bounds.bottom - (r.bottom + gap);
    const spaceAbove = r.top - gap - bounds.top;
    const want = Math.min(naturalHeight, 260 * zoom);
    const flipUp = spaceBelow < Math.min(want, 150 * zoom) && spaceAbove > spaceBelow;
    const avail = Math.max(96 * zoom, Math.min(260 * zoom, flipUp ? spaceAbove : spaceBelow));
    const h = Math.min(avail, want);

    const left = Math.max(bounds.left, Math.min(r.left, bounds.right - width));
    const top = flipUp
      ? Math.max(bounds.top, r.top - gap - h)
      : Math.min(bounds.bottom - h, r.bottom + gap);

    s.left = `${(left - origin.left) / zoom}px`;
    s.top = `${(top - origin.top) / zoom}px`;
    s.maxHeight = `${avail / zoom}px`;
    popup.classList.toggle('cs-flip-up', flipUp);
  }

  function buildOptions() {
    list.replaceChildren();
    optionRows = [];
    const options = Array.from(select.options);
    const selectedIdx = select.selectedIndex;

    options.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'cs-option';
      row.id = `${listId}-opt-${idx}`;
      row.setAttribute('role', 'option');
      row.dataset.index = String(idx);
      row.dataset.value = opt.value;
      const isSelected = idx === selectedIdx;
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (opt.disabled) {
        row.setAttribute('aria-disabled', 'true');
      }

      const textWrap = document.createElement('span');
      textWrap.className = 'cs-option-text';

      const optName = document.createElement('span');
      optName.className = 'cs-option-name';
      optName.textContent = (opt.textContent || opt.label || opt.value).trim();
      textWrap.append(optName);

      const rawDesc =
        opts?.descriptions?.[opt.value] || opt.dataset.description || '';
      if (rawDesc) {
        const meta = document.createElement('span');
        meta.className = 'cs-option-meta';
        meta.textContent = t(rawDesc);
        textWrap.append(meta);
      }

      const check = document.createElement('span');
      check.className = 'cs-check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = CHECK;

      row.append(textWrap, check);

      row.addEventListener('pointerenter', () => {
        if (!opt.disabled) setActive(idx, false);
      });
      row.addEventListener('pointerdown', (e) => {
        // Keep focus on trigger while clicking an option
        e.preventDefault();
      });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.disabled) return;
        commitIndex(idx);
      });

      list.append(row);
      optionRows.push(row);
    });
  }

  function sync() {
    ensurePlacementInDom();
    const disabled = select.disabled;
    trigger.disabled = disabled;
    if (disabled) {
      trigger.setAttribute('aria-disabled', 'true');
    } else {
      trigger.removeAttribute('aria-disabled');
    }

    const selectedOpt =
      select.selectedOptions?.[0] ||
      select.options[select.selectedIndex] ||
      select.options[0];
    const currentText = selectedOpt
      ? (selectedOpt.textContent || selectedOpt.label || selectedOpt.value).trim()
      : '';
    nameEl.textContent = currentText;

    const labelText = readSelectLabel(select, field);
    trigger.setAttribute(
      'aria-label',
      currentText ? `${labelText}: ${currentText}` : labelText
    );
    list.setAttribute('aria-label', labelText);

    buildOptions();
    if (isOpen) {
      const idx = select.selectedIndex >= 0 ? select.selectedIndex : 0;
      setActive(idx, false);
      place();
    }
  }

  function commitIndex(idx: number) {
    const opt = select.options[idx];
    if (!opt || opt.disabled) return;
    const changed = select.selectedIndex !== idx || select.value !== opt.value;
    select.selectedIndex = idx;
    select.value = opt.value;
    sync();
    close(true);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function openPopup() {
    if (isOpen || select.disabled || select.options.length === 0) return;
    for (const other of Array.from(openHandles)) {
      if (other !== handle) other.close(false);
    }
    sync();
    isOpen = true;
    openHandles.add(handle);
    popup.hidden = false;
    trigger.classList.add('cs-open');
    trigger.setAttribute('aria-expanded', 'true');

    const enabled = enabledIndices();
    const startIdx =
      select.selectedIndex >= 0 && !select.options[select.selectedIndex]?.disabled
        ? select.selectedIndex
        : enabled[0] ?? -1;
    place();
    setActive(startIdx, true);
  }

  function close(restoreFocus = false) {
    if (!isOpen) return;
    isOpen = false;
    openHandles.delete(handle);
    popup.hidden = true;
    popup.classList.remove('cs-flip-up');
    trigger.classList.remove('cs-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    activeIndex = -1;
    if (restoreFocus) {
      trigger.focus();
    }
  }

  function moveActive(delta: number) {
    const enabled = enabledIndices();
    if (!enabled.length) return;
    const pos = enabled.indexOf(activeIndex);
    const nextPos =
      pos === -1
        ? delta > 0
          ? 0
          : enabled.length - 1
        : Math.max(0, Math.min(enabled.length - 1, pos + delta));
    setActive(enabled[nextPos]);
  }

  function onTriggerClick(e: MouseEvent) {
    e.stopPropagation();
    if (select.disabled) return;
    if (isOpen) close(true);
    else openPopup();
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (select.disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) openPopup();
      else moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) openPopup();
      else moveActive(-1);
    } else if (e.key === 'Home') {
      if (!isOpen) openPopup();
      const enabled = enabledIndices();
      if (enabled.length) {
        e.preventDefault();
        setActive(enabled[0]);
      }
    } else if (e.key === 'End') {
      if (!isOpen) openPopup();
      const enabled = enabledIndices();
      if (enabled.length) {
        e.preventDefault();
        setActive(enabled[enabled.length - 1]);
      }
    } else if (e.key === 'PageDown' && isOpen) {
      e.preventDefault();
      moveActive(5);
    } else if (e.key === 'PageUp' && isOpen) {
      e.preventDefault();
      moveActive(-5);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        openPopup();
      } else if (activeIndex >= 0) {
        commitIndex(activeIndex);
      } else {
        close(true);
      }
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const q = e.key.toLocaleLowerCase();
      const enabled = enabledIndices();
      if (!enabled.length) return;
      const startPos = enabled.indexOf(activeIndex >= 0 ? activeIndex : select.selectedIndex);
      const ordered = [
        ...enabled.slice(startPos + 1),
        ...enabled.slice(0, startPos + 1)
      ];
      const match = ordered.find((idx) => {
        const txt = (select.options[idx]?.textContent || '').trim().toLocaleLowerCase();
        return txt.startsWith(q);
      });
      if (match !== undefined) {
        e.preventDefault();
        if (isOpen) setActive(match);
        else commitIndex(match);
      }
    }
  }

  function onDocumentPointerDown(e: PointerEvent) {
    if (!isOpen) return;
    const tNode = e.target as Node | null;
    if (tNode && (field.contains(tNode) || popup.contains(tNode))) return;
    const wrappingLabel = select.closest('label');
    if (wrappingLabel && tNode && wrappingLabel.contains(tNode)) return;
    close(false);
  }

  function onDocumentKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  function onScrollOrResize(e: Event) {
    if (!isOpen) return;
    if (e.type === 'scroll' && e.target instanceof Node && popup.contains(e.target)) {
      return;
    }
    place();
  }

  function onSelectFocus() {
    if (!select.disabled) trigger.focus();
  }

  function onPanelClose() {
    close(false);
  }
  const settingsPanel = select.closest('#settings-panel') as HTMLDialogElement | null;

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeyDown);
  select.addEventListener('change', sync);
  select.addEventListener('input', sync);
  select.addEventListener('focus', onSelectFocus);
  settingsPanel?.addEventListener('close', onPanelClose);
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown, true);
  document.addEventListener('charles-language', sync);
  window.addEventListener('resize', onScrollOrResize);
  document.addEventListener('scroll', onScrollOrResize, true);

  const unpatch = patchValueProperty(select, sync);

  let syncingObserver = false;
  const observer = new MutationObserver(() => {
    if (syncingObserver) return;
    syncingObserver = true;
    try {
      sync();
    } finally {
      syncingObserver = false;
    }
  });
  observer.observe(select, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-label', 'class']
  });

  const handle: EnhancedSelectHandle = {
    sync,
    close,
    trigger,
    field,
    popup,
    destroy() {
      close(false);
      observer.disconnect();
      unpatch();
      trigger.removeEventListener('click', onTriggerClick);
      trigger.removeEventListener('keydown', onTriggerKeyDown);
      select.removeEventListener('change', sync);
      settingsPanel?.removeEventListener('close', onPanelClose);
      select.removeEventListener('input', sync);
      select.removeEventListener('focus', onSelectFocus);
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('keydown', onDocumentKeyDown, true);
      document.removeEventListener('charles-language', sync);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('scroll', onScrollOrResize, true);
      field.remove();
      popup.remove();
      select.classList.remove('cs-native-hidden');
      select.removeAttribute('aria-hidden');
      select.tabIndex = 0;
      enhanced.delete(select);
    }
  };

  enhanced.set(select, handle);
  sync();
  return handle;
}

const TARGET_SETTINGS_SELECT_IDS = [
  'language',
  'access-mode',
  'look-island',
  'look-palette'
] as const;

export function enhanceSettingsSelects(): void {
  for (const id of TARGET_SETTINGS_SELECT_IDS) {
    const el = document.getElementById(id);
    if (el instanceof HTMLSelectElement) {
      enhanceSelect(el);
    }
  }
}
