// v0.8.0: Ayarlar → Modüller. Load a .zip module (or a folder in developer mode), confirm
// what it may do, then open it in its own window. app/modules/* does the checking.
type Mod = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  permissions: string[];
  enabled: boolean;
  dev: boolean;
  devPath: string;
  icon: string;
  error: string;
};
type Preview = {
  token: string;
  manifest: { id: string; name: string; version: string; author: string; description: string };
  permissions: { id: string; text: string; default: boolean }[];
  source: 'zip' | 'folder';
  update: { from: string; to: string; older: boolean } | null;
  files: number;
  bytes: number;
};

const PERMISSION_LABEL: Record<string, string> = {
  ai: 'Yapay zekâ',
  image: 'Görsel',
  voice: 'Ses',
  storage: 'Kendi verisi',
  slime: 'Slime',
  notify: 'Bildirim',
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string | null | false)[]) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids) if (k) n.append(k);
  return n;
}
const button = (text: string, cls = '', onclick?: () => void) => {
  const b = h('button', cls, text);
  b.type = 'button';
  if (onclick) b.onclick = onclick;
  return b;
};
const mb = (n: number) => {
  const loc = document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-GB';
  return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)).toLocaleString(loc) + ' KB' : (n / 1024 / 1024).toLocaleString(loc, { maximumFractionDigits: 1 }) + ' MB';
};

export function modulesPage(api: any, notice: (s: string) => void) {
  const page = document.querySelector<HTMLElement>('.settings-page[data-category=modules]');
  if (!page || !api.modulesList) return;

  // ── top: load ────────────────────────────────────────────────────────────────
  const intro = h('section', 'setting-section modules-intro');
  const load = button('Modül yükle', 'primary', () => void pick('zip'));
  const fromFolder = button('Klasörden yükle', '', () => void pick('folder'));
  const devBox = h('input');
  devBox.type = 'checkbox';
  devBox.id = 'modules-dev';
  const dev = h('label', 'toggle-row modules-dev', devBox, h('span', '', 'Geliştirici modu'));
  dev.title = 'Klasörden modül yükleme ve dosyalar değişince pencereyi kendiliğinden yenileme';
  intro.append(
    h('h3', '', 'Modüller'),
    h('p', 'hint', 'Modüller, Charles’a kendi penceresinde çalışan yeni araçlar ekler. Bir modül yalnızca Charles’ın izin verdiği şeyleri yapabilir: bilgisayarındaki dosyalara, programlara ve internete doğrudan erişemez.'),
    h('div', 'modules-actions', load, fromFolder, dev),
  );
  const confirmBox = h('section', 'setting-section module-confirm');
  confirmBox.hidden = true;
  const list = h('div', 'modules-list');
  page.append(intro, confirmBox, list);

  let state: { modules: Mod[]; dev: boolean; open: string[] } = { modules: [], dev: false, open: [] };
  let busy = false;

  async function refresh() {
    try {
      state = await api.modulesList();
    } catch (e) {
      notice((e as Error).message);
    }
    paint();
  }
  function paint() {
    devBox.checked = state.dev;
    fromFolder.hidden = !state.dev;
    list.replaceChildren();
    if (!state.modules.length) {
      list.append(h('p', 'modules-empty hint', 'Henüz modül yok. Bir .zip modül yükleyerek başla.'));
      return;
    }
    for (const m of state.modules) list.append(card(m));
  }
  function iconOf(m: { icon?: string; name: string }) {
    if (m.icon) {
      const img = h('img', 'module-icon');
      img.src = m.icon;
      img.alt = '';
      return img;
    }
    return h('span', 'module-icon module-icon-letter', (m.name || '?').slice(0, 1).toLocaleUpperCase('tr'));
  }
  function tags(perms: string[]) {
    const box = h('div', 'module-tags');
    for (const p of [...perms, 'storage', 'slime', 'notify']) {
      const t = h('span', 'module-tag', PERMISSION_LABEL[p] || p);
      box.append(t);
    }
    return box;
  }
  function card(m: Mod) {
    const name = h('strong', '', m.name);
    name.setAttribute('translate', 'no');
    const meta = h('small', 'module-meta', 'v' + m.version, m.author ? ' · ' : '', m.author);
    meta.setAttribute('translate', 'no');
    const desc = h('p', 'module-desc', m.description);
    desc.setAttribute('translate', 'no');
    const badges = h('span', 'module-badges');
    if (state.open.includes(m.id)) badges.append(h('span', 'module-badge on', 'Açık'));
    if (m.dev) badges.append(h('span', 'module-badge dev', 'Geliştirici'));
    const head = h('div', 'module-head', iconOf(m), h('div', 'module-title', h('div', 'module-name', name, badges), meta));
    const openB = button('Aç', 'primary', () =>
      void api.modulesOpen(m.id).then(refresh).catch((e: Error) => notice(e.message)),
    );
    openB.disabled = !m.enabled || !!m.error;
    openB.title = m.enabled ? 'Modülü kendi penceresinde aç' : 'Kapalı modüller açılamaz';
    const sw = h('input');
    sw.type = 'checkbox';
    sw.checked = m.enabled;
    sw.setAttribute('role', 'switch');
    sw.onchange = () =>
      void api
        .modulesEnable(m.id, sw.checked)
        .then(refresh)
        .catch((e: Error) => {
          sw.checked = !sw.checked;
          notice(e.message);
        });
    const swLabel = h('label', 'toggle-row module-switch', sw, h('span', '', 'Açık'));
    const removeB = button('Kaldır', 'danger', () => askRemove());
    const actions = h('div', 'module-actions', openB, swLabel, removeB);
    const box = h('section', 'setting-section module-card' + (m.enabled ? '' : ' off'), head, desc, tags(m.permissions), actions);
    if (m.dev && m.devPath) {
      const p = h('small', 'module-path', m.devPath);
      p.setAttribute('translate', 'no');
      box.insertBefore(p, actions);
    }
    if (m.error) box.insertBefore(h('p', 'module-error', m.error), actions);
    function askRemove() {
      const del = h('input');
      del.type = 'checkbox';
      const yes = button('Kaldır', 'danger', () =>
        void api
          .modulesRemove(m.id, del.checked)
          .then(() => {
            notice(del.checked ? 'Modül ve verileri kaldırıldı.' : 'Modül kaldırıldı; verileri saklandı.');
            return refresh();
          })
          .catch((e: Error) => notice(e.message)),
      );
      const no = button('Vazgeç', '', () => actions.replaceWith(fresh));
      const fresh = actions;
      const ask = h(
        'div',
        'module-actions module-remove',
        h('span', 'module-remove-q', 'Bu modül kaldırılsın mı?'),
        h('label', 'toggle-row', del, h('span', '', 'Verilerini de sil')),
        yes,
        no,
      );
      actions.replaceWith(ask);
      no.onclick = () => ask.replaceWith(fresh);
    }
    return box;
  }

  // ── load → confirm → install ─────────────────────────────────────────────────
  async function pick(kind: 'zip' | 'folder') {
    if (busy) return;
    busy = true;
    try {
      const p: Preview | null = await api.modulesPick(kind);
      if (p) showConfirm(p);
    } catch (e) {
      notice((e as Error).message);
    } finally {
      busy = false;
    }
  }
  function showConfirm(p: Preview) {
    const m = p.manifest;
    const title = h('strong', '', m.name);
    title.setAttribute('translate', 'no');
    const ver = h('small', 'module-meta', 'v' + m.version + ' · ' + m.author);
    ver.setAttribute('translate', 'no');
    const desc = h('p', 'module-desc', m.description);
    desc.setAttribute('translate', 'no');
    const kind = p.update
      ? h('p', 'module-update' + (p.update.older ? ' warn' : ''), h('span', '', p.update.older ? 'Daha eski bir sürüm yüklenecek' : 'Güncelleme'), ': v' + p.update.from + ' → v' + p.update.to + ' · ', h('span', '', 'verileri korunur'))
      : h('p', 'module-update', h('span', '', 'Yeni modül'));
    const perms = h('ul', 'module-perms');
    for (const x of p.permissions) {
      const li = h('li', x.default ? 'default' : '', h('b', '', PERMISSION_LABEL[x.id] || x.id), h('span', '', x.text));
      perms.append(li);
    }
    const install = button(p.update ? 'Güncelle' : 'Kur', 'primary', () =>
      void (async () => {
        install.disabled = true;
        try {
          const r = await api.modulesInstall(p.token);
          confirmBox.hidden = true;
          notice(r.updated ? 'Modül güncellendi.' : 'Modül kuruldu. Aç ile başlatabilirsin.');
          await refresh();
        } catch (e) {
          install.disabled = false;
          notice((e as Error).message);
        }
      })(),
    );
    const cancel = button('Vazgeç', '', () => {
      void api.modulesCancel(p.token).catch(() => {});
      confirmBox.hidden = true;
    });
    confirmBox.replaceChildren(
      h('h3', '', p.update ? 'Modülü güncelle' : 'Modülü kur'),
      h('div', 'module-head', iconOf({ name: m.name }), h('div', 'module-title', title, ver)),
      desc,
      kind,
      h('p', 'hint', 'Bu modülün yapabilecekleri:'),
      perms,
      h('p', 'hint module-size', p.source === 'folder' ? 'Klasörden (geliştirici modu)' : '.zip paketi', ' · ' + p.files + ' ', h('span', '', 'dosya'), ' · ' + mb(p.bytes)),
      h('div', 'module-actions', install, cancel),
    );
    confirmBox.hidden = false;
    confirmBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  devBox.onchange = () =>
    void api
      .modulesDev(devBox.checked)
      .then((v: boolean) => {
        state.dev = v;
        paint();
      })
      .catch((e: Error) => notice(e.message));

  api.onModulesChanged?.(() => void refresh());
  document.querySelector('#settings-categories [data-category=modules]')?.addEventListener('click', () => void refresh());
  void refresh();
}
