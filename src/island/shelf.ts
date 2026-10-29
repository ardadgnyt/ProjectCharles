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
  const shelf = el('section', 'shelf');
  shelf.id = 'shelf';
  shelf.setAttribute('aria-label', 'Kartlar');
  const viewport = el('div', 'shelf-viewport');
  const track = el('div', 'shelf-track');
  viewport.append(track);
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
  shelf.append(pagePrev, viewport, pageNext);
  header.after(shelf);

  const page1 = el('div', 'shelf-page');
  track.append(page1);

  // AI usage (the quota gauges move into its sheet)
  const usageName = el('small', 'card-sub');
  const usageCard = button(
    'card card-usage',
    'AI kullanımı',
    el('span', 'card-icon', svg('chart')),
    el('span', 'card-text', el('strong', '', 'AI kullanımı'), usageName),
    el('span', 'card-go', svg('chevronRight')),
  );
  const usagePanel = document.getElementById('usage-weather');
  function paintUsage() {
    if (!usagePanel) return;
    const name = usagePanel.querySelector('.usage-name')?.textContent || 'AI';
    const parts = [...usagePanel.querySelectorAll<HTMLElement>('.usage-gauge')]
      .filter((g) => !g.hidden)
      .map((g) => `${g.querySelector('.usage-label')?.textContent || ''} ${g.querySelector('strong')?.textContent || '—'}`);
    const credit = (usagePanel.querySelector('#usage-credits') as HTMLElement | null)?.textContent?.trim();
    usageName.textContent = credit && usagePanel.querySelector<HTMLElement>('.usage-gauges')?.hidden ? `${name} · ${credit}` : [name, ...parts].join(' · ');
    usageCard.style.setProperty('--provider', usagePanel.style.getPropertyValue('--provider') || 'var(--accent)');
    const low = usagePanel.querySelector('.usage-gauge.low, .usage-gauge.empty');
    usageCard.classList.toggle('low', !!low);
  }
  if (usagePanel) {
    new MutationObserver(paintUsage).observe(usagePanel, { subtree: true, childList: true, characterData: true, attributes: true });
    paintUsage();
  }

  // weather
  const weatherIcon = el('span', 'card-icon weather-icon', '☁️');
  const weatherTitle = el('strong', '', 'Hava durumu');
  const weatherSub = el('small', 'card-sub', 'Konum seç');
  const weatherCard = button('card card-weather', 'Hava durumu', weatherIcon, el('span', 'card-text', weatherTitle, weatherSub));
  // v0.8.14: the card opens the next five days (city choice is inside that sheet)
  weatherCard.onclick = () => openWeather();
  // "Ankara · 16° · Parçalı bulutlu 🌤️" from the companion state (the same text as the old line)
  function paintWeather(value: any) {
    const full = String(value?.weather?.text || '');
    const city = value?.preferences?.city?.name;
    const parts = full.split(' · ');
    if (parts.length >= 3) {
      const emoji = parts[2].match(/\p{Extended_Pictographic}[️]?/u)?.[0] || '🌤️';
      weatherIcon.textContent = emoji;
      weatherTitle.textContent = `${parts[1]} · ${parts[0]}`;
      weatherSub.textContent = parts[2].replace(/\p{Extended_Pictographic}[️]?/gu, '').trim();
      notchWeather.textContent = `${emoji} ${parts[1]}`;
    } else {
      weatherIcon.textContent = city ? '🌤️' : '📍';
      weatherTitle.textContent = city || 'Hava durumu';
      weatherSub.textContent = city ? 'Yükleniyor…' : 'Şehrini seç';
      notchWeather.textContent = '';
    }
  }
  api.onCompanion?.(paintWeather);
  void Promise.resolve(api.companionRead?.()).then(paintWeather).catch(() => paintWeather(null));

  // converter
  const convertCard = el('div', 'card card-convert');
  convertCard.dataset.drop = 'convert';
  convertCard.tabIndex = 0;
  convertCard.setAttribute('role', 'button');
  convertCard.setAttribute('aria-label', 'Dönüştürücü · dosya bırak veya seç');
  // v0.9.3: icon-only cards; the half-size converter shares its column with Gönder (v0.9.2)
  convertCard.append(el('span', 'convert-icon', svg('refresh')));
  const sendCard = el('div', 'card card-send');
  sendCard.dataset.drop = 'share';
  sendCard.tabIndex = 0;
  sendCard.setAttribute('role', 'button');
  sendCard.setAttribute('aria-label', 'Dosya gönder · dosya bırak veya seç');
  sendCard.append(el('span', 'send-icon', svg('send')));
  // v0.9.2: one drag tracker for both drop cards (the "over" frame never stays behind)
  const clearDropTargets = bindFileDropTargets();

  // Charles
  const charlesSlot = el('span', 'charles-pet');
  const charlesName = button('charles-name', 'Sohbeti aç', el('strong', '', 'Charles'), el('small', '', version));
  charlesName.onclick = () => void attempt(() => api.islandView('chat'));
  const charlesCard = el('div', 'card-charles', charlesSlot, charlesName);
  charlesCard.addEventListener('click', (e) => {
    if (e.target === charlesCard) void attempt(() => api.islandView('chat'));
  });

  // music
  const music = musicCard(attempt, api);
  // v0.8.11: the installed Spotify app's own icon instead of the music note (if Windows has one)
  void Promise.resolve(api.spotifyIcon?.())
    .then((src: string | null) => {
      if (typeof src === 'string' && /^data:image\/png;base64,/.test(src)) music.brand(src);
    })
    .catch(() => {});
  const midCol = el('div', 'shelf-col shelf-col-mid', convertCard, sendCard);
  page1.append(el('div', 'shelf-left', el('div', 'shelf-col', usageCard, weatherCard), midCol), charlesCard, music.card);

  // v0.8.15: a click on an empty part of the shelf (or of its top bar) opens the chat (the cream
  // bar below closes the island); in the chat it goes back to the shelf (the cream bar closes)
  const empty = (t: HTMLElement) => !t.closest('button, a, input, select, textarea, .card, .shelf-sheet, #pet, [role="button"]');
  shelf.addEventListener('click', (e) => {
    if (view === 'shelf' && !onPath(e, 'button, a, input, select, textarea, .card, .shelf-sheet, #pet, [role="button"], dialog'))
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

  // sheets: the converter and the usage gauges open over the cards
  const sheet = el('div', 'shelf-sheet');
  sheet.hidden = true;
  const sheetTitle = el('strong', 'sheet-title');
  const sheetBack = button('sheet-back', 'Kartlara dön', svg('chevronLeft'));
  const sheetBody = el('div', 'sheet-body');
  sheet.append(el('div', 'sheet-head', sheetBack, sheetTitle), sheetBody);
  shelf.append(sheet);
  let closeSheet: (() => void) | null = null;
  function openSheet(title: string, content: HTMLElement, onClose?: () => void) {
    closeSheet?.();
    sheetTitle.textContent = title;
    sheetBody.replaceChildren(content);
    sheet.hidden = false;
    shelf.classList.add('sheet-open');
    sheet.dataset.kind = content.dataset.kind || '';
    shelf.dataset.sheet = sheet.dataset.kind;
    // v0.9.2: an open sheet keeps the shelf from folding away under the pointer
    void Promise.resolve(api.shelfHold?.(true)).catch(() => {});
    closeSheet = () => {
      sheet.hidden = true;
      shelf.classList.remove('sheet-open');
      delete shelf.dataset.sheet;
      closeSheet = null;
      void Promise.resolve(api.shelfHold?.(false)).catch(() => {});
      onClose?.();
    };
  }
  sheetBack.onclick = () => closeSheet?.();
  usageCard.onclick = () => {
    if (!usagePanel) return;
    const wrap = el('div', 'usage-sheet');
    wrap.dataset.kind = 'usage';
    wrap.append(usagePanel);
    openSheet('AI kullanımı', wrap);
  };

  // v0.8.14: weather — a sheet the size of the AI usage one with the next five days
  const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const pickCity = () => {
    closeSheet?.();
    document.getElementById('weather-idle')?.click();
  };
  function openWeather() {
    const wrap = el('div', 'weather-sheet');
    wrap.dataset.kind = 'weather';
    const change = button('weather-change', 'Şehri değiştir', svg('pencil'));
    change.onclick = pickCity;
    wrap.append(el('p', 'weather-note', 'Tahmin yükleniyor…'));
    openSheet('Hava durumu', wrap);
    void Promise.resolve(api.weatherForecast?.())
      .then((f: any) => {
        if (!f?.city) {
          const choose = button('weather-choose', 'Şehrini seç', svg('pencil'), el('span', '', 'Şehrini seç'));
          choose.onclick = pickCity;
          wrap.replaceChildren(el('p', 'weather-note', 'Hava durumunu görmek için şehrini seç.'), choose);
          return;
        }
        const c = f.current || {};
        const deg = (v: any) => (Number.isFinite(v) ? v + '°' : '—');
        const city = el('strong', 'weather-city', f.city);
        city.translate = false;
        const now = el(
          'div',
          'weather-now',
          el('span', 'weather-now-emoji', c.emoji || '🌤️'),
          el('span', 'weather-now-temp', deg(c.temp)),
          el('span', 'weather-now-text', city, el('small', '', c.text || '')),
          change,
        );
        const details = el('div', 'weather-details');
        if (Number.isFinite(c.feels)) details.append(el('span', '', el('small', '', 'Hissedilen'), el('b', '', deg(c.feels))));
        if (Number.isFinite(c.humidity)) details.append(el('span', '', el('small', '', 'Nem'), el('b', '', '%' + c.humidity)));
        if (Number.isFinite(c.wind)) details.append(el('span', '', el('small', '', 'Rüzgâr'), el('b', '', c.wind + ' km/sa')));
        const days = el('div', 'weather-days');
        (f.days || []).slice(0, 5).forEach((d: any, i: number) => {
          const date = new Date(String(d.date) + 'T12:00:00');
          const name = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : DAYS[date.getDay()] || '';
          const day = el(
            'div',
            'weather-day' + (i === 0 ? ' today' : ''),
            el('small', 'weather-day-name', name),
            // v0.8.15: the rain chance next to the sky (smaller cards, room below them)
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
        wrap.replaceChildren(now, details, days);
      })
      .catch(() => {
        const retry = button('weather-choose', 'Şehri değiştir', svg('pencil'), el('span', '', 'Şehri değiştir'));
        retry.onclick = pickCity;
        wrap.replaceChildren(el('p', 'weather-note', 'Hava durumuna şu anda ulaşılamıyor.'), retry);
      });
  }

  const converter = converterSheet({
    api,
    notice,
    attempt,
    show: (content) => {
      if (view === 'notch') void api.islandView('shelf').catch(() => {});
      openSheet('Dönüştürücü', content);
    },
    hide: () => closeSheet?.(),
    card: convertCard,
  });
  convertCard.onclick = () => converter.choose();
  convertCard.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      converter.choose();
    }
  };
  // v0.9.2: Gönder — Quick Share / LocalSend sheet (src/island/share.ts)
  const share = shareSheet({
    api,
    notice,
    attempt,
    show: (content, onClose) => {
      if (view !== 'shelf') void api.islandView('shelf').catch(() => {});
      openSheet('Dosya paylaşımı', content, onClose);
    },
    hide: () => closeSheet?.(),
    card: sendCard,
  });
  sendCard.onclick = () => share.open();
  sendCard.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      share.open();
    }
  };

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
    if (next !== 'shelf' && closeSheet && (sheet.dataset.kind === 'usage' || (!converter.running() && !share.busy())))
      closeSheet();
    placePet();
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
  const label = el('small', 'music-label', svg('music'), el('span', '', 'Şimdi çalıyor'));
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
  const card = el('div', 'card card-music', art, meta);
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
    label.lastElementChild!.textContent = active ? (playing ? 'Şimdi çalıyor' : 'Duraklatıldı') : 'Müzik';
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
  return {
    card,
    paint,
    brand,
    fraction: () => (last?.duration > 0 ? position() / last.duration : 0),
  };
}
