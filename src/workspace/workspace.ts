// v0.7.1 SpecialBeta: the workspace window — Charles as a normal desktop app, like the Codex
// and Claude apps on Windows. The button next to "Paneli açık tut" turns the island into this
// window; "Adacığa dön" (top right) turns it back.
//
// The same window and the same chat code are used: the conversation, the message box and
// Slime are moved into the app layout and moved back when the island returns, so chats,
// answers, approvals and settings keep working exactly as before.
//
// Layout: title bar · left column (Charles, chats with folders) · main area that shows either
// "Genel bakış" (dashboard.ts) or the open chat.
import { el, icon, iconButton } from './icons';
import { workspaceSidebar } from './sidebar';
import { workspaceDashboard } from './dashboard';
import { sidePanel } from './side-panel';
import { workUI } from './work';
import { reviewScreen } from './review';
import { dropSlime } from './drop-slime';
import { slimeIcon } from '../island/app-icon';
import { roomActions } from './bridge';
import { parseLook } from '../vendor/slime/shape';

export type WorkspaceDeps = {
  api: any;
  notice: (s: string) => void;
  version: string;
};

const SETTINGS_ICONS: Record<string, string> = {
  general: 'sliders',
  account: 'brain',
  look: 'palette',
  memory: 'bulb',
  access: 'lock',
  connections: 'puzzle',
  modules: 'blocks',
  shortcuts: 'keyboard',
  weekly: 'chart',
  performance: 'bolt',
  profile: 'user',
};

export function providerName(model: string) {
  if (/^claude:/.test(model)) return 'Claude';
  if (/^gemini:/.test(model)) return 'Gemini';
  if (/^cursor:/.test(model)) return 'Cursor';
  if (/^abacus:/.test(model)) return 'Abacus AI';
  return 'Codex';
}

export function workspaceUI(d: WorkspaceDeps) {
  const { api } = d;
  const $ = (id: string) => document.getElementById(id)!;
  let on = false;
  let view: 'home' | 'chat' = 'home';
  let maximized = false;

  // ── Button on the island (next to "Paneli açık tut") ─────────────────────────
  const openButton = el('button', '', icon('window'));
  openButton.id = 'workspace-open';
  openButton.type = 'button';
  openButton.title = 'Uygulama penceresinde aç';
  openButton.setAttribute('aria-label', 'Uygulama penceresinde aç');
  openButton.onclick = () => void enter();
  const pin = document.getElementById('panel-pin');
  if (pin) pin.after(openButton);
  else document.querySelector('header')?.append(openButton);

  // ── Window ─────────────────────────────────────────────────────────────────
  const root = el('div');
  root.id = 'workspace';
  root.hidden = true;

  const brandIcon = el('img', 'ws-brand-icon');
  brandIcon.alt = '';
  const crumb = el('span', 'ws-crumb', 'Çalışma alanı');
  const titlebar = el('div', 'ws-titlebar', el('div', 'ws-brand', brandIcon, el('strong', '', 'Charles'), el('i', 'ws-sep'), crumb));
  const settingsB = iconButton('gear', 'Ayarlar', () => openSettings());
  // v0.7.7: "Ana sayfayı düzenle" — the cards of the home page (dash-edit.ts)
  const editB = iconButton('pencil', 'Ana sayfayı düzenle', () => {
    if (view !== 'home') showHome();
    dashboard.setEditing(!dashboard.isEditing());
  }, 'ws-icon ws-edit-home');
  const sidebarB = iconButton('sidebar', 'Kenar çubuğunu gizle veya göster', () => root.classList.toggle('no-side'));
  const islandB = el('button', 'ws-island', icon('island'), el('span', '', 'Adacığa dön'));
  islandB.type = 'button';
  islandB.onclick = () => void leave();
  const minB = iconButton('minimize', 'Simge durumuna küçült', () => void api.workspaceWindow('minimize'), 'ws-icon ws-win');
  const maxB = iconButton('maximize', 'Ekranı kapla', () => void api.workspaceWindow('maximize'), 'ws-icon ws-win');
  const closeB = iconButton('x', 'Kapat · Charles adacıkta çalışmaya devam eder', () => void leave(), 'ws-icon ws-win ws-close');
  titlebar.append(el('div', 'ws-title-actions', editB, settingsB, sidebarB, islandB, el('i', 'ws-sep'), minB, maxB, closeB));
  titlebar.ondblclick = (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    void api.workspaceWindow('maximize');
  };

  // left column
  const petSlot = el('div', 'ws-pet-slot');
  const statusDot = el('i', 'ws-dot');
  const statusText = el('span', '', 'Hazır');
  const profile = el(
    'section',
    'ws-card ws-profile',
    petSlot,
    el('strong', 'ws-name', 'Charles'),
    el('small', 'ws-version', d.version),
    el('span', 'ws-status', statusDot, statusText),
  );
  const sidebar = workspaceSidebar({ api, notice: d.notice, opened: () => showChat() });
  const side = el('aside', 'ws-side', profile, sidebar.element);

  // main area
  const main = el('main', 'ws-main');
  const dashboard = workspaceDashboard({
    api,
    notice: d.notice,
    ask: (text, fresh) => ask(text, fresh),
    showChat: () => showChat(),
    openSettings: (c) => openSettings(c),
    editing: (v) => {
      editB.classList.toggle('on', v);
      editB.setAttribute('aria-pressed', String(v));
    },
  });
  const home = el('div', 'ws-view ws-home-view', dashboard.element);
  const back = el('button', 'ws-back', icon('chevronLeft'), el('span', '', 'Genel bakış'));
  back.type = 'button';
  back.onclick = () => showHome();
  const chatTitle = el('strong', 'ws-chat-title', 'Yeni sohbet');
  const chatPath = el('small', 'ws-chat-path');
  chatPath.translate = false;
  const findBox = el('input', 'ws-find');
  findBox.type = 'search';
  findBox.placeholder = 'Bu sohbette ara';
  findBox.setAttribute('aria-label', 'Bu sohbette ara');
  findBox.hidden = true;
  const findB = iconButton('search', 'Bu sohbette ara', () => {
    findBox.hidden = !findBox.hidden;
    if (!findBox.hidden) findBox.focus();
    else clearFind();
  });
  const moreB = iconButton('dots', 'Sohbet işlemleri', () =>
    sidebar.popup(moreB, [
      ['pencil', 'Adlandır', () => renameChat()],
      ['move', 'Klasöre taşı', () => sidebar.moveTo(moreB)],
      ['pin', 'Sabitle / ayır', () => sidebar.manage('pin')],
      ['plus', 'Yeni sohbet', () => ($('add-session') as HTMLButtonElement).click()],
      ['trash', 'Sohbeti sil', () => sidebar.popup(moreB, [['trash', 'Silmeyi onayla', () => sidebar.manage('delete')], ['x', 'Vazgeç', () => {}]])],
    ]),
  );
  // v0.7.2: files, code and terminal output on the right (side-panel.ts)
  const panelSide = sidePanel({ api, notice: d.notice, isOpen: () => on });
  const panelB = iconButton('panelRight', 'Yan paneli aç veya kapat', () => panelSide.toggle());
  // v0.7.7: change review, "Şu an ne yapıyorum?" and the work queue (review.ts, work.ts)
  const review = reviewScreen({ api, notice: d.notice });
  const reviewB = iconButton('diff', 'Değişiklikleri incele', () => void review.open());
  const work = workUI({
    api,
    notice: d.notice,
    send: (text) => send(text),
    review: (id) => void review.open(id),
    visible: () => on && view === 'chat',
  });
  const chatHead = el(
    'div',
    'ws-chat-head',
    back,
    el('i', 'ws-vsep'),
    el('div', 'ws-chat-heading', chatTitle, chatPath),
    el('div', 'ws-chat-tools', findBox, findB, reviewB, panelB, moreB),
  );
  const chatBody = el('div', 'ws-chat-body');
  const hint = el('p', 'ws-composer-hint', 'Enter ile gönder · Shift + Enter ile yeni satır');
  const workBox = el('div', 'ws-work', work.now, work.queue);
  const chat = el('div', 'ws-view ws-chat-view', chatHead, workBox, chatBody, hint, panelSide.element);
  chat.hidden = true;
  main.append(home, chat);
  const body = el('div', 'ws-body', side, main);
  root.append(titlebar, body);

  // resize edges (the window is frameless and transparent, so Charles resizes it himself)
  for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const h = el('div', 'ws-edge ws-edge-' + edge);
    h.dataset.edge = edge;
    h.onpointerdown = (e) => {
      if (maximized || e.button !== 0) return;
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const sx = e.screenX,
        sy = e.screenY;
      let start: any = null,
        frame = 0,
        last = { dx: 0, dy: 0 };
      void api.workspaceWindow('bounds').then((b: any) => (start = b));
      h.onpointermove = (m) => {
        last = { dx: m.screenX - sx, dy: m.screenY - sy };
        if (!start || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          void api.workspaceWindow('resize', { edge, start, ...last });
        });
      };
      h.onpointerup = () => {
        h.onpointermove = null;
        h.onpointerup = null;
        void api.workspaceWindow('resize-end');
      };
    };
    root.append(h);
  }
  document.body.append(root);

  // v0.7.7: a dragged file → the + of the message box becomes Slime (drop-slime.ts)
  dropSlime({
    api,
    buttons: () => [document.getElementById('composer-plus'), dashboard.element.querySelector<HTMLElement>('.ws-ask > button')],
    onDrop: () => {
      if (on && view === 'home') showChat();
    },
  });

  // ── Moving the chat and Slime in and out ──────────────────────────────────
  const content = document.querySelector('main.island > .content') as HTMLElement;
  const contentHome = { parent: content.parentElement!, next: content.nextSibling };
  const pet = $('pet');
  const petHome = { parent: pet.parentElement!, next: pet.nextSibling };

  function chatInfo() {
    const { room, path } = sidebar.active();
    chatTitle.textContent = room?.name || 'Yeni sohbet';
    chatTitle.translate = !room;
    chatPath.replaceChildren();
    if (path.length) chatPath.append(icon('folder'), el('span', '', path.join(' / ')));
    crumb.textContent = view === 'chat' ? room?.name || 'Sohbet' : 'Çalışma alanı';
    crumb.translate = !(view === 'chat' && room);
  }
  function showHome() {
    view = 'home';
    home.hidden = false;
    chat.hidden = true;
    root.dataset.view = 'home';
    dashboard.show();
    chatInfo();
  }
  function showChat() {
    view = 'chat';
    home.hidden = true;
    chat.hidden = false;
    root.dataset.view = 'chat';
    dashboard.hide();
    chatInfo();
    const feed = $('feed');
    feed.scrollTop = feed.scrollHeight;
    window.setTimeout(() => ($('prompt') as HTMLTextAreaElement).focus(), 30);
    work.shown();
  }
  /** Sends a message in the open chat (while an answer runs: as an extra instruction). */
  async function send(text: string) {
    showChat();
    const prompt = $('prompt') as HTMLTextAreaElement;
    const kept = prompt.value;
    prompt.value = text;
    prompt.dispatchEvent(new Event('input'));
    ($('composer') as HTMLFormElement).requestSubmit();
    // the user's unsent draft comes back once this message has left the box
    if (kept.trim()) {
      const t0 = Date.now();
      const wait = window.setInterval(() => {
        if (prompt.value === text && Date.now() - t0 < 5000) return;
        window.clearInterval(wait);
        if (!prompt.value) {
          prompt.value = kept;
          prompt.dispatchEvent(new Event('input'));
        }
      }, 50);
    }
    void sidebar.refresh();
  }
  async function ask(text: string, fresh = false) {
    try {
      const feed = $('feed');
      if (fresh && feed.querySelector('.message')) await roomActions().create();
      showChat();
      const prompt = $('prompt') as HTMLTextAreaElement;
      prompt.value = text;
      prompt.dispatchEvent(new Event('input'));
      ($('composer') as HTMLFormElement).requestSubmit();
      void sidebar.refresh();
    } catch (e) {
      d.notice((e as Error).message);
    }
  }
  function renameChat() {
    const input = el('input', 'ws-inline');
    input.value = chatTitle.textContent || '';
    chatTitle.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      input.replaceWith(chatTitle);
      if (save && input.value.trim()) void sidebar.rename(input.value.trim()).then(chatInfo);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    };
    input.onblur = () => finish(true);
  }

  // in-chat search
  let hits: HTMLElement[] = [];
  let hit = -1;
  function clearFind() {
    for (const m of document.querySelectorAll('.message.ws-hit, .message.ws-hit-now'))
      m.classList.remove('ws-hit', 'ws-hit-now');
    hits = [];
    hit = -1;
    findBox.value = '';
  }
  findBox.oninput = () => {
    const q = findBox.value.trim().toLocaleLowerCase('tr');
    for (const m of document.querySelectorAll('.message.ws-hit, .message.ws-hit-now'))
      m.classList.remove('ws-hit', 'ws-hit-now');
    hits = q
      ? [...document.querySelectorAll<HTMLElement>('#feed .message')].filter((m) =>
          (m.textContent || '').toLocaleLowerCase('tr').includes(q),
        )
      : [];
    for (const m of hits) m.classList.add('ws-hit');
    hit = -1;
    step();
  };
  function step() {
    if (!hits.length) return;
    hits[hit]?.classList.remove('ws-hit-now');
    hit = (hit + 1) % hits.length;
    hits[hit].classList.add('ws-hit-now');
    hits[hit].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  findBox.onkeydown = (e) => {
    if (e.key === 'Enter') step();
    if (e.key === 'Escape') {
      clearFind();
      findBox.hidden = true;
    }
  };

  // Charles' answers get his avatar, name and the model's name; new messages get the time
  const feed = $('feed');
  const stamp = (m: HTMLElement, live: boolean) => {
    if (m.dataset.wsMeta !== undefined) return;
    const now = new Date();
    const time = live ? String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') : '';
    if (m.classList.contains('agent')) {
      const model = ($('model') as HTMLSelectElement).value || '';
      m.dataset.wsMeta = live ? providerName(model) + (time ? ' · ' + time : '') : '';
    } else m.dataset.wsMeta = time;
  };
  new MutationObserver((records) => {
    const added: HTMLElement[] = [];
    for (const r of records)
      for (const n of r.addedNodes)
        if (n instanceof HTMLElement && n.classList.contains('message')) added.push(n);
    // A whole chat being redrawn (switching chats) is not "now": no times on old messages.
    const live = added.length <= 2;
    for (const m of added) stamp(m, live);
    if (added.length && on) chatInfo();
  }).observe(feed, { childList: true });

  // Slime avatar for the answers and the title bar, in the user's colour
  let color = '';
  async function avatar(p?: any) {
    try {
      const look = parseLook((p ?? (await api.personalRead()))?.slime);
      if (look.color === color) return;
      color = look.color;
      const url = slimeIcon(look.color);
      root.style.setProperty('--ws-avatar', `url("${url}")`);
      brandIcon.src = url;
    } catch {}
  }
  api.onPersonal?.((p: any) => on && void avatar(p));

  // Status of the AI connection and Charles himself
  const status = $('status');
  const paintStatus = () => {
    const text = (status.textContent || '').trim();
    statusText.textContent = text && text.length < 40 ? text : 'Hazır';
    const account = ($('account').textContent || '').trim();
    const ok = !/Bağlı değil|Not connected/i.test(account);
    statusDot.classList.toggle('off', !ok);
  };
  new MutationObserver(paintStatus).observe(status, { childList: true, characterData: true, subtree: true });
  new MutationObserver(paintStatus).observe($('account'), { childList: true, characterData: true, subtree: true });

  // ── Settings: a roomier window with a side menu ───────────────────────────
  function decorateSettings() {
    const nav = document.getElementById('settings-categories');
    if (!nav || nav.dataset.wsIcons) return;
    nav.dataset.wsIcons = '1';
    for (const b of nav.querySelectorAll<HTMLButtonElement>('button[data-category]')) {
      const ic = icon(SETTINGS_ICONS[b.dataset.category || ''] || 'sliders', 'ws-nav-icon');
      b.prepend(ic);
    }
  }
  function openSettings(category?: string) {
    decorateSettings();
    $('settings-toggle').click();
    if (category)
      window.setTimeout(
        () => (document.querySelector(`#settings-categories [data-category=${category}]`) as HTMLElement | null)?.click(),
        30,
      );
  }

  // ── Enter / leave ──────────────────────────────────────────────────────────
  let switchTimer = 0;
  let fromBottom = 0;
  function switching() {
    const feed = $('feed');
    if (!document.body.classList.contains('ws-switching'))
      fromBottom = Math.max(0, feed.scrollHeight - feed.scrollTop - feed.clientHeight);
    document.body.classList.add('ws-switching');
    window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(switched, 1500);
  }
  function switched() {
    window.clearTimeout(switchTimer);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.body.classList.remove('ws-switching');
        const feed = $('feed');
        feed.scrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight - fromBottom);
      }),
    );
  }
  async function enter() {
    switching();
    try {
      await api.workspace(true);
    } catch (e) {
      switched();
      d.notice((e as Error).message);
    }
  }
  async function leave() {
    switching();
    try {
      await api.workspace(false);
    } catch (e) {
      d.notice((e as Error).message);
      // v0.7.2: never leave the user without Charles: fall back to the island
      try {
        apply(await api.workspaceState());
      } catch {
        apply({ on: false });
      }
      if (!on) void api.expand?.(true).catch(() => {});
    }
  }
  function apply(state: { on?: boolean; maximized?: boolean } | null) {
    maximized = !!state?.maximized;
    root.classList.toggle('maximized', maximized);
    maxB.replaceChildren(icon(maximized ? 'restore' : 'maximize'));
    maxB.title = maximized ? 'Önceki boyuta dön' : 'Ekranı kapla';
    const next = !!state?.on;
    if (next === on) {
      if (document.body.classList.contains('ws-switching')) switched();
      return;
    }
    if (!document.body.classList.contains('ws-switching')) switching();
    on = next;
    document.body.classList.toggle('workspace', on);
    root.hidden = !on;
    for (const dlg of ['settings-panel', 'sessions-panel'])
      (document.getElementById(dlg) as HTMLDialogElement | null)?.close?.();
    if (on) {
      decorateSettings();
      void avatar();
      petSlot.append(pet);
      chatBody.append(content);
      paintStatus();
      void sidebar.refresh();
      showHome();
    } else {
      dashboard.hide();
      sidebar.closeMenu();
      clearFind();
      contentHome.parent.insertBefore(content, contentHome.next);
      petHome.parent.insertBefore(pet, petHome.next);
    }
    switched();
  }
  api.onWorkspace?.((v: any) => {
    apply(v);
    refreshDrag();
  });
  // v0.7.7: the title bar sometimes stopped dragging the window (it stayed where it was).
  // Chromium sends the draggable area to the window only when it changes; after the page
  // moved between the island and the app window, after a dialog or a resize it could be
  // stale. Flipping the area off and on again makes Chromium send it afresh.
  let dragTimer = 0;
  function refreshDrag() {
    if (!on) return;
    titlebar.classList.add('ws-drag-reset');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        titlebar.classList.remove('ws-drag-reset');
      }),
    );
    window.clearTimeout(dragTimer);
    dragTimer = window.setTimeout(() => {
      titlebar.classList.add('ws-drag-reset');
      requestAnimationFrame(() => requestAnimationFrame(() => titlebar.classList.remove('ws-drag-reset')));
    }, 400);
  }
  window.addEventListener('focus', refreshDrag);
  window.addEventListener('resize', () => {
    window.clearTimeout(dragTimer);
    dragTimer = window.setTimeout(refreshDrag, 250);
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshDrag());
  document.addEventListener('ws-modal-closed', refreshDrag);
  for (const id of ['settings-panel', 'sessions-panel']) document.getElementById(id)?.addEventListener('close', refreshDrag);
  // Mail explained from the island bubble while the window is open → show the chat.
  api.onMailExplain?.(() => {
    if (on) showChat();
  });
  void api.workspaceState?.().then(apply).catch(() => {});

  return { isOpen: () => on, enter, leave, showChat, showHome };
}
