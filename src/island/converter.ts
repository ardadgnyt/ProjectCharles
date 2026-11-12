// v0.8.10: Dönüştürücü — the sheet that opens on the card shelf when files are dropped on (or
// picked from) the converter card. Only formats every dropped file can become are shown; the
// result is saved next to the original (app/files/convert.cjs).
// v0.9.26: every target brings its own choices and notes (app/files/convert-ops.cjs → schema):
// pages, resolution, quality, background colour, separator and encoding, worksheet and range,
// bit rate, frame rate, language … The order of several files can be set, and text or table cells
// read by OCR are shown for checking before they are saved.
import { el, icon } from '../workspace/icons';

type Option = {
  id: string;
  type: 'select' | 'text' | 'color' | 'check' | 'folder' | 'sheet' | 'order';
  label: string;
  choices?: [string, string][];
  value?: any;
  placeholder?: string;
  max?: number;
  show?: [string, string];
};
type Target = { id: string; label: string; group: string; options?: Option[]; notes?: string[] };
type Batch = { id: string; kind: string; kindName: string; files: { name: string; ext: string; size: number; kind: string }[]; targets: Target[]; ffmpeg: boolean; sheets?: string[] };
type Deps = {
  api: any;
  notice: (s: string) => void;
  attempt: (fn: () => Promise<any>) => Promise<void>;
  show: (content: HTMLElement) => void;
  hide: () => void;
  card: HTMLElement;
};

const KIND_ICON: Record<string, string> = { presentation: 'window', image: 'palette', audio: 'music', video: 'tv', document: 'file', data: 'chart', subtitle: 'tag', archive: 'folder', mixed: 'copy', other: 'file' };
const GROUP_NAME: Record<string, string> = {
  image: 'Görsel', audio: 'Ses', video: 'Video', document: 'Belge', data: 'Veri', subtitle: 'Altyazı', archive: 'Arşiv', other: 'Diğer',
  presentation: 'Sunum', ocr: 'Metin tanıma (OCR)', animation: 'Hareketli', speech: 'Yazıya dökme',
};
const GROUP_ORDER = ['document', 'data', 'presentation', 'image', 'ocr', 'animation', 'audio', 'video', 'speech', 'subtitle', 'archive', 'other'];
const LOSSY = ['jpg', 'webp', 'avif', 'mp3', 'm4a', 'ogg', 'opus', 'mp4', 'webm', 'mov', 'mkv', 'gif'];
const IMAGE_SIZES: [number, string][] = [[0, 'Orijinal'], [3840, '3840 px'], [1920, '1920 px'], [1280, '1280 px'], [512, '512 px']];
const VIDEO_SIZES: [number, string][] = [[0, 'Orijinal'], [1080, '1080p'], [720, '720p'], [480, '480p']];
const GIF_SIZES: [number, string][] = [[0, 'Otomatik'], [640, '640 px'], [480, '480 px'], [320, '320 px']];

export function formatSize(n: number) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return (v >= 100 ? Math.round(v) : v.toFixed(1)).toString().replace('.', ',') + ' ' + units[i];
}

export function converterSheet(d: Deps) {
  const { api } = d;
  let batch: Batch | null = null;
  let target = '';
  let quality = 'balanced';
  let size = 0;
  let merge = true;
  let running = false;
  let rows: HTMLElement[] = [];
  // v0.9.26: the chosen values of the target's own choices, and the files' order
  let values: Record<string, any> = {};
  let order: number[] = [];
  let outDir = '';

  const root = el('div', 'conv conv13');
  root.dataset.kind = 'convert';
  root.dataset.drop = 'convert';

  function button(cls: string, text: string, onclick: () => void, iconName = '') {
    const b = el('button', cls, ...(iconName ? [icon(iconName)] : []), el('span', '', text));
    b.type = 'button';
    b.onclick = onclick;
    return b;
  }
  const current = () => batch?.targets.find((t) => t.id === target) || null;
  function choose(t: string) {
    target = t;
    values = {};
    for (const o of current()?.options || []) if (o.value !== undefined) values[o.id] = o.value;
    if (outDir) values.outDir = outDir;
  }

  function open(b: Batch) {
    batch = b;
    running = false;
    size = 0;
    order = b.files.map((_, i) => i);
    choose(b.targets.find((t) => t.id !== 'zip')?.id || b.targets[0]?.id || '');
    paint();
    d.show(root);
  }

  /** The long-standing quality / size / merge choices, for targets whose schema does not have them. */
  function legacyOptions(schema: Option[]) {
    if (!batch) return [];
    const out: HTMLElement[] = [];
    if (LOSSY.includes(target) && !schema.some((o) => o.id === 'quality')) {
      const pick = el('select', 'conv-select') as HTMLSelectElement;
      pick.setAttribute('aria-label', 'Kalite');
      for (const [id, text] of [['high', 'Yüksek'], ['balanced', 'Dengeli'], ['small', 'Küçük']]) pick.add(new Option(text, id, false, quality === id));
      pick.onchange = () => (quality = pick.value);
      out.push(el('label', 'conv-opt', el('small', '', 'Kalite'), pick));
    }
    const sizes =
      target === 'gif' ? GIF_SIZES : batch.kind === 'image' && ['png', 'jpg', 'webp', 'avif', 'bmp', 'tiff', 'pdf'].includes(target) ? IMAGE_SIZES : batch.kind === 'video' && ['mp4', 'webm', 'mov', 'mkv'].includes(target) && !schema.some((o) => o.id === 'height') ? VIDEO_SIZES : null;
    if (sizes) {
      const select = el('select', 'conv-select') as HTMLSelectElement;
      select.setAttribute('aria-label', 'Boyut');
      for (const [v, text] of sizes) select.add(new Option(text, String(v), false, v === size));
      if (!sizes.some(([v]) => v === size)) size = 0;
      select.onchange = () => (size = +select.value);
      out.push(el('label', 'conv-opt', el('small', '', 'Boyut'), select));
    }
    if (target === 'pdf' && batch.kind === 'image' && batch.files.length > 1) {
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = merge;
      box.onchange = () => {
        merge = box.checked;
        paint();
      };
      out.push(el('label', 'conv-opt conv-check', box, el('span', '', 'Tek PDF’te birleştir')));
      if (merge) out.push(orderList());
    }
    return out;
  }

  /** v0.9.26: the files in the order they will be joined; ↑ ↓ move one (keyboard too). */
  function orderList() {
    const list = el('ol', 'conv-order');
    list.setAttribute('aria-label', 'Sıra');
    order.forEach((fi, pos) => {
      const up = button('conv-mini', '↑', () => move(pos, -1));
      const down = button('conv-mini', '↓', () => move(pos, 1));
      up.setAttribute('aria-label', 'Yukarı taşı');
      down.setAttribute('aria-label', 'Aşağı taşı');
      up.disabled = pos === 0 || running;
      down.disabled = pos === order.length - 1 || running;
      const name = el('span', 'conv-order-name', batch!.files[fi].name);
      name.translate = false;
      list.append(el('li', '', name, up, down));
    });
    return el('div', 'conv-opt conv-order-opt', el('small', '', 'Sıra'), list);
  }
  function move(pos: number, by: number) {
    const to = pos + by;
    if (to < 0 || to >= order.length) return;
    [order[pos], order[to]] = [order[to], order[pos]];
    paint();
    // the moved file keeps the keyboard
    const items = root.querySelectorAll<HTMLElement>('.conv-order li');
    items[to]?.querySelector<HTMLButtonElement>(by < 0 ? 'button' : 'button:last-child')?.focus();
  }

  /** v0.9.26: the target's own choices (schema from the main process). */
  function schemaOptions(schema: Option[]) {
    const out: HTMLElement[] = [];
    for (const o of schema) {
      if (o.show && values[o.show[0]] !== o.show[1]) continue;
      if (o.type === 'order') {
        out.push(orderList());
        continue;
      }
      if (o.type === 'select' || (o.type === 'sheet' && batch?.sheets?.length)) {
        const s = el('select', 'conv-select') as HTMLSelectElement;
        s.setAttribute('aria-label', o.label);
        const choices: [string, string][] = o.type === 'sheet' ? batch!.sheets!.map((n) => [n, n]) : o.choices || [];
        for (const [v, text] of choices) s.add(new Option(text, v, false, String(values[o.id] ?? '') === v));
        if (o.type === 'sheet') s.translate = false;
        s.onchange = () => {
          values[o.id] = s.value;
          // a choice may show or hide another one
          if (schema.some((x) => x.show?.[0] === o.id)) paint();
        };
        if (values[o.id] === undefined && choices[0]) values[o.id] = choices[0][0];
        out.push(el('label', 'conv-opt', el('small', '', o.label), s));
      } else if (o.type === 'text' || o.type === 'sheet') {
        const i = el('input', 'conv-text') as HTMLInputElement;
        i.type = 'text';
        i.placeholder = o.placeholder || '';
        i.maxLength = o.max || 200;
        i.value = values[o.id] ?? '';
        i.setAttribute('aria-label', o.label);
        i.oninput = () => (values[o.id] = i.value);
        out.push(el('label', 'conv-opt', el('small', '', o.label), i));
      } else if (o.type === 'color') {
        const i = el('input', 'conv-color') as HTMLInputElement;
        i.type = 'color';
        i.value = values[o.id] || '#ffffff';
        i.setAttribute('aria-label', o.label);
        i.oninput = () => (values[o.id] = i.value);
        out.push(el('label', 'conv-opt', el('small', '', o.label), i));
      } else if (o.type === 'check') {
        const box = el('input') as HTMLInputElement;
        box.type = 'checkbox';
        box.checked = !!values[o.id];
        box.onchange = () => (values[o.id] = box.checked);
        out.push(el('label', 'conv-opt conv-check', box, el('span', '', o.label)));
      } else if (o.type === 'folder') {
        const where = el('small', 'conv-folder-name', outDir || 'Dosyanın yanına');
        where.translate = !outDir;
        const pick = button('conv-ghost conv-folder', 'Klasör seç…', () =>
          void d.attempt(async () => {
            const chosen = await api.convertFolder();
            if (chosen) {
              outDir = chosen;
              values.outDir = chosen;
              paint();
            }
          }), 'folder');
        out.push(el('div', 'conv-opt', el('small', '', o.label), where, pick));
      }
    }
    return out;
  }

  // v0.9.13: the panel shows the converter before any file too: a drop area on the left, the
  // formats on the right (they appear once a file is chosen)
  function dropArea(big: boolean) {
    const area = el('button', 'conv-drop' + (big ? ' big' : ''), icon('plus'), el('span', '', 'Dosya seç veya bırak'));
    area.type = 'button';
    area.dataset.drop = 'convert';
    area.onclick = () => pickFiles();
    return area;
  }
  function paintEmpty() {
    batch = null;
    running = false;
    rows = [];
    const left = el('div', 'conv-left', dropArea(true));
    const right = el('div', 'conv-right', el('div', 'conv-formats conv-formats-empty', el('p', 'conv-empty', 'Bir dosya seç; dönüştürülebileceği biçimler burada görünür.')));
    const go = button('conv-go', 'Dönüştür', () => pickFiles(), 'refresh');
    go.disabled = true;
    right.append(el('div', 'conv-bottom', el('div', 'conv-opts'), el('div', 'conv-action', go)));
    root.replaceChildren(left, right);
    root.classList.remove('done', 'running');
    root.classList.add('empty');
  }

  function paint() {
    if (!batch) return paintEmpty();
    root.classList.remove('empty');
    const b = batch;
    const total = b.files.reduce((s, f) => s + f.size, 0);
    const single = b.files.length === 1;
    const head = el(
      'div',
      'conv-file',
      el('span', 'conv-kind', icon(KIND_ICON[b.kind] || 'file')),
      el('span', 'conv-file-text', el('strong', '', single ? b.files[0].name : `${b.files.length} dosya`), el('small', '', el('span', '', b.kindName), el('span', 'conv-size', ` · ${formatSize(total)}`))),
    );
    head.querySelector('strong')!.translate = !single;
    rows = b.files.map((f) => {
      const bar = el('i');
      const row = el('div', 'conv-row', el('span', 'conv-row-name', f.name), el('span', 'conv-row-state'), el('span', 'conv-row-bar', bar));
      row.translate = false;
      return row;
    });
    const list = el('div', 'conv-list', ...rows);
    list.hidden = single;
    const files = el('div', 'conv-left conv-files', head, list);
    if (single) files.append(rows[0]);
    rows[0] && single && rows[0].classList.add('conv-row-single');
    files.append(dropArea(false));

    const groups = new Map<string, Target[]>();
    for (const t of b.targets) groups.set(t.group, [...(groups.get(t.group) || []), t]);
    const chips = el('div', 'conv-chips');
    chips.setAttribute('role', 'radiogroup');
    chips.setAttribute('aria-label', 'Hedef biçim');
    const sorted = [...groups].sort((x, y) => (GROUP_ORDER.indexOf(x[0]) + 99) % 99 - (GROUP_ORDER.indexOf(y[0]) + 99) % 99);
    for (const [group, list] of sorted) {
      const line = el('div', 'conv-group', el('small', 'conv-group-name', GROUP_NAME[group] || group));
      const set = el('div', 'conv-group-chips');
      for (const t of list) {
        const chip = button('conv-chip' + (t.id === target ? ' on' : ''), t.label, () => {
          if (running) return;
          choose(t.id);
          paint();
        });
        chip.setAttribute('role', 'radio');
        chip.setAttribute('aria-checked', String(t.id === target));
        chip.disabled = running;
        chip.translate = /[a-zçğıöşü]/.test(t.label);
        set.append(chip);
      }
      line.append(set);
      chips.append(line);
    }
    if (!b.targets.length) chips.append(el('p', 'conv-empty', 'Bu dosyalar için ortak bir biçim yok. Aynı türden dosyaları birlikte bırak.'));
    const formats = el('div', 'conv-formats', chips);
    if (!b.ffmpeg && ['image', 'audio', 'video'].includes(b.kind)) formats.append(el('small', 'conv-note', 'FFmpeg bulunamadı; yalnızca temel biçimler gösteriliyor.'));

    const t = current();
    const schema = t?.options || [];
    const opts = el('div', 'conv-opts', ...schemaOptions(schema), ...legacyOptions(schema));
    const notes = el('div', 'conv-notes', ...(t?.notes || []).map((n) => el('p', 'conv-note', n)));
    notes.hidden = !t?.notes?.length;
    const action = el('div', 'conv-action');
    const go = button('conv-go', 'Dönüştür', () => void run(), 'refresh');
    go.disabled = !target || running;
    action.append(go);
    const right = el('div', 'conv-right', formats, el('div', 'conv-bottom', opts, notes, action));
    root.replaceChildren(files, right);
    root.classList.remove('done', 'running');
    root.dispatchEvent(new Event('h13-resize', { bubbles: true }));
  }

  function setRow(i: number, p: number, text = '', cls = '') {
    const row = rows[i];
    if (!row) return;
    (row.querySelector('.conv-row-bar i') as HTMLElement).style.width = Math.round(p * 100) + '%';
    if (text || cls) {
      const state = row.querySelector('.conv-row-state')!;
      state.textContent = text;
      row.className = 'conv-row' + (rows.length === 1 ? ' conv-row-single' : '') + (cls ? ' ' + cls : '');
      (row as HTMLElement).title = cls === 'failed' ? text : '';
    }
  }

  async function run() {
    if (!batch || !target || running) return;
    const b = batch;
    running = true;
    root.classList.add('running');
    root.querySelectorAll<HTMLButtonElement>('.conv-chip, .conv-seg-btn, .conv-ghost, .conv-mini, select, input').forEach((x) => (x.disabled = true));
    rows.forEach((_, i) => setRow(i, 0, 'Sırada', 'waiting'));
    const action = root.querySelector('.conv-action')!;
    const cancel = button('conv-ghost', 'İptal', () => void api.convertCancel(b.id).catch(() => {}), 'x');
    const label = el('small', 'conv-progress-label', 'Dönüştürülüyor…');
    action.replaceChildren(label, cancel);
    try {
      const r = await api.convertRun(b.id, target, { quality, size, merge, ...values, order });
      if (batch !== b) return;
      if (r?.review) return review(b, r.review, r.notes);
      done(r);
    } catch (e) {
      if (batch !== b) return;
      const message = (e as Error).message;
      d.notice(message);
      running = false;
      paint();
      if ((e as any)?.cancelled || /İptal/.test(message)) rows.forEach((_, i) => setRow(i, 0, 'İptal edildi', 'failed'));
    }
  }

  /**
   * v0.9.26: what OCR or the table reader found, for checking before it is saved: text in a box,
   * cells in a grid. Nothing is written until Kaydet.
   */
  function review(b: Batch, r: { kind: 'text' | 'table'; text?: string; rows?: string[][] }, notes: string[] = []) {
    running = false;
    root.classList.remove('running');
    const box = el('div', 'conv-review');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Kaydetmeden önce kontrol et');
    const title = el('strong', '', 'Kaydetmeden önce kontrol et');
    const hint = el('small', 'conv-note', r.kind === 'text' ? 'Tanınan metni düzeltebilirsin; Kaydet’e basınca dosya yazılır.' : 'Hücreleri düzeltebilirsin; Kaydet’e basınca dosya yazılır.');
    let read: () => any;
    let editor: HTMLElement;
    if (r.kind === 'text') {
      const area = el('textarea', 'conv-review-text') as HTMLTextAreaElement;
      area.value = r.text || '';
      area.spellcheck = false;
      area.setAttribute('aria-label', 'Tanınan metin');
      area.translate = false;
      editor = area;
      read = () => area.value;
    } else {
      const table = el('table', 'conv-review-table');
      table.translate = false;
      const width = Math.max(1, ...(r.rows || []).map((x) => x.length));
      const shown = (r.rows || []).slice(0, 500);
      for (const rowData of shown) {
        const tr = el('tr');
        for (let c = 0; c < width; c++) {
          const td = el('td');
          const input = el('input') as HTMLInputElement;
          input.value = rowData[c] ?? '';
          input.setAttribute('aria-label', `Satır ${shown.indexOf(rowData) + 1}, sütun ${c + 1}`);
          td.append(input);
          tr.append(td);
        }
        table.append(tr);
      }
      editor = el('div', 'conv-review-grid', table);
      if ((r.rows || []).length > shown.length) hint.textContent += ` İlk ${shown.length} satır gösteriliyor; diğerleri okunduğu gibi kaydedilir.`;
      read = () => {
        const edited = [...table.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value));
        return [...edited, ...(r.rows || []).slice(shown.length)];
      };
    }
    const save = button('conv-go', 'Kaydet', () =>
      void d.attempt(async () => {
        save.disabled = true;
        try {
          const result = await api.convertFinish(b.id, read());
          box.remove();
          done({ ...result, notes });
        } finally {
          save.disabled = false;
        }
      }), 'check');
    const back = button('conv-ghost', 'Vazgeç', () => {
      box.remove();
      paint();
    }, 'x');
    box.append(title, hint, editor, el('div', 'conv-review-actions', back, save));
    root.append(box);
    editor.focus();
  }

  function done(r: { outputs: string[]; failed: number; notes?: string[] }) {
    // v0.9.16: what a format could not keep (a slide's layout in Word) is said, not hidden
    if (r.notes?.length) d.notice(r.notes.join(' '));
    running = false;
    root.classList.remove('running');
    root.classList.add('done');
    const action = root.querySelector('.conv-action')!;
    const ok = r.outputs.length;
    const label = el('div', 'conv-result', icon(ok ? 'check' : 'x'), el('span', '', ok ? (r.failed ? `${ok} hazır, ${r.failed} başarısız` : ok === 1 ? 'Hazır' : `${ok} dosya hazır`) : 'Dönüştürülemedi'));
    const reveal = button('conv-go', 'Klasörde göster', () => void d.attempt(() => api.convertReveal(batch!.id)), 'folder');
    reveal.disabled = !ok;
    // v0.9.26: open the result itself (a picture, or the folder of several pages)
    const openIt = button('conv-ghost', 'Aç', () => void d.attempt(() => api.convertOpen(batch!.id)), 'external');
    openIt.disabled = !ok;
    const another = button('conv-ghost', 'Başka dosya', () => pickFiles(), 'plus');
    action.replaceChildren(label, another, openIt, reveal);
    if (ok === 1 && rows.length === 1) rows[0].querySelector('.conv-row-state')!.textContent = r.outputs[0];
  }

  api.onConvertProgress?.((p: any) => {
    if (!batch || p.id !== batch.id) return;
    if (p.done) setRow(p.index, 1, p.error || p.output || 'Hazır', p.error ? 'failed' : 'ok');
    else setRow(p.index, p.progress || 0, p.progress > 0 ? Math.round(p.progress * 100) + '%' : 'Başladı', 'active');
  });
  api.onConvertDrop?.((r: any) => {
    if (r.error) {
      d.notice(r.error);
      d.card.classList.add('shake');
      window.setTimeout(() => d.card.classList.remove('shake'), 500);
      return;
    }
    if (running) {
      d.notice('Önce süren dönüştürmenin bitmesini bekle.');
      return;
    }
    if (r.batch) open(r.batch);
  });

  function pickFiles() {
    if (running) return;
    void d.attempt(async () => {
      const b = await api.convertChoose();
      if (b) open(b);
    });
  }
  paintEmpty();
  return { root, choose: pickFiles, open, reset: () => !running && paintEmpty(), running: () => running, hasBatch: () => !!batch };
}
