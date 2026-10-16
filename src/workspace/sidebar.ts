// v0.7.1 SpecialBeta: the chat list on the left of the workspace window, like the projects
// and chats in the Claude and Codex apps: new chat, search, folders ("Klasörler") that open
// in place, then the recent chats without a folder.
import { el, icon, iconButton } from './icons';
import { roomActions } from './bridge';

type Room = {
  id: string;
  name: string;
  folderId?: string | null;
  updatedAt: number;
  active?: boolean;
  pinned?: boolean;
  busy?: boolean;
  search?: string;
};
type Folder = { id: string; name: string; parentId: string | null };

export type SidebarDeps = {
  api: any;
  notice: (s: string) => void;
  /** Called after a chat was opened or created: the main area shows the chat. */
  opened: () => void;
};

export function workspaceSidebar(d: SidebarDeps) {
  const { api } = d;
  let state: { folders: Folder[]; rooms: Room[] } = { folders: [], rooms: [] };
  const openFolders = new Set<string>();
  let projectsOpen = true;
  let autoOpened = false;
  let menu: HTMLElement | null = null;
  let seq = 0;

  const card = el('section', 'ws-card ws-chats');
  const head = el('div', 'ws-card-head');
  const title = el('h2', '', 'Sohbetler');
  const compose = iconButton('compose', 'Yeni sohbet', () => void create());
  head.append(title, compose);
  const newChat = el('button', 'ws-new', icon('plus'), el('span', '', 'Yeni sohbet'));
  newChat.type = 'button';
  newChat.onclick = () => void create();
  const searchBox = el('label', 'ws-search', icon('search'));
  const search = el('input');
  search.type = 'search';
  search.placeholder = 'Sohbetlerde ara';
  search.setAttribute('aria-label', 'Sohbetlerde ara');
  searchBox.append(search);
  const tree = el('div', 'ws-tree');
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', 'Sohbetler ve projeler');
  card.append(head, newChat, searchBox, tree);

  const run = async (fn: () => Promise<any>) => {
    try {
      await fn();
    } catch (e) {
      d.notice((e as Error).message);
    }
  };
  async function create() {
    await run(async () => {
      // An empty chat is reused instead of piling up empty ones.
      const feed = document.getElementById('feed');
      if (!feed?.querySelector('.message')) {
        d.opened();
        return;
      }
      await roomActions().create();
      d.opened();
      await refresh();
    });
  }
  async function open(id: string) {
    await run(async () => {
      const r = state.rooms.find((x) => x.id === id);
      if (!r?.active) await roomActions().open(id);
      d.opened();
      await refresh();
    });
  }
  async function refresh() {
    const n = ++seq;
    const v = await api.foldersRead();
    if (n !== seq) return;
    state = { folders: v.folders || [], rooms: v.rooms || [] };
    const active = state.rooms.find((r) => r.active);
    if (active?.folderId && !autoOpened) {
      autoOpened = true;
      let f: Folder | undefined = state.folders.find((x) => x.id === active.folderId);
      while (f) {
        openFolders.add(f.id);
        f = state.folders.find((x) => x.id === f!.parentId);
      }
    }
    paint();
  }
  const edit = async (value: any) => {
    const v = await api.foldersEdit(value);
    state = { folders: v.folders || [], rooms: v.rooms || [] };
    paint();
  };

  function closeMenu() {
    menu?.remove();
    menu = null;
  }
  function popup(anchor: HTMLElement, items: [string, string, () => any][]) {
    closeMenu();
    menu = el('div', 'ws-menu');
    menu.setAttribute('role', 'menu');
    for (const [ic, label, fn] of items) {
      const b = el('button', '', icon(ic), el('span', '', label));
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.onclick = (e) => {
        e.stopPropagation();
        closeMenu();
        void run(async () => fn());
      };
      menu.append(b);
    }
    document.getElementById('workspace')!.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.min(window.innerWidth - 200, r.right - 8) + 'px';
    menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 4) + 'px';
    (menu.querySelector('button') as HTMLButtonElement | null)?.focus();
  }
  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  /** An inline text box in place of a row (rename / new folder). */
  function inline(row: HTMLElement, value: string, save: (v: string) => Promise<any>) {
    const input = el('input', 'ws-inline');
    input.value = value;
    input.maxLength = 60;
    row.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (ok && input.value.trim() && input.value.trim() !== value)
        void run(() => save(input.value.trim()));
      else paint();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(false);
      }
    };
    input.onblur = () => finish(true);
  }

  function moveTo(r: Room, anchor: HTMLElement) {
    popup(anchor, [
      ['chat', 'Klasörsüz', () => edit({ action: 'move-chat', roomId: r.id, parentId: null })],
      ...state.folders.map(
        (f) =>
          ['folder', f.name, () => edit({ action: 'move-chat', roomId: r.id, parentId: f.id })] as [
            string,
            string,
            () => any,
          ],
      ),
    ]);
  }

  function chatRow(r: Room, depth = 0) {
    const row = el('div', 'ws-row ws-chat-row' + (r.active ? ' on' : ''));
    row.style.setProperty('--depth', String(depth));
    row.setAttribute('role', 'treeitem');
    row.draggable = true;
    row.ondragstart = (e) => {
      e.dataTransfer!.setData('application/x-charles-history', JSON.stringify({ kind: 'chat', id: r.id }));
      e.dataTransfer!.effectAllowed = 'move';
    };
    const b = el('button', 'ws-row-main', icon(r.busy ? 'refresh' : 'chat', r.busy ? 'spin' : ''));
    b.type = 'button';
    const name = el('span', 'ws-row-name', (r.pinned ? '★ ' : '') + r.name);
    name.translate = false;
    b.append(name);
    b.title = r.name;
    b.onclick = () => void open(r.id);
    const more = iconButton('dots', r.name + ' · işlemler', () =>
      popup(more, [
        ['pencil', 'Adlandır', () => inline(row, r.name, (name) => api.historyManage({ id: r.id, action: 'rename', name }).then(refresh))],
        ['pin', r.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', () => api.historyManage({ id: r.id, action: 'pin' }).then(refresh)],
        ['move', 'Klasöre taşı', () => moveTo(r, more)],
        [
          'trash',
          'Sil',
          () =>
            popup(more, [
              [
                'trash',
                'Silmeyi onayla',
                async () => {
                  await api.historyManage({ id: r.id, action: 'delete' });
                  if (r.active) await roomActions().create();
                  await refresh();
                },
              ],
              ['x', 'Vazgeç', () => {}],
            ]),
        ],
      ]),
      'ws-icon ws-more',
    );
    row.append(b, more);
    return row;
  }

  function folderRow(f: Folder, depth = 0) {
    const wrap = el('div', 'ws-folder');
    const isOpen = openFolders.has(f.id) || !!search.value.trim();
    const row = el('div', 'ws-row ws-folder-row' + (isOpen ? ' open' : ''));
    row.style.setProperty('--depth', String(depth));
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-expanded', String(isOpen));
    row.ondragover = (e) => {
      if (!e.dataTransfer?.types.includes('application/x-charles-history')) return;
      e.preventDefault();
      row.classList.add('drop');
    };
    row.ondragleave = () => row.classList.remove('drop');
    row.ondrop = (e) => {
      row.classList.remove('drop');
      const raw = e.dataTransfer?.getData('application/x-charles-history');
      if (!raw) return;
      e.preventDefault();
      const data = JSON.parse(raw);
      if (data.kind === 'chat') void run(() => edit({ action: 'move-chat', roomId: data.id, parentId: f.id }));
    };
    const b = el(
      'button',
      'ws-row-main',
      icon(isOpen ? 'chevronDown' : 'chevronRight', 'ws-chevron'),
      el('span', 'ws-folder-icon', icon('folder')),
    );
    b.type = 'button';
    b.title = f.name;
    const fname = el('span', 'ws-row-name', f.name);
    fname.translate = false;
    b.append(fname);
    b.onclick = () => {
      if (openFolders.has(f.id)) openFolders.delete(f.id);
      else openFolders.add(f.id);
      paint();
    };
    const more = iconButton('dots', f.name + ' · işlemler', () =>
      popup(more, [
        ['pencil', 'Adlandır', () => inline(row, f.name, (name) => edit({ action: 'rename', id: f.id, name }))],
        ['folder', 'Alt klasör ekle', () => newFolder(f.id)],
        ['trash', 'Klasörü kaldır (sohbetler kalır)', () => edit({ action: 'delete', id: f.id })],
      ]),
      'ws-icon ws-more',
    );
    row.append(b, more);
    wrap.append(row);
    if (isOpen) {
      const kids = el('div', 'ws-kids');
      for (const sub of state.folders.filter((x) => x.parentId === f.id)) kids.append(folderRow(sub, depth + 1));
      const rooms = visibleRooms().filter((r) => r.folderId === f.id);
      for (const r of rooms) kids.append(chatRow(r, depth + 1));
      if (!kids.children.length) kids.append(el('p', 'ws-empty', 'Boş klasör. Bir sohbeti buraya sürükle.'));
      wrap.append(kids);
    }
    return wrap;
  }

  function newFolder(parentId: string | null) {
    projectsOpen = true;
    const row = el('div', 'ws-row');
    paint();
    const host = tree.querySelector('.ws-projects') as HTMLElement;
    host.prepend(row);
    inline(row, '', (name) => edit({ action: 'create', name, parentId }));
  }

  function visibleRooms() {
    const q = search.value.trim().toLocaleLowerCase('tr');
    return state.rooms
      .filter((r) => !q || (r.name + ' ' + (r.search || '')).toLocaleLowerCase('tr').includes(q))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  }

  function paint() {
    tree.replaceChildren();
    const q = search.value.trim();
    // Projects (chat folders)
    const projects = el('div', 'ws-projects');
    const folders = state.folders.filter((f) =>
      q ? visibleRooms().some((r) => r.folderId === f.id) || f.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')) : !f.parentId,
    );
    const ph = el('div', 'ws-section');
    const toggle = el('button', 'ws-section-toggle', el('span', '', 'Klasörler'));
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(projectsOpen));
    toggle.onclick = () => {
      projectsOpen = !projectsOpen;
      paint();
    };
    ph.append(toggle, iconButton('folder', 'Yeni klasör', () => newFolder(null), 'ws-icon ws-add'));
    tree.append(ph);
    if (projectsOpen) {
      for (const f of folders) projects.append(folderRow(f));
      if (!folders.length && !q) projects.append(el('p', 'ws-empty', 'Sohbetleri gruplamak için bir klasör ekle.'));
      tree.append(projects);
    }
    // Chats without a folder ("Son sohbetler"), pinned ones first
    const loose = visibleRooms().filter((r) => !r.folderId || q);
    if (loose.length) {
      tree.append(el('div', 'ws-section ws-recent', el('span', 'ws-section-title', q ? 'Bulunan sohbetler' : 'Son sohbetler')));
      for (const r of loose) tree.append(chatRow(r));
    }
    if (!loose.length && q) tree.append(el('p', 'ws-empty', 'Aramaya uyan sohbet yok.'));
  }

  search.oninput = paint;
  api.onFoldersChanged?.(() => void run(refresh));
  document.addEventListener('charles-rooms', () => void run(refresh));


  /** The active chat and its folder path, for the chat header. */
  function active() {
    const r = state.rooms.find((x) => x.active) || null;
    const path: string[] = [];
    let f = r?.folderId ? state.folders.find((x) => x.id === r.folderId) : undefined;
    while (f) {
      path.unshift(f.name);
      f = state.folders.find((x) => x.id === f!.parentId);
    }
    return { room: r, path };
  }

  return {
    element: card,
    refresh: () => run(refresh),
    closeMenu,
    active,
    popup,
    moveTo: (anchor: HTMLElement) => {
      const r = active().room;
      if (r) moveTo(r, anchor);
    },
    rename: async (name: string) => {
      const r = active().room;
      if (r) await api.historyManage({ id: r.id, action: 'rename', name });
      await refresh();
    },
    manage: async (action: string) => {
      const r = active().room;
      if (!r) return;
      await api.historyManage({ id: r.id, action });
      if (action === 'delete') await roomActions().create();
      await refresh();
    },
  };
}
