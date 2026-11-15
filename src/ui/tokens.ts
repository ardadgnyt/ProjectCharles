// v1.0.0 design tokens for code that paints colours itself (canvas, colour inputs). The values live in
// public/styles/00-tokens.css; cssToken() reads them from the page, CREAM is the same accent as a hex
// for the places that need a literal (an <input type="color"> value, before the stylesheet is there).
export const CREAM = '#edc9a9';

const cache = new Map<string, string>();
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
