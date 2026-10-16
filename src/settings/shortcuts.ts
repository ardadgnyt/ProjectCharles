export function shortcutsUI(api: any, notice: (s: string) => void) {
  const $ = (id: string) => document.getElementById(id)!;
  const page = document.querySelector('.settings-page[data-category=shortcuts]')!;
  const labels: Record<string, string> = {
    chat: 'Sohbeti aç',
    alert: 'Uyarıya atla',
    terminal: 'Son terminal işlemi',
    next: 'Sonraki sohbet',
    previous: 'Önceki sohbet',
    voice: 'Sesli görüşme',
    dictate: 'Dikte et',
    pet: 'Slime’ı masaüstüne gönder',
    wardrobe: 'Gardırop',
    capture: 'Ekrandan alan seç',
  };
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent =
    'Kaydet düğmesine tıkla, ardından kısayol tuşlarına birlikte bas. Esc ile vazgeç.';
  page.append(note);
  const inputs: Record<string, HTMLInputElement> = {};
  let recording: HTMLButtonElement | null = null,
    recordTimer: ReturnType<typeof setTimeout>;
  const end = () => {
    clearTimeout(recordTimer);
    if (recording) {
      recording.textContent = 'Tuşları kaydet';
      recording = null;
      void api.shortcutsRecord(false);
    }
  };
  window.addEventListener('blur', end);
  document.getElementById('settings-panel')!.addEventListener('close', end);
  for (const [id, label] of Object.entries(labels)) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const title = document.createElement('span');
    title.textContent = label;
    row.append(title);
    const input = document.createElement('input');
    input.readOnly = true;
    input.setAttribute('aria-label', label);
    input.placeholder = 'Atanmadı';
    const record = document.createElement('button');
    record.textContent = 'Tuşları kaydet';
    record.dataset.shortcut = id;
    record.onclick = async () => {
      end();
      try {
        await api.shortcutsRecord(true);
        recording = record;
        record.textContent = 'Tuşlara bas…';
        record.focus();
        recordTimer = setTimeout(end, 25000);
      } catch (e) {
        notice((e as Error).message);
      }
    };
    record.onkeydown = (e) => {
      if (recording !== record) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        end();
        return;
      }
      const key =
        (
          {
            ArrowLeft: 'Left',
            ArrowRight: 'Right',
            ArrowUp: 'Up',
            ArrowDown: 'Down',
            ' ': 'Space',
          } as any
        )[e.key] || e.key.toUpperCase();
      if (!/^[A-Z0-9]$|^F(?:[1-9]|1[0-9]|2[0-4])$|^(Left|Right|Up|Down|Space|Enter)$/.test(key))
        return;
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        notice('Ctrl, Alt veya Windows tuşuyla birlikte bir tuşa bas.');
        return;
      }
      input.value = [
        e.ctrlKey ? 'CommandOrControl' : '',
        e.altKey ? 'Alt' : '',
        e.shiftKey ? 'Shift' : '',
        e.metaKey ? 'Super' : '',
        key,
      ]
        .filter(Boolean)
        .join('+');
      end();
      notice('Kısayol yakalandı. Kısayolları kaydet düğmesiyle uygula.');
    };
    const clear = document.createElement('button');
    clear.textContent = 'Kaldır';
    clear.onclick = () => {
      end();
      input.value = '';
    };
    row.append(input, record, clear);
    page.append(row);
    inputs[id] = input;
  }
  let defaults: any;
  const paint = (v: any) => {
    defaults = v.defaults;
    for (const [id, key] of Object.entries(v.values)) {
      // Show "Ctrl" instead of Electron's long "CommandOrControl" (mapped back on save).
      inputs[id].value = String(key).replace(/CommandOrControl/g, 'Ctrl');
      inputs[id].setAttribute('aria-invalid', String(!!v.errors[id]));
      inputs[id].closest('.shortcut-row')?.classList.toggle('shortcut-conflict', !!v.errors[id]);
    }
    note.textContent = Object.keys(v.errors).length
      ? 'Başka bir uygulama kullanıyor veya Windows izin vermiyor: ' +
        Object.keys(v.errors)
          .map((id) => labels[id] || id)
          .join(', ') +
        '. İlgili satırdan farklı bir tuş birleşimi kaydet.'
      : 'Kısayollar herhangi bir uygulamadayken çalışır.';
  };
  void api.shortcutsRead().then(paint);
  const save = document.createElement('button');
  save.textContent = 'Kısayolları kaydet';
  save.onclick = () =>
    void api
      .shortcutsSave(
        Object.fromEntries(
          Object.entries(inputs).map(([id, i]) => [
            id,
            i.value.replace(/(^|\+)Ctrl(?=\+|$)/g, '$1CommandOrControl'),
          ]),
        ),
      )
      .then(paint)
      .catch((e: Error) => notice(e.message));
  const reset = document.createElement('button');
  reset.textContent = 'Varsayılana dön';
  reset.onclick = () =>
    void api
      .shortcutsSave(defaults)
      .then(paint)
      .catch((e: Error) => notice(e.message));
  page.append(save, reset);
  api.onShortcut(async (id: string) => {
    if (id === 'weekly') {
      $('settings-toggle').click();
      document.querySelector<HTMLButtonElement>('[data-category=weekly]')!.click();
    } else if (id === 'voice') $('voice-call').click();
    else if (id === 'dictate') $('voice-mic').click();
    else if (id === 'wardrobe') {
      $('settings-toggle').click();
      document.querySelector<HTMLButtonElement>('[data-category=look]')!.click();
      document.querySelector('#wardrobe')?.scrollIntoView({ block: 'center' });
    } else if (id === 'next' || id === 'previous') {
      const s = $('sessions') as HTMLSelectElement;
      if (s.options.length) {
        s.selectedIndex =
          (s.selectedIndex + (id === 'next' ? 1 : -1) + s.options.length) % s.options.length;
        s.dispatchEvent(new Event('change'));
      }
    } else if (id === 'terminal') {
      const items = document.querySelectorAll<HTMLDetailsElement>(
        '.activity[data-type=commandExecution]',
      );
      const last = items[items.length - 1];
      if (last) {
        (last.closest('.activity-group') as HTMLDetailsElement).open = true;
        last.open = true;
        last.scrollIntoView({ block: 'center' });
      } else notice('Bu sohbette terminal işlemi yok.');
    } else if (id === 'alert') {
      const target = document.querySelector<HTMLElement>('#requests:not(:empty),.message.error');
      if (target) target.scrollIntoView({ block: 'center' });
      else $('sessions-toggle').click();
    } else $('prompt').focus();
  });
  const weekly = document.querySelector('.settings-page[data-category=weekly]')!,
    heading = document.createElement('h3');
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
  const duration = (seconds: number) =>
    !seconds
      ? '0 dk'
      : seconds < 60
        ? Math.round(seconds) + ' sn'
        : seconds < 3600
          ? Math.floor(seconds / 60) + ' dk'
          : Math.floor(seconds / 3600) + ' sa ' + Math.floor((seconds % 3600) / 60) + ' dk';
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
  void loadSummary();
  document
    .querySelector<HTMLButtonElement>('button[data-category=weekly]')!
    .addEventListener('click', () => void loadSummary());
  setInterval(() => {
    if (!(weekly as HTMLElement).hidden && ($('settings-panel') as HTMLDialogElement).open) void loadSummary();
  }, 15000);
  api.onWeekly(() => {
    void loadSummary();
    notice('Haftalık özetin hazır. Ayarlar → Haftalık özet.');
  });
}
