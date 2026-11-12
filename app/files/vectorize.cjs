'use strict';
// v0.9.26: a picture traced into a real SVG (shapes, not an embedded bitmap). The colours are
// reduced to a few (k-means), every area of one colour is outlined along its pixel edges, holes
// included, and the outlines are simplified. Good for logos, icons, drawings and screenshots of
// flat colour; a photo becomes a poster-like picture. The original is never changed.
//
//   traceSvg({ width, height, data: RGBA bytes }, { colors: 2–16, detail: 'low'|'normal'|'high' }) → SVG text

const MAX_SIDE = 640;

/** RGBA pixels → at most MAX_SIDE on the long side (box average). */
function shrink({ width, height, data }) {
  const k = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (k >= 1) return { width, height, data, scale: 1 };
  const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / k), y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) / k)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / k), x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) / k)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
        }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out, scale: width / w };
}

/** k-means on the opaque pixels (deterministic start: k-means++ from a fixed walk). */
function palette(data, count) {
  const pts = [];
  const step = Math.max(1, Math.floor(data.length / 4 / 30000));
  for (let i = 0; i < data.length; i += 4 * step) if (data[i + 3] >= 128) pts.push([data[i], data[i + 1], data[i + 2]]);
  if (!pts.length) return [];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const centers = [pts[Math.floor(pts.length / 2)].slice()];
  while (centers.length < count) {
    let best = -1, at = 0;
    for (let i = 0; i < pts.length; i += 3) {
      let m = Infinity;
      for (const c of centers) m = Math.min(m, d2(pts[i], c));
      if (m > best) (best = m), (at = i);
    }
    if (best <= 4) break; // fewer real colours than asked
    centers.push(pts[at].slice());
  }
  for (let it = 0; it < 10; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, j) => {
        const d = d2(p, c);
        if (d < bd) (bd = d), (bi = j);
      });
      const s = sum[bi];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    sum.forEach((s, j) => s[3] && (centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]));
  }
  return centers.map((c) => c.map(Math.round));
}

/** Every pixel's colour number (-1 = see-through), smoothed once so single stray pixels go. */
function labels({ width: W, height: H, data }, centers) {
  const lab = new Int16Array(W * H);
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    if (data[i + 3] < 128) {
      lab[p] = -1;
      continue;
    }
    let bi = 0, bd = Infinity;
    for (let j = 0; j < centers.length; j++) {
      const c = centers[j];
      const d = (data[i] - c[0]) ** 2 + (data[i + 1] - c[1]) ** 2 + (data[i + 2] - c[2]) ** 2;
      if (d < bd) (bd = d), (bi = j);
    }
    lab[p] = bi;
  }
  const out = lab.slice();
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x, me = lab[p];
      const n = [lab[p - 1], lab[p + 1], lab[p - W], lab[p + W]];
      if (n.every((v) => v !== me) && n[0] === n[1] && n[1] === n[2] && n[2] === n[3]) out[p] = n[0];
    }
  return out;
}

/** The outlines of one colour: closed loops along pixel edges (outer ones clockwise, holes the other way). */
function loops(lab, W, H, me) {
  const key = (x, y) => y * (W + 1) + x;
  const next = new Map(); // start point → end points
  const add = (x1, y1, x2, y2) => {
    const k = key(x1, y1);
    const list = next.get(k);
    if (list) list.push(key(x2, y2));
    else next.set(k, [key(x2, y2)]);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (lab[y * W + x] !== me) continue;
      if (y === 0 || lab[(y - 1) * W + x] !== me) add(x, y, x + 1, y);
      if (x === W - 1 || lab[y * W + x + 1] !== me) add(x + 1, y, x + 1, y + 1);
      if (y === H - 1 || lab[(y + 1) * W + x] !== me) add(x + 1, y + 1, x, y + 1);
      if (x === 0 || lab[y * W + x - 1] !== me) add(x, y + 1, x, y);
    }
  const out = [];
  for (const [start] of next) {
    while (next.get(start)?.length) {
      const loop = [start];
      let prev = start;
      let cur = next.get(start).pop();
      let guard = 0;
      while (cur !== start && guard++ < 4e6) {
        loop.push(cur);
        const list = next.get(cur);
        if (!list || !list.length) break;
        // two ways on at a corner where areas touch diagonally: keep turning the same way
        let pick = list.length - 1;
        if (list.length > 1) {
          const px = prev % (W + 1), py = Math.floor(prev / (W + 1)), cx = cur % (W + 1), cy = Math.floor(cur / (W + 1));
          const dx = cx - px, dy = cy - py;
          // the area is on the right of the way round: turning right keeps to it, so two areas
          // that only touch at a corner stay two outlines
          const dir = (n) => [(n % (W + 1)) - cx, Math.floor(n / (W + 1)) - cy];
          pick = list.findIndex((n) => {
            const [nx, ny] = dir(n);
            return nx === -dy && ny === dx;
          });
          if (pick < 0) pick = list.length - 1;
        }
        const n = list.splice(pick, 1)[0];
        prev = cur;
        cur = n;
      }
      if (loop.length >= 4) out.push(loop.map((k) => [k % (W + 1), Math.floor(k / (W + 1))]));
    }
  }
  return out;
}

/** Fewer points: straight runs become one segment, then Douglas–Peucker with `tolerance` pixels. */
function simplify(points, tolerance) {
  const pts = points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length], b = points[(i + 1) % points.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
  if (pts.length < 4 || tolerance <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  const far = (s, e) => {
    if (e <= s + 1) return;
    const [ax, ay] = pts[s], [bx, by] = pts[e % pts.length];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1, at = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > best) (best = d), (at = i);
    }
    if (best > tolerance) {
      keep[at] = 1;
      far(s, at);
      far(at, e);
    }
  };
  const half = Math.floor(pts.length / 2);
  keep[half] = 1;
  far(0, half);
  far(half, pts.length);
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : pts;
}

function traceSvg(image, { colors = 8, detail = 'normal' } = {}) {
  if (!image || !image.width || !image.height) throw Error('Görsel okunamadı.');
  const small = shrink(image);
  const centers = palette(small.data, Math.max(2, Math.min(16, Math.round(colors))));
  if (!centers.length) throw Error('Görselde çizilecek bir şey yok (tamamen saydam).');
  const lab = labels(small, centers);
  const tolerance = detail === 'high' ? 0.35 : detail === 'low' ? 1.4 : 0.75;
  const area = centers.map(() => 0);
  for (const v of lab) if (v >= 0) area[v]++;
  // the largest areas first, the details over them
  const order = centers.map((_, i) => i).filter((i) => area[i]).sort((a, b) => area[b] - area[a]);
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const paths = [];
  for (const i of order) {
    const d = loops(lab, small.width, small.height, i)
      .map((loop) => simplify(loop, tolerance))
      .filter((l) => l.length >= 3)
      .map((l) => 'M' + l.map(([x, y]) => `${x} ${y}`).join('L') + 'Z')
      .join('');
    if (d) paths.push(`<path fill="${hex(centers[i])}" fill-rule="evenodd" d="${d}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${small.width} ${small.height}" shape-rendering="geometricPrecision">\n${paths.join('\n')}\n</svg>\n`;
}

module.exports = { traceSvg, palette, loops, simplify };
