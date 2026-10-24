export function companionUI(
  api: any,
  notice: (s: string) => void,
  attempt: any,
  isBusy: () => boolean,
) {
  const $ = (id: string) => document.getElementById(id)!;
  let snapshot: any = null;
  let weatherTurn = false;
  const setup = $('setup-panel') as HTMLDialogElement;
  function paint(value: any) {
    snapshot = value;
    const p = value.preferences;
    document.body.classList.toggle('docked-right', p.side === 'right');
    const dock = $('dock-toggle');
    dock.textContent = '›';
    dock.hidden = p.side === 'right';
    const left = document.getElementById('dock-left');
    if (left) left.hidden = p.side === 'left';
    document.body.classList.toggle('docked-left', p.side === 'left');
    dock.setAttribute('aria-label', p.side === 'left' ? 'Ortaya dön' : 'Sağ köşeye taşı');
    dock.title = dock.getAttribute('aria-label')!;
    ($('observe-apps') as HTMLInputElement).checked = p.observeApps;
    ($('auto-ai') as HTMLInputElement).checked = p.aiSuggestions;
    $('weather-location').textContent = p.city?.name || 'Şehir seçilmedi';
    const weather = document.getElementById('weather-idle');
    if (weather) {
      // "Ankara · 16° · Parçalı bulutlu 🌤️" → "🌤️ 16° · Ankara" on the island; full text in title.
      const text = value.weather?.text || '';
      const parts = text.split(' · ');
      const icon = (parts[2] || '').match(/\p{Extended_Pictographic}[\uFE0F]?/u)?.[0] || '';
      weather.textContent = text
        ? [icon, parts[1], parts[1] ? '· ' + parts[0] : parts[0]].filter(Boolean).join(' ')
        : p.city
          ? 'Hava durumu yükleniyor…'
          : 'Şehir seç';
      weather.title = text || weather.textContent;
      weather.setAttribute('aria-label', (text || weather.textContent) + ' · konumu değiştir');
    }
  }
  api.onCompanion(paint);
  // Docking: update the panel at once (optimistic), then let the main process move the
  // window. Waiting for the round trip first made the arrows feel slow.
  function dock(side: 'left' | 'center' | 'right') {
    if (snapshot) paint({ ...snapshot, preferences: { ...snapshot.preferences, side } });
    return attempt(async () => paint(await api.companionSave({ side })));
  }
  $('dock-toggle').onclick = () => dock(snapshot?.preferences.side === 'left' ? 'center' : 'right');
  const left = document.getElementById('dock-left');
  if (left) left.onclick = () => dock(snapshot?.preferences.side === 'right' ? 'center' : 'left');
  for (const [id, key] of [
    ['observe-apps', 'observeApps'],
    ['auto-ai', 'aiSuggestions'],
  ])
    $(id).onchange = () =>
      attempt(async () =>
        paint(
          await api.companionSave({
            [key]: ($(id) as HTMLInputElement).checked,
          }),
        ),
      );
  // The city dialog only works inside the large panel: on the compact island it would sit
  // outside the clickable area. Close it whenever the panel shrinks.
  api.onExpanded((expanded: boolean) => {
    if (!expanded && setup.open) setup.close();
  });
  const showSetup = async () => {
    await api.expand(true);
    const settings = $('settings-panel') as HTMLDialogElement;
    if (settings.open) settings.close();
    if (!setup.open) setup.showModal();
    const current = (await api.companionRead().catch(() => null))?.preferences?.city?.name;
    $('city-current').hidden = !current;
    $('city-current').textContent = current ? 'Şu anki konum: ' + current : '';
    ($('city-query') as HTMLInputElement).value = '';
    $('city-results').replaceChildren();
    $('city-status').textContent = '';
    $('city-query').focus();
  };
  $('weather-config').onclick = () => attempt(showSetup);
  $('setup-skip').onclick = () =>
    attempt(async () => {
      paint(await api.companionSave({ setup: true }));
      setup.close();
    });
  setup.addEventListener('cancel', (e) => {
    e.preventDefault();
    $('setup-skip').click();
  });
  // v0.7.1: a calmer city picker — results appear while typing; each row shows the place
  // and its region; the current city is shown on top.
  $('setup-close').onclick = () => $('setup-skip').click();
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchSeq = 0;
  const search = async () => {
    const query = ($('city-query') as HTMLInputElement).value.trim();
    const seq = ++searchSeq;
    if (query.length < 2) {
      $('city-results').replaceChildren();
      $('city-status').textContent = query ? 'En az iki harf yaz.' : '';
      return;
    }
    $('city-status').textContent = 'Aranıyor…';
    try {
      const cities = await api.weatherCities(query);
      if (seq !== searchSeq) return;
      $('city-results').replaceChildren();
      for (const city of cities) {
        const [place, ...rest] = String(city.name).split(', ');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'city-row';
        b.setAttribute('role', 'option');
        const pin = document.createElement('span');
        pin.className = 'city-pin';
        pin.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = place;
        const region = document.createElement('small');
        region.textContent = rest.join(', ');
        text.append(name, region);
        b.append(pin, text);
        b.onclick = () =>
          attempt(async () => {
            paint(await api.companionSave({ city, setup: true }));
            setup.close();
            notice('Hava durumu konumu kaydedildi: ' + place);
          });
        $('city-results').append(b);
      }
      $('city-status').textContent = cities.length
        ? ''
        : 'Sonuç bulunamadı. Başka bir şehir veya ilçe adı dene.';
    } catch (e) {
      if (seq === searchSeq) $('city-status').textContent = (e as Error).message;
    }
  };
  $('city-search').onclick = () => {
    clearTimeout(searchTimer);
    void search();
  };
  $('city-query').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void search(), 350);
  });
  $('city-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('city-search').click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      ($('city-results').querySelector('button') as HTMLButtonElement | null)?.focus();
    }
  });
  $('city-results').addEventListener('keydown', (e) => {
    const rows = [...$('city-results').querySelectorAll<HTMLButtonElement>('button')];
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' && i >= 0) {
      e.preventDefault();
      rows[Math.min(rows.length - 1, i + 1)].focus();
    } else if (e.key === 'ArrowUp' && i >= 0) {
      e.preventDefault();
      if (i === 0) $('city-query').focus();
      else rows[i - 1].focus();
    }
  });
  $('import-memory').onclick = () =>
    attempt(async () => {
      const text = await api.memoryImport();
      if (text) {
        ($('memory-text') as HTMLTextAreaElement).value = text;
        notice('Özeti kontrol edip Hafıza bölümündeki Kaydet düğmesine bas.');
      }
    });
  const grip = $('resize-handle');
  let startY = 0,
    startHeight = 0,
    dragging = false;
  // v0.8.10: on the notch and the card shelf the cream bar opens the chat (the panel grows
  // down); in the chat it still sets the panel height by dragging.
  const opensChat = () => !!document.body.dataset.view && document.body.dataset.view !== 'chat';
  // v0.8.15: the cream bar: on the shelf it closes the island, in the small notch it opens the
  // chat, in the chat a click closes and a drag resizes
  const barTarget = () => (document.body.dataset.view === 'shelf' ? 'notch' : 'chat');
  let opening = false;
  grip.addEventListener('pointerdown', (e) => {
    if (opensChat()) {
      opening = true;
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    startY = e.screenY;
    startHeight = document.body.getBoundingClientRect().height;
    dragging = true;
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => {
    if (dragging && Math.abs(e.screenY - startY) >= 4) {
      const height = Math.max(480, Math.min(1200, startHeight + e.screenY - startY));
      grip.title = 'Yeni yükseklik: ' + height + ' px';
      void attempt(() => api.panelResize(height, false));
    }
  });
  grip.addEventListener('pointerup', (e) => {
    if (opening) {
      opening = false;
      e.stopPropagation();
      const target = barTarget();
      void attempt(() => api.islandView(target));
      return;
    }
    if (!dragging) return;
    dragging = false;
    // v0.8.12: a click (no drag) on the cream bar of the chat folds the island into the notch
    if (Math.abs(e.screenY - startY) < 4) {
      void attempt(() => api.islandView('notch'));
      return;
    }
    void attempt(() => api.panelResize(startHeight + e.screenY - startY, true));
  });
  grip.addEventListener('click', (e) => e.stopPropagation());
  grip.addEventListener('pointercancel', () => {
    opening = false;
    if (dragging)
      void attempt(() => api.panelResize(document.body.getBoundingClientRect().height, true));
    dragging = false;
  });
  grip.addEventListener('keydown', (e) => {
    if (opensChat() && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const target = barTarget();
      void attempt(() => api.islandView(target));
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      void attempt(async () =>
        paint(
          await api.companionSave({
            height: document.body.getBoundingClientRect().height + (e.key === 'ArrowUp' ? -40 : 40),
          }),
        ),
      );
    }
  });
  setInterval(() => {
    weatherTurn = !weatherTurn;
    if (snapshot) paint(snapshot);
  }, 14000);
  void attempt(async () => {
    const value = await api.companionRead();
    paint(value);
    if (!value.preferences.setup && !value.preferences.city) await showSetup();
  });
}
