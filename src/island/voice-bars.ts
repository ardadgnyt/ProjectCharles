// v1.0.0: the sound bars of the voice chat card, drawn on a canvas in whole device pixels. Eleven
// CSS boxes of 2 px with scaleY looked uneven: at 125 % or 150 % display scale, and on the Small
// island (zoom 0.75), each box fell on another fraction of a pixel, so some bars came out thicker
// or fainter than their neighbours. Here every bar has the same whole-pixel width and gap, and a
// height of the same parity as the canvas, so the wave is symmetric around its centre line.

/** The wave at rest, edge to centre to edge (share of the full height). */
export const BAR_REST = [0.22, 0.32, 0.45, 0.6, 0.78, 0.95, 0.78, 0.6, 0.45, 0.32, 0.22];
/** How strongly each bar follows the sound level during a call. */
export const BAR_LIVE = [0.4, 0.55, 0.7, 0.55, 0.85, 1, 0.85, 0.55, 0.7, 0.55, 0.4];
/** Size of the bars in CSS pixels at scale 1: 2 px bars, 2 px gaps, 26 px tall. */
const PITCH = 4;
const HEIGHT = 26;

export type BarLayout = { bar: number; gap: number; width: number; height: number };

/** Bar width, gap and canvas size in device pixels for `count` bars at `scale` device px per CSS px. */
export function barLayout(scale: number, count: number): BarLayout {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const pitch = Math.max(2, Math.round(PITCH * s));
  const bar = Math.max(1, Math.floor(pitch / 2));
  const gap = pitch - bar;
  return { bar, gap, width: count * bar + (count - 1) * gap, height: Math.max(6, Math.round(HEIGHT * s)) };
}

/** A bar's height in device pixels: at least its own width, and centred exactly (same parity as `height`). */
export function barHeight(share: number, layout: BarLayout): number {
  let h = Math.round(Math.max(0, Math.min(1, share)) * layout.height);
  if ((layout.height - h) % 2) h += h < layout.height ? 1 : -1;
  const least = layout.bar + ((layout.height - layout.bar) % 2);
  return Math.max(least, Math.min(layout.height, h));
}

/** The canvas and what draws on it. `scale()` answers device pixels per CSS pixel of the canvas. */
export function voiceBars(scale: () => number) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  let shares = BAR_REST;
  // the colour comes from CSS (`color` of the canvas), read again only when the state changes
  let colour = '';
  let drawn = '';
  const draw = () => {
    if (!ctx) return;
    if (!colour && canvas.isConnected) colour = getComputedStyle(canvas).color;
    const s = scale();
    const l = barLayout(s, shares.length);
    const key = [s, colour, shares.map((v) => barHeight(v, l)).join()].join('|');
    if (key === drawn) return;
    drawn = key;
    if (canvas.width !== l.width || canvas.height !== l.height) {
      canvas.width = l.width;
      canvas.height = l.height;
      // one canvas pixel is one device pixel: nothing is resampled
      canvas.style.width = l.width / s + 'px';
      canvas.style.height = l.height / s + 'px';
    } else ctx.clearRect(0, 0, l.width, l.height);
    ctx.fillStyle = colour || 'rgba(255, 255, 255, 0.32)';
    const r = l.bar / 2;
    shares.forEach((share, i) => {
      const h = barHeight(share, l);
      const x = i * (l.bar + l.gap);
      const y = (l.height - h) / 2;
      ctx.beginPath();
      if (l.bar >= 3) ctx.roundRect(x, y, l.bar, h, r);
      else ctx.rect(x, y, l.bar, h);
      ctx.fill();
    });
  };
  // No transform is used to place the canvas: Chromium already paints a box on whole device pixels,
  // and a translated canvas is resampled (it was tried: every bar came out soft).
  return {
    canvas,
    /** New heights (shares of the full height). Draws only when a bar's pixel height changed. */
    set(next: number[]) {
      shares = next;
      draw();
    },
    /** The display scale, the island's size, the colour in CSS or the canvas' place may have changed. */
    refresh() {
      colour = '';
      draw();
    },
  };
}
