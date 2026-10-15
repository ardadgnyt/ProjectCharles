// Reads only the name of the foreground process (Windows helper).
const { spawn } = require('node:child_process'),
  path = require('node:path'),
  fs = require('node:fs'),
  readline = require('node:readline');
class Foreground {
  constructor() {
    this.child = null;
    this.waiter = null;
  }
  read() {
    if (this.waiter) return Promise.resolve(null);
    if (!this.child) {
      const child = spawn(
        path.join(
          process.env.SystemRoot || 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        ),
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          fs.readFileSync(path.join(__dirname, 'foreground.ps1'), 'utf8'),
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
      );
      this.child = child;
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        try {
          this.finish(JSON.parse(line.replace(/^\uFEFF/, '')));
        } catch {
          this.finish(null);
        }
      });
      child.on('error', () => this.stop());
      child.on('exit', () => {
        if (this.child === child) this.stop();
      });
      child.stdin.on('error', () => this.stop());
    }
    return new Promise((resolve) => {
      this.waiter = { resolve, timer: setTimeout(() => this.stop(), 5000) };
      this.child.stdin.write('read\n');
    });
  }
  finish(value) {
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.resolve(value);
      this.waiter = null;
    }
  }
  stop() {
    this.finish(null);
    const c = this.child;
    this.child = null;
    c?.kill();
  }
}
module.exports = { Foreground };
