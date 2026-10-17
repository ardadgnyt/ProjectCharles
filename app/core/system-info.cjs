// v0.7.7: the "Sistem kullanımı" and "Sistem bilgileri" cards of the app window's home page.
// Only local, read-only values from Node/Electron; nothing is sent anywhere.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

let lastCpu = null;
function cpuTimes() {
  let idle = 0,
    total = 0;
  for (const c of os.cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
}
/** CPU use in percent since the previous call (the first call measures ~200 ms). */
async function cpuPercent() {
  let prev = lastCpu;
  if (!prev) {
    prev = cpuTimes();
    await new Promise((r) => setTimeout(r, 200));
  }
  const now = cpuTimes();
  lastCpu = now;
  const total = now.total - prev.total;
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - (now.idle - prev.idle) / total) * 100))) : 0;
}
function disk(root) {
  try {
    if (typeof fs.statfsSync !== 'function') return null;
    const s = fs.statfsSync(root);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return total > 0 ? { root, total, free } : null;
  } catch {
    return null;
  }
}
const systemRoot = () => (process.platform === 'win32' ? path.parse(process.env.SystemRoot || 'C:\\Windows').root : '/');

async function usage(app) {
  const total = os.totalmem();
  const free = os.freemem();
  let charles = 0;
  try {
    for (const m of app?.getAppMetrics?.() || []) charles += (m.memory?.workingSetSize || 0) * 1024;
  } catch {}
  return {
    cpu: await cpuPercent(),
    cores: os.cpus().length,
    memory: { total, used: total - free },
    disk: disk(systemRoot()),
    charlesMemory: charles,
    uptime: os.uptime(),
  };
}

function windowsName() {
  if (process.platform !== 'win32') return os.type() + ' ' + os.release();
  const build = Number(String(os.release()).split('.')[2]) || 0;
  const v = typeof os.version === 'function' ? os.version() : 'Windows';
  // os.version() says "Windows 10 …" on Windows 11 too; build 22000+ is Windows 11
  return build >= 22000 ? v.replace(/Windows 10/, 'Windows 11') : v;
}

function info(app, version) {
  const cpus = os.cpus();
  return {
    os: windowsName(),
    build: os.release(),
    arch: os.arch(),
    cpu: (cpus[0]?.model || '').replace(/\s+/g, ' ').trim(),
    cores: cpus.length,
    memory: os.totalmem(),
    computer: os.hostname(),
    uptime: os.uptime(),
    charles: version,
    electron: process.versions.electron || '',
    node: process.versions.node,
    chrome: process.versions.chrome || '',
    locale: app?.getLocale?.() || '',
  };
}

module.exports = { usage, info, cpuPercent };
