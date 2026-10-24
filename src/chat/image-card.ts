// Generated images in the chat (v0.5.5).
//
// While the image is being made: a soft animated canvas with an estimated percentage.
// The image tool does not report real progress, so the percentage is an estimate from how
// long the last generations took on this computer (it never shows 100 % before the image
// arrives). When it is done: the image with İndir / Kopyala / Büyüt buttons.

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

// The "Görsel oluşturuluyor" card. Safe to call again for the same node.
export function showGenerating(node: HTMLElement) {
  if (started.has(node)) return;
  started.set(node, Date.now());
  node.classList.add('image-card', 'image-generating');
  const canvas = el('div', 'image-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.append(el('i', 'blob b1'), el('i', 'blob b2'), el('i', 'blob b3'), el('i', 'grain'));
  const info = el('div', 'image-progress');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 44 44');
  ring.classList.add('image-ring');
  ring.innerHTML =
    '<circle class="track" cx="22" cy="22" r="19"/><circle class="fill" cx="22" cy="22" r="19" pathLength="100"/>';
  const percent = el('strong', 'image-percent', '%0');
  const label = el('span', 'image-label', 'Görsel oluşturuluyor');
  const sub = el('small', 'image-sub', 'Fırçalar hazırlanıyor…');
  const bar = el('div', 'image-bar');
  bar.append(el('i'));
  info.append(ring, percent, label, sub, bar);
  info.setAttribute('role', 'progressbar');
  info.setAttribute('aria-label', 'Görsel oluşturuluyor');
  info.setAttribute('aria-valuemin', '0');
  info.setAttribute('aria-valuemax', '100');
  node.replaceChildren(canvas, info);
  const typical = typicalMs();
  const phrases = [
    'Fırçalar hazırlanıyor…',
    'Taslak çiziliyor…',
    'Renkler ekleniyor…',
    'Son rötuşlar…',
  ];
  const tick = () => {
    if (!node.isConnected) return stop(node);
    const elapsed = Date.now() - (started.get(node) || Date.now());
    const p = estimate(elapsed, typical);
    percent.textContent = '%' + p;
    info.setAttribute('aria-valuenow', String(p));
    node.style.setProperty('--progress', String(p));
    sub.textContent =
      phrases[Math.min(phrases.length - 1, Math.floor(p / 25))] +
      ' · ' +
      Math.floor(elapsed / 1000) +
      ' sn';
  };
  tick();
  timers.set(node, setInterval(tick, 250));
}

export function showFailed(node: HTMLElement, text = 'Görsel oluşturulamadı.') {
  stop(node);
  node.classList.remove('image-generating');
  node.classList.add('image-card', 'image-failed');
  node.replaceChildren(el('span', 'image-label', text));
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
};

/** The picture over the whole window; a click or Esc closes it. v0.9.1: also for pictures the
 *  user sent (alt names the file). */
export function lightbox(src: string, alt = 'Charles tarafından oluşturulan görsel (büyük)') {
  const box = el('div', 'image-lightbox');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Görsel büyük boy');
  const img = el('img');
  img.src = src;
  img.alt = alt;
  const close = el('button', 'image-lightbox-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Kapat');
  box.append(img, close);
  const done = () => {
    box.classList.add('closing');
    setTimeout(() => box.remove(), 160);
    document.removeEventListener('keydown', key, true);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done();
    }
  };
  box.onclick = done;
  document.addEventListener('keydown', key, true);
  document.body.append(box);
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
  const frame = el('div', 'image-frame');
  const img = el('img');
  img.src = dataUrl;
  img.alt = 'Charles tarafından oluşturulan görsel';
  img.title = 'Büyütmek için tıkla';
  img.onclick = () => lightbox(dataUrl);
  frame.append(img);
  const bar = el('div', 'image-actions');
  const button = (id: string, label: string, run: () => Promise<any>, done?: string) => {
    const b = el('button', 'image-action');
    b.type = 'button';
    b.innerHTML = ICONS[id] + '<span></span>';
    b.querySelector('span')!.textContent = label;
    b.setAttribute('aria-label', label);
    b.onclick = async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try {
        const result = await run();
        if (done && result !== false) {
          b.classList.add('done');
          b.innerHTML = ICONS.ok + '<span></span>';
          b.querySelector('span')!.textContent = done;
          setTimeout(() => {
            b.classList.remove('done');
            b.innerHTML = ICONS[id] + '<span></span>';
            b.querySelector('span')!.textContent = label;
          }, 1800);
        }
      } catch (err) {
        actions.notice((err as Error).message);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  bar.append(
    button('save', 'İndir', () => actions.save(dataUrl), 'Kaydedildi'),
    button('copy', 'Kopyala', () => actions.copy(dataUrl), 'Kopyalandı'),
    button('zoom', 'Büyüt', async () => lightbox(dataUrl)),
  );
  if (began) {
    const meta = el(
      'small',
      'image-meta',
      Math.max(1, Math.round((Date.now() - began) / 1000)) + ' sn',
    );
    bar.append(meta);
  }
  node.replaceChildren(frame, bar);
  if (wasGenerating) {
    node.classList.add('image-reveal');
    setTimeout(() => node.classList.remove('image-reveal'), 900);
  }
}
