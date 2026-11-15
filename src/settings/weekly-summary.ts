// v0.9.14: the weekly summary (Ayarlar → Haftalık özet), also shown in the island's Araçlar →
// Kullanım özeti. One builder, so both look and work the same.
// v1.0.0: redesigned. A header with the range, the computer time and Charles' AI requests each with
// a few main numbers and one daily chart, the apps, then the settings and "Nasıl hesaplanır?".
// Unknown is shown as "—" with a reason, never as 0. Loading, empty, partial and error states. It
// asks the main process only while it is on screen (IntersectionObserver), and refreshes the
// current week once a minute only then.
import { uiLanguage, type Language } from './i18n';
import { type Day, type Summary, formatCount, formatDuration, formatHours, clock, shapeSummary } from './weekly-model';

type Kid = Node | string | null | undefined | false;
function h(tag: string, cls = '', ...kids: Kid[]) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k) e.append(k);
  return e;
}
/** a value written in the UI language already: the page translator leaves it alone */
function value(tag: string, cls: string, text: string) {
  const e = h(tag, cls, text);
  e.setAttribute('translate', 'no');
  return e;
}
const DASH = '—';
const REFRESH_MS = 60000;

export function weeklySummaryUI(weekly: Element, api: any, notice: (s: string) => void) {
  void notice;
  const root = h('div', 'wsum');
  root.setAttribute('aria-live', 'polite');
  // ── header: period name and dates, the period switch, refresh ──
  const title = h('span', 'wsum-title-name', 'Bu hafta');
  const range = value('span', 'wsum-title-range', '');
  const heading = h('h3', 'wsum-title', title, range);
  let period: 'current' | 'previous' = 'current';
  const periods = h('div', 'wsum-period');
  periods.setAttribute('role', 'group');
  const periodButtons: HTMLButtonElement[] = [];
  for (const [id, text] of [
    ['current', 'Bu hafta'],
    ['previous', 'Geçen hafta'],
  ] as const) {
    const b = h('button', '', text) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.period = id;
    b.setAttribute('aria-pressed', String(id === period));
    b.onclick = () => {
      if (period === id) return;
      period = id;
      paintHeader();
      const cached = cache[period];
      if (cached) paint(cached.data, cached.at);
      else body.replaceChildren();
      void load();
    };
    periods.append(b);
    periodButtons.push(b);
  }
  const refresh = h('button', 'wsum-refresh', 'Yenile') as HTMLButtonElement;
  refresh.type = 'button';
  refresh.onclick = () => void load(true);
  const scope = h('p', 'wsum-scope');
  const head = h('div', 'wsum-head', h('div', 'wsum-head-text', heading, scope), h('div', 'wsum-head-tools', periods, refresh));
  const status = h('div', 'wsum-status');
  status.hidden = true;
  const body = h('div', 'wsum-body');
  // ── footer: the Monday notice and the explanation ──
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.onchange = () => void api.weeklyEnable(enabled.checked);
  const toggle = h('label', 'wsum-notify', enabled, h('span', '', 'Pazartesi sabahı özet göster'));
  // the saved choice is known only after the first answer: no guessed switch before it
  toggle.hidden = true;
  const details = h('details', 'wsum-how', h('summary', '', 'Nasıl hesaplanır?'));
  const how = h('ul', 'wsum-how-list');
  for (const line of [
    'Yalnızca bu bilgisayarda, Charles açıkken ölçülür. Uyku ve kilit süresi sayılmaz.',
    'Aktif kullanım için son 5 dakikada klavye veya fare hareketi gerekir; geri kalanı boşta sayılır.',
    'Uygulama süreleri 15 saniyede bir, öndeki pencereden kaydedilir. Yalnızca adlar ve süreler saklanır.',
    'AI istekleri: Charles üzerinden gönderilen her mesaj, tüm modeller birlikte. Çalışma süresi, gönderildiği andan yanıtın bittiği ana kadardır.',
    'Bu özet kalan kullanım hakkını veya maliyeti göstermez; kalan haklar AI kullanımı kartındadır.',
    'Charles kapalıyken geçen günler “—” ile gösterilir: ölçüm yoktur, sıfır değildir.',
    'Özet Pazartesi 09.00’da veya sonraki açılışta gösterilir.',
  ])
    how.append(h('li', '', line));
  details.append(how);
  const foot = h('div', 'wsum-foot', toggle, details);
  root.append(head, status, body, foot);
  weekly.append(root);

  const cache: Partial<Record<'current' | 'previous', { data: Summary; at: number }>> = {};
  let errorText = '';

  function paintHeader() {
    title.textContent = period === 'current' ? 'Bu hafta' : 'Geçen hafta';
    periodButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
    scope.replaceChildren(
      h('span', '', period === 'current' ? 'Pazartesiden bu yana' : 'Pazartesi – Pazar'),
      ' · ',
      h('span', '', 'bu bilgisayar'),
    );
  }

  function metric(label: string, text: string | null, main = false, note?: string) {
    const v = value('strong', 'wsum-metric-value' + (text === null ? ' unknown' : ''), text === null ? DASH : text);
    return h('div', 'wsum-metric' + (main ? ' main' : ''), h('span', 'wsum-metric-label', label), v, note ? h('small', 'wsum-metric-note', note) : null);
  }
  function fact(label: string, text: string | null) {
    return h('div', 'wsum-fact', h('dt', '', label), h('dd', '', value('span', text === null ? 'unknown' : '', text === null ? DASH : text)));
  }

  /** one bar per day; `part` draws the lower, brighter share of a bar (active time) */
  function chart(days: Day[], max: number, get: (d: Day) => number | null, label: (n: number) => string, axis: (n: number) => string, part?: (d: Day) => number | null) {
    const plot = h('div', 'wsum-plot');
    for (const d of days) {
      const v = get(d);
      const col = h('div', 'wsum-col');
      col.dataset.state = d.future ? 'future' : v === null ? 'none' : 'measured';
      if (d.today) col.classList.add('today');
      const track = h('div', 'wsum-track');
      if (v !== null) {
        const bar = h('div', 'wsum-bar');
        bar.style.height = (max ? Math.min(100, (v / max) * 100) : 0) + '%';
        if (v > 0) bar.classList.add('some');
        const p = part?.(d);
        if (part && p !== null && p !== undefined && v > 0) {
          const inner = h('div', 'wsum-bar-part');
          inner.style.height = Math.min(100, (p / v) * 100) + '%';
          bar.append(inner);
        }
        track.append(value('span', 'wsum-val', label(v)), bar);
      } else if (!d.future) track.append(value('span', 'wsum-val none', DASH));
      col.append(track, value('span', 'wsum-day', d.weekday));
      plot.append(col);
    }
    const ax = h('div', 'wsum-axis', value('span', '', axis(max)), value('span', '', axis(max / 2)), value('span', '', axis(0)));
    return h('div', 'wsum-chart', ax, plot);
  }
  function legend(...items: [string, string][]) {
    return h('div', 'wsum-legend', ...items.map(([cls, text]) => h('span', 'wsum-key ' + cls, h('i', ''), h('span', '', text))));
  }

  function paint(s: Summary, at: number) {
    const lang = uiLanguage() as Language;
    range.textContent = s.range;
    enabled.checked = s.enabled;
    toggle.hidden = false;
    root.dataset.state = s.empty ? 'empty' : 'ok';
    root.dataset.renders = String(Number(root.dataset.renders || 0) + 1);
    const parts: Node[] = [];
    if (s.partialSince)
      parts.push(h('p', 'wsum-note', h('span', '', 'Ölçüm bu dönemin ortasında başladı:'), ' ', value('span', '', s.partialSince), '. ', h('span', '', 'Önceki günler bilinmiyor.')));
    if (s.empty) {
      parts.push(
        h(
          'div',
          'wsum-empty',
          h('strong', '', 'Bu dönem için ölçüm yok'),
          h('p', '', s.period === 'current' ? 'Charles açık kaldıkça bilgisayar süresi ve AI istekleri burada birikir.' : 'Geçen hafta Charles hiç açık değildi ya da ölçüm daha yeni başladı.'),
        ),
      );
      body.replaceChildren(...parts);
      paintStatus(at);
      return;
    }
    const D = (n: number | null) => (n === null ? null : formatDuration(n, lang));
    const N = (n: number | null) => (n === null ? null : formatCount(n, lang));
    // computer
    const computer = h(
      'section',
      'wsum-sec',
      h('div', 'wsum-sec-head', h('h4', '', 'Bilgisayar başında'), h('small', '', 'öndeki pencereye göre')),
      h('div', 'wsum-metrics', metric('Aktif kullanım', D(s.computer.active), true), metric('Toplam süre', D(s.computer.total), true), metric('Boşta', D(s.computer.idle))),
      chart(
        s.days,
        s.computer.max,
        (d) => d.computer,
        (n) => formatHours(n, lang),
        (n) => formatHours(n, lang),
        (d) => d.active,
      ),
      legend(['active', 'Aktif'], ['idle', 'Boşta'], ['none', 'Ölçüm yok'], ['unit', 'Günlük, saat']),
    );
    parts.push(computer);
    // AI requests through Charles
    const models = s.ai.models.length
      ? h(
          'div',
          'wsum-models',
          h('h5', '', 'Modellere göre istek'),
          ...s.ai.models.slice(0, 5).map((m) =>
            h('div', 'wsum-row', value('span', 'wsum-row-name', m.name), h('span', 'wsum-row-bar', bar(m.share)), value('span', 'wsum-row-value', formatCount(m.turns, lang))),
          ),
        )
      : null;
    const ai = h(
      'section',
      'wsum-sec',
      h('div', 'wsum-sec-head', h('h4', '', 'Charles ile AI istekleri'), h('small', '', 'tüm modeller')),
      h('div', 'wsum-metrics', metric('İstekler', N(s.ai.turns), true), metric('AI çalışma süresi', D(s.ai.seconds), true), metric('Sohbetler', N(s.ai.sessions))),
      chart(
        s.days,
        s.ai.max,
        (d) => d.turns,
        (n) => formatCount(n, lang),
        (n) => formatCount(n, lang),
      ),
      legend(['active', 'İstek'], ['none', 'Ölçüm yok'], ['unit', 'Günlük, adet']),
      models,
      h(
        'dl',
        'wsum-facts',
        fact('Değişen dosyalar', N(s.ai.files)),
        fact('Eklenen satır', N(s.ai.added)),
        fact('Silinen satır', N(s.ai.removed)),
        fact('Komutlar', N(s.ai.commands)),
        fact('İzin istekleri', N(s.ai.permissions)),
        fact('En uzun sohbet', D(s.ai.longest)),
        fact('En yoğun gün', s.ai.busiestDay),
      ),
    );
    parts.push(ai);
    // apps
    const apps = h('section', 'wsum-sec', h('div', 'wsum-sec-head', h('h4', '', 'Uygulamalar ve oyunlar'), h('small', '', 'toplam · aktif')));
    if (!s.apps.length) apps.append(h('p', 'wsum-quiet', 'Bu dönem için uygulama verisi yok.'));
    for (const a of s.apps)
      apps.append(
        h(
          'div',
          'wsum-row app',
          value('span', 'wsum-row-name', a.name),
          h('span', 'wsum-row-bar', bar(a.share)),
          h('span', 'wsum-row-value', value('span', '', formatDuration(a.seconds, lang)), value('small', '', formatDuration(a.activeSeconds, lang))),
        ),
      );
    if (s.otherApps) {
      const other = h('div', 'wsum-row other', h('span', 'wsum-row-name', 'Diğer ' + s.otherApps.count + ' uygulama'), h('span', 'wsum-row-bar'), h('span', 'wsum-row-value', value('span', '', formatDuration(s.otherApps.seconds, lang))));
      apps.append(other);
    }
    parts.push(apps);
    body.replaceChildren(...parts);
    paintStatus(at);
  }
  function bar(share: number) {
    const fill = h('i', '');
    fill.style.width = Math.max(2, Math.round(share * 100)) + '%';
    return fill;
  }
  function paintStatus(at: number) {
    status.replaceChildren();
    status.hidden = !errorText;
    if (!errorText) return;
    const retry = h('button', 'wsum-retry', 'Tekrar dene') as HTMLButtonElement;
    retry.type = 'button';
    retry.onclick = () => void load(true);
    status.append(
      h('span', '', 'Yenilenemedi.'),
      ' ',
      at ? h('span', '', 'Gösterilen değerler şu saatte okundu:') : null,
      at ? ' ' : null,
      at ? value('span', '', clock(at, uiLanguage() as Language)) : null,
      retry,
    );
  }
  function paintError(message: string) {
    const retry = h('button', 'wsum-retry', 'Tekrar dene') as HTMLButtonElement;
    retry.type = 'button';
    retry.onclick = () => void load(true);
    root.dataset.state = 'error';
    status.hidden = true;
    body.replaceChildren(h('div', 'wsum-error', h('strong', '', 'Özet okunamadı'), value('p', '', message), retry));
  }
  function paintLoading() {
    root.dataset.state = 'loading';
    const rows = h('div', 'wsum-skeleton');
    for (let i = 0; i < 3; i++) rows.append(h('i', ''));
    body.replaceChildren(h('p', 'wsum-quiet', 'Yükleniyor…'), rows);
  }

  // ── loading: only while on screen ──
  let visible = false;
  let stale = true;
  let seq = 0;
  let inflight: { period: string; promise: Promise<void> } | null = null;
  let timer: number | undefined;
  async function load(force = false) {
    if (!visible) {
      // asked while hidden (a Monday push, the tools tile before it is placed): read once shown
      stale = true;
      return;
    }
    if (!force && inflight?.period === period) return inflight.promise;
    const selected = period;
    const mine = ++seq;
    const slow = window.setTimeout(() => {
      if (mine === seq && !cache[selected]) paintLoading();
    }, 250);
    root.setAttribute('aria-busy', 'true');
    const promise = (async () => {
      try {
        const raw = await api.weeklyRead(selected);
        if (mine !== seq || selected !== period) return;
        errorText = '';
        const at = Date.now();
        const data = shapeSummary(raw, uiLanguage() as Language, at);
        cache[selected] = { data, at };
        stale = false;
        paint(data, at);
      } catch (e) {
        if (mine !== seq || selected !== period) return;
        // Electron's wrapper text says nothing to the user
        errorText = ((e as Error).message || String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        const cached = cache[selected];
        if (cached) paintStatus(cached.at);
        else paintError(errorText);
      } finally {
        window.clearTimeout(slow);
        if (mine === seq) {
          root.removeAttribute('aria-busy');
          inflight = null;
        }
      }
    })();
    inflight = { period: selected, promise };
    return promise;
  }
  function schedule() {
    window.clearInterval(timer);
    timer = undefined;
    if (visible) timer = window.setInterval(() => period === 'current' && void load(), REFRESH_MS);
  }
  new IntersectionObserver((entries) => {
    const now = entries[entries.length - 1].isIntersecting;
    if (now === visible) return;
    visible = now;
    schedule();
    const cached = cache[period];
    // shown again: the current week moves on; last week only when it was never read or asked for again
    if (visible && (stale || !cached || (period === 'current' && Date.now() - cached.at > 10000))) void load();
  }).observe(root);
  paintHeader();
  return { load: () => load() };
}
