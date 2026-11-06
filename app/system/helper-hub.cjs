// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.20: the one helper process (setup/CharlesHelper.cs → charles-helper.exe). Each user of it
// (foreground, media, system monitor, usage statistics, push to talk) opens a channel and
// gets something that behaves like a child process of its own: stdin.write(line), stdout, kill(),
// 'exit'. The real process is shared, starts with the first channel and ends with the last.
//
// A helper that keeps falling over is not started without end: after CRASH_LIMIT falls within
// CRASH_WINDOW_MS, opening a channel fails until CRASH_REST_MS have passed.
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const readline = require('node:readline');
const { PassThrough } = require('node:stream');

const CHANNELS = new Set(['fg', 'media', 'metrics', 'usage', 'keys']);
const CRASH_LIMIT = 4;
const CRASH_WINDOW_MS = 60000;
const CRASH_REST_MS = 5 * 60000;
const EXE = path.join(__dirname, 'charles-helper.exe');
// a small heap and no background collector: the helper keeps little and runs on a timer
const ENV = { COMPlus_gcConcurrent: '0', COMPlus_GCgen0size: '200000' };

function startHelper(args = []) {
  return childProcess.spawn(EXE, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, ...ENV } });
}

/** One channel, shaped like a child process for the class that uses it. */
class Channel extends EventEmitter {
  constructor(hub, name) {
    super();
    this.hub = hub;
    this.name = name;
    this.stdout = new PassThrough();
    this.stdin = new EventEmitter();
    this.stdin.write = (text) => hub.send(this, String(text));
    this.closed = false;
  }
  kill() {
    if (this.closed) return;
    this.hub.close(this);
    this.gone();
  }
  gone() {
    if (this.closed) return;
    this.closed = true;
    this.stdout.end();
    this.emit('exit', 0);
  }
}

class Hub {
  constructor({ spawn = startHelper, now = () => Date.now() } = {}) {
    Object.assign(this, { spawn, now });
    this.child = null;
    this.channels = new Map();
    this.falls = [];
    this.restUntil = 0;
  }

  /** The channel `name`, or a channel that fails at once when the helper cannot run. */
  open(name) {
    if (!CHANNELS.has(name)) throw Error('Invalid channel: ' + name);
    this.channels.get(name)?.kill();
    const channel = new Channel(this, name);
    try {
      this.start();
    } catch (e) {
      setImmediate(() => {
        channel.emit('error', e);
        channel.gone();
      });
      return channel;
    }
    this.channels.set(name, channel);
    this.write(name, '!open');
    return channel;
  }

  start() {
    if (this.child) return;
    if (this.now() < this.restUntil) throw Error('Charles yardımcısı çalışmıyor.');
    const child = this.spawn();
    this.child = child;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      const tab = line.indexOf('\t');
      if (tab < 1) return;
      this.channels.get(line.slice(0, tab))?.stdout.write(line.slice(tab + 1) + '\n');
    });
    const fell = () => this.fell(child);
    child.on('error', fell);
    child.on('exit', fell);
    child.stdin.on('error', fell);
  }

  fell(child) {
    if (this.child !== child) return;
    this.child = null;
    const now = this.now();
    this.falls = this.falls.filter((t) => t > now - CRASH_WINDOW_MS);
    this.falls.push(now);
    if (this.falls.length >= CRASH_LIMIT) {
      this.restUntil = now + CRASH_REST_MS;
      this.falls = [];
    }
    const open = [...this.channels.values()];
    this.channels.clear();
    for (const c of open) c.gone();
  }

  write(name, text) {
    try {
      this.child?.stdin.write(name + '\t' + text.replace(/\r?\n/g, ' ') + '\n');
    } catch {}
  }

  send(channel, text) {
    if (channel.closed || this.channels.get(channel.name) !== channel) return;
    this.write(channel.name, text.replace(/\n$/, ''));
  }

  close(channel) {
    if (this.channels.get(channel.name) !== channel) return;
    this.write(channel.name, '!close');
    this.channels.delete(channel.name);
    if (!this.channels.size) this.end();
  }

  /** Nothing uses the helper any more: it goes, and this is no fall. */
  end() {
    const c = this.child;
    this.child = null;
    try {
      c?.stdin.end();
    } catch {}
    setTimeout(() => {
      try {
        c?.kill();
      } catch {}
    }, 1500).unref?.();
  }

  /** After sleep or a locked screen: hooks and the media connection are set up again, once. */
  refresh() {
    for (const name of this.channels.keys()) if (name !== 'metrics' && name !== 'usage') this.write(name, '!refresh');
  }

  /** Charles is closing. */
  stop() {
    const open = [...this.channels.values()];
    this.channels.clear();
    this.end();
    for (const c of open) c.gone();
  }
}

let shared = null;
const hub = () => (shared ||= new Hub());
const open = (name) => hub().open(name);

module.exports = { Hub, Channel, hub, open, startHelper, EXE, CRASH_LIMIT, CRASH_REST_MS };
