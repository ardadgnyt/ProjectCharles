// v0.9.6: the effort dropdown beside the model picker, working exactly like the model menu —
// one button showing the chosen level, and clicking it opens the levels above the composer.
// The rows are the model's own levels and nothing else: every provider keeps its spelling
// ("xLow" reads "xLow"), in every UI language. "Otomatik" is always the first row — it is the
// provider's own default and the model id returns to its default form. A model with no levels
// (the "Auto" rows, Cursor's Composer, Abacus AI) keeps "Otomatik" and the button is locked.
//
// The option itself carries the state: `option.dataset.effort` is the chosen level ('' or
// missing = Otomatik) and `option.value` is the model id of that level — for a provider that
// spells the level inside the id ("gemini-4-argon-high") picking a level picks that id; for a
// provider that keeps its id steady (GPT, Claude, EVREN) every row shares the one id and the
// level travels with the message instead.
import { clampMenu } from './model-picker';
export type Effort = { value: string; label: string; id: string };
export type EffortModel = { id: string; effort?: string | null; efforts?: Effort[]; base?: string };

const byOption = new WeakMap<HTMLOptionElement, EffortModel>();

// v0.9.6: a level picked for a model whose id never changes (GPT, Claude, EVREN) is kept per
// model in this window's storage, so a refreshed model list or the next start keeps it. A level
// spelled inside the id (Antigravity, Cursor) is already kept as the default model id.
const STORE = 'charles-effort:';
function savedLevel(base: string) {
  try {
    return localStorage.getItem(STORE + base) || '';
  } catch {
    return '';
  }
}
function saveLevel(base: string, value: string) {
  try {
    if (value) localStorage.setItem(STORE + base, value);
    else localStorage.removeItem(STORE + base);
  } catch {}
}
const levelInId = (model: EffortModel) => (model.efforts || []).some((e) => e.id !== (model.base || model.id));

/** Remembers what one listed model offers and the id it rests on. Called while the list is built. */
export function setModelEfforts(option: HTMLOptionElement, model: EffortModel | null | undefined) {
  if (!model?.efforts?.length) {
    byOption.delete(option);
    return;
  }
  const entry = { ...model, base: model.base || option.value };
  byOption.set(option, entry);
  if (!levelInId(entry)) {
    const level = savedLevel(entry.base);
    if (level && entry.efforts!.some((e) => e.value === level)) option.dataset.effort = level;
  }
}

export function modelEfforts(option: HTMLOptionElement | null | undefined): EffortModel | null {
  return (option && byOption.get(option)) || null;
}

/** The level the selected option stands for right now; null = Otomatik. */
function currentEffort(model: EffortModel, option: HTMLOptionElement | undefined): Effort | null {
  const value = option?.dataset.effort || '';
  return value ? (model.efforts || []).find((e) => e.value === value) || null : null;
}

export function effortPicker(select: HTMLSelectElement) {
  const panel = document.getElementById('effort-picker');
  const button = document.getElementById('effort-button') as HTMLButtonElement | null;
  const menu = document.getElementById('effort-menu');
  if (!panel || !button || !menu) return;
  const chosen = () => modelEfforts(select.selectedOptions[0] as HTMLOptionElement | undefined);

  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function pick(effort: Effort | null) {
    const option = select.selectedOptions[0] as HTMLOptionElement | undefined;
    const model = chosen();
    if (!option || !model) return;
    // "Otomatik" restores the model id the row rests on and clears the level.
    if (effort) {
      option.value = effort.id;
      option.dataset.effort = effort.value;
    } else {
      option.value = model.base || option.value;
      delete option.dataset.effort;
    }
    if (!levelInId(model)) saveLevel(model.base || option.value, effort?.value || '');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
    close();
    button.focus();
  }

  function row(label: string, on: boolean, effort: Effort | null) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(on));
    item.onclick = () => pick(effort);
    menu.append(item);
  }

  // Rebuilt on every open like the model menu: "Otomatik" first, then exactly the levels the
  // model offers, in the provider's own order and spelling.
  function open() {
    menu.replaceChildren();
    const model = chosen();
    const current = model ? currentEffort(model, select.selectedOptions[0]) : null;
    row('Otomatik', !current, null);
    for (const effort of model?.efforts || []) row(effort.label || effort.value, current?.value === effort.value, effort);
    menu.hidden = false;
    clampMenu(menu);
    button.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-selected=true]') as HTMLElement)?.focus();
  }

  function sync() {
    const model = chosen();
    const current = model ? currentEffort(model, select.selectedOptions[0]) : null;
    button.textContent = current?.label || 'Otomatik';
    // A model with no levels keeps "Otomatik" and the panel is locked on it.
    button.disabled = select.disabled || !model;
    if (button.disabled) close();
  }

  button.onclick = () => (menu.hidden ? open() : close());
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      button.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      items[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      ]?.focus();
    } else if (e.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.contains(e.target as Node)) close();
  });
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true });
  select.addEventListener('change', sync);
  // Programmatic selection changes do not fire DOM events (session restore, default load).
  window.setInterval(sync, 300);
  sync();
}