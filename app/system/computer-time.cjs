// Time spent on the computer and in foreground apps.
const path = require('node:path');
const { readStore, writeStore } = require('../core/store.cjs');
class ComputerTime {
  constructor(dir) {
    this.file = path.join(dir, 'computer-time.json');
    this.data = readStore(this.file, (v) => v && Array.isArray(v.intervals)).value || {
      intervals: [],
      since: Date.now(),
    };
    this.last = null;
    this.state = 'locked';
    this.dirty = false;
  }
  sample(now, state, app = this.app || null) {
    app = typeof app === 'string' && app.trim() ? app.trim().slice(0, 100) : null;
    if (this.last !== null) {
      const elapsed = now - this.last;
      // Ignore sleep, clock jumps and process pauses instead of inventing activity.
      if (elapsed > 0 && elapsed <= 45000 && this.state !== 'locked' && state !== 'locked') {
        const active = this.state === 'active' && state === 'active',
          last = this.data.intervals.at(-1);
        const previousApp = this.app || null;
        if (
          last &&
          last.end === this.last &&
          last.active === active &&
          (last.app || null) === previousApp
        )
          last.end = now;
        else this.data.intervals.push({ start: this.last, end: now, active, app: previousApp });
        this.dirty = true;
      }
    }
    this.last = now;
    this.state = ['active', 'idle'].includes(state) ? state : 'locked';
    this.app = app;
  }
  pause(now = Date.now()) {
    this.sample(now, this.state);
    this.last = null;
    this.state = 'locked';
    this.save();
  }
  save() {
    if (!this.dirty) return;
    const cutoff = Date.now() - 100 * 86400000;
    this.data.intervals = this.data.intervals.filter((r) => r.end > cutoff);
    writeStore(this.file, this.data);
    this.dirty = false;
  }
  read(start, end) {
    let computerSeconds = 0,
      activeSeconds = 0;
    const apps = new Map();
    for (const r of this.data.intervals) {
      const seconds = Math.max(0, Math.min(end, r.end) - Math.max(start, r.start)) / 1000;
      computerSeconds += seconds;
      if (r.active) activeSeconds += seconds;
      if (r.app && seconds) {
        const row = apps.get(r.app) || { name: r.app, seconds: 0, activeSeconds: 0 };
        row.seconds += seconds;
        if (r.active) row.activeSeconds += seconds;
        apps.set(r.app, row);
      }
    }
    return {
      computerSeconds: Math.round(computerSeconds),
      activeSeconds: Math.round(activeSeconds),
      computerTrackingSince: this.data.since,
      apps: [...apps.values()]
        .sort((a, b) => b.seconds - a.seconds)
        .map((r) => ({
          ...r,
          seconds: Math.round(r.seconds),
          activeSeconds: Math.round(r.activeSeconds),
        })),
    };
  }
}
module.exports = { ComputerTime };
