// v0.7.1 SpecialBeta: "Genel bakış" — the home page of the workspace window.
// Spotify, reminders and a calendar in the first column; important mail, a message box,
// Home Assistant and the remaining AI usage in the second. Every card reads data Charles
// already has (no new accounts or servers).
import { el, icon, iconButton } from './icons';
import { resetLabel } from '../island/usage';
import { calendarCard } from './calendar';
import { homeCard } from './home';

export type DashboardDeps = {
  api: any;
  notice: (s: string) => void;
  /** Sends a message in the chat and shows the chat (a new chat when `fresh`). */
  ask: (text: string, fresh?: boolean) => Promise<void>;
  /** Shows the chat view (after a mail was handed to the chat). */
  showChat: () => void;
  openSettings: (category: string) => void;
};

const PROVIDERS: [string, string, string][] = [
  ['gpt', 'Codex', '#f2f2f5'],
  ['claude', 'Claude', '#e8a27c'],
  ['gemini', 'Gemini', '#a8c7fa'],
  ['cursor', 'Cursor', '#3fd8c8'],
];
const SOURCES: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  school: 'Okul e-postası',
  calendar: 'Google Takvim',
  'outlook-calendar': 'Outlook Takvim',
};

/** Dates in the interface language. */
const LOCALES: Record<string, string> = { tr: 'tr-TR', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', zh: 'zh-CN' };
const loc = () => LOCALES[document.documentElement.lang] || 'tr-TR';
const hm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const mmss = (n: number) =>
  Number.isFinite(n) ? Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0') : '—';

function cardShell(cls: string, ic: string, title: string, ...extra: (Node | null)[]) {
  const card = el('section', 'ws-card ws-dash ' + cls);
  const head = el('div', 'ws-card-head', el('span', 'ws-card-icon', icon(ic)), el('h2', '', title));
  for (const x of extra) if (x) head.append(x);
  card.append(head);
  return card;
}

export function workspaceDashboard(d: DashboardDeps) {
  const { api } = d;
  const root = el('div', 'ws-home');
  const colA = el('div', 'ws-col');
  const colB = el('div', 'ws-col');
  root.append(colA, colB);
  const timers: number[] = [];
  let visible = false;

  // ── Spotify ────────────────────────────────────────────────────────────────
  const musicState = el('span', 'ws-pill-state', el('i', 'ws-dot'), el('span', '', 'Kapalı'));
  const music = cardShell('ws-music', 'music', 'Spotify', musicState);
  const art = el('div', 'ws-art', icon('music'));
  const artImg = el('img');
  artImg.alt = '';
  artImg.hidden = true;
  art.append(artImg);
  const trackTitle = el('strong', 'ws-track', 'Spotify');
  const trackArtist = el('small', 'ws-artist', 'Spotify’da bir parça başlat.');
  trackTitle.translate = false;
  const click = (id: string) => () => (document.getElementById(id) as HTMLButtonElement | null)?.click();
  const shuffleB = iconButton('shuffle', 'Karıştır', click('music-shuffle'));
  const prevB = iconButton('prev', 'Önceki parça', click('music-previous'));
  const playB = iconButton('play', 'Oynat', () => {
    const playing = playB.dataset.playing === '1';
    click(playing ? 'music-pause' : 'music-play')();
  }, 'ws-icon ws-play');
  const nextB = iconButton('next', 'Sonraki parça', click('music-next'));
  const repeatB = iconButton('repeat', 'Tekrar', click('music-repeat'));
  const controls = el('div', 'ws-music-controls', shuffleB, prevB, playB, nextB, repeatB);
  const bar = el('div', 'ws-progress', el('i'));
  const times = el('div', 'ws-times', el('small', '', '0:00'), el('small', '', '0:00'));
  music.append(el('div', 'ws-music-body', art, el('div', 'ws-music-info', trackTitle, trackArtist, controls, bar, times)));
  let media: any = null,
    mediaAt = 0;
  function paintMedia() {
    const r = media;
    const ok = !!r?.ok;
    const playing = ok && r.state === 'Playing';
    musicState.classList.toggle('on', ok);
    musicState.lastChild!.textContent = ok ? (playing ? 'Çalıyor' : 'Bağlı') : 'Kapalı';
    trackTitle.textContent = ok ? r.title || 'Spotify' : 'Spotify';
    trackArtist.textContent = ok ? r.artist || '' : 'Spotify’da bir parça başlat.';
    trackArtist.translate = !ok;
    const hasArt = ok && /^data:image\/(png|jpeg|webp);base64,/.test(r.art || '');
    artImg.hidden = !hasArt;
    if (hasArt) artImg.src = r.art;
    playB.dataset.playing = playing ? '1' : '0';
    playB.replaceChildren(icon(playing ? 'pause' : 'play'));
    playB.title = playing ? 'Duraklat' : 'Oynat';
    for (const b of [prevB, nextB, playB]) b.disabled = !ok && b !== playB;
    shuffleB.disabled = !ok || !r.capabilities?.shuffle;
    repeatB.disabled = !ok || !r.capabilities?.repeat;
    shuffleB.classList.toggle('on', r?.shuffle === true);
    repeatB.classList.toggle('on', r?.repeat === 'List' || r?.repeat === 'Track');
    tick();
  }
  function tick() {
    const r = media;
    const dur = r?.ok ? Number(r.duration) || 0 : 0;
    const pos = dur
      ? Math.min(dur, (Number(r.position) || 0) + (r.state === 'Playing' ? (Date.now() - mediaAt) / 1000 : 0))
      : 0;
    (bar.firstChild as HTMLElement).style.width = dur ? (pos / dur) * 100 + '%' : '0%';
    times.firstChild!.textContent = dur ? mmss(pos) : '0:00';
    times.lastChild!.textContent = dur ? mmss(dur) : '0:00';
  }
  bar.onclick = (e) => {
    const p = document.getElementById('music-progress') as HTMLInputElement | null;
    if (!p || !media?.duration || !media?.capabilities?.seek) return;
    const r = bar.getBoundingClientRect();
    p.value = String(Math.round(((e.clientX - r.left) / r.width) * media.duration));
    p.dispatchEvent(new Event('change'));
  };
  document.addEventListener('charles-media-state', (e: any) => {
    media = e.detail;
    mediaAt = Date.now();
    paintMedia();
  });

  // ── Reminders ──────────────────────────────────────────────────────────────
  const remAdd = iconButton('plus', 'Hatırlatıcı ekle', () => openAdd());
  const remList = el('div', 'ws-list');
  const remForm = el('form', 'ws-rem-form');
  remForm.hidden = true;
  const remTitle = el('input');
  remTitle.placeholder = 'Ne hatırlatılsın?';
  remTitle.maxLength = 200;
  const remWhen = el('input');
  remWhen.type = 'datetime-local';
  remWhen.setAttribute('aria-label', 'Zaman');
  const remSave = el('button', 'primary', 'Ekle');
  remSave.type = 'submit';
  const remCancel = el('button', '', 'Vazgeç');
  remCancel.type = 'button';
  remForm.append(remTitle, remWhen, el('div', 'ws-rem-actions', remCancel, remSave));
  const reminders = cardShell('ws-reminders', 'checklist', 'Hatırlatıcılar', el('span', 'ws-chip', 'Yaklaşan'), remAdd);
  reminders.append(remForm, remList);
  let personal: any = null;
  function openAdd() {
    remForm.hidden = false;
    const t = new Date(Date.now() + 3600000);
    t.setMinutes(0, 0, 0);
    remWhen.value = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    remTitle.focus();
  }
  remCancel.onclick = () => {
    remForm.hidden = true;
    remTitle.value = '';
  };
  remForm.onsubmit = (e) => {
    e.preventDefault();
    void (async () => {
      try {
        const due = new Date(remWhen.value).getTime();
        personal = await api.personalEdit('reminder-add', { title: remTitle.value, due });
        remTitle.value = '';
        remForm.hidden = true;
        paintReminders();
        paintCalendar();
      } catch (err) {
        d.notice((err as Error).message);
      }
    })();
  };
  function upcoming() {
    return (personal?.reminders || [])
      .filter((r: any) => r.status === 'active' || r.status === 'paused')
      .sort((a: any, b: any) => a.due - b.due);
  }
  function paintReminders() {
    remList.replaceChildren();
    const list = upcoming().slice(0, 5);
    const now = new Date();
    for (const r of list) {
      const due = new Date(r.due);
      const check = el('button', 'ws-check', icon('check'));
      check.type = 'button';
      check.title = 'Tamamlandı · listeden kaldır';
      check.setAttribute('aria-label', r.title + ' · tamamlandı');
      check.onclick = () =>
        void (async () => {
          check.classList.add('on');
          try {
            personal = await api.personalEdit('reminder-delete', { id: r.id });
            window.setTimeout(() => {
              paintReminders();
              paintCalendar();
            }, 250);
          } catch (err) {
            d.notice((err as Error).message);
          }
        })();
      const when = sameDay(due, now)
        ? hm(due)
        : due.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) + ' ' + hm(due);
      const title = el('span', 'ws-rem-title', (r.kind === 'focus' ? '⏱ ' : '') + r.title);
      title.translate = false;
      remList.append(el('div', 'ws-rem', check, title, el('small', 'ws-time', when)));
    }
    if (!list.length) remList.append(el('p', 'ws-empty', 'Yaklaşan hatırlatıcı yok. + ile ekle ya da Charles’a “yarın 9’da hatırlat” de.'));
  }
  api.onPersonal?.((v: any) => {
    personal = v;
    paintReminders();
    paintCalendar();
  });

  // ── Calendar (v0.7.2: calendar.ts — card + "Takvimi düzenle") ───────────────
  const cal = calendarCard({
    api,
    notice: d.notice,
    ask: (text) => void d.ask(text),
    openSettings: d.openSettings,
    reminders: () => upcoming(),
    setPersonal: (p) => {
      personal = p;
      paintReminders();
    },
  });
  const calendar = cal.element;
  const paintCalendar = () => cal.paint();
  const loadCalendar = (force = false) => cal.load(force);

  // ── Important mail · "Tümünü gör" = the newest mails of every account ──────
  let mailMode: 'important' | 'recent' = 'important';
  const mailBadge = el('span', 'ws-badge');
  mailBadge.hidden = true;
  const mailList = el('div', 'ws-list ws-mail-list');
  const mailAll = el('button', 'ws-link', el('span', '', 'Tümünü gör'), icon('arrowRight'));
  mailAll.type = 'button';
  mailAll.onclick = () => {
    mailMode = mailMode === 'important' ? 'recent' : 'important';
    void loadMail();
  };
  const mail = cardShell(
    'ws-mail',
    'mail',
    'Önemli e-postalar',
    mailBadge,
    iconButton('refresh', 'Yenile', () => void loadMail()),
  );
  const mailTitle = mail.querySelector('h2')!;
  mail.append(mailList, mailAll);
  const initials = (s: string) =>
    (s.replace(/<.*?>/g, '').replace(/["']/g, '').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '✉').toLocaleUpperCase('tr');
  function mailRow(m: any, recent: boolean) {
    const calendarItem = String(m.kind).includes('calendar');
    const sender = calendarItem ? SOURCES[m.kind] || 'Takvim' : (m.from || SOURCES[m.kind] || 'E-posta').replace(/<.*?>/g, '').replace(/"/g, '').trim();
    const when = m.date || m.at ? new Date(m.date || m.at) : null;
    const from = el('span', 'ws-mail-from', sender);
    from.translate = false;
    const text = el('span', 'ws-mail-text', el('strong', '', m.title || '(Konusuz)'), el('small', '', recent ? m.preview || SOURCES[m.kind] || '' : m.reason || m.preview || ''));
    text.translate = false;
    const b = el(
      'button',
      'ws-mail-row' + (recent && m.unread ? ' unread' : ''),
      el('span', 'ws-avatar', calendarItem ? icon('calendar') : initials(sender)),
      from,
      text,
      el('small', 'ws-time', when && !Number.isNaN(+when) ? (sameDay(when, new Date()) ? hm(when) : when.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })) : ''),
    );
    b.type = 'button';
    b.title = 'Charles bu e-postayı anlatsın';
    b.onclick = () =>
      void (async () => {
        try {
          await api.workspaceMailOpen(m.id, recent ? m : undefined);
          d.showChat();
        } catch (err) {
          d.notice((err as Error).message);
        }
      })();
    return b;
  }
  async function loadMail() {
    const recent = mailMode === 'recent';
    mailTitle.textContent = recent ? 'Son e-postalar' : 'Önemli e-postalar';
    (mailAll.firstChild as HTMLElement).textContent = recent ? 'Önemlilere dön' : 'Tümünü gör';
    mailAll.classList.toggle('back', recent);
    try {
      if (recent) mailList.replaceChildren(el('p', 'ws-empty', 'E-postalar okunuyor…'));
      const rows: any[] = recent ? await api.workspaceMailRecent() : await api.workspaceMail();
      if (recent !== (mailMode === 'recent')) return;
      mailList.replaceChildren();
      mailBadge.hidden = recent || !rows.length;
      mailBadge.textContent = rows.length + ' yeni';
      for (const m of rows.slice(0, recent ? 6 : 4)) mailList.append(mailRow(m, recent));
      if (!rows.length)
        mailList.append(
          el(
            'p',
            'ws-empty',
            recent ? 'Bağlı hesaplarda e-posta bulunamadı.' : 'Şu an önemli e-posta yok. Yeni önemli bir e-posta gelince burada görünür.',
          ),
        );
    } catch (err) {
      mailList.replaceChildren(el('p', 'ws-empty', (err as Error).message));
    }
  }

  // ── Message box ────────────────────────────────────────────────────────────
  const ask = el('form', 'ws-ask');
  const askAttach = iconButton('plus', 'Ekle ve araçlar', () => {
    d.showChat();
    window.setTimeout(() => document.getElementById('composer-plus')?.click(), 50);
  });
  const askInput = el('input');
  askInput.placeholder = 'Charles’a bir şey sor…';
  askInput.setAttribute('aria-label', 'Charles’a bir şey sor');
  const askModel = el('button', 'ws-model', el('span', '', 'Model'), icon('chevronDown'));
  askModel.type = 'button';
  askModel.onclick = () => {
    d.showChat();
    window.setTimeout(() => document.getElementById('model-button')?.click(), 50);
  };
  const askMic = iconButton('mic', 'Konuş', () => {
    d.showChat();
    window.setTimeout(() => document.getElementById('voice-mic')?.click(), 50);
  });
  const askLive = iconButton('wave', 'Sesli sohbet', () => {
    d.showChat();
    window.setTimeout(() => document.getElementById('voice-call')?.click(), 50);
  });
  const askSend = iconButton('arrowUp', 'Gönder', () => ask.requestSubmit(), 'ws-icon ws-send');
  askSend.type = 'submit';
  ask.append(askAttach, askInput, askModel, askMic, askLive, askSend);
  ask.onsubmit = (e) => {
    e.preventDefault();
    const text = askInput.value.trim();
    if (!text) return;
    askInput.value = '';
    void d.ask(text, true);
  };
  const syncModel = () => {
    const label = document.getElementById('model-button')?.textContent?.trim() || 'Model';
    (askModel.firstChild as HTMLElement).textContent = label;
  };
  const modelButton = document.getElementById('model-button');
  if (modelButton) new MutationObserver(syncModel).observe(modelButton, { childList: true, characterData: true, subtree: true });
  syncModel();
  const askCard = el('section', 'ws-card ws-ask-card', ask);

  // ── Home Assistant (v0.7.2: home.ts — card + "Akıllı evi düzenle") ───────────
  const homeView = homeCard({ api, notice: d.notice, openSettings: d.openSettings });
  const home = homeView.element;
  const loadHome = (force = false) => homeView.load(force);

  // ── Remaining usage: rings like the island (5 hours and week) ──────────────
  const usage = cardShell('ws-usage', 'chart', 'Kalan kullanım', iconButton('refresh', 'Yenile', () => void loadUsage(true)));
  const usageGrid = el('div', 'ws-usage-grid');
  usage.append(usageGrid);
  const RING = 2 * Math.PI * 26;
  function ring(label: string) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<circle class="track" cx="32" cy="32" r="26"/><circle class="value" cx="32" cy="32" r="26" transform="rotate(-90 32 32)" stroke-dasharray="' +
      RING.toFixed(1) +
      '" stroke-dashoffset="' +
      RING.toFixed(1) +
      '"/>';
    const box = el('div', 'ws-ring', svg, el('strong', 'ws-ring-pct', '—'), el('span', 'ws-ring-label', label), el('small', 'ws-ring-reset', ''));
    return box;
  }
  const usageCols = new Map<string, { col: HTMLElement; five: HTMLElement; week: HTMLElement; note: HTMLElement }>();
  for (const [id, name, color] of PROVIDERS) {
    const five = ring('5 saatlik');
    const week = ring('Haftalık');
    const note = el('small', 'ws-usage-note', '');
    const col = el('div', 'ws-usage-col', el('div', 'ws-prov', el('i', 'ws-prov-dot'), el('span', '', name)), el('div', 'ws-rings', five, week), note);
    col.style.setProperty('--c', color);
    col.dataset.provider = id;
    usageCols.set(id, { col, five, week, note });
    usageGrid.append(col);
  }
  function setRing(box: HTMLElement, w: any, label: string) {
    const value = box.querySelector('circle.value') as SVGCircleElement;
    const pct = box.querySelector('.ws-ring-pct')!;
    const reset = box.querySelector('.ws-ring-reset')!;
    box.querySelector('.ws-ring-label')!.textContent = label;
    if (!w) {
      value.setAttribute('stroke-dashoffset', RING.toFixed(1));
      pct.textContent = '—';
      reset.textContent = '';
      box.classList.add('empty');
      return;
    }
    const left = Math.max(0, Math.min(100, Math.round(w.remaining)));
    box.classList.remove('empty');
    box.classList.toggle('low', left <= 15);
    value.setAttribute('stroke-dashoffset', (RING * (1 - left / 100)).toFixed(1));
    pct.textContent = '%' + left;
    const r = resetLabel(w.resetsAt).replace(/ 0dk$/, '').replace(/ 0sa$/, '');
    reset.textContent = r ? '↻ ' + r : '';
  }
  async function loadUsage(force = false) {
    let status: any[] = [];
    try {
      status = await api.providersStatus();
    } catch {}
    const signed = new Set(status.filter((s) => s.signedIn).map((s) => s.id));
    await Promise.all(
      PROVIDERS.map(async ([id]) => {
        const c = usageCols.get(id)!;
        if (id !== 'gpt' && !signed.has(id)) {
          c.col.classList.add('off');
          setRing(c.five, null, '5 saatlik');
          setRing(c.week, null, 'Haftalık');
          c.note.textContent = 'Bağlı değil';
          return;
        }
        // Gemini starts its CLI to read the quota: once when the window opens (v0.7.2), then
        // only with the refresh button
        if (id === 'gemini' && !force && c.col.dataset.loaded) return;
        if (id === 'gemini' && !c.col.dataset.loaded) c.note.textContent = 'Okunuyor…';
        try {
          const u = await api.usageRead(force, id);
          c.col.dataset.loaded = '1';
          c.col.classList.toggle('off', !u.fiveHour && !u.weekly);
          setRing(c.five, u.fiveHour, u.labels?.fiveHour || '5 saatlik');
          setRing(c.week, u.weekly, u.labels?.weekly || 'Haftalık');
          c.note.textContent = !u.fiveHour && !u.weekly ? u.unavailable || 'Bilgi yok' : '';
        } catch (err) {
          c.col.classList.add('off');
          c.note.textContent = (err as Error).message.slice(0, 60);
        }
      }),
    );
  }

  colA.append(music, reminders, calendar);
  colB.append(mail, askCard, home, usage);

  async function loadAll(force = false) {
    try {
      personal = await api.personalRead();
    } catch {}
    paintReminders();
    paintCalendar();
    void loadMail();
    void loadHome(force);
    void loadUsage(force);
    await loadCalendar(force);
  }

  return {
    element: root,
    show() {
      visible = true;
      void loadAll();
      timers.push(window.setInterval(() => visible && tick(), 1000));
      timers.push(window.setInterval(() => visible && void loadMail(), 30000));
      timers.push(window.setInterval(() => visible && void loadAll(), 300000));
      window.setTimeout(() => askInput.focus(), 80);
    },
    hide() {
      visible = false;
      for (const t of timers.splice(0)) window.clearInterval(t);
    },
    refresh: () => loadAll(true),
  };
}
