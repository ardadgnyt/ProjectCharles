// v0.6.2: desktop Slime jelly physics.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PetPhysics, releaseVelocity } = require('../app/core/pet-physics.cjs');

function rig() {
  let t = 0;
  const events = [];
  const moves = [];
  const p = new PetPhysics({
    move: (x, y) => moves.push([x, y]),
    emit: (e) => events.push(e),
    area: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
    size: () => 200,
    pad: 40,
    now: () => t,
  });
  return {
    p,
    events,
    moves,
    tick: (ms) => (t += ms),
    get t() {
      return t;
    },
  };
}

test('a slow release is a drop; a fast one flies', () => {
  const r = rig();
  assert.equal(
    r.p.release(100, 100, [
      { t: -50, x: 98, y: 100 },
      { t: 0, x: 100, y: 100 },
    ]),
    'drop',
  );
  assert.equal(r.events.at(-1).type, 'drop');
  assert.equal(
    r.p.release(100, 100, [
      { t: -40, x: 40, y: 100 },
      { t: 0, x: 100, y: 100 },
    ]),
    'fly',
  );
  assert.equal(r.events.at(-1).type, 'fly');
});

test('release velocity uses only the last ~90 ms and is capped', () => {
  const v = releaseVelocity(
    [
      { t: 0, x: 0, y: 0 },
      { t: 900, x: 0, y: 0 },
      { t: 950, x: 50, y: 0 },
    ],
    950,
  );
  assert.equal(Math.round(v.vx), 1000);
  const fast = releaseVelocity(
    [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 1000, y: 0 },
    ],
    10,
  );
  assert.ok(Math.hypot(fast.vx, fast.vy) <= 4200.1);
});

test('a hard throw only bounces (no sticking) and comes to rest inside', () => {
  const r = rig();
  r.p.release(700, 300, [
    { t: -40, x: 600, y: 300 },
    { t: 0, x: 700, y: 300 },
  ]); // 2500 px/s right
  let guard = 0;
  while (r.p.step(0.016) && guard++ < 2000) r.tick(16);
  const types = r.events.map((e) => e.type);
  assert.ok(types.includes('bounce'), types.join(','));
  assert.equal(r.events.find((e) => e.type === 'bounce').side, 'right');
  assert.ok(!types.includes('stick') && !types.includes('unstick'));
  assert.equal(types.at(-1), 'rest');
  const [x, y] = r.moves.at(-1);
  assert.ok(x <= 1000 - 200 + 40 && x >= -40 && y >= -40 && y <= 800 - 200 + 40);
});

test('window positions are never -0 or NaN (Electron setPosition "conversion failure")', () => {
  const { toInt } = require('../app/core/pet-physics.cjs');
  assert.ok(Object.is(toInt(-0.3), 0));
  assert.ok(Object.is(toInt(-0), 0));
  assert.equal(toInt(NaN), 0);
  const { petBounds } = require('../app/core/desktop-pet.cjs');
  const b = petBounds({ x: -0.2, y: -0.4 }, { x: 0, y: 0, width: 1000, height: 800 }, 0);
  assert.ok(Object.is(b.x, 0) && Object.is(b.y, 0));
  // flying near the top-left corner: every move is a proper integer
  const r = rig();
  r.p.release(5, 5, [
    { t: -40, x: 105, y: 105 },
    { t: 0, x: 5, y: 5 },
  ]);
  let guard = 0;
  while (r.p.step(0.016) && guard++ < 2000) r.tick(16);
  for (const [x, y] of r.moves) assert.ok(Number.isInteger(x) && Number.isInteger(y) && !Object.is(x, -0) && !Object.is(y, -0));
});

test('welcome tour: shown on a fresh profile, can be finished and started again', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { Personal } = require('../app/personal/personal.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-062-'));
  const p = new Personal(dir);
  assert.equal(!!p.data.onboarded, false);
  p.edit('onboarded', { value: true });
  assert.equal(new Personal(dir).data.onboarded, true);
  p.edit('onboarded', { value: false });
  assert.equal(new Personal(dir).data.onboarded, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
