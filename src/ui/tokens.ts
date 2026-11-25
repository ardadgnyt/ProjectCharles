// v1.0.0 design tokens for code that paints colours itself (canvas, colour inputs). The values live in
// public/styles/00-tokens.css; cssToken() reads them from the page, CREAM is the same accent as a hex
// for the places that need a literal (an <input type="color"> value, before the stylesheet is there).
export const CREAM = '#edc9a9';
export const BLUE = '#7cb8ff';
export type Palette = 'cream' | 'blue';

const PALETTE_KEY = 'charles-palette';
const cache = new Map<string, string>();

/** Reads the last saved colour palette from localStorage for early boot (prevents FOUC). */
export function readStoredPalette(): Palette {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(PALETTE_KEY) === 'blue') return 'blue';
  } catch {}
  return 'cream';
}

/** Applies the chosen colour palette ('cream' | 'blue') live to the document and persists it for early boot. */
export function applyPalette(palette: Palette | string): Palette {
  const next: Palette = palette === 'blue' ? 'blue' : 'cream';
  cache.clear();
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.palette = next;
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PALETTE_KEY, next);
  } catch {}
  return next;
}

try {
  if (typeof document !== 'undefined' && document.documentElement && !document.documentElement.dataset?.palette) {
    document.documentElement.dataset.palette = readStoredPalette();
  }
} catch {}

/** A token's value from the page's stylesheet (resolved to a colour the canvas understands), cached. */
export function cssToken(name: string, fallback: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  let v = '';
  try {
    // resolve var() and color-mix() through a computed colour, so a canvas gets rgb()/rgba()
    const probe = document.createElement('i');
    probe.style.color = `var(${name})`;
    probe.hidden = true;
    document.documentElement.append(probe);
    v = getComputedStyle(probe).color;
    probe.remove();
  } catch {}
  if (!v || v === 'rgba(0, 0, 0, 0)') return fallback;
  cache.set(name, v);
  return v;
}
/** The accent colour for canvas drawing. */
export const cream = () => cssToken('--cream', CREAM);
