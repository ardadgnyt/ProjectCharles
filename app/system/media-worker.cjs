// Long-lived PowerShell worker for Windows media session (Spotify) status and control.
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  readline = require('node:readline');
class MediaWorker {
  constructor() {
    this.child = null;
    this.waiter = null;
    this.queue = Promise.resolve();
    this.misses = 0;
  }
  request(action) {
    try {
      action = require('./media-request.cjs').mediaRequest(action);
    } catch (e) {
      return Promise.reject(e);
    }
    const task = this.queue.then(() => this.send(action));
    this.queue = task.catch(() => {});
    return task;
  }
  start() {
    if (this.child) return;
    const exe = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    );
    const child = spawn(
      exe,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        fs.readFileSync(path.join(__dirname, 'media-worker.ps1'), 'utf8'),
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
    );
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (this.child !== child || !this.waiter) return;
      try {
        const value = JSON.parse(line.replace(/^\uFEFF/, ''));
        const w = this.waiter;
        this.waiter = null;
        clearTimeout(w.timer);
        // v0.9.0: a worker that keeps answering "unavailable" may be stuck inside Windows: after
        // two such answers in a row it is replaced by a fresh one for the next request
        this.misses = value && value.reason === 'media-unavailable' ? this.misses + 1 : 0;
        if (this.misses >= 2) {
          this.misses = 0;
          this.child = null;
          try {
            child.kill();
          } catch {}
        }
        w.resolve(value);
      } catch {}
    });
    const failed = () => {
      if (this.child !== child) return;
      this.child = null;
      lines.close();
      if (this.waiter) {
        clearTimeout(this.waiter.timer);
        this.waiter.reject(Error('Spotify bağlantısı kesildi. Yeniden deneyebilirsin.'));
        this.waiter = null;
      }
    };
    child.on('error', failed);
    child.on('exit', failed);
    child.stdin.on('error', failed);
  }
  send(action) {
    this.start();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop();
      }, 8000);
      this.waiter = { resolve, reject, timer };
      this.child.stdin.write(JSON.stringify(action) + '\n');
    });
  }
  stop() {
    const c = this.child;
    this.child = null;
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.reject(Error('Spotify yanıt vermedi. Yeniden deneyebilirsin.'));
      this.waiter = null;
    }
    c?.kill();
  }
}
module.exports = { MediaWorker };
