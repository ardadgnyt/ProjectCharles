// v0.9.14: Araçlar → Renk seçici. A saturation / brightness square with a hue bar, the chosen
// colour with four lighter → darker tones, HEX · RGB · HSL rows to copy, the last colours, and
// "Ekrandan seç" (app/system/color-pick.cjs: a magnifier over a screenshot of the display).
// One instance: the island panel and the app window's card show the same element.
import { el, icon } from '../workspace/icons';

export type Rgb = { r: number; g: number; b: number };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
}
export function rgbToHsv({ r, g, b }: Rgb) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export function rgbToHsl({ r, g, b }: Rgb) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const { h } = rgbToHsv({ r, g, b });
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToRgb(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}
export const toHex = ({ r, g, b }: Rgb) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
/** "#e8a23c", "e8a23c", "#ea3" → { r, g, b } or null. */
export function parseHex(text: string): Rgb | null {
  let t = String(text || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) t = t.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(t)) return null;
  const n = parseInt(t, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
/** Four tones of a colour, lighter → darker (the same hue and saturation). */
export function tones(c: Rgb): Rgb[] {
  const { h, s } = rgbToHsl(c);
  return [0.78, 0.6, 0.42, 0.28].map((l) => hslToRgb(h, Math.max(0.25, s / 100), l));
}

type Deps = {
  api: any;
  notice: (s: string) => void;
  /** A colour taken from the screen (the closed island shows it for a moment). */
  onPicked?: (hex: string) => void;
};

const RECENT_KEY = 'charles-colors';
const DEFAULT_RECENT = ['#E8A23C', '#EDD9C0', '#7CC46B', '#5B8DEF', '#F0A487', '#D2484E', '#2A2A2E', '#FFFFFF'];

export function colorPicker({ api, notice, onPicked }: Deps) {
  let hsv = rgbToHsv(parseHex('#E8A23C')!);
  let recent: string[] = DEFAULT_RECENT;
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || 'null');
    if (Array.isArray(saved)) recent = saved.filter((x) => parseHex(x)).slice(0, 10);
  } catch {}
  const root = el('div', 'cp13');
  root.dataset.kind = 'colors';

  // the square and the hue bar
  const square = el('div', 'cp13-square');
  const knob = el('i', 'cp13-knob');
  square.append(knob);
  const hue = el('div', 'cp13-hue');
  const hueKnob = el('i', 'cp13-hue-knob');
  hue.append(hueKnob);
  square.setAttribute('aria-label', 'Doygunluk ve parlaklık');
  hue.setAttribute('aria-label', 'Renk tonu');
  for (const [box, label] of [[square, 'square'], [hue, 'hue']] as const) {
    box.tabIndex = 0;
    box.setAttribute('role', 'slider');
    box.dataset.part = label;
  }
  const pickArea = el('div', 'cp13-pick', square, hue);

  // the chosen colour and its tones
  const big = el('div', 'cp13-big', el('span', '', 'Seçilen renk'));
  const toneRow = el('div', 'cp13-tones');
  const chosen = el('div', 'cp13-chosen', big, toneRow, el('small', 'cp13-hint', 'Açık → koyu tonlar · tıkla, seç'));

  // HEX · RGB · HSL
  const field = (label: string) => {
    const input = el('input', 'cp13-value') as HTMLInputElement;
    input.spellcheck = false;
    input.setAttribute('aria-label', label);
    const copy = el('button', 'cp13-copy', icon('copy'));
    copy.type = 'button';
    copy.title = 'Kopyala';
    copy.setAttribute('aria-label', label + ' · Kopyala');
    copy.onclick = () => void copyText(input.value, copy);
    const row = el('label', 'cp13-row', el('small', 'cp13-label', label), input, copy);
    return { row, input };
  };
  const hexF = field('HEX'), rgbF = field('RGB'), hslF = field('HSL');
  const recentRow = el('div', 'cp13-recent');
  const clear = el('button', 'cp13-clear', 'Temizle');
  clear.type = 'button';
  clear.onclick = () => {
    recent = [];
    saveRecent();
    paintRecent();
  };
  const values = el(
    'div',
    'cp13-values',
    hexF.row,
    rgbF.row,
    hslF.row,
    el('div', 'cp13-recent-head', el('small', 'cp13-sec', 'Son renkler'), clear),
    recentRow,
  );
  root.append(pickArea, chosen, values);

  // "Ekrandan seç" (the panel header shows it at the top right)
  const screenBtn = el('button', 'cp13-screen', icon('pipette'), el('span', '', 'Ekrandan seç'));
  screenBtn.type = 'button';
  screenBtn.onclick = () => void fromScreen();

  const rgb = () => hsvToRgb(hsv.h, hsv.s, hsv.v);
  function paint(skip?: HTMLInputElement) {
    const c = rgb();
    const hex = toHex(c);
    const pure = toHex(hsvToRgb(hsv.h, 1, 1));
    square.style.setProperty('--hue', pure);
    knob.style.left = hsv.s * 100 + '%';
    knob.style.top = (1 - hsv.v) * 100 + '%';
    knob.style.background = hex;
    hueKnob.style.left = (hsv.h / 360) * 100 + '%';
    hueKnob.style.background = pure;
    big.style.background = hex;
    const { h, s, l } = rgbToHsl(c);
    big.classList.toggle('light', l > 62);
    if (skip !== hexF.input) hexF.input.value = hex;
    if (skip !== rgbF.input) rgbF.input.value = `${c.r}, ${c.g}, ${c.b}`;
    if (skip !== hslF.input) hslF.input.value = `${h}°, ${s}%, ${l}%`;
    square.setAttribute('aria-valuetext', hex);
    hue.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
    toneRow.replaceChildren(
      ...tones(c).map((t) => {
        const b = el('button', 'cp13-tone');
        b.type = 'button';
        b.style.background = toHex(t);
        b.title = toHex(t);
        b.setAttribute('aria-label', toHex(t));
        b.onclick = () => set(t, true);
        return b;
      }),
    );
    root.style.setProperty('--picked', hex);
  }
  function set(c: Rgb, remember = false) {
    hsv = rgbToHsv(c);
    paint();
    if (remember) remember1(toHex(c));
  }
  function remember1(hex: string) {
    recent = [hex, ...recent.filter((x) => x !== hex)].slice(0, 10);
    saveRecent();
    paintRecent();
  }
  function saveRecent() {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {}
  }
  function paintRecent() {
    const now = toHex(rgb());
    recentRow.replaceChildren(
      ...recent.map((hex) => {
        const b = el('button', 'cp13-swatch' + (hex === now ? ' on' : ''));
        b.type = 'button';
        b.style.background = hex;
        b.title = hex;
        b.setAttribute('aria-label', hex);
        b.onclick = () => {
          set(parseHex(hex)!);
          paintRecent();
        };
        return b;
      }),
    );
    clear.hidden = !recent.length;
    if (!recent.length) recentRow.append(el('small', 'cp13-empty', 'Henüz renk yok'));
  }
  async function copyText(text: string, from?: HTMLElement) {
    try {
      await api.copy(text);
      from?.classList.add('done');
      window.setTimeout(() => from?.classList.remove('done'), 1200);
    } catch (e) {
      notice((e as Error).message);
    }
  }
  async function fromScreen() {
    if (screenBtn.disabled) return;
    screenBtn.disabled = true;
    try {
      const c = await api.colorPick?.();
      if (!c?.hex) return;
      set(c, true);
      await copyText(c.hex);
      onPicked?.(c.hex);
    } catch (e) {
      notice((e as Error).message);
    } finally {
      screenBtn.disabled = false;
    }
  }

  // dragging on the square / the hue bar
  function drag(box: HTMLElement, move: (x: number, y: number) => void) {
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      const at = (ev: PointerEvent) => {
        const r = box.getBoundingClientRect();
        move(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
      };
      at(e);
      const onMove = (ev: PointerEvent) => at(ev);
      const end = () => {
        box.removeEventListener('pointermove', onMove);
        remember1(toHex(rgb()));
      };
      box.addEventListener('pointermove', onMove);
      box.addEventListener('pointerup', end, { once: true });
      box.addEventListener('pointercancel', end, { once: true });
    });
  }
  drag(square, (x, y) => {
    hsv = { ...hsv, s: x, v: 1 - y };
    paint();
  });
  drag(hue, (x) => {
    hsv = { ...hsv, h: Math.min(359.9, x * 360) };
    paint();
  });
  square.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (!m[e.key]) return;
    e.preventDefault();
    hsv = { ...hsv, s: clamp(hsv.s + m[e.key][0], 0, 1), v: clamp(hsv.v + m[e.key][1], 0, 1) };
    paint();
  });
  hue.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    hsv = { ...hsv, h: (hsv.h + d * (e.shiftKey ? 10 : 2) + 360) % 360 };
    paint();
  });
  // typing a value
  hexF.input.addEventListener('input', () => {
    const c = parseHex(hexF.input.value);
    if (c) {
      hsv = rgbToHsv(c);
      paint(hexF.input);
    }
  });
  rgbF.input.addEventListener('input', () => {
    const n = rgbF.input.value.match(/\d+/g)?.map(Number);
    if (n?.length === 3 && n.every((v) => v <= 255)) {
      hsv = rgbToHsv({ r: n[0], g: n[1], b: n[2] });
      paint(rgbF.input);
    }
  });
  hslF.input.addEventListener('input', () => {
    const n = hslF.input.value.match(/\d+/g)?.map(Number);
    if (n?.length === 3 && n[0] <= 360 && n[1] <= 100 && n[2] <= 100) {
      hsv = rgbToHsv(hslToRgb(n[0], n[1] / 100, n[2] / 100));
      paint(hslF.input);
    }
  });
  for (const f of [hexF, rgbF, hslF]) {
    f.input.addEventListener('change', () => {
      paint();
      remember1(toHex(rgb()));
    });
    f.input.addEventListener('keydown', (e) => e.key === 'Enter' && f.input.blur());
  }

  paint();
  paintRecent();
  return { root, action: screenBtn, fromScreen, hex: () => toHex(rgb()) };
}
export type ColorPicker = ReturnType<typeof colorPicker>;
