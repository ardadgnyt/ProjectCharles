// v0.8.0: Ayarlar → Genel → Güncellemeler. Checks GitHub Releases, shows the release notes
// and installs the update in place (app/core/updater.cjs does the work).
import { renderMarkdown } from '../chat/markdown';

type Release = {
  version: string;
  label: string;
  name: string;
  notes: string;
  url: string;
  published: string | null;
  zip: { size: number } | null;
  guessed?: boolean;
};
type Check = { current: string; currentLabel: string; latest: Release | null; available: boolean; source: string; checkedAt: number };

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string | null | false)[]) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids) if (k) n.append(k);
  return n;
}
const raw = (text: string) => {
  const s = h('span', '', text);
  s.setAttribute('translate', 'no');
  return s;
};
const LOCALES: Record<string, string> = { tr: 'tr-TR', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', zh: 'zh-CN' };
const loc = () => LOCALES[document.documentElement.lang] || 'tr-TR';
const mb = (n: number) => (n / 1048576).toLocaleString(loc(), { maximumFractionDigits: 1 }) + ' MB';

export function updatePage(api: any, notice: (s: string) => void) {
  const page = document.querySelector<HTMLElement>('.settings-page[data-category=general]');
  if (!page || !api.updateState) return;
  const section = h('section', 'setting-section update-section');
  const version = h('p', 'hint update-version');
  // v1.0.0: a neutral button; "Güncelle" is the page's one cream action when there is an update
  const checkB = h('button', '', 'Güncellemeleri denetle');
  checkB.type = 'button';
  const autoBox = h('input');
  autoBox.type = 'checkbox';
  autoBox.id = 'update-auto';
  autoBox.setAttribute('role', 'switch');
  const auto = h('label', 'toggle-row update-auto', autoBox, h('span', '', 'Açılışta otomatik denetle'));
  const status = h('p', 'hint update-status');
  status.setAttribute('role', 'status');
  const card = h('div', 'update-card');
  card.hidden = true;
  // v1.0.0: the second part of an update, a newer Electron (app/core/runtime-update.cjs): one line
  const runtime = h('div', 'update-card update-runtime');
  runtime.hidden = true;
  section.append(h('h3', '', 'Güncellemeler'), version, h('div', 'row update-actions', checkB, auto), status, runtime, card);
  // right after the language choice, at the top of Genel
  const lang = page.querySelector('#language')?.closest('section');
  if (lang) lang.after(section);
  else page.prepend(section);

  let installing = false;
  function setStatus(text: string, detail = '') {
    status.replaceChildren(h('span', '', text), detail ? raw(' (' + detail + ')') : '');
  }
  function showCard(info: Check) {
    const r = info.latest!;
    // v1.0.0: one frame (the section's): a line "Yeni sürüm: v… · date · size", the notes as a
    // plain list, a short note and the buttons; no card or notes box inside the section
    const title = h('strong', '', h('span', '', 'Yeni sürüm'), ': ', raw(r.label));
    const meta = h('span', 'update-meta');
    if (r.published) meta.append(raw(' · ' + new Date(r.published).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' })));
    if (r.zip?.size) meta.append(raw(' · ' + mb(r.zip.size)));
    const head = h('p', 'update-head', title, meta);
    const notes = h('div', 'update-notes');
    notes.setAttribute('translate', 'no');
    notes.classList.add('markdown');
    notes.innerHTML = r.notes.trim() ? renderMarkdown(r.notes.trim()) : '';
    notes.onclick = (e) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      e.preventDefault();
      void Promise.resolve(api.openLink?.(a.getAttribute('href'))).catch(() => {});
    };
    if (!r.notes.trim()) {
      notes.removeAttribute('translate');
      notes.append(h('span', 'hint', 'Değişiklik notları GitHub sayfasında.'));
    }
    const go = h('button', 'primary', 'Güncelle');
    go.type = 'button';
    const open = h('button', '', 'GitHub’da aç');
    open.type = 'button';
    open.onclick = () => void api.openLink(r.url).catch((e: Error) => notice(e.message));
    const bar = h('progress', 'update-progress');
    bar.max = 1;
    bar.hidden = true;
    const step = h('p', 'hint update-step');
    step.setAttribute('role', 'status');
    go.onclick = () => void install(go, bar, step);
    const hint = h('p', 'hint update-note', 'Charles yeniden başlar. Sohbetlerin ve ayarların korunur; sorun olursa önceki sürüme dönülür.');
    card.replaceChildren(head, notes, hint, h('div', 'row update-actions', go, open), bar, step);
    card.hidden = false;
  }
  async function check(quiet = false) {
    checkB.disabled = true;
    if (!quiet) setStatus('Denetleniyor…');
    try {
      const r = await api.updateCheck();
      if (!r.ok) {
        setStatus(r.error, r.detail);
        return;
      }
      apply(r);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      checkB.disabled = installing;
    }
  }
  function apply(r: Check) {
    if (r.available && r.latest) {
      setStatus('Yeni bir sürüm var.');
      showCard(r);
    } else {
      card.hidden = true;
      setStatus(r.latest ? 'Charles güncel.' : 'Henüz yayımlanmış bir sürüm yok.', r.latest ? r.currentLabel : '');
    }
  }
  async function install(go: HTMLButtonElement, bar: HTMLProgressElement, step: HTMLElement) {
    if (installing) return;
    installing = true;
    go.disabled = true;
    checkB.disabled = true;
    bar.hidden = false;
    bar.removeAttribute('value');
    step.replaceChildren(h('span', '', 'Hazırlanıyor…'));
    try {
      const r = await api.updateInstall();
      if (!r.ok) {
        bar.hidden = true;
        step.replaceChildren(h('span', 'update-error', r.error), r.detail ? raw(' (' + r.detail + ')') : '');
        notice(r.error);
        return;
      }
      step.replaceChildren(h('span', '', 'Charles yeniden başlatılıyor…'), raw(' ' + r.label));
    } catch (e) {
      bar.hidden = true;
      step.replaceChildren(h('span', 'update-error', (e as Error).message));
    } finally {
      installing = false;
      go.disabled = false;
      checkB.disabled = false;
    }
  }
  // v1.0.0: the second part of an update. Electron is named only as the detail in brackets.
  const RUNTIME_REASONS: Record<string, string> = {
    offline: 'İnternete bağlanılamadı; daha sonra yeniden denenecek.',
    notfound: 'Dosya şu an indirilemiyor; daha sonra yeniden denenecek.',
    failed: 'Dosya şu an indirilemiyor; daha sonra yeniden denenecek.',
    host: 'Dosya izin verilmeyen bir adresten istendi; durduruldu.',
    size: 'İndirilen dosya doğrulanamadı; silindi.',
    hash: 'İndirilen dosya doğrulanamadı; silindi.',
    disk: 'Diskte yeterli boş yer yok; en az 1 GB gerekiyor.',
    apply: 'Charles önceki hâliyle açıldı.',
  };
  type RuntimeState = { status: string; version: string; bytes: number; received?: number; total?: number; reason?: string; detail?: string; applied?: string; free?: number };
  function showRuntime(s: RuntimeState | null) {
    if (!s || s.status === 'idle' || s.status === 'not-needed') {
      runtime.hidden = true;
      runtime.replaceChildren();
      return;
    }
    const line = h('p', 'hint update-note');
    line.setAttribute('role', 'status');
    const kids: Node[] = [line];
    const electron = (v: string) => raw(' (Electron ' + v + ')');
    if (s.status === 'downloading') {
      const total = s.total || s.bytes || 0,
        got = s.received || 0;
      line.append(h('span', '', 'Güncellemenin ikinci bölümü indiriliyor…'), raw(' ' + (total ? Math.round((got / total) * 100) + '% · ' + mb(got) + ' / ' + mb(total) : mb(got))));
      const bar = h('progress', 'update-progress');
      bar.max = 1;
      if (total) bar.value = Math.min(1, got / total);
      kids.push(bar);
    } else if (s.status === 'ready') {
      line.append(h('span', '', 'Güncellemenin ikinci bölümü hazır.'), ' ', h('span', '', 'Charles yeniden başlayınca birkaç saniyede kurulur.'), electron(s.version));
      const go = h('button', 'primary', 'Şimdi yeniden başlat');
      go.type = 'button';
      go.onclick = () => {
        go.disabled = true;
        void Promise.resolve(api.runtimeRestart?.())
          .catch((e: Error) => {
            go.disabled = false;
            notice(e.message);
          });
      };
      kids.push(h('div', 'row update-actions', go));
    } else if (s.status === 'applied') {
      line.append(h('span', '', 'Güncellemenin ikinci bölümü kuruldu.'), electron(s.applied || s.version));
    } else {
      const reason = s.reason || 'failed';
      line.append(
        h('span', 'update-error', reason === 'apply' ? 'Güncellemenin ikinci bölümü kurulamadı.' : 'Güncellemenin ikinci bölümü indirilemedi.'),
        ' ',
        h('span', '', RUNTIME_REASONS[reason] || RUNTIME_REASONS.failed),
        reason === 'disk' && Number.isFinite(s.free) ? raw(' (' + mb(s.free || 0) + ')') : s.detail ? raw(' (' + s.detail + ')') : '',
      );
      const again = h('button', '', 'Yeniden dene');
      again.type = 'button';
      again.onclick = () => {
        again.disabled = true;
        void Promise.resolve(api.runtimeFetch?.())
          .catch((e: Error) => {
            again.disabled = false;
            notice(e.message);
          });
      };
      kids.push(h('div', 'row update-actions', again));
    }
    runtime.replaceChildren(...kids);
    runtime.hidden = false;
  }
  api.onRuntimeState?.((s: RuntimeState) => showRuntime(s));
  void Promise.resolve(api.runtimeState?.())
    .then((s: RuntimeState) => showRuntime(s ?? null))
    .catch(() => {});
  api.onUpdateProgress?.((p: { phase: string; received?: number; total?: number }) => {
    const bar = card.querySelector<HTMLProgressElement>('.update-progress');
    const step = card.querySelector<HTMLElement>('.update-step');
    if (!bar || !step) return;
    bar.hidden = p.phase === 'failed';
    if (p.phase === 'download') {
      const total = p.total || 0,
        got = p.received || 0;
      if (total) bar.value = Math.min(1, got / total);
      else bar.removeAttribute('value');
      step.replaceChildren(h('span', '', 'İndiriliyor…'), raw(' ' + (total ? Math.round((got / total) * 100) + '% · ' + mb(got) + ' / ' + mb(total) : mb(got))));
    } else if (p.phase === 'runtime') {
      // v1.0.0: the new version asks for a newer Electron; it comes before the restart
      const total = p.total || 0,
        got = p.received || 0;
      if (total) bar.value = Math.min(1, got / total);
      else bar.removeAttribute('value');
      step.replaceChildren(h('span', '', 'Güncellemenin ikinci bölümü indiriliyor…'), raw(' ' + (total ? Math.round((got / total) * 100) + '% · ' + mb(got) + ' / ' + mb(total) : mb(got))));
    } else if (p.phase === 'verify') {
      bar.removeAttribute('value');
      step.replaceChildren(h('span', '', 'Doğrulanıyor (SHA-256)…'));
    } else if (p.phase === 'extract') {
      bar.removeAttribute('value');
      step.replaceChildren(h('span', '', 'Dosyalar açılıyor ve denetleniyor…'));
    } else if (p.phase === 'restart') {
      bar.value = 1;
      step.replaceChildren(h('span', '', 'Charles yeniden başlatılıyor…'));
    }
  });
  api.onUpdateAvailable?.((info: Check) => {
    if (!installing) apply(info);
  });
  checkB.onclick = () => void check();
  autoBox.onchange = () =>
    void api.updateAuto(autoBox.checked).catch((e: Error) => {
      autoBox.checked = !autoBox.checked;
      notice(e.message);
    });
  void api
    .updateState()
    .then((s: any) => {
      version.replaceChildren(h('span', '', 'Yüklü sürüm'), ': ', raw(s.label + ' (' + s.current + ')'));
      autoBox.checked = !!s.autoCheck;
      if (s.last) apply(s.last);
      if (s.result && !s.result.ok) setStatus('Son güncelleme yapılamadı; önceki sürüme dönüldü.', s.result.message);
      else if (s.result) setStatus('Güncelleme tamamlandı.', s.label);
    })
    .catch(() => {});
}
