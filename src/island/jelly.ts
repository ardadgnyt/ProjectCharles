// v0.6.2: jelly body for the desktop Slime.
//
// Springs on the width, height and position of the whole drawing. Impacts from the window
// physics (app/core/pet-physics.cjs) give it a soft wobble from the side it hit; a drop squashes it and makes it hop; poking it with
// the cursor makes it wobble. Everything settles back by itself.

type Side = 'left' | 'right' | 'top' | 'bottom';

const K = 210; // spring stiffness
const C = 9; // damping

// Body edges in the 240 × 240 drawing space (centre ≈ 120, 128; half size ≈ 79 × 74).
const ANCHORS: Record<Side | 'center', { x: number; y: number }> = {
  left: { x: 41, y: 128 },
  right: { x: 199, y: 128 },
  top: { x: 120, y: 54 },
  bottom: { x: 120, y: 202 },
  center: { x: 120, y: 128 },
};

export class Jelly {
  private sx = 0;
  private sy = 0;
  private vsx = 0;
  private vsy = 0;
  private oy = 0;
  private voy = 0;
  private ox = 0;
  private vox = 0;
  private anchor = ANCHORS.center;
  private held = false;

  get active() {
    return (
      this.held ||
      Math.abs(this.sx) + Math.abs(this.sy) + Math.abs(this.ox) + Math.abs(this.oy) > 0.002 ||
      Math.abs(this.vsx) + Math.abs(this.vsy) + Math.abs(this.vox) + Math.abs(this.voy) > 0.01
    );
  }

  /** Bounce off a side; 0 ≤ strength ≤ 1. A short, soft jelly wobble (v0.6.2: no sticking,
   *  no hard squash): the spring gets a push, so it eases in and out instead of snapping. */
  hit(side: Side, strength: number) {
    const amp = 0.035 + 0.075 * Math.min(1, Math.max(0, strength));
    const w = Math.sqrt(K);
    this.anchor = ANCHORS[side];
    if (side === 'left' || side === 'right') {
      this.vsx -= amp * w;
      this.vsy += amp * w * 0.5;
    } else {
      this.vsy -= amp * w;
      this.vsx += amp * w * 0.5;
    }
    this.held = false;
  }

  /** Let go gently: flatten, then hop. */
  drop() {
    this.anchor = ANCHORS.bottom;
    this.held = false;
    this.sy = -0.24;
    this.sx = 0.18;
    this.voy = -260;
  }

  /** Thrown: stretch along the flight direction. */
  fly(vx: number, vy: number) {
    this.anchor = ANCHORS.center;
    const k = Math.min(1, Math.hypot(vx, vy) / 2500) * 0.18;
    if (Math.abs(vx) > Math.abs(vy)) {
      this.vsx += k * 9;
      this.vsy -= k * 6;
    } else {
      this.vsy += k * 9;
      this.vsx -= k * 6;
    }
  }

  /** Clicked: pressed down from the top, then a jelly wobble. Stronger on repeated taps. */
  tap() {
    this.anchor = ANCHORS.bottom;
    this.held = false;
    this.sy = Math.max(-0.3, this.sy - 0.17);
    this.sx = Math.min(0.3, this.sx + 0.13);
    this.vsx += (Math.random() < 0.5 ? 1 : -1) * 1.2;
  }

  /** Poked by the cursor: a wobble, stronger for a faster cursor. */
  poke(dx: number, speed: number) {
    const k = Math.min(1, speed / 1500);
    this.anchor = ANCHORS.bottom;
    this.vsx += (0.8 + 1.6 * k) * (Math.random() < 0.5 ? 1 : -1);
    this.vsy -= 0.8 + 1.2 * k;
    this.vox += Math.sign(dx || 1) * 40 * k;
  }

  step(dt: number) {
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      if (!this.held) {
        this.vsx += (-K * this.sx - C * this.vsx) * h;
        this.vsy += (-K * this.sy - C * this.vsy) * h;
        this.sx += this.vsx * h;
        this.sy += this.vsy * h;
      }
      // hop: gravity-like pull back to the ground, small bounce
      this.voy += (-90 * this.oy - 7 * this.voy) * h;
      this.oy += this.voy * h;
      this.vox += (-140 * this.ox - 10 * this.vox) * h;
      this.ox += this.vox * h;
    }
    // keep it sane
    this.sx = Math.max(-0.45, Math.min(0.45, this.sx));
    this.sy = Math.max(-0.45, Math.min(0.45, this.sy));
    this.oy = Math.max(-40, Math.min(12, this.oy));
  }

  /** Apply to the canvas before the Slime is drawn (240 × 240 drawing space). */
  apply(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;
    const a = this.anchor;
    ctx.translate(a.x + this.ox, a.y + this.oy);
    ctx.scale(1 + this.sx, 1 + this.sy);
    ctx.translate(-a.x, -a.y);
  }
}
