// v0.8.10: the island's new shape.
//
//   notch  (closed)  a small strip at the top edge: Charles, his status, music controls
//   shelf  (open)    the card shelf hanging from the top: AI usage, weather, the converter,
//                    Charles and music; ‹ › dock the island to the left / right edge
//   chat             the shelf grows down into the chat panel
//
// The main process decides the size (app/core/layout.cjs) and sends the view ('ui-view').
// Existing parts of the island (quota gauges, weather line, Spotify controls) keep working as
// they did; the cards read their state and use their buttons.
import { el, icon } from '../workspace/icons';
import { converterSheet } from './converter';
import { bindFileDropTargets } from './drop-target';
import { shareSheet } from './share';
import { usageAll } from './usage-all';
import { modeSegment } from './mode-seg';

type View = 'notch' | 'shelf' | 'chat';
type Deps = {
  api: any;
  notice: (s: string) => void;
  attempt: (fn: () => Promise<any>) => Promise<void>;
};

const svg = (name: string) => icon(name);
// v0.8.14: whether a click went through an element matching `selector`. The path is taken when
// the click starts, so it still counts when a button redraws its icon while the click is handled
// (the clicked icon is no longer in the page by the time the click reaches the card or the shelf).
const onPath = (e: Event, selector: string) => e.composedPath().some((n) => n instanceof Element && n.matches(selector));
const button = (cls: string, label: string, ...children: (Node | string)[]) => {
  const b = el('button', cls, ...children);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  return b;
};

export function islandShelf({ api, notice, attempt }: Deps) {
  const body = document.body;
  const $ = (id: string) => document.getElementById(id)!;
  const island = document.querySelector<HTMLElement>('main.island')!;
  const header = island.querySelector('header')!;
  const pet = $('pet');
  const center = document.querySelector<HTMLElement>('.character-center')!;
  const version = document.querySelector('.version-label')?.textContent?.trim() || '';
  body.classList.add('v10');
  let view: View = body.classList.contains('compact') ? 'notch' : 'shelf';

  // ── the top bar (shelf and chat) ───────────────────────────────────────────
  const bar = el('div', 'ibar');
  bar.id = 'island-bar';
  const left = el('div', 'ibar-side ibar-left');
  const right = el('div', 'ibar-side ibar-right');
  bar.append(left, right);
  header.prepend(bar);
  const fillBar = () => {
    for (const id of ['settings-toggle', 'sessions-toggle', 'panel-pin', 'workspace-open']) {
      const b = document.getElementById(id);
      if (b && b.parentElement !== left) left.append(b);
    }
    const actions = header.querySelector('.window-actions');
    if (actions && actions.parentElement !== right) right.append(actions);
  };
  fillBar();
  // the window buttons get the same line icons as the rest of the bar
  for (const [id, name] of [['collapse', 'minimize'], ['quit', 'x']] as const) {
    const b = document.getElementById(id);
    if (b) b.replaceChildren(svg(name));
  }
  window.setTimeout(fillBar, 0);
  window.setTimeout(fillBar, 1500);

  // ‹ › dock the island to the left / right edge of the screen (and back to the middle), as
  // the old island's arrows did; they press the old (hidden) dock buttons.
  const dockLeft = () => document.getElementById('dock-left')?.click();
  const dockRight = () => document.getElementById('dock-toggle')?.click();
  const prev = button('chat-nav chat-prev', 'Sola yasla', svg('chevronLeft'));
  const next = button('chat-nav chat-next', 'Sağa yasla', svg('chevronRight'));
  prev.id = 'chat-prev';
  next.id = 'chat-next';
  prev.onclick = dockLeft;
  next.onclick = dockRight;
  header.append(prev, next);
  // "Yeni konuşma" moves next to the mode picker, as in the design
  const modeRow = document.querySelector('.mode-row');
  const newChat = document.getElementById('new-chat');
  if (modeRow && newChat) {
    newChat.prepend(svg('plus'));
    modeRow.append(newChat);
  }
  modeSegment();

  // In the shelf the chat button opens the chat; settings open over the chat panel (dialogs
  // need its height).
  const viaChat = (id: string, open: boolean) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener(
      'click',
      (e) => {
        if (view !== 'shelf') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        void attempt(async () => {
          await api.islandView('chat');
          if (open) window.setTimeout(() => b.click(), 260);
        });
      },
      true,
    );
  };
  viaChat('sessions-toggle', false);
  // v0.8.14: the city picker too (in the shelf it was cut off below the cards)
  viaChat('weather-idle', true);
  viaChat('settings-toggle', true);

  // ── notch ──────────────────────────────────────────────────────────────────
  const notch = el('div', 'notch');
  notch.id = 'notch';
  const notchPet = el('span', 'notch-pet');
  const notchStatus = el('small', 'notch-status');
  // v0.8.11: the version under the name (shown with the music controls; the idle notch is only Slime)
  const notchName = el('span', 'notch-name', el('strong', '', 'Charles'), el('small', 'notch-version', version), notchStatus);
  const notchWeather = el('span', 'notch-weather');
  const ctl = (name: string, label: string, target: string, cls = '') => {
    const b = button('notch-ctl ' + cls, label, svg(name));
    b.onclick = (e) => {
      e.stopPropagation();
      document.getElementById(target)?.click();
    };
    return b;
  };
  const notchPlay = ctl('pause', 'Duraklat', 'music-pause', 'notch-play');
  const notchMusic = el(
    'div',
    'notch-music',
    ctl('shuffle', 'Karıştır', 'music-shuffle'),
    ctl('prev', 'Önceki parça', 'music-previous'),
    notchPlay,
    ctl('next', 'Sonraki parça', 'music-next'),
    ctl('repeat', 'Tekrar', 'music-repeat'),
  );
  const notchBar = el('i');
  const notchProgress = el('div', 'notch-progress', notchBar);
  notch.append(notchPet, notchName, notchWeather, notchMusic, notchProgress);
  island.prepend(notch);
  notch.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#pet, .notch-ctl')) return;
    void attempt(() => api.islandView('shelf'));
  });
  // a file dragged over the notch opens the shelf, so it can be dropped on the converter
  document.addEventListener('dragenter', (e) => {
    if (view !== 'notch' || !e.dataTransfer?.types.includes('Files')) return;
    void api.islandView('shelf').catch(() => {});
  });

  // ── shelf ──────────────────────────────────────────────────────────────────
  // v0.9.13: the home page — Charles with a message box and Spotify on top; three cards below
  // (Dosyalar, AI kullanımı, Hava durumu) that open a panel under them.
  const shelf = el('section', 'shelf shelf13');
  shelf.id = 'shelf';
  shelf.setAttribute('aria-label', 'Ana sayfa');
  const pagePrev = button('shelf-nav shelf-prev', 'Sola yasla', svg('chevronLeft'));
  const pageNext = button('shelf-nav shelf-next', 'Sağa yasla', svg('chevronRight'));
  pagePrev.onclick = dockLeft;
  pageNext.onclick = dockRight;
  // an arrow is hidden when the island already sits at that edge (like the old island)
  const syncDock = () => {
    const l = document.getElementById('dock-left'), r = document.getElementById('dock-toggle');
    for (const [b, old] of [[pagePrev, l], [prev, l], [pageNext, r], [next, r]] as const) {
      b.style.visibility = old?.hidden ? 'hidden' : '';
      const label = old?.getAttribute('aria-label');
      if (label) b.setAttribute('aria-label', label);
    }
  };
  for (const id of ['dock-left', 'dock-toggle']) {
    const old = document.getElementById(id);
    if (old) new MutationObserver(syncDock).observe(old, { attributes: true, attributeFilter: ['hidden', 'aria-label'] });
  }
  syncDock();
  const inner = el('div', 'h13');
  shelf.append(pagePrev, inner, pageNext);
  header.after(shelf);

  // Charles: Slime, his name and an inline message box (mic, voice call, send)
  const charlesSlot = el('span', 'charles-pet h13-pet');
  const charlesName = button('h13-name', 'Sohbeti aç', el('strong', '', 'Charles'), el('small', '', version));
  // v0.9.13: no card around Charles (as in the design): Slime, name, version, message box
  charlesName.onclick = () => void attempt(() => api.islandView('chat'));
  const ask = el('form', 'h13-ask');
  const askInput = el('input') as HTMLInputElement;
  askInput.type = 'text';
  askInput.placeholder = 'Charles’a bir şey sor…';
  askInput.setAttribute('aria-label', 'Charles’a bir şey sor');
  askInput.maxLength = 100000;
  const viaComposer = (id: string) => () =>
    void attempt(async () => {
      await api.islandView('chat');
      window.setTimeout(() => document.getElementById(id)?.click(), 260);
    });
  const askMic = button('h13-ask-btn', 'Konuş', svg('mic'));
  askMic.title = 'Konuş';
  askMic.onclick = viaComposer('voice-mic');
  const askCall = button('h13-ask-btn', 'Sesli görüşme', svg('wave'));
  askCall.title = 'Sesli görüşme';
  askCall.onclick = viaComposer('voice-call');
  const askSend = button('h13-ask-btn h13-ask-send', 'Gönder', svg('arrowUp'));
  askSend.type = 'submit';
  ask.append(askInput, askMic, askCall, askSend);
  const syncAsk = () => (askSend.disabled = !askInput.value.trim());
  askInput.addEventListener('input', syncAsk);
  syncAsk();
  ask.onsubmit = (e) => {
    e.preventDefault();
    const text = askInput.value.trim();
    if (!text) return;
    void attempt(async () => {
      await api.islandView('chat');
      window.setTimeout(() => {
        const prompt = document.getElementById('prompt') as HTMLTextAreaElement | null;
        const form = document.getElementById('composer') as HTMLFormElement | null;
        if (!prompt || !form) return;
        prompt.value = text;
        prompt.dispatchEvent(new Event('input'));
        form.requestSubmit();
        askInput.value = '';
        syncAsk();
      }, 260);
    });
  };
  const hero = el('div', 'h13-hero', charlesSlot, el('div', 'h13-hero-main', charlesName, ask));
  hero.addEventListener('click', (e) => {
    if (e.target === hero) void attempt(() => api.islandView('chat'));
  });

  // music
  const music = musicCard(attempt, api);
  // v0.8.11: the installed Spotify app's own icon instead of the music note (if Windows has one)
  void Promise.resolve(api.spotifyIcon?.())
    .then((src: string | null) => {
      if (typeof src === 'string' && /^data:image\/png;base64,/.test(src)) music.brand(src);
    })
    .catch(() => {});
  inner.append(el('div', 'h13-top', hero, music.card));

  // the three cards
  type Kind = 'files' | 'usage' | 'weather';
  const acc = (kind: Kind, iconNode: Node, title: string, sub: string) => {
    const subEl = el('small', 'h13-acc-sub send-hint', sub);
    subEl.dataset.idle = sub;
    const titleEl = el('strong', 'h13-acc-title', title);
    const b = button('h13-acc', title, el('span', 'h13-acc-icon', iconNode), el('span', 'h13-acc-text', titleEl, subEl), el('span', 'h13-acc-chev', svg('chevronDown')));
    b.dataset.kind = kind;
    b.setAttribute('aria-expanded', 'false');
    b.onclick = () => togglePanel(kind);
    return { b, sub: subEl, title: titleEl, icon: b.querySelector('.h13-acc-icon') as HTMLElement };
  };
  const filesAcc = acc('files', svg('folder'), 'Dosyalar', 'Dönüştür veya gönder');
  // v0.9.13: a file dragged onto Dosyalar opens its two drop tiles
  filesAcc.b.dataset.drop = 'files';
  const usageAcc = acc('usage', svg('chart'), 'AI kullanımı', 'Okunuyor…');
  const weatherAcc = acc('weather', el('span', 'h13-emoji', '☁️'), 'Hava durumu', 'Konum seç');
  const accs = el('div', 'h13-accs', filesAcc.b, usageAcc.b, weatherAcc.b);
  const panel = el('div', 'h13-panel');
  panel.hidden = true;
  const panelBody = el('div', 'h13-panel-body');
  panel.append(panelBody);
  inner.append(accs, panel);
  const accByKind: Record<Kind, HTMLButtonElement> = { files: filesAcc.b, usage: usageAcc.b, weather: weatherAcc.b };

  // the page's height follows its content (main clamps it, app/core/layout.cjs)
  let sentHeight = 0;
  let heightFrame = 0;
  const sendHeight = () => {
    cancelAnimationFrame(heightFrame);
    heightFrame = requestAnimationFrame(() => {
      if (view !== 'shelf') return;
      const bar = document.getElementById('island-bar');
      // the shelf's own height (its content is drawn smaller with CSS zoom: see 29-v0913.css)
      const h = Math.ceil((bar?.offsetHeight || 40) + shelf.offsetHeight + 17);
      if (Math.abs(h - sentHeight) < 2) return;
      sentHeight = h;
      void Promise.resolve(api.shelfHeight?.(h)).catch(() => {});
    });
  };
  new ResizeObserver(sendHeight).observe(inner);
  shelf.addEventListener('h13-resize', sendHeight);

  let openKind: Kind | null = null;
  let panelClose: (() => void) | null = null;
  function openPanel(kind: Kind, content: HTMLElement, onClose?: () => void) {
    if (openKind !== kind) closePanel();
    else {
      const old = panelClose;
      panelClose = null;
      old?.();
    }
    openKind = kind;
    panelBody.replaceChildren(content);
    panel.hidden = false;
    panel.dataset.kind = kind;
    shelf.dataset.sheet = kind;
    shelf.classList.add('panel-open');
    for (const [k, b] of Object.entries(accByKind)) {
      b.classList.toggle('on', k === kind);
      b.setAttribute('aria-expanded', String(k === kind));
    }
    const card = accByKind[kind];
    panel.style.setProperty('--notch-x', card.offsetLeft + card.offsetWidth / 2 + 'px');
    panelClose = onClose || null;
    // v0.9.13: an open panel no longer pins the island: a click elsewhere folds it as usual.
    // Only a file transfer or an incoming offer keeps it open (a conversion holds it in main).
    void Promise.resolve(api.shelfHold?.(kind === 'files' && share.busy())).catch(() => {});
    sendHeight();
  }
  function closePanel() {
    if (!openKind) return;
    openKind = null;
    panel.hidden = true;
    delete panel.dataset.kind;
    delete shelf.dataset.sheet;
    shelf.classList.remove('panel-open');
    for (const b of Object.values(accByKind)) {
      b.classList.remove('on');
      b.setAttribute('aria-expanded', 'false');
    }
    const done = panelClose;
    panelClose = null;
    void Promise.resolve(api.shelfHold?.(false)).catch(() => {});
    done?.();
    sendHeight();
  }
  const closeSheet = closePanel;
  function togglePanel(kind: Kind) {
    if (openKind === kind) return closePanel();
    if (kind === 'files') openFiles('home');
    else if (kind === 'usage') openUsage();
    else openWeather();
  }

  // ── Dosyalar: two tiles, then Dönüştür | Gönder ────────────────────────────
  const tile = (kind: 'convert' | 'share', name: string, title: string, text: string) => {
    const t = el('button', 'h13-tile', el('span', 'h13-tile-icon', svg(name)), el('span', 'h13-tile-text', el('strong', '', title), el('small', '', text)), el('span', 'h13-tile-go', svg('chevronRight')));
    t.type = 'button';
    t.dataset.drop = kind;
    t.setAttribute('aria-label', title + ' · dosya bırak veya seç');
    return t;
  };
  const convertTile = tile('convert', 'refresh', 'Dönüştür', 'Görsel, belge ve arşivleri başka formata çevir');
  const shareTile = tile('share', 'send', 'Gönder', 'Yakındaki cihaza Quick Share ile gönder');
  const tiles = el('div', 'h13-tiles', convertTile, shareTile);
  tiles.dataset.kind = 'files';
  const filesBack = button('h13-back', 'Geri', svg('chevronLeft'));
  const seg = el('div', 'h13-seg');
  seg.setAttribute('role', 'tablist');
  const segBtn = (sub: 'convert' | 'share', text: string) => {
    const b = el('button', 'h13-seg-btn', text);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.onclick = () => openFiles(sub);
    return b;
  };
  const segConvert = segBtn('convert', 'Dönüştür');
  const segShare = segBtn('share', 'Gönder');
  seg.append(segConvert, segShare);
  const filesTools = el('span', 'h13-files-tools');
  const filesHead = el('div', 'h13-files-head', filesBack, seg, filesTools);
  const filesBody = el('div', 'h13-files-body');
  const filesView = el('div', 'h13-files', filesHead, filesBody);
  filesView.dataset.kind = 'files';
  let filesSub: 'home' | 'convert' | 'share' = 'home';
  let subClose: (() => void) | null = null;
  filesBack.onclick = () => openFiles('home');
  function openFiles(sub: 'home' | 'convert' | 'share', onSubClose?: () => void) {
    const leaving = subClose;
    subClose = null;
    if (filesSub !== sub || openKind !== 'files') leaving?.();
    else subClose = leaving;
    filesSub = sub;
    if (onSubClose) subClose = onSubClose;
    if (sub === 'home') {
      openPanel('files', tiles, () => {
        subClose?.();
        subClose = null;
      });
      return;
    }
    segConvert.classList.toggle('on', sub === 'convert');
    segShare.classList.toggle('on', sub === 'share');
    segConvert.setAttribute('aria-selected', String(sub === 'convert'));
    segShare.setAttribute('aria-selected', String(sub === 'share'));
    filesTools.replaceChildren(...(sub === 'share' ? [share.receive] : []));
    filesBody.replaceChildren(sub === 'convert' ? converter.root : share.root);
    filesView.dataset.sub = sub;
    if (openKind !== 'files' || panelBody.firstElementChild !== filesView)
      openPanel('files', filesView, () => {
        subClose?.();
        subClose = null;
      });
    else sendHeight();
  }
  const showFiles = () => {
    if (view !== 'shelf') void api.islandView('shelf').catch(() => {});
  };
  const converter = converterSheet({
    api,
    notice,
    attempt,
    show: () => {
      showFiles();
      openFiles('convert');
    },
    hide: () => closePanel(),
    card: filesAcc.b,
  });
  const share = shareSheet({
    api,
    notice,
    attempt,
    show: (_content: HTMLElement, onClose?: () => void) => {
      showFiles();
      openFiles('share', onClose);
    },
    hide: () => closePanel(),
    card: filesAcc.b,
  });
  convertTile.onclick = () => openFiles('convert');
  shareTile.onclick = () => share.open();
  segShare.onclick = () => share.open();
  // a file dragged over the Dosyalar card opens the two tiles (dropped elsewhere it goes to the chat)
  filesAcc.b.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    if (openKind === 'files' && filesSub === 'home') return;
    openFiles('home');
  });
  filesAcc.b.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  // v0.9.2: one drag tracker for every drop target (the "over" frame never stays behind)
  const clearDropTargets = bindFileDropTargets();
  // a drop on the converter never leaves the dashed frame behind
  api.onConvertDrop?.(() => {
    clearDropTargets();
    document.dispatchEvent(new Event('dragend'));
    document.body.classList.remove('dropping');
  });
  api.onShareDrop?.(() => {
    clearDropTargets();
    document.dispatchEvent(new Event('dragend'));
    document.body.classList.remove('dropping');
  });

  // ── AI kullanımı: every connected AI ───────────────────────────────────────
  const usage = usageAll(api, (text, low) => {
    usageAcc.sub.textContent = text;
    usageAcc.b.classList.toggle('low', low);
  });
  function openUsage() {
    openPanel('usage', usage.root);
    void usage.load(false);
  }
  window.setTimeout(() => void usage.load(false), 4000);
  window.setInterval(() => {
    if (view === 'shelf' && !document.hidden) void usage.load(false);
  }, 10 * 60000);

  // ── Hava durumu: now, the next hours and five days ─────────────────────────
  // "Ankara · 16° · Parçalı bulutlu 🌤️" from the companion state (the same text as the old line)
  function paintWeather(value: any) {
    const full = String(value?.weather?.text || '');
    const city = value?.preferences?.city?.name;
    const parts = full.split(' · ');
    const emojiEl = weatherAcc.icon.firstElementChild as HTMLElement;
    if (parts.length >= 3) {
      const emoji = parts[2].match(/\p{Extended_Pictographic}[️]?/u)?.[0] || '🌤️';
      emojiEl.textContent = emoji;
      weatherAcc.sub.textContent = `${parts[1]} · ${parts[0]} · ${parts[2].replace(/\p{Extended_Pictographic}[️]?/gu, '').trim()}`;
      notchWeather.textContent = `${emoji} ${parts[1]}`;
    } else {
      emojiEl.textContent = city ? '🌤️' : '📍';
      weatherAcc.sub.textContent = city ? `${String(city).split(',')[0]} · Yükleniyor…` : 'Şehrini seç';
      notchWeather.textContent = '';
    }
  }
  api.onCompanion?.(paintWeather);
  void Promise.resolve(api.companionRead?.()).then(paintWeather).catch(() => paintWeather(null));

  const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const pickCity = () => {
    closePanel();
    document.getElementById('weather-idle')?.click();
  };
  const weatherView = el('div', 'weather-sheet h13-weather');
  weatherView.dataset.kind = 'weather';
  function openWeather() {
    const wrap = weatherView;
    const change = button('weather-change', 'Şehri değiştir', svg('location'));
    change.title = 'Şehri değiştir';
    change.onclick = pickCity;
    if (!wrap.childElementCount) wrap.append(el('p', 'weather-note', 'Tahmin yükleniyor…'));
    openPanel('weather', wrap);
    void Promise.resolve(api.weatherForecast?.())
      .then((f: any) => {
        if (!f?.city) {
          const choose = button('weather-choose', 'Şehrini seç', svg('location'), el('span', '', 'Şehrini seç'));
          choose.onclick = pickCity;
          wrap.replaceChildren(el('p', 'weather-note', 'Hava durumunu görmek için şehrini seç.'), choose);
          sendHeight();
          return;
        }
        const c = f.current || {};
        const deg = (v: any) => (Number.isFinite(v) ? v + '°' : '—');
        const city = el('strong', 'weather-city', f.city);
        city.translate = false;
        const details = el('div', 'weather-details');
        if (Number.isFinite(c.feels)) details.append(el('span', '', el('small', '', 'Hissedilen'), el('b', '', deg(c.feels))));
        if (Number.isFinite(c.humidity)) details.append(el('span', '', el('small', '', 'Nem'), el('b', '', '%' + c.humidity)));
        if (Number.isFinite(c.wind)) details.append(el('span', '', el('small', '', 'Rüzgâr'), el('b', '', c.wind + ' km/sa')));
        const now = el(
          'div',
          'weather-now',
          el('span', 'weather-now-emoji', c.emoji || '🌤️'),
          el('span', 'weather-now-temp', deg(c.temp)),
          el('span', 'weather-now-text', city, el('small', '', c.text || '')),
          details,
        );
        // the next hours of today
        const hours = el('div', 'weather-hours');
        (Array.isArray(f.hours) ? f.hours : []).slice(0, 7).forEach((h: any, i: number) => {
          // "Şimdi" is the current reading (the same numbers as the box beside it)
          const temp = i === 0 && Number.isFinite(c.temp) ? c.temp : h.temp;
          const cell = el(
            'div',
            'weather-hour' + (i === 0 ? ' now' : ''),
            el('small', 'weather-hour-time', i === 0 ? 'Şimdi' : String(h.time || '')),
            el('span', 'weather-hour-emoji', (i === 0 && c.emoji) || h.emoji || '🌤️'),
            el('b', 'weather-hour-temp', deg(temp)),
          );
          cell.setAttribute('aria-label', `${i === 0 ? 'Şimdi' : h.time}: ${h.text || ''}, ${deg(h.temp)}`);
          hours.append(cell);
        });
        // the city button sits at the top right, next to the hourly title
        const hourly = el('div', 'weather-block weather-block-hours', el('div', 'h13-sec-head', el('small', 'h13-sec-title', 'BUGÜN · SAATLİK'), change), hours);
        if (!hours.childElementCount) hours.hidden = true;
        const days = el('div', 'weather-days');
        (f.days || []).slice(0, 5).forEach((d: any, i: number) => {
          const date = new Date(String(d.date) + 'T12:00:00');
          const name = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : DAYS[date.getDay()] || '';
          const day = el(
            'div',
            'weather-day' + (i === 0 ? ' today' : ''),
            el('small', 'weather-day-name', name),
            el(
              'span',
              'weather-day-sky',
              el('span', 'weather-day-emoji', d.emoji || '🌤️'),
              el('small', 'weather-day-rain' + (Number(d.rain) >= 40 ? ' wet' : ''), Number.isFinite(d.rain) && d.rain > 0 ? '%' + d.rain : ''),
            ),
            el('span', 'weather-day-temps', el('b', '', deg(d.max)), el('small', '', deg(d.min))),
          );
          day.setAttribute('aria-label', `${name}: ${d.text || ''}, ${deg(d.max)} / ${deg(d.min)}`);
          days.append(day);
        });
        const daily = el('div', 'weather-block weather-block-days', el('div', 'h13-sec-head', el('small', 'h13-sec-title', '5 GÜNLÜK')), days);
        wrap.replaceChildren(el('div', 'weather-top', now, hourly), daily);
        sendHeight();
      })
      .catch(() => {
        const retry = button('weather-choose', 'Şehri değiştir', svg('location'), el('span', '', 'Şehri değiştir'));
        retry.onclick = pickCity;
        wrap.replaceChildren(el('p', 'weather-note', 'Hava durumuna şu anda ulaşılamıyor.'), retry);
        sendHeight();
      });
  }

  // v0.8.15: a click on an empty part of the shelf (or of its top bar) opens the chat (the cream
  // bar below closes the island); in the chat it goes back to the shelf (the cream bar closes)
  const empty = (t: HTMLElement) => !t.closest('button, a, input, select, textarea, form, .card, .h13-music, .h13-accs, .h13-panel, .shelf-sheet, #pet, [role="button"]');
  shelf.addEventListener('click', (e) => {
    if (view === 'shelf' && !onPath(e, 'button, a, input, select, textarea, form, label, .card, .h13-music, .h13-accs, .h13-panel, .shelf-sheet, #pet, [role="button"], dialog'))
      void attempt(() => api.islandView('chat'));
  });
  header.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      // v0.8.14: in the chat, a click on an empty part of the Charles panel goes back to the shelf
      if (view === 'chat' && e.button === 0 && empty(t) && !t.closest('.character-center')) {
        e.stopImmediatePropagation();
        void attempt(() => api.islandView('shelf'));
        return;
      }
      if (view !== 'shelf' || e.button !== 0 || !empty(t)) return;
      // on the shelf an empty part of the top bar opens the chat
      e.stopImmediatePropagation();
      void attempt(() => api.islandView('chat'));
    },
    true,
  );
  // ── views ──────────────────────────────────────────────────────────────────
  function placePet() {
    // v0.9.1: the app window (Çalışma alanı) puts Slime in its own Charles card: he stays there
    // (moving him back to the shelf left that card empty)
    if (body.classList.contains('workspace')) return;
    const target = body.classList.contains('desktop-pet') || view === 'chat' ? center : view === 'shelf' ? charlesSlot : notchPet;
    if (pet.parentElement !== target) target.prepend(pet);
  }
  function setView(next: View) {
    if (!['notch', 'shelf', 'chat'].includes(next)) return;
    view = next;
    body.dataset.view = next;
    // v0.8.12: no bar button stays pressed/highlighted across a view change
    const active = document.activeElement as HTMLElement | null;
    if (active && active.closest('#island-bar')) active.blur();
    const grip = document.getElementById('resize-handle');
    grip?.setAttribute('aria-label', next === 'chat' ? 'Panel yüksekliği · sürükle' : next === 'shelf' ? 'Adayı küçült' : 'Sohbeti aç');
    grip?.setAttribute('role', next === 'chat' ? 'separator' : 'button');
    // v0.8.11: a sheet (usage, a finished conversion) does not stay open once the island closes
    if (next !== 'shelf' && openKind && (openKind !== 'files' || (!converter.running() && !share.busy())))
      closeSheet();
    placePet();
    if (next === 'shelf') {
      sentHeight = 0;
      sendHeight();
    }
  }
  api.onView?.(setView);
  new MutationObserver(placePet).observe(body, { attributes: true, attributeFilter: ['class'] });
  void Promise.resolve(api.islandViewRead?.())
    .then((v: View) => setView(v || view))
    .catch(() => setView(view));
  // notch status and music
  const status = document.getElementById('status');
  const paintStatus = () => (notchStatus.textContent = status?.textContent || '');
  if (status) new MutationObserver(paintStatus).observe(status, { childList: true, characterData: true, subtree: true });
  paintStatus();
  let notchState: string | null = null;
  document.addEventListener('charles-media-state', (e: any) => {
    const r = e.detail || {};
    const playing = !!r.ok && r.state === 'Playing';
    // v0.8.11: the notch shows the music controls while something plays or is paused
    // v0.8.13: main hears the state itself — nothing playing means the hidden strip
    const state = r.ok && (r.state === 'Playing' || r.state === 'Paused') ? r.state : '';
    if (state !== notchState) {
      notchState = state;
      void Promise.resolve(api.notchMusic?.(state)).catch(() => {});
    }
    body.classList.toggle('music-on', !!r.ok && (r.state === 'Playing' || r.state === 'Paused'));
    body.classList.toggle('music-playing', playing);
    notchPlay.replaceChildren(svg(playing ? 'pause' : 'play'));
    notchPlay.setAttribute('aria-label', playing ? 'Duraklat' : 'Oynat');
    notchPlay.onclick = (ev) => {
      ev.stopPropagation();
      document.getElementById(playing ? 'music-pause' : 'music-play')?.click();
    };
    music.paint(r);
  });
  // v0.8.12: the notch's progress line follows the song directly (no slow fill after a seek)
  const paintBar = () => {
    notchBar.style.width = (music.fraction() * 100).toFixed(2) + '%';
  };
  window.setInterval(paintBar, 250);
  document.addEventListener('charles-media-state', paintBar);

  setView(view);
  // v0.8.12: when the mouse leaves the island the page may never hear of it (the window lets the
  // mouse through), so a button could keep its hover/pressed look; the cursor position from
  // the main process tells the page the mouse is outside.
  api.onCursor?.((p: { x: number; y: number }) => {
    const r = body.getBoundingClientRect();
    const out = p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom;
    body.classList.toggle('pointer-out', out);
  });
}

/** The music card: what is playing with its controls, or a button that starts playing. */
function musicCard(attempt: Deps['attempt'], api: any) {
  const art = el('span', 'music-art');
  const artImg = el('img') as HTMLImageElement;
  artImg.alt = '';
  art.append(svg('music'), artImg);
  const label = el('small', 'music-label', svg('music'), el('span', '', 'Spotify · Hazır'));
  const title = el('strong', 'music-title', 'Müzik');
  const artist = el('small', 'music-artist', '');
  const click = (id: string) => () => document.getElementById(id)?.click();
  const b = (name: string, labelText: string, id: string, cls = '') => {
    const x = button('music-btn ' + cls, labelText, svg(name));
    x.onclick = click(id);
    return x;
  };
  const shuffle = b('shuffle', 'Karıştır', 'music-shuffle', 'music-toggle');
  const repeat = b('repeat', 'Tekrar', 'music-repeat', 'music-toggle');
  const play = button('music-btn music-play', 'Oynat', svg('play'));
  const controls = el('div', 'music-controls', shuffle, b('prev', 'Önceki parça', 'music-previous'), play, b('next', 'Sonraki parça', 'music-next'), repeat);
  const now = el('small', 'music-time', '0:00');
  const end = el('small', 'music-time', '0:00');
  const range = el('input', 'music-range') as HTMLInputElement;
  range.type = 'range';
  range.min = '0';
  range.max = '0';
  range.step = '1';
  range.setAttribute('aria-label', 'Parçada konum');
  const progress = el('div', 'music-progress', now, range, end);
  const start = button('music-start', 'Çalmaya başla', svg('play'), el('span', '', 'Çalmaya başla'));
  start.onclick = click('music-play');
  const idleHint = el('small', 'music-hint', 'Spotify’ı açar ve son çalınanı başlatır');
  const meta = el('div', 'music-meta', label, title, artist, controls, progress, start, idleHint);
  const card = el('div', 'h13-music', art, meta);
  // v0.8.14: a click on the card (not on its buttons or the seek bar) opens Spotify
  card.addEventListener('click', (e) => {
    if (onPath(e, 'button, input')) return;
    void attempt(() => api.spotifyOpen());
  });

  let last: any = null,
    at = 0,
    seeking = false;
  let lastTitle = '';
  try {
    lastTitle = localStorage.getItem('charles-last-track') || '';
  } catch {}
  const time = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0') : '0:00');
  const position = () => (last?.duration > 0 ? Math.min(last.duration, (last.position || 0) + (last.state === 'Playing' ? (Date.now() - at) / 1000 : 0)) : 0);
  range.oninput = () => {
    seeking = true;
    range.style.setProperty('--fill', (+range.max > 0 ? (+range.value / +range.max) * 100 : 0).toFixed(2) + '%');
    now.textContent = time(+range.value);
  };
  range.onchange = () => {
    seeking = false;
    // v0.8.12: show the new position at once
    if (last) {
      last = { ...last, position: +range.value };
      at = Date.now();
    }
    const old = document.getElementById('music-progress') as HTMLInputElement | null;
    if (old) {
      old.value = range.value;
      old.dispatchEvent(new Event('change'));
    }
  };
  function tick() {
    if (!last?.ok || seeking) return;
    const p = position();
    range.value = String(p);
    range.style.setProperty('--fill', (last.duration > 0 ? (p / last.duration) * 100 : 0).toFixed(2) + '%');
    now.textContent = time(p);
  }
  window.setInterval(tick, 500);
  function paint(r: any) {
    last = r;
    at = Date.now();
    const active = !!r.ok && (r.state === 'Playing' || r.state === 'Paused');
    const playing = !!r.ok && r.state === 'Playing';
    card.classList.toggle('idle', !active);
    // v0.8.15: no length known (Spotify read from its window): no progress bar stuck at 0:00
    card.classList.toggle('no-time', active && !(r.duration > 0));
    document.body.classList.toggle('music-no-time', active && !(r.duration > 0));
    if (active && r.title) {
      lastTitle = r.title + (r.artist ? ' · ' + r.artist : '');
      try {
        localStorage.setItem('charles-last-track', lastTitle);
      } catch {}
    }
    label.lastElementChild!.textContent = 'Spotify · ' + (active ? (playing ? 'Şimdi çalıyor' : 'Duraklatıldı') : 'Hazır');
    title.textContent = active ? r.title || 'Spotify' : 'Şu an bir şey çalmıyor';
    artist.textContent = active ? r.artist || '' : lastTitle ? 'Son çalınan: ' + lastTitle : 'Spotify';
    const ok = /^data:image\/(png|jpeg|webp);base64,/.test(r.art || '');
    art.classList.toggle('has-art', active && ok);
    if (active && ok) artImg.src = r.art;
    else artImg.removeAttribute('src');
    play.replaceChildren(svg(playing ? 'pause' : 'play'));
    play.setAttribute('aria-label', playing ? 'Duraklat' : 'Oynat');
    play.onclick = click(playing ? 'music-pause' : 'music-play');
    shuffle.setAttribute('aria-pressed', String(r.shuffle === true));
    repeat.setAttribute('aria-pressed', String(r.repeat === 'List' || r.repeat === 'Track'));
    repeat.classList.toggle('one', r.repeat === 'Track');
    shuffle.disabled = !r.ok || !r.capabilities?.shuffle;
    repeat.disabled = !r.ok || !r.capabilities?.repeat;
    range.disabled = !r.ok || !r.capabilities?.seek || !(r.duration > 0);
    range.max = String(r.duration || 0);
    end.textContent = time(r.duration);
    tick();
  }
  /** Shows an app icon (the installed Spotify's) in place of the music notes. */
  function brand(src: string) {
    card.classList.add('branded');
    const small = el('img', 'music-brand') as HTMLImageElement;
    small.src = src;
    small.alt = '';
    label.firstElementChild?.replaceWith(small);
    const big = el('img', 'music-brand-big') as HTMLImageElement;
    big.src = src;
    big.alt = '';
    art.firstElementChild?.replaceWith(big);
  }
  // v0.9.13: until the first media state arrives the card shows the idle "Çalmaya başla"
  paint({ ok: false });
  return {
    card,
    paint,
    brand,
    fraction: () => (last?.duration > 0 ? position() / last.duration : 0),
  };
}
