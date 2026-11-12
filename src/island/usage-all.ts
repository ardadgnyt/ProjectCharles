// v0.9.13: the island's "AI kullanımı" panel — every connected AI with two rings (the same
// windows the workspace's usage card shows: 5 saatlik / Haftalık, Auto / Aylık, Kredi / Aylık
// or Günlük token). Which AIs are shown is the workspace's choice (workspaceDash.usageShow);
// the sliders button changes it here too.
import { el, icon } from '../workspace/icons';
import { resetLabel } from './usage';
import { percent } from '../settings/time-units';

export const USAGE_PROVIDERS: [string, string, string][] = [
  ['gpt', 'Codex', '#f2f2f5'],
  ['claude', 'Claude', '#e8a27c'],
  ['gemini', 'Antigravity', '#a8c7fa'],
  ['cursor', 'Cursor', '#3fd8c8'],
  ['abacus', 'Abacus AI', '#b9a6ff'],
  ['evren', 'EVREN', '#E30A17'],
  ['copilot', 'GitHub Copilot', '#A3E635'],
];
const RING = 2 * Math.PI * 26;

type Col = { col: HTMLElement; a: HTMLElement; b: HTMLElement; note: HTMLElement; left: number | null };

export function usageAll(api: any, onSummary: (text: string, low: boolean) => void) {
  const root = el('div', 'h13-usage');
  root.dataset.kind = 'usage';
  const iconBtn = (name: string, label: string, onclick: () => void) => {
    const b = el('button', 'h13-icon-btn', icon(name));
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.onclick = onclick;
    return b;
  };
  const refresh = iconBtn('refresh', 'Yenile', () => void load(true));
  const pick = iconBtn('sliders', 'Gösterilecek yapay zekâlar', () => toggleMenu());
  pick.setAttribute('aria-haspopup', 'true');
  pick.setAttribute('aria-expanded', 'false');
  const head = el('div', 'h13-sec-head', el('small', 'h13-sec-title', 'Kalan kullanım'), el('span', 'h13-sec-tools', pick, refresh));
  const menu = el('div', 'h13-usage-menu');
  menu.hidden = true;
  menu.setAttribute('role', 'group');
  const grid = el('div', 'h13-usage-grid');
  const empty = el('p', 'h13-usage-empty', 'Gösterilecek yapay zekâ seçilmedi.');
  empty.hidden = true;
  root.append(head, menu, grid, empty);

  let show: string[] | null = null; // null: every connected AI
  let signed = new Set<string>(['gpt']);
  const shown = (id: string) => (show ? show.includes(id) : id === 'gpt' || signed.has(id));

  function ring(label: string) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<circle class="track" cx="32" cy="32" r="26"/><circle class="value" cx="32" cy="32" r="26" transform="rotate(-90 32 32)" stroke-dasharray="' +
      RING.toFixed(1) +
      '" stroke-dashoffset="' +
      RING.toFixed(1) +
      '"/>';
    return el('div', 'h13-ring', el('span', 'h13-ring-dial', svg, el('strong', 'h13-ring-pct', '—')), el('span', 'h13-ring-label', label), el('small', 'h13-ring-reset', ''));
  }
  const cols = new Map<string, Col>();
  for (const [id, name, color] of USAGE_PROVIDERS) {
    const a = ring('5 saatlik');
    const b = ring('Haftalık');
    const note = el('small', 'h13-usage-note', '');
    const title = el('span', 'h13-prov-name', name);
    title.translate = false;
    const col = el('div', 'h13-usage-col', el('div', 'h13-prov', el('i', 'h13-prov-dot'), title), el('div', 'h13-rings', a, b), note);
    col.style.setProperty('--c', color);
    col.dataset.provider = id;
    cols.set(id, { col, a, b, note, left: null });
    grid.append(col);
  }
  function setRing(box: HTMLElement, w: any, label: string) {
    const value = box.querySelector('circle.value') as SVGCircleElement;
    const pct = box.querySelector('.h13-ring-pct')!;
    const reset = box.querySelector('.h13-ring-reset')!;
    box.querySelector('.h13-ring-label')!.textContent = label;
    if (!w) {
      value.setAttribute('stroke-dashoffset', RING.toFixed(1));
      pct.textContent = '—';
      reset.textContent = '';
      box.classList.add('empty');
      box.classList.remove('low');
      return null;
    }
    const left = Math.max(0, Math.min(100, Math.round(w.remaining)));
    box.classList.remove('empty');
    box.classList.toggle('low', left <= 15);
    value.setAttribute('stroke-dashoffset', (RING * (1 - left / 100)).toFixed(1));
    pct.textContent = percent(left);
    const r = resetLabel(w.resetsAt);
    reset.textContent = r ? '↻ ' + r : w.idle ? 'Henüz başlamadı' : '';
    return left;
  }
  function apply() {
    let any = false;
    for (const [id] of USAGE_PROVIDERS) {
      const c = cols.get(id)!;
      c.col.hidden = !shown(id);
      any ||= !c.col.hidden;
    }
    empty.hidden = any;
  }
  function summary() {
    // v0.9.13: the card's line only counts the AIs ("5 sağlayıcı"); the panel shows the rest
    const visible = USAGE_PROVIDERS.filter(([id]) => shown(id));
    const low = visible.some(([id]) => (cols.get(id)!.left ?? 100) <= 15);
    onSummary(`${visible.length} sağlayıcı`, low);
  }
  function paintMenu() {
    menu.replaceChildren();
    const all = el('label', 'h13-usage-opt h13-usage-all');
    const allBox = el('input') as HTMLInputElement;
    allBox.type = 'checkbox';
    allBox.checked = show === null;
    allBox.onchange = () => void save(allBox.checked ? null : USAGE_PROVIDERS.map(([id]) => id).filter(shown));
    all.append(allBox, el('span', '', 'Bağlı olanların hepsi'));
    menu.append(all);
    for (const [id, name, color] of USAGE_PROVIDERS) {
      const row = el('label', 'h13-usage-opt');
      row.style.setProperty('--c', color);
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = shown(id);
      box.onchange = () => {
        const base = USAGE_PROVIDERS.map(([p]) => p).filter(shown);
        void save(box.checked ? [...base, id] : base.filter((p) => p !== id));
      };
      const label = el('span', '', name);
      label.translate = false;
      row.append(box, el('i', 'h13-prov-dot'), label, el('small', '', id === 'gpt' || signed.has(id) ? 'Bağlı' : 'Bağlı değil'));
      menu.append(row);
    }
  }
  function toggleMenu(open = menu.hidden) {
    menu.hidden = !open;
    pick.setAttribute('aria-expanded', String(open));
    pick.classList.toggle('on', open);
    if (open) paintMenu();
    root.dispatchEvent(new Event('h13-resize', { bubbles: true }));
  }
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !pick.contains(e.target as Node)) toggleMenu(false);
  });
  async function save(value: string[] | null) {
    show = value;
    apply();
    paintMenu();
    try {
      await api.workspaceDash?.({ usageShow: value });
    } catch {}
    void read(false);
  }

  let busy = 0;
  async function load(force = false) {
    const started = Date.now();
    if (force) {
      busy++;
      refresh.classList.add('spinning');
    }
    try {
      await read(force);
    } finally {
      if (force) {
        await new Promise((r) => window.setTimeout(r, Math.max(0, 800 - (Date.now() - started))));
        if (--busy <= 0) {
          busy = 0;
          refresh.classList.remove('spinning');
        }
      }
    }
  }
  let loadedPrefs = false;
  async function read(force: boolean) {
    if (!loadedPrefs) {
      loadedPrefs = true;
      try {
        const dash = await api.workspaceDash?.();
        if (dash && (Array.isArray(dash.usageShow) || dash.usageShow === null)) show = dash.usageShow;
      } catch {}
    }
    let status: any[] = [];
    try {
      status = (await api.providersStatus?.()) || [];
    } catch {}
    if (status.length) signed = new Set(status.filter((s) => s.signedIn).map((s) => s.id));
    apply();
    await Promise.all(
      USAGE_PROVIDERS.filter(([id]) => shown(id)).map(async ([id]) => {
        const c = cols.get(id)!;
        if (id !== 'gpt' && !signed.has(id)) {
          c.col.classList.add('off');
          c.a.hidden = false;
          c.b.hidden = false;
          c.col.classList.remove('single');
          c.col.append(c.note);
          c.left = null;
          setRing(c.a, null, '5 saatlik');
          setRing(c.b, null, 'Haftalık');
          c.note.textContent = 'Bağlı değil';
          return;
        }
        if (!c.col.dataset.loaded) c.note.textContent = 'Okunuyor…';
        try {
          const u = await api.usageRead(force, id);
          c.col.dataset.loaded = '1';
          c.col.classList.toggle('off', !u.fiveHour && !u.weekly);
          c.a.hidden = !!u.missingWindows?.includes('fiveHour');
          c.b.hidden = !!u.missingWindows?.includes('weekly');
          // one window (EVREN's daily tokens): the note takes the empty place beside the ring
          const single = c.a.hidden !== c.b.hidden;
          c.col.classList.toggle('single', single);
          (single ? c.col.querySelector('.h13-rings')! : c.col).append(c.note);
          const a = setRing(c.a, u.fiveHour, u.labels?.fiveHour || '5 saatlik');
          const b = setRing(c.b, u.weekly, u.labels?.weekly || 'Haftalık');
          c.left = a ?? b;
          c.note.textContent = !u.fiveHour && !u.weekly ? usageNote(u.unavailable) : u.stale ? 'Son bilinen değer' : u.note || '';
        } catch (err) {
          c.col.classList.add('off');
          c.left = null;
          c.note.textContent = usageNote((err as Error)?.message);
        }
      }),
    );
    summary();
  }
  return { root, load };
}

/** v0.9.14: a provider's raw error ("codex account authentication required…") as a short line */
export function usageNote(raw: unknown, fallback = 'Veri bekleniyor') {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  if (/auth|sign.?in|log.?in|unauthori[sz]ed|forbidden|\b40[13]\b|token|credential/i.test(s)) return 'Giriş gerekli';
  if (/network|enotfound|econn|etimedout|timed? ?out|fetch failed|offline|socket/i.test(s)) return 'Bağlantı yok';
  // Charles' own (Turkish) messages are already short and translated
  if (/[çğıöşüÇĞİÖŞÜ]/.test(s) || s.length <= 24) return s.slice(0, 60);
  return fallback;
}
