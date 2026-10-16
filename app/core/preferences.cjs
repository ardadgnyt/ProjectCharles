// v2 preferences (city, side, height, language) with validation and durable save.
const path = require('node:path');
const { readStore, writeStore } = require('./store.cjs');
const validCity = (c) =>
  !!c &&
  typeof c.name === 'string' &&
  c.name.length <= 180 &&
  Number.isFinite(c.latitude) &&
  Math.abs(c.latitude) <= 90 &&
  Number.isFinite(c.longitude) &&
  Math.abs(c.longitude) <= 180;
/** Keeps the valid values of a saved companion.json and drops the rest. */
function sanitize(v) {
  const out = { ...v };
  for (const k of ['setup', 'observeApps', 'aiSuggestions'])
    if (out[k] !== undefined && typeof out[k] !== 'boolean') delete out[k];
  if (out.side !== undefined && !['left', 'center', 'right'].includes(out.side)) delete out.side;
  if (out.height !== undefined) {
    if (Number.isFinite(out.height)) out.height = Math.round(Math.max(480, Math.min(1200, out.height)));
    else delete out.height;
  }
  if (out.language !== undefined && !['tr', 'en', 'de', 'fr', 'es', 'zh'].includes(out.language)) delete out.language;
  if (out.city && !validCity(out.city)) delete out.city;
  if (
    out.usage !== undefined &&
    !(out.usage && typeof out.usage.day === 'string' && Number.isFinite(out.usage.count) && Number.isFinite(out.usage.last))
  )
    delete out.usage;
  // a chosen city means the first-run question was answered
  if (out.city) out.setup = true;
  return out;
}
class Preferences {
  constructor(dir) {
    this.file = path.join(dir, 'companion.json');
    // v0.7.2: only the file's shape is checked here; each value is checked on its own below.
    // A single odd value (an old usage counter, a height from another version…) used to make
    // the whole file invalid, so the chosen city was lost and Charles asked for it again.
    const loaded = readStore(this.file, (v) => v && typeof v === 'object' && !Array.isArray(v));
    loaded.value = loaded.value ? sanitize(loaded.value) : null;
    this.data = {
      language: 'tr',
      setup: false,
      side: 'center',
      height: 620,
      observeApps: true,
      aiSuggestions: true,
      city: null,
      usage: { day: '', count: 0, last: 0 },
      ...loaded.value,
      observeApps: false,
      aiSuggestions: false,
    };
  }
  save() {
    writeStore(this.file, this.data);
    return this.data;
  }
  update(value) {
    if (!value || typeof value !== 'object') throw Error('Geçersiz tercih.');
    for (const key of ['setup', 'observeApps', 'aiSuggestions'])
      if (typeof value[key] === 'boolean') this.data[key] = value[key];
    if (['tr', 'en', 'de', 'fr', 'es', 'zh'].includes(value.language)) this.data.language = value.language;
    if (['left', 'center', 'right'].includes(value.side)) this.data.side = value.side;
    if (Number.isFinite(value.height))
      this.data.height = Math.round(Math.max(480, Math.min(1200, value.height)));
    if (value.city === null) this.data.city = null;
    else if (value.city) {
      const c = value.city;
      if (
        typeof c.name !== 'string' ||
        c.name.length > 180 ||
        !Number.isFinite(c.latitude) ||
        Math.abs(c.latitude) > 90 ||
        !Number.isFinite(c.longitude) ||
        Math.abs(c.longitude) > 180
      )
        throw Error('Geçersiz şehir.');
      this.data.city = {
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
      };
    }
    return this.save();
  }
}
module.exports = { Preferences, sanitize };
