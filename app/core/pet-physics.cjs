// v0.6.2: jelly physics for the desktop Slime.
//
// Released with speed, the Slime flies across the screen, slows down (no gravity — it is a
// desktop, not a room) and bounces off the edges of the work area (v0.6.2: it no longer sticks
// to the edge; a bounce is enough). A gentle release is a "drop": it squashes and hops in place. The renderer gets an event for every impact and draws the squash / wobble
// (src/island/jelly.ts); this module only moves the window.

const FRICTION = 2.4; // per second (exponential)
const RESTITUTION = 0.55;
const THROW_SPEED = 650; // px/s: faster than this on release → flying
const STOP_SPEED = 45;
const MAX_SPEED = 4200;

// Window coordinates must be plain integers: Math.round(-0.3) is -0, which Electron's
// setPosition rejects ("conversion failure"). Adding 0 turns -0 into 0.
function toInt(v) {
  return Number.isFinite(v) ? Math.round(v) + 0 : 0;
}

// Velocity from the last pointer samples [{ t, x, y }] (ms, px).
function releaseVelocity(samples, now) {
  const recent = samples.filter((s) => now - s.t <= 90);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = Math.max(8, b.t - a.t) / 1000;
  let vx = (b.x - a.x) / dt;
  let vy = (b.y - a.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) {
    vx *= MAX_SPEED / speed;
    vy *= MAX_SPEED / speed;
  }
  return { vx, vy };
}

class PetPhysics {
  // move(x, y): set the window position. emit(event): { type, side?, strength? } to renderer.
  // area(): the work area { x, y, width, height } the Slime lives in. size(): window size.
  // pad: how far the transparent window may go past the edge (the body is smaller).
  constructor({ move, emit, area, size, pad = 0, now = () => Date.now() }) {
    Object.assign(this, { move, emit, area, size, pad, now });
    this.state = 'idle';
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
  }

  stop() {
    this.state = 'idle';
    this.vx = this.vy = 0;
  }

  // Called when the drag ends. Returns 'fly' or 'drop'.
  release(x, y, samples) {
    let { vx, vy } = releaseVelocity(samples, this.now());
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) vx = vy = 0;
    this.x = x;
    this.y = y;
    if (Math.hypot(vx, vy) < THROW_SPEED) {
      this.stop();
      this.emit({ type: 'drop' });
      return 'drop';
    }
    this.vx = vx;
    this.vy = vy;
    this.state = 'flying';
    this.emit({ type: 'fly', vx, vy });
    return 'fly';
  }

  bounds() {
    const a = this.area();
    const s = this.size();
    return {
      left: a.x - this.pad,
      top: a.y - this.pad,
      right: a.x + a.width - s + this.pad,
      bottom: a.y + a.height - s + this.pad,
    };
  }

  // Advance dt seconds. Returns false when the Slime has come to rest.
  step(dt) {
    if (this.state === 'idle') return false;
    const k = Math.exp(-FRICTION * dt);
    this.vx *= k;
    this.vy *= k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const b = this.bounds();
    const hit = (side, speed) => {
      this.emit({ type: 'bounce', side, strength: Math.min(1, speed / 2500) });
    };
    if (this.x < b.left) {
      this.x = b.left;
      const s = Math.abs(this.vx);
      this.vx = s * RESTITUTION;
      hit('left', s);
    } else if (this.x > b.right) {
      this.x = b.right;
      const s = Math.abs(this.vx);
      this.vx = -s * RESTITUTION;
      hit('right', s);
    }
    if (this.y < b.top) {
      this.y = b.top;
      const s = Math.abs(this.vy);
      this.vy = s * RESTITUTION;
      hit('top', s);
    } else if (this.y > b.bottom) {
      this.y = b.bottom;
      const s = Math.abs(this.vy);
      this.vy = -s * RESTITUTION;
      hit('bottom', s);
    }
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
      this.stop();
      return false;
    }
    this.move(toInt(this.x), toInt(this.y));
    if (this.state === 'flying' && Math.hypot(this.vx, this.vy) < STOP_SPEED) {
      this.stop();
      this.emit({ type: 'rest' });
      return false;
    }
    return true;
  }
}

module.exports = { PetPhysics, releaseVelocity, toInt, THROW_SPEED };
