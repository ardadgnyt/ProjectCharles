// Personal data: memory, reminders, appearance, access mode, macros.
const { readStore, writeStore } = require('../core/store.cjs');
const fs = require('fs'),
  path = require('path'),
  { randomUUID } = require('crypto');
const HATS = [
  'auto',
  'none',
  'partyHat',
  'beanie',
  'crown',
  'witchHat',
  'santaHat',
  'bunnyEars',
  'bow',
  'fedora',
  'headphones', // v0.7.1
];
const EYES = ['none', 'sunglasses', 'bigShades', 'roundGlasses', 'monocle', 'eyePatch'];
const OTHER = ['none', 'pumpkin', 'scarf', 'banana', 'bowTie', 'catCollar', 'arrow'];
class Personal {
  constructor(dir) {
    this.file = path.join(dir, 'personal.json');
    this.data = {
      access: 'ask',
      searchRoots: [],
      commands: [],
      memories: [],
      reminders: [],
      appearance: { font: 13, scale: 1, accent: '#edc9a9', opacity: 1, pet: 1 },
    };
    const loaded = readStore(
      this.file,
      (v) =>
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        ['commands', 'searchRoots', 'memories', 'reminders'].every(
          (k) => v[k] === undefined || Array.isArray(v[k]),
        ),
    );
    this.recoveryWarning = loaded.warning;
    if (loaded.value)
      this.data = {
        ...this.data,
        ...loaded.value,
        appearance: { ...this.data.appearance, ...loaded.value.appearance },
      };
    // v0.6.1: glasses, pumpkin and scarf used to share the single "outfit" value with the
    // hats; they now have their own slots so they can be worn together.
    const old = this.data.outfit;
    if (EYES.includes(old) && old !== 'none' && !this.data.eyewear) {
      this.data.eyewear = old;
      this.data.outfit = 'none';
    } else if (OTHER.includes(old) && old !== 'none' && !this.data.otherWear) {
      this.data.otherWear = old;
      this.data.outfit = 'none';
    }
  }
  save() {
    writeStore(this.file, this.data);
  }

  edit(action, args = {}) {
    if (action === 'outfit') {
      if (
        ![
          'auto',
          'none',
          'partyHat',
          'beanie',
          'crown',
          'sunglasses',
          'roundGlasses',
          'bow',
          'scarf',
          'witchHat',
          'pumpkin',
          'santaHat',
          'bunnyEars',
          'fedora',
          'monocle',
          'headphones',
        ].includes(args.value)
      )
        throw Error('Geçersiz aksesuar.');
      this.data.outfit = args.value;
    } else if (action === 'onboarded') {
      // v0.6.2 welcome tour: true = finished/skipped, false = show it again
      this.data.onboarded = args.value !== false;
    } else if (action === 'accessories') {
      // v0.6.1 wardrobe: one item per category; the pumpkin does not go with a hat.
      const hat = args.hat ?? this.data.outfit ?? 'none';
      const eyes = args.eyes ?? this.data.eyewear ?? 'none';
      const other = args.other ?? this.data.otherWear ?? 'none';
      if (!HATS.includes(hat) || !EYES.includes(eyes) || !OTHER.includes(other))
        throw Error('Geçersiz aksesuar.');
      if (other === 'pumpkin' && hat !== 'none' && hat !== 'auto')
        throw Error('Balkabağı şapkayla birlikte takılamaz.');
      if (args.slime !== undefined) {
        if (!/^slime:(green|teal|blue|purple|coral|yellow|white):[01]$/.test(String(args.slime)))
          throw Error('Geçersiz Slime görünümü.');
        this.data.slime = args.slime;
      }
      Object.assign(this.data, { outfit: hat, eyewear: eyes, otherWear: other });
    } else if (action === 'slime') {
      // Slime colour + moustache, "slime:<colour>:<0|1>" (src/vendor/slime/shape.ts)
      if (!/^slime:(green|teal|blue|purple|coral|yellow|white):[01]$/.test(String(args.value)))
        throw Error('Geçersiz Slime görünümü.');
      this.data.slime = args.value;
    } else if (action === 'colors') {
      const defaults = { badge: '#edc9a9', send: '#edc9a9', user: '#241f1b', agent: '#121214' };
      const colors = {};
      for (const k of Object.keys(defaults)) {
        const v = args[k] ?? defaults[k];
        if (!/^#[0-9a-f]{6}$/i.test(v)) throw Error('Geçersiz renk.');
        colors[k] = v;
      }
      this.data.colors = colors;
    } else if (action === 'access') {
      if (!['ask', 'auto', 'full'].includes(args.value)) throw Error('Geçersiz erişim modu.');
      this.data.access = args.value;
    } else if (action === 'command-save') {
      const phrase = String(args.phrase || '').trim();
      const apps = Array.isArray(args.apps)
        ? args.apps.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim())
        : [];
      if (!phrase || phrase.length > 100 || !apps.length || apps.length > 8)
        throw Error('Komut adı ve 1–8 uygulama seç.');
      const old = this.data.commands.find((c) => c.id === args.id);
      if (
        this.data.commands.some(
          (c) =>
            c.phrase.toLocaleLowerCase('tr-TR') === phrase.toLocaleLowerCase('tr-TR') && c !== old,
        )
      )
        throw Error('Bu komut zaten var.');
      if (old) Object.assign(old, { phrase, apps });
      else this.data.commands.push({ id: randomUUID(), phrase, apps });
    } else if (action === 'command-delete')
      this.data.commands = this.data.commands.filter((c) => c.id !== args.id);
    else if (action === 'memory-save') {
      const text = String(args.text || '').trim();
      if (!text || text.length > 2000) throw Error('Hafıza metni 1–2000 karakter olmalı.');
      const old = this.data.memories.find((x) => x.id === args.id);
      if (args.id && !old) throw Error('Kayıt bulunamadı.');
      if (old) old.text = text;
      else {
        if (this.data.memories.length >= 50) throw Error('En fazla 50 hafıza kaydı.');
        this.data.memories.push({ id: randomUUID(), text });
      }
    } else if (action === 'memory-delete')
      this.data.memories = this.data.memories.filter((x) => x.id !== args.id);
    else if (action === 'reminder-add') {
      const title = String(args.title || '').trim();
      const due = Number(args.due);
      if (
        !title ||
        title.length > 200 ||
        !Number.isFinite(due) ||
        due <= Date.now() ||
        due > Date.now() + 366 * 86400000
      )
        throw Error('Başlık ve gelecekteki geçerli bir zaman seç.');
      if (this.data.reminders.length >= 100) throw Error('En fazla 100 hatırlatıcı.');
      this.data.reminders.push({
        id: randomUUID(),
        title,
        due,
        kind: args.kind === 'focus' ? 'focus' : 'reminder',
        status: 'active',
      });
    } else if (action === 'reminder-delete')
      this.data.reminders = this.data.reminders.filter((x) => x.id !== args.id);
    else if (action === 'timer-toggle') {
      const r = this.data.reminders.find((x) => x.id === args.id && x.kind === 'focus');
      if (!r || r.status === 'done') throw Error('Sayaç bulunamadı.');
      if (r.status === 'active') {
        r.remaining = Math.max(1000, r.due - Date.now());
        r.status = 'paused';
      } else {
        r.due = Date.now() + r.remaining;
        r.status = 'active';
      }
    } else if (action === 'appearance') {
      const clamp = (n, a, b, d) =>
        Number.isFinite(Number(n)) ? Math.max(a, Math.min(b, Number(n))) : d;
      this.data.appearance = {
        font: clamp(args.font, 11, 18, 13),
        scale: clamp(args.scale, 0.85, 1.15, 1),
        pet: clamp(args.pet, 0.8, 1.2, 1),
        // v0.7.0: the opacity setting was removed; Charles is always fully opaque
        opacity: 1,
        accent: /^#[0-9a-f]{6}$/i.test(args.accent) ? args.accent : '#edc9a9',
      };
    } else throw Error('Geçersiz kişisel ayar.');
    this.save();
    return this.data;
  }
  due(now = Date.now()) {
    const items = this.data.reminders.filter((x) => x.status === 'active' && x.due <= now);
    if (items.length) {
      items.forEach((x) => (x.status = 'done'));
      this.save();
    }
    return items;
  }
  memory() {
    return this.data.memories
      .map((x) => x.text)
      .join('\n')
      .slice(0, 15000);
  }
}
module.exports = { Personal };
