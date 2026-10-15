// A small, independent Slime used inside the settings (accessory and expression previews).
// It has its own engine, so trying things here never changes the real Charles.
import { BotEngine } from '../vendor/slime/engine';
import type { BotEmoteName, BotStateName } from '../vendor/core/layout';
import {
  parseOutfit,
  resolveOutfit,
  wornAccessories,
  type Accessories,
} from '../vendor/slime/wardrobe';
import { parseLook } from '../vendor/slime/shape';

const TALL = ['partyHat', 'witchHat', 'santaHat', 'bunnyEars', 'fedora'];

/** v0.6.3: the Turkish flag is a Turkish-language feature only. */
export function flagAllowed() {
  return document.documentElement.lang !== 'en';
}

/** Stored accessory values → what the engine wears today ("auto" resolved). */
export function wearable(a: Accessories) {
  const w = wornAccessories(
    {
      hat: String(parseOutfit(a.hat)),
      eyes: String(a.eyes || 'none'),
      other: String(a.other || 'none'),
      hand: 'auto', // v0.6.3: the flag comes by itself on the national days, no setting
    },
    new Date(),
  );
  const hand = flagAllowed() ? w.hand : 'none';
  return { hat: w.hat as any, eyes: w.eyes as any, other: w.other as any, hand: hand as any };
}

/** personal.json → accessories (v0.6.1 slots). */
export function accessoriesOf(p: any): Accessories {
  return { hat: p?.outfit || 'none', eyes: p?.eyewear || 'none', other: p?.otherWear || 'none' };
}

export function slimePreview(label: string) {
  const box = document.createElement('div');
  box.className = 'slime-preview';
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  const caption = document.createElement('small');
  box.append(canvas, caption);
  const engine = new BotEngine();
  const ctx = canvas.getContext('2d')!;
  let last = performance.now();
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  // Draw only while visible (settings page open); otherwise idle at no cost.
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!canvas.getClientRects().length) {
      last = now;
      return;
    }
    engine.update(Math.min((now - last) / 1000, 0.05));
    last = now;
    ctx.clearRect(0, 0, 240, 240);
    ctx.save();
    if (TALL.includes(engine.outfit)) {
      ctx.translate(28.8, 62);
      ctx.scale(0.76, 0.76);
    } else ctx.translate(0, 8);
    engine.draw(ctx, 240, 240);
    ctx.restore();
  };
  requestAnimationFrame(frame);

  return {
    element: box,
    caption,
    engine,
    setLook(value: string) {
      engine.look = parseLook(value);
    },
    setOutfit(value: string) {
      engine.setOutfit(resolveOutfit(parseOutfit(value), new Date()));
    },
    // v0.6.1: hat + eyes + other (Slime stüdyosu categories)
    setAccessories(a: Accessories) {
      engine.setAccessories(wearable(a));
    },
    // value: "state:thinking", "emote:love", "action:greet" (same values as the old select)
    play(value: string, text = '') {
      clearTimeout(resetTimer);
      const [kind, name] = value.split(':');
      engine.interruptGreet();
      engine.eyeOverride = null;
      engine.eyeOverrideUntil = 0;
      engine.station = 'none';
      engine.reading = 0;
      engine.eureka = false;
      // Work animations: station:web (magnifier), station:code (laptop), station:read (paper),
      // station:terminal (keyboard), station:image (drawing board), station:eureka (light bulb).
      if (kind === 'station') {
        engine.setState(name === 'web' ? 'searching' : 'working', true);
        if (name === 'read') engine.reading = 1;
        else if (name === 'eureka') {
          engine.station = 'code';
          engine.eureka = true;
        } else engine.station = name as any;
      } else engine.setState(kind === 'state' ? (name as BotStateName) : 'idle', true);
      if (kind === 'emote') engine.triggerEmote(name as BotEmoteName, 2.5);
      if (name === 'greet') engine.greet();
      if (name === 'gulp') engine.gulp();
      caption.textContent = text;
      resetTimer = setTimeout(
        () => {
          engine.station = 'none';
          engine.reading = 0;
          engine.eureka = false;
          engine.setState('idle', true);
          caption.textContent = '';
        },
        kind === 'station' ? 4500 : 3300,
      );
    },
  };
}
