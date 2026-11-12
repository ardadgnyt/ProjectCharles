// Generated images in the chat (v0.5.5).
//
// While the image is being made: a soft animated canvas with an estimated percentage.
// The image tool does not report real progress, so the percentage is an estimate from how
// long the last generations took on this computer (it never shows 100 % before the image
// arrives). When it is done: the image with İndir / Kopyala / Büyüt buttons.

// v0.9.26: the card's state is data (`data-image-state`: generating, done, failed, cancelled), never
// a text, and every text in it goes through t(). A chat message is not translated by the page's
// language watcher (it skips what the AI wrote), so in English, German … the card, its buttons and
// the big view stayed Turkish; a language change now relabels the cards that are on screen.
// The translator and the percent format come from renderer.ts (setImageText), so this file stays
// free of imports and can be loaded on its own (tests).
let t = (s: string) => s;
let percent = (n: number) => '%' + n;
export function setImageText(translate: (s: string) => string, format: (n: number) => string) {
  t = translate;
  percent = format;
}

const HISTORY_KEY = 'charles-image-durations';
const DEFAULT_MS = 40000;
const started = new WeakMap<HTMLElement, number>();
const timers = new WeakMap<HTMLElement, ReturnType<typeof setInterval>>();

function typicalMs() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').filter(
      (n: unknown) => typeof n === 'number' && n > 3000 && n < 600000,
    );
    if (list.length) return list.reduce((a: number, b: number) => a + b, 0) / list.length;
  } catch {}
  return DEFAULT_MS;
}

function remember(ms: number) {
  if (!(ms > 3000 && ms < 600000)) return;
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...list, Math.round(ms)].slice(-8)));
  } catch {}
}

// Estimated progress 0..95: reaches ~90 % at the typical duration, then creeps toward 95 %.
export function estimate(elapsedMs: number, typical = DEFAULT_MS) {
  const k = elapsedMs / Math.max(5000, typical);
  return Math.min(95, Math.round(95 * (1 - Math.exp(-2.4 * k))));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function stop(node: HTMLElement) {
  clearInterval(timers.get(node));
  timers.delete(node);
}

/** "%42" in Turkish, "42%" elsewhere (the number format of the interface language). */
export function percentText(p: number) {
  return percent(p);
}
const PHRASES = ['Fırçalar hazırlanıyor…', 'Taslak çiziliyor…', 'Renkler ekleniyor…', 'Son rötuşlar…'];
/** The line under the percentage: the step and the seconds, in the interface language. */
export function progressLine(p: number, elapsedMs: number) {
  return t(PHRASES[Math.min(PHRASES.length - 1, Math.floor(p / 25))]) + ' · ' + t('{n} sn').replace('{n}', String(Math.floor(elapsedMs / 1000)));
}
const relabel = new Set<() => void>();
let listening = false;
/** A card that must follow a language change; the page listener is added with the first one. */
function track(f: () => void) {
  relabel.add(f);
  if (listening || typeof document?.addEventListener !== 'function') return;
  listening = true;
  document.addEventListener('charles-language', () => {
    for (const g of [...relabel]) g();
  });
}

// The "Görsel oluşturuluyor" card. Safe to call again for the same node.
export function showGenerating(node: HTMLElement) {
  if (started.has(node)) return;
  started.set(node, Date.now());
  node.classList.add('image-card', 'image-generating');
  node.dataset.imageState = 'generating';
  const canvas = el('div', 'image-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.append(el('i', 'blob b1'), el('i', 'blob b2'), el('i', 'blob b3'), el('i', 'grain'));
  const info = el('div', 'image-progress');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 44 44');
  ring.classList.add('image-ring');
  ring.innerHTML =
    '<circle class="track" cx="22" cy="22" r="19"/><circle class="fill" cx="22" cy="22" r="19" pathLength="100"/>';
  const percent = el('strong', 'image-percent', percentText(0));
  const label = el('span', 'image-label');
  const sub = el('small', 'image-sub');
  const bar = el('div', 'image-bar');
  bar.append(el('i'));
  info.append(ring, percent, label, sub, bar);
  info.setAttribute('role', 'progressbar');
  info.setAttribute('aria-valuemin', '0');
  info.setAttribute('aria-valuemax', '100');
  node.replaceChildren(canvas, info);
  const typical = typicalMs();
  const words = () => {
    label.textContent = t('Görsel oluşturuluyor');
    info.setAttribute('aria-label', t('Görsel oluşturuluyor'));
  };
  const tick = () => {
    if (!node.isConnected || node.dataset.imageState !== 'generating') return stop(node);
    const elapsed = Date.now() - (started.get(node) || Date.now());
    const p = estimate(elapsed, typical);
    percent.textContent = percentText(p);
    info.setAttribute('aria-valuenow', String(p));
    node.style.setProperty('--progress', String(p));
    sub.textContent = progressLine(p, elapsed);
  };
  words();
  tick();
  timers.set(node, setInterval(tick, 250));
  const again = () => {
    if (!node.isConnected || node.dataset.imageState !== 'generating') return relabel.delete(again);
    words();
    tick();
  };
  track(again);
}

export function showFailed(node: HTMLElement, text = 'Görsel oluşturulamadı.', state: 'failed' | 'cancelled' = 'failed') {
  stop(node);
  node.classList.remove('image-generating');
  node.classList.add('image-card', 'image-failed');
  node.dataset.imageState = state;
  const label = el('span', 'image-label', t(text));
  node.replaceChildren(label);
  const again = () => {
    if (!node.isConnected || node.dataset.imageState !== state) return relabel.delete(again);
    label.textContent = t(text);
  };
  track(again);
}

type Actions = {
  save: (dataUrl: string) => Promise<any>;
  copy: (dataUrl: string) => Promise<any>;
  notice: (text: string) => void;
};

const ICONS: Record<string, string> = {
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2.5"/><path d="M5 15V7a2 2 0 0 1 2-2h8"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  attach: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

let closeOpen: (() => void) | null = null;
/** v0.9.15: closes the big view, if one is open (the island is closing). */
export const closeLightbox = () => closeOpen?.();

/** v0.9.26: what the big view's buttons do (renderer.ts sets them once). */
export type PreviewActions = {
  attach: (dataUrl: string, name: string) => Promise<any>;
  copy: (dataUrl: string) => Promise<any>;
  save: (dataUrl: string, name: string) => Promise<any>;
};
let previewActions: PreviewActions | null = null;
export function setPreviewActions(a: PreviewActions) {
  previewActions = a;
}
/** name: the file name a saved copy starts with; original: false when only a smaller preview exists. */
export type PreviewInfo = { name?: string; original?: boolean };

export function lightbox(
  src: string,
  alt = 'Charles tarafından oluşturulan görsel (büyük)',
  info: PreviewInfo = {},
) {
  closeLightbox();
  const box = el('div', 'image-lightbox');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('Görsel büyük boy'));
  const img = el('img');
  img.src = src;
  img.alt = alt;
  // v0.9.15: an icon like the other buttons (the "×" letter sat low and off-centre in the circle)
  const close = el('button', 'image-lightbox-close');
  close.innerHTML = ICONS.close;
  close.type = 'button';
  close.setAttribute('aria-label', t('Kapat'));
  // v0.9.26: Sohbete ekle · Görseli kopyala · Bir kopyasını indir, for every picture in the chat
  const bar = el('div', 'image-lightbox-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('Görsel işlemleri'));
  const status = el('small', 'image-lightbox-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const say = (text: string, kind: 'ok' | 'error' | 'note') => {
    status.textContent = text;
    status.dataset.kind = kind;
    status.hidden = !text;
  };
  const name = info.name || 'Charles-gorsel';
  const action = (id: string, label: string, run: (a: PreviewActions) => Promise<any>, done: string, after?: () => void) => {
    const b = el('button', 'image-lightbox-action');
    b.type = 'button';
    b.innerHTML = ICONS[id] + '<span></span>';
    b.querySelector('span')!.textContent = t(label);
    b.dataset.action = id;
    b.onclick = async (e) => {
      e.stopPropagation();
      if (b.disabled || !previewActions) return;
      b.disabled = true; // one press, one attachment / one copy / one file
      try {
        const result = await run(previewActions);
        // false: the save dialog was cancelled; nothing happened, nothing to announce
        if (result !== false) {
          say(t(done), 'ok');
          after?.();
        }
      } catch (err) {
        say(t((err as Error).message || 'Görsel okunamadı.'), 'error');
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  bar.append(
    action('attach', 'Sohbete ekle', (a) => a.attach(src, name), 'Görsel mesaj kutusuna eklendi.', () => {
      done();
      document.getElementById('prompt')?.focus();
    }),
    action('copy', 'Görseli kopyala', (a) => a.copy(src), 'Görsel panoya kopyalandı.'),
    action('save', 'Bir kopyasını indir', (a) => a.save(src, name), 'Kopya kaydedildi.'),
  );
  bar.onclick = (e) => e.stopPropagation();
  if (info.original === false) say(t('Özgün dosya artık yok; işlemler bu önizleme kopyasıyla yapılır.'), 'note');
  const foot = el('div', 'image-lightbox-foot');
  foot.append(bar, status);
  foot.onclick = (e) => e.stopPropagation();
  box.append(img, foot, close);
  const done = () => {
    closeOpen = null;
    box.classList.add('closing');
    setTimeout(() => box.remove(), 160);
    document.removeEventListener('keydown', key, true);
  };
  closeOpen = done;
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done();
    } else if (e.key === 'Tab') {
      // the keyboard stays on the view's own buttons while it is open
      const items = [...box.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!items.length) return;
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length];
      e.preventDefault();
      next.focus();
    }
  };
  box.onclick = done;
  document.addEventListener('keydown', key, true);
  // v0.9.16: the island's shape is a mask on main.island, narrower than the page (its top "ears"
  // and rounded corners). On <body> the dark layer covered the see-through rest of the window too:
  // strips down the sides and square corners around the panel. Inside the island it has its shape.
  const island = document.querySelector<HTMLElement>('main.island');
  (island && !document.body.classList.contains('workspace') ? island : document.body).append(box);
  close.focus();
}

// The finished image with its buttons.
export function showImage(node: HTMLElement, dataUrl: string, actions: Actions) {
  const began = started.get(node);
  stop(node);
  if (began) remember(Date.now() - began);
  const wasGenerating = node.classList.contains('image-generating');
  node.classList.remove('image-generating', 'image-failed');
  node.classList.add('image-card', 'image-done');
  node.dataset.imageState = 'done';
  const frame = el('div', 'image-frame');
  const img = el('img');
  img.src = dataUrl;
  const big = () => lightbox(dataUrl, t('Charles tarafından oluşturulan görsel (büyük)'), { name: 'Charles-gorsel', original: true });
  img.onclick = big;
  frame.append(img);
  const bar = el('div', 'image-actions');
  const labels: (() => void)[] = [];
  const button = (id: string, label: string, run: () => Promise<any>, done?: string) => {
    const b = el('button', 'image-action');
    b.type = 'button';
    let showingDone = false;
    const paint = () => {
      b.innerHTML = (showingDone ? ICONS.ok : ICONS[id]) + '<span></span>';
      b.querySelector('span')!.textContent = t(showingDone && done ? done : label);
      b.setAttribute('aria-label', t(label));
    };
    labels.push(paint);
    paint();
    b.onclick = async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try {
        const result = await run();
        if (done && result !== false) {
          b.classList.add('done');
          showingDone = true;
          paint();
          setTimeout(() => {
            b.classList.remove('done');
            showingDone = false;
            paint();
          }, 1800);
        }
      } catch (err) {
        actions.notice(t((err as Error).message));
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  bar.append(
    button('save', 'İndir', () => actions.save(dataUrl), 'Kaydedildi'),
    button('copy', 'Kopyala', () => actions.copy(dataUrl), 'Kopyalandı'),
    button('zoom', 'Büyüt', async () => big()),
  );
  const seconds = began ? Math.max(1, Math.round((Date.now() - began) / 1000)) : 0;
  const meta = seconds ? el('small', 'image-meta') : null;
  if (meta) bar.append(meta);
  const words = () => {
    img.alt = t('Charles tarafından oluşturulan görsel');
    img.title = t('Büyütmek için tıkla');
    if (meta) meta.textContent = t('{n} sn').replace('{n}', String(seconds));
    for (const f of labels) f();
  };
  words();
  const again = () => {
    if (!node.isConnected || node.dataset.imageState !== 'done') return relabel.delete(again);
    words();
  };
  track(again);
  node.replaceChildren(frame, bar);
  if (wasGenerating) {
    node.classList.add('image-reveal');
    setTimeout(() => node.classList.remove('image-reveal'), 900);
  }
}
