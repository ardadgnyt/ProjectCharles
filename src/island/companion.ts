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
  $('city-search').onclick = () =>
    attempt(async () => {
      const button = $('city-search') as HTMLButtonElement;
      button.disabled = true;
      $('city-status').textContent = 'Aranıyor…';
      try {
        const cities = await api.weatherCities(($('city-query') as HTMLInputElement).value);
        $('city-results').replaceChildren();
        for (const city of cities) {
          const b = document.createElement('button');
          b.textContent = city.name;
          b.onclick = () =>
            attempt(async () => {
              paint(await api.companionSave({ city, setup: true }));
              setup.close();
              notice('Hava durumu konumu kaydedildi.');
            });
          $('city-results').append(b);
        }
        $('city-status').textContent = cities.length
          ? 'Bir konum seç.'
          : 'Sonuç bulunamadı. Başka bir şehir/ilçe adı dene.';
      } catch (e) {
        $('city-status').textContent = (e as Error).message;
      } finally {
        button.disabled = false;
      }
    });
  $('city-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      $('city-search').click();
      e.preventDefault();
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
  grip.addEventListener('pointerdown', (e) => {
    startY = e.screenY;
    startHeight = document.body.getBoundingClientRect().height;
    dragging = true;
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => {
    if (dragging) {
      const height = Math.max(480, Math.min(1200, startHeight + e.screenY - startY));
      grip.title = 'Yeni yükseklik: ' + height + ' px';
      void attempt(() => api.panelResize(height, false));
    }
  });
  grip.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    void attempt(() => api.panelResize(startHeight + e.screenY - startY, true));
  });
  grip.addEventListener('pointercancel', () => {
    if (dragging)
      void attempt(() => api.panelResize(document.body.getBoundingClientRect().height, true));
    dragging = false;
  });
  grip.addEventListener('keydown', (e) => {
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
    if (!value.preferences.setup) await showSetup();
  });
}
