// System watchdog ("sistem nöbetçisi"): looks at every performance sample (once a minute)
// and tells Charles when CPU, RAM or the system disk is abnormally high. Slime then sweats
// and names the app responsible.
//
//   CPU  ≥ 85 % in two samples in a row  → names the app with the highest CPU
//   RAM  ≥ 90 % in two samples in a row  → names the app with the most memory
//   disk < 5 % free (or < 3 GB)           → no app; disk usage is not per process
//
// Each metric warns at most once every 20 minutes so a long build or game never spams.
const COOLDOWN = 20 * 60 * 1000;
const LIMITS = { cpu: 85, ram: 90, diskFreePercent: 5, diskFreeBytes: 3 * 1024 ** 3 };

const clean = (name) =>
  String(name || '')
    .replace(/\.exe$/i, '')
    .replace(/[\r\n*`]/g, '')
    .slice(0, 40);

class Watchdog {
  // warn({ metric, value, app, text }) is called when something stays abnormal.
  constructor({ warn, now = () => Date.now(), limits = {} } = {}) {
    this.warn = warn || (() => {});
    this.now = now;
    this.limits = { ...LIMITS, ...limits };
    this.streak = { cpu: 0, ram: 0 };
    this.lastWarn = { cpu: 0, ram: 0, disk: 0 };
  }

  // sample: { cpu: total %, ram: used %, diskFree: bytes, diskTotal: bytes,
  //           apps: [{ name, cpu, ram (MB) }] }
  check(sample) {
    const out = [];
    const apps = Array.isArray(sample?.apps) ? sample.apps : [];
    const top = (key) =>
      apps
        .filter(
          (a) =>
            a?.name && Number.isFinite(a[key]) && !/^(idle|system idle process)$/i.test(a.name),
        )
        .sort((a, b) => b[key] - a[key])[0];
    for (const metric of ['cpu', 'ram']) {
      const value = Number(sample?.[metric]);
      if (Number.isFinite(value) && value >= this.limits[metric]) this.streak[metric]++;
      else this.streak[metric] = 0;
      if (this.streak[metric] < 2 || this.now() - this.lastWarn[metric] < COOLDOWN) continue;
      const app = top(metric);
      const name = app ? clean(app.name) : '';
      const text =
        metric === 'cpu'
          ? `İşlemci %${Math.round(value)} dolu` +
            (name ? ` — en çok ${name} kullanıyor (%${Math.round(app.cpu)}).` : '.')
          : `Bellek %${Math.round(value)} dolu` +
            (name ? ` — en çok ${name} kullanıyor (${(app.ram / 1024).toFixed(1)} GB).` : '.');
      out.push({ metric, value, app: name, text });
    }
    const free = Number(sample?.diskFree);
    const total = Number(sample?.diskTotal);
    if (Number.isFinite(free) && Number.isFinite(total) && total > 0) {
      const percent = (free / total) * 100;
      if (
        (percent < this.limits.diskFreePercent || free < this.limits.diskFreeBytes) &&
        this.now() - this.lastWarn.disk >= COOLDOWN
      )
        out.push({
          metric: 'disk',
          value: percent,
          app: '',
          text: `C: diskinde yalnızca ${(free / 1024 ** 3).toFixed(1)} GB (%${percent.toFixed(1)}) boş yer kaldı.`,
        });
    }
    for (const w of out) {
      this.lastWarn[w.metric] = this.now();
      if (w.metric !== 'disk') this.streak[w.metric] = 0;
      try {
        this.warn(w);
      } catch {}
    }
    return out;
  }
}

module.exports = { Watchdog, LIMITS, COOLDOWN };
