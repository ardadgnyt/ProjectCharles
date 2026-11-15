// v1.0.0: Ayarlar → AI Modelleri → Varsayılan model as a list of the app's own: grouped by provider,
// searchable when long, placed so it is never cut off by the settings window, fully keyboard driven.
import { PROVIDERS } from '../chat/model-picker';
import { t } from './i18n';
import {
  LAST,
  SEARCH_THRESHOLD,
  buildGroups,
  countChoices,
  filterGroups,
  resolveSaved,
  type Choice,
  type Group,
  type ModelRow,
  type Resolved,
} from './default-model-data';

const CHEVRON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const REASONS = {
  provider: 'Hesap bağlı değil. Hesabı bağla ya da başka bir model seç.',
  model: 'Bu model artık listede yok. Başka bir model seç.',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
/** A model or provider name: shown as it is, never translated. */
const name = (cls: string, text: string) => {
  const e = el('span', cls, text);
  e.setAttribute('translate', 'no');
  return e;
};

/** Builds the section; the caller puts it on the page. */
export function defaultModelUI(api: any, notice: (s: string) => void) {
  const providers = (): [string, string][] => PROVIDERS;
  const section = el('section', 'setting-section dm-section');
  const heading = el('h3', '', 'Varsayılan model');
  heading.id = 'dm-label';
  const about = el(
    'p',
    'hint',
    'Charles açıldığında ve yeni sohbetlerde bu model seçili gelir. Sohbet sırasında mesaj kutusundan başka model seçebilirsin; bu ayar değişmez.',
  );
  about.id = 'dm-hint';
  const field = el('div', 'dm-field');
  const trigger = el('div', 'dm-trigger');
  trigger.id = 'dm-trigger';
  trigger.tabIndex = 0;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'dm-list');
  trigger.setAttribute('aria-labelledby', 'dm-label');
  trigger.setAttribute('aria-describedby', 'dm-hint dm-note');
  const value = el('span', 'dm-value');
  const chevron = el('span', 'dm-chevron');
  chevron.innerHTML = CHEVRON;
  trigger.append(value, chevron);
  const note = el('p', 'dm-note');
  note.id = 'dm-note';
  note.hidden = true;
  field.append(trigger, note);
  section.append(heading, about, field);

  const popup = el('div', 'dm-popup');
  popup.id = 'dm-popup';
  popup.hidden = true;
  const searchRow = el('div', 'dm-search');
  const search = el('input');
  search.type = 'text';
  search.id = 'dm-search';
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.placeholder = 'Modellerde ara';
  search.setAttribute('aria-label', 'Modellerde ara');
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-expanded', 'true');
  search.setAttribute('aria-controls', 'dm-list');
  searchRow.append(search);
  const list = el('div', 'dm-list');
  list.id = 'dm-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-labelledby', 'dm-label');
  const empty = el('p', 'dm-empty');
  empty.setAttribute('role', 'status');
  popup.append(searchRow, list, empty);
  const dialog = document.getElementById('settings-panel');
  // In the dialog itself, not in the scrolling page: the page clips, the dialog is the top layer.
  (dialog || document.body).append(popup);

  let models: ModelRow[] | null = null; // null: not read yet
  let groups: Group[] = [];
  let saved: string | null | undefined; // undefined: not read yet
  let resolved: Resolved = { kind: 'last' };
  let saving = false;
  let generation = 0;
  let query = '';
  let active: HTMLElement | null = null;
  let options: HTMLElement[] = [];
  let typed = '',
    typedAt = 0;

  const isOpen = () => !popup.hidden;
  const searchable = () => countChoices(groups) >= SEARCH_THRESHOLD;
  const currentValue = () =>
    resolved.kind === 'last' ? LAST : resolved.kind === 'ok' ? resolved.choice.value : resolved.value;

  // the name of the last default that was listed, so a model that left the plan keeps its own name
  // ("Sonnet 5.5", not "claude-sonnet-5-5"); a per-window convenience, nothing depends on it
  const NAME_KEY = 'charles.defaultModel.shown';
  function resolveNow(): Resolved {
    const r = resolveSaved(saved, groups, models || [], providers());
    try {
      if (r.kind === 'ok')
        localStorage.setItem(NAME_KEY, JSON.stringify({ value: r.choice.value, name: r.choice.name }));
      else if (r.kind === 'missing') {
        const known = JSON.parse(localStorage.getItem(NAME_KEY) || 'null');
        if (known && known.value === r.value && typeof known.name === 'string') return { ...r, name: known.name };
      }
    } catch {}
    return r;
  }
  function renderTrigger() {
    value.replaceChildren();
    const loading = models === null || saved === undefined;
    trigger.classList.toggle('dm-loading', loading);
    trigger.classList.toggle('dm-missing', !loading && resolved.kind === 'missing');
    trigger.setAttribute('aria-busy', String(loading || saving));
    if (loading) {
      trigger.setAttribute('aria-disabled', 'true');
      value.append(el('span', 'dm-name', 'Modeller yükleniyor…'), el('span', 'dm-spinner'));
      note.hidden = true;
      return;
    }
    trigger.removeAttribute('aria-disabled');
    const line = el('span', 'dm-sub');
    if (resolved.kind === 'last') {
      value.append(el('span', 'dm-name', 'Son kullandığım model'));
      line.append(el('span', '', 'Sabit bir model yok'));
    } else if (resolved.kind === 'ok') {
      const c = resolved.choice;
      value.append(c.auto ? el('span', 'dm-name', 'Otomatik') : name('dm-name', c.name));
      line.append(name('dm-provider', c.providerLabel));
      if (c.meta) line.append(el('span', 'dm-dot', '·'), name('', c.meta));
    } else {
      value.append(
        resolved.name === 'Otomatik' ? el('span', 'dm-name', 'Otomatik') : name('dm-name', resolved.name),
      );
      line.append(name('dm-provider', resolved.providerLabel), el('span', 'dm-badge', 'Kullanılamıyor'));
    }
    value.append(line);
    note.hidden = resolved.kind !== 'missing';
    note.textContent = resolved.kind === 'missing' ? REASONS[resolved.reason] : '';
  }

  function optionRow(c: Choice | null, missing = false) {
    const row = el('div', 'dm-option');
    row.setAttribute('role', 'option');
    const v = c ? c.value : LAST;
    row.dataset.value = v;
    const selected = v === currentValue();
    row.setAttribute('aria-selected', String(selected));
    if (missing) {
      row.setAttribute('aria-disabled', 'true');
      row.classList.add('dm-option-missing');
    }
    const text = el('span', 'dm-option-text');
    if (!c) {
      text.append(el('span', 'dm-option-name', 'Son kullandığım model'), el('span', 'dm-option-meta', 'Sabit bir model yok'));
    } else {
      text.append(c.auto || c.name === 'Otomatik' ? el('span', 'dm-option-name', 'Otomatik') : name('dm-option-name', c.name));
      if (missing) text.append(el('span', 'dm-option-meta', 'Kullanılamıyor'));
      else if (c.meta) text.append(name('dm-option-meta', c.meta));
    }
    const check = el('span', 'dm-check');
    check.innerHTML = CHECK;
    row.append(text, check);
    return row;
  }

  function renderList(keep?: string) {
    list.replaceChildren();
    options = [];
    let n = 0;
    const add = (row: HTMLElement, parent: HTMLElement) => {
      row.id = 'dm-opt-' + n++;
      parent.append(row);
      if (row.getAttribute('aria-disabled') !== 'true') options.push(row);
    };
    const shown = filterGroups(groups, query);
    const searching = !!query.trim();
    const missing = resolved.kind === 'missing' && !searching ? resolved : null;
    const groupBox = (label: string, gi: number) => {
      const box = el('div', 'dm-group');
      box.setAttribute('role', 'group');
      const head = name('dm-group-label', label);
      head.id = 'dm-group-' + gi;
      head.setAttribute('role', 'presentation');
      box.setAttribute('aria-labelledby', head.id);
      box.append(head);
      list.append(box);
      return box;
    };
    // the saved model that is not offered any more stays visible at the top, under its provider
    if (missing) {
      const c = { value: missing.value, provider: missing.provider, providerLabel: missing.providerLabel, name: missing.name, meta: '', auto: false };
      const box = groupBox(missing.providerLabel, 99);
      box.classList.add('dm-group-missing');
      add(optionRow(c, true), box);
    }
    if (!searching) add(optionRow(null), list);
    shown.forEach((g, gi) => {
      const box = groupBox(g.label, gi);
      for (const c of g.choices) add(optionRow(c), box);
    });
    const loading = models === null;
    empty.hidden = !(loading || !options.length || (!groups.length && !query.trim()));
    empty.textContent = loading
      ? 'Modeller yükleniyor…'
      : query.trim() && !countChoices(shown)
        ? 'Eşleşen model yok'
        : !groups.length
          ? 'Bağlı yapay zekâ yok. Aşağıdan bir hesap bağla.'
          : '';
    if (!empty.textContent) empty.hidden = true;
    list.hidden = !list.children.length;
    const want =
      (keep && options.find((o) => o.dataset.value === keep)) ||
      (query.trim() ? options[0] : options.find((o) => o.getAttribute('aria-selected') === 'true')) ||
      options[0] ||
      null;
    setActive(want);
  }

  function setActive(row: HTMLElement | null) {
    active?.classList.remove('dm-active');
    active = row;
    if (row) {
      row.classList.add('dm-active');
      trigger.setAttribute('aria-activedescendant', row.id);
      search.setAttribute('aria-activedescendant', row.id);
      // by hand: scrollIntoView would also scroll the settings page behind
      const top = row.offsetTop - list.offsetTop;
      const label = row.parentElement?.querySelector('.dm-group-label') as HTMLElement | null;
      const sticky = label && row.parentElement !== list ? label.offsetHeight : 0;
      if (top - sticky < list.scrollTop) list.scrollTop = Math.max(0, top - sticky);
      else if (top + row.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = top + row.offsetHeight - list.clientHeight;
    } else {
      trigger.removeAttribute('aria-activedescendant');
      search.removeAttribute('aria-activedescendant');
    }
  }

  /** Below the field when there is room, above it otherwise; never past the settings window. */
  function place() {
    if (!isOpen()) return;
    const frame = (dialog && dialog.getBoundingClientRect()) || {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    const pad = 10;
    const area = {
      left: Math.max(0, frame.left) + pad,
      top: Math.max(0, frame.top) + pad,
      right: Math.min(window.innerWidth, frame.right) - pad,
      bottom: Math.min(window.innerHeight, frame.bottom) - pad,
    };
    const t = trigger.getBoundingClientRect();
    // the field scrolled out of the page's visible part: nothing to hang the list on
    const page = trigger.closest('.settings-body')?.getBoundingClientRect();
    if (!t.width || (page && (t.bottom < page.top + 4 || t.top > page.bottom - 4))) {
      close(false);
      return;
    }
    const zoom = (popup as any).currentCSSZoom || 1;
    const s = popup.style;
    s.left = '0px';
    s.top = '0px';
    s.maxHeight = 'none';
    const width = Math.min(area.right - area.left, Math.max(t.width, 300 * zoom));
    s.width = width / zoom + 'px';
    const origin = popup.getBoundingClientRect();
    const natural = origin.height;
    const gap = 6 * zoom;
    const below = area.bottom - t.bottom - gap;
    const above = t.top - area.top - gap;
    const want = Math.min(natural, 420 * zoom);
    const down = below >= want || below >= above;
    const height = Math.max(0, Math.min(want, down ? below : above));
    const left = Math.min(Math.max(t.left, area.left), area.right - width);
    const top = down ? t.bottom + gap : t.top - gap - height;
    s.left = (left - origin.left) / zoom + 'px';
    s.top = (top - origin.top) / zoom + 'px';
    s.maxHeight = height / zoom + 'px';
    popup.classList.toggle('dm-up', !down);
    if (active) setActive(active);
  }

  const onScroll = (e: Event) => {
    if (e.target instanceof Node && popup.contains(e.target)) return;
    place();
  };
  const onResize = () => close(false);
  const onPointer = (e: Event) => {
    const target = e.target as Node;
    if (!field.contains(target) && !popup.contains(target)) close(false);
  };

  function open(start?: string) {
    if (isOpen() || models === null || saved === undefined) return;
    query = '';
    search.value = '';
    searchRow.hidden = !searchable();
    popup.hidden = false;
    popup.classList.toggle('dm-has-search', searchable());
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('dm-open');
    renderList();
    place();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerdown', onPointer, true);
    if (!searchRow.hidden) {
      search.focus();
      if (start) {
        search.value = start;
        filter();
      }
    } else if (start) typeahead(start);
  }
  function close(focus = true) {
    if (!isOpen()) return;
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('dm-open');
    setActive(null);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('pointerdown', onPointer, true);
    if (focus) trigger.focus();
  }
  function filter() {
    query = search.value;
    renderList();
    place();
  }
  /** Without a search field: typed letters jump to the first model that starts with them. */
  function typeahead(ch: string) {
    const now = Date.now();
    typed = now - typedAt < 700 ? typed + ch : ch;
    typedAt = now;
    const hit = options.find((o) =>
      (o.querySelector('.dm-option-name')?.textContent || '').toLowerCase().startsWith(typed.toLowerCase()),
    );
    if (hit) setActive(hit);
  }
  function move(delta: number | 'first' | 'last') {
    if (!options.length) return;
    const i = active ? options.indexOf(active) : -1;
    const next =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? options.length - 1
          : Math.max(0, Math.min(options.length - 1, (i < 0 ? (delta > 0 ? -1 : options.length) : i) + delta));
    setActive(options[next]);
  }

  async function choose(row: HTMLElement | null) {
    if (!row || row.getAttribute('aria-disabled') === 'true') return;
    const v = row.dataset.value!;
    close();
    if (v === currentValue()) return;
    const next = v === LAST ? null : v;
    const before = saved;
    saved = next;
    resolved = resolveNow();
    saving = true;
    renderTrigger();
    try {
      await api.startupModel(next);
      document.dispatchEvent(new CustomEvent('charles-startup-model', { detail: next }));
      const c = resolved.kind === 'ok' ? resolved.choice : null;
      notice(
        next === null || !c
          ? 'Charles son kullandığın modelle açılacak.'
          : 'Charles açılışta ve yeni sohbetlerde ' +
              c.providerLabel +
              ' · ' +
              (c.auto ? t('Otomatik') + (c.meta ? ` (${c.meta})` : '') : c.name) +
              ' ile başlayacak.',
      );
    } catch (e) {
      saved = before;
      resolved = resolveNow();
      notice((e as Error).message);
    } finally {
      saving = false;
      renderTrigger();
    }
  }

  function keys(e: KeyboardEvent, fromSearch: boolean) {
    if (e.isComposing || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (!isOpen()) {
      if (fromSearch) return;
      if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp' || (k === 'ArrowDown' && e.altKey)) {
        e.preventDefault();
        open();
        if (k === 'ArrowUp' && !searchable()) move('first');
      } else if (k.length === 1 && !e.altKey && k.trim()) {
        e.preventDefault();
        open(k);
      }
      return;
    }
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (k === 'Escape') {
      // the settings window closes on Escape: this one only closes the list
      stop();
      close();
    } else if (k === 'ArrowDown') {
      stop();
      move(1);
    } else if (k === 'ArrowUp') {
      stop();
      if (e.altKey) void choose(active);
      else move(-1);
    } else if (k === 'Home') {
      stop();
      move('first');
    } else if (k === 'End') {
      stop();
      move('last');
    } else if (k === 'PageDown') {
      stop();
      move(8);
    } else if (k === 'PageUp') {
      stop();
      move(-8);
    } else if (k === 'Enter' || (k === ' ' && !fromSearch)) {
      stop();
      void choose(active);
    } else if (k === 'Tab') {
      // leave the list; the focus goes on from the field
      close(false);
      if (fromSearch) trigger.focus();
    } else if (!fromSearch && k.length === 1 && !e.altKey) {
      e.preventDefault();
      if (searchable()) {
        search.focus();
        search.value += k;
        filter();
      } else typeahead(k);
    }
  }

  trigger.addEventListener('keydown', (e) => keys(e, false));
  search.addEventListener('keydown', (e) => keys(e, true));
  search.addEventListener('input', filter);
  trigger.addEventListener('click', () => (isOpen() ? close() : open()));
  // a press in the list keeps the focus where it is (the search field or the field)
  popup.addEventListener('mousedown', (e) => {
    if (e.target !== search) e.preventDefault();
  });
  list.addEventListener('click', (e) => {
    void choose((e.target as HTMLElement).closest('.dm-option') as HTMLElement | null);
  });
  list.addEventListener('pointermove', (e) => {
    const row = (e.target as HTMLElement).closest('.dm-option') as HTMLElement | null;
    if (row && row !== active && row.getAttribute('aria-disabled') !== 'true') setActive(row);
  });

  /** Reads the list and the saved choice again; an open list is rebuilt in place. */
  async function fill() {
    const mine = ++generation;
    const [list, value] = await Promise.all([
      Promise.resolve(api.models()).catch(() => null),
      Promise.resolve(api.startupModel()).catch(() => saved),
    ]);
    if (mine !== generation) return;
    if (Array.isArray(list)) models = list;
    else if (models === null) models = [];
    if (!saving) saved = value === undefined ? null : value;
    groups = buildGroups(models, providers());
    resolved = resolveNow();
    renderTrigger();
    if (isOpen()) {
      const keep = active?.dataset.value;
      searchRow.hidden = !searchable() && !query;
      renderList(keep);
      place();
    }
  }

  renderTrigger();
  const refresh = () => void fill().catch(() => {});
  refresh();
  document.addEventListener('charles-account', refresh);
  document
    .querySelector('#settings-categories [data-category=account]')
    ?.addEventListener('click', refresh);
  document.getElementById('settings-categories')?.addEventListener('click', () => close(false));
  // v1.0.0: a plan's models changed (GitHub Copilot, a new connection): the open list follows
  api.onProviderModels?.(refresh);
  if (dialog) {
    dialog.addEventListener('close', () => close(false));
    // opened again (after onboarding or a choice in another window): read the saved choice again
    new MutationObserver(() => {
      if ((dialog as HTMLDialogElement).open) refresh();
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }
  return section;
}
