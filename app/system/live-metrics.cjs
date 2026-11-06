// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.18: Araçlar → Sistem izleyici. One helper process measures all the time Charles runs: once a
// second while the monitor is on screen, every 5 seconds behind it (this can be turned off). The
// last hour stays in memory; nothing goes to disk or anywhere else. Sleep or a closed Charles shows
// as a gap in the line, never as a joined line.
const fs = require('node:fs');
const os = require('node:os');
const readline = require('node:readline');
const { stats, series } = require('../core/metric-stats.cjs');

const HISTORY_MS = 60 * 60000;
const INTERVAL = 1000;
const BACKGROUND_INTERVAL = 5000;
const TOP_EVERY = 3;
const RANGES = { '1m': 60000, '5m': 5 * 60000, '1h': HISTORY_MS };
const MEMORY_TYPES = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 35: 'LPDDR5' };

class LiveMetrics {
  constructor({ send, fallbackCpu = async () => null, now = () => Date.now(), spawnHelper = null, file = null }) {
    Object.assign(this, { send, fallbackCpu, now, spawnHelper, file });
    this.background = true;
    try {
      if (file) this.background = JSON.parse(fs.readFileSync(file, 'utf8')).background !== false;
    } catch {}
    this.samples = [];
    this.gpus = [];
    this.top = [];
    this.gpuId = '';
    this.range = '1m';
    this.paused = false;
    this.watching = false;
    this.child = null;
    this.waiter = null;
    this.timer = null;
    this.ticks = 0;
    this.info = { cpu: null, ram: null };
    this.latest = null;
    this.error = '';
  }

  helper() {
    if (this.child) return this.child;
    const child = this.spawnHelper ? this.spawnHelper() : require('./helper-hub.cjs').open('metrics');
    this.child = child;
    readline.createInterface({ input: child.stdout }).on('line', (line) => this.line(line));
    child.on('error', () => this.closed(child));
    child.on('exit', () => this.closed(child));
    child.stdin.on('error', () => this.closed(child));
    return child;
  }

  closed(child) {
    if (this.child !== child) return;
    this.child = null;
    this.answer(null);
  }

  line(text) {
    let value = null;
    try {
      value = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {}
    if (value?.static) {
      this.info = { cpu: value.cpu || null, ram: value.ram || null };
      return;
    }
    this.answer(value);
  }

  answer(value) {
    const w = this.waiter;
    this.waiter = null;
    if (w) {
      clearTimeout(w.timer);
      w.resolve(value);
    }
  }

  ask(command, ms = 5000) {
    if (this.waiter) return Promise.resolve(null);
    const child = this.helper();
    return new Promise((resolve) => {
      this.waiter = {
        resolve,
        timer: setTimeout(() => {
          this.answer(null);
          this.stopHelper(); // a helper that stopped answering is replaced at the next sample
        }, ms),
      };
      child.stdin.write(command + '\n');
    });
  }

  stopHelper() {
    const c = this.child;
    this.child = null;
    this.answer(null);
    try {
      c?.kill();
    } catch {}
  }

  /** Processor and memory names: asked once, by a process that ends at once (v0.9.20). */
  details() {
    if (this.spawnHelper || this.detailed) return;
    this.detailed = true;
    try {
      const child = require('./helper-hub.cjs').startHelper(['--static']);
      child.on('error', () => {});
      readline.createInterface({ input: child.stdout }).on('line', (line) => this.line(line));
    } catch {}
  }

  /** The monitor came on screen (true) or left it (false). */
  watch(on) {
    on = !!on;
    if (on === this.watching) return this.view();
    this.watching = on;
    if (on) this.details();
    this.schedule();
    return this.view();
  }

  /** Called once Charles has started. */
  start() {
    this.schedule();
  }

  schedule() {
    clearInterval(this.timer);
    this.timer = null;
    const measuring = !this.paused && (this.watching || this.background);
    if (!measuring) return this.stopHelper();
    this.timer = setInterval(() => void this.sample(), this.watching ? INTERVAL : BACKGROUND_INTERVAL);
    this.timer.unref?.();
    void this.sample();
  }

  setBackground(on) {
    this.background = !!on;
    try {
      if (this.file) fs.writeFileSync(this.file, JSON.stringify({ background: this.background }));
    } catch {}
    this.schedule();
    return this.view();
  }

  pause(on) {
    this.paused = !!on;
    this.schedule();
    return this.view();
  }

  reset() {
    this.samples = [];
    return this.view();
  }

  select({ range, gpu } = {}) {
    if (range !== undefined) {
      if (!RANGES[range]) throw Error('Geçersiz zaman aralığı.');
      this.range = range;
    }
    if (gpu !== undefined) this.gpuId = String(gpu);
    return this.view();
  }

  async sample() {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const value = await this.ask('sample');
      if (this.paused || !(this.watching || this.background)) return;
      // which programs use the most is only worth asking while someone is looking
      if (this.watching && this.ticks++ % TOP_EVERY === 0) {
        const top = await this.ask('top');
        if (top?.top) this.top = top.top;
      }
      this.record(value, await (value?.cpu == null ? this.fallbackCpu() : null));
      if (this.watching) this.send(this.view());
    } finally {
      this.sampling = false;
    }
  }

  record(value, fallback = null, t = this.now()) {
    const total = os.totalmem();
    const free = os.freemem();
    const clamp = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null);
    const gpus = Array.isArray(value?.gpus) ? value.gpus : [];
    if (gpus.length) this.gpus = gpus.map(({ id, name, vramTotal }) => ({ id, name, vramTotal }));
    if (!this.gpus.some((g) => g.id === this.gpuId)) this.gpuId = this.gpus[0]?.id || '';
    this.error = value ? '' : 'Ölçüm alınamadı; sonraki saniyede yeniden denenecek.';
    this.latest = { value: value || null, total, free };
    this.samples.push({
      t,
      cpu: clamp(value?.cpu ?? fallback),
      ram: clamp(((total - free) / total) * 100),
      gpu: Object.fromEntries(gpus.map((g) => [g.id, clamp(g.load)])),
    });
    while (this.samples.length && this.samples[0].t < t - HISTORY_MS) this.samples.shift();
  }

  metric(pick, now, rangeMs) {
    const points = this.samples.map((s) => ({ t: s.t, v: pick(s) }));
    return { series: series(points, now, rangeMs), stats: stats(points, now, rangeMs) };
  }

  view() {
    const now = this.samples.at(-1)?.t ?? this.now();
    const rangeMs = RANGES[this.range];
    const last = this.latest;
    const gpu = this.gpus.find((g) => g.id === this.gpuId) || null;
    const liveGpu = last?.value?.gpus?.find((g) => g.id === this.gpuId) || null;
    const { cpu, ram } = this.info;
    return {
      now,
      range: this.range,
      rangeMs,
      paused: this.paused,
      background: this.background,
      error: this.error,
      gpus: this.gpus.map(({ id, name }) => ({ id, name })),
      gpuId: this.gpuId,
      cpu: {
        ...this.metric((s) => s.cpu, now, rangeMs),
        name: cpu?.name || (os.cpus()[0]?.model || '').trim(),
        cores: cpu?.cores ?? null,
        threads: cpu?.threads ?? os.cpus().length,
        ghz: cpu?.mhz && typeof last?.value?.perf === 'number' ? (cpu.mhz * last.value.perf) / 100000 : null,
      },
      gpu: {
        ...this.metric((s) => (this.gpuId in s.gpu ? s.gpu[this.gpuId] : null), now, rangeMs),
        name: gpu?.name || '',
        vramUsed: liveGpu?.vramUsed ?? null,
        vramTotal: gpu?.vramTotal ?? null,
        temp: liveGpu?.temp ?? null,
        power: liveGpu?.power ?? null,
      },
      ram: {
        ...this.metric((s) => s.ram, now, rangeMs),
        kind: MEMORY_TYPES[this.info.ram?.type] || '',
        total: last?.total ?? os.totalmem(),
        free: last?.free ?? os.freemem(),
        cache: last?.value?.cache ?? null,
      },
      top: this.top,
    };
  }

  stop() {
    this.watching = false;
    clearInterval(this.timer);
    this.stopHelper();
  }
}

module.exports = { LiveMetrics, RANGES };
