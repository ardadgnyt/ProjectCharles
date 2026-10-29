// v0.7.7: cards that can be added to the app window's home page ("Kart ekle"):
// Hızlı komutlar, Notlar, Sistem kullanımı and Sistem bilgileri. None of them is on the page
// at first; dash-edit.ts places them. Notes and commands are kept in companion.json
// (main: workspace-dash); the system values are read locally (app/core/system-info.cjs).
import { el, icon, iconButton } from './icons';
import { shortSeconds } from '../settings/time-units';

export type ExtraDeps = {
  api: any;
  notice: (s: string) => void;
  ask: (text: string, fresh?: boolean) => Promise<void>;
  /** Saves part of the home page settings ({ notes } or { commands }). */
  save: (patch: any) => Promise<any>;
};

function shell(cls: string, ic: string, title: string, ...extra: (Node | null)[]) {
  const card = el('section', 'ws-card ws-dash ' + cls);
  const head = el('div', 'ws-card-head', el('span', 'ws-card-icon', icon(ic)), el('h2', '', title));
  for (const x of extra) if (x) head.append(x);
  card.append(head);
  return card;
}

const gb = (n: number) => (n / 1024 ** 3).toLocaleString(document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-GB', { maximumFractionDigits: n >= 100 * 1024 **3 ? 0 : 1 }) + ' GB';
// v0.9.10: in the UI language (settings/time-units.ts)
function duration(sec: number) {
  return shortSeconds(sec);
}

// ── Hızlı komutlar ───────────────────────────────────────────────────────────
const SUGGESTIONS: [string, string][] = [
  ['Günün özeti', 'Bugün için kısa bir özet çıkar: takvimim, hatırlatıcılarım ve önemli e-postalarım.'],
  ['E-postaları özetle', 'Son önemli e-postalarımı kısaca özetle.'],
  ['Yarının planı', 'Yarın takvimimde ve hatırlatıcılarımda neler var?'],
];
export function commandsCard(d: ExtraDeps) {
  let commands: { label: string; prompt: string }[] = [];
  let managing = false;
  const manageB = iconButton('pencil', 'Komutları düzenle', () => {
    managing = !managing;
    paint();
  });
  const card = shell('ws-commands', 'bolt', 'Hızlı komutlar', manageB);
  const grid = el('div', 'ws-cmd-grid');
  const form = el('form', 'ws-cmd-form');
  form.hidden = true;
  const label = el('input');
  label.placeholder = 'Düğme adı';
  label.maxLength = 40;
  const prompt = el('textarea');
  prompt.placeholder = 'Charles’a gönderilecek mesaj';
  prompt.maxLength = 2000;
  prompt.rows = 2;
  const cancel = el('button', '', 'Vazgeç');
  cancel.type = 'button';
  const ok = el('button', 'primary', 'Ekle');
  ok.type = 'submit';
  form.append(label, prompt, el('div', 'ws-rem-actions', cancel, ok));
  card.append(grid, form);
  let editing = -1;
  cancel.onclick = () => {
    form.hidden = true;
    editing = -1;
  };
  async function store(next: typeof commands) {
    commands = next;
    paint();
    try {
      const v = await d.save({ commands: next });
      if (v?.commands) commands = v.commands;
    } catch (e) {
      d.notice((e as Error).message);
    }
    paint();
  }
  function openForm(i = -1) {
    editing = i;
    form.hidden = false;
    label.value = i >= 0 ? commands[i].label : '';
    prompt.value = i >= 0 ? commands[i].prompt : '';
    ok.textContent = i >= 0 ? 'Kaydet' : 'Ekle';
    label.focus();
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const c = { label: label.value.trim(), prompt: prompt.value.trim() };
    if (!c.label || !c.prompt) return d.notice('Düğme adı ve mesaj gerekli.');
    const next = commands.slice();
    if (editing >= 0) next[editing] = c;
    else next.push(c);
    form.hidden = true;
    editing = -1;
    void store(next);
  };
  function paint() {
    manageB.classList.toggle('on', managing);
    grid.replaceChildren();
    commands.forEach((c, i) => {
      const run = el('button', 'ws-cmd', icon('bolt'), el('span', '', c.label));
      run.type = 'button';
      run.title = c.prompt;
      (run.lastChild as HTMLElement).translate = false;
      run.onclick = () => (managing ? openForm(i) : void d.ask(c.prompt, true));
      const wrap = el('div', 'ws-cmd-wrap', run);
      if (managing) wrap.append(iconButton('x', c.label + ' · kaldır', () => void store(commands.filter((_, j) => j !== i)), 'ws-icon ws-cmd-x'));
      grid.append(wrap);
    });
    if (commands.length < 12) {
      const add = el('button', 'ws-cmd ws-cmd-add', icon('plus'), el('span', '', 'Komut ekle'));
      add.type = 'button';
      add.onclick = () => openForm();
      grid.append(add);
    }
    if (!commands.length) {
      const chips = el('div', 'ws-cmd-suggest', el('small', '', 'Öneriler:'));
      for (const [l, p] of SUGGESTIONS) {
        const b = el('button', 'ws-chip', el('span', '', l));
        b.type = 'button';
        b.onclick = () => void store([...commands, { label: l, prompt: p }]);
        chips.append(b);
      }
      grid.append(chips);
    }
  }
  paint();
  return {
    element: card,
    set(v: any) {
      commands = Array.isArray(v?.commands) ? v.commands : [];
      paint();
    },
  };
}

// ── Notlar ──────────────────────────────────────────────────────────────────
export function notesCard(d: ExtraDeps) {
  const status = el('small', 'ws-notes-status', '');
  const card = shell('ws-notes', 'pencil', 'Notlar', status);
  const area = el('textarea', 'ws-notes-area');
  area.placeholder = 'Aklındakileri buraya yaz. Kendiliğinden kaydedilir.';
  area.maxLength = 20000;
  area.spellcheck = true;
  area.setAttribute('aria-label', 'Notlar');
  card.append(area);
  let timer = 0;
  let saved = '';
  const flush = async () => {
    window.clearTimeout(timer);
    timer = 0;
    if (area.value === saved) return;
    const text = area.value;
    try {
      await d.save({ notes: text });
      saved = text;
      status.textContent = 'Kaydedildi';
    } catch (e) {
      status.textContent = '';
      d.notice((e as Error).message);
    }
  };
  area.oninput = () => {
    status.textContent = 'Yazılıyor…';
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), 700);
  };
  area.onblur = () => void flush();
  return {
    element: card,
    set(v: any) {
      if (document.activeElement === area) return;
      saved = typeof v?.notes === 'string' ? v.notes : '';
      area.value = saved;
      status.textContent = '';
    },
    flush,
  };
}

// ── Sistem kullanımı ────────────────────────────────────────────────────────
export function systemUsageCard(d: ExtraDeps) {
  const card = shell('ws-sysusage', 'chart', 'Sistem kullanımı');
  const meter = (name: string, ic: string) => {
    const fill = el('i');
    const value = el('strong', 'ws-sysm-value', '—');
    const sub = el('small', 'ws-sysm-sub', '');
    const row = el('div', 'ws-sysm', el('span', 'ws-sysm-icon', icon(ic)), el('span', 'ws-sysm-name', name), value, el('div', 'ws-sysm-bar', fill), sub);
    return { row, fill, value, sub };
  };
  const cpu = meter('İşlemci', 'bolt');
  const ram = meter('Bellek', 'chart');
  const disk = meter('Disk', 'folder');
  const charles = el('small', 'ws-sys-foot', '');
  card.append(el('div', 'ws-sysms', cpu.row, ram.row, disk.row), charles);
  const set = (m: ReturnType<typeof meter>, pct: number, sub: string) => {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    m.fill.style.width = p + '%';
    m.row.classList.toggle('high', p >= 85);
    m.value.textContent = '%' + p;
    m.sub.textContent = sub;
  };
  let timer = 0;
  let busy = false;
  async function read() {
    if (busy) return;
    busy = true;
    try {
      const u = await d.api.systemUsage();
      set(cpu, u.cpu, u.cores + ' çekirdek');
      set(ram, (u.memory.used / u.memory.total) * 100, gb(u.memory.used) + ' / ' + gb(u.memory.total));
      if (u.disk) set(disk, ((u.disk.total - u.disk.free) / u.disk.total) * 100, gb(u.disk.free) + ' boş · ' + u.disk.root.replace(/\\$/, ''));
      else disk.row.hidden = true;
      charles.replaceChildren(el('span', '', 'Charles'), ' ' + gb(u.charlesMemory || 0) + ' · ', el('span', '', 'Açık kalma süresi'), ' ' + duration(u.uptime));
    } catch {
      charles.textContent = '';
    } finally {
      busy = false;
    }
  }
  return {
    element: card,
    start() {
      if (timer) return;
      void read();
      timer = window.setInterval(() => void read(), 3000);
    },
    stop() {
      window.clearInterval(timer);
      timer = 0;
    },
  };
}

// ── Sistem bilgileri ────────────────────────────────────────────────────────
export function systemInfoCard(d: ExtraDeps) {
  const copyB = iconButton('copy', 'Bilgileri kopyala', () => void copy());
  const card = shell('ws-sysinfo', 'window', 'Sistem bilgileri', copyB);
  const list = el('dl', 'ws-info');
  card.append(list);
  let lines: string[] = [];
  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      copyB.classList.add('on');
      window.setTimeout(() => copyB.classList.remove('on'), 1200);
    } catch {}
  }
  async function load() {
    try {
      const v = await d.api.systemInfo();
      const rows: [string, string][] = [
        ['İşletim sistemi', v.os + (v.build ? ' (' + v.build + ')' : '')],
        ['İşlemci', v.cpu + ' · ' + v.cores + ' çekirdek'],
        ['Bellek', gb(v.memory)],
        ['Mimari', v.arch],
        ['Bilgisayar adı', v.computer],
        ['Ekran', `${screen.width} × ${screen.height} · %${Math.round(devicePixelRatio * 100)}`],
        ['Açık kalma süresi', duration(v.uptime)],
        ['Charles', v.charles],
        ['Electron · Node', v.electron + ' · ' + v.node],
      ];
      lines = rows.map(([k, x]) => k + ': ' + x);
      list.replaceChildren(
        ...rows.flatMap(([k, x]) => {
          const dd = el('dd', '', x);
          dd.translate = k !== 'Bilgisayar adı' && k !== 'Charles' && k !== 'Electron · Node';
          return [el('dt', '', k), dd];
        }),
      );
    } catch (e) {
      list.replaceChildren(el('p', 'ws-empty', (e as Error).message));
    }
  }
  return { element: card, load };
}
