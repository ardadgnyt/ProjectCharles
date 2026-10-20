(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const compact = new URLSearchParams(location.search).has('compact');
  if (compact) { document.body.classList.add('compact'); $('#full').hidden = true; $('#compact').hidden = false; }
  const api = window.charlesModule?.download;
  let state = { jobs: [], settings: {} }, meta = null, format = 'mp4', cut = false, filter = 'all', probing = false, lastCandidate = 0, pollBusy = false;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const bytes = n => !n ? '—' : n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
  const duration = n => { n = Math.max(0, Math.floor(n || 0)); return (n >= 3600 ? Math.floor(n / 3600) + ':' : '') + String(Math.floor(n / 60) % 60).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
  const parse = v => { if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(v.trim())) throw Error('Zamanı saniye veya SS:DD:SN biçiminde yaz.'); return v.trim().split(':').reduce((a, b) => a * 60 + Number(b), 0); };
  const stamp = n => { const whole = duration(n); const fraction = Math.round((n % 1) * 10); return whole + (fraction ? '.' + fraction : ''); };
  function notice(text) { $('#notice').textContent = text; if (compact && text) $('#compact-detail').textContent = text; }
  async function attempt(fn) { try { return await fn(); } catch (e) { notice(e.message || String(e)); } }
  const labels = { queued:'Sırada', downloading:'İndiriliyor', processing:'Kesiliyor / dönüştürülüyor', pausing:'Duraklatılıyor', paused:'Duraklatıldı', canceled:'İptal edildi', error:'İndirme başarısız', done:'Kaydedildi' };
  function renderJobs() {
    $('#count').textContent = state.jobs.length;
    const jobs = [...state.jobs].reverse().filter(j => filter === 'all' || (filter === 'done' ? j.status === 'done' : !['done', 'canceled'].includes(j.status)));
    $('#empty').hidden = jobs.length > 0;
    $('#jobs').innerHTML = jobs.map(j => {
      const details = j.status === 'error' ? j.error : [labels[j.status], j.format.toUpperCase(), j.clip ? duration(j.clip.start) + '–' + duration(j.clip.end) : '', j.bytes ? bytes(j.bytes) + (j.total && j.status !== 'done' ? ' / ' + bytes(j.total) : '') : '', j.speed ? bytes(j.speed) + '/sn' : '', j.eta ? duration(j.eta) + ' kaldı' : ''].filter(Boolean).join(' · ');
      const btn = (action, label, icon) => `<button data-id="${esc(j.id)}" data-action="${action}" title="${label}" aria-label="${label}">${icon}</button>`;
      return `<article class="job ${j.status}"><div class="job-icon">${j.status === 'done' ? '✓' : j.format === 'mp3' ? '♫' : j.clip ? '✂' : '↓'}</div><div class="job-content"><strong title="${esc(j.title)}">${esc(j.title)}</strong><small>${esc(details)}</small><div class="progress ${j.status === 'processing' ? 'processing' : ''}" role="progressbar" aria-label="${esc(j.title)}" aria-valuenow="${Math.round(j.progress)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, j.progress || 0))}%"></i></div></div><div class="job-buttons">${['downloading','queued'].includes(j.status) ? btn('pause','Duraklat','Ⅱ') : ['paused','error'].includes(j.status) ? btn('resume','Devam et','▶') : ''}${j.status === 'done' ? btn('reveal','Klasörde göster','▱') : !['canceled','pausing'].includes(j.status) ? btn('cancel','İptal et','×') : ''}</div></article>`;
    }).join('');
  }
  function renderCompact() {
    const job = [...state.jobs].reverse().find(j => ['downloading','processing','pausing','queued'].includes(j.status)) || [...state.jobs].reverse().find(j => j.status === 'done' && Date.now() - j.completedAt < 20000);
    if (state.candidate && Date.now() - state.candidate.at < 20000) {
      $('#compact-title').textContent = 'Bağlantı bulundu';
      $('#compact-detail').textContent = state.candidate.url;
      $('#compact-progress').hidden = true;
      $('#compact-pause').hidden = true;
      $('#compact-open').textContent = '↓  İndirme seçenekleri';
    } else if (job) {
      $('#compact-title').textContent = job.title;
      $('#compact-detail').textContent = labels[job.status] + ' · ' + bytes(job.bytes) + (job.speed ? ' · ' + bytes(job.speed) + '/sn' : '');
      $('#compact-progress').hidden = false;
      $('#compact-progress i').style.width = job.progress + '%';
      $('#compact-pause').hidden = !['queued','downloading'].includes(job.status);
      $('#compact-pause').dataset.id = job.id;
      $('#compact-open').textContent = job.status === 'done' ? '✓  İndirmeleri aç' : 'İndirmeleri aç';
    } else {
      $('#compact-title').textContent = 'Charles Download';
      $('#compact-detail').textContent = 'İndirmelerin hazır.';
      $('#compact-progress').hidden = true; $('#compact-pause').hidden = true;
    }
  }
  function render() {
    $('#engine').textContent = state.ready ? '● Motor hazır' : 'Araçlar eksik';
    $('#watch').checked = !!state.settings.watch;
    $('#destination').textContent = state.settings.outputDir || 'İndirmeler';
    $('#destination').title = state.settings.outputDir || '';
    if (compact) renderCompact(); else renderJobs();
    if (!compact && state.candidate && state.candidate.at !== lastCandidate && !probing) {
      lastCandidate = state.candidate.at; $('#url').value = state.candidate.url; void inspect();
    }
  }
  async function refresh() {
    if (pollBusy || !api) return;
    pollBusy = true;
    try { state = await api.state(); render(); }
    catch (e) { notice(e.message); }
    finally { pollBusy = false; }
  }
  function setFormat(value) {
    format = value;
    for (const [id, f] of [['video','mp4'],['audio','mp3'],['file','file']]) $('#' + id).classList.toggle('selected', f === format);
    $('#quality').hidden = format !== 'mp4'; $('#bitrate').hidden = format !== 'mp3';
    $('#cut-toggle').hidden = format === 'file';
    if (format === 'file') cut = false;
    $('#clip').hidden = !cut; $('#cut-toggle').classList.toggle('on', cut);
    $('#download').textContent = cut ? '↓  Kesiti kaydet' : '↓  İndirmeye başla';
    $('#selection-note').textContent = format === 'file' ? 'Bağlantıdaki dosya özgün biçimiyle kaydedilir' : format === 'mp3' ? 'MP3 olarak dönüştürülür' : 'MP4 · H.264 video + AAC ses';
  }
  async function inspect() {
    if (probing || !api) return;
    probing = true; notice('Bağlantı inceleniyor…'); $('#inspect').disabled = true;
    const url = $('#url').value.trim();
    try {
      meta = await api.inspect(url); $('#media').hidden = false;
      $('#title').textContent = meta.title; $('#source').textContent = meta.kind === 'file' ? 'DOSYA BULUNDU' : meta.kind === 'audio' ? 'SES BULUNDU' : 'VİDEO BULUNDU';
      $('#meta').textContent = [meta.author, meta.duration ? duration(meta.duration) : 'Süre bilinmiyor'].join(' · ');
      $('#cover').textContent = meta.kind === 'audio' ? '♫' : meta.kind === 'file' ? '▤' : '▶';
      const heights = meta.heights.length ? meta.heights : [1080, 720, 480];
      $('#quality').innerHTML = heights.map(h => `<option value="${Number(h)}">${Number(h)}p${h >= 2160 ? ' · 4K' : ''}</option>`).join('');
      $('#quality').value = String(heights.find(h => h <= 1080) || heights[0]);
      $('#start').value = '00:00'; $('#end').value = stamp(Math.min(meta.duration || 30, 30));
      $('#video').disabled = meta.kind === 'audio'; $('#audio').disabled = meta.kind === 'file';
      cut = false; setFormat(meta.kind === 'file' ? 'file' : meta.kind === 'audio' ? 'mp3' : 'mp4');
      syncRange(); notice('');
    } catch (e) {
      meta = null; $('#media').hidden = true; notice(e.message + ' Doğrudan dosya bağlantıları için URL’nin dosyayı işaret ettiğinden emin ol.');
    } finally { probing = false; $('#inspect').disabled = false; }
  }
  function syncRange() {
    const a = parse($('#start').value), b = parse($('#end').value), max = meta?.duration || Math.max(b, 60);
    if (b <= a || a < 0 || b > max) throw Error('Başlangıç bitişten önce, bitiş de video süresi içinde olmalı.');
    $('#start-range').max = max; $('#end-range').max = max;
    $('#start-range').value = a; $('#end-range').value = b;
    $('#selection').style.left = a / max * 100 + '%'; $('#selection').style.right = (1 - b / max) * 100 + '%';
    $('#clip-duration').textContent = stamp(b - a) + ' seçildi';
  }
  for (const id of ['start','end']) $('#' + id).addEventListener('change', () => attempt(async () => { syncRange(); notice(''); }));
  for (const id of ['start-range','end-range']) $('#' + id).addEventListener('input', () => {
    let a = Number($('#start-range').value), b = Number($('#end-range').value);
    if (a >= b) { if (id === 'start-range') a = Math.max(0, b - .1); else b = Math.min(Number($('#end-range').max), a + .1); }
    $('#start').value = stamp(a); $('#end').value = stamp(b); void attempt(async () => syncRange());
  });
  $('#link-form').addEventListener('submit', e => { e.preventDefault(); void inspect(); });
  $('#paste').onclick = () => attempt(async () => { $('#url').value = await api.clipboard(); await inspect(); });
  $('#dismiss').onclick = () => { $('#media').hidden = true; meta = null; };
  $('#video').onclick = () => setFormat('mp4'); $('#audio').onclick = () => setFormat('mp3'); $('#file').onclick = () => setFormat('file');
  $('#cut-toggle').onclick = () => { cut = !cut; setFormat(format); };
  $('#download').onclick = () => attempt(async () => {
    if (!meta) return;
    if (cut) syncRange();
    $('#download').disabled = true;
    try {
      await api.enqueue({ url: meta.url, title: meta.title, format, quality: Number($('#quality').value), bitrate: Number($('#bitrate').value), clip: cut ? { start: parse($('#start').value), end: parse($('#end').value) } : null });
      notice('İndirme kuyruğa eklendi.'); await refresh();
    } finally { $('#download').disabled = false; }
  });
  $('#watch').onchange = () => attempt(async () => { state = await api.settings({ watch: $('#watch').checked }); render(); });
  $('#folder').onclick = () => attempt(() => api.folder());
  $('#choose-folder').onclick = () => attempt(async () => { await api.chooseFolder(); await refresh(); });
  $('#jobs').onclick = e => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    void attempt(async () => { if (b.dataset.action === 'reveal') await api.reveal(b.dataset.id); else await api.control(b.dataset.id, b.dataset.action); await refresh(); });
  };
  for (const b of document.querySelectorAll('[data-filter]')) b.onclick = () => { filter = b.dataset.filter; for (const x of document.querySelectorAll('[data-filter]')) x.classList.toggle('active', x === b); renderJobs(); };
  $('#expand').onclick = $('#compact-open').onclick = () => attempt(() => api.open());
  $('#hide').onclick = () => attempt(() => api.hide());
  $('#compact-pause').onclick = () => attempt(() => api.control($('#compact-pause').dataset.id, 'pause'));
  if (!api) {
    $('#engine').textContent = 'Host eklentisi gerekli';
    notice('Charles Download altyapısı henüz yüklenmemiş. Paketteki KURULUM.md dosyasındaki tek seferlik host kurulumunu uygula ve Charles’ı yeniden başlat.');
    for (const b of document.querySelectorAll('button, input, select')) b.disabled = true;
  } else { void refresh(); setInterval(refresh, 1100); }
})();
