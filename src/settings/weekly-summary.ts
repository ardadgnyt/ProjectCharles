// v0.9.14: the weekly summary (Ayarlar → Haftalık özet), also shown in the island's Araçlar →
// Kullanım özeti. One builder, so both look and work the same.
import { shortSeconds } from './time-units';

export function weeklySummaryUI(weekly: Element, api: any, notice: (s: string) => void) {
  const heading = document.createElement('h3');
  heading.textContent = 'Bu hafta · şu ana kadar';
  weekly.append(heading);
  let period = 'current';
  const periods = document.createElement('div');
  periods.className = 'weekly-period';
  const periodButtons: HTMLButtonElement[] = [];
  for (const [id, text] of [
    ['current', 'Bu hafta'],
    ['previous', 'Geçen hafta'],
  ]) {
    const b = document.createElement('button');
    b.textContent = text;
    b.dataset.period = id;
    b.setAttribute('aria-pressed', String(id === period));
    b.onclick = () => {
      period = id;
      void loadSummary();
    };
    periods.append(b);
    periodButtons.push(b);
  }
  weekly.append(periods);
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  const label = document.createElement('label');
  label.className = 'weekly-notification';
  label.append(enabled, document.createTextNode('Pazartesi sabahı özet göster'));
  weekly.append(label);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Charles açıkken ölçülür. Uyku ve kilit süresi dahil edilmez.';
  weekly.append(hint);
  const details = document.createElement('details');
  details.className = 'weekly-explanation';
  const caption = document.createElement('summary');
  caption.textContent = 'Nasıl hesaplanır?';
  const explanation = document.createElement('p');
  explanation.className = 'hint';
  explanation.textContent =
    'Özet Pazartesi 09.00’da veya sonraki açılışta gösterilir. Aktif süre için son 5 dakikada klavye veya fare hareketi gerekir. Charles kapalıyken geçen süre hesaplanmaz. Uygulama süreleri 15 saniyede bir kaydedilir.';
  details.append(caption, explanation);
  weekly.append(details);
  const grid = document.createElement('div');
  grid.className = 'weekly-grid';
  weekly.append(grid);
  const apps = document.createElement('section');
  apps.className = 'weekly-apps';
  weekly.append(apps);
  // v0.7.4: hours and minutes ("72 sa 14 dk") instead of a long count of minutes
  // v0.9.10: in the UI language (settings/time-units.ts)
  const duration = (seconds: number) => shortSeconds(seconds);
  function summary(v: any) {
    heading.textContent = period === 'current' ? 'Bu hafta · şu ana kadar' : 'Geçen hafta';
    periodButtons.forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.period === period)),
    );
    enabled.checked = v.enabled;
    apps.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Uygulamalar ve oyunlar';
    apps.append(title);
    const info = document.createElement('p');
    info.className = 'hint';
    info.textContent =
      'Önde açık olan uygulamalar. Yalnızca adları ve süreleri bu bilgisayarda saklanır.';
    apps.append(info);
    for (const a of v.apps || []) {
      const row = document.createElement('div');
      row.className = 'weekly-app-row';
      const name = document.createElement('span'),
        time = document.createElement('small');
      name.textContent = a.name;
      time.textContent = duration(a.seconds) + ' · aktif ' + duration(a.activeSeconds);
      row.append(name, time);
      apps.append(row);
    }
    if (!v.apps?.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Bu dönem için henüz uygulama verisi yok.';
      apps.append(empty);
    }
    grid.replaceChildren();
    for (const [title, value] of [
      ['Bilgisayarda toplam süre', duration(v.computerSeconds || 0)],
      ['Aktif bilgisayar kullanımı', duration(v.activeSeconds || 0)],
      ['Charles işlem süresi', duration(v.seconds || 0)],
      ['Oturumlar', v.sessions],
      ['İşlemler', v.turns],
      ['Dosyalar', v.files],
      ['Eklenen satır', v.added],
      ['Silinen satır', v.removed],
      ['Komutlar', v.commands],
      ['İzin istekleri', v.permissions],
      ['En çok kullanılan ajan', v.topAgent || '—'],
      ['En yoğun gün', v.busiestDay || '—'],
      ['En uzun oturum', duration(v.longestSeconds || 0)],
    ]) {
      const card = document.createElement('div'),
        name = document.createElement('small'),
        number = document.createElement('strong');
      name.textContent = String(title);
      number.textContent = String(value);
      card.append(name, number);
      grid.append(card);
    }
  }
  let loading = false;
  async function loadSummary() {
    if (loading) return;
    loading = true;
    const selected = period;
    try {
      const v = await api.weeklyRead(selected);
      if (selected === period) summary(v);
    } catch (e) {
      notice((e as Error).message);
    } finally {
      loading = false;
    }
  }
  enabled.onchange = () => void api.weeklyEnable(enabled.checked);
  const refresh = document.createElement('button');
  refresh.textContent = 'Özeti yenile';
  refresh.onclick = () => void loadSummary();
  weekly.append(refresh);
  return { load: () => loadSummary() };
}
