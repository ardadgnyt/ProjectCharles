// CPU / RAM / GPU usage history (SQLite).
const path = require('node:path'),
  fs = require('node:fs'),
  os = require('node:os');
const { execFile } = require('node:child_process');
const { normalize } = require('./desktop.cjs');
// Local shortcuts must not capture narrative text or ordinary technical questions.
function performanceIntent(prompt) {
  if (
    typeof prompt !== 'string' ||
    prompt.length > 400 ||
    prompt.split(/\r?\n/).filter((x) => x.trim()).length > 3
  )
    return null;
  const text = normalize(prompt);
  if (
    /["“”«»]/.test(text) ||
    /\b(hikaye|karakter|ornek|cevir|acikla|nedir|nasil|neden|yazma|gosterme|istemiyorum)\b/.test(
      text,
    )
  )
    return null;
  const suffix = '(?:yi|yu|ni|nu|nin|nun|in|un|dan|den|da|de|i|u)?';
  const has = (word) => new RegExp('\\b(?:' + word + ')' + suffix + '\\b').test(text);
  const metric = has('gpu|ekran karti')
    ? 'gpu'
    : has('ram|bellek')
      ? 'ram'
      : has('cpu|islemci')
        ? 'cpu'
        : null;
  if (!metric || !/\b(?:kullan\w*|tuket\w*|harca\w*)\b/.test(text)) return null;
  const query =
    /\b(?:hangi|hangisi|hangileri|ne|neler|kim|goster|listele|sirala|raporla|soyle|en cok)\b/.test(
      text,
    );
  if (!query) return null;
  return { metric, text };
}
class PerformanceHistory {
  constructor(dir) {
    const { DatabaseSync } = require('node:sqlite');
    this.db = new DatabaseSync(path.join(dir, 'resource-history.sqlite'));
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS samples(t INTEGER PRIMARY KEY,gpu INTEGER);CREATE TABLE IF NOT EXISTS usage(t INTEGER,app TEXT,cpu REAL,ram REAL,gpu REAL);CREATE INDEX IF NOT EXISTS usage_time ON usage(t);CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT)',
    );
    this.enabled = this.db.prepare("SELECT v FROM settings WHERE k='enabled'").get()?.v !== 'false';
    this.previous = new Map();
    this.last = 0;
    this.running = false;
    this.timer = null;
    this.lastError = '';
  }
  start() {
    if (this.enabled) void this.sample();
    this.timer = setInterval(() => {
      if (this.enabled) void this.sample();
    }, 60000);
  }
  read() {
    return {
      enabled: this.enabled,
      error: this.lastError,
      first: this.db.prepare('SELECT MIN(t) AS t FROM samples').get().t,
    };
  }
  set(value) {
    this.enabled = !!value;
    this.db
      .prepare("INSERT OR REPLACE INTO settings(k,v) VALUES('enabled',?)")
      .run(String(this.enabled));
    this.previous.clear();
    this.last = 0;
    if (this.enabled) void this.sample();
    return this.read();
  }
  clear() {
    this.db.exec('DELETE FROM usage;DELETE FROM samples;VACUUM');
    this.previous.clear();
    this.last = 0;
    return this.read();
  }
  async sample() {
    if (this.running || !this.enabled) return;
    this.running = true;
    try {
      const value = await new Promise((resolve, reject) =>
        execFile(
          path.join(
            process.env.SystemRoot || 'C:\\Windows',
            'System32/WindowsPowerShell/v1.0/powershell.exe',
          ),
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            fs.readFileSync(path.join(__dirname, 'performance.ps1'), 'utf8'),
          ],
          { windowsHide: true, timeout: 20000, maxBuffer: 5e6 },
          (e, out) => {
            if (e) reject(e);
            else
              try {
                resolve(JSON.parse(out.replace(/^\uFEFF/, '')));
              } catch (e) {
                reject(e);
              }
          },
        ),
      );
      if (this.enabled) {
        this.record(value);
        this.lastError = '';
      }
    } catch {
      this.lastError =
        'Windows kullanım sayaçları şu anda okunamıyor; sonraki ölçümde yeniden denenecek.';
    } finally {
      this.running = false;
    }
  }
  record(value, now = Date.now()) {
    const elapsed = (now - this.last) / 1000,
      groups = new Map(),
      next = new Map();
    for (const p of value.items || []) {
      if (!p.name || !Number.isFinite(p.cpu) || !Number.isFinite(p.ram)) continue;
      const key = p.id + ':' + p.start;
      next.set(key, p.cpu);
      const prior = this.previous.get(key);
      const cpu =
        prior !== undefined && elapsed > 0 && elapsed < 180
          ? Math.max(0, Math.min(100, ((p.cpu - prior) / elapsed / os.cpus().length) * 100))
          : 0;
      const group = groups.get(p.name) || { cpu: 0, ram: 0, gpu: 0 };
      group.cpu += cpu;
      group.ram += p.ram;
      group.gpu = Math.max(group.gpu, Number(p.gpu) || 0);
      groups.set(p.name, group);
    }
    const valid = this.last > 0 && elapsed > 0 && elapsed < 180;
    this.last = now;
    this.previous = next;
    if (!valid) return;
    this.notify(groups);
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT OR REPLACE INTO samples VALUES(?,?)')
        .run(now, value.gpuAvailable ? 1 : 0);
      const insert = this.db.prepare('INSERT INTO usage VALUES(?,?,?,?,?)');
      for (const [app, g] of groups)
        insert.run(now, app, Math.min(100, g.cpu), g.ram, value.gpuAvailable ? g.gpu : null);
      this.db.prepare('DELETE FROM usage WHERE t<?').run(now - 8 * 86400000);
      this.db.prepare('DELETE FROM samples WHERE t<?').run(now - 8 * 86400000);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  // Hands a summary of this sample to the system watchdog (app/system/watchdog.cjs).
  notify(groups) {
    if (!this.onSample) return;
    try {
      const apps = [...groups].map(([name, g]) => ({ name, cpu: g.cpu, ram: g.ram }));
      let diskFree = null,
        diskTotal = null;
      try {
        const root = (process.env.SystemDrive || 'C:') + '\\';
        const st = fs.statfsSync(root);
        diskFree = st.bavail * st.bsize;
        diskTotal = st.blocks * st.bsize;
      } catch {}
      this.onSample({
        cpu: Math.min(
          100,
          apps.reduce((n, a) => n + a.cpu, 0),
        ),
        ram: (1 - os.freemem() / os.totalmem()) * 100,
        diskFree,
        diskTotal,
        apps,
      });
    } catch {}
  }
  answer(prompt, now = Date.now()) {
    const intent = performanceIntent(prompt);
    if (!intent) return null;
    let { text, metric } = intent;
    const words = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8 };
    text = text.replace(
      /\b(bir|iki|uc|dort|bes|alti|yedi|sekiz) (?=saat|dakika|gun)/g,
      (_, w) => words[w] + ' ',
    );
    let since = now - 3600000,
      label = 'Son 1 saat';
    const m = text.match(/(\d+)\s*(saat|dakika|gun)/);
    if (m) {
      const scale = { saat: 3600000, dakika: 60000, gun: 86400000 };
      since = now - Math.min(8 * 86400000, Number(m[1]) * scale[m[2]]);
      label =
        Number(m[1]) * scale[m[2]] > 8 * 86400000
          ? 'Son 8 gün (saklama sınırı)'
          : `Son ${m[1]} ${m[2]}`;
    } else if (/bu hafta/.test(text)) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      since = d.getTime();
      label = 'Bu hafta';
    } else if (/hafta/.test(text)) {
      since = now - 7 * 86400000;
      label = 'Son 7 gün';
    } else if (/bugun/.test(text)) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      since = d.getTime();
      label = 'Bugün';
    }
    const samples = this.db
      .prepare(
        'SELECT COUNT(*) AS n, SUM(gpu) AS g, MIN(t) AS first, MAX(t) AS last FROM samples WHERE t>=?',
      )
      .get(since);
    if (!samples.n)
      return 'Bu dönem için henüz kullanım kaydı yok. Charles açıkken yaklaşık dakikada bir ölçüm yapılır; ilk CPU karşılaştırması için iki örnek gerekir. İzlemeyi Ayarlar → Performans bölümünden kontrol edebilirsin.';
    if (metric === 'gpu' && !samples.g)
      return 'Bu dönemde Windows GPU kullanım sayacı veri vermedi. GPU kullanımını sıfır kabul edip sıralama yapamıyorum. CPU ve RAM kayıtlarını sorabilirsin.';
    const divisor = metric === 'gpu' ? samples.g : samples.n;
    const rows = this.db
      .prepare(
        `SELECT app,SUM(${metric})/? AS value FROM usage WHERE t>=? GROUP BY app ORDER BY value DESC LIMIT 5`,
      )
      .all(divisor, since);
    const unit = metric === 'ram' ? 'MB' : '%';
    return (
      `**${label} · ${metric.toUpperCase()} kullanımı**\n\n` +
      rows
        .map(
          (r, i) =>
            `${i + 1}. **${r.app.replace(/[\r\n*`]/g, '')}** — ${r.value.toFixed(1)} ${unit}`,
        )
        .join('\n') +
      `\n\n${samples.n} ölçüm; kayıt aralığı ${new Date(samples.first).toLocaleString('tr-TR')} – ${new Date(samples.last).toLocaleString('tr-TR')}. Sıralama kaydedilen örneklerin ortalamasıdır; Windows’un erişime izin verdiği uygulamalar ölçülür; Charles kapalıyken veya uyku sırasında ölçüm yoktur.` +
      (metric === 'gpu'
        ? ' GPU değeri uygulamanın en yoğun motorunun örneklenmiş kullanım oranıdır; anlık tepe değerleri kaçabilir.'
        : '')
    );
  }
  stop() {
    clearInterval(this.timer);
    this.enabled = false; /* pending helper can finish without writing */
  }
}
module.exports = { PerformanceHistory, performanceIntent };
