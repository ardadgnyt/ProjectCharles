// v0.8.8: Charles' Slime for module windows — window.CharlesSlime.
//
// A module page loads it from Charles itself (nothing to copy into the module):
//   <script src="/_charles/slime.js"></script>
//   const slime = CharlesSlime.mount(document.querySelector('#pet'), { size: 160 });
//
// It is the same engine as the island: the user's colour and accessories (or the module's own),
// the eyes follow the cursor, hovering makes him blink and send a heart, a click is a slap with a
// jelly wobble, three quick slaps make him dizzy, a double click gets a wink, a fast cursor
// pokes him, and Charles' own interface sounds. Everything runs inside the module window.
import { BotEngine } from '../vendor/slime/engine';
import { Jelly } from '../island/jelly';
import { Sound } from '../vendor/core/sound';
import { clashes, wornAccessories, SLOT_ITEMS, type Accessories } from '../vendor/slime/wardrobe';
import { SLIME_COLOR_IDS, type SlimeColor } from '../vendor/slime/shape';
import type { BotEmoteName, BotStateName } from '../vendor/core/layout';
import type { Station } from '../chat/activity';

Sound.base = '/_charles/sounds/';

const EMOTES: BotEmoteName[] = ['love', 'surprised', 'proud', 'wink', 'yawn', 'happy', 'annoyed'];
const STATES: BotStateName[] = ['idle', 'working', 'thinking', 'searching', 'question', 'error', 'finished', 'sleeping'];
const STATIONS: Station[] = ['none', 'terminal', 'web', 'read', 'code', 'image'];
const TALL = ['partyHat', 'witchHat', 'santaHat', 'bunnyEars', 'fedora'];

type Look = { color?: string; mustache?: boolean; hat?: string; eyes?: string; other?: string };
type MountOptions = {
  /** CSS pixels (square). Default 160. */
  size?: number;
  /** Cursor following, hover, slaps, wink… Default true. */
  interactive?: boolean;
  /** Charles' sounds. Default true (they start after the first click, as browsers require). */
  sound?: boolean;
  /** 'charles' (default): the user's look, kept up to date; or a look of the module's own. */
  look?: 'charles' | Look;
  /** Accessories always worn on top of the look, e.g. { eyes: 'roundGlasses' }. */
  wear?: Look;
  /** Accessible name of the canvas. */
  label?: string;
};

const api = () => (window as any).charlesModule;

function cleanLook(v: any): Required<Look> {
  const pick = (slot: 'hat' | 'eyes' | 'other') => (SLOT_ITEMS[slot].includes(v?.[slot]) ? v[slot] : 'none');
  return {
    color: (SLIME_COLOR_IDS as string[]).includes(v?.color) ? v.color : 'green',
    mustache: !!v?.mustache,
    hat: pick('hat'),
    eyes: pick('eyes'),
    other: pick('other'),
  };
}

function mount(target: HTMLElement, o: MountOptions = {}) {
  if (!(target instanceof HTMLElement)) throw Error('CharlesSlime.mount: bir HTML öğesi ver.');
  const size = Math.max(48, Math.min(640, Number(o.size) || 160));
  const interactive = o.interactive !== false;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = size + 'px';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', o.label || 'Slime');
  target.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const bot = new BotEngine();
  const jelly = new Jelly();
  let look = cleanLook(typeof o.look === 'object' ? o.look : {});
  let extra: Look = { ...(o.wear || {}) };
  let soundOn = o.sound !== false;
  Sound.setEnabled(soundOn);

  function dress() {
    bot.look = { color: look.color as SlimeColor, mustache: look.mustache };
    const acc = { hat: look.hat, eyes: look.eyes, other: look.other, ...extra } as Accessories;
    if (clashes(acc)) {
      if (extra.other === 'pumpkin') acc.hat = 'none';
      else acc.other = 'none';
    }
    const w = wornAccessories({ ...acc, hand: 'none' }, new Date());
    bot.setAccessories({ hat: w.hat as any, eyes: w.eyes as any, other: w.other as any, hand: 'none' as any }, false);
  }
  dress();
  // the user's look from Charles, and its changes
  let off: (() => void) | null = null;
  if (o.look === undefined || o.look === 'charles') {
    const C = api();
    void C?.slime?.look?.()
      .then((v: any) => {
        look = cleanLook(v);
        dress();
      })
      .catch(() => {});
    try {
      off = C?.on?.('slime-look', (v: any) => {
        look = cleanLook(v);
        dress();
      });
    } catch {
      off = null;
    }
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  let last = performance.now();
  let raf = 0;
  let alive = true;
  const frame = (now: number) => {
    if (!alive) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    bot.update(dt);
    jelly.step(dt);
    ctx.setTransform(dpr * (size / 240), 0, 0, dpr * (size / 240), 0, 0);
    ctx.clearRect(0, 0, 240, 240);
    ctx.save();
    jelly.apply(ctx);
    if (TALL.includes(bot.outfit)) {
      ctx.translate(28.8, 62);
      ctx.scale(0.76, 0.76);
    } else ctx.translate(0, 8);
    bot.applyDance(ctx, 240, 240);
    bot.draw(ctx, 240, 240);
    ctx.restore();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  bot.greet();

  // ── the island's reactions ────────────────────────────────────────────────
  let hovering = false;
  let hoverTimer = 0;
  let lastLove = -Infinity;
  let dizzy = false;
  let dizzyTimer = 0;
  let origin = { x: 0, y: 0 };
  let poke = { x: 0, y: 0, t: 0, over: false, at: 0 };
  const play = (name: Parameters<typeof Sound.play>[0]) => soundOn && Sound.play(name);
  const love = () => {
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      if (!hovering || dizzy || performance.now() - lastLove < 6000) return;
      lastLove = performance.now();
      bot.triggerEmote('love');
      play('love');
    }, 1900);
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dx = e.clientX - r.x - r.width / 2;
    const dy = e.clientY - r.y - r.height / 2;
    const scale = 240 / r.width;
    bot.lookX = Math.tanh((dx * scale) / 260);
    bot.lookY = -Math.tanh((dy * scale) / 200);
    const over = Math.hypot(dx, dy) <= r.width * 0.3;
    // a fast cursor running into the body pokes it
    const t = performance.now();
    const speed = (Math.hypot(e.clientX - poke.x, e.clientY - poke.y) / Math.max(1, t - poke.t)) * 1000;
    if (over && !poke.over && speed > 250 && t - poke.at > 400) {
      jelly.poke(e.clientX - poke.x, speed);
      bot.blink();
      poke.at = t;
    }
    poke = { ...poke, x: e.clientX, y: e.clientY, t, over };
    if (over && !hovering && !dizzy) {
      origin = { x: e.clientX, y: e.clientY };
      if (performance.now() - lastLove >= 6000) {
        bot.blink();
        bot.tgEs = 1.08;
        play('hover');
        love();
      }
    }
    if (!over && hovering) {
      window.clearTimeout(hoverTimer);
      bot.tgEs = 1;
    }
    hovering = over;
    if (over && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 40) {
      origin = { x: e.clientX, y: e.clientY };
      love();
    }
  };
  bot.onDizzy = () => {
    dizzy = true;
    window.clearTimeout(hoverTimer);
    bot.tgEs = 1;
    bot.eyeOverride = null;
    bot.eyeOverrideUntil = 0;
    bot.setState('dizzy', true);
    play('dizzy');
    window.clearTimeout(dizzyTimer);
    dizzyTimer = window.setTimeout(() => {
      dizzy = false;
      bot.setState(state);
      bot.triggerEmote('happy');
    }, 3300);
  };
  const onClick = (e: MouseEvent) => {
    if (soundOn) void Sound.preload().then(() => Sound.resume());
    window.clearTimeout(hoverTimer);
    bot.slap();
    jelly.tap();
    play('slap');
    if (e.detail === 2 && !dizzy) {
      bot.triggerEmote('wink', 0.7);
      play('wink');
    }
  };
  const onLeave = () => {
    hovering = false;
    window.clearTimeout(hoverTimer);
    bot.tgEs = 1;
  };
  if (interactive) {
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);
    canvas.style.cursor = 'pointer';
  }
  const startSound = () => {
    if (soundOn) void Sound.preload().then(() => Sound.resume());
  };
  document.addEventListener('pointerdown', startSound, { once: true, capture: true });

  let state: BotStateName = 'idle';
  return {
    canvas,
    engine: bot,
    /** love, surprised, proud, wink, yawn, happy, annoyed */
    emote(name: BotEmoteName, seconds = 1.8) {
      if (!EMOTES.includes(name)) throw Error('Geçersiz ifade: ' + String(name));
      bot.triggerEmote(name, Math.max(0.3, Math.min(10, Number(seconds) || 1.8)));
    },
    /** greet, blink, squash, slap, dizzy, gulp */
    react(name: string) {
      if (name === 'greet') bot.greet();
      else if (name === 'blink') bot.blink();
      else if (name === 'squash') {
        bot.squash();
        jelly.tap();
      } else if (name === 'slap') {
        bot.slap();
        jelly.tap();
        play('slap');
      } else if (name === 'dizzy') bot.onDizzy?.();
      else if (name === 'gulp') bot.gulp();
      else throw Error('Geçersiz tepki: ' + String(name));
    },
    /** idle, working, thinking, searching, question, error, finished, sleeping */
    state(name: BotStateName) {
      if (!STATES.includes(name)) throw Error('Geçersiz durum: ' + String(name));
      state = name;
      if (!dizzy) bot.setState(name);
    },
    /** Work animations: none, terminal, web, read, code, image. */
    station(name: Station) {
      if (!STATIONS.includes(name)) throw Error('Geçersiz çalışma animasyonu: ' + String(name));
      bot.station = name;
      bot.reading = name === 'read' ? 1 : 0;
    },
    /** Accessories on top of the look, e.g. { eyes: 'roundGlasses' }; {} takes them off. */
    wear(v: Look = {}) {
      extra = {};
      for (const slot of ['hat', 'eyes', 'other'] as const)
        if (v?.[slot] !== undefined) {
          if (!SLOT_ITEMS[slot].includes(String(v[slot]))) throw Error(`Geçersiz ${slot} aksesuarı: ${String(v[slot])}`);
          extra[slot] = v[slot];
        }
      dress();
    },
    /** A look of the module's own ({ color, mustache, hat, eyes, other }) or 'charles'. */
    setLook(v: 'charles' | Look) {
      if (v === 'charles') {
        void api()
          ?.slime?.look?.()
          .then((x: any) => {
            look = cleanLook(x);
            dress();
          });
        return;
      }
      look = cleanLook(v);
      dress();
    },
    setSound(on: boolean) {
      soundOn = !!on;
      Sound.setEnabled(soundOn);
    },
    dance(on: boolean) {
      bot.setDancing(!!on);
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(hoverTimer);
      window.clearTimeout(dizzyTimer);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      off?.();
      canvas.remove();
    },
  };
}

(window as any).CharlesSlime = Object.freeze({
  version: 1,
  mount,
  accessories: { hat: [...SLOT_ITEMS.hat], eyes: [...SLOT_ITEMS.eyes], other: [...SLOT_ITEMS.other] },
  colors: [...SLIME_COLOR_IDS],
  emotes: [...EMOTES],
  reactions: ['greet', 'blink', 'squash', 'slap', 'dizzy', 'gulp'],
  states: [...STATES],
  stations: [...STATIONS],
});
