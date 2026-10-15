// Weekly summary of computer and app usage.
const path = require('node:path');
const { readStore, writeStore } = require('../core/store.cjs');
function weekStart(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return +d;
}
function previousWeek(now) {
  const end = weekStart(now),
    d = new Date(end);
  d.setDate(d.getDate() - 7);
  return { start: +d, end };
}
function aggregate(rows, now, period = 'previous') {
  const { start, end } =
      period === 'current' ? { start: weekStart(now), end: now } : previousWeek(now),
    selected = rows.filter((r) => r.start >= start && r.start < end);
  const result = {
    start,
    end,
    turns: selected.length,
    sessions: 0,
    seconds: 0,
    files: 0,
    added: 0,
    removed: 0,
    commands: 0,
    permissions: 0,
    topAgent: null,
    topProject: null,
    busiestDay: null,
    longestSeconds: 0,
  };
  const sessions = new Set(),
    files = new Set(),
    agents = {},
    projects = {},
    days = {},
    durations = {};
  for (const r of selected) {
    sessions.add(r.room);
    for (const f of r.files || []) files.add(f);
    for (const k of ['seconds', 'added', 'removed', 'commands', 'permissions'])
      result[k] += r[k] || 0;
    durations[r.room] = (durations[r.room] || 0) + (r.seconds || 0);
    result.longestSeconds = Math.max(result.longestSeconds, durations[r.room]);
    agents[r.model] = (agents[r.model] || 0) + 1;
    if (r.project) projects[r.project] = (projects[r.project] || 0) + 1;
    const day = new Date(r.start).toLocaleDateString('en-CA');
    days[day] = (days[day] || 0) + (r.seconds || 0);
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  result.sessions = sessions.size;
  result.files = files.size;
  result.topAgent = top(agents);
  result.topProject = top(projects);
  result.busiestDay = top(days);
  return result;
}
class Weekly {
  constructor(dir) {
    this.file = path.join(dir, 'weekly.json');
    this.data = readStore(this.file, (v) => v && Array.isArray(v.rows)).value || {
      rows: [],
      shown: 0,
      enabled: true,
    };
    this.active = new Map();
  }
  save() {
    const cutoff = Date.now() - 100 * 86400000;
    this.data.rows = this.data.rows.filter((r) => r.start > cutoff);
    writeStore(this.file, this.data);
  }
  record(room, event) {
    const e = event.data || {};
    if (event.type === 'agent' && e.method === 'turn/started') {
      this.active.set(room.id, {
        room: room.id,
        start: Date.now(),
        model: room.model || 'GPT',
        project: room.mode === 'project' ? room.cwd : null,
        files: [],
        added: 0,
        removed: 0,
        commands: 0,
        permissions: 0,
        seen: new Set(),
      });
      return;
    }
    const row = this.active.get(room.id);
    if (!row) return;
    if (event.type === 'request') row.permissions++;
    if (event.type === 'agent' && e.method === 'item/completed') {
      const item = e.params?.item;
      if (!item || row.seen.has(item.id)) return;
      row.seen.add(item.id);
      if (item.type === 'commandExecution') row.commands++;
      if (item.type === 'fileChange')
        for (const c of item.changes || []) {
          if (c.path && !row.files.includes(c.path)) row.files.push(c.path);
          for (const line of String(c.diff || '').split('\n')) {
            if (line.startsWith('+') && !line.startsWith('+++')) row.added++;
            if (line.startsWith('-') && !line.startsWith('---')) row.removed++;
          }
        }
    }
    if (event.type === 'agent' && e.method === 'turn/completed') {
      row.seconds = Math.max(0, Math.round((Date.now() - row.start) / 1000));
      delete row.seen;
      this.data.rows.push(row);
      this.active.delete(room.id);
      this.save();
    }
  }
  read(now = Date.now(), period = 'previous') {
    const rows =
      period === 'current'
        ? [
            ...this.data.rows,
            ...[...this.active.values()].map((r) => ({
              ...r,
              seconds: Math.max(0, Math.round((now - r.start) / 1000)),
            })),
          ]
        : this.data.rows;
    return { ...aggregate(rows, now, period), period, enabled: this.data.enabled !== false };
  }
  due(now = Date.now()) {
    const start = weekStart(now),
      morning = new Date(start);
    morning.setHours(9);
    return this.data.enabled !== false && now >= +morning && this.data.shown < start;
  }
  shown() {
    this.data.shown = weekStart(Date.now());
    this.save();
  }
}
module.exports = { Weekly, aggregate, weekStart, previousWeek };
