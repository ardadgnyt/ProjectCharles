// Charles Download 1.0 — one script for both views:
//   index.html            → full module window (link field, options, download list)
//   index.html?compact=1  → the card shown just under the Charles island
// Talks to Charles only through window.charlesModule.download (host bridge).
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const I = window.downloadI18n;
  const t = I.t;
  const api = window.charlesModule?.download;
  const compact = new URLSearchParams(location.search).has('compact');
  document.body.classList.add(compact ? 'compact' : 'full');
  $(compact ? '#compact' : '#full').hidden = false;

  // ---------- helpers ----------
  const ic = (n) => `<svg><use href="#i-${n}"/></svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function bytes(n) {
    n = Number(n) || 0;
    if (!n) return '';
    if (n >= 1073741824) return (n / 1073741824).toFixed(1).replace(/\.0$/, '') + ' GB';
    if (n >= 1048576) return (n >= 104857600 ? Math.round(n / 1048576) : (n / 1048576).toFixed(1).replace(/\.0$/, '')) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function clock(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    const h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60, s = n % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
  }
  function parseTime(v) {
    v = String(v).trim().replace(',', '.');
    if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(v)) throw Error(t('Zamanı saniye veya SS:DD:SN biçiminde yaz.'));
    return v.split(':').reduce((a, b) => a * 60 + Number(b), 0);
  }
  function cleanError(message) {
    let m = String(message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    m = m.split(/\r?\n/).filter(Boolean).pop() || m;
    m = m.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]+:\s*)?/i, '');
    if (/İndirme araçları eksik|kurulu değil/i.test(m)) return t('İndirme araçları (yt-dlp, FFmpeg) Charles’ta bulunamadı. Charles güncellemesi gerekiyor.');
    return m.length > 220 ? m.slice(0, 217) + '…' : m;
  }
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

  // ---------- state ----------
  let state = { jobs: [], settings: {}, ready: false, candidate: null };
  let flow = null; // { url, token, step: probe|found|quality|cut|error, meta, error, cut:{a,b,format}, busy, note }
  let lastCandidate = 0, filter = 'all', hovering = false, dragging = false, pollBusy = false;
  const thumbs = new Map(); // url -> data: URL from inspect (only kept in memory)
  const hiddenErrors = new Set();

  const kindOf = (m) => (m.kind === 'file' ? 'file' : m.kind === 'audio' ? 'audio' : 'video');
  const heightsOf = (m) => (m.heights?.length ? m.heights : [1080, 720, 480]).slice(0, 6);
  const defaultQuality = (m) => { const hs = heightsOf(m); return hs.find((h) => h <= 1080) || hs[hs.length - 1]; };
  const mp3Size = (m, kbps) => (m.duration ? m.duration * kbps * 125 : 0);

  // ---------- inspect ----------
  async function inspectURL(url) {
    for (let i = 0; ; i++) {
      try { return await api.inspect(url); }
      catch (e) {
        // An older engine refuses a second probe while one runs (e.g. card + window at once).
        if (/inceleniyor/i.test(e.message) && i < 40) { await sleep(1200); continue; }
        throw e;
      }
    }
  }
  async function startFlow(url) {
    if (!api) return;
    const token = {};
    flow = { url, token, step: 'probe' };
    drawFlow();
    try {
      const meta = await inspectURL(url);
      if (flow?.token !== token) return;
      if (meta.thumb) thumbs.set(meta.url, meta.thumb);
      flow.meta = meta;
      flow.step = 'found';
    } catch (e) {
      if (flow?.token !== token) return;
      flow.step = 'error';
      flow.error = cleanError(e.message);
    }
    drawFlow();
  }
  async function enqueue(options) {
    const m = flow?.meta;
    if (!m || flow.busy) return;
    flow.busy = true; flow.note = '';
    drawFlow();
    try {
      await api.enqueue({ url: m.url, title: m.title, quality: defaultQuality(m), bitrate: 320, ...options });
      flow = null;
      if (!compact) $('#url').value = '';
      drawFlow();
      await refresh();
    } catch (e) {
      if (!flow) return;
      flow.busy = false; flow.note = cleanError(e.message);
      drawFlow();
    }
  }

  // ---------- pieces ----------
  function tile(m, extra = '') {
    const kind = kindOf(m), th = thumbs.get(m.url) || m.thumb;
    if (kind === 'file') return `<div class="tile file">${ic('file')}${extra}</div>`;
    if (th) return `<div class="tile"><img src="${esc(th)}" alt="">${extra}</div>`;
    return `<div class="tile ${kind === 'audio' ? 'audio' : ''}">${ic(kind === 'audio' ? 'note' : 'play')}${extra}</div>`;
  }
  const xBtn = (act, label = 'Kapat', id = '') => `<button class="x" data-act="${act}" ${id ? `data-id="${esc(id)}"` : ''} title="${esc(t(label))}" aria-label="${esc(t(label))}">${ic('x')}</button>`;
  const round = (act, icon, label, id, cls = '') => `<button class="round ${cls}" data-act="${act}" data-id="${esc(id)}" title="${esc(t(label))}" aria-label="${esc(t(label))}">${ic(icon)}</button>`;

  function flowCard() {
    if (!flow) return '';
    if (flow.step === 'probe') {
      return `<div class="card"><div class="head"><div class="tile plain"><div class="spin"></div></div>
        <div class="copy"><strong>${esc(t('Bağlantı inceleniyor…'))}</strong><span class="meta">${esc(host(flow.url))}</span></div>
        ${xBtn('flow-close')}</div></div>`;
    }
    if (flow.step === 'error') {
      return `<div class="card"><div class="head"><div class="tile err">${ic('alert')}</div>
        <div class="copy"><strong>${esc(t('Bağlantı açılamadı'))}</strong><span class="meta err-text">${esc(flow.error)}</span></div>
        <div class="side"><button class="round" data-act="retry" title="${esc(t('Tekrar dene'))}" aria-label="${esc(t('Tekrar dene'))}">${ic('retry')}</button>${xBtn('flow-close')}</div></div></div>`;
    }
    if (flow.step === 'cut') return cutCard();
    const m = flow.meta, kind = kindOf(m), busy = flow.busy ? 'disabled' : '';
    const label = kind === 'file' ? 'Dosya bulundu' : kind === 'audio' ? 'Ses bulundu' : 'Video bulundu';
    const meta = !compact ? `<span class="meta">${esc([m.author, m.duration ? clock(m.duration) : kind !== 'file' ? t('Süre bilinmiyor') : ''].filter(Boolean).join(' · '))}</span>` : '';
    const open = flow.step === 'quality';
    const toolsMissing = !state.ready && kind !== 'file';
    let actions = '';
    if (kind === 'video') {
      actions = `<div class="split ${open ? 'open' : ''}"><button class="btn primary" data-act="dl-video" ${busy || (toolsMissing ? 'disabled' : '')}>${ic('down')}<span>${esc(t('Video indir'))}</span></button><button class="btn primary caret" data-act="toggle-quality" ${busy} title="${esc(t('Kalite seç'))}" aria-label="${esc(t('Kalite seç'))}" aria-expanded="${open}">${ic('chev')}</button></div>
        <button class="btn" data-act="dl-audio" ${busy || (toolsMissing ? 'disabled' : '')}>${ic('note')}<span>${esc(t('Ses indir'))}</span></button>
        ${m.duration ? `<button class="btn" data-act="open-cut" ${busy || (toolsMissing ? 'disabled' : '')}>${ic('cut')}<span>${esc(t('Video kes'))}</span></button>` : ''}`;
    } else if (kind === 'audio') {
      actions = `<div class="split ${open ? 'open' : ''}"><button class="btn primary" data-act="dl-audio" ${busy || (toolsMissing ? 'disabled' : '')}>${ic('note')}<span>${esc(t('Ses indir'))}</span></button><button class="btn primary caret" data-act="toggle-quality" ${busy} title="${esc(t('Ses kalitesi'))}" aria-label="${esc(t('Ses kalitesi'))}" aria-expanded="${open}">${ic('chev')}</button></div>
        ${m.duration ? `<button class="btn" data-act="open-cut" ${busy || (toolsMissing ? 'disabled' : '')}>${ic('cut')}<span>${esc(t('Ses kes'))}</span></button>` : ''}`;
    } else {
      actions = `<button class="btn primary" data-act="dl-file" ${busy}>${ic('down')}<span>${esc(t('Dosyayı indir'))}</span></button>`;
    }
    if (compact) actions += `<button class="btn square" data-act="open-full" title="${esc(t('Tüm seçenekler'))}" aria-label="${esc(t('Tüm seçenekler'))}">${ic('chev')}</button>`;
    const note = toolsMissing ? t('İndirme araçları (yt-dlp, FFmpeg) Charles’ta bulunamadı. Charles güncellemesi gerekiyor.') : flow.note;
    return `<div class="card"><div class="head">${tile(m)}
      <div class="copy"><strong>${esc(t(label))}</strong><span class="sub" title="${esc(m.title)}">${esc(m.title)}</span>${meta}</div>
      ${xBtn('flow-close')}</div>
      <div class="actions">${actions}</div>
      ${open ? qualityList(m, kind) : ''}
      ${note ? `<div class="inline-error">${esc(note)}</div>` : ''}</div>`;
  }

  function qualityList(m, kind) {
    const rows = [];
    if (kind === 'video') {
      const def = defaultQuality(m);
      for (const h of heightsOf(m)) {
        const tag = h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 720 ? 'HD' : '';
        rows.push(`<button class="qrow ${h === def ? 'best' : ''}" data-act="dl-video" data-q="${Number(h)}"><i class="dot"></i><span class="res">${Number(h)}p</span><span class="tag">${tag}</span><span class="fmt">· MP4</span><span class="size">${esc(bytes(m.sizes?.[h]))}</span></button>`);
      }
    }
    for (const kbps of [320, 192, 128]) {
      rows.push(`<button class="qrow audio-row ${kind === 'audio' && kbps === 320 ? 'best' : ''}" data-act="dl-audio" data-br="${kbps}"><i class="dot"></i><span class="res">${kbps}</span><span class="tag">kbps</span><span class="fmt">· MP3</span><span class="size">${esc(bytes(mp3Size(m, kbps)))}</span></button>`);
    }
    return `<div class="qlist"><div class="qhead">${ic('up')}<span>${esc(t(kind === 'video' ? 'Video kalitesi' : 'Ses kalitesi'))}</span></div>${rows.join('')}</div>`;
  }

  function cutCard() {
    const m = flow.meta, kind = kindOf(m), c = flow.cut, th = thumbs.get(m.url) || m.thumb;
    const bars = th ? '' : `<div class="bars">${Array.from({ length: 64 }, (_, i) => `<i style="height:${Math.round(22 + 70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37)))}%"></i>`).join('')}</div>`;
    const bg = th ? `style="background-image:url('${esc(th)}')"` : '';
    const chips = (kind === 'video' ? [['mp4', 'MP4 (Video)', 'play']] : []).concat([['mp3', 'MP3 (Ses)', 'note']])
      .map(([f, label, icon]) => `<button class="chip ${c.format === f ? 'on' : ''}" data-act="cut-format" data-f="${f}">${ic(icon)}<span>${esc(t(label))}</span></button>`).join('');
    return `<div class="card cut-card"><div class="head">${tile(m)}
      <div class="copy"><strong>${esc(t(kind === 'audio' ? 'Ses kes' : 'Video kes'))}</strong><span class="sub" title="${esc(m.title)}">${esc(m.title)}</span></div>
      ${xBtn('cut-back')}</div>
      <div class="tl-wrap">
        <input class="bubble" id="cut-a" value="${clock(c.a)}" aria-label="${esc(t('Başlangıç'))}">
        <input class="bubble" id="cut-b" value="${clock(c.b)}" aria-label="${esc(t('Bitiş'))}">
        <div class="tl" id="tl" ${bg}>${bars}<div class="shade l"></div><div class="shade r"></div></div>
        <div class="sel"></div>
        <div class="handle" id="h-a" role="slider" tabindex="0" aria-label="${esc(t('Kesim başlangıcı'))}"></div>
        <div class="handle" id="h-b" role="slider" tabindex="0" aria-label="${esc(t('Kesim bitişi'))}"></div>
      </div>
      <div class="cut-info"><span><b id="cut-len"></b> ${esc(t('seçildi'))}</span><span>00:00 – ${clock(m.duration)}</span></div>
      <div class="cut-actions">${chips}<button class="btn primary" data-act="cut-save" ${flow.busy || !state.ready ? 'disabled' : ''}>${ic('down')}<span>${esc(t('Kesi kaydet'))}</span></button></div>
      ${flow.note ? `<div class="inline-error">${esc(flow.note)}</div>` : ''}</div>`;
  }

  function placeCut() {
    if (flow?.step !== 'cut') return;
    const root = document.querySelector('.cut-card');
    if (!root) return;
    const d = flow.meta.duration || 1, c = flow.cut;
    const pa = (c.a / d) * 100, pb = (c.b / d) * 100;
    root.querySelector('.shade.l').style.width = pa + '%';
    root.querySelector('.shade.r').style.width = 100 - pb + '%';
    const sel = root.querySelector('.sel');
    sel.style.left = pa + '%'; sel.style.width = pb - pa + '%';
    for (const [k, p] of [['a', pa], ['b', pb]]) {
      const h = root.querySelector('#h-' + k), b = root.querySelector('#cut-' + k);
      h.style.left = p + '%';
      h.setAttribute('aria-valuemin', '0'); h.setAttribute('aria-valuemax', String(Math.round(d)));
      h.setAttribute('aria-valuenow', String(Math.round(c[k]))); h.setAttribute('aria-valuetext', clock(c[k]));
      b.style.left = p + '%';
      if (document.activeElement !== b) { b.value = clock(c[k]); b.classList.remove('bad'); }
    }
    // keep the two bubbles from overlapping
    const ba = root.querySelector('#cut-a'), bb = root.querySelector('#cut-b');
    const wrap = root.querySelector('.tl-wrap').getBoundingClientRect().width || 1;
    const gap = ((pb - pa) / 100) * wrap;
    if (gap < 70) { const push = (70 - gap) / 2; ba.style.marginLeft = -push + 'px'; bb.style.marginLeft = push + 'px'; }
    else { ba.style.marginLeft = bb.style.marginLeft = '0'; }
    root.querySelector('#cut-len').textContent = I.span(c.b - c.a);
  }
  const MIN_CLIP = 0.5;
  function setCut(k, v) {
    const c = flow.cut, d = flow.meta.duration;
    if (k === 'a') c.a = Math.max(0, Math.min(v, c.b - MIN_CLIP));
    else c.b = Math.min(d, Math.max(v, c.a + MIN_CLIP));
    placeCut();
  }
  function bindCut() {
    const root = document.querySelector('.cut-card');
    if (!root) return;
    const tl = root.querySelector('#tl');
    for (const k of ['a', 'b']) {
      const h = root.querySelector('#h-' + k);
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); h.setPointerCapture(e.pointerId); dragging = true; h.focus();
      });
      h.addEventListener('pointermove', (e) => {
        if (!h.hasPointerCapture(e.pointerId)) return;
        const r = tl.getBoundingClientRect();
        setCut(k, ((e.clientX - r.left) / r.width) * flow.meta.duration);
      });
      const end = (e) => { if (h.hasPointerCapture?.(e.pointerId)) h.releasePointerCapture(e.pointerId); dragging = false; };
      h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
      h.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 10 : 1, c = flow.cut;
        const map = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
        if (e.key in map) { e.preventDefault(); setCut(k, c[k] + map[e.key]); }
        else if (e.key === 'Home') { e.preventDefault(); setCut(k, 0); }
        else if (e.key === 'End') { e.preventDefault(); setCut(k, flow.meta.duration); }
      });
      const b = root.querySelector('#cut-' + k);
      const commit = () => {
        try { setCut(k, parseTime(b.value)); b.classList.remove('bad'); b.value = clock(flow.cut[k]); }
        catch { b.classList.add('bad'); }
      };
      b.addEventListener('change', commit);
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); b.blur(); } if (e.key === 'Escape') { b.value = clock(flow.cut[k]); b.blur(); } });
      b.addEventListener('focus', () => b.select());
    }
    // click on the strip moves the nearest handle
    tl.addEventListener('pointerdown', (e) => {
      const r = tl.getBoundingClientRect(), v = ((e.clientX - r.left) / r.width) * flow.meta.duration;
      setCut(Math.abs(v - flow.cut.a) <= Math.abs(v - flow.cut.b) ? 'a' : 'b', v);
    });
    placeCut();
  }

  // ---------- jobs ----------
  const ACTIVE = ['downloading', 'processing', 'pausing', 'queued', 'paused'];
  const labels = { queued: 'Sırada', downloading: 'İndiriliyor', pausing: 'Duraklatılıyor', paused: 'Duraklatıldı', canceled: 'İptal edildi', error: 'İndirme başarısız' };
  const jobMedia = (j) => ({ url: j.url, kind: j.format === 'file' ? 'file' : j.format === 'mp3' ? 'audio' : 'video' });
  const fileTitle = (j) => (j.format === 'file' || new RegExp('\\.' + j.format + '$', 'i').test(j.title) ? j.title : j.title + '.' + j.format);

  function jobCard(j, mode) {
    const pct = Math.max(0, Math.min(100, Number(j.progress) || 0));
    const hide = compact ? `<button class="x" data-act="hide" title="${esc(t('Gizle'))}" aria-label="${esc(t('Gizle'))}">${ic('up')}</button>` : '';
    const opener = compact ? 'class="copy click" data-act="open-full"' : 'class="copy"';
    // Clip or conversion step: the "Video kesiliyor…" card from the concept.
    if ((j.clip && ['downloading', 'processing'].includes(j.status)) || j.status === 'processing') {
      const head = j.clip ? (j.format === 'mp3' ? 'Ses kesiliyor…' : 'Video kesiliyor…') : 'Dönüştürülüyor…';
      const sub = j.clip ? `${clock(j.clip.start)} – ${clock(j.clip.end)}` : j.title;
      const segs = Array.from({ length: 6 }, (_, i) => `<i><b style="transform:scaleX(${Math.max(0, Math.min(1, (pct - (i * 100) / 6) / (100 / 6)))})"></b></i>`).join('');
      return `<div class="card job-card"><div class="head"><div class="tile plain">${ic('cut')}</div>
        <div ${opener}><strong>${esc(t(head))}</strong><span class="meta">${esc(sub)}${mode === 'list' && j.clip ? ' · ' + esc(j.title) : ''}</span></div>
        <div class="side"><span class="pct">${I.percent(pct)}</span>${hide}${xBtn('cancel', 'İptal et', j.id)}</div></div>
        <div class="segments" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100">${segs}</div></div>`;
    }
    if (j.status === 'done') {
      const what = j.format === 'file' ? 'Dosya kaydedildi' : j.format === 'mp3' ? 'Ses kaydedildi' : 'Video kaydedildi';
      const len = j.clip ? t('Klip') + ' · ' + I.span(j.clip.end - j.clip.start) : j.duration ? I.span(j.duration) : '';
      const meta = [len, bytes(j.bytes)].filter(Boolean).join(' · ');
      const strong = mode === 'list' ? fileTitle(j) : t(what);
      const sub = mode === 'list' ? t(what) + (meta ? ' · ' + meta : '') : meta;
      return `<div class="card job-card done"><div class="head">${tile(jobMedia(j), `<span class="badge">${ic('check')}</span>`)}
        <div ${opener}><strong title="${esc(j.title)}">${esc(strong)}</strong><span class="meta">${esc(sub)}</span></div>
        <div class="side">${round('reveal', 'folder', 'Klasörde göster', j.id)}${compact ? xBtn('hide') : ''}</div></div></div>`;
    }
    if (j.status === 'error') {
      return `<div class="card job-card"><div class="head"><div class="tile err">${ic('alert')}</div>
        <div ${opener}><strong title="${esc(j.title)}">${esc(fileTitle(j))}</strong><span class="meta err-text">${esc(t('İndirme başarısız'))} · ${esc(cleanError(j.error))}</span></div>
        <div class="side">${round('resume', 'retry', 'Tekrar dene', j.id)}${compact ? xBtn('dismiss-error', 'Kapat', j.id) : xBtn('cancel', 'İptal et', j.id)}</div></div></div>`;
    }
    if (j.status === 'canceled') {
      return `<div class="card job-card"><div class="head">${tile(jobMedia(j))}
        <div class="copy"><strong title="${esc(j.title)}">${esc(fileTitle(j))}</strong><span class="meta">${esc(t('İptal edildi'))}</span></div><div class="side"></div></div></div>`;
    }
    // queued / downloading / pausing / paused
    const sizes = j.bytes ? bytes(j.bytes) + (j.total ? ' / ' + bytes(j.total) : '') : '';
    const parts = j.status === 'downloading' ? [sizes || t('İndiriliyor'), j.speed ? bytes(j.speed) + '/s' : ''] : [t(labels[j.status]), sizes];
    const eta = j.status === 'downloading' && j.eta ? `<span class="eta">${esc(I.span(j.eta))}</span>` : '';
    const pauseBtn = j.status === 'paused' ? round('resume', 'play', 'Devam et', j.id) : ['queued', 'downloading'].includes(j.status) ? round('pause', 'pause', 'Duraklat', j.id) : '';
    const wait = j.status === 'downloading' && !pct ? 'wait' : j.status === 'paused' || j.status === 'pausing' ? 'paused' : '';
    return `<div class="card job-card"><div class="head">${tile(jobMedia(j))}
      <div ${opener}><strong title="${esc(j.title)}">${esc(fileTitle(j))}</strong><span class="meta">${esc(parts.filter(Boolean).join(' · '))}</span>
      <div class="bar ${wait}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div></div>
      <div class="side">${eta}${hide}${pauseBtn}${j.status !== 'pausing' ? round('cancel', 'x', 'İptal et', j.id, 'danger') : ''}</div></div></div>`;
  }

  // ---------- drawing ----------
  let lastSig = '';
  function report() {
    if (!compact) return;
    const h = Math.ceil($('#compact').getBoundingClientRect().height);
    const hold = hovering || dragging || (flow && ['probe', 'quality', 'cut'].includes(flow.step)) ? 1 : 0;
    const sig = `charles-download|h=${h}|hold=${hold}`;
    if (sig !== lastSig) { lastSig = sig; document.title = sig; }
  }
  function compactJob() {
    const jobs = [...state.jobs].reverse();
    const active = jobs.filter((j) => ACTIVE.includes(j.status)).sort((a, b) => ACTIVE.indexOf(a.status) - ACTIVE.indexOf(b.status));
    if (active.length) return { job: active[0], more: active.length - 1 };
    const done = jobs.find((j) => j.status === 'done' && Date.now() - (j.completedAt || 0) < 20000);
    if (done) return { job: done, more: 0 };
    const failed = jobs.find((j) => j.status === 'error' && Date.now() - (j.failedAt || 0) < 20000 && !hiddenErrors.has(j.id));
    return failed ? { job: failed, more: 0 } : null;
  }
  let lastCompact = '';
  function drawCompactJob() {
    if (flow) return;
    const pick = compactJob();
    let html = '';
    if (pick) {
      html = jobCard(pick.job, 'compact');
      if (pick.more > 0) html = html.replace(/<\/div>$/, `<button class="more-chip" data-act="open-full">+${pick.more} ${esc(t('indirme daha'))} ${ic('open')}</button></div>`);
    }
    if (html !== lastCompact) { lastCompact = html; $('#card').innerHTML = html; }
    report();
  }
  async function fitCheck() {
    // Older Charles hosts keep the card window at a fixed height. If a tall view does not fit,
    // continue in the full window instead of showing a clipped card.
    await sleep(380);
    if (!compact || !flow || !['quality', 'cut'].includes(flow.step)) return;
    if ($('#compact').getBoundingClientRect().height > innerHeight + 2) {
      flow = null; lastCompact = ''; $('#card').innerHTML = ''; report();
      try { await api.open(); } catch {}
    }
  }
  function drawFlow() {
    if (compact) {
      if (!flow) { lastCompact = ''; drawCompactJob(); return; }
      lastCompact = '';
      $('#card').innerHTML = flowCard();
      bindCut();
      report();
      void fitCheck();
    } else {
      $('#flow').innerHTML = flowCard();
      bindCut();
    }
  }
  let lastList = '';
  function drawJobs() {
    if (compact) return drawCompactJob();
    const all = [...state.jobs].reverse();
    const jobs = all.filter((j) => filter === 'all' || (filter === 'done' ? j.status === 'done' : ACTIVE.includes(j.status) || j.status === 'error'));
    $('#count').textContent = String(all.length);
    $('#empty').hidden = jobs.length > 0;
    const html = jobs.map((j) => jobCard(j, 'list')).join('');
    if (html !== lastList) { lastList = html; $('#jobs').innerHTML = html; }
  }
  function drawChrome() {
    if (compact) return;
    const pill = $('#engine');
    pill.className = 'pill ' + (!api ? 'bad' : state.ready ? 'ok' : 'bad');
    pill.querySelector('span').textContent = !api ? t('Host eklentisi gerekli') : state.ready ? t('Motor hazır') : t('Araçlar eksik');
    $('#watch').checked = !!state.settings.watch;
    $('#destination').textContent = state.settings.outputDir || '';
    $('#destination').title = state.settings.outputDir || '';
    const n = $('#notice');
    const text = !api ? t('Bu Charles sürümü indirme altyapısını içermiyor. Charles’ı güncelle ve yeniden başlat.')
      : !state.ready ? t('İndirme araçları (yt-dlp, FFmpeg) Charles’ta bulunamadı. Charles güncellemesi gerekiyor.') : '';
    n.textContent = text; n.hidden = !text;
  }
  function drawAll() { drawChrome(); drawFlow(); lastList = ''; drawJobs(); }

  // ---------- data ----------
  function takeCandidate() {
    const c = state.candidate;
    if (!c || c.at === lastCandidate) return;
    if (!compact && document.hidden) return; // picked up when the window is shown
    lastCandidate = c.at;
    const fresh = Date.now() - c.at < (compact ? 30000 : 90000);
    if (!fresh) return;
    if (flow && flow.url === c.url && flow.step !== 'error') return;
    if (!compact) $('#url').value = c.url;
    void startFlow(c.url);
  }
  async function refresh() {
    if (pollBusy || !api) return;
    pollBusy = true;
    try {
      const next = await api.state();
      if (next.language && next.language !== I.language) { I.setLanguage(next.language); state = next; drawAll(); }
      state = next;
      drawChrome();
      if (!dragging) drawJobs();
      takeCandidate();
    } catch (e) {
      if (!compact) { $('#notice').textContent = cleanError(e.message); $('#notice').hidden = false; }
    } finally { pollBusy = false; }
  }

  // ---------- events ----------
  async function act(name, el) {
    const id = el.dataset.id;
    switch (name) {
      case 'flow-close':
        flow = null; drawFlow();
        if (compact) await api.hide();
        return;
      case 'retry': return startFlow(flow.url);
      case 'toggle-quality': flow.step = flow.step === 'quality' ? 'found' : 'quality'; return drawFlow();
      case 'dl-video': return enqueue({ format: 'mp4', quality: Number(el.dataset.q) || defaultQuality(flow.meta) });
      case 'dl-audio': return enqueue({ format: 'mp3', bitrate: Number(el.dataset.br) || 320 });
      case 'dl-file': return enqueue({ format: 'file' });
      case 'open-cut': {
        const d = flow.meta.duration;
        const a = d > 60 ? Math.floor(d * 0.25) : 0;
        flow.cut = { a, b: Math.min(d, a + Math.max(MIN_CLIP, Math.min(30, d - a))), format: kindOf(flow.meta) === 'audio' ? 'mp3' : 'mp4' };
        flow.step = 'cut'; flow.note = '';
        return drawFlow();
      }
      case 'cut-back': flow.step = 'found'; flow.note = ''; return drawFlow();
      case 'cut-format': flow.cut.format = el.dataset.f; return drawFlow();
      case 'cut-save': {
        const c = flow.cut;
        if (!(c.b - c.a >= MIN_CLIP)) { flow.note = t('Başlangıç bitişten önce olmalı.'); return drawFlow(); }
        return enqueue({ format: c.format, clip: { start: Math.round(c.a * 10) / 10, end: Math.round(c.b * 10) / 10 } });
      }
      case 'open-full':
        if (compact) { flow = null; lastCompact = ''; $('#card').innerHTML = ''; report(); }
        return api.open();
      case 'hide': return api.hide();
      case 'dismiss-error': hiddenErrors.add(id); lastCompact = ''; drawCompactJob(); return api.hide();
      case 'pause': case 'resume': case 'cancel':
        await api.control(id, name); return refresh();
      case 'reveal': return api.reveal(id);
    }
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !api) return;
    e.preventDefault();
    act(el.dataset.act, el).catch((err) => {
      const msg = cleanError(err.message);
      if (flow) { flow.busy = false; flow.note = msg; drawFlow(); }
      else if (!compact) { $('#notice').textContent = msg; $('#notice').hidden = false; }
    });
  });

  if (compact) {
    const box = $('#compact');
    box.addEventListener('pointerenter', () => { hovering = true; report(); });
    box.addEventListener('pointerleave', () => { hovering = false; report(); });
    new ResizeObserver(report).observe(box);
    addEventListener('resize', () => placeCut());
  } else {
    $('#link-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = $('#url').value.trim();
      if (url) void startFlow(url);
    });
    $('#paste').addEventListener('click', async () => {
      try { const url = await api.clipboard(); $('#url').value = url; void startFlow(url); }
      catch (e) { $('#notice').textContent = cleanError(e.message); $('#notice').hidden = false; }
    });
    $('#watch').addEventListener('change', async () => {
      try { state = await api.settings({ watch: $('#watch').checked }); drawChrome(); } catch {}
    });
    $('#folder').addEventListener('click', () => api?.folder().catch(() => {}));
    $('#choose-folder').addEventListener('click', async () => { try { await api.chooseFolder(); await refresh(); } catch {} });
    for (const b of document.querySelectorAll('[data-filter]')) {
      b.addEventListener('click', () => {
        filter = b.dataset.filter;
        for (const x of document.querySelectorAll('[data-filter]')) x.classList.toggle('active', x === b);
        drawJobs();
      });
    }
    addEventListener('resize', () => placeCut());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) takeCandidate(); });
  }

  // ---------- start ----------
  I.apply();
  window.charlesModule?.info?.().then((info) => { if (info?.language) { I.setLanguage(info.language); drawAll(); } }).catch(() => {});
  window.charlesModule?.on?.('language', (lang) => { I.setLanguage(lang); drawAll(); });
  if (!api) {
    drawChrome();
    for (const el of document.querySelectorAll('#full button, #full input')) el.disabled = true;
  } else {
    void refresh();
    setInterval(refresh, compact ? 900 : 1100);
  }
})();
