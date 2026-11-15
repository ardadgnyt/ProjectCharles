// The page's own tooltip (v1.0.0, tips): one tooltip element, one set of delegated listeners.
//
// Native `title` tooltips stay off (ui/no-native-tooltips.ts): Windows draws them as its own popup
// window, in the system look and outside the island's shape. This one is a plain element of the
// page, drawn inside the island's visible shape (or the app window), never focused, never hit by
// the pointer, and screen readers skip it (its text is already the anchor's description or name).
//
// Text: `data-tip`, else `aria-description`, else the `aria-label` of a control without visible
// text of its own. Never the anchor's own visible text, unless that text is cut off.
// Nothing runs while nothing is hovered or focused: no timers, no observers until a tip is shown.

export type Box = { left: number; top: number; right: number; bottom: number };

/** Hover delay; within WARM_MS of a tip closing the next one shows at once. */
export const SHOW_MS = 500;
export const WARM_MS = 400;
/** Space between anchor and tip, and between tip and the edge of the visible area. */
export const GAP = 6;
export const EDGE = 6;
const DEPTH = 6;

const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
/** A control's text counts as its own only with a letter or digit: "×", "›", "−" are icons. */
export const ownText = (text: string) => /[\p{L}\p{N}]/u.test(text);

export type TipSource = {
  tip?: string | null;
  description?: string | null;
  label?: string | null;
  /** the anchor's visible text */
  visible?: string;
  /** a button-like control (only these show their aria-label) */
  control?: boolean;
  /** the visible text is cut off */
  cut?: boolean;
};

/** The tooltip text for an anchor, or '' for none. */
export function pickTip(s: TipSource): string {
  const visible = norm(s.visible);
  const sources = [s.tip, s.description, s.control && !ownText(visible) ? s.label : null];
  for (const source of sources) {
    const text = norm(source);
    if (!text) continue;
    // the same words the anchor already shows: only worth showing when they are cut off
    if (text.toLowerCase() === visible.toLowerCase()) return s.cut ? text : '';
    return text;
  }
  return '';
}

/** Where a tip of `size` goes for `anchor`, inside `bounds`: below, flipped above, shifted in.
 *  null when the tip cannot fit at all (better none than a cut one). */
export function placeTip(
  anchor: Box,
  size: { width: number; height: number },
  bounds: Box,
  gap = GAP,
): { left: number; top: number; side: 'below' | 'above' } | null {
  const { width, height } = size;
  if (width > bounds.right - bounds.left || height > bounds.bottom - bounds.top) return null;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - height;
  let side: 'below' | 'above';
  let top: number;
  if (below + height <= bounds.bottom) ((side = 'below'), (top = below));
  else if (above >= bounds.top) ((side = 'above'), (top = above));
  else {
    // no room on either side: the side with more room, pushed in (it may cover the anchor)
    side = bounds.bottom - anchor.bottom >= anchor.top - bounds.top ? 'below' : 'above';
    top = side === 'below' ? bounds.bottom - height : bounds.top;
  }
  const centre = (anchor.left + anchor.right) / 2;
  const left = Math.min(Math.max(centre - width / 2, bounds.left), bounds.right - width);
  top = Math.min(Math.max(top, bounds.top), bounds.bottom - height);
  return { left: Math.round(left), top: Math.round(top), side };
}

const NO_TIP = '#pet,#charles-tip,[data-no-tip]';
const CONTROL = 'button,[role="button"],[role="tab"],[role="switch"],[role="menuitem"],a[href],summary,label';

/** The anchor's text is cut off (an ellipsis or a clamp, on the anchor or a line inside it). */
function cut(el: Element) {
  const parts = [el, ...Array.from(el.querySelectorAll('*')).slice(0, 12)] as HTMLElement[];
  return parts.some(
    (p) => p.clientWidth > 0 && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1),
  );
}

function textOf(el: Element): TipSource {
  const html = el as HTMLElement;
  const tip = el.getAttribute('data-tip');
  const visible = html.innerText ?? el.textContent ?? '';
  return {
    tip,
    description: el.getAttribute('aria-description'),
    label: el.getAttribute('aria-label'),
    visible,
    control: el.matches(CONTROL),
    // (layout is read only when the tip would repeat the visible text)
    cut: !!tip && norm(tip).toLowerCase() === norm(visible).toLowerCase() && cut(el),
  };
}

/** The anchor under `target` with a tip, and its text. */
function anchorOf(target: EventTarget | null): [Element, string] | null {
  let el = target instanceof Element ? target : null;
  // Charles himself (a canvas named "Karaktere dokun") and anything marked data-no-tip
  if (el?.closest(NO_TIP)) return null;
  for (let i = 0; el && i < DEPTH && el !== document.body; i++, el = el.parentElement) {
    if (el.id === 'charles-tip') return null;
    if (!el.hasAttribute('data-tip') && !el.hasAttribute('aria-description') && !el.hasAttribute('aria-label'))
      continue;
    const text = pickTip(textOf(el));
    if (text) return [el, text];
    // a named control without a tip ends the search (its parent's hint is not about it)
    if (el.matches(CONTROL)) return null;
  }
  return null;
}

/** The part of the window the user can see: the app window, or the island's own shape. */
function visibleArea(): Box {
  const w = document.documentElement.clientWidth || innerWidth;
  const h = document.documentElement.clientHeight || innerHeight;
  const view = { left: EDGE, top: EDGE, right: w - EDGE, bottom: h - EDGE };
  if (document.body.classList.contains('workspace')) return view;
  const island = document.querySelector<HTMLElement>('main.island');
  const r = island?.getBoundingClientRect();
  if (!island || !r || r.width < 1 || r.height < 1) return view;
  // the mask's ears (top) and corners (bottom) are in the island's own, zoomed, pixels
  const css = getComputedStyle(island);
  const zoom = (island as any).currentCSSZoom || 1;
  const px = (name: string) => (parseFloat(css.getPropertyValue(name)) || 0) * zoom;
  // a box inset by 0.3 r on both sides keeps its corner inside a rounded corner of radius r
  const corner = Math.max(EDGE, px('--r') * 0.3);
  return {
    left: Math.max(view.left, r.left + px('--ear-l') + corner),
    right: Math.min(view.right, r.right - px('--ear-r') - corner),
    top: Math.max(view.top, r.top + EDGE),
    bottom: Math.min(view.bottom, r.bottom - corner),
  };
}

export function tooltips() {
  let tip: HTMLElement | null = null;
  let anchor: Element | null = null;
  let pending: Element | null = null;
  let timer = 0;
  let closedAt = -Infinity;
  let keyboard = false;
  // a clicked anchor shows nothing until the pointer leaves it
  let quiet: Element | null = null;
  let watch: IntersectionObserver | null = null;
  const stats = { events: 0, shows: 0 };

  const element = () => {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'charles-tip';
    tip.setAttribute('role', 'tooltip');
    // the same words are the anchor's aria-description or aria-label already
    tip.setAttribute('aria-hidden', 'true');
    tip.setAttribute('translate', 'no');
    tip.hidden = true;
    // outside <body>: the page's body observers (language, chat) never see it
    document.documentElement.append(tip);
    return tip;
  };
  function hide() {
    clearTimeout(timer);
    timer = 0;
    pending = null;
    if (!anchor) return;
    anchor = null;
    watch?.disconnect();
    closedAt = performance.now();
    if (tip) {
      tip.classList.remove('on');
      tip.hidden = true;
    }
  }
  function show(el: Element, text: string) {
    clearTimeout(timer);
    timer = 0;
    pending = null;
    if (!el.isConnected) return;
    const t = element();
    if (t.textContent !== text) t.textContent = text;
    t.hidden = false;
    t.classList.remove('on');
    t.style.left = '0px';
    t.style.top = '0px';
    const place = placeTip(el.getBoundingClientRect(), t.getBoundingClientRect(), visibleArea());
    const a = el.getBoundingClientRect();
    if (!place || a.width < 1 || a.height < 1) {
      t.hidden = true;
      return;
    }
    t.style.left = place.left + 'px';
    t.style.top = place.top + 'px';
    t.dataset.side = place.side;
    t.classList.add('on');
    anchor = el;
    stats.shows++;
    // the anchor leaves the page or is hidden: the tip goes with it
    watch ??= new IntersectionObserver((entries) => {
      if (entries.some((e) => e.target === anchor && !e.isIntersecting)) hide();
    });
    watch.observe(el);
  }
  function want(el: Element, text: string, now: boolean) {
    if (el === anchor || (el === pending && !now)) return;
    if (anchor) hide();
    if (now || performance.now() - closedAt < WARM_MS) return show(el, text);
    clearTimeout(timer);
    pending = el;
    timer = window.setTimeout(() => {
      // the text may have changed while waiting
      const hit = pending && anchorOf(pending);
      if (hit && hit[0] === pending) show(hit[0], hit[1]);
    }, SHOW_MS);
  }

  document.addEventListener(
    'pointerover',
    (e) => {
      stats.events++;
      if (e.pointerType === 'touch') return;
      const hit = anchorOf(e.target);
      if (!hit) {
        if (anchor || pending) hide();
        return;
      }
      if (hit[0] === quiet) return;
      quiet = null;
      want(hit[0], hit[1], false);
    },
    true,
  );
  document.addEventListener(
    'pointerout',
    (e) => {
      stats.events++;
      const to = e.relatedTarget as Node | null;
      const current = anchor || pending;
      if (quiet && !(to && quiet.contains(to))) quiet = null;
      if (current && !(to && current.contains(to))) hide();
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      stats.events++;
      keyboard = false;
      quiet = anchorOf(e.target)?.[0] ?? null;
      hide();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      stats.events++;
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      keyboard = true;
      // typing, Escape, Enter, arrows: the tip goes; Tab moves focus and focusin shows the next one
      if (anchor || pending) hide();
    },
    true,
  );
  document.addEventListener(
    'focusin',
    (e) => {
      stats.events++;
      const el = e.target as Element;
      if (!keyboard || !el?.matches?.(':focus-visible')) return;
      const hit = anchorOf(el);
      if (hit && hit[0] === el) want(el, hit[1], true);
    },
    true,
  );
  document.addEventListener(
    'focusout',
    (e) => {
      stats.events++;
      if (e.target === anchor || e.target === pending) hide();
    },
    true,
  );
  const quick = () => {
    if (anchor || pending) hide();
  };
  document.addEventListener('click', quick, true);
  document.addEventListener('scroll', quick, { capture: true, passive: true });
  window.addEventListener('blur', quick);
  window.addEventListener('resize', quick);
  document.addEventListener('visibilitychange', quick);
  // test windows read this (.qa/h100/tips): listener calls and tips shown
  (window as any).charlesTips = { stats, hide, current: () => anchor, textOf: (el: Element) => anchorOf(el), area: visibleArea };
}
