// v2 preferences (city, side, height, language) with validation and durable save.
const path = require('node:path');
const { readStore, writeStore } = require('./store.cjs');
class Preferences {
  constructor(dir) {
    this.file = path.join(dir, 'companion.json');
    const loaded = readStore(
      this.file,
      (v) =>
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        ['setup', 'observeApps', 'aiSuggestions'].every(
          (k) => v[k] === undefined || typeof v[k] === 'boolean',
        ) &&
        (v.side === undefined || ['left', 'center', 'right'].includes(v.side)) &&
        (v.height === undefined ||
          (Number.isFinite(v.height) && v.height >= 480 && v.height <= 1200)) &&
        (!v.city ||
          (typeof v.city.name === 'string' &&
            Number.isFinite(v.city.latitude) &&
            Math.abs(v.city.latitude) <= 90 &&
            Number.isFinite(v.city.longitude) &&
            Math.abs(v.city.longitude) <= 180)) &&
        (v.usage === undefined ||
          (v.usage &&
            typeof v.usage.day === 'string' &&
            Number.isFinite(v.usage.count) &&
            Number.isFinite(v.usage.last))),
    );
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
    if (['tr', 'en'].includes(value.language)) this.data.language = value.language;
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
module.exports = { Preferences };
