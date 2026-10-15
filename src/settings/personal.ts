export function personalUI(api: any, notice: (s: string) => void, attempt: any, react: () => void) {
  const $ = (id: string) => document.getElementById(id)!;
  const value = (id: string) => ($(id) as HTMLInputElement).value;
  let data: any;
  let editing: string | undefined;
  let mediaLoading = false;
  const btn = (text: string, fn: () => any) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.onclick = () => attempt(fn);
    return b;
  };
  function paint(next: any) {
    data = next;
    const a = data.appearance;
    document.documentElement.style.setProperty('--accent', a.accent);
    document.documentElement.style.setProperty('--chat-font', a.font + 'px');
    $('slime').style.transform = `scale(${a.pet})`;
    for (const k of ['font', 'scale', 'opacity', 'pet', 'accent'])
      ($('look-' + k) as HTMLInputElement).value = String(a[k]);
    $('memories').replaceChildren();
    for (const m of data.memories) {
      const row = document.createElement('div');
      row.className = 'utility-item';
      const p = document.createElement('p');
      p.textContent = m.text;
      row.append(
        p,
        btn('Düzenle', async () => {
          editing = m.id;
          ($('memory-text') as HTMLTextAreaElement).value = m.text;
          $('memory-text').focus();
        }),
        btn('Sil', async () => paint(await api.personalEdit('memory-delete', { id: m.id }))),
      );
      $('memories').append(row);
    }
  }
  $('memory-save').onclick = () =>
    attempt(async () => {
      paint(await api.personalEdit('memory-save', { id: editing, text: value('memory-text') }));
      editing = undefined;
      ($('memory-text') as HTMLTextAreaElement).value = '';
      notice('Hafıza kaydedildi.');
    });
  $('memory-cancel').onclick = () => {
    editing = undefined;
    ($('memory-text') as HTMLTextAreaElement).value = '';
  };
  $('look-save').onclick = () =>
    attempt(async () => {
      const args = Object.fromEntries(
        ['font', 'scale', 'opacity', 'pet', 'accent'].map((k) => [k, value('look-' + k)]),
      );
      paint(await api.personalEdit('appearance', args));
      notice('Görünüm kaydedildi.');
    });
  // v0.5.1: appearance changes apply while you move the sliders / pick the colour.
  let lookTimer: ReturnType<typeof setTimeout> | undefined;
  for (const k of ['font', 'scale', 'opacity', 'pet', 'accent'])
    $('look-' + k).addEventListener('input', () => {
      clearTimeout(lookTimer);
      lookTimer = setTimeout(
        () =>
          void attempt(async () =>
            paint(
              await api.personalEdit(
                'appearance',
                Object.fromEntries(
                  ['font', 'scale', 'opacity', 'pet', 'accent'].map((n) => [n, value('look-' + n)]),
                ),
              ),
            ),
          ),
        250,
      );
    });
  $('look-save').hidden = true;
  $('look-reset').onclick = () =>
    attempt(async () =>
      paint(
        await api.personalEdit('appearance', {
          font: 13,
          scale: 1,
          opacity: 1,
          pet: 1,
          accent: '#edc9a9',
        }),
      ),
    );
  async function screens() {
    const b = await api.boot();
    const list = $('screen-cards');
    list.replaceChildren();
    for (const d of [
      ...b.displays.map((d: any, i: number) => ({
        id: d.id,
        name: `${i + 1} · ${d.name}`,
        detail: `${d.width} × ${d.height}`,
      })),
      { id: 'primary', name: 'Ana ekran', detail: 'Windows ana ekranı' },
      { id: 'cursor', name: 'Faremin olduğu ekran', detail: 'Açılışta ve ekran değişiminde' },
    ]) {
      const button = btn(d.name, async () => {
        const current = await api.boot();
        await api.settings({ ...current.extras, screen: d.id });
        await screens();
      });
      const detail = document.createElement('small');
      detail.textContent = d.detail;
      button.append(detail);
      button.setAttribute('aria-pressed', String(b.extras.screen === d.id));
      button.className = 'screen-card' + (b.extras.screen === d.id ? ' selected' : '');
      list.append(button);
    }
  }
  $('screen-refresh').onclick = () => attempt(screens);
  const music = document.getElementById('mini-music')!;
  const progress = document.createElement('input');
  progress.id = 'music-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '0';
  progress.step = '1';
  progress.setAttribute('aria-label', 'Parçada konum');
  const times = document.createElement('small');
  times.id = 'music-time';
  times.textContent = '— / —';
  const options = document.createElement('div');
  options.className = 'music-options';
  const shuffle = btn('⤨', () => media({ action: 'shuffle', enabled: !lastMedia?.shuffle }));
  shuffle.id = 'music-shuffle';
  shuffle.setAttribute('aria-label', 'Karıştır');
  const repeat = btn('↻', () =>
    media({
      action: 'repeat',
      mode:
        lastMedia?.repeat === 'List' ? 'Track' : lastMedia?.repeat === 'Track' ? 'None' : 'List',
    }),
  );
  repeat.id = 'music-repeat';
  repeat.setAttribute('aria-label', 'Tekrar: kapalı, liste, parça');
  options.append(shuffle, repeat);
  music.append(progress, times, options);
  const showPlaybackDetails = (playing: boolean) => {
    progress.hidden = times.hidden = options.hidden = !playing;
  };
  showPlaybackDetails(false);
  let lastMedia: any = null,
    received = 0,
    seeking = false;
  const time = (n: number) =>
    Number.isFinite(n)
      ? Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0')
      : '—';
  progress.onpointerdown = () => (seeking = true);
  progress.oninput = () => {
    seeking = true;
    times.textContent = time(Number(progress.value)) + ' / ' + time(lastMedia?.duration);
  };
  progress.onchange = () => {
    seeking = false;
    void attempt(() => media({ action: 'seek', position: Number(progress.value) }));
  };
  progress.onpointerup = () => (seeking = false);
  progress.onpointercancel = () => (seeking = false);
  async function media(action: any = 'status') {
    while (mediaLoading) {
      if (action === 'status') return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    mediaLoading = true;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('#mini-music button')];
    if (action !== 'status') buttons.forEach((b) => (b.disabled = true));
    try {
      const r = await api.media(action);
      $('music-title').textContent = r.ok ? r.title || 'Spotify' : 'Spotify';
      $('music-title').title = r.title || 'Spotify';
      $('music-artist').textContent = r.ok ? r.artist || r.state : '';
      const art = document.getElementById('music-art') as HTMLImageElement;
      if (art) {
        art.hidden = !r.ok || !/^data:image\/(png|jpeg|webp);base64,/.test(r.art || '');
        if (!art.hidden) art.src = r.art;
        else art.removeAttribute('src');
      }
      showPlaybackDetails(r.ok && r.state === 'Playing');
      lastMedia = r;
      received = Date.now();
      progress.disabled = !r.ok || !r.capabilities?.seek || !(r.duration > 0);
      progress.max = String(r.duration || 0);
      if (!seeking) progress.value = String(r.position || 0);
      times.textContent =
        r.ok && r.duration > 0 ? time(r.position) + ' / ' + time(r.duration) : '— / —';
      shuffle.disabled = !r.ok || !r.capabilities?.shuffle;
      repeat.disabled = !r.ok || !r.capabilities?.repeat;
      shuffle.setAttribute('aria-pressed', String(r.shuffle === true));
      repeat.setAttribute('aria-pressed', String(r.repeat === 'List' || r.repeat === 'Track'));
      repeat.textContent = r.repeat === 'Track' ? '↻¹' : '↻';
      if (action !== 'status' && r.accepted === false)
        notice(
          'Spotify bu denetimi kabul etmedi. Uygulama veya hesap bu işlemi desteklemiyor olabilir.',
        );
      document.dispatchEvent(
        new CustomEvent('charles-music', { detail: r.ok && r.state === 'Playing' }),
      );
      $('music-play').hidden = r.ok && r.state === 'Playing';
      $('music-pause').hidden = !r.ok || r.state !== 'Playing';
      for (const id of ['music-next', 'music-previous'])
        ($(id) as HTMLButtonElement).disabled = !r.ok;
      if (!r.ok && action !== 'status')
        notice(
          'Spotify’da bir parçayı başlatıp yeniden dene. Windows etkin bir Spotify oturumu bulamadı.',
        );
    } catch (e) {
      showPlaybackDetails(false);
      throw e;
    } finally {
      mediaLoading = false;
      buttons
        .filter(
          (b) => !['music-next', 'music-previous', 'music-shuffle', 'music-repeat'].includes(b.id),
        )
        .forEach((b) => (b.disabled = false));
    }
  }
  for (const action of ['previous', 'play', 'pause', 'next'])
    $('music-' + action).onclick = () =>
      attempt(async () => {
        await media(action);
        window.setTimeout(() => void media().catch(() => {}), 200);
      });
  api.onPersonal(paint);
  api.onAlert((item: any) => {
    notice(item.title);
    react();
    void attempt(async () => paint(await api.personalRead()));
  });
  let nextPoll = 0;
  window.setInterval(() => {
    const idle =
      document.body.classList.contains('hidden-island') ||
      document.visibilityState !== 'visible' ||
      document.body.classList.contains('desktop-pet');
    if (!idle && !seeking && lastMedia?.duration > 0) {
      const pos = Math.min(
        lastMedia.duration,
        lastMedia.position + (lastMedia.state === 'Playing' ? (Date.now() - received) / 1000 : 0),
      );
      progress.value = String(pos);
      times.textContent = time(pos) + ' / ' + time(lastMedia.duration);
    }
    if (Date.now() >= nextPoll) {
      nextPoll = Date.now() + (idle ? 30000 : 3000);
      void media().catch(() => {});
    }
  }, 1000);
  api.onHidden((v: boolean) => {
    if (!v) nextPoll = 0;
  });
  const settings = $('settings-panel');
  new MutationObserver(() => {
    if (settings.hasAttribute('open')) void attempt(screens);
  }).observe(settings, { attributes: true, attributeFilter: ['open'] });
  void attempt(async () => {
    paint(await api.personalRead());
    await screens();
  });
  void media().catch(() => {});
  return {};
}
