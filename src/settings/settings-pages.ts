export function settingsPages(api: any) {
  const $ = (id: string) => document.getElementById(id)!;
  const header = document.querySelector('header')!;
  const center = document.createElement('div');
  center.className = 'character-center';
  center.append($('pet'), $('toggle'));
  header.append(center);
  const weather = document.createElement('button');
  weather.id = 'weather-idle';
  weather.type = 'button';
  weather.textContent = 'Hava durumu';
  weather.setAttribute('aria-label', 'Hava durumu konumunu seç');
  weather.onclick = () => $('weather-config').click();
  header.append(weather);
  const left = document.createElement('button');
  left.id = 'dock-left';
  left.textContent = '‹';
  left.setAttribute('aria-label', 'Sola taşı veya ortaya dön');
  header.append(left);
  const art = document.createElement('img');
  art.id = 'music-art';
  art.alt = 'Albüm kapağı';
  art.hidden = true;
  $('mini-music').prepend(art);
  header.addEventListener('pointerdown', (e) => {
    if (e.target === header || e.target === center) $('toggle').click();
  });
  // Keep all existing settings controls and listeners; move them into named pages.
  const body = document.querySelector('#settings-panel > .settings-body')!;
  const nodes = [...body.children];
  const nav = document.createElement('nav');
  nav.id = 'settings-categories';
  nav.setAttribute('aria-label', 'Ayar kategorileri');
  body.before(nav);
  const pages = new Map<string, HTMLElement>();
  for (const [id, label] of [
    ['general', 'Genel'],
    ['account', 'AI Modelleri'], // v0.7.1: was "Hesap"
    ['look', 'Görünüm'],
    ['memory', 'Hafıza'],
    ['access', 'Erişim'],
    ['connections', 'Eklentiler'],
    ['modules', 'Modüller'], // v0.8.0
    ['shortcuts', 'Kısayollar'],
    ['weekly', 'Haftalık özet'],
    ['performance', 'Performans'],
    ['profile', 'Hesap'], // v0.7.1: data folder and reset
  ]) {
    const page = document.createElement('div');
    page.className = 'settings-page';
    page.dataset.category = id;
    page.hidden = id !== 'general';
    body.append(page);
    pages.set(id, page);
    const b = document.createElement('button');
    b.textContent = label;
    b.type = 'button';
    b.dataset.category = id;
    b.setAttribute('aria-pressed', String(id === 'general'));
    b.onclick = () => {
      pages.forEach((p, k) => (p.hidden = k !== id));
      nav
        .querySelectorAll('button')
        .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      body.scrollTop = 0;
      if (id === 'performance')
        void api
          .performanceRead()
          .then(perfPaint)
          .catch((e: Error) => ($('perf-info').textContent = e.message));
    };
    nav.append(b);
  }
  let category = 'general';
  for (const node of nodes) {
    const heading = node.matches('h3') ? node.textContent?.trim() : '';
    if (heading === 'Hesap') category = 'account';
    else if (heading === 'Başlangıç') category = 'general';
    else if (heading === 'Bağlantılar') category = 'connections';
    let target = category;
    if (node.id === 'memory-section' || node.id === 'profile-transfer-card') target = 'memory';
    else if (node.querySelector('#access-mode')) target = 'access';
    else if (
      node.querySelector('#look-save') ||
      node.querySelector('#reaction-choice') ||
      node.querySelector('#screen-cards')
    )
      target = 'look';
    else if (node.querySelector('#weather-config')) target = 'general';
    pages.get(target)!.append(node);
  }
  const behavior = document.createElement('section');
  behavior.className = 'setting-section';
  behavior.innerHTML = '<h3>Panel davranışı ve sesler</h3>';
  for (const id of ['pref-sound', 'pref-hide', 'pref-close', 'save-prefs'])
    behavior.append($(id).closest('.row')!);
  pages.get('general')!.append(behavior);
  for (const id of ['observe-apps', 'auto-ai']) {
    const label = $(id).closest('label');
    if (label) (label as HTMLElement).hidden = true;
  }
  const intro = $('weather-config').closest('section')!;
  intro.querySelectorAll('h3,.hint').forEach((el) => {
    if (el.id !== 'weather-location' && !el.textContent?.includes('Open-Meteo')) el.remove();
  });
  const colors = document.createElement('section');
  colors.className = 'setting-section';
  colors.innerHTML = '<h3>Renkler</h3>';
  for (const [key, label, value] of [
    ['badge', 'GPT etiketi', '#edc9a9'],
    ['send', 'Gönder düğmesi', '#edc9a9'],
    ['user', 'Senin mesajların', '#241f1b'],
    ['agent', 'Charles’ın mesajları', '#121214'],
  ]) {
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = 'color';
    i.id = 'color-' + key;
    i.value = value;
    l.append(i);
    colors.append(l);
  }
  const save = document.createElement('button');
  save.textContent = 'Renkleri kaydet';
  save.id = 'colors-save';
  colors.append(save);
  const reset = document.createElement('button');
  reset.textContent = 'Varsayılana dön';
  reset.id = 'colors-reset';
  colors.append(reset);
  const note = document.createElement('p');
  note.className = 'hint';
  note.setAttribute('role', 'status');
  colors.append(note);
  pages.get('look')!.prepend(colors);
  // v0.5.2: colour pickers are no longer offered (the design system sets the colours).
  colors.hidden = true;
  document.getElementById('look-accent')?.closest('label')?.setAttribute('hidden', '');
  const paintColors = (p: any) => {
    for (const key of ['badge', 'send', 'user', 'agent']) {
      const v =
        p.colors?.[key] ||
        ({ badge: '#edc9a9', send: '#edc9a9', user: '#241f1b', agent: '#121214' } as any)[key];
      ($('color-' + key) as HTMLInputElement).value = v;
      document.documentElement.style.setProperty('--color-' + key, v);
    }
  };
  save.onclick = async () => {
    try {
      paintColors(
        await api.personalEdit(
          'colors',
          Object.fromEntries(
            ['badge', 'send', 'user', 'agent'].map((k) => [
              k,
              ($('color-' + k) as HTMLInputElement).value,
            ]),
          ),
        ),
      );
      note.textContent = 'Renkler kaydedildi.';
    } catch (e) {
      note.textContent = (e as Error).message;
    }
  };
  reset.onclick = async () => {
    try {
      paintColors(await api.personalEdit('colors', {}));
      note.textContent = 'Varsayılan renkler uygulandı.';
    } catch (e) {
      note.textContent = (e as Error).message;
    }
  };
  api.onPersonal(paintColors);
  void api.personalRead().then(paintColors);
  // Compact, single row composer; grow only while typing a long message.
  const composer = $('composer'),
    bar = document.createElement('div');
  bar.id = 'composer-bar';
  const plus = document.createElement('button');
  plus.id = 'composer-plus';
  plus.type = 'button';
  plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  plus.setAttribute('aria-label', 'Ekle ve araçlar');
  plus.setAttribute('aria-expanded', 'false');
  const call = document.createElement('button');
  call.id = 'voice-call';
  call.type = 'button';
  call.setAttribute('aria-label', 'Sesli görüşme');
  call.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4"/></svg>';
  bar.append(
    plus,
    $('prompt'),
    document.querySelector('.model-picker')!,
    $('voice-mic'),
    call,
    $('stop'),
    $('send'),
  );
  composer.append(bar);
  $('send').textContent = '↑';
  $('send').setAttribute('aria-label', 'Gönder');
  $('stop').textContent = '■';
  $('stop').setAttribute('aria-label', 'Yanıtı durdur');
  const menu = document.createElement('div');
  menu.id = 'composer-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  composer.append(menu, bar);
  const selected = document.createElement('button');
  selected.id = 'composer-task';
  selected.type = 'button';
  selected.hidden = true;
  selected.onclick = () => {
    composer.dataset.task = '';
    selected.hidden = true;
  };
  composer.insertBefore(selected, bar);
  for (const [id, label] of [
    ['attach', 'Fotoğraf ve dosya ekle'],
    ['image', 'Görsel oluştur'],
    ['web', 'Web’de arama'],
    ['research', 'Derin araştırma'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.dataset.task = id;
    b.onclick = () => {
      menu.hidden = true;
      plus.setAttribute('aria-expanded', 'false');
      if (id === 'attach') $('attach-file').click();
      else {
        composer.dataset.task = id;
        selected.textContent = label + ' ×';
        selected.hidden = false;
      }
      $('prompt').focus();
    };
    menu.append(b);
  }
  plus.onclick = () => {
    menu.hidden = !menu.hidden;
    plus.setAttribute('aria-expanded', String(!menu.hidden));
  };
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target as Node) && e.target !== plus) {
      menu.hidden = true;
      plus.setAttribute('aria-expanded', 'false');
    }
  });
  composer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      e.stopPropagation();
      menu.hidden = true;
      plus.setAttribute('aria-expanded', 'false');
    }
  });
  const text = $('prompt') as HTMLTextAreaElement;
  text.rows = 1;
  const size = () => {
    bar.classList.remove('multiline');
    text.style.height = 'auto';
    const multiline = text.scrollHeight > 40;
    bar.classList.toggle('multiline', multiline);
    text.style.height = Math.min(120, Math.max(36, text.scrollHeight)) + 'px';
  };
  text.addEventListener('input', size);
  composer.addEventListener('submit', () => setTimeout(size, 0));
  // Preserve screen capture and speech playback under General without cluttering +.
  const speech = document.createElement('section');
  speech.className = 'setting-section';
  speech.innerHTML = '<h3>Ses</h3>';
  const read = document.querySelector('.read-toggle')!;
  read.append(document.createTextNode('Yanıtları sesli oku'));
  const capture = $('capture-button');
  speech.append(read);
  capture.hidden = true;
  document.body.append(capture);
  pages.get('general')!.append(speech);
  const perf = pages.get('performance')!;
  perf.innerHTML =
    '<h3>Kaynak kullanım geçmişi</h3><label><input id="perf-enabled" type="checkbox"> Uygulama kullanımını kaydet</label><p class="hint">Charles açıkken yaklaşık dakikada bir CPU, RAM ve erişilebilen GPU verileri bu bilgisayara kaydedilir. Geçmiş 8 gün tutulur. Kaydın öncesi görülemez.</p><p id="perf-info" class="hint"></p><button id="perf-clear">Kullanım geçmişini temizle</button>';
  const perfPaint = (v: any) => {
    ($('perf-enabled') as HTMLInputElement).checked = v.enabled;
    $('perf-info').textContent =
      v.error ||
      (v.first
        ? 'Kayıt başlangıcı: ' + new Date(v.first).toLocaleString('tr-TR')
        : 'Henüz örnek yok. İzleme açıksa ilk iki ölçümden sonra kayıt oluşur.');
  };
  void api
    .performanceRead()
    .then(perfPaint)
    .catch((e: Error) => ($('perf-info').textContent = e.message));
  $('perf-enabled').onchange = () =>
    void api
      .performanceSet(($('perf-enabled') as HTMLInputElement).checked)
      .then(perfPaint)
      .catch((e: Error) => ($('perf-info').textContent = e.message));
  $('perf-clear').onclick = () => {
    const b = $('perf-clear') as HTMLButtonElement;
    if (b.dataset.confirm !== 'yes') {
      b.dataset.confirm = 'yes';
      b.textContent = 'Evet, kayıtları sil';
      return;
    }
    void api
      .performanceClear()
      .then(perfPaint)
      .catch((e: Error) => ($('perf-info').textContent = e.message));
    b.dataset.confirm = '';
    b.textContent = 'Kullanım geçmişini temizle';
  };
}
