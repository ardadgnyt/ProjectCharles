// v0.7.7: when a file is dragged over the app window, the + button of the message box turns
// into Charles himself (the real Slime, in the user's colour, at the size of the +) with his
// mouth open, ready to take the file; on drop he swallows it (the same gulp as the mailbox).
// The drop itself is handled as before (settings/extras.ts).
import { BotEngine } from '../vendor/slime/engine';
import { parseLook } from '../vendor/slime/shape';

export function dropSlime(o: { buttons: () => (HTMLElement | null)[]; onDrop: () => void; api: any }) {
  let engine: BotEngine | null = null;
  let look = parseLook('');
  let crop: { cx: number; cy: number; side: number } | null = null;
  let frame = 0;
  let last = 0;
  let until = 0;
  const canvases = new Set<HTMLCanvasElement>();

  function make() {
    const e = new BotEngine();
    e.interruptGreet();
    e.look = { ...look };
    for (let i = 0; i < 30; i++) e.update(1 / 60);
    Object.assign(e, { yaw: 0, pitch: 0, tgYaw: 0, tgPitch: 0, ox: 0, oy: 0, tilt: 0, roll: 0 });
    // where the Slime is drawn on the engine's 240 × 240 stage (measured once)
    if (!crop) {
      const c = document.createElement('canvas');
      c.width = c.height = 240;
      const x = c.getContext('2d')!;
      e.draw(x, 240, 240);
      const d = x.getImageData(0, 0, 240, 240).data;
      let x0 = 240,
        y0 = 240,
        x1 = 0,
        y1 = 0;
      for (let y = 0; y < 240; y++)
        for (let xx = 0; xx < 240; xx++)
          if (d[(y * 240 + xx) * 4 + 3] > 8) {
            x0 = Math.min(x0, xx);
            x1 = Math.max(x1, xx);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      crop = x1 > x0 ? { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, side: Math.max(x1 - x0, y1 - y0) * 1.12 } : { cx: 120, cy: 120, side: 240 };
    }
    return e;
  }
  function dress() {
    for (const b of o.buttons()) {
      if (!b || b.querySelector(':scope > .ws-drop-slime')) continue;
      const c = document.createElement('canvas');
      c.className = 'ws-drop-slime';
      c.setAttribute('aria-hidden', 'true');
      b.append(c);
      b.classList.add('ws-drop-target');
      canvases.add(c);
    }
  }
  function draw(t: number) {
    frame = 0;
    if (!engine || !crop) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    engine.update(dt);
    for (const c of canvases) {
      if (!c.isConnected || !c.offsetWidth) continue;
      const px = Math.round(c.offsetWidth * devicePixelRatio);
      if (c.width !== px) c.width = c.height = px;
      const x = c.getContext('2d')!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, px, px);
      const k = px / crop.side;
      x.setTransform(k, 0, 0, k, -(crop.cx - crop.side / 2) * k, -(crop.cy - crop.side / 2) * k);
      engine.draw(x, 240, 240);
    }
    if (dropping() || performance.now() < until) frame = requestAnimationFrame(draw);
  }
  const dropping = () => document.body.classList.contains('workspace') && document.body.classList.contains('dropping');
  function start() {
    if (!engine) engine = make();
    if (!frame) {
      last = 0;
      frame = requestAnimationFrame(draw);
    }
  }

  // Charles' colour and moustache
  const setLook = (p: any) => {
    const next = parseLook(p?.slime);
    if (next.color === look.color && next.mustache === look.mustache) return;
    look = next;
    engine = null;
  };
  void Promise.resolve(o.api.personalRead?.()).then(setLook).catch(() => {});
  o.api.onPersonal?.(setLook);

  let wasDropping = false;
  let gulpTimer = 0;
  new MutationObserver(() => {
    const now = dropping();
    if (now === wasDropping) return;
    wasDropping = now;
    if (now) {
      dress();
      start();
      // the same "give it to me" as on the island: Slime becomes a little mailbox, slot open
      engine!.animateMorph(1);
      engine!.slotHTarget = 0.42;
      engine!.blink();
    } else if (engine && !document.body.classList.contains('ws-gulp')) {
      engine.slotHTarget = 0;
      engine.animateMorph(0);
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  o.api.onFileDrop?.((result: any) => {
    if (!document.body.classList.contains('workspace')) return;
    dress();
    start();
    if (result?.error) {
      engine!.slotHTarget = 0;
      engine!.animateMorph(0);
      return;
    }
    // the swallow: mouth closes, a squash, then chewing
    document.body.classList.add('ws-gulp');
    engine!.animateMorph(1);
    engine!.gulp();
    until = performance.now() + 1900;
    window.clearTimeout(gulpTimer);
    gulpTimer = window.setTimeout(() => engine?.animateMorph(0), 1100);
    window.setTimeout(() => document.body.classList.remove('ws-gulp'), 1900);
    o.onDrop();
  });
}
