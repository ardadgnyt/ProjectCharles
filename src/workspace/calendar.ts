// v0.7.2: the calendar card of the app window and its editor ("Takvimi düzenle").
// Google Calendar events (read and, with the Google Takvim plugin, write), Outlook events
// (read), Charles' reminders and the public holidays / special days of the interface
// language's country (holidays.ts). Month and weekday names come from the system (Intl), so
// they follow the interface language.
import { el, icon, iconButton } from './icons';
import { modal } from './modal';
import { holidaysBetween } from './holidays';
import { t } from '../settings/i18n';

type Item = {
  id: string;
  kind: 'calendar' | 'outlook-calendar' | 'reminder' | 'holiday';
  title: string;
  date: Date;
  end?: Date | null;
  allDay?: boolean;
  description?: string;
  reminder?: number | null;
  off?: boolean;
  raw?: any;
};

export type CalendarDeps = {
  api: any;
  notice: (s: string) => void;
  ask: (text: string) => void;
  openSettings: (category: string) => void;
  reminders: () => any[];
  setPersonal: (p: any) => void;
};

const LOCALES: Record<string, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', zh: 'zh-CN' };
const lang = () => (document.documentElement.lang || 'tr').slice(0, 2);
const loc = () => LOCALES[lang()] || 'tr-TR';
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const hm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const ymd = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const monthTitle = (m: Date) => new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(m);
const weekdays = () => {
  const f = new Intl.DateTimeFormat(loc(), { weekday: 'short' });
  // 2024-01-01 was a Monday
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)).replace('.', ''));
};
const dayTitle = (d: Date) => new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'long' }).format(d);
const parseDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s));
const COLORS: Record<Item['kind'], string> = {
  calendar: '#f0a07a',
  'outlook-calendar': '#7fb2ff',
  reminder: '#6fd9b0',
  holiday: '#d88ad9',
};
const minutesText = (a: Date, b?: Date | null) => {
  if (!b) return '';
  const m = Math.round((+b - +a) / 60000);
  if (m <= 0) return '';
  if (m < 60) return m + ' dakika';
  const h = Math.floor(m / 60);
  return h + ' saat' + (m % 60 ? ' ' + (m % 60) + ' dk' : '');
};

export function calendarCard(d: CalendarDeps) {
  const { api } = d;
  let month = new Date();
  month.setDate(1);
  let events: any[] = [];
  let connected = false;
  let writable = false;
  let selected: Date = new Date();

  // ── data ────────────────────────────────────────────────────────────────────
  function items(from: Date, to: Date): Item[] {
    const out: Item[] = [];
    for (const r of d.reminders())
      out.push({ id: 'r:' + r.id, kind: 'reminder', title: r.title, date: new Date(r.due), raw: r });
    for (const e of events) {
      const date = parseDate(e.date);
      if (Number.isNaN(+date)) continue;
      out.push({
        id: (e.kind || 'calendar') + ':' + (e.id || e.title + e.date),
        kind: e.kind === 'outlook-calendar' ? 'outlook-calendar' : 'calendar',
        title: e.title,
        date,
        end: e.end ? parseDate(e.end) : null,
        allDay: !!e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.date),
        description: e.description || '',
        reminder: e.reminder ?? null,
        raw: e,
      });
    }
    for (const h of holidaysBetween(from, to, lang()))
      out.push({ id: 'h:' + h.date + h.name, kind: 'holiday', title: h.name, date: parseDate(h.date), allDay: true, off: h.off });
    return out.filter((x) => +x.date >= +from && +x.date < +to + 86400000).sort((a, b) => +a.date - +b.date || Number(a.kind !== 'holiday') - Number(b.kind !== 'holiday'));
  }
  const gridStart = (m: Date) => {
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    return new Date(m.getFullYear(), m.getMonth(), 1 - ((first.getDay() + 6) % 7));
  };
  async function load(force = false) {
    const from = gridStart(month);
    const to = new Date(+from + 42 * 86400000);
    try {
      const c = await api.workspaceCalendar(force, { from: from.toISOString(), to: to.toISOString() });
      connected = !!c.connected;
      writable = !!c.writable;
      events = c.rows || [];
    } catch {}
    paint();
    if (editor.isOpen()) paintEditor();
  }
  const whenText = (x: Item) => (x.allDay ? 'Tüm gün' : hm(x.date));
  const subText = (x: Item) =>
    x.kind === 'holiday'
      ? x.off
        ? 'Resmî tatil'
        : 'Özel gün'
      : x.kind === 'reminder'
        ? 'Hatırlatıcı'
        : minutesText(x.date, x.end) || (x.kind === 'outlook-calendar' ? 'Outlook Takvim' : 'Google Takvim');

  // ── card ────────────────────────────────────────────────────────────────────
  const editB = el('button', 'ws-edit-btn', icon('pencil'), el('span', '', 'Düzenle'));
  editB.type = 'button';
  editB.onclick = () => openEditor();
  const card = el('section', 'ws-card ws-dash ws-calendar');
  card.append(el('div', 'ws-card-head', el('span', 'ws-card-icon', icon('calendar')), el('h2', '', 'Takvim'), editB));
  const title = el('strong', 'ws-cal-title');
  title.translate = false;
  const prev = iconButton('chevronLeft', 'Önceki ay', () => moveMonth(-1));
  const next = iconButton('chevronRight', 'Sonraki ay', () => moveMonth(1));
  card.append(el('div', 'ws-cal-nav', title, el('span', '', prev, next)));
  const grid = el('div', 'ws-cal-grid');
  const listHead = el('div', 'ws-cal-list-head');
  const list = el('div', 'ws-cal-list');
  card.append(grid, el('i', 'ws-cal-sep'), listHead, list);

  function moveMonth(by: number) {
    month = new Date(month.getFullYear(), month.getMonth() + by, 1);
    paint();
    void load();
  }
  function dayCells(host: HTMLElement, big: boolean, onPick: (date: Date) => void, onItem?: (x: Item) => void) {
    const start = gridStart(month);
    const all = items(start, new Date(+start + 41 * 86400000));
    const today = new Date();
    host.replaceChildren(...weekdays().map((w) => {
      const s = el('span', 'ws-wd', w);
      s.translate = false;
      return s;
    }));
    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const has = all.filter((x) => sameDay(x.date, date));
      const cls =
        'ws-day-cell' +
        (date.getMonth() !== month.getMonth() ? ' other' : '') +
        (sameDay(date, today) ? ' today' : '') +
        (sameDay(date, selected) ? ' selected' : '') +
        (has.some((x) => x.kind === 'holiday' && x.off) ? ' holiday' : '');
      const num = el('span', 'ws-day-num', String(date.getDate()));
      const cell = el(big ? 'div' : 'button', cls, num) as HTMLElement;
      if (!big) (cell as HTMLButtonElement).type = 'button';
      if (has.length) cell.title = has.map((x) => whenText(x) + ' · ' + x.title).join('\n');
      if (big) {
        const chips = el('div', 'ws-chips');
        for (const x of has.slice(0, 3)) {
          const name = el('span', '', (x.allDay ? '' : hm(x.date) + ' ') + x.title);
          name.translate = false;
          const chip = el('button', 'ws-chip-ev', el('i', '', ''), name);
          chip.type = 'button';
          (chip.firstChild as HTMLElement).style.background = COLORS[x.kind];
          chip.onclick = (e) => {
            e.stopPropagation();
            onItem?.(x);
          };
          chips.append(chip);
        }
        if (has.length > 3) chips.append(el('small', 'ws-more-ev', '+' + (has.length - 3)));
        cell.append(chips);
      } else if (has.length) {
        const dots = el('span', 'ws-dots');
        for (const k of [...new Set(has.map((x) => x.kind))].slice(0, 3)) {
          const dot = el('i');
          dot.style.background = COLORS[k];
          dots.append(dot);
        }
        cell.append(dots);
      }
      cell.onclick = () => onPick(date);
      host.append(cell);
    }
  }
  function paint() {
    title.textContent = monthTitle(month);
    card.classList.toggle('synced', writable);
    dayCells(grid, false, (date) => {
      selected = date;
      if (date.getMonth() !== month.getMonth()) month = new Date(date.getFullYear(), date.getMonth(), 1);
      paint();
    });
    const dayItems = items(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()), new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()));
    const isToday = sameDay(selected, new Date());
    listHead.replaceChildren(
      el('strong', '', (isToday ? 'Bugün · ' : '') + dayTitle(selected)),
      el('small', '', dayItems.length ? dayItems.length + ' etkinlik' : ''),
    );
    (listHead.firstChild as HTMLElement).translate = false;
    list.replaceChildren();
    for (const x of dayItems) {
      const name = el('strong', '', x.title);
      name.translate = x.kind !== 'holiday' && x.kind !== 'calendar' && x.kind !== 'outlook-calendar' && x.kind !== 'reminder';
      const row = el(
        'div',
        'ws-ev-row',
        el('i', 'ws-ev-bar'),
        el('span', 'ws-ev-time', whenText(x)),
        el('span', 'ws-ev-text', name, el('small', '', subText(x))),
      );
      (row.firstChild as HTMLElement).style.background = COLORS[x.kind];
      if (x.kind !== 'holiday') {
        const more = iconButton('dots', x.title + ' · işlemler', () => openEditor(x), 'ws-icon ws-more');
        row.append(more);
      }
      list.append(row);
    }
    if (!dayItems.length)
      list.append(
        el('p', 'ws-empty', connected ? 'Bu gün için etkinlik yok.' : 'Google Takvim’i Eklentiler’den bağlayınca etkinliklerin burada görünür.'),
      );
  }

  // ── editor ("Takvimi düzenle") ──────────────────────────────────────────────
  const editor = modal({ icon: 'calendar', title: 'Takvimi düzenle', subtitle: 'Etkinliklerini ve hatırlatmalarını yönet', cls: 'ws-cal-editor' });
  let view: 'month' | 'week' = 'month';
  let editing: Item | null = null;
  let dirty = false;
  const todayB = el('button', 'ws-ghost', 'Bugün');
  todayB.type = 'button';
  todayB.onclick = () => {
    month = new Date();
    month.setDate(1);
    selected = new Date();
    paintEditor();
    void load();
  };
  const eTitle = el('strong', 'ws-cal-title');
  eTitle.translate = false;
  const ePrev = iconButton('chevronLeft', 'Önceki', () => step(-1));
  const eNext = iconButton('chevronRight', 'Sonraki', () => step(1));
  const seg = el('div', 'ws-seg');
  const monthB = el('button', 'on', 'Ay');
  const weekB = el('button', '', 'Hafta');
  for (const [b, v] of [
    [monthB, 'month'],
    [weekB, 'week'],
  ] as const) {
    b.type = 'button';
    b.onclick = () => {
      view = v;
      paintEditor();
    };
    seg.append(b);
  }
  const addB = el('button', 'ws-primary', icon('plus'), el('span', '', 'Etkinlik'));
  addB.type = 'button';
  addB.onclick = () => select(null);
  const bigGrid = el('div', 'ws-big-grid');
  const left = el('div', 'ws-cal-left', el('div', 'ws-cal-tools', todayB, el('span', 'ws-cal-step', ePrev, eTitle, eNext)), bigGrid);
  // form
  const fLabel = el('small', 'ws-form-label', 'YENİ ETKİNLİK');
  const fHeading = el('strong', 'ws-form-heading', '');
  fHeading.translate = false;
  const field = (label: string, input: HTMLElement) => el('label', 'ws-field', el('span', '', label), input);
  const fTitle = el('input');
  fTitle.maxLength = 200;
  const fDate = el('input');
  fDate.type = 'date';
  const fAllDay = el('input');
  fAllDay.type = 'checkbox';
  const fStart = el('input');
  fStart.type = 'time';
  const fEnd = el('input');
  fEnd.type = 'time';
  const fWhere = el('select');
  const fRemind = el('select');
  for (const [v, l] of [
    ['', 'Varsayılan'],
    ['0', 'Etkinlik anında'],
    ['10', '10 dakika önce'],
    ['30', '30 dakika önce'],
    ['60', '1 saat önce'],
    ['1440', '1 gün önce'],
  ])
    fRemind.add(new Option(l, v));
  const fNote = el('textarea');
  fNote.rows = 3;
  fNote.placeholder = 'Not ekle…';
  fNote.maxLength = 2000;
  const fInfo = el('p', 'ws-empty');
  const times = el('div', 'ws-field-row', field('Başlangıç saati', fStart), field('Bitiş', fEnd));
  const allDayRow = el('label', 'ws-check-row', fAllDay, el('span', '', 'Tüm gün'));
  const form = el(
    'div',
    'ws-cal-form',
    el('div', 'ws-seg-row', seg, addB),
    fLabel,
    fHeading,
    field('Başlık', fTitle),
    field('Tarih', fDate),
    allDayRow,
    times,
    field('Takvim', fWhere),
    field('Hatırlatma', fRemind),
    field('Not', fNote),
    fInfo,
  );
  editor.body.append(el('div', 'ws-cal-editor-grid', left, form));
  const status = el('span', 'ws-foot-status', '');
  const delB = el('button', 'ws-danger', icon('trash'), el('span', '', 'Sil'));
  delB.type = 'button';
  const cancelB = el('button', '', 'Vazgeç');
  cancelB.type = 'button';
  const saveB = el('button', 'ws-primary', 'Kaydet');
  saveB.type = 'button';
  editor.foot.append(status, el('span', 'ws-foot-actions', delB, cancelB, saveB));
  for (const input of [fTitle, fDate, fAllDay, fStart, fEnd, fWhere, fRemind, fNote])
    input.addEventListener('input', () => {
      dirty = true;
      status.textContent = 'Son değişiklikler henüz kaydedilmedi';
      times.hidden = fAllDay.checked;
    });

  function step(by: number) {
    if (view === 'week') {
      selected = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + by * 7);
      month = new Date(selected.getFullYear(), selected.getMonth(), 1);
    } else month = new Date(month.getFullYear(), month.getMonth() + by, 1);
    paintEditor();
    void load();
  }
  function select(x: Item | null, date?: Date) {
    editing = x;
    dirty = false;
    status.textContent = '';
    const readOnly = !!x && (x.kind === 'holiday' || x.kind === 'outlook-calendar' || (x.kind === 'calendar' && !writable));
    fWhere.replaceChildren();
    if (writable || x?.kind === 'calendar') fWhere.add(new Option('Google Takvim', 'calendar'));
    fWhere.add(new Option('Charles hatırlatıcısı', 'reminder'));
    if (x?.kind === 'outlook-calendar') fWhere.add(new Option('Outlook Takvim', 'outlook-calendar'));
    if (x?.kind === 'holiday') fWhere.add(new Option(x.off ? 'Resmî tatil' : 'Özel gün', 'holiday'));
    const base = x?.date || date || new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 10, 0);
    if (!x && !date && sameDay(selected, new Date())) base.setHours(new Date().getHours() + 1, 0, 0, 0);
    fLabel.textContent = x ? 'SEÇİLİ ETKİNLİK' : 'YENİ ETKİNLİK';
    fHeading.textContent = x ? x.title : t('Yeni etkinlik');
    fTitle.value = x?.title || '';
    fDate.value = ymd(base);
    fAllDay.checked = !!x?.allDay;
    fStart.value = hm(base);
    const end = x?.end && !x.allDay ? x.end : new Date(+base + 30 * 60000);
    fEnd.value = hm(end);
    fWhere.value = x ? x.kind : writable ? 'calendar' : 'reminder';
    fRemind.value = x?.reminder != null ? String(x.reminder) : '';
    fNote.value = x?.description || '';
    times.hidden = fAllDay.checked;
    for (const input of [fTitle, fDate, fAllDay, fStart, fEnd, fWhere, fRemind, fNote]) input.disabled = readOnly;
    fWhere.disabled = readOnly || !!x;
    fRemind.disabled = readOnly || fWhere.value !== 'calendar';
    fNote.disabled = readOnly || fWhere.value !== 'calendar';
    fInfo.textContent =
      x?.kind === 'holiday'
        ? 'Resmî tatiller ve özel günler seçili dile göre otomatik gösterilir.'
        : x?.kind === 'outlook-calendar'
          ? 'Outlook etkinlikleri şimdilik yalnızca görüntülenir.'
          : !writable
            ? 'Google Takvim’e eklemek için Ayarlar → Eklentiler → Google Takvim’i bağla. Şimdilik Charles hatırlatıcısı olarak kaydedilir.'
            : '';
    delB.hidden = !x || readOnly;
    saveB.disabled = readOnly;
    paintEditor(false);
    if (!readOnly) fTitle.focus();
  }
  fWhere.onchange = () => {
    fRemind.disabled = fNote.disabled = fWhere.value !== 'calendar';
  };

  function paintEditor(full = true) {
    eTitle.textContent =
      view === 'month'
        ? monthTitle(month)
        : (() => {
            const s = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - ((selected.getDay() + 6) % 7));
            const e = new Date(+s + 6 * 86400000);
            return dayTitle(s) + ' – ' + dayTitle(e);
          })();
    monthB.classList.toggle('on', view === 'month');
    weekB.classList.toggle('on', view === 'week');
    bigGrid.classList.toggle('week', view === 'week');
    if (!full && bigGrid.childElementCount) {
      for (const b of bigGrid.querySelectorAll('.ws-chip-ev')) b.classList.toggle('on', (b as HTMLElement).dataset.id === editing?.id);
    }
    if (view === 'month')
      dayCells(
        bigGrid,
        true,
        (date) => {
          selected = date;
          if (!dirty) select(null, new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 0));
          else paintEditor();
        },
        (x) => select(x),
      );
    else {
      const s = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - ((selected.getDay() + 6) % 7));
      const all = items(s, new Date(+s + 6 * 86400000));
      const names = weekdays();
      bigGrid.replaceChildren();
      for (let i = 0; i < 7; i++) {
        const date = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
        const head = el('div', 'ws-week-head' + (sameDay(date, new Date()) ? ' today' : ''), el('span', '', names[i]), el('strong', '', String(date.getDate())));
        head.translate = false;
        const col = el('div', 'ws-week-col', head);
        for (const x of all.filter((y) => sameDay(y.date, date))) {
          const name = el('span', '', x.title);
          name.translate = false;
          const chip = el('button', 'ws-chip-ev big', el('i'), el('small', '', whenText(x)), name);
          chip.type = 'button';
          (chip.firstChild as HTMLElement).style.background = COLORS[x.kind];
          chip.onclick = () => select(x);
          col.append(chip);
        }
        col.onclick = (e) => {
          if (e.target === col) select(null, new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 0));
        };
        bigGrid.append(col);
      }
    }
  }

  function openEditor(x?: Item) {
    editor.open();
    if (x) {
      selected = x.date;
      month = new Date(x.date.getFullYear(), x.date.getMonth(), 1);
    }
    paintEditor();
    select(x || null);
  }

  saveB.onclick = () =>
    void (async () => {
      const titleText = fTitle.value.trim();
      if (!titleText) {
        status.textContent = 'Etkinliğe bir ad ver.';
        fTitle.focus();
        return;
      }
      const [y, m, dd] = fDate.value.split('-').map(Number);
      const [sh, sm] = (fStart.value || '10:00').split(':').map(Number);
      const [eh, em] = (fEnd.value || '10:30').split(':').map(Number);
      const start = new Date(y, m - 1, dd, fAllDay.checked ? 9 : sh, fAllDay.checked ? 0 : sm);
      let end = new Date(y, m - 1, dd, eh, em);
      if (+end <= +start) end = new Date(+start + 30 * 60000);
      saveB.disabled = true;
      try {
        if (fWhere.value === 'calendar') {
          const ev = {
            title: titleText,
            start: start.toISOString(),
            end: end.toISOString(),
            allDay: fAllDay.checked,
            description: fNote.value,
            reminder: fRemind.value === '' ? null : Number(fRemind.value),
          };
          if (editing?.kind === 'calendar') await api.workspaceCalendarUpdate(editing.raw.id, ev);
          else await api.workspaceCalendarAdd(ev);
        } else {
          if (+start <= Date.now()) throw Error('Hatırlatıcı için gelecekte bir zaman seç.');
          if (editing?.kind === 'reminder') d.setPersonal(await api.personalEdit('reminder-delete', { id: editing.raw.id }));
          d.setPersonal(await api.personalEdit('reminder-add', { title: titleText, due: +start }));
        }
        dirty = false;
        status.textContent = 'Kaydedildi.';
        await load(true);
        select(null);
      } catch (e) {
        status.textContent = (e as Error).message;
      } finally {
        saveB.disabled = false;
      }
    })();
  cancelB.onclick = () => {
    if (editing || dirty) select(null);
    else editor.close();
  };
  delB.onclick = () =>
    void (async () => {
      if (!editing) return;
      if (delB.dataset.confirm !== '1') {
        delB.dataset.confirm = '1';
        (delB.lastChild as HTMLElement).textContent = 'Silmeyi onayla';
        window.setTimeout(() => {
          delB.dataset.confirm = '';
          (delB.lastChild as HTMLElement).textContent = 'Sil';
        }, 3000);
        return;
      }
      try {
        if (editing.kind === 'calendar') await api.workspaceCalendarDelete(editing.raw.id);
        else if (editing.kind === 'reminder') d.setPersonal(await api.personalEdit('reminder-delete', { id: editing.raw.id }));
        status.textContent = 'Silindi.';
        await load(true);
        select(null);
      } catch (e) {
        status.textContent = (e as Error).message;
      }
    })();

  // the language changes the holidays and the month / weekday names
  new MutationObserver(() => {
    paint();
    if (editor.isOpen()) paintEditor();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  document.addEventListener('charles-calendar-changed', () => void load(true));

  return { element: card, load, paint, openEditor };
}
