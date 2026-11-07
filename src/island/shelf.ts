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
import { systemMonitor } from './system-monitor';
import { converterSheet } from './converter';
import { bindFileDropTargets } from './drop-target';
import { fileRack } from './file-rack';
import { shareSheet } from './share';
import { usageAll } from './usage-all';
import { modeSegment } from './mode-seg';
import { weatherView } from './weather-view';
import { colorPicker } from './color-picker';
import { timerTool, type TimerInfo } from './timer';
import { hub } from './tools-hub';
import { weeklySummaryUI } from '../settings/weekly-summary';

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
        // v0.9.21: the app window has no shelf, and `view` keeps what the island last showed. Entered
        // from the shelf, every click here waited for a chat view that never came, so Ayarlar did
        // nothing there; entered from the chat it worked.
        if (view !== 'shelf' || body.classList.contains('workspace')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        void attempt(async () => {
          await api.islandView('chat');
          // v0.9.16: only once the chat is really there (else this click comes back here forever)
          // v0.9.21: a tall panel or a busy moment may take longer than one wait
          const once = (tries: number) =>
            window.setTimeout(() => {
              if (view === 'chat') b.click();
              else if (tries > 1) once(tries - 1);
            }, 260);
          if (open) once(5);
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
  // v0.9.14: with music the notch shows the song (a small cover, the title, the artist)
  const notchArt = el('img', 'notch-track-art') as HTMLImageElement;
  notchArt.alt = '';
  const notchArtBox = el('span', 'notch-track-cover', svg('music'), notchArt);
  const notchTitle = el('strong', 'notch-track-title');
  const notchArtist = el('small', 'notch-track-artist');
  notchTitle.translate = false;
  notchArtist.translate = false;
  const notchTrack = el('span', 'notch-track', notchArtBox, el('span', 'notch-track-text', notchTitle, notchArtist));
  notch.append(notchPet, notchName, notchTrack, notchWeather, notchMusic, notchProgress);
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
  const askMic = button('h13-ask-btn', 'Konuş', svg('mic'));
  askMic.title = 'Konuş';
  // v0.9.14: dictation right into this box (the chat does not open)
  askMic.onclick = () => {
    const recording = document.body.dataset.voicePhase === 'recording';
    if (!recording) document.dispatchEvent(new CustomEvent('charles-dictate-into', { detail: askInput }));
    document.getElementById('voice-mic')?.click();
  };
  new MutationObserver(() => {
    const p = document.body.dataset.voicePhase || 'idle';
    askMic.classList.toggle('recording', p === 'recording');
    askMic.classList.toggle('busy', p === 'transcribing' || p === 'starting');
    askMic.setAttribute('aria-label', p === 'recording' ? 'Dikteyi bitir' : 'Konuş');
  }).observe(body, { attributes: true, attributeFilter: ['data-voice-phase'] });
  // v0.9.14: the voice call has its own card above the message box. It starts here, on the home
  // page, without opening the chat; while it runs the card is green, says who is talking, how
  // long the call has been going, and its bars move with the sound.
  const voiceIcon = el('span', 'h13-voice-icon', svg('mic'));
  const voiceTitle = el('strong', 'h13-voice-title', 'Sesli sohbet');
  const voiceSub = el('small', 'h13-voice-sub', 'Dokun ve konuş');
  const voiceBars = el('span', 'h13-voice-bars');
  const BAR_SHAPE = [0.4, 0.55, 0.7, 0.55, 0.85, 1, 0.85, 0.55, 0.7, 0.55, 0.4];
  for (let i = 0; i < BAR_SHAPE.length; i++) voiceBars.append(el('i'));
  const bars = [...voiceBars.children] as HTMLElement[];
  const voiceEnd = button('h13-voice-end', 'Sesli sohbeti bitir', svg('x'));
  voiceEnd.title = 'Sesli sohbeti bitir';
  const voiceBtn = el('div', 'h13-voice', voiceIcon, el('span', 'h13-voice-text', voiceTitle, voiceSub), voiceBars, voiceEnd);
  voiceBtn.tabIndex = 0;
  voiceBtn.setAttribute('role', 'button');
  voiceBtn.setAttribute('aria-label', 'Sesli sohbet');
  const pressCall = () => {
    const call = document.getElementById('voice-call') as HTMLButtonElement | null;
    if (call) call.click();
    else notice('Sesli sohbet için Ayarlar → AI Modelleri bölümünden Gemini Live’ı etkinleştir.');
  };
  const liveOn = () => document.body.dataset.liveVoice === 'active';
  // v0.9.14: with the microphone switched off (header), the voice card does nothing
  const micMuted = () => document.body.dataset.micOff === 'true';
  voiceBtn.onclick = (e) => {
    if ((e.target as HTMLElement).closest('.h13-voice-end')) return;
    if (!liveOn() && !micMuted()) pressCall();
  };
  voiceBtn.onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !liveOn() && !micMuted()) {
      e.preventDefault();
      pressCall();
    }
  };
  voiceEnd.onclick = (e) => {
    e.stopPropagation();
    if (liveOn()) pressCall();
  };
  let callStart = 0;
  let charlesTalking = false;
  const callClock = () => {
    const s = Math.max(0, Math.floor((Date.now() - callStart) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const paintVoice = () => {
    const on = liveOn();
    voiceBtn.classList.toggle('on', on);
    voiceBtn.classList.toggle('charles', on && charlesTalking);
    voiceBtn.setAttribute('aria-pressed', String(on));
    voiceTitle.textContent = !on ? 'Sesli sohbet' : charlesTalking ? 'Charles konuşuyor' : 'Dinliyor…';
    voiceSub.textContent = on ? `Sesli sohbet · ${callClock()}` : 'Dokun ve konuş';
  };
  document.addEventListener('charles-live-level', (e: any) => {
    const d = e.detail;
    const l = Math.max(0, Math.min(1, Number(typeof d === 'object' ? d?.level : d) || 0));
    const who = !!(typeof d === 'object' && d?.charles);
    bars.forEach((b, i) => (b.style.transform = l ? `scaleY(${Math.max(0.25, Math.min(1, 0.25 + l * BAR_SHAPE[i] * (0.8 + Math.random() * 0.4))).toFixed(3)})` : ''));
    voiceBtn.classList.toggle('speaking', l > 0.08);
    if (who !== charlesTalking) {
      charlesTalking = who;
      paintVoice();
    }
  });
  let voiceTimer = 0;
  // the island stays open (pinned) for the whole call, then goes back as it was
  let autoPinned = false;
  const pinFor = (on: boolean) => {
    const pin = document.getElementById('panel-pin');
    if (!pin) return;
    const pressed = pin.getAttribute('aria-pressed') === 'true';
    if (on && !pressed) {
      autoPinned = true;
      pin.click();
    } else if (!on && autoPinned) {
      autoPinned = false;
      if (pressed) pin.click();
    }
  };
  const syncVoice = () => {
    const on = liveOn();
    pinFor(on);
    if (on && !voiceTimer) {
      callStart = Date.now();
      voiceTimer = window.setInterval(paintVoice, 1000);
    } else if (!on && voiceTimer) {
      window.clearInterval(voiceTimer);
      voiceTimer = 0;
      charlesTalking = false;
      bars.forEach((b) => (b.style.transform = ''));
    }
    paintVoice();
  };
  new MutationObserver(syncVoice).observe(body, { attributes: true, attributeFilter: ['data-live-voice'] });
  syncVoice();
  const askSend = button('h13-ask-btn h13-ask-send', 'Gönder', svg('arrowUp'));
  askSend.type = 'submit';
  ask.append(askInput, askMic, askSend);
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
  // v0.9.14: the voice call and the message box on the left, Charles in the middle, music on the right
  const askCol = el('div', 'h13-askcol', voiceBtn, ask);
  // Charles in the middle: Slime, then his name and version
  const hero = el('div', 'h13-hero h13-center', charlesSlot, charlesName);
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
  inner.append(el('div', 'h13-top', askCol, hero, music.card));

  // the three cards
  type Kind = 'files' | 'usage' | 'weather' | 'tools';
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
  // no line under Dosyalar (an incoming file or a transfer still shows there)
  const filesAcc = acc('files', svg('folder'), 'Dosyalar', '');
  // v0.9.13: a file dragged onto Dosyalar opens its two drop tiles
  filesAcc.b.dataset.drop = 'files';
  const usageAcc = acc('usage', svg('chart'), 'AI kullanımı', 'Okunuyor…');
  const weatherAcc = acc('weather', el('span', 'h13-emoji', '☁️'), 'Hava durumu', 'Konum seç');
  // v0.9.14: Araçlar — the colour picker, the timer and shortcuts to the installed modules
  // no line under Araçlar, except a running / finished timer's state
  const toolsAcc = acc('tools', svg('wrench'), 'Araçlar', '');
  toolsAcc.b.classList.add('no-sub');
  const accs = el('div', 'h13-accs', filesAcc.b, usageAcc.b, weatherAcc.b, toolsAcc.b);
  const panel = el('div', 'h13-panel');
  panel.hidden = true;
  const panelBody = el('div', 'h13-panel-body');
  panel.append(panelBody);
  inner.append(accs, panel);
  const accByKind: Record<Kind, HTMLButtonElement> = { files: filesAcc.b, usage: usageAcc.b, weather: weatherAcc.b, tools: toolsAcc.b };

  // the page's height follows its content (main clamps it, app/core/layout.cjs)
  let sentHeight = 0;
  let heightFrame = 0;
  const sendHeight = () => {
    cancelAnimationFrame(heightFrame);
    heightFrame = requestAnimationFrame(() => {
      if (view !== 'shelf') return;
      const bar = document.getElementById('island-bar');
      // the shelf's own height (its content is drawn smaller with CSS zoom: see 29-v0913.css)
      // v0.9.24: the welcome card asks for room of its own (src/island/onboarding.ts)
      const h = Math.max(Math.ceil((bar?.offsetHeight || 40) + shelf.offsetHeight + 17), Number(body.dataset.tourHeight) || 0);
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
    else if (kind === 'tools') openTools('home');
    else openWeather();
  }

  // ── Dosyalar: two tiles, then Dönüştür | Gönder ────────────────────────────
  const tile = (kind: 'convert' | 'share' | 'rack', name: string, title: string, text: string) => {
    const t = el('button', 'h13-tile', el('span', 'h13-tile-icon', svg(name)), el('span', 'h13-tile-text', el('strong', '', title), el('small', '', text)), el('span', 'h13-tile-go', svg('chevronRight')));
    t.type = 'button';
    t.dataset.drop = kind;
    t.setAttribute('aria-label', title + ' · dosya bırak veya seç');
    return t;
  };
  const convertTile = tile('convert', 'refresh', 'Dönüştür', 'Görsel, belge ve arşivleri başka formata çevir');
  const shareTile = tile('share', 'send', 'Gönder', 'Yakındaki cihaza Quick Share ile gönder');
  const rackTile = tile('rack', 'folder', 'Dosya Rafı', 'Dosyaları sakla, istediğin yere sürükle');
  const tiles = el('div', 'h13-tiles', convertTile, shareTile, rackTile);
  tiles.dataset.kind = 'files';
  const filesBack = button('h13-back', 'Geri', svg('chevronLeft'));
  const seg = el('div', 'h13-seg');
  seg.setAttribute('role', 'tablist');
  const segBtn = (sub: 'convert' | 'share' | 'rack', text: string) => {
    const b = el('button', 'h13-seg-btn', text);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.onclick = () => openFiles(sub);
    return b;
  };
  const segConvert = segBtn('convert', 'Dönüştür');
  const segShare = segBtn('share', 'Gönder');
  const segRack = segBtn('rack', 'Raf');
  seg.append(segConvert, segShare, segRack);
  const filesTools = el('span', 'h13-files-tools');
  const filesHead = el('div', 'h13-files-head', filesBack, seg, filesTools);
  const filesBody = el('div', 'h13-files-body');
  const filesView = el('div', 'h13-files', filesHead, filesBody);
  filesView.dataset.kind = 'files';
  let filesSub: 'home' | 'convert' | 'share' | 'rack' = 'home';
  let subClose: (() => void) | null = null;
  filesBack.onclick = () => openFiles('home');
  function openFiles(sub: 'home' | 'convert' | 'share' | 'rack', onSubClose?: () => void) {
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
    segRack.classList.toggle('on', sub === 'rack');
    segConvert.setAttribute('aria-selected', String(sub === 'convert'));
    segShare.setAttribute('aria-selected', String(sub === 'share'));
    segRack.setAttribute('aria-selected', String(sub === 'rack'));
    filesTools.replaceChildren(...(sub === 'share' ? [share.receive] : []));
    filesBody.replaceChildren(sub === 'convert' ? converter.root : sub === 'share' ? share.root : rack.root);
    filesView.dataset.sub = sub;
    if (openKind !== 'files' || panelBody.firstElementChild !== filesView)
      openPanel('files', filesView, () => {
        subClose?.();
        subClose = null;
      });
    else sendHeight();
    if (sub === 'rack') rack.open();
  }
  const showFiles = () => {
    if (view !== 'shelf') void api.islandView('shelf').catch(() => {});
  };
  const converter = converterSheet({
    api,
    notice,
    attempt,
    show: () => {
      if (hub.filesHost?.('convert')) return;
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
      if (hub.filesHost?.('share', onClose)) return;
      showFiles();
      openFiles('share', onClose);
    },
    hide: () => closePanel(),
    card: filesAcc.b,
  });
  const rack = fileRack({ api, notice, attempt });
  hub.converter = converter;
  hub.share = share;
  convertTile.onclick = () => openFiles('convert');
  shareTile.onclick = () => share.open();
  rackTile.onclick = () => openFiles('rack');
  segShare.onclick = () => share.open();
  // a file dragged over the Dosyalar card opens the two tiles (dropped elsewhere it goes to the chat)
  // the panel a drag opened closes again when the drag is given up (or dropped elsewhere)
  let dragPanel = false, lastDragOver = 0, tileDropped = false, dragWatch = 0;
  filesAcc.b.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    if (openKind === 'files' && filesSub === 'home') return;
    const wasOpen = openKind === 'files';
    openFiles('home');
    if (wasOpen) return;
    dragPanel = true;
    tileDropped = false;
    lastDragOver = Date.now();
    window.clearInterval(dragWatch);
    // fallback: no dragover for a moment means the drag is gone
    dragWatch = window.setInterval(() => {
      if (Date.now() - lastDragOver < 250) return;
      endDragPanel(0);
    }, 80);
  });
  // closes the panel a drag opened, unless the file went onto one of its tiles
  // (a drop on a tile answers through the converter / sender a moment later: `wait`)
  function endDragPanel(wait: number) {
    if (!dragPanel) return;
    window.clearInterval(dragWatch);
    dragPanel = false;
    const close = () => {
      if (!tileDropped && openKind === 'files' && filesSub === 'home') closePanel();
    };
    if (wait) window.setTimeout(close, wait);
    else close();
  }
  document.addEventListener('dragover', () => {
    if (dragPanel) lastDragOver = Date.now();
  });
  // the file is pulled out of the island: back to normal at once
  document.addEventListener('dragleave', (e) => {
    if (!dragPanel) return;
    // (Chromium reports 0,0 or a point on the edge when a drag leaves the window)
    const out = (e.clientX === 0 && e.clientY === 0) || e.clientX < 1 || e.clientY < 1 || e.clientX >= innerWidth - 1 || e.clientY >= innerHeight - 1;
    if (out) endDragPanel(0);
  });
  document.addEventListener('drop', () => endDragPanel(400), true);
  document.addEventListener('dragend', () => endDragPanel(0));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dragPanel) endDragPanel(0);
  });
  filesAcc.b.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  // v0.9.2: one drag tracker for every drop target (the "over" frame never stays behind)
  const clearDropTargets = bindFileDropTargets();
  // a drop on the converter never leaves the dashed frame behind
  api.onConvertDrop?.(() => {
    tileDropped = true;
    clearDropTargets();
    document.dispatchEvent(new Event('dragend'));
    document.body.classList.remove('dropping');
  });
  api.onShareDrop?.(() => {
    tileDropped = true;
    clearDropTargets();
    document.dispatchEvent(new Event('dragend'));
    document.body.classList.remove('dropping');
  });
  api.onRackDrop?.((drop: any) => {
    tileDropped = true;
    clearDropTargets();
    document.dispatchEvent(new Event('dragend'));
    document.body.classList.remove('dropping');
    rack.received(drop);
    if (view === 'shelf' && (openKind !== 'files' || filesSub !== 'rack')) openFiles('rack');
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
      // v0.9.14: only the temperature and the city
      weatherAcc.sub.textContent = `${parts[1]} · ${parts[0]}`;
      notchWeather.textContent = `${emoji} ${parts[1]}`;
    } else {
      emojiEl.textContent = city ? '🌤️' : '📍';
      weatherAcc.sub.textContent = city ? `${String(city).split(',')[0]} · Yükleniyor…` : 'Şehrini seç';
      notchWeather.textContent = '';
    }
  }
  api.onCompanion?.(paintWeather);
  void Promise.resolve(api.companionRead?.()).then(paintWeather).catch(() => paintWeather(null));

  const pickCity = () => {
    closePanel();
    document.getElementById('weather-idle')?.click();
  };
  const weather = weatherView(api, pickCity, () => sendHeight());
  function openWeather() {
    openPanel('weather', weather.root);
    weather.load();
  }

  // ── Araçlar: Renk seçici, Zamanlayıcı, the v0.9.14 tools and the installed modules ──
  type ToolsSub = 'home' | 'colors' | 'timer' | 'reminders' | 'calendar' | 'mail' | 'usage' | 'home-assistant' | 'monitor';
  let toolsSub: ToolsSub = 'home';
  // v0.9.14: Hatırlatıcılar, Takvim, E-postalar and Akıllı ev are the app window's own cards
  // (borrowed from src/workspace/dashboard.ts); Kullanım özeti is Ayarlar → Haftalık özet.
  const CARD: Partial<Record<ToolsSub, 'reminders' | 'calendar' | 'mail' | 'home'>> = {
    reminders: 'reminders',
    calendar: 'calendar',
    mail: 'mail',
    'home-assistant': 'home',
  };
  const cardHost = el('div', 'h13-wscard');
  const weeklyHost = el('div', 'h13-weekly');
  const weekly = weeklySummaryUI(weeklyHost, api, notice);
  // what opens a window of its own (editors) or the chat goes on in the app window / the chat
  cardHost.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement;
      const editor = target.closest<HTMLElement>('.ws-edit-btn, .ws-more');
      if (editor) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void attempt(async () => {
          await api.workspace(true);
          window.setTimeout(() => editor.click(), 500);
        });
        return;
      }
      if (target.closest('.ws-mail-row')) window.setTimeout(() => void attempt(() => api.islandView('chat')), 400);
    },
    true,
  );
  const TOOLS: [Exclude<ToolsSub, 'home'>, string, string][] = [
    ['colors', 'pipette', 'Renk seçici'],
    ['timer', 'timer', 'Zamanlayıcı'],
    ['reminders', 'checklist', 'Hatırlatıcılar'],
    ['calendar', 'calendar', 'Takvim'],
    ['mail', 'mail', 'E-postalar'],
    ['usage', 'chart', 'Kullanım özeti'],
    ['home-assistant', 'home', 'Akıllı ev'],
    ['monitor', 'pulse', 'Sistem izleyici'],
  ];
  const monitor = systemMonitor(api);
  // v0.9.14: icon and name only (no description); long names wrap
  const toolTile = (sub: Exclude<ToolsSub, 'home'>, name: string, title: string) => {
    const t = el('button', 'h13-tt', el('span', 'h13-tt-icon', svg(name)), el('strong', 'h13-tt-name', title));
    t.type = 'button';
    t.dataset.sub = sub;
    t.onclick = () => openTools(sub);
    return t;
  };
  const modsRow = el('div', 'h13-mods');
  const modsHead = el('div', 'h13-sec-head', el('small', 'h13-sec-title', 'Modüller'));
  const toolsHome = el(
    'div',
    'h13-tools-home',
    el('div', 'h13-tgrid', ...TOOLS.map(([sub, name, title]) => toolTile(sub, name, title))),
    modsHead,
    modsRow,
  );
  toolsHome.dataset.kind = 'tools';
  async function paintModules() {
    let list: any[] = [];
    try {
      const r = await api.modulesList?.();
      list = Array.isArray(r?.modules) ? r.modules.filter((m: any) => m.enabled && !m.error) : [];
    } catch {}
    if (!list.length) {
      const add = button('h13-mod h13-mod-add', 'Modül yükle', svg('plus'), el('span', '', 'Modül yükle'));
      add.onclick = () =>
        void attempt(async () => {
          await api.islandView('chat');
          window.setTimeout(() => document.getElementById('settings-toggle')?.click(), 260);
        });
      modsRow.replaceChildren(add);
    } else
      modsRow.replaceChildren(
        ...list.map((m) => {
          const ic = m.icon ? Object.assign(el('img', 'h13-mod-img') as HTMLImageElement, { src: m.icon, alt: '' }) : el('span', 'h13-mod-letter', String(m.name || '?').slice(0, 1).toLocaleUpperCase('tr'));
          const name = el('span', 'h13-mod-name', m.name);
          name.translate = false;
          const b = button('h13-mod', m.name + ' · Aç', el('span', 'h13-mod-icon', ic), name);
          b.title = m.description || m.name;
          b.onclick = () => void attempt(() => api.modulesOpen(m.id));
          return b;
        }),
      );
    sendHeight();
  }
  const toolsBack = button('h13-back', 'Geri', svg('chevronLeft'));
  toolsBack.onclick = () => openTools('home');
  const toolsIcon = el('span', 'h13-tools-icon');
  const toolsTitle = el('strong', 'h13-tools-title');
  const toolsSlot = el('span', 'h13-files-tools');
  const toolsBody = el('div', 'h13-tools-body');
  const toolsView = el('div', 'h13-files h13-tools', el('div', 'h13-files-head', toolsBack, toolsIcon, toolsTitle, toolsSlot), toolsBody);
  toolsView.dataset.kind = 'tools';
  function openTools(sub: ToolsSub) {
    toolsSub = sub;
    if (sub === 'home') {
      openPanel('tools', toolsHome);
      void paintModules();
      return;
    }
    const meta = TOOLS.find(([id]) => id === sub)!;
    toolsIcon.replaceChildren(svg(meta[1]));
    toolsTitle.textContent = meta[2];
    const card = CARD[sub] ? hub.cards?.[CARD[sub]!] : undefined;
    if (card) {
      cardHost.dataset.card = CARD[sub]!;
      cardHost.replaceChildren(card.element);
      card.load();
    }
    if (sub === 'usage') void weekly.load();
    toolsSlot.replaceChildren(...(card || sub === 'usage' ? [] : [sub === 'monitor' ? monitor.action : sub === 'colors' ? color.action : timer.tabs]));
    toolsBody.replaceChildren(card ? cardHost : sub === 'monitor' ? monitor.root : sub === 'usage' ? weeklyHost : sub === 'colors' ? color.root : timer.root);
    toolsView.dataset.sub = sub;
    toolsView.classList.toggle('with-card', !!card);
    if (sub === 'timer') timer.open();
    if (openKind !== 'tools' || panelBody.firstElementChild !== toolsView) openPanel('tools', toolsView);
    else sendHeight();
  }

  // ── the closed island shows a running timer, a colour just taken, a finished timer ──
  const notchTool = el('div', 'notch-tool');
  notch.append(notchTool);
  let colorFlash: { hex: string; until: number } | null = null;
  let timerInfo: TimerInfo | null = null;
  let toolKind = '';
  const NR = 2 * Math.PI * 13;
  function paintNotchTool() {
    const t = timerInfo;
    const kind = t?.finished ? 'done' : colorFlash && Date.now() < colorFlash.until ? 'color' : t && (t.running || t.paused) ? 'timer' : '';
    if (kind === 'timer' && t) {
      const svgRing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgRing.setAttribute('viewBox', '0 0 32 32');
      const frac = t.mode === 'stopwatch' ? (t.ms % 60000) / 60000 : t.total ? t.ms / t.total : 0;
      svgRing.innerHTML = `<circle class="track" cx="16" cy="16" r="13"/><circle class="value" cx="16" cy="16" r="13" transform="rotate(-90 16 16)" stroke-dasharray="${NR.toFixed(1)}" stroke-dashoffset="${(NR * (1 - frac)).toFixed(1)}"/>`;
      const label = { focus: 'ODAK', break: 'MOLA', countdown: 'GERİ SAYIM', stopwatch: 'KRONOMETRE' }[t.mode];
      const play = button('notch-tool-btn', t.running ? 'Duraklat' : 'Devam et', svg(t.running ? 'pause' : 'play'));
      play.onclick = (e) => {
        e.stopPropagation();
        timer.toggle();
      };
      const sub = el('small', 'notch-tool-sub', t.label || (t.paused ? 'Duraklatıldı' : ''));
      sub.translate = !t.label;
      notchTool.replaceChildren(el('span', 'notch-tool-ring' + (t.paused ? ' paused' : ''), svgRing), el('span', 'notch-tool-text', el('b', 'notch-tool-kind', label), sub), el('strong', 'notch-tool-time', t.text), play);
    } else if (kind === 'color' && colorFlash) {
      const hex = el('b', 'notch-tool-hex', colorFlash.hex);
      hex.translate = false;
      const sw = el('span', 'notch-tool-swatch');
      sw.style.background = colorFlash.hex;
      notchTool.replaceChildren(sw, el('span', 'notch-tool-text', hex, el('small', 'notch-tool-ok', 'Panoya kopyalandı')), el('span', 'notch-tool-check', svg('check')));
    } else if (kind === 'done' && t?.finished) {
      const f = t.finished;
      const go = button('notch-tool-action', f.action, f.action);
      go.onclick = (e) => {
        e.stopPropagation();
        if (f.next) timer.next();
        else timer.dismiss();
      };
      notchTool.replaceChildren(el('span', 'notch-tool-text', el('b', 'notch-tool-title', f.title), el('small', 'notch-tool-sub', f.sub)), go);
    } else notchTool.replaceChildren();
    notch.dataset.tool = kind;
    body.classList.toggle('notch-tool-on', !!kind);
    if (kind !== toolKind) {
      toolKind = kind;
      void Promise.resolve(api.notchTool?.(kind)).catch(() => {});
    }
  }
  const color = colorPicker({
    api,
    notice,
    onPicked: (hex) => {
      colorFlash = { hex, until: Date.now() + 3500 };
      paintNotchTool();
      window.setTimeout(paintNotchTool, 3600);
    },
  });
  const timer = timerTool({
    api,
    onChange: (info) => {
      timerInfo = info;
      const live = info.running || info.paused;
      const names = { focus: 'Odak', break: 'Mola', countdown: 'Geri sayım', stopwatch: 'Kronometre' };
      toolsAcc.sub.textContent = info.finished
        ? info.finished.title
        : live
          ? info.mode === 'stopwatch'
            ? `${names[info.mode]} · ${info.text}`
            : `${names[info.mode]} · ${info.text} kaldı`
          : toolsAcc.sub.dataset.idle || '';
      toolsAcc.b.classList.toggle('live', live || !!info.finished);
      toolsAcc.b.classList.toggle('no-sub', !live && !info.finished);
      paintNotchTool();
    },
  });
  hub.color = color;
  hub.timer = timer;
  // a click on the timer / colour in the closed island opens Araçlar there
  notch.addEventListener(
    'click',
    (e) => {
      if (!toolKind || (e.target as HTMLElement).closest('button, #pet')) return;
      e.stopImmediatePropagation();
      void attempt(async () => {
        await api.islandView('shelf');
        openTools(toolKind === 'color' ? 'colors' : 'timer');
      });
    },
    true,
  );
  // the app window gives the panels back when it closes
  hub.reclaim = () => {
    if (openKind === 'tools') openTools(toolsSub);
    else if (openKind === 'files') openFiles(filesSub);
  };
  let wasWorkspace = body.classList.contains('workspace');
  new MutationObserver(() => {
    const now = body.classList.contains('workspace');
    if (wasWorkspace && !now) hub.reclaim?.();
    wasWorkspace = now;
  }).observe(body, { attributes: true, attributeFilter: ['class'] });

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
    // v0.9.16: a modal <dialog> makes the rest of the page dead to clicks; left open behind the
    // shelf or the closed island nothing would be clickable and nothing would show why
    if (view === 'chat' && next !== 'chat') for (const d of document.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
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
    notchTitle.textContent = r.title || 'Spotify';
    notchArtist.textContent = r.artist || '';
    const art = typeof r.art === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(r.art) ? r.art : '';
    notchArtBox.classList.toggle('has-art', !!art);
    if (art) {
      if (notchArt.src !== art) notchArt.src = art;
    } else notchArt.removeAttribute('src');
  });
  // v0.8.12: the notch's progress line follows the song directly (no slow fill after a seek)
  let barWidth = '';
  const paintBar = () => {
    const width = (music.fraction() * 100).toFixed(2) + '%';
    if (width === barWidth) return;
    barWidth = width;
    notchBar.style.width = width;
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
  // v0.9.14: a small cover; the progress bar runs under the whole card
  const meta = el('div', 'music-meta', label, title, artist, controls, start);
  const card = el('div', 'h13-music', art, meta, progress);
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
    if (last?.state !== 'Playing' || !last.ok || seeking) return; // paint() draws everything else
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
    card.classList.toggle('playing', playing);
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
