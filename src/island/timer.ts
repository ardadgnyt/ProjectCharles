// v0.9.14: Araçlar → Zamanlayıcı. Three modes: Odak (focus sessions; when one ends Charles asks
// how long the break should be, like the Study module), Geri sayım and Kronometre. The time is kept as an end time (not a counter), so a busy
// page or a sleeping PC never makes it drift. Settings and a running timer are kept in this
// page's storage; the closed island shows the timer (src/island/shelf.ts → notch).
import { el, icon } from '../workspace/icons';
import { Sound } from '../vendor/core/sound';

export type Mode = 'focus' | 'break' | 'countdown' | 'stopwatch';
export type Finished = { mode: Mode; title: string; sub: string; action: string; next: Mode | null };
export type TimerInfo = {
  mode: Mode;
  running: boolean;
  paused: boolean;
  /** ms left (countdowns) or elapsed (stopwatch) */
  ms: number;
  total: number;
  label: string;
  text: string;
  finished: Finished | null;
};

const MODES: [Mode, string][] = [
  ['focus', 'Odak'],
  ['countdown', 'Geri sayım'],
  ['stopwatch', 'Kronometre'],
];
/** the break is part of Odak (no tab of its own) */
const tabOf = (m: Mode): Mode => (m === 'break' ? 'focus' : m);
const BREAKS = [5, 10, 15, 20, 30];
const LABEL: Record<Mode, string> = { focus: 'ODAK', break: 'MOLA', countdown: 'GERİ SAYIM', stopwatch: 'KRONOMETRE' };
// the break length is chosen beside the focus length (and asked again when focus ends)
const CHIPS: Record<Exclude<Mode, 'stopwatch'>, number[]> = { focus: [25, 50, 90], break: [5, 10, 15], countdown: [1, 5, 10, 30] };
const KEY = 'charles-timer';
const SESSIONS = 4;
const RING = 2 * Math.PI * 54;

/** 24:12 · 1:05:09 */
export function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
}

type Saved = {
  mode: Mode;
  minutes: Record<Exclude<Mode, 'stopwatch'>, number>;
  sound: boolean;
  quiet: boolean;
  task: string;
  label: string;
  cycle: number;
  run: null | { mode: Mode; endAt?: number; left?: number; total: number; startAt?: number; elapsed?: number; laps?: number[] };
  finished: Finished | null;
};
const DEFAULTS: Saved = { mode: 'focus', minutes: { focus: 50, break: 10, countdown: 5 }, sound: true, quiet: true, task: '', label: '', cycle: 0, run: null, finished: null };

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || typeof v !== 'object') return structuredClone(DEFAULTS);
    const m = { ...DEFAULTS.minutes };
    for (const k of Object.keys(m) as (keyof typeof m)[]) if (Number.isFinite(v.minutes?.[k]) && v.minutes[k] >= 1 && v.minutes[k] <= 600) m[k] = Math.round(v.minutes[k]);
    return {
      ...DEFAULTS,
      mode: MODES.some(([id]) => id === v.mode) ? v.mode : 'focus',
      minutes: m,
      sound: v.sound !== false,
      quiet: v.quiet !== false,
      task: String(v.task || '').slice(0, 120),
      label: String(v.label || '').slice(0, 120),
      cycle: Math.max(0, Math.min(SESSIONS - 1, Number(v.cycle) || 0)),
      run: v.run && ['focus', 'break', 'countdown', 'stopwatch'].includes(v.run.mode) ? v.run : null,
      finished: v.finished || null,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

type Deps = { api: any; onChange: (info: TimerInfo) => void };

export function timerTool({ api, onChange }: Deps) {
  const st = load();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {}
  };
  const root = el('div', 'tm13');
  root.dataset.kind = 'timer';

  // the mode pills (the panel header shows them at the top right)
  const tabs = el('div', 'tm13-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabButtons = MODES.map(([id, text]) => {
    const b = el('button', 'tm13-tab', text);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.mode = id;
    b.onclick = () => {
      if (busy() || st.mode === id) return;
      st.mode = id;
      save();
      paint(true);
    };
    return b;
  });
  tabs.append(...tabButtons);

  // the ring
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<circle class="track" cx="60" cy="60" r="54"/><circle class="value" cx="60" cy="60" r="54" transform="rotate(-90 60 60)" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="0"/>`;
  const ringValue = svg.querySelector('circle.value') as SVGCircleElement;
  const ringLabel = el('small', 'tm13-ring-label');
  const ringTime = el('strong', 'tm13-ring-time', '00:00');
  const ringSub = el('small', 'tm13-ring-sub');
  const ring = el('div', 'tm13-ring', svg, el('span', 'tm13-ring-text', ringLabel, ringTime, ringSub));
  ring.setAttribute('role', 'timer');

  // the middle: task / label, durations, sessions or laps
  const taskInput = el('input', 'tm13-task-input') as HTMLInputElement;
  taskInput.maxLength = 120;
  const taskTag = el('small', 'tm13-task-tag');
  const task = el('label', 'tm13-task', icon('task'), taskInput, taskTag);
  taskInput.addEventListener('input', () => {
    if (st.mode === 'countdown') st.label = taskInput.value;
    else st.task = taskInput.value;
    save();
    emit();
  });
  const chips = el('div', 'tm13-chips');
  const durations = el('div', 'tm13-durations', el('small', 'tm13-key', 'Süre'), chips);
  const breakChips = el('div', 'tm13-chips');
  const breaks = el('div', 'tm13-durations tm13-breaks', el('small', 'tm13-key', 'Mola'), breakChips);
  const sessions = el('div', 'tm13-sessions');
  const laps = el('div', 'tm13-laps');
  // a focus session or a break just ended: how long the break should be / focus again
  const doneBox = el('div', 'tm13-done');
  const middle = el('div', 'tm13-middle', doneBox, task, durations, breaks, sessions, laps);

  // the right: reset, start / pause, switches
  const resetB = el('button', 'tm13-reset', icon('reset'), el('span', '', 'Sıfırla'));
  resetB.type = 'button';
  resetB.onclick = () => reset();
  const goB = el('button', 'tm13-go');
  goB.type = 'button';
  goB.onclick = () => toggle();
  const lapB = el('button', 'tm13-reset tm13-lap', icon('timer'), el('span', '', 'Tur'));
  lapB.type = 'button';
  lapB.onclick = () => lap();
  const toggleRow = (text: string, key: 'sound' | 'quiet') => {
    const sw = el('button', 'tm13-switch', el('i'));
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', text);
    sw.onclick = () => {
      st[key] = !st[key];
      save();
      paint();
      syncQuiet();
    };
    return { row: el('div', 'tm13-option', el('span', '', text), sw), sw };
  };
  const soundT = toggleRow('Bitince ses çal', 'sound');
  const quietT = toggleRow('Bildirimleri sustur', 'quiet');
  const skipB = el('button', 'tm13-skip', 'Molayı atla');
  skipB.type = 'button';
  skipB.onclick = () => {
    st.finished = null;
    st.mode = 'focus';
    start();
    paint(true);
    syncQuiet();
  };
  const buttons = el('div', 'tm13-buttons', resetB, lapB, goB);
  const right = el('div', 'tm13-right', buttons, skipB, soundT.row, quietT.row);
  root.append(ring, middle, right);

  // ── state ──────────────────────────────────────────────────────────────────
  const run = () => st.run;
  const busy = () => !!st.run;
  const totalFor = (m: Mode) => (m === 'stopwatch' ? 0 : st.minutes[m] * 60000);
  function ms(now = Date.now()) {
    const r = st.run;
    if (!r) return st.mode === 'stopwatch' ? 0 : totalFor(st.mode);
    if (r.mode === 'stopwatch') return (r.elapsed || 0) + (r.startAt ? now - r.startAt : 0);
    return r.endAt ? Math.max(0, r.endAt - now) : r.left ?? r.total;
  }
  const running = () => !!st.run && (st.run.mode === 'stopwatch' ? !!st.run.startAt : !!st.run.endAt);
  function info(): TimerInfo {
    const r = st.run;
    const mode = r?.mode || st.mode;
    const left = ms();
    const label = mode === 'focus' ? st.task : mode === 'countdown' ? st.label : '';
    const text = mode === 'stopwatch' ? clock(left) : clock(left);
    return { mode, running: running(), paused: !!r && !running(), ms: left, total: r?.total || totalFor(mode), label, text, finished: st.finished };
  }
  function start() {
    st.finished = null;
    const now = Date.now();
    if (st.mode === 'stopwatch') st.run = { mode: 'stopwatch', startAt: now, elapsed: 0, total: 0, laps: [] };
    else {
      const total = totalFor(st.mode);
      st.run = { mode: st.mode, endAt: now + total, total };
    }
    save();
  }
  function toggle() {
    if (!st.run && st.finished) return next();
    const r = st.run;
    const now = Date.now();
    if (!r) start();
    else if (r.mode === 'stopwatch') {
      if (r.startAt) {
        r.elapsed = (r.elapsed || 0) + now - r.startAt;
        delete r.startAt;
      } else r.startAt = now;
    } else if (r.endAt) {
      r.left = Math.max(0, r.endAt - now);
      delete r.endAt;
    } else r.endAt = now + (r.left ?? r.total);
    save();
    paint();
    syncQuiet();
    tickNow();
  }
  function reset() {
    const ending = st.finished || st.run;
    st.run = null;
    st.finished = null;
    if (st.mode === 'focus' && !ending) st.cycle = 0;
    save();
    paint();
    syncQuiet();
    emit();
  }
  function lap() {
    const r = st.run;
    if (r?.mode !== 'stopwatch' || !r.startAt) return;
    r.laps = [ms(), ...(r.laps || [])].slice(0, 20);
    save();
    paint();
  }
  function finish() {
    const r = st.run!;
    st.run = null;
    if (r.mode === 'focus') {
      st.cycle = (st.cycle + 1) % SESSIONS;
      st.finished = { mode: 'focus', title: 'Odak bitti!', sub: `Sırada ${st.minutes.break} dk mola`, action: 'Molaya başla', next: 'break' };
    } else if (r.mode === 'break') {
      st.finished = { mode: 'break', title: 'Mola bitti!', sub: `Tekrar odaklan · ${st.minutes.focus} dk`, action: 'Odaklan', next: 'focus' };
    } else {
      st.finished = { mode: 'countdown', title: 'Süre doldu!', sub: st.label || `${Math.round(r.total / 60000)} dk geri sayım`, action: 'Tamam', next: null };
    }
    save();
    if (st.sound) {
      Sound.play('finish');
      window.setTimeout(() => Sound.play('finish'), 900);
    }
    paint();
    syncQuiet();
  }
  /** The notch's button after a timer ended: start the next part (or just close it). */
  function next() {
    const f = st.finished;
    if (!f) return;
    st.finished = null;
    if (f?.next) {
      st.mode = tabOf(f.next);
      if (f.next === 'break') {
        const total = st.minutes.break * 60000;
        st.run = { mode: 'break', endAt: Date.now() + total, total };
      } else start();
    }
    save();
    paint(true);
    syncQuiet();
    tickNow();
  }
  function dismiss() {
    st.finished = null;
    save();
    paint();
  }
  let quietSent: boolean | null = null;
  function syncQuiet() {
    const on = running() && st.run?.mode === 'focus' && st.quiet;
    document.body.classList.toggle('focus-quiet', on);
    if (on === quietSent) return;
    quietSent = on;
    void Promise.resolve(api.focusQuiet?.(on)).catch(() => {});
  }

  // ── paint ──────────────────────────────────────────────────────────────────
  function chipButton(m: Exclude<Mode, 'stopwatch'>, n: number | null) {
    const custom = n === null;
    const value = st.minutes[m];
    const on = custom ? !CHIPS[m].includes(value) : value === n;
    const b = el('button', 'tm13-chip' + (on ? ' on' : ''), custom ? (on ? `${value} dk` : 'Özel süre') : `${n} dk`);
    b.type = 'button';
    // the break can still be changed while focusing (it comes after)
    b.disabled = busy() && !(m === 'break' && st.run?.mode === 'focus');
    b.onclick = () => {
      if (!custom) {
        st.minutes[m] = n!;
        save();
        paint();
        return;
      }
      const input = el('input', 'tm13-chip tm13-chip-input') as HTMLInputElement;
      input.type = 'number';
      input.min = '1';
      input.max = '600';
      input.value = String(value);
      input.setAttribute('aria-label', 'Dakika');
      b.replaceWith(input);
      input.focus();
      const done = (ok: boolean) => {
        const v = Math.round(Number(input.value));
        if (ok && v >= 1 && v <= 600) st.minutes[m] = v;
        save();
        paint();
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      };
      input.onblur = () => done(true);
    };
    return b;
  }
  function paint(modeChanged = false) {
    const r = st.run;
    const f = !r ? st.finished : null;
    const mode: Mode = r?.mode || (f?.mode === 'break' ? 'break' : st.mode);
    root.dataset.mode = mode;
    root.classList.toggle('finished', !!f);
    for (const b of tabButtons) {
      const on = b.dataset.mode === tabOf(mode);
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.disabled = busy() && !on;
      b.title = busy() && !on ? 'Önce zamanlayıcıyı sıfırla' : '';
    }
    ringLabel.textContent = LABEL[mode];
    // middle
    doneBox.hidden = !f;
    if (f && f.mode === 'focus') f.sub = `Sırada ${st.minutes.break} dk mola`;
    if (f && f.mode === 'focus') {
      const chipsB = el('div', 'tm13-chips');
      const custom = !BREAKS.includes(st.minutes.break);
      for (const n of [...BREAKS, 0]) {
        const isCustom = n === 0;
        const b = el('button', 'tm13-chip' + ((isCustom ? custom : st.minutes.break === n) ? ' on' : ''), isCustom ? (custom ? `${st.minutes.break} dk` : 'Özel süre') : `${n} dk`);
        b.type = 'button';
        b.onclick = () => {
          if (!isCustom) {
            st.minutes.break = n;
            save();
            paint();
            return;
          }
          const input = el('input', 'tm13-chip tm13-chip-input') as HTMLInputElement;
          input.type = 'number';
          input.min = '1';
          input.max = '120';
          input.value = String(st.minutes.break);
          b.replaceWith(input);
          input.focus();
          const done = () => {
            const v = Math.round(Number(input.value));
            if (v >= 1 && v <= 120) st.minutes.break = v;
            save();
            paint();
          };
          input.onkeydown = (e) => e.key === 'Enter' && done();
          input.onblur = done;
        };
        chipsB.append(b);
      }
      doneBox.replaceChildren(el('strong', 'tm13-done-title', f.title), el('small', 'tm13-next', 'Ne kadar mola vereceksin?'), chipsB);
    } else if (f) doneBox.replaceChildren(el('strong', 'tm13-done-title', f.title), el('small', 'tm13-next', f.mode === 'break' ? 'Tekrar odaklanmaya hazır mısın?' : f.sub));
    task.hidden = !!f || mode === 'break' || mode === 'stopwatch';
    taskInput.placeholder = mode === 'countdown' ? 'Ne için? (isteğe bağlı)' : 'Ne üzerinde çalışıyorsun?';
    taskTag.textContent = mode === 'countdown' ? 'Etiket' : 'Görev';
    if (document.activeElement !== taskInput || modeChanged) taskInput.value = mode === 'countdown' ? st.label : st.task;
    durations.hidden = !!f || mode === 'stopwatch' || mode === 'break';
    if (mode !== 'stopwatch' && mode !== 'break') chips.replaceChildren(...CHIPS[mode].map((n) => chipButton(mode, n)), chipButton(mode, null));
    breaks.hidden = !!f || mode !== 'focus';
    if (mode === 'focus') breakChips.replaceChildren(...CHIPS.break.map((n) => chipButton('break', n)), chipButton('break', null));
    sessions.hidden = (!!f && f.mode !== 'focus') || mode === 'stopwatch' || mode === 'countdown';
    if (mode === 'focus') {
      const dots = el('span', 'tm13-dots');
      for (let i = 0; i < SESSIONS; i++) dots.append(el('i', i < st.cycle ? 'done' : i === st.cycle ? 'now' : ''));
      sessions.replaceChildren(el('small', 'tm13-key', `Oturum ${st.cycle + 1}/${SESSIONS}`), dots, el('small', 'tm13-next', `Sonra ${st.minutes.break} dk mola`));
    } else if (mode === 'break') sessions.replaceChildren(el('small', 'tm13-next', `Moladan sonra ${st.minutes.focus} dk odak`));
    else sessions.replaceChildren();
    laps.hidden = mode !== 'stopwatch';
    if (mode === 'stopwatch') {
      const list = r?.laps || [];
      laps.replaceChildren(
        ...(list.length
          ? list.slice(0, 6).map((t, i) => el('span', 'tm13-lap-row', el('small', '', `Tur ${list.length - i}`), el('b', '', clock(t))))
          : [el('small', 'tm13-next', 'Tur ile ara süreleri kaydet')]),
      );
    }
    // right
    const on = running();
    goB.replaceChildren(icon(on ? 'pause' : 'play'), el('span', '', on ? 'Duraklat' : r ? 'Devam et' : f ? (f.next === 'break' ? 'Molaya başla' : f.next === 'focus' ? 'Odaklan' : 'Tamam') : 'Başlat'));
    resetB.lastElementChild!.textContent = f ? (f.next === 'focus' ? 'Sonra' : 'Bitir') : 'Sıfırla';
    skipB.hidden = !(f && f.next === 'break');
    goB.classList.toggle('on', on);
    lapB.hidden = mode !== 'stopwatch';
    lapB.disabled = !on;
    resetB.disabled = !r && !st.finished && !(mode === 'focus' && st.cycle);
    soundT.sw.setAttribute('aria-checked', String(st.sound));
    soundT.sw.classList.toggle('on', st.sound);
    soundT.row.hidden = mode === 'stopwatch';
    quietT.sw.setAttribute('aria-checked', String(st.quiet));
    quietT.sw.classList.toggle('on', st.quiet);
    quietT.row.hidden = tabOf(mode) !== 'focus';
    tickNow();
  }
  let lastText = '';
  function tickNow() {
    const r = st.run;
    const mode = r?.mode || st.mode;
    const ended = !r && !!st.finished;
    const left = ended ? 0 : ms();
    if (r && r.mode !== 'stopwatch' && r.endAt && left <= 0) return finish();
    ringTime.textContent = clock(left);
    ringLabel.textContent = LABEL[ended && st.finished!.mode === 'break' ? 'break' : r?.mode || st.mode];
    const total = r?.total || totalFor(mode);
    const frac = ended ? 0 : mode === 'stopwatch' ? (left % 60000) / 60000 : total ? left / total : 1;
    ringValue.setAttribute('stroke-dashoffset', (RING * (1 - frac)).toFixed(1));
    ringSub.textContent =
      st.finished && !r ? st.finished.title : r && !running() ? 'Duraklatıldı' : mode === 'stopwatch' ? (r ? 'Çalışıyor' : 'Hazır') : `${Math.round(total / 60000)} dk'dan`;
    ring.classList.toggle('paused', !!r && !running());
    const text = ringTime.textContent + ringSub.textContent + String(running()) + String(!!st.finished);
    if (text !== lastText) {
      lastText = text;
      emit();
    }
  }
  function emit() {
    onChange(info());
  }
  window.setInterval(() => {
    if (st.run) tickNow();
  }, 250);

  paint(true);
  syncQuiet();
  return { root, tabs, toggle, next, dismiss, reset, info, open: () => paint() };
}
export type TimerTool = ReturnType<typeof timerTool>;
