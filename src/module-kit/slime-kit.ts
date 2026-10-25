import { Sound } from "../vendor/core/sound";
import { BotEngine } from "../vendor/slime/engine";
import { SLIME_COLOR_IDS as SLIME_COLOR_KEYS } from "../vendor/slime/shape";
import { Jelly } from "../island/jelly";
import { SLOT_ITEMS as SLOTS, clashes } from "../vendor/slime/wardrobe";
import { wearable } from "../settings/slime-preview";

Sound.base = "/_charles/sounds/";

const EMOTES = ["love", "surprised", "proud", "wink", "yawn", "happy", "annoyed"] as const;
const STATES = ["idle", "working", "thinking", "searching", "question", "error", "finished", "sleeping"] as const;
const STATIONS = ["none", "terminal", "web", "read", "code", "image"] as const;
const TALL_OUTFITS = ["partyHat", "witchHat", "santaHat", "bunnyEars", "fedora"];

const mod = () => (window as any).charlesModule;

function normalizeLook(e: any) {
  const pick = (slot: "hat" | "eyes" | "other") => ((SLOTS[slot] as readonly string[]).includes(e?.[slot]) ? e[slot] : "none");
  return {
    color: (SLIME_COLOR_KEYS as readonly string[]).includes(e?.color) ? e.color : "green",
    mustache: !!e?.mustache,
    hat: pick("hat"),
    eyes: pick("eyes"),
    other: pick("other")
  };
}

function mount(host: HTMLElement, opts: any = {}) {
  if (!(host instanceof HTMLElement)) throw new Error("CharlesSlime.mount: bir HTML \xF6\u011Fesi ver.");
  const size = Math.max(48, Math.min(640, Number(opts.size) || 160));
  const interactive = opts.interactive !== false;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = size + "px";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", opts.label || "Slime");
  host.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const bot = new BotEngine();
  const jelly = new Jelly();
  let look = normalizeLook(typeof opts.look === "object" ? opts.look : {});
  let wear: Record<string, string> = { ...(opts.wear || {}) };
  let sound = opts.sound !== false;
  Sound.setEnabled(sound);

  function applyLook() {
    bot.look = { color: look.color, mustache: look.mustache };
    const acc: any = { hat: look.hat, eyes: look.eyes, other: look.other, ...wear };
    if (clashes(acc)) {
      if (wear.other === "pumpkin") acc.hat = "none";
      else acc.other = "none";
    }
    const worn = wearable({ ...acc, hand: "none" }, new Date());
    bot.setAccessories({ hat: worn.hat, eyes: worn.eyes, other: worn.other, hand: "none" }, false);
  }
  applyLook();

  let offLook: (() => void) | null = null;
  if (opts.look === undefined || opts.look === "charles") {
    const m = mod();
    m?.slime
      ?.look?.()
      .then((p: any) => {
        look = normalizeLook(p);
        applyLook();
      })
      .catch(() => {});
    try {
      offLook = m?.on?.("slime-look", (p: any) => {
        look = normalizeLook(p);
        applyLook();
      });
    } catch {
      offLook = null;
    }
  }

  let last = performance.now(),
    raf = 0,
    alive = true;
  const frame = (now: number) => {
    if (!alive) return;
    const dt = Math.min((now - last) / 1e3, 0.05);
    last = now;
    bot.update(dt);
    jelly.step(dt);
    ctx.setTransform(dpr * (size / 240), 0, 0, dpr * (size / 240), 0, 0);
    ctx.clearRect(0, 0, 240, 240);
    ctx.save();
    jelly.apply(ctx);
    if (TALL_OUTFITS.includes(bot.outfit)) {
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

  let hovering = false,
    loveTimer = 0,
    lastLove = -Infinity,
    dizzy = false,
    dizzyTimer = 0,
    lovePos = { x: 0, y: 0 },
    ptr = { x: 0, y: 0, t: 0, over: false, at: 0 };
  const play = (name: any) => sound && Sound.play(name);
  const scheduleLove = () => {
    window.clearTimeout(loveTimer);
    loveTimer = window.setTimeout(() => {
      if (!hovering || dizzy || performance.now() - lastLove < 6e3) return;
      lastLove = performance.now();
      bot.triggerEmote("love");
      play("love");
    }, 1900);
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dx = e.clientX - r.x - r.width / 2,
      dy = e.clientY - r.y - r.height / 2,
      scale = 240 / r.width;
    bot.lookX = Math.tanh((dx * scale) / 260);
    bot.lookY = -Math.tanh((dy * scale) / 200);
    const over = Math.hypot(dx, dy) <= r.width * 0.3,
      now = performance.now(),
      speed = (Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) / Math.max(1, now - ptr.t)) * 1e3;
    if (over && !ptr.over && speed > 250 && now - ptr.at > 400) {
      jelly.poke(e.clientX - ptr.x, speed);
      bot.blink();
      ptr.at = now;
    }
    ptr = { ...ptr, x: e.clientX, y: e.clientY, t: now, over };
    if (over && !hovering && !dizzy) {
      lovePos = { x: e.clientX, y: e.clientY };
      if (performance.now() - lastLove >= 6e3) {
        bot.blink();
        bot.tgEs = 1.08;
        play("hover");
        scheduleLove();
      }
    }
    if (!over && hovering) {
      window.clearTimeout(loveTimer);
      bot.tgEs = 1;
    }
    hovering = over;
    if (over && Math.hypot(e.clientX - lovePos.x, e.clientY - lovePos.y) > 40) {
      lovePos = { x: e.clientX, y: e.clientY };
      scheduleLove();
    }
  };
  bot.onDizzy = () => {
    dizzy = true;
    window.clearTimeout(loveTimer);
    bot.tgEs = 1;
    bot.eyeOverride = null;
    bot.eyeOverrideUntil = 0;
    bot.setState("dizzy", true);
    play("dizzy");
    window.clearTimeout(dizzyTimer);
    dizzyTimer = window.setTimeout(() => {
      dizzy = false;
      bot.setState(baseState as any);
      bot.triggerEmote("happy");
    }, 3300);
  };
  const onClick = (e: MouseEvent) => {
    if (sound) Sound.preload().then(() => Sound.resume());
    window.clearTimeout(loveTimer);
    bot.slap();
    jelly.tap();
    play("slap");
    if (e.detail === 2 && !dizzy) {
      bot.triggerEmote("wink", 0.7);
      play("wink");
    }
  };
  const onLeave = () => {
    hovering = false;
    window.clearTimeout(loveTimer);
    bot.tgEs = 1;
  };
  if (interactive) {
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    canvas.style.cursor = "pointer";
  }
  const unlock = () => {
    if (sound) Sound.preload().then(() => Sound.resume());
  };
  document.addEventListener("pointerdown", unlock, { once: true, capture: true });
  let baseState = "idle";
  return {
    canvas,
    engine: bot,
    emote(name: string, duration = 1.8) {
      if (!(EMOTES as readonly string[]).includes(name)) throw new Error("Ge\xE7ersiz ifade: " + String(name));
      bot.triggerEmote(name as any, Math.max(0.3, Math.min(10, Number(duration) || 1.8)));
    },
    react(name: string) {
      if (name === "greet") bot.greet();
      else if (name === "blink") bot.blink();
      else if (name === "squash") {
        bot.squash();
        jelly.tap();
      } else if (name === "slap") {
        bot.slap();
        jelly.tap();
        play("slap");
      } else if (name === "dizzy") bot.onDizzy?.();
      else if (name === "gulp") bot.gulp();
      else throw new Error("Ge\xE7ersiz tepki: " + String(name));
    },
    state(name: string) {
      if (!(STATES as readonly string[]).includes(name)) throw new Error("Ge\xE7ersiz durum: " + String(name));
      baseState = name;
      if (!dizzy) bot.setState(name as any);
    },
    station(name: string) {
      if (!(STATIONS as readonly string[]).includes(name)) throw new Error("Ge\xE7ersiz \xE7al\u0131\u015Fma animasyonu: " + String(name));
      bot.station = name as any;
      bot.reading = name === "read" ? 1 : 0;
    },
    wear(next: any = {}) {
      wear = {};
      for (const slot of ["hat", "eyes", "other"] as const) {
        if (next?.[slot] !== undefined) {
          if (!(SLOTS[slot] as readonly string[]).includes(String(next[slot])))
            throw new Error(`Ge\xE7ersiz ${slot} aksesuar\u0131: ${String(next[slot])}`);
          wear[slot] = next[slot];
        }
      }
      applyLook();
    },
    setLook(next: any) {
      if (next === "charles") {
        mod()
          ?.slime?.look?.()
          .then((p: any) => {
            look = normalizeLook(p);
            applyLook();
          });
        return;
      }
      look = normalizeLook(next);
      applyLook();
    },
    setSound(on: boolean) {
      sound = !!on;
      Sound.setEnabled(sound);
    },
    dance(on: boolean) {
      bot.setDancing(!!on);
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(loveTimer);
      window.clearTimeout(dizzyTimer);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      offLook?.();
      canvas.remove();
    }
  };
}

(window as any).CharlesSlime = Object.freeze({
  version: 1,
  mount,
  accessories: { hat: [...SLOTS.hat], eyes: [...SLOTS.eyes], other: [...SLOTS.other] },
  colors: [...SLIME_COLOR_KEYS],
  emotes: [...EMOTES],
  reactions: ["greet", "blink", "squash", "slap", "dizzy", "gulp"],
  states: [...STATES],
  stations: [...STATIONS]
});
