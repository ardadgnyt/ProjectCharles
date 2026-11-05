// v0.9.18: Araçlar → Sistem izleyici. CPU, GPU and RAM side by side; the sampling itself lives in
// app/system/live-metrics.cjs and runs only while this view is on screen (IntersectionObserver).
import { el, icon } from '../workspace/icons';
import { t } from '../settings/i18n';

type Stat = 'current' | 'average' | 'peak';
type Point = { t: number; v: number | null };
type Metric = { series: Point[]; stats: { current: number | null; average: number | null; peak: number | null; peakAt: number | null; count: number; spanMs: number } };
const NO_DATA = 'Veri alınamıyor';
const STAT_NAMES: Record<Stat, string> = { current: 'Anlık', average: 'Ortalama', peak: 'En yüksek' };
const RANGES: [string, string, string][] = [
  ['1m', '1 dk', '60 sn önce'],
  ['5m', '5 dk', '5 dk önce'],
  ['1h', '1 sa', '1 sa önce'],
];
const COLORS = { cpu: '#edc9a9', gpu: '#5fd8a4', ram: '#7da7f2' };

const turkish = () => (document.documentElement.lang || 'tr') === 'tr';
const percent = (v: number) => (turkish() ? '%' + v : v + '%');
const pct = (v: number | null | undefined) => (typeof v === 'number' ? percent(Math.round(v)) : '—');
const gb = (bytes: number | null | undefined, digits = 1) => (typeof bytes === 'number' ? (bytes / 1073741824).toFixed(digits).replace('.', ',') : null);
const bytesText = (v: number) => (v >= 1073741824 ? gb(v) + ' GB' : Math.round(v / 1048576) + ' MB');

function segment(items: [string, string][], pick: (id: string) => void) {
  const box = el('div', 'sm-seg');
  const buttons = items.map(([id, label]) => {
    const b = el('button', 'sm-seg-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.id = id;
    b.onclick = () => pick(id);
    return b;
  });
  box.append(...buttons);
  return { box, set: (id: string) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id))) };
}

function chart(color: string) {
  const canvas = el('canvas', 'sm-chart') as HTMLCanvasElement;
  canvas.setAttribute('role', 'img');
  let last: { m: Metric; now: number; rangeMs: number; stat: Stat } | null = null;
  function draw() {
    const box = canvas.getBoundingClientRect();
    if (!last || !box.width || !box.height) return;
    const scale = window.devicePixelRatio || 1;
    const w = Math.round(box.width * scale);
    const h = Math.round(box.height * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const x = canvas.getContext('2d')!;
    x.setTransform(scale, 0, 0, scale, 0, 0);
    x.clearRect(0, 0, box.width, box.height);
    const { m, now, rangeMs, stat } = last;
    const pad = { top: 22, bottom: 4 };
    const plot = box.height - pad.top - pad.bottom;
    const X = (t: number) => box.width * (1 - (now - t) / rangeMs);
    const Y = (v: number) => pad.top + plot * (1 - v / 100);
    // the 0–100 axis
    x.font = '10px "Segoe UI", sans-serif';
    x.textBaseline = 'middle';
    x.setLineDash([2, 4]);
    x.lineWidth = 1;
    for (const v of [0, 50, 100]) {
      x.strokeStyle = 'rgba(255,255,255,.1)';
      x.beginPath();
      x.moveTo(0, Y(v) + 0.5);
      x.lineTo(box.width, Y(v) + 0.5);
      x.stroke();
      x.fillStyle = 'rgba(245,238,229,.38)';
      x.fillText(percent(v), 2, Y(v) - (v === 0 ? 7 : -7));
    }
    x.setLineDash([]);
    // each unbroken run of samples is its own line and area
    const runs: Point[][] = [];
    let run: Point[] = [];
    for (const p of m.series) {
      if (p.v === null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(p);
    }
    if (run.length) runs.push(run);
    const fill = x.createLinearGradient(0, pad.top, 0, box.height);
    fill.addColorStop(0, color + '44');
    fill.addColorStop(1, color + '00');
    for (const r of runs) {
      x.beginPath();
      r.forEach((p, i) => (i ? x.lineTo(X(p.t), Y(p.v!)) : x.moveTo(X(p.t), Y(p.v!))));
      x.strokeStyle = color;
      x.lineWidth = 1.8;
      x.lineJoin = 'round';
      x.stroke();
      if (r.length > 1) {
        x.lineTo(X(r[r.length - 1].t), box.height);
        x.lineTo(X(r[0].t), box.height);
        x.closePath();
        x.fillStyle = fill;
        x.fill();
      }
    }
    const end = runs.at(-1)?.at(-1);
    const pill = (text: string, cx: number, cy: number, solid: boolean) => {
      x.font = '600 11px "Segoe UI", sans-serif';
      const width = x.measureText(text).width + 16;
      const left = Math.max(0, Math.min(box.width - width, cx - width / 2));
      x.beginPath();
      x.roundRect(left, cy, width, 18, 6);
      x.fillStyle = solid ? color : '#1a1917';
      x.fill();
      x.strokeStyle = color + '88';
      x.lineWidth = 1;
      x.stroke();
      x.fillStyle = solid ? '#161513' : color;
      x.textBaseline = 'middle';
      x.textAlign = 'center';
      x.fillText(text, left + width / 2, cy + 9.5);
      x.textAlign = 'left';
    };
    if (stat === 'current' && end) {
      x.beginPath();
      x.arc(Math.min(box.width - 4, X(end.t)), Y(end.v!), 3.2, 0, Math.PI * 2);
      x.fillStyle = color;
      x.fill();
    } else if (stat === 'average' && m.stats.average !== null) {
      const y = Y(m.stats.average);
      x.setLineDash([5, 4]);
      x.strokeStyle = '#f5eee5';
      x.lineWidth = 1.2;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(box.width, y);
      x.stroke();
      x.setLineDash([]);
      pill(t('ort') + ' ' + pct(m.stats.average), box.width - 36, Math.max(0, y - 24), false);
    } else if (stat === 'peak' && m.stats.peak !== null && m.stats.peakAt !== null) {
      const px = X(m.stats.peakAt);
      x.setLineDash([2, 3]);
      x.strokeStyle = color + 'aa';
      x.beginPath();
      x.moveTo(px, Y(m.stats.peak));
      x.lineTo(px, box.height);
      x.stroke();
      x.setLineDash([]);
      pill(t('tepe') + ' ' + pct(m.stats.peak), px, Math.max(0, Y(m.stats.peak) - 24), true);
    }
  }
  return {
    canvas,
    draw,
    paint(m: Metric, now: number, rangeMs: number, stat: Stat, label: string) {
      last = { m, now, rangeMs, stat };
      canvas.setAttribute('aria-label', label);
      draw();
    },
  };
}

function card(kind: 'cpu' | 'gpu' | 'ram', title: string, glyph: string) {
  const name = el('strong', 'sm-name', title);
  const sub = el('small', 'sm-sub');
  sub.translate = false;
  const statLabel = el('small', 'sm-stat-label');
  const value = el('strong', 'sm-value');
  const c = chart(COLORS[kind]);
  const from = el('small', 'sm-axis');
  const others = el('div', 'sm-others');
  const details = el('div', 'sm-details');
  const head = el(
    'div',
    'sm-card-head',
    el('span', 'sm-icon', icon(glyph)),
    el('span', 'sm-title', el('span', 'sm-title-row', el('i', 'sm-dot'), name), sub),
    el('span', 'sm-reading', statLabel, value),
  );
  const root = el('section', 'sm-card sm-' + kind, head, c.canvas, el('div', 'sm-time', from, el('small', 'sm-axis', 'şimdi')), others, details);
  return { root, sub, statLabel, value, chart: c, from, others, details };
}

export function systemMonitor(api: any) {
  let stat: Stat = 'current';
  let view: any = null;
  let timerSeen = false;
  const stats = segment(Object.entries(STAT_NAMES) as [string, string][], (id) => {
    stat = id as Stat;
    stats.set(id);
    if (view) paint(view);
  });
  const ranges = segment(RANGES.map(([id, label]) => [id, label]), (id) => void api.metricsSelect({ range: id }).then(paint));
  const pause = el('button', 'sm-pill', icon('pause'), el('span', '', 'Duraklat')) as HTMLButtonElement;
  pause.type = 'button';
  pause.onclick = () => void api.metricsPause(!view?.paused).then(paint);
  const reset = el('button', 'sm-pill', icon('refresh')) as HTMLButtonElement;
  reset.setAttribute('aria-label', 'Sıfırla');
  reset.type = 'button';
  reset.title = 'Grafik geçmişini sil';
  reset.onclick = () => void api.metricsReset().then(paint);
  const action = el('span', 'sm-actions', stats.box, ranges.box, pause, reset);
  const cpu = card('cpu', 'CPU', 'cpu');
  const gpu = card('gpu', 'GPU', 'gpu');
  const ram = card('ram', 'RAM', 'ram');
  const pick = el('select', 'sm-gpu-pick') as HTMLSelectElement;
  pick.setAttribute('aria-label', 'İzlenen GPU');
  pick.onchange = () => void api.metricsSelect({ gpu: pick.value }).then(paint);
  const background = el('input', 'sm-bg') as HTMLInputElement;
  background.type = 'checkbox';
  background.onchange = () => void api.metricsBackground(background.checked).then(paint);
  const backgroundLabel = el('label', 'sm-bg-label', background, 'Arka planda ölç');
  const topRow = el('div', 'sm-top');
  const scope = el('small', 'sm-scope');
  const foot = el('div', 'sm-foot', topRow, el('span', 'sm-foot-end', backgroundLabel, scope));
  const root = el('div', 'sm-root', el('div', 'sm-grid', cpu.root, gpu.root, ram.root), foot);
  const pair = (label: string, value: string | null) => {
    const b = el('b', '', value ?? t(NO_DATA));
    if (value === null) b.classList.add('sm-none');
    return el('span', 'sm-pair', el('small', '', label), b);
  };
  function reading(c: ReturnType<typeof card>, m: Metric, rangeMs: number, text: string, from: string, summary: string) {
    const stats = m.stats;
    const value = stat === 'current' ? stats.current : stat === 'average' ? stats.average : stats.peak;
    c.statLabel.textContent = t(STAT_NAMES[stat]);
    c.value.textContent = stats.count ? pct(value) : t(NO_DATA);
    c.value.classList.toggle('sm-none', !stats.count);
    c.chart.paint(m, view.now, rangeMs, stat, summary + ': ' + pct(value));
    c.from.textContent = from;
    const rest = (Object.keys(STAT_NAMES) as Stat[]).filter((k) => k !== stat);
    c.others.replaceChildren(...rest.map((k) => el('span', '', el('i', '', t(STAT_NAMES[k])), el('b', '', pct(k === 'current' ? stats.current : k === 'average' ? stats.average : stats.peak)))));
    c.sub.textContent = text;
  }
  function paint(v: any) {
    view = v;
    ranges.set(v.range);
    pause.replaceChildren(icon(v.paused ? 'play' : 'pause'), el('span', '', v.paused ? 'Devam et' : 'Duraklat'));
    const base = RANGES.find(([id]) => id === v.range)![2];
    // a range not yet filled says how much was really measured
    const seconds = Math.round(v.cpu.stats.spanMs / 1000);
    const from = v.cpu.stats.count && v.cpu.stats.spanMs < v.rangeMs * 0.97 ? t('son') + ' ' + seconds + ' ' + t('sn') + ' · ' + t(base) : t(base);
    reading(cpu, v.cpu, v.rangeMs, v.cpu.name, from, 'CPU');
    reading(gpu, v.gpu, v.rangeMs, v.gpu.name || t(NO_DATA), from, 'GPU');
    reading(ram, v.ram, v.rangeMs, [v.ram.kind, gb(v.ram.total, 0) + ' GB'].filter(Boolean).join(' · '), from, 'RAM');
    cpu.details.replaceChildren(
      pair('Sıcaklık', null),
      pair('Hız', typeof v.cpu.ghz === 'number' ? v.cpu.ghz.toFixed(1).replace('.', ',') + ' GHz' : null),
      pair('Çekirdek', v.cpu.cores ? v.cpu.cores + ' / ' + v.cpu.threads : String(v.cpu.threads)),
    );
    gpu.details.replaceChildren(
      pair('Sıcaklık', typeof v.gpu.temp === 'number' ? Math.round(v.gpu.temp) + '°C' : null),
      pair('VRAM', typeof v.gpu.vramUsed === 'number' && v.gpu.vramTotal ? gb(v.gpu.vramUsed) + ' / ' + gb(v.gpu.vramTotal, 0) + ' GB' : null),
      pair('Güç', typeof v.gpu.power === 'number' ? percent(Math.round(v.gpu.power)) : null),
    );
    const used = v.ram.total - v.ram.free;
    ram.details.replaceChildren(
      pair('Kullanılan', gb(used) + ' / ' + gb(v.ram.total, 0) + ' GB'),
      pair('Boş', gb(v.ram.free) + ' GB'),
      pair('Önbellek', typeof v.ram.cache === 'number' ? gb(v.ram.cache) + ' GB' : null),
    );
    if (v.gpus.length > 1) {
      if (pick.options.length !== v.gpus.length) pick.replaceChildren(...v.gpus.map((g: any) => new Option(g.name, g.id)));
      pick.value = v.gpuId;
      if (!pick.isConnected) gpu.sub.after(pick);
    } else pick.remove();
    topRow.replaceChildren(
      el('small', 'sm-top-title', 'En çok kullanan'),
      ...v.top.slice(0, 3).map((p: any) => {
        const name = el('b', '', /^(charles-host|electron$)/i.test(p.name) ? 'Charles' : p.name);
        name.translate = false;
        return el('span', 'sm-top-item', name, ' CPU ' + pct(p.cpu) + ' · RAM ' + bytesText(p.ram));
      }),
    );
    background.checked = !!v.background;
    scope.textContent = v.error || (v.paused ? 'Duraklatıldı' : v.background ? 'Açıkken 1 sn, arka planda 5 sn · son 1 saat bellekte' : 'Yalnızca bu ekran açıkken ölçülür');
  }
  stats.set(stat);
  api.onMetrics?.((v: any) => paint(v));
  new ResizeObserver(() => {
    cpu.chart.draw();
    gpu.chart.draw();
    ram.chart.draw();
  }).observe(root);
  new IntersectionObserver((entries) => {
    const on = entries.some((e) => e.isIntersecting);
    if (on === timerSeen) return;
    timerSeen = on;
    void api.metricsWatch(on).then(paint);
  }).observe(root);
  return { root, action };
}
