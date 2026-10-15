// Slime — Charles' character: shape, colours and look.
//
// The engine (engine.ts) and the accessories (outfits.ts) both read the head geometry from
// here, so hats, glasses and work animations sit on the body. A glossy jelly cube in one of
// seven colours, with blush, a small smile and an optional moustache.

export type SlimeColor = 'green' | 'teal' | 'blue' | 'purple' | 'coral' | 'yellow' | 'white';

export interface SlimePalette {
  label: string;
  top: string;
  base: string;
  bottom: string;
  outline: string;
}

export const SLIME_COLORS: Record<SlimeColor, SlimePalette> = {
  green: { label: 'Yeşil', top: '#b3d977', base: '#9fc659', bottom: '#86b23f', outline: '#23460a' },
  teal: {
    label: 'Turkuaz',
    top: '#82e8d5',
    base: '#67dbc6',
    bottom: '#4fcbb4',
    outline: '#00544a',
  },
  blue: { label: 'Mavi', top: '#b0d6f8', base: '#95c7f0', bottom: '#7fb5e6', outline: '#0b416c' },
  purple: { label: 'Mor', top: '#e2b9f6', base: '#d5a2ef', bottom: '#c590e6', outline: '#522c6f' },
  coral: {
    label: 'Mercan',
    top: '#ffc2ae',
    base: '#feac93',
    bottom: '#f6977b',
    outline: '#8e3c27',
  },
  yellow: { label: 'Sarı', top: '#ffec9a', base: '#fee27c', bottom: '#f3cf5c', outline: '#815e05' },
  white: { label: 'Beyaz', top: '#fbfbfe', base: '#e9ebf2', bottom: '#cdd0db', outline: '#4f5361' },
};

export const SLIME_COLOR_IDS = Object.keys(SLIME_COLORS) as SlimeColor[];

export interface Shape {
  kind: 'slime';
  rx: number; // × R
  ry: number; // × R
  exp: number; // superellipse exponent (bigger = squarer)
  eyeSp: number; // eye longitude (radians from the front)
  eyeP: number; // eye latitude (negative = below the middle)
  eyeW: number; // × R
  eyeH: number; // × R
}

// Measured on the reference drawing: body ~1.06 : 1, eyes at ±0.61 of the half width and a
// fifth of the half height below the middle, round eyes about 0.13 of the body width.
const SLIME: Shape = {
  kind: 'slime',
  rx: 1.1,
  ry: 1.02,
  exp: 3.6,
  eyeSp: 0.66,
  eyeP: -0.2,
  eyeW: 0.33,
  eyeH: 0.31,
};

/** The live shape (read by the engine and the accessories). */
export const SHAPE: Shape = { ...SLIME };

/** How the slime looks (colour + moustache). Read by the engine every frame. */
export const SLIME_LOOK: { color: SlimeColor; mustache: boolean } = {
  color: 'green',
  mustache: false,
};

/** "slime:<colour>:<0|1>" ⇄ look. Unknown values fall back to green, no moustache. */
export function parseLook(raw: unknown): { color: SlimeColor; mustache: boolean } {
  const [, color, m] = String(raw || '').split(':');
  return {
    color: (SLIME_COLOR_IDS as string[]).includes(color) ? (color as SlimeColor) : 'green',
    mustache: m === '1',
  };
}

export function lookValue(look: { color: SlimeColor; mustache: boolean }) {
  return `slime:${look.color}:${look.mustache ? 1 : 0}`;
}

/** Colours of the little paws in the work animations (activity.ts, reading.ts); the engine
 *  sets them from the slime colour before drawing a station. */
export const PAW: { light: string; dark: string; edge: string | null } = {
  light: '#fff9ee',
  dark: '#e4ddd3',
  edge: null,
};
