// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.18: what a version changed, read from the CHANGELOG.md that ships with Charles (works with
// no AI and no network), and whether this start should say so: a first install says nothing, an
// update says it once, an ordinary restart says nothing.
const fs = require('node:fs');
const path = require('node:path');
const { readStore, writeStore } = require('./store.cjs');

/** The section of CHANGELOG.md for a version, as { title, body }, or null. */
function section(changelog, version) {
  const number = String(version || '').replace(/^v/, '').split('-')[0];
  if (!/^\d+\.\d+\.\d+$/.test(number)) return null;
  const head = '## v' + number;
  const lines = String(changelog || '').split(/\r?\n/);
  const start = lines.findIndex((l) => l === head || l.startsWith(head + ' '));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^## /.test(lines[end])) end++;
  const body = lines.slice(start + 1, end).join('\n').trim();
  return body ? { title: lines[start].replace(/^##\s*/, ''), body } : null;
}

function notes(root, version) {
  try {
    return section(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  } catch {
    return null;
  }
}

/** 'first' | 'update' | 'restart'. `seen` is the version of the last start ('' = never recorded). */
function startKind({ fresh, seen, current, updated }) {
  if (seen === current && !updated) return 'restart';
  if (!seen && fresh) return 'first';
  return 'update';
}

class WhatsNew {
  constructor(dir) {
    this.file = path.join(dir, 'whats-new.json');
    const value = readStore(this.file, (v) => v && typeof v === 'object').value;
    this.seen = typeof value?.version === 'string' ? value.version : '';
  }
  /** Decides once per start and records this version, so the next start is a plain restart. */
  check({ fresh, current, updated = false }) {
    const kind = startKind({ fresh, seen: this.seen, current, updated });
    this.seen = current;
    try {
      writeStore(this.file, { version: current });
    } catch {}
    return kind;
  }
}

module.exports = { section, notes, startKind, WhatsNew };
