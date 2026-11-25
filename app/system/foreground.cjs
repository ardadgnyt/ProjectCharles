// The foreground program (Windows). v0.9.20: the helper reports a change when it happens, so nothing
// asks every second; the last report answers read() at once. If Windows refuses the event hook the
// helper says so ("live": false) and each read() asks it.
const readline = require('node:readline');
class Foreground {
  constructor({ spawnHelper = null } = {}) {
    this.spawnHelper = spawnHelper;
    this.child = null;
    this.waiter = null;
    this.latest = null;
    this.registered = null;
    this.listeners = new Set();
  }
  helper() {
    if (this.child) return this.child;
    const child = this.spawnHelper ? this.spawnHelper() : require('./helper-hub.cjs').open('fg');
    this.child = child;
    if (this.registered) {
      try {
        child.stdin.write(`register ${this.registered.pid} ${this.registered.list.join(',')}\n`);
      } catch {}
    }
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let value = null;
      try {
        value = JSON.parse(line.replace(/^﻿/, ''));
      } catch {}
      this.latest = value?.live && typeof value?.full === 'boolean' ? value : null;
      this.finish(value);
      if (value) for (const fn of this.listeners) fn(value);
    });
    const gone = () => {
      if (this.child === child) this.stop();
    };
    child.on('error', gone);
    child.on('exit', gone);
    child.stdin.on('error', gone);
    return child;
  }
  /** fn(state) on every change; the helper starts here. */
  watch(fn) {
    this.listeners.add(fn);
    this.helper();
    return () => this.listeners.delete(fn);
  }
  read() {
    if (this.child && this.latest) return Promise.resolve(this.latest);
    // v0.9.19: two users share this helper, and one answer serves both
    if (this.waiter) return this.waiter.promise;
    const child = this.helper();
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    this.waiter = { resolve, promise, timer: setTimeout(() => this.stop(), 5000) };
    child.stdin.write('read\n');
    return promise;
  }
  /**
   * Registers Charles' window handles so the helper can lower them under a full-screen window
   * in the same millisecond full screen is detected, without waiting for an IPC round-trip.
   */
  register(pid, handles) {
    if (!Array.isArray(handles) || !handles.length) return false;
    const list = handles.map((h) => String(h)).filter((h) => /^\d+$/.test(h) && h !== '0');
    if (!list.length) return false;
    this.registered = { pid: Number(pid), list };
    if (!this.child) return false;
    try {
      this.child.stdin.write(`register ${Number(pid)} ${list.join(',')}\n`);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * v1.0.1 (taskbar): asks the helper to put these windows of process `pid` right under the
   * full-screen window in front (CharlesHelper.cs Below). Nothing happens when no helper runs, or
   * when the window in front does not cover its monitor.
   */
  below(pid, handles) {
    if (!this.child || !handles.length) return false;
    const list = handles.map((h) => String(h)).filter((h) => /^\d+$/.test(h) && h !== '0');
    if (!list.length) return false;
    this.registered = { pid: Number(pid), list };
    try {
      this.child.stdin.write(`below ${Number(pid)} ${list.join(',')}\n`);
      return true;
    } catch {
      return false;
    }
  }
  finish(value) {
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      const { resolve } = this.waiter;
      this.waiter = null;
      resolve(value);
    }
  }
  stop() {
    this.finish(null);
    this.latest = null;
    const c = this.child;
    this.child = null;
    c?.kill();
  }
}
module.exports = { Foreground };
