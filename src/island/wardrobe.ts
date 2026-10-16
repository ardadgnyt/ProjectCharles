// Settings → Görünüm → Slime stüdyosu (v0.6.1).
// Colour, then four categories: Şapka · Göz · Yüz · Diğer. One item per category; items from
// different categories are worn together (the pumpkin does not go with a hat). Everything is
// tried on a preview Slime first; "Kaydet" puts it on Charles.
import { BotEngine } from '../vendor/slime/engine';
import { clashes, type AccessorySlot, type Accessories } from '../vendor/slime/wardrobe';
import { slimePreview, wearable, accessoriesOf } from '../settings/slime-preview';
import { updateAppIcon } from './app-icon';
import {
  SLIME_COLORS,
  SLIME_COLOR_IDS,
  lookValue,
  parseLook,
  type SlimeColor,
} from '../vendor/slime/shape';

type Tab = AccessorySlot | 'face';

const TABS: [Tab, string][] = [
  ['hat', 'Şapka'],
  ['eyes', 'Göz'],
  ['face', 'Yüz'],
  ['other', 'Diğer'],
];

const ITEMS: Record<AccessorySlot, [string, string, string][]> = {
  hat: [
    ['none', 'Şapka yok', '○'],
    ['auto', 'Mevsime göre', '🗓️'],
    ['fedora', 'Fötr şapka', '🎩'],
    ['crown', 'Taç', '👑'],
    ['partyHat', 'Parti şapkası', '🎉'],
    ['beanie', 'Bere', '🧢'],
    ['witchHat', 'Cadı şapkası', '🧙'],
    ['santaHat', 'Yılbaşı şapkası', '🎅'],
    ['bunnyEars', 'Tavşan kulakları', '🐰'],
    ['bow', 'Fiyonk', '🎀'],
    ['headphones', 'Kulaklık', '🎧'],
  ],
  eyes: [
    ['none', 'Gözlük yok', '○'],
    ['sunglasses', 'Güneş gözlüğü', '🕶️'],
    ['bigShades', 'Büyük güneş gözlüğü', '😎'],
    ['roundGlasses', 'Yuvarlak gözlük', '👓'],
    ['monocle', 'Tek gözlük', '🧐'],
    ['eyePatch', 'Korsan göz bandı', '🏴‍☠️'],
  ],
  other: [
    ['none', 'Yok', '○'],
    ['pumpkin', 'Balkabağı', '🎃'],
    ['scarf', 'Atkı', '🧣'],
    ['banana', 'Muz', '🍌'],
    ['bowTie', 'Papyon', '🤵'],
    ['catCollar', 'Çanlı kedi tasması', '🔔'],
    ['arrow', 'Batmış ok', '🏹'],
  ],
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function wardrobeUI(api: any, bot: BotEngine) {
  const section = el('section', 'setting-section slime-studio');
  section.id = 'wardrobe';
  const title = el('h3', '', 'Slime stüdyosu');
  const hint = el('p', 'hint', 'Farklı kategorilerden birlikte seçebilirsin; beğenince Kaydet.');
  const body = el('div', 'studio-body');
  const preview = slimePreview('Slime önizlemesi');
  const controls = el('div', 'studio-controls');

  // ── Colour ────────────────────────────────────────────────────────────────
  const colorGroup = el('div', 'studio-group');
  colorGroup.append(el('span', 'studio-label', 'Renk'));
  const swatches = el('div', 'slime-swatches');
  swatches.setAttribute('role', 'radiogroup');
  swatches.setAttribute('aria-label', 'Slime rengi');
  const swatchButtons = new Map<SlimeColor, HTMLButtonElement>();
  for (const id of SLIME_COLOR_IDS) {
    const pal = SLIME_COLORS[id];
    const b = el('button', 'slime-swatch');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.title = pal.label;
    b.setAttribute('aria-label', pal.label);
    b.style.setProperty('--swatch', pal.base);
    b.style.setProperty('--swatch-top', pal.top);
    b.style.setProperty('--swatch-edge', pal.outline);
    b.onclick = () => pickLook({ ...picked.look, color: id });
    swatches.append(b);
    swatchButtons.set(id, b);
  }
  colorGroup.append(swatches);

  // ── Category tabs ─────────────────────────────────────────────────────────
  const tabsBar = el('div', 'studio-tabs');
  tabsBar.setAttribute('role', 'tablist');
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  const panels = new Map<Tab, HTMLElement>();
  const panelHost = el('div', 'studio-panels');
  for (const [id, label] of TABS) {
    const b = el('button', 'studio-tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.append(el('span', 'studio-tab-name', label), el('small', 'studio-tab-value'));
    b.onclick = () => showTab(id);
    tabsBar.append(b);
    tabButtons.set(id, b);
    const panel = el('div', 'studio-panel');
    panel.setAttribute('role', 'tabpanel');
    panelHost.append(panel);
    panels.set(id, panel);
  }

  // item lists for Şapka, Göz, Diğer
  const itemButtons = new Map<string, HTMLButtonElement>();
  for (const slot of ['hat', 'eyes', 'other'] as const) {
    const list = el('div', 'studio-options');
    list.setAttribute('role', 'listbox');
    for (const [value, label, icon] of ITEMS[slot]) {
      const b = el('button', 'studio-option');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.append(el('span', 'studio-icon', icon), document.createTextNode(label));
      b.onclick = () => pickItem(slot, value);
      list.append(b);
      itemButtons.set(slot + ':' + value, b);
    }
    panels.get(slot)!.append(list);
  }
  // Yüz: moustache
  const segment = el('div', 'studio-segment');
  segment.setAttribute('role', 'radiogroup');
  segment.setAttribute('aria-label', 'Bıyık');
  const mustacheButtons = new Map<boolean, HTMLButtonElement>();
  for (const [value, label] of [
    [false, 'Bıyıksız'],
    [true, 'Bıyıklı'],
  ] as const) {
    const b = el('button', '', label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.onclick = () => pickLook({ ...picked.look, mustache: value });
    segment.append(b);
    mustacheButtons.set(value, b);
  }
  const faceGroup = el('div', 'studio-group');
  faceGroup.append(el('span', 'studio-label', 'Bıyık'), segment);
  panels.get('face')!.append(faceGroup);

  const note = el('small', 'studio-note');
  controls.append(colorGroup, tabsBar, panelHost, note);

  const actions = el('div', 'studio-actions');
  const save = el('button', 'primary', 'Kaydet');
  save.type = 'button';
  const reset = el('button', 'studio-reset', 'Hepsini çıkar');
  reset.type = 'button';
  const status = el('small', 'studio-status');
  actions.append(save, reset, status);
  body.append(preview.element, controls);
  section.append(title, hint, body, actions);
  document.querySelector('.settings-page[data-category=look]')!.append(section);

  let saved = {
    acc: { hat: 'none', eyes: 'none', other: 'none' } as Accessories,
    look: parseLook(''),
  };
  const picked = { acc: { ...saved.acc }, look: parseLook('') };
  let tab: Tab = 'hat';

  const labelOf = (slot: AccessorySlot, v: string) =>
    v === 'none' ? '—' : ITEMS[slot].find(([id]) => id === v)?.[1] || v;

  function showTab(next: Tab) {
    tab = next;
    for (const [id, b] of tabButtons) b.setAttribute('aria-selected', String(id === next));
    for (const [id, p] of panels) p.hidden = id !== next;
  }

  function paint() {
    for (const [id, b] of swatchButtons) {
      b.setAttribute('aria-checked', String(id === picked.look.color));
      b.classList.toggle('saved', id === saved.look.color);
    }
    for (const [value, b] of mustacheButtons)
      b.setAttribute('aria-checked', String(value === picked.look.mustache));
    for (const [key, b] of itemButtons) {
      const [slot, value] = key.split(':') as [AccessorySlot, string];
      b.setAttribute('aria-selected', String(picked.acc[slot] === value));
      b.classList.toggle('saved', saved.acc[slot] === value);
    }
    tabButtons.get('hat')!.querySelector('small')!.textContent = labelOf('hat', picked.acc.hat);
    tabButtons.get('eyes')!.querySelector('small')!.textContent = labelOf('eyes', picked.acc.eyes);
    tabButtons.get('other')!.querySelector('small')!.textContent = labelOf(
      'other',
      picked.acc.other,
    );
    tabButtons.get('face')!.querySelector('small')!.textContent = picked.look.mustache
      ? 'Bıyıklı'
      : '—';
    const same =
      JSON.stringify(picked.acc) === JSON.stringify(saved.acc) &&
      lookValue(picked.look) === lookValue(saved.look);
    save.disabled = same;
    status.textContent = same ? 'Charles böyle görünüyor' : 'Kaydedilmedi';
  }
  function tryOn() {
    preview.setAccessories(picked.acc);
    preview.setLook(lookValue(picked.look));
  }
  function pickLook(look: typeof picked.look) {
    picked.look = look;
    tryOn();
    preview.engine.triggerEmote('happy', 0.9);
    note.textContent = '';
    paint();
  }
  function pickItem(slot: AccessorySlot, value: string) {
    picked.acc = { ...picked.acc, [slot]: value };
    note.textContent = '';
    // The pumpkin covers the whole head: it does not go with a hat.
    if (clashes(picked.acc)) {
      if (slot === 'other') {
        picked.acc.hat = 'none';
        note.textContent = 'Balkabağı şapkayla birlikte takılamaz; şapka çıkarıldı.';
      } else {
        picked.acc.other = 'none';
        note.textContent = 'Şapka balkabağıyla birlikte takılamaz; balkabağı çıkarıldı.';
      }
    }
    tryOn();
    paint();
  }
  const apply = (p: any) => {
    saved = { acc: accessoriesOf(p), look: parseLook(p.slime) };
    bot.look = { ...saved.look };
    bot.setAccessories(wearable(saved.acc));
    updateAppIcon(api, saved.look.color);
    picked.acc = { ...saved.acc };
    picked.look = { ...saved.look };
    tryOn();
    paint();
  };
  save.onclick = async () => {
    save.disabled = true;
    // Read the choice first: "personal-changed" arrives before the promise resolves.
    const acc = { ...picked.acc };
    const look = lookValue(picked.look);
    try {
      const p = await api.personalEdit('accessories', { ...acc, slime: look });
      apply(p);
      bot.triggerEmote('happy', 1.5);
    } catch (e) {
      note.textContent = (e as Error).message;
      paint();
    }
  };
  reset.onclick = () => {
    picked.acc = { hat: 'none', eyes: 'none', other: 'none' };
    picked.look = { ...picked.look, mustache: false };
    note.textContent = '';
    tryOn();
    paint();
  };
  showTab('hat');
  api.onPersonal(apply);
  void api.personalRead().then(apply);
  // "Mevsime göre" follows the date.
  window.setInterval(() => bot.setAccessories(wearable(saved.acc)), 60000);
  // v0.6.3: the Turkish flag on the national days comes only with the Turkish UI
  document.addEventListener('charles-language', () => {
    bot.setAccessories(wearable(saved.acc));
    tryOn();
  });
  void tab;
}
