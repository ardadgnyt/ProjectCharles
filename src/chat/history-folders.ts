export const FOLDER_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.2c0-1 .8-1.7 1.7-1.7h4.1l2 2.2h7.5c1 0 1.7.8 1.7 1.7v8.4c0 1-.8 1.7-1.7 1.7H5.2c-1 0-1.7-.8-1.7-1.7Z"/><path d="M3.5 10h17"/></svg>';

export function historyFolders(
  api: any,
  open: (id: string) => Promise<void>,
  changed: (s: any) => Promise<void>,
  notice: (text: string) => void,
) {
  const list = document.getElementById('history-list')!;
  const search = document.getElementById('history-search') as HTMLInputElement;
  let state: any = { folders: [], rooms: [], auto: true },
    current: string | null = null,
    request = 0;
  const toolbar = document.createElement('div');
  toolbar.className = 'folder-toolbar';
  list.before(toolbar);
  const breadcrumbs = document.createElement('nav');
  breadcrumbs.className = 'folder-path';
  breadcrumbs.setAttribute('aria-label', 'Klasör yolu');
  list.before(breadcrumbs);
  const run = async (fn: () => Promise<any>) => {
    try {
      await fn();
    } catch (e) {
      notice((e as Error).message);
    }
  };
  const button = (text: string, fn: () => any, label = text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.onclick = () => void run(fn);
    return b;
  };
  async function refresh() {
    const seq = ++request;
    const value = await api.foldersRead();
    if (seq !== request) return;
    state = value;
    if (current && !state.folders.some((f: any) => f.id === current)) current = null;
    paint();
  }
  async function edit(value: any) {
    state = await api.foldersEdit(value);
    paint();
  }
  function editor(container: HTMLElement, value: string, save: (name: string) => Promise<void>) {
    const input = document.createElement('input');
    input.value = value;
    input.maxLength = 60;
    input.setAttribute('aria-label', 'Klasör veya sohbet adı');
    container.replaceChildren(
      input,
      button('Kaydet', () => save(input.value)),
      button('Vazgeç', async () => paint()),
    );
    input.focus();
    input.select();
    input.onkeydown = (e) => {
      if (e.key === 'Enter') void run(() => save(input.value));
      if (e.key === 'Escape') {
        e.stopPropagation();
        paint();
      }
    };
  }
  function drop(target: HTMLElement, parentId: string | null) {
    target.ondragover = (e) => {
      if (!e.dataTransfer?.types.includes('application/x-charles-history')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      target.classList.add('drop-target');
    };
    target.ondragleave = () => target.classList.remove('drop-target');
    target.ondrop = (e) => {
      const raw = e.dataTransfer?.getData('application/x-charles-history');
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      target.classList.remove('drop-target');
      void run(async () => {
        const data = JSON.parse(raw);
        await edit(
          data.kind === 'folder'
            ? { action: 'move-folder', id: data.id, parentId }
            : { action: 'move-chat', roomId: data.id, parentId },
        );
      });
    };
  }
  function draggable(target: HTMLElement, kind: string, id: string) {
    target.draggable = true;
    target.ondragstart = (e) => {
      e.dataTransfer!.setData('application/x-charles-history', JSON.stringify({ kind, id }));
      e.dataTransfer!.effectAllowed = 'move';
    };
  }
  function destination(
    actions: HTMLElement,
    save: (id: string | null) => Promise<void>,
    exclude?: string,
  ) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Hedef klasör');
    select.add(new Option('Klasörsüz', ''));
    const path = (f: any): string => {
      const p = state.folders.find((x: any) => x.id === f.parentId);
      return p ? path(p) + ' / ' + f.name : f.name;
    };
    for (const f of state.folders.filter((f: any) => f.id !== exclude))
      select.add(new Option(path(f), f.id));
    actions.replaceChildren(
      select,
      button('Taşı', () => save(select.value || null)),
      button('Vazgeç', async () => paint()),
    );
  }
  function paint() {
    toolbar.replaceChildren();
    const create = button('+ Klasör', async () =>
      editor(toolbar, '', async (name) => edit({ action: 'create', name, parentId: current })),
    );
    const auto = document.createElement('label');
    auto.className = 'folder-auto';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = state.auto;
    check.onchange = () => void run(() => edit({ action: 'auto', enabled: check.checked }));
    auto.append(check, 'AI ile otomatik');
    const classify = button('AI ile düzenle', async () => {
      classify.disabled = true;
      classify.textContent = 'Sınıflandırılıyor…';
      try {
        const r = await api.foldersClassify();
        state = r.state;
        notice(r.message);
      } finally {
        paint();
      }
    });
    toolbar.append(create, auto, classify);
    breadcrumbs.replaceChildren();
    const root = button('Sohbetler', async () => {
      current = null;
      paint();
    });
    drop(root, null);
    breadcrumbs.append(root);
    const chain: any[] = [];
    let f = state.folders.find((f: any) => f.id === current);
    while (f) {
      chain.unshift(f);
      f = state.folders.find((x: any) => x.id === f.parentId);
    }
    for (const f of chain) {
      const b = button(f.name, async () => {
        current = f.id;
        paint();
      });
      drop(b, f.id);
      breadcrumbs.append(document.createTextNode(' / '), b);
    }
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase('tr');
    for (const f of state.folders.filter((f: any) =>
      query ? f.name.toLocaleLowerCase('tr').includes(query) : f.parentId === current,
    )) {
      const row = document.createElement('div');
      row.className = 'folder-entry';
      row.dataset.folderId = f.id;
      draggable(row, 'folder', f.id);
      drop(row, f.id);
      // v0.7.1 SpecialBeta: a folder icon (like the projects in Claude and Codex) instead of
      // the side arrow, so folders and chats are told apart at a glance.
      const enter = button('', async () => {
        current = f.id;
        search.value = '';
        paint();
      }, f.name);
      enter.className = 'folder-open';
      const icon = document.createElement('span');
      icon.className = 'folder-icon';
      icon.innerHTML = FOLDER_ICON;
      const name = document.createElement('span');
      name.className = 'folder-name';
      name.translate = false;
      name.textContent = f.name;
      enter.append(icon, name);
      const count = document.createElement('small');
      count.className = 'folder-count';
      count.textContent = String(state.rooms.filter((r: any) => r.folderId === f.id).length);
      enter.append(count);
      const actions = document.createElement('div');
      actions.className = 'utility-actions';
      actions.append(
        button(
          '⋯',
          async () => {
            actions.replaceChildren(
              button('Adlandır', async () =>
                editor(actions, f.name, async (name) => edit({ action: 'rename', id: f.id, name })),
              ),
              button('Taşı', async () =>
                destination(
                  actions,
                  (id) => edit({ action: 'move-folder', id: f.id, parentId: id }),
                  f.id,
                ),
              ),
              button('Kaldır', async () => {
                actions.replaceChildren(
                  document.createTextNode('İçerik üst klasöre taşınır.'),
                  button('Kaldır', () => edit({ action: 'delete', id: f.id })),
                  button('Vazgeç', async () => paint()),
                );
              }),
            );
          },
          f.name + ' klasör işlemleri',
        ),
      );
      row.append(enter, actions);
      list.append(row);
    }
    for (const r of state.rooms.filter((r: any) =>
      query
        ? (r.name + ' ' + r.search).toLocaleLowerCase('tr').includes(query)
        : (r.folderId || null) === current,
    )) {
      const row = document.createElement('div');
      row.className = 'history-entry' + (r.active ? ' selected' : '');
      row.dataset.roomId = r.id;
      draggable(row, 'chat', r.id);
      const b = button('', () => open(r.id));
      b.className = 'history-open';
      const title = document.createElement('strong');
      title.textContent = (r.pinned ? '★ ' : '') + r.name;
      const meta = document.createElement('small');
      const folder = state.folders.find((f: any) => f.id === r.folderId);
      meta.textContent = [
        query ? folder?.name : null,
        r.busy
          ? 'Çalışıyor'
          : new Date(r.updatedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
      ]
        .filter(Boolean)
        .join(' · ');
      b.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'utility-actions';
      const manage = async (action: string, name?: string) => {
        const result = await api.historyManage({ id: r.id, action, name });
        if (action === 'delete' && r.active) await changed(result);
        await refresh();
      };
      actions.append(
        button(
          '⋯',
          async () => {
            actions.replaceChildren(
              button('Taşı', async () =>
                destination(actions, (id) =>
                  edit({ action: 'move-chat', roomId: r.id, parentId: id }),
                ),
              ),
              button(r.pinned ? 'Ayır' : 'Sabitle', () => manage('pin')),
              button('Adlandır', async () =>
                editor(actions, r.name, (name) => manage('rename', name)),
              ),
              button('Sil', async () => {
                actions.replaceChildren(
                  button('Silmeyi onayla', () => manage('delete')),
                  button('Vazgeç', async () => paint()),
                );
              }),
            );
          },
          r.name + ' sohbet işlemleri',
        ),
      );
      row.append(b, actions);
      list.append(row);
    }
    if (!list.children.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Henüz sohbet yok. Bir sohbeti buraya taşıyabilirsin.';
      list.append(empty);
    }
  }
  search.oninput = paint;
  api.onFoldersChanged(() => void run(refresh));
  new MutationObserver(() => {
    if (document.getElementById('sessions-panel')!.hasAttribute('open')) void run(refresh);
  }).observe(document.getElementById('sessions-panel')!, {
    attributes: true,
    attributeFilter: ['open'],
  });
  return () => void run(refresh);
}
