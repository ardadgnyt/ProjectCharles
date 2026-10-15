// Slime's accessories, drawn in code (hats, glasses, bow, scarf, pumpkin, felt hat).
// Contains portions derived from MIT-licensed code (see THIRD-PARTY-NOTICES.md).
//
// Coordinates are BotEngine's body space: origin at the body centre, y down,
// R = W × 0.3, rx/ry from ./shape.ts. The head is a superellipsoid whose
// horizontal radius at height y (y up, −1…1) is (1 − |y|^exp)^(1/exp), so its
// silhouette matches the Slime body at yaw = pitch = 0. Accessories are seen
// slightly from above and follow the head pitch only partly, so a hat never
// flips to a top-down view.

import { Ease } from '../core/anim';
import type { Outfit, OutfitSelection } from './wardrobe';
import { PAW, SHAPE } from './shape';
const SCRIPT_FONTS = '"Segoe UI", "Arial Unicode MS"';

// Head shape (slime or slime) comes from ./shape.ts.
const VIEW_TILT = -0.3;
const ACC_PITCH = 0.4;

/** Below this radius the small details (ribs, dots, gems) are left out. */
const SIMPLIFY_BELOW_R = 16;

type Ctx = CanvasRenderingContext2D;
type Vec3 = readonly [number, number, number];
interface P3 {
  x: number;
  y: number;
  z: number;
}
interface Pt {
  x: number;
  y: number;
}

/** Head geometry + the spring lag of the soft parts (−1…1, in head units). */
export interface Head {
  R: number;
  rx: number;
  ry: number;
  yaw: number;
  pitch: number;
  physDx: number;
  physDy: number;
  /** v0.6.2: sunglasses pushed up onto the forehead (0…1). */
  lift?: number;
}

export function makeHead(R: number, yaw = 0, pitch = 0, physDx = 0, physDy = 0): Head {
  return { R, rx: R * SHAPE.rx, ry: R * SHAPE.ry, yaw, pitch, physDx, physDy };
}

// ── 3D helpers ────────────────────────────────────────────────────────────────

/** Radius of the horizontal ring of the head at height y. */
function ringR(y: number): number {
  const a = Math.min(1, Math.abs(y));
  return Math.pow(1 - Math.pow(a, SHAPE.exp), 1 / SHAPE.exp);
}

/** Head-local point (x right, y up, z toward the viewer) → body space, with depth. */
function proj(H: Head, p: Vec3): P3 {
  const [x, y, z] = p;
  const cy = Math.cos(H.yaw);
  const sy = Math.sin(H.yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const pitch = VIEW_TILT + H.pitch * ACC_PITCH;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y * cp + z1 * sp;
  const z2 = -y * sp + z1 * cp;
  return { x: x1 * H.rx, y: -y2 * H.ry, z: z2 };
}

/** Point on the head surface at height y, longitude lon (0 = facing the viewer), scaled by s. */
function surf(y: number, lon: number, s = 1): Vec3 {
  const r = ringR(y) * s;
  return [r * Math.sin(lon), y, r * Math.cos(lon)];
}

/** The visible half of a projected closed ring, left → right, cut at its silhouette. */
function frontSilhouette(pts: P3[]): P3[] {
  const n = pts.length;
  if (n < 2) return pts;
  let minI = 0;
  let maxI = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i].x < pts[minI].x) minI = i;
    if (pts[i].x > pts[maxI].x) maxI = i;
  }
  if (minI === maxI) return [pts[minI]];
  const walk = (step: number) => {
    const out: P3[] = [];
    let i = minI;
    for (;;) {
      out.push(pts[i]);
      if (i === maxI || out.length > n) break;
      i = (i + step + n) % n;
    }
    return out;
  };
  const a = walk(1);
  const b = walk(-1);
  const za = a.reduce((s, q) => s + q.z, 0) / a.length;
  const zb = b.reduce((s, q) => s + q.z, 0) / b.length;
  return za >= zb ? a : b;
}

function ring(H: Head, y: number, s: number, n = 120): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i < n; i++) pts.push(proj(H, surf(y, -Math.PI + (i / n) * 2 * Math.PI, s)));
  return pts;
}

/** Front arc of the ring at height y, ordered left → right. */
function frontArc(H: Head, y: number, s: number): P3[] {
  return frontSilhouette(ring(H, y, s));
}

/** The part of the head above the front arc of ring y — what a cap covers. */
function capClip(H: Head, y: number, s: number, extraTop = 3): Path2D {
  const arc = frontArc(H, y, s);
  const p = new Path2D();
  if (arc.length === 0) return p;
  p.moveTo(arc[0].x - H.rx, arc[0].y);
  for (const q of arc) p.lineTo(q.x, q.y);
  const last = arc[arc.length - 1];
  p.lineTo(last.x + H.rx, last.y);
  p.lineTo(H.rx * 2, -H.ry * extraTop);
  p.lineTo(-H.rx * 2, -H.ry * extraTop);
  p.closePath();
  return p;
}

/** Everything but `p`, for an even-odd clip. */
function invert(p: Path2D, H: Head): Path2D {
  const q = new Path2D();
  q.rect(-H.rx * 4, -H.ry * 4, H.rx * 8, H.ry * 8);
  q.addPath(p);
  return q;
}

/** A big rectangle: fills whatever the current clip lets through. */
function fillAll(ctx: Ctx, H: Head) {
  ctx.fillRect(-H.rx * 4, -H.ry * 4, H.rx * 8, H.ry * 8);
}

/** Slime's body outline, same superellipse as the engine. */
export function bodyOutline(rx: number, ry: number): Path2D {
  const p = new Path2D();
  const n = 96;
  const e = 2 / SHAPE.exp;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = rx * Math.sign(ca) * Math.pow(Math.abs(ca), e);
    const y = ry * Math.sign(sa) * Math.pow(Math.abs(sa), e);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function rad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(0.001, r1));
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function polyline(ctx: Ctx, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ── Eyes ──────────────────────────────────────────────────────────────────────

export interface EyeFrame {
  sd: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  visible: boolean;
  w: number;
  h: number;
}

/** Where the engine draws the eyes — the glasses sit on these. */
export function eyeFrames(H: Head): EyeFrame[] {
  return [-1, 1].map((sd) => {
    const eyeYaw = sd * SHAPE.eyeSp + H.yaw;
    const eyePitch = SHAPE.eyeP + H.pitch;
    const cp = Math.cos(eyePitch);
    return {
      sd,
      visible: Math.cos(eyeYaw) * cp > 0.04,
      x: Math.sin(eyeYaw) * cp * H.rx,
      y: -Math.sin(eyePitch) * H.ry,
      fx: Math.max(0.18, Math.cos(eyeYaw)),
      fy: Math.max(0.18, cp),
      w: H.R * SHAPE.eyeW,
      h: H.R * SHAPE.eyeH,
    };
  });
}

// ── Soft bits ─────────────────────────────────────────────────────────────────

function pompom(ctx: Ctx, x: number, y: number, r: number, base = '#FFFFFF', shade = '#D5D9E2') {
  ctx.save();
  ctx.translate(x, y);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const br = r * (0.34 + 0.06 * Math.sin(i * 2.3));
    const bx = Math.cos(a) * r * 0.78;
    const by = Math.sin(a) * r * 0.78;
    ctx.fillStyle = rad(ctx, bx - br * 0.4, by - br * 0.5, 0, br * 1.3, [
      [0, base],
      [1, shade],
    ]);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rad(ctx, -r * 0.3, -r * 0.35, 0, r * 1.05, [
    [0, base],
    [0.7, base],
    [1, shade],
  ]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Fuzzy band along a polyline (the Santa hat's trim). */
function fuzzyBand(ctx: Ctx, arc: Pt[], thick: number, base = '#FFFFFF', shade = '#DADDE4') {
  if (arc.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  polyline(ctx, arc);
  ctx.strokeStyle = shade;
  ctx.lineWidth = thick;
  ctx.stroke();
  polyline(ctx, arc);
  ctx.strokeStyle = base;
  ctx.lineWidth = thick * 0.78;
  ctx.stroke();
  const step = Math.max(2, Math.floor(arc.length / 16));
  for (let i = 0; i < arc.length; i += step) {
    const q = arc[i];
    const r = thick * (0.32 + 0.1 * Math.sin(i * 1.7));
    ctx.fillStyle = rad(ctx, q.x - r * 0.3, q.y - thick * 0.35 - r * 0.3, 0, r * 1.2, [
      [0, base],
      [1, shade],
    ]);
    ctx.beginPath();
    ctx.arc(q.x, q.y - thick * 0.32, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Beanie ────────────────────────────────────────────────────────────────────

function beanie(ctx: Ctx, H: Head, body: Path2D, simple: boolean) {
  const s = 1.035;
  const yEdge = 0.42;
  const yCuff = 0.58;
  const head = bodyOutline(H.rx * s, H.ry * s);

  // shadow on the head under the cuff
  ctx.save();
  ctx.clip(body);
  ctx.clip(capClip(H, yEdge - 0.12, 1));
  ctx.fillStyle = 'rgba(30,40,70,0.10)';
  fillAll(ctx, H);
  ctx.restore();

  // knit body
  ctx.save();
  ctx.clip(capClip(H, yCuff, s));
  ctx.fillStyle = lin(ctx, H.rx * 0.5, -H.ry * 1.1, -H.rx * 0.6, H.ry * 0.2, [
    [0, '#7DB6FF'],
    [1, '#2F6FE0'],
  ]);
  ctx.fill(head);
  if (!simple) {
    ctx.clip(head);
    ctx.strokeStyle = 'rgba(20,50,140,0.16)';
    ctx.lineWidth = H.R * 0.045;
    ctx.lineCap = 'round';
    for (let k = -6; k <= 6; k++) {
      const lon = k * 0.24;
      const pts: P3[] = [];
      for (let i = 0; i <= 16; i++) {
        const q = proj(H, surf(yCuff + ((1.05 - yCuff) * i) / 16, lon, s));
        if (q.z > 0) pts.push(q);
      }
      if (pts.length < 2) continue;
      polyline(ctx, pts);
      ctx.stroke();
    }
  }
  ctx.restore();

  // cuff — the band between yEdge and yCuff
  const cuffHead = bodyOutline(H.rx * s * 1.04, H.ry * s * 1.04);
  ctx.save();
  ctx.clip(capClip(H, yEdge, s * 1.04));
  ctx.clip(invert(capClip(H, yCuff, s * 1.04), H), 'evenodd');
  ctx.fillStyle = lin(ctx, 0, -H.ry * 0.6, 0, -H.ry * 0.2, [
    [0, '#3C7BEA'],
    [1, '#2257C4'],
  ]);
  ctx.fill(cuffHead);
  ctx.clip(cuffHead);
  ctx.strokeStyle = 'rgba(10,30,100,0.22)';
  ctx.lineWidth = H.R * 0.035;
  for (let k = -14; k <= 14; k++) {
    const lon = k * 0.115;
    const a = proj(H, surf(yEdge, lon, s * 1.04));
    const b = proj(H, surf(yCuff, lon, s * 1.04));
    if (a.z < 0) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  // top highlight
  ctx.save();
  ctx.clip(capClip(H, yCuff, s));
  ctx.clip(head);
  ctx.fillStyle = rad(ctx, H.rx * 0.3, -H.ry * 0.85, 0, H.R * 0.45, [
    [0, 'rgba(255,255,255,0.35)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fill(head);
  ctx.restore();

  // pompom on a short spring
  const top = proj(H, [0, 1.08 * s, 0]);
  pompom(
    ctx,
    top.x + H.physDx * H.rx * 0.25,
    top.y - H.R * 0.12 + H.physDy * H.ry * 0.15,
    H.R * 0.24,
  );
}

// ── Santa hat ─────────────────────────────────────────────────────────────────

function santaHat(ctx: Ctx, H: Head, body: Path2D) {
  const s = 1.05;
  const yEdge = 0.52;
  const arc = frontArc(H, yEdge, s);
  if (arc.length === 0) return;
  const L = arc[0];
  const Rt = arc[arc.length - 1];
  const crown = proj(H, [0, 1.05, 0]);
  // the tip flops to the right and down, plus the spring lag
  const tip = {
    x: crown.x + H.rx * (0.95 + H.physDx * 0.35),
    y: crown.y + H.ry * (0.05 + H.physDy * 0.2),
  };
  const peak = { x: crown.x + H.rx * 0.25, y: crown.y - H.ry * 0.62 };
  const bag = new Path2D();
  bag.moveTo(L.x, L.y);
  bag.bezierCurveTo(
    L.x - H.rx * 0.05,
    L.y - H.ry * 0.7,
    peak.x - H.rx * 0.55,
    peak.y - H.ry * 0.05,
    peak.x,
    peak.y,
  );
  bag.quadraticCurveTo(tip.x - H.rx * 0.05, peak.y - H.ry * 0.02, tip.x, tip.y);
  bag.quadraticCurveTo(
    tip.x - H.rx * 0.12,
    tip.y - H.ry * 0.22,
    peak.x + H.rx * 0.18,
    peak.y + H.ry * 0.32,
  );
  bag.bezierCurveTo(
    Rt.x + H.rx * 0.05,
    peak.y + H.ry * 0.45,
    Rt.x + H.rx * 0.08,
    Rt.y - H.ry * 0.35,
    Rt.x,
    Rt.y,
  );
  for (let i = arc.length - 1; i >= 0; i--) bag.lineTo(arc[i].x, arc[i].y);
  bag.closePath();

  ctx.save();
  ctx.clip(body);
  ctx.clip(capClip(H, yEdge - 0.14, 1));
  ctx.fillStyle = 'rgba(120,10,10,0.10)';
  fillAll(ctx, H);
  ctx.restore();

  ctx.fillStyle = lin(ctx, -H.rx * 0.6, -H.ry * 1.6, H.rx * 0.7, -H.ry * 0.3, [
    [0, '#FF6B6B'],
    [0.55, '#E53935'],
    [1, '#B71C1C'],
  ]);
  ctx.fill(bag);

  // folds following the flop
  ctx.save();
  ctx.clip(bag);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(90,0,0,0.20)';
  for (const [a, b, w] of [
    [0.15, 0.55, 0.1],
    [0.45, 0.85, 0.08],
  ]) {
    ctx.beginPath();
    ctx.moveTo(peak.x - H.rx * 0.1 + (Rt.x - L.x) * a * 0.3, peak.y + H.ry * 0.15);
    ctx.quadraticCurveTo(
      peak.x + H.rx * 0.35,
      peak.y + H.ry * (0.05 + a * 0.3),
      tip.x - H.rx * (0.45 - b * 0.3),
      tip.y - H.ry * 0.12,
    );
    ctx.lineWidth = H.R * w;
    ctx.stroke();
  }
  ctx.fillStyle = rad(ctx, peak.x - H.rx * 0.25, peak.y + H.ry * 0.05, 0, H.R * 0.5, [
    [0, 'rgba(255,255,255,0.32)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fill(bag);
  ctx.restore();

  fuzzyBand(ctx, arc, H.R * 0.3);
  pompom(ctx, tip.x, tip.y + H.R * 0.04, H.R * 0.22);
}

// ── Party hat ─────────────────────────────────────────────────────────────────

// Felt hat: a small top hat with a red band, sitting on top of the head.
function fedora(ctx: Ctx, H: Head, simple: boolean) {
  const lean = H.physDx * 0.05 + Math.sin(H.yaw) * 0.04;
  // Sits on the flat top: looking down must not tip it forward into the head (the body's
  // outline does not tip, so the head top showed beside the brim). A touch above the top.
  const c = proj({ ...H, pitch: Math.max(0, H.pitch) }, [Math.sin(H.yaw) * 0.05, 1.05, 0]);
  // A small hat sitting on top of the head (brim on the top edge, not sunk into it).
  const brimW = H.rx * 0.6;
  const brimH = H.ry * 0.09;
  const baseW = H.rx * 0.35;
  const topW = H.rx * 0.385;
  const h = H.ry * 0.66;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(lean);
  const outline = 'rgba(20,16,26,0.95)';
  const lw = Math.max(1, H.R * 0.035);
  // brim (back half)
  ctx.beginPath();
  ctx.ellipse(0, 0, brimW, brimH, 0, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, -brimW, 0, brimW, 0, [
    [0, '#2b2733'],
    [0.5, '#3b3645'],
    [1, '#24212b'],
  ]);
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = outline;
  ctx.stroke();
  // crown (slightly wider at the top)
  const crown = new Path2D();
  crown.moveTo(-baseW, 0);
  crown.lineTo(-topW, -h);
  crown.ellipse(0, -h, topW, brimH * 0.55, 0, Math.PI, 0);
  crown.lineTo(baseW, 0);
  crown.ellipse(0, 0, baseW, brimH * 0.55, 0, 0, Math.PI);
  crown.closePath();
  ctx.fillStyle = lin(ctx, -topW, 0, topW, 0, [
    [0, '#4a4458'],
    [0.35, '#5f5871'],
    [0.7, '#4c465a'],
    [1, '#38333f'],
  ]);
  ctx.fill(crown);
  if (!simple) {
    // soft highlight on the left of the crown
    ctx.save();
    ctx.clip(crown);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-topW * 0.62, -h, topW * 0.22, h);
    ctx.restore();
  }
  // red band
  const bandH = h * 0.2;
  const band = new Path2D();
  const bw0 = baseW;
  const bw1 = baseW + (topW - baseW) * (bandH / h);
  band.moveTo(-bw0, 0);
  band.lineTo(-bw1, -bandH);
  band.ellipse(0, -bandH, bw1, brimH * 0.55, 0, Math.PI, 0, true);
  band.lineTo(bw0, 0);
  band.ellipse(0, 0, bw0, brimH * 0.55, 0, 0, Math.PI);
  band.closePath();
  ctx.fillStyle = lin(ctx, -bw0, 0, bw0, 0, [
    [0, '#c22a2a'],
    [0.4, '#e2403a'],
    [1, '#a51f22'],
  ]);
  ctx.fill(band);
  ctx.lineWidth = lw;
  ctx.strokeStyle = outline;
  ctx.stroke(crown);
  // top of the crown
  ctx.beginPath();
  ctx.ellipse(0, -h, topW, brimH * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5a536a';
  ctx.fill();
  ctx.stroke();
  // brim front edge over the crown base
  ctx.beginPath();
  ctx.ellipse(0, 0, brimW, brimH, 0, 0.05, Math.PI - 0.05);
  ctx.lineTo(-baseW, brimH * 0.15);
  ctx.ellipse(0, brimH * 0.15, baseW, brimH * 0.55, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = '#2f2b37';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, brimW, brimH, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function partyHat(ctx: Ctx, H: Head, simple: boolean) {
  const baseY = 0.82;
  const baseR = 0.42;
  const lean = -0.24 + H.physDx * 0.12;
  const c = proj(H, [0.16, baseY + 0.06, 0]);
  const rim: P3[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    rim.push(proj(H, [0.16 + baseR * Math.sin(a), baseY + 0.06, baseR * Math.cos(a)]));
  }
  const left = rim.reduce((m, q) => (q.x < m.x ? q : m));
  const right = rim.reduce((m, q) => (q.x > m.x ? q : m));
  const h = H.ry * 1.6;
  const apex = { x: c.x + Math.sin(lean) * h, y: c.y - Math.cos(lean) * h };
  const front = frontSilhouette(rim);

  const cone = new Path2D();
  cone.moveTo(left.x, left.y);
  cone.quadraticCurveTo(
    (left.x + apex.x) / 2 - H.rx * 0.06,
    (left.y + apex.y) / 2,
    apex.x - H.R * 0.05,
    apex.y + H.R * 0.06,
  );
  cone.quadraticCurveTo(apex.x, apex.y - H.R * 0.03, apex.x + H.R * 0.05, apex.y + H.R * 0.06);
  cone.quadraticCurveTo(
    (right.x + apex.x) / 2 + H.rx * 0.06,
    (right.y + apex.y) / 2,
    right.x,
    right.y,
  );
  for (let i = front.length - 1; i >= 0; i--) cone.lineTo(front[i].x, front[i].y);
  cone.closePath();
  ctx.fillStyle = lin(ctx, left.x, apex.y, right.x, left.y, [
    [0, '#FF9BD0'],
    [0.5, '#F15BAE'],
    [1, '#C2187A'],
  ]);
  ctx.fill(cone);

  ctx.save();
  ctx.clip(cone);
  if (!simple) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const dots = [
      [0.25, -0.35],
      [0.3, 0.3],
      [0.55, -0.05],
      [0.72, 0.28],
      [0.8, -0.3],
      [0.45, 0.6],
      [0.48, -0.65],
    ];
    for (const [t, u] of dots) {
      const bx = left.x + (right.x - left.x) * (0.5 + u * 0.5);
      const by = left.y + (right.y - left.y) * (0.5 + u * 0.5);
      const x = bx + (apex.x - bx) * (1 - t);
      const y = by + (apex.y - by) * (1 - t);
      const r = H.R * 0.075 * (0.6 + t * 0.5);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = lin(ctx, left.x, 0, right.x, 0, [
    [0, 'rgba(255,255,255,0.28)'],
    [0.35, 'rgba(255,255,255,0)'],
    [1, 'rgba(80,0,40,0.18)'],
  ]);
  ctx.fill(cone);
  ctx.restore();

  if (front.length > 1) {
    polyline(ctx, front);
    ctx.strokeStyle = '#FFD84D';
    ctx.lineWidth = H.R * 0.07;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  pompom(ctx, apex.x, apex.y - H.R * 0.04, H.R * 0.16, '#FFE27A', '#F2B705');
}

// ── Crown ─────────────────────────────────────────────────────────────────────

const CROWN_YB = 0.46;

/** side −1: the back half, behind the head; +1: the front half. */
function crownPart(ctx: Ctx, H: Head, side: number, simple: boolean) {
  const s = 1.06;
  const yb = CROWN_YB;
  const yt = 0.66;
  const n = 8;
  const spikeH = 0.42;
  const N = 120;
  const seg: { b: P3; tt: P3; z: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const lon = -Math.PI + (i / N) * 2 * Math.PI;
    const b = proj(H, surf(yb, lon, s));
    const phase = ((lon + Math.PI) / (2 * Math.PI)) * n;
    const f = phase - Math.floor(phase);
    const spike = Math.pow(Math.max(0, 1 - Math.abs(f - 0.5) * 2), 1.6);
    const sp = surf(yt, lon, s);
    const tt = proj(H, [
      sp[0] * (1 - 0.08 * spike),
      yt + spikeH * spike,
      sp[2] * (1 - 0.08 * spike),
    ]);
    seg.push({ b, tt, z: b.z });
  }
  const keep = seg.filter((q) => (side > 0 ? q.z >= 0 : q.z < 0.02));
  if (keep.length < 2) return;
  keep.sort((a, b) => a.b.x - b.b.x);
  const shape = new Path2D();
  keep.forEach((q, i) => (i ? shape.lineTo(q.tt.x, q.tt.y) : shape.moveTo(q.tt.x, q.tt.y)));
  for (let i = keep.length - 1; i >= 0; i--) shape.lineTo(keep[i].b.x, keep[i].b.y);
  shape.closePath();

  const dark = side < 0;
  ctx.fillStyle = lin(
    ctx,
    0,
    -H.ry * 1.05,
    0,
    -H.ry * 0.45,
    dark
      ? [
          [0, '#C98A12'],
          [1, '#8A5A06'],
        ]
      : [
          [0, '#FFE58A'],
          [0.5, '#FBBF24'],
          [1, '#D08A0B'],
        ],
  );
  ctx.fill(shape);
  if (dark) return;

  ctx.save();
  ctx.clip(shape);
  ctx.fillStyle = lin(ctx, -H.rx, 0, H.rx, 0, [
    [0, 'rgba(120,70,0,0.25)'],
    [0.45, 'rgba(255,255,255,0)'],
    [0.62, 'rgba(255,255,255,0.35)'],
    [1, 'rgba(120,70,0,0.25)'],
  ]);
  ctx.fill(shape);
  ctx.restore();
  if (simple) return;

  const gems = ['#EF4444', '#3B82F6', '#22C55E', '#A855F7'];
  for (let k = 0; k < n; k++) {
    const lon = -Math.PI + ((k + 0.5) / n) * 2 * Math.PI;
    const sp = surf(yt, lon, s);
    const tipP = proj(H, [sp[0] * 0.92, yt + spikeH, sp[2] * 0.92]);
    const mid = proj(H, surf((yb + yt) / 2, lon, s * 1.01));
    if (mid.z <= 0.12) continue;
    const r = H.R * 0.055;
    ctx.beginPath();
    ctx.arc(tipP.x, tipP.y - r * 0.5, r, 0, Math.PI * 2);
    ctx.fillStyle = rad(ctx, tipP.x - r * 0.3, tipP.y - r, 0, r * 1.2, [
      [0, '#FFF6CC'],
      [1, '#E0A21A'],
    ]);
    ctx.fill();
    const gr = H.R * 0.075;
    ctx.beginPath();
    ctx.ellipse(mid.x, mid.y, gr * Math.max(0.35, mid.z), gr, 0, 0, Math.PI * 2);
    ctx.fillStyle = gems[k % gems.length];
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mid.x - gr * 0.25 * mid.z, mid.y - gr * 0.35, gr * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
  }
}

function crownFront(ctx: Ctx, H: Head, body: Path2D, simple: boolean) {
  // shadow of the band on the head
  ctx.save();
  ctx.clip(body);
  ctx.clip(capClip(H, CROWN_YB - 0.1, 1));
  ctx.clip(invert(capClip(H, CROWN_YB, 1), H), 'evenodd');
  ctx.fillStyle = 'rgba(80,50,0,0.12)';
  fillAll(ctx, H);
  ctx.restore();
  crownPart(ctx, H, 1, simple);
}

// ── Witch hat ─────────────────────────────────────────────────────────────────

function witchBrim(H: Head): P3[] {
  const y = 0.7;
  const rr = 1.42;
  const pts: P3[] = [];
  for (let i = 0; i <= 120; i++) {
    const a = -Math.PI + (i / 120) * 2 * Math.PI;
    const wob = 1 + 0.035 * Math.sin(a * 3 + 0.6);
    const droop = -0.1 * Math.pow(Math.abs(Math.sin(a)), 2); // the edges droop a little
    pts.push(proj(H, [rr * wob * Math.sin(a), y + droop, rr * wob * Math.cos(a)]));
  }
  return pts;
}

function closedPath(pts: Pt[]): Path2D {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
  p.closePath();
  return p;
}

/** The whole brim, behind the head; front() paints its front half again. */
function witchHatBack(ctx: Ctx, H: Head) {
  ctx.fillStyle = lin(ctx, 0, -H.ry, 0, -H.ry * 0.4, [
    [0, '#2A0A4F'],
    [1, '#3B0F6B'],
  ]);
  ctx.fill(closedPath(witchBrim(H)));
}

function witchHatFront(ctx: Ctx, H: Head, body: Path2D) {
  const all = witchBrim(H);
  const brim = closedPath(all);
  const fr = all.filter((p) => p.z >= 0).sort((a, b) => a.x - b.x);

  ctx.save();
  ctx.clip(body);
  ctx.clip(capClip(H, 0.5, 1));
  ctx.fillStyle = 'rgba(40,0,70,0.10)';
  fillAll(ctx, H);
  ctx.restore();

  ctx.fillStyle = lin(ctx, 0, -H.ry * 0.9, 0, -H.ry * 0.3, [
    [0, '#5B21B6'],
    [1, '#3B0764'],
  ]);
  ctx.fill(brim);
  if (fr.length > 1) {
    polyline(ctx, fr);
    ctx.strokeStyle = 'rgba(190,150,255,0.35)';
    ctx.lineWidth = H.R * 0.035;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // cone: base ring r = 0.62 at y = 0.74, tall apex, the tip bends over
  const baseR = 0.62;
  const by = 0.74;
  const bl = proj(H, [-baseR, by, 0]);
  const br = proj(H, [baseR, by, 0]);
  const c = proj(H, [0, by, 0]);
  const lean = 0.1 + H.physDx * 0.15;
  const top = { x: c.x + H.rx * 0.18 + Math.sin(lean) * H.ry * 0.3, y: c.y - H.ry * 1.25 };
  const tip = {
    x: top.x + H.rx * (0.45 + H.physDx * 0.25),
    y: top.y + H.ry * (0.22 + H.physDy * 0.1),
  };
  const capFront = frontArc(H, by, baseR / ringR(by)).filter(
    (q) => q.x >= bl.x - 1 && q.x <= br.x + 1,
  );
  const cone = new Path2D();
  cone.moveTo(bl.x, bl.y);
  cone.bezierCurveTo(
    bl.x + H.rx * 0.12,
    bl.y - H.ry * 0.5,
    top.x - H.rx * 0.28,
    top.y + H.ry * 0.25,
    top.x - H.rx * 0.02,
    top.y - H.ry * 0.02,
  );
  cone.quadraticCurveTo(top.x + H.rx * 0.25, top.y - H.ry * 0.08, tip.x, tip.y);
  cone.quadraticCurveTo(
    top.x + H.rx * 0.22,
    top.y + H.ry * 0.08,
    top.x + H.rx * 0.14,
    top.y + H.ry * 0.22,
  );
  cone.bezierCurveTo(
    br.x - H.rx * 0.18,
    c.y - H.ry * 0.45,
    br.x - H.rx * 0.02,
    br.y - H.ry * 0.2,
    br.x,
    br.y,
  );
  for (let i = capFront.length - 1; i >= 0; i--) cone.lineTo(capFront[i].x, capFront[i].y);
  cone.closePath();
  ctx.fillStyle = lin(ctx, bl.x, top.y, br.x, bl.y, [
    [0, '#7C3AED'],
    [0.55, '#4C1D95'],
    [1, '#2E1065'],
  ]);
  ctx.fill(cone);

  ctx.save();
  ctx.clip(cone);
  ctx.fillStyle = lin(ctx, bl.x, 0, br.x, 0, [
    [0, 'rgba(255,255,255,0.22)'],
    [0.4, 'rgba(255,255,255,0)'],
    [1, 'rgba(0,0,0,0.15)'],
  ]);
  ctx.fill(cone);
  // crease where the tip bends
  ctx.beginPath();
  ctx.moveTo(top.x - H.rx * 0.05, top.y + H.ry * 0.05);
  ctx.quadraticCurveTo(
    top.x + H.rx * 0.1,
    top.y + H.ry * 0.12,
    top.x + H.rx * 0.2,
    top.y + H.ry * 0.06,
  );
  ctx.strokeStyle = 'rgba(20,0,40,0.35)';
  ctx.lineWidth = H.R * 0.05;
  ctx.lineCap = 'round';
  ctx.stroke();
  // orange band, just above the base
  const fc = proj(H, [0, by, baseR]);
  const lift = H.ry * 0.11;
  ctx.beginPath();
  ctx.moveTo(bl.x - 2, bl.y - lift);
  ctx.quadraticCurveTo(fc.x, 2 * (fc.y - lift) - (bl.y + br.y) / 2, br.x + 2, br.y - lift);
  ctx.strokeStyle = '#F97316';
  ctx.lineWidth = H.ry * 0.17;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.restore();

  // buckle
  const bw = H.R * 0.2;
  const bh = H.R * 0.16;
  ctx.save();
  ctx.translate(fc.x, fc.y - H.ry * 0.11);
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.25);
  ctx.fillStyle = '#FCD34D';
  ctx.fill();
  roundRect(ctx, -bw / 2 + bw * 0.24, -bh / 2 + bh * 0.28, bw * 0.52, bh * 0.44, bh * 0.1);
  ctx.fillStyle = '#C2410C';
  ctx.fill();
  ctx.restore();
}

// ── Glasses (pinned to the real eye positions) ────────────────────────────────

function sunglasses(ctx: Ctx, H: Head, body: Path2D) {
  const eyes = eyeFrames(H);
  const w = H.R * 0.62;
  const h = H.R * 0.46;
  ctx.save();
  ctx.clip(body);
  if (H.lift) ctx.translate(0, -H.lift * H.ry * 0.56);
  ctx.strokeStyle = '#111317';
  ctx.lineCap = 'round';
  const [l, r] = eyes;
  if (l.visible && r.visible) {
    ctx.beginPath();
    ctx.moveTo(l.x + (w / 2) * l.fx * 0.9, l.y - h * 0.18);
    ctx.quadraticCurveTo(
      (l.x + r.x) / 2,
      (l.y + r.y) / 2 - h * 0.42,
      r.x - (w / 2) * r.fx * 0.9,
      r.y - h * 0.18,
    );
    ctx.lineWidth = H.R * 0.07;
    ctx.stroke();
  }
  ctx.lineWidth = H.R * 0.06;
  for (const e of eyes) {
    if (!e.visible) continue;
    ctx.beginPath();
    ctx.moveTo(e.x + ((e.sd * w) / 2) * e.fx, e.y - h * 0.2);
    ctx.lineTo(e.sd * H.rx * 1.05, e.y - h * 0.35);
    ctx.stroke();
  }
  for (const e of eyes) {
    if (!e.visible) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.fx, e.fy);
    roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.42);
    ctx.fillStyle = 'rgba(17,19,23,0.82)';
    ctx.fill();
    ctx.lineWidth = H.R * 0.05;
    ctx.strokeStyle = '#0B0C0F';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, -h * 0.05);
    ctx.lineTo(-w * 0.05, -h * 0.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// v0.6.2: big aviator shades — wide dark lenses joined by a thick bridge, with bright
// zig-zag reflections (like the user's reference picture).
function bigShades(ctx: Ctx, H: Head, body: Path2D) {
  const eyes = eyeFrames(H);
  const w = H.R * 0.82;
  const h = H.R * 0.6;
  const frame = '#2a2420';
  ctx.save();
  ctx.clip(body);
  if (H.lift) ctx.translate(0, -H.lift * H.ry * 0.66);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const [l, r] = eyes;
  // top bar across both lenses
  if (l.visible && r.visible) {
    ctx.beginPath();
    ctx.moveTo(l.x - (w / 2) * l.fx, l.y - h * 0.46);
    ctx.lineTo(r.x + (w / 2) * r.fx, r.y - h * 0.46);
    ctx.strokeStyle = frame;
    ctx.lineWidth = H.R * 0.085;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(l.x + (w / 2) * l.fx * 0.95, l.y - h * 0.18);
    ctx.quadraticCurveTo((l.x + r.x) / 2, (l.y + r.y) / 2 - h * 0.3, r.x - (w / 2) * r.fx * 0.95, r.y - h * 0.18);
    ctx.lineWidth = H.R * 0.07;
    ctx.stroke();
  }
  for (const e of eyes) {
    if (!e.visible) continue;
    ctx.beginPath();
    ctx.moveTo(e.x + ((e.sd * w) / 2) * e.fx, e.y - h * 0.35);
    ctx.lineTo(e.sd * H.rx * 1.05, e.y - h * 0.45);
    ctx.strokeStyle = frame;
    ctx.lineWidth = H.R * 0.07;
    ctx.stroke();
  }
  for (const e of eyes) {
    if (!e.visible) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.fx, e.fy);
    // aviator lens: flat top, round bottom, slightly wider towards the outside
    const lens = new Path2D();
    lens.moveTo(-w / 2, -h * 0.45);
    lens.lineTo(w / 2, -h * 0.45);
    lens.bezierCurveTo(w * 0.56, h * 0.15, w * 0.32, h * 0.55, 0, h * 0.55);
    lens.bezierCurveTo(-w * 0.32, h * 0.55, -w * 0.56, h * 0.15, -w / 2, -h * 0.45);
    lens.closePath();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, 'rgba(70,50,55,0.95)');
    g.addColorStop(1, 'rgba(25,20,24,0.95)');
    ctx.fillStyle = g;
    ctx.fill(lens);
    // zig-zag reflections
    ctx.save();
    ctx.clip(lens);
    ctx.fillStyle = 'rgba(255,236,200,0.75)';
    for (const off of [-0.18, 0.16]) {
      const zz = new Path2D();
      const x0 = w * off;
      zz.moveTo(x0 - w * 0.1, -h * 0.5);
      zz.lineTo(x0 + w * 0.03, -h * 0.5);
      zz.lineTo(x0 - w * 0.06, -h * 0.05);
      zz.lineTo(x0 + w * 0.06, -h * 0.05);
      zz.lineTo(x0 - w * 0.08, h * 0.6);
      zz.lineTo(x0 - w * 0.16, h * 0.6);
      zz.lineTo(x0 - w * 0.1, h * 0.05);
      zz.lineTo(x0 - w * 0.2, h * 0.05);
      zz.closePath();
      ctx.fill(zz);
    }
    ctx.restore();
    ctx.lineWidth = H.R * 0.06;
    ctx.strokeStyle = frame;
    ctx.stroke(lens);
    ctx.restore();
  }
  ctx.restore();
}

// v0.6.2: a banana standing beside the head, leaning on it (the user's reference picture).
// The banana stands upright in the side of the head, its lower half sunk into the jelly: the
// part inside the body is drawn faded, so the Slime's colour shows through; the tip sticks out
// above the head.
function banana(ctx: Ctx, H: Head, body: Path2D) {
  const side = 1; // always on the right side of the head
  const bx = H.rx * (0.42 + Math.cos(H.yaw) * 0.12 - Math.min(0, Math.sin(H.yaw)) * 0.14);
  const by = -H.ry * 0.36;
  const s = H.R * 1.08;
  const sway = H.physDx * 0.08;
  const shape = () => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(side * (0.16 + sway));
    ctx.scale(side, 1);
    const peel = new Path2D();
    peel.moveTo(-s * 0.08, -s * 0.95);
    peel.bezierCurveTo(s * 0.45, -s * 0.7, s * 0.55, s * 0.15, s * 0.12, s * 0.66);
    peel.bezierCurveTo(s * 0.02, s * 0.76, -s * 0.12, s * 0.7, -s * 0.06, s * 0.56);
    peel.bezierCurveTo(s * 0.22, s * 0.1, s * 0.18, -s * 0.55, -s * 0.16, -s * 0.84);
    peel.closePath();
    const g = ctx.createLinearGradient(-s * 0.2, 0, s * 0.5, 0);
    g.addColorStop(0, '#ffe66b');
    g.addColorStop(0.55, '#f6cf2e');
    g.addColorStop(1, '#d9a812');
    ctx.fillStyle = g;
    ctx.fill(peel);
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.strokeStyle = '#8a6206';
    ctx.stroke(peel);
    ctx.beginPath();
    ctx.moveTo(s * 0.02, -s * 0.66);
    ctx.bezierCurveTo(s * 0.3, -s * 0.45, s * 0.33, -s * 0.05, s * 0.2, s * 0.25);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = s * 0.045;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.fillStyle = '#7a5410';
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.96);
    ctx.lineTo(-s * 0.02, -s * 1.12);
    ctx.lineTo(s * 0.08, -s * 1.08);
    ctx.lineTo(-s * 0.02, -s * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.03, s * 0.66, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  // outside the body: solid
  const outside = new Path2D();
  outside.rect(-H.R * 4, -H.R * 4, H.R * 8, H.R * 8);
  outside.addPath(body);
  ctx.save();
  ctx.clip(outside, 'evenodd');
  shape();
  ctx.restore();
  // inside the body: sunk into the jelly
  ctx.save();
  ctx.clip(body);
  ctx.globalAlpha *= 0.42;
  shape();
  ctx.restore();
}

// v0.6.3: a Turkish flag held in Slime's left paw (19 Mayıs, 30 Ağustos, 29 Ekim, 10 Kasım —
// worn automatically on those days, see wardrobe.ts). The pole stands beside the body and the
// cloth flies over the top-left corner of the head (a hat is drawn in front of it); it waves
// in strips.
function turkishFlagCloth(ctx: Ctx, w: number, h: number) {
  // hoist at x = 0, the fly at x = w; proportions after the flag law (G = height)
  const g = h;
  ctx.fillStyle = '#e30a17';
  ctx.fillRect(0, 0, w, h);
  const cx = g * 0.5; // outer crescent circle centre, ½ G from the hoist
  const cy = h / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, g * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e30a17';
  ctx.beginPath();
  ctx.arc(cx + g * 0.0625, cy, g * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // five-pointed star, its centre ⅓ G from the crescent centre, one point towards the hoist
  const sx = cx + g * 0.333;
  const sr = g * 0.125;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + (i * Math.PI) / 5;
    const r = i % 2 ? sr * 0.382 : sr;
    const px = sx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function turkishFlag(ctx: Ctx, H: Head) {
  const t = performance.now() / 1000;
  const R = H.R;
  const sway = H.physDx * 0.12;
  const px = -H.rx * 0.95; // the pole, beside the left side of the body
  const pawY = H.ry * 0.36;
  const top = -H.ry * 1.36;
  const bottom = H.ry * 0.62;
  const w = R * 0.74;
  const h = R * 0.49;
  ctx.save();
  ctx.translate(px, pawY);
  ctx.rotate(0.05 + sway + Math.sin(t * 1.6) * 0.025);
  ctx.translate(-px, -pawY);
  // cloth: vertical strips, each lifted a little more the further it is from the pole
  const n = 12;
  for (let i = 0; i < n; i++) {
    const d = i / n;
    const dy = Math.sin(t * 5 - i * 0.65) * R * 0.035 * (0.3 + d);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + (w * i) / n - 0.6, top - R, w / n + 1.2, R * 2);
    ctx.clip();
    ctx.translate(px, top + R * 0.03 + dy);
    turkishFlagCloth(ctx, w, h);
    // light and shade of the folds
    ctx.fillStyle = `rgba(${dy > 0 ? '0,0,0' : '255,255,255'},${Math.min(0.16, (Math.abs(dy) / R) * 2.2)})`;
    ctx.fillRect((w * i) / n, 0, w / n, h);
    ctx.restore();
  }
  // pole with a golden finial
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6d4a26';
  ctx.lineWidth = Math.max(1.5, R * 0.055);
  ctx.beginPath();
  ctx.moveTo(px, bottom);
  ctx.lineTo(px, top - R * 0.02);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = Math.max(0.6, R * 0.018);
  ctx.beginPath();
  ctx.moveTo(px - R * 0.012, bottom);
  ctx.lineTo(px - R * 0.012, top);
  ctx.stroke();
  ctx.fillStyle = '#e8b730';
  ctx.beginPath();
  ctx.arc(px, top - R * 0.06, R * 0.05, 0, Math.PI * 2);
  ctx.fill();
  // the paw holding it
  ctx.fillStyle = PAW.dark;
  ctx.beginPath();
  ctx.ellipse(px, pawY, R * 0.15, R * 0.11, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1, R * 0.03);
  if (PAW.edge) {
    ctx.strokeStyle = PAW.edge;
    ctx.stroke();
  }
  ctx.fillStyle = PAW.light;
  ctx.globalAlpha *= 0.6;
  ctx.beginPath();
  ctx.ellipse(px - R * 0.04, pawY - R * 0.03, R * 0.06, R * 0.035, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundGlasses(ctx: Ctx, H: Head, body: Path2D) {
  const eyes = eyeFrames(H);
  const d = H.R * 0.56;
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = '#8A4B12';
  ctx.lineCap = 'round';
  const [l, r] = eyes;
  if (l.visible && r.visible) {
    ctx.beginPath();
    ctx.moveTo(l.x + (d / 2) * l.fx, l.y - d * 0.08);
    ctx.quadraticCurveTo(
      (l.x + r.x) / 2,
      (l.y + r.y) / 2 - d * 0.3,
      r.x - (d / 2) * r.fx,
      r.y - d * 0.08,
    );
    ctx.lineWidth = H.R * 0.055;
    ctx.stroke();
  }
  ctx.lineWidth = H.R * 0.05;
  for (const e of eyes) {
    if (!e.visible) continue;
    ctx.beginPath();
    ctx.moveTo(e.x + ((e.sd * d) / 2) * e.fx, e.y - d * 0.1);
    ctx.lineTo(e.sd * H.rx * 1.05, e.y - d * 0.25);
    ctx.stroke();
  }
  for (const e of eyes) {
    if (!e.visible) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.fx, e.fy);
    ctx.beginPath();
    ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190,225,255,0.18)';
    ctx.fill();
    ctx.lineWidth = H.R * 0.065;
    ctx.strokeStyle = '#9A5A1A';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, d / 2 - H.R * 0.03, Math.PI * 1.1, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = H.R * 0.03;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ── Monocle (v0.6.1) ─────────────────────────────────────────────────────────
// A gold-rimmed single glass on the right eye with a bead chain hanging down the cheek.

function monocle(ctx: Ctx, H: Head) {
  const e = eyeFrames(H).find((f) => f.sd === 1);
  if (!e || !e.visible) return;
  const r = H.R * 0.27;
  const gold = '#b8780f';
  const goldDark = '#7d4f06';
  ctx.save();
  // chain: from the bottom-left of the rim, down and curving out past the body edge
  const sx = e.x - r * 0.62 * e.fx;
  const sy = e.y + r * 0.78;
  const ex = e.x + H.rx * 0.35;
  const ey = H.ry * 1.02;
  const c1x = sx - H.rx * 0.08;
  const c1y = sy + H.ry * 0.45;
  const c2x = ex - H.rx * 0.45;
  const c2y = ey - H.ry * 0.35;
  const beads = Math.max(10, Math.round(H.R * 0.42));
  const br = Math.max(0.7, H.R * 0.034);
  for (let i = 0; i <= beads; i++) {
    const t = i / beads;
    const mt = 1 - t;
    const x = mt * mt * mt * sx + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * ex;
    const y = mt * mt * mt * sy + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * ey;
    ctx.beginPath();
    ctx.arc(x, y, br, 0, Math.PI * 2);
    ctx.fillStyle = gold;
    ctx.fill();
    ctx.lineWidth = br * 0.45;
    ctx.strokeStyle = goldDark;
    ctx.stroke();
  }
  // glass + rim
  ctx.translate(e.x, e.y);
  ctx.scale(e.fx, e.fy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  ctx.lineWidth = H.R * 0.07;
  ctx.strokeStyle = gold;
  ctx.stroke();
  ctx.lineWidth = H.R * 0.018;
  ctx.strokeStyle = goldDark;
  ctx.beginPath();
  ctx.arc(0, 0, r + H.R * 0.035, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r - H.R * 0.04, Math.PI * 1.1, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = H.R * 0.03;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// ── Scarf ─────────────────────────────────────────────────────────────────────

function scarf(ctx: Ctx, H: Head) {
  const s = 1.05;
  const y0 = -0.34;
  const y1 = -0.66;
  const top = frontArc(H, y0, s);
  const bot = frontArc(H, y1, s);
  if (top.length === 0 || bot.length === 0) return;
  const band = new Path2D();
  top.forEach((q, i) => (i ? band.lineTo(q.x, q.y) : band.moveTo(q.x, q.y)));
  for (let i = bot.length - 1; i >= 0; i--) band.lineTo(bot[i].x, bot[i].y);
  band.closePath();

  ctx.save();
  ctx.clip(bodyOutline(H.rx * s, H.ry * s));
  ctx.fillStyle = lin(ctx, 0, -H.ry * 0.2, 0, H.ry * 0.7, [
    [0, '#F87171'],
    [1, '#B91C1C'],
  ]);
  ctx.fill(band);
  ctx.save();
  ctx.clip(band);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineCap = 'round';
  for (const lon of [-1.0, -0.45, 0.1, 0.65, 1.2]) {
    const a = proj(H, surf(y0, lon, s));
    const b = proj(H, surf(y1, lon, s));
    if (a.z < 0) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 4);
    ctx.lineTo(b.x, b.y + 4);
    ctx.lineWidth = H.R * 0.09 * Math.max(0.3, a.z);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = lin(ctx, 0, -H.ry * 0.5, 0, H.ry * 0.3, [
    [0, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(0,0,0,0.1)'],
  ]);
  ctx.fill(band);
  ctx.restore();

  // the hanging end, from the knot
  const k = proj(H, surf((y0 + y1) / 2, -0.55, s * 1.03));
  if (k.z <= 0) return;
  const sw = H.physDx * H.rx * 0.12;
  const end = new Path2D();
  end.moveTo(k.x - H.R * 0.16, k.y);
  end.quadraticCurveTo(
    k.x - H.R * 0.24 + sw,
    k.y + H.ry * 0.35,
    k.x - H.R * 0.2 + sw * 1.4,
    k.y + H.ry * 0.62,
  );
  end.lineTo(k.x + H.R * 0.06 + sw * 1.4, k.y + H.ry * 0.6);
  end.quadraticCurveTo(k.x + H.R * 0.02 + sw, k.y + H.ry * 0.3, k.x + H.R * 0.12, k.y);
  end.closePath();
  ctx.fillStyle = lin(ctx, 0, k.y, 0, k.y + H.ry * 0.6, [
    [0, '#EF4444'],
    [1, '#B91C1C'],
  ]);
  ctx.fill(end);
  ctx.save();
  ctx.clip(end);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const t of [0.35, 0.7])
    ctx.fillRect(k.x - H.R * 0.4 + sw, k.y + H.ry * 0.62 * t, H.R * 0.8, H.R * 0.07);
  ctx.restore();
  // fringe
  ctx.strokeStyle = '#DC2626';
  ctx.lineWidth = H.R * 0.035;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const fx = k.x - H.R * 0.17 + sw * 1.4 + i * H.R * 0.075;
    ctx.beginPath();
    ctx.moveTo(fx, k.y + H.ry * 0.6);
    ctx.lineTo(fx, k.y + H.ry * 0.72);
    ctx.stroke();
  }
  // knot
  ctx.beginPath();
  ctx.ellipse(k.x, k.y, H.R * 0.17, H.R * 0.14, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, k.x - H.R * 0.05, k.y - H.R * 0.05, 0, H.R * 0.2, [
    [0, '#F87171'],
    [1, '#B91C1C'],
  ]);
  ctx.fill();
}

// ── Pumpkin (the body colours come from the engine) ───────────────────────────

export const PUMPKIN_BODY: readonly [string, string] = ['#FFA94D', '#E8590C'];

function pumpkin(ctx: Ctx, H: Head, body: Path2D, simple: boolean) {
  if (!simple) {
    ctx.save();
    ctx.clip(body);
    ctx.lineCap = 'round';
    for (const lon of [-1.15, -0.55, 0.0, 0.55, 1.15]) {
      const pts: P3[] = [];
      for (let i = 0; i <= 30; i++) {
        const q = proj(H, surf(-0.98 + (1.96 * i) / 30, lon, 1));
        if (q.z > 0) pts.push(q);
      }
      if (pts.length < 2) continue;
      const zz = pts[Math.floor(pts.length / 2)].z;
      polyline(ctx, pts);
      ctx.strokeStyle = `rgba(150,50,0,${0.22 * zz})`;
      ctx.lineWidth = H.R * 0.12;
      ctx.stroke();
      polyline(
        ctx,
        pts.map((q) => ({ x: q.x + H.R * 0.07, y: q.y })),
      );
      ctx.strokeStyle = `rgba(255,220,170,${0.18 * zz})`;
      ctx.lineWidth = H.R * 0.04;
      ctx.stroke();
    }
    ctx.restore();
  }
  const t = proj(H, [0.02, 1.0, 0]);
  // stem
  ctx.beginPath();
  ctx.moveTo(t.x - H.R * 0.09, t.y + H.R * 0.04);
  ctx.quadraticCurveTo(t.x - H.R * 0.08, t.y - H.R * 0.22, t.x + H.R * 0.08, t.y - H.R * 0.3);
  ctx.lineTo(t.x + H.R * 0.13, t.y - H.R * 0.22);
  ctx.quadraticCurveTo(t.x + H.R * 0.04, t.y - H.R * 0.15, t.x + H.R * 0.08, t.y + H.R * 0.04);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, t.x - H.R * 0.1, 0, t.x + H.R * 0.1, 0, [
    [0, '#65A30D'],
    [1, '#3F6212'],
  ]);
  ctx.fill();
  // leaf
  ctx.save();
  ctx.translate(t.x - H.R * 0.06, t.y - H.R * 0.02);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-H.R * 0.18, -H.R * 0.2, -H.R * 0.38, -H.R * 0.02);
  ctx.quadraticCurveTo(-H.R * 0.18, H.R * 0.1, 0, 0);
  ctx.fillStyle = lin(ctx, 0, -H.R * 0.15, -H.R * 0.3, 0, [
    [0, '#84CC16'],
    [1, '#4D7C0F'],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-H.R * 0.02, -H.R * 0.01);
  ctx.quadraticCurveTo(-H.R * 0.18, -H.R * 0.08, -H.R * 0.32, -H.R * 0.03);
  ctx.strokeStyle = 'rgba(30,60,0,0.4)';
  ctx.lineWidth = H.R * 0.02;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
  if (simple) return;
  // curly tendril
  ctx.beginPath();
  ctx.moveTo(t.x + H.R * 0.1, t.y - H.R * 0.12);
  ctx.bezierCurveTo(
    t.x + H.R * 0.3,
    t.y - H.R * 0.25,
    t.x + H.R * 0.35,
    t.y - H.R * 0.02,
    t.x + H.R * 0.22,
    t.y - H.R * 0.06,
  );
  ctx.strokeStyle = '#4D7C0F';
  ctx.lineWidth = H.R * 0.03;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// ── Bow (anchored in 3D, turns with the head) ─────────────────────────────────

function bow(ctx: Ctx, H: Head) {
  const a = proj(H, surf(0.86, 0.55, 1.02));
  if (a.z < -0.2) return;
  const s = H.R * 0.26;
  const sq = Math.max(0.45, Math.cos(0.55 + H.yaw));
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(0.35 + H.yaw * 0.3);
  ctx.scale(sq, 1);
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sd * s * 0.6, -s * 0.85, sd * s * 1.35, -s * 0.55, sd * s * 1.15, 0);
    ctx.bezierCurveTo(sd * s * 1.35, s * 0.55, sd * s * 0.6, s * 0.85, 0, 0);
    ctx.fillStyle = lin(ctx, 0, -s, 0, s, [
      [0, '#FF8CC6'],
      [1, '#DB2777'],
    ]);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sd * s * 0.25, -s * 0.05);
    ctx.quadraticCurveTo(sd * s * 0.7, -s * 0.15, sd * s * 0.95, -s * 0.05);
    ctx.strokeStyle = 'rgba(140,10,70,0.35)';
    ctx.lineWidth = s * 0.08;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.24, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, -s * 0.06, -s * 0.1, 0, s * 0.35, [
    [0, '#FFB3D9'],
    [1, '#C2185B'],
  ]);
  ctx.fill();
  ctx.restore();
}

// ── Bunny ears (always behind the head) ───────────────────────────────────────

function bunnyEars(ctx: Ctx, H: Head) {
  const R = H.R;
  const earH = R * 0.85;
  for (const sd of [-1, 1]) {
    const root = proj(H, [sd * 0.45, 0.92, 0]);
    const rootL = proj(H, [sd * 0.45 - 0.22, 0.92, 0]);
    const rootR = proj(H, [sd * 0.45 + 0.22, 0.92, 0]);
    const hw = Math.max(R * 0.04, Math.abs(rootR.x - rootL.x) / 2);
    ctx.save();
    ctx.translate(root.x, root.y - earH * 0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, earH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#F9F0F0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -earH / 2 + R * 0.1 + earH * 0.325, hw * 0.5, earH * 0.325, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(252,165,165,0.7)';
    ctx.fill();
    ctx.restore();
  }
}

// ── Layers and transitions ────────────────────────────────────────────────────

let scratch: HTMLCanvasElement | null = null;

/**
 * Draws `fn` at `alpha` as one layer, so overlapping parts don't show through
 * each other while an outfit fades (SwiftUI's drawLayer on macOS).
 */
function withLayer(ctx: Ctx, alpha: number, fn: (c: Ctx) => void) {
  if (alpha >= 0.999) {
    ctx.save();
    fn(ctx);
    ctx.restore();
    return;
  }
  const W = ctx.canvas.width;
  const Hh = ctx.canvas.height;
  scratch ??= document.createElement('canvas');
  if (scratch.width < W || scratch.height < Hh) {
    scratch.width = Math.max(scratch.width, W);
    scratch.height = Math.max(scratch.height, Hh);
  }
  const s = scratch.getContext('2d');
  if (!s) return;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.clearRect(0, 0, W, Hh);
  s.setTransform(ctx.getTransform());
  s.save();
  fn(s);
  s.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(scratch, 0, 0, W, Hh, 0, 0, W, Hh);
  ctx.restore();
}

/** Glasses, bow, scarf and pumpkin are on the face: behind the head once it has turned away. */
const ON_FACE: ReadonlySet<Outfit> = new Set([
  'sunglasses',
  'roundGlasses',
  'monocle',
  'bigShades',
  'banana',
  'bow',
  'scarf',
  'pumpkin',
]);
const HATS: ReadonlySet<Outfit> = new Set([
  'beanie',
  'santaHat',
  'partyHat',
  'crown',
  'witchHat',
  'fedora',
]);

export interface OutfitState {
  /** 0 = gone, 1 = fully on. Animated by the engine. */
  presence: number;
  /** Slime's mailbox morph: outfits fade away as he turns into a box. */
  morph: number;
  /** v0.6.2: 0…1, sunglasses pushed up onto the forehead while the eyes show an expression. */
  lift?: number;
}

function faceTurnedAway(H: Head): boolean {
  return proj(H, [0, 0, 1]).z < 0;
}

function drawFace(ctx: Ctx, outfit: Outfit, H: Head, body: Path2D, simple: boolean) {
  switch (outfit) {
    case 'sunglasses':
      sunglasses(ctx, H, body);
      break;
    case 'roundGlasses':
      roundGlasses(ctx, H, body);
      break;
    case 'monocle':
      monocle(ctx, H);
      break;
    case 'bigShades':
      bigShades(ctx, H, body);
      break;
    case 'banana':
      banana(ctx, H, body);
      break;
    case 'flag':
      turkishFlag(ctx, H);
      break;
    case 'scarf':
      scarf(ctx, H);
      break;
    case 'pumpkin':
      pumpkin(ctx, H, body, simple);
      break;
    case 'bow':
      bow(ctx, H);
      break;
    default:
      break;
  }
}

function layerAlpha(st: OutfitState): number {
  const morphFade = 1 - Math.min(1, Math.max(0, (st.morph - 0.3) / 0.2));
  return morphFade * Math.min(1, st.presence * 2.5);
}

/**
 * The parts behind Slime's body. `ctx` is in body space (translated to the body
 * centre, tilted and squashed exactly like the body).
 */
export function drawOutfitBehind(ctx: Ctx, outfit: Outfit, H: Head, st: OutfitState) {
  if (outfit === 'none') return;
  const alpha = layerAlpha(st);
  if (alpha <= 0.005) return;
  const simple = H.R < SIMPLIFY_BELOW_R;
  const body = bodyOutline(H.rx, H.ry);

  if (ON_FACE.has(outfit)) {
    if (faceTurnedAway(H)) withLayer(ctx, alpha, (l) => drawFace(l, outfit, H, body, simple));
    return;
  }
  const posP = Ease.back(st.presence);
  const hatScale = 0.85 + 0.15 * posP;
  ctx.save();
  ctx.translate(0, -(1 - posP) * H.ry);
  ctx.scale(hatScale, hatScale);
  slimeCrownScale(ctx, outfit, H);
  withLayer(ctx, alpha, (l) => {
    if (outfit === 'bunnyEars') bunnyEars(l, H);
    else if (outfit === 'crown') crownPart(l, H, -1, simple);
    else if (outfit === 'witchHat') witchHatBack(l, H);
  });
  ctx.restore();
}

/** Hats that need a different size on the square Slime head, scaled around the head top. */
const SLIME_HAT_SCALE: Partial<Record<Outfit, number>> = { crown: 0.92, santaHat: 0.8 };
function slimeCrownScale(ctx: Ctx, outfit: Outfit, H: Head) {
  const k = SHAPE.kind === 'slime' ? SLIME_HAT_SCALE[outfit] : undefined;
  if (!k) return;
  ctx.translate(0, -H.ry * 0.95);
  ctx.scale(k, k);
  ctx.translate(0, H.ry * 0.95);
}

/** The parts in front of Slime, drawn after the body and the eyes. */
export function drawOutfitFront(ctx: Ctx, outfit: Outfit, H: Head, st: OutfitState) {
  if (outfit === 'none' || outfit === 'bunnyEars') return;
  if (ON_FACE.has(outfit) && faceTurnedAway(H)) return;
  const alpha = layerAlpha(st);
  if (alpha <= 0.005) return;
  const simple = H.R < SIMPLIFY_BELOW_R;
  const body = bodyOutline(H.rx, H.ry);
  const p = st.presence;
  const posP = Ease.back(p);

  ctx.save();
  if (HATS.has(outfit)) {
    // hats drop onto the head and settle
    const hatScale = 0.85 + 0.15 * posP;
    ctx.translate(0, -(1 - posP) * H.ry);
    ctx.scale(hatScale, hatScale);
    slimeCrownScale(ctx, outfit, H);
  } else if (outfit === 'sunglasses' || outfit === 'roundGlasses' || outfit === 'bigShades') {
    ctx.translate(0, (1 - p) * 0.25 * H.ry);
    // sunglasses slide up onto the forehead so an expression (happy, wink, dizzy…) shows;
    // the shift is applied inside the glasses, after clipping to the (unmoved) head
    if (outfit !== 'roundGlasses') H = { ...H, lift: Ease.out(Math.min(1, Math.max(0, st.lift || 0))) };
  } else if (outfit === 'scarf') {
    ctx.translate(0, (1 - p) * 0.3 * H.ry);
  } else if (outfit === 'bow') {
    ctx.scale(Math.max(0.001, posP), Math.max(0.001, posP));
  }
  withLayer(ctx, alpha, (l) => {
    switch (outfit) {
      case 'beanie':
        beanie(l, H, body, simple);
        break;
      case 'santaHat':
        santaHat(l, H, body);
        break;
      case 'partyHat':
        partyHat(l, H, simple);
        break;
      case 'crown':
        crownFront(l, H, body, simple);
        break;
      case 'witchHat':
        witchHatFront(l, H, body);
        break;
      case 'fedora':
        fedora(l, H, simple);
        break;
      default:
        drawFace(l, outfit, H, body, simple);
    }
  });
  ctx.restore();
}

// ── Wardrobe icons ────────────────────────────────────────────────────────────

const INK = 'rgb(26,20,18)';

/** A little Slime wearing `outfit`, centred in a `size`×`size` icon. */
function iconSlime(ctx: Ctx, size: number, outfit: Outfit) {
  const R = 10;
  const H = makeHead(R);
  const cx = size / 2;
  const cy = size / 2 + R * 0.62;
  const st: OutfitState = { presence: 1, morph: 0 };
  ctx.save();
  ctx.translate(cx, cy);
  drawOutfitBehind(ctx, outfit, H, st);
  const body = bodyOutline(H.rx, H.ry);
  const [top, bottom] =
    outfit === 'pumpkin' ? PUMPKIN_BODY : ['rgb(237,237,239)', 'rgb(196,197,202)'];
  ctx.fillStyle = lin(ctx, H.rx * 0.7, -H.ry * 0.85, -H.rx * 0.8, H.ry * 0.9, [
    [0, top],
    [1, bottom],
  ]);
  ctx.fill(body);
  ctx.fillStyle = rad(ctx, 0, 0, R * 0.15, R * 1.25, [
    [0, 'rgba(0,0,0,0)'],
    [0.6, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.2)'],
  ]);
  ctx.fill(body);
  ctx.fillStyle = rad(ctx, H.rx * 0.34, -H.ry * 0.46, 0, R * 0.42, [
    [0, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = INK;
  for (const e of eyeFrames(H)) {
    if (!e.visible) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.fx, e.fy);
    const hh = Math.max(e.h, e.w * 0.3);
    roundRect(ctx, -e.w / 2, -hh / 2, e.w, hh, Math.min(e.w / 2, hh / 2));
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  drawOutfitFront(ctx, outfit, H, st);
  ctx.restore();
}

/**
 * One wardrobe button's picture — drawOutfitIcon on macOS. "auto" shows the
 * season's outfit with an AUTO tag, "none" a crossed-out circle.
 */
export function drawWardrobeIcon(
  ctx: Ctx,
  size: number,
  selection: OutfitSelection,
  seasonal: Outfit,
  autoLabel: string,
) {
  ctx.clearRect(0, 0, size, size);
  if (selection === 'none') {
    const r = 6.5;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = '#454850';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.moveTo(-r * 0.56, r * 0.56);
    ctx.lineTo(r * 0.56, -r * 0.56);
    ctx.stroke();
    ctx.restore();
    return;
  }
  iconSlime(ctx, size, selection === 'auto' ? seasonal : selection);
  if (selection !== 'auto') return;
  const R = 10;
  const by = size / 2 + R * 0.62 + R * SHAPE.ry * 0.72;
  const bw = 14;
  const bh = 6.5;
  ctx.save();
  ctx.translate(size / 2, by);
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  // A longer translation of "AUTO" gets a smaller font rather than overflowing the badge.
  let fontPx = 4.2;
  ctx.font = `600 ${fontPx}px system-ui, "Segoe UI", ${SCRIPT_FONTS}, sans-serif`;
  while (ctx.measureText(autoLabel).width > bw - 2 && fontPx > 2.6) {
    fontPx -= 0.2;
    ctx.font = `600 ${fontPx}px system-ui, "Segoe UI", ${SCRIPT_FONTS}, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(autoLabel, 0, 0.2);
  ctx.restore();
}

// Two reusable body-space layers per character. Breathing, movement and squash
// still use the live canvas transform; stable accessories need no path rebuild.
export class OutfitRenderer {
  private layers = new Map<string, { canvas: HTMLCanvasElement; key: string; size: number }>();
  draw(ctx: Ctx, side: 'front' | 'behind', outfit: Outfit, H: Head, st: OutfitState) {
    if (outfit === 'none') return;
    const key = [
      outfit,
      H.R,
      ...[H.yaw, H.pitch, H.physDx, H.physDy, st.presence, st.morph, st.lift || 0].map((v) =>
        Math.round(v * 250),
      ),
      // the flag waves: a new frame ~20 times a second, and its paw follows the slime colour
      outfit === 'flag' ? Math.floor(performance.now() / 50) + PAW.dark : '',
    ].join(':');
    let layer = this.layers.get(side);
    const size = Math.ceil(H.R * 8);
    if (!layer) {
      layer = { canvas: document.createElement('canvas'), key: '', size: 0 };
      this.layers.set(side, layer);
    }
    if (layer.key !== key || layer.size !== size) {
      const c = layer.canvas;
      if (layer.size !== size) {
        c.width = c.height = size;
        layer.size = size;
      }
      const x = c.getContext('2d')!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, size, size);
      x.translate(size / 2, size / 2);
      (side === 'front' ? drawOutfitFront : drawOutfitBehind)(x, outfit, H, st);
      layer.key = key;
    }
    ctx.drawImage(layer.canvas, -size / 2, -size / 2);
  }
}
