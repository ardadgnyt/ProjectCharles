// Slime's wardrobe — the pure logic: which accessories exist, the seasonal "auto" choice.
// The accessory is picked in Ayarlar → Görünüm → Slime stüdyosu and stored in personal.json.
// The drawing lives in ./outfits.ts.
const N_ = (s: string) => s;
const labels = <T>(v: T) => v;
const t = (s: string, args: Record<string, string> = {}) =>
  s.replace(/\{(\w+)\}/g, (_, k) => args[k] || k);

/** Every outfit, plus "auto" (dress for the season) and "none". Order of the wardrobe. */
export const OUTFIT_SELECTIONS = [
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
  'bigShades',
  'banana',
  'flag',
] as const;

/** What can be stored in the preferences. The raw values are the Mac's, keep them stable. */
export type OutfitSelection = (typeof OUTFIT_SELECTIONS)[number];

/** What Slime actually wears: a selection with "auto" resolved. */
export type Outfit = Exclude<OutfitSelection, 'auto'>;

export const DEFAULT_OUTFIT: OutfitSelection = 'auto';

// ── User-visible strings ──────────────────────────────────────────────────────

/** The English names, the keys of their translations (src/i18n). */
export const OUTFIT_KEYS: Record<OutfitSelection, string> = {
  auto: N_('Auto (seasons)'),
  none: N_('None'),
  partyHat: N_('Party hat'),
  beanie: N_('Beanie'),
  crown: N_('Crown'),
  sunglasses: N_('Sunglasses'),
  roundGlasses: N_('Round glasses'),
  bow: N_('Bow'),
  scarf: N_('Scarf'),
  witchHat: N_('Witch hat'),
  pumpkin: N_('Pumpkin'),
  santaHat: N_('Santa hat'),
  bunnyEars: N_('Bunny ears'),
  fedora: N_('Felt hat'),
  monocle: N_('Monocle'),
  bigShades: N_('Big sunglasses'),
  banana: N_('Banana'),
  flag: N_('Turkish flag'),
};

// ── v0.6.1: accessory categories ─────────────────────────────────────────────
// Şapka (head), Göz (eyes), Diğer (pumpkin, scarf). Yüz (moustache) lives in the slime look.
// One item per category; items from different categories are worn together, except the
// pumpkin, which covers the whole head and does not go with a hat.
export type AccessorySlot = 'hat' | 'eyes' | 'other';

export const SLOT_ITEMS: Record<AccessorySlot, readonly string[]> = {
  hat: [
    'none',
    'auto',
    'fedora',
    'crown',
    'partyHat',
    'beanie',
    'witchHat',
    'santaHat',
    'bunnyEars',
    'bow',
  ],
  eyes: ['none', 'sunglasses', 'bigShades', 'roundGlasses', 'monocle'],
  other: ['none', 'pumpkin', 'scarf', 'banana'],
};

export interface Accessories {
  hat: string;
  eyes: string;
  other: string;
  /** v0.6.3: held in the paw — the Turkish flag on the national days ("auto", no setting). */
  hand?: string;
}

/** v0.6.3: 19 Mayıs, 30 Ağustos, 29 Ekim, 10 Kasım — Slime holds a Turkish flag. */
export const NATIONAL_DAYS: readonly [number, number][] = [
  [5, 19],
  [8, 30],
  [10, 29],
  [11, 10],
];
export function isNationalDay(date: Date): boolean {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return NATIONAL_DAYS.some(([mm, dd]) => mm === m && dd === d);
}

/** Which slot a stored outfit value belongs to (old saves kept everything in one value). */
export function slotOf(value: string): AccessorySlot {
  if (SLOT_ITEMS.eyes.includes(value) && value !== 'none') return 'eyes';
  if (SLOT_ITEMS.other.includes(value) && value !== 'none') return 'other';
  return 'hat';
}

/** Hats that cannot be worn with the pumpkin. */
export function clashes(a: Accessories): boolean {
  return a.other === 'pumpkin' && a.hat !== 'none' && a.hat !== 'auto';
}

/**
 * What is actually drawn: the hat slot with "auto" resolved. A seasonal choice that is not a
 * hat (summer sunglasses) goes to its own slot only when that slot is empty.
 */
export function wornAccessories(a: Accessories, date: Date): Accessories {
  const hand = a.hand || 'auto';
  const out = {
    hat: a.hat,
    eyes: a.eyes,
    other: a.other,
    hand: hand === 'auto' ? (isNationalDay(date) ? 'flag' : 'none') : hand,
  };
  if (a.hat === 'auto') {
    const s = seasonalOutfit(date);
    const slot = slotOf(s);
    out.hat = slot === 'hat' ? s : 'none';
    if (slot === 'eyes' && out.eyes === 'none') out.eyes = s;
    if (slot === 'other' && out.other === 'none') out.other = s;
  }
  if (out.other === 'pumpkin' && out.hat !== 'none') out.hat = 'none';
  return out;
}

/** In the current language: every read goes through `t()`. */
export const OUTFIT_LABELS: Record<OutfitSelection, string> = labels(OUTFIT_KEYS);

export const WARDROBE_STRINGS = {
  get title() {
    return t('Wardrobe');
  },
  get autoBadge() {
    return t('AUTO');
  },
  autoNow: (current: string) => t('Auto · {outfit}', { outfit: current }),
  autoHover: (current: string) =>
    t('Auto · follows the seasons (now: {outfit})', { outfit: current }),
};

// ── Logic ─────────────────────────────────────────────────────────────────────

const SELECTION_SET: ReadonlySet<string> = new Set(OUTFIT_SELECTIONS);

/**
 * A stored preference → a selection. Anything unknown (a value from a newer or
 * older build, such as the Mac's removed "topHat", or garbage) means "auto",
 * exactly like `Outfit.stored` on macOS.
 */
export function parseOutfit(raw: unknown): OutfitSelection {
  return typeof raw === 'string' && SELECTION_SET.has(raw)
    ? (raw as OutfitSelection)
    : DEFAULT_OUTFIT;
}

/** Easter Sunday of `year` (Meeus/Jones/Butcher), as [month 1–12, day]. */
export function easterDate(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const DAY_MS = 86_400_000;

/**
 * The seasonal outfit for `date`, read in the user's local calendar.
 * Priority: party hat > Santa hat > witch hat > bunny ears > sunglasses > none.
 */
export function seasonalOutfit(date: Date): Outfit {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  // Dec 31 – Jan 2
  if ((month === 12 && day === 31) || (month === 1 && day <= 2)) return 'partyHat';
  // Dec 1–26
  if (month === 12 && day <= 26) return 'santaHat';
  // Oct 1 – Nov 1
  if (month === 10 || (month === 11 && day === 1)) return 'witchHat';
  // Two days before Easter to the day after. Calendar days counted in UTC so a
  // daylight-saving change in between can't shift the count.
  const [em, ed] = easterDate(year);
  const delta = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, em - 1, ed)) / DAY_MS);
  if (delta >= -2 && delta <= 1) return 'bunnyEars';
  // Jun 21 – Aug 31
  if ((month === 6 && day >= 21) || month === 7 || month === 8) return 'sunglasses';
  return 'none';
}

/** "auto" → the season's outfit; anything else is worn as chosen. */
export function resolveOutfit(selection: OutfitSelection, date: Date): Outfit {
  return selection === 'auto' ? seasonalOutfit(date) : selection;
}

/**
 * The grey text at the right of the wardrobe header: the hovered outfit,
 * otherwise the current choice — WardrobeView.headerRight on macOS.
 */
export function wardrobeHeader(
  hovered: OutfitSelection | null,
  selection: OutfitSelection,
  date: Date,
): string {
  const season = OUTFIT_LABELS[seasonalOutfit(date)];
  if (hovered)
    return hovered === 'auto' ? WARDROBE_STRINGS.autoHover(season) : OUTFIT_LABELS[hovered];
  return selection === 'auto' ? WARDROBE_STRINGS.autoNow(season) : OUTFIT_LABELS[selection];
}

/** Same as resolveOutfit, remembered for the day — it is asked every frame. */
export class SeasonCache {
  private key = '';
  private value: Outfit = 'none';

  get(selection: OutfitSelection, date = new Date()): Outfit {
    if (selection !== 'auto') return selection;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (key !== this.key) {
      this.key = key;
      this.value = seasonalOutfit(date);
    }
    return this.value;
  }
}
