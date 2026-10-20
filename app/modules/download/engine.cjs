'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

function validURL(value) {
  if (typeof value !== 'string' || value.length > 8192) throw Error('Geçerli bir HTTP/HTTPS bağlantısı gir.');
  let u;
  try { u = new URL(value.trim()); } catch { throw Error('Bağlantı okunamadı.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('Yalnızca HTTP/HTTPS bağlantıları desteklenir.');
  return u.href;
}
function time(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw Error('Zaman sıfır veya pozitif olmalı.');
    return value;
  }
  const s = String(value ?? '').trim();
  if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(s)) throw Error('Zamanı saniye veya SS:DD:SN biçiminde yaz.');
  return s.split(':').reduce((n, part) => n * 60 + Number(part), 0);
}
function clipRange(start, end, duration) {
  const a = time(start), b = time(end);
  if (b <= a) throw Error('Bitiş zamanı başlangıçtan büyük olmalı.');
  if (duration && b > duration + 0.1) throw Error('Bitiş zamanı videonun süresini aşıyor.');
  if (b - a < 0.1) throw Error('En az 0,1 saniyelik bir bölüm seç.');
  return { start: a, end: b };
}
function safeName(value) {
  const n = String(value || 'indirme').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100);
  return !n || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(n) ? 'indirme_' + n : n;
}
function fileName(url) {
  try { return safeName(decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'dosya'); } catch { return 'dosya'; }
}
function candidateURL(value) {
  try {
    const url = validURL(value), u = new URL(url);
    const known = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|soundcloud\.com|tiktok\.com|instagram\.com|twitch\.tv|dailymotion\.com|facebook\.com|x\.com|twitter\.com|reddit\.com|bilibili\.com)$/i.test(u.hostname);
    const file = /\.(mp4|mp3|m4a|webm|mov|mkv|wav|ogg|flac|zip|7z|rar|pdf|exe|msi|iso)(?:$)/i.test(u.pathname);
    return known || file ? url : null;
  } catch { return null; }
}
function atomicJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(file + '.tmp', file);
}
function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function stopTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    kill.on('error', () => child.kill());
  } else child.kill('SIGTERM');
}
function run(binary, args, { onLine, onStderr, signal, timeout = 0, maxOutput = 8 * 1024 * 1024, onChild } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error('İşlem durduruldu.'));
    const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    onChild?.(child);
    let output = '', error = '', pending = '', settled = false, exceeded = false;
    const finish = (e) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (pending) onLine?.(pending);
      if (e) reject(e); else resolve(output);
    };
    const abort = () => stopTree(child);
    const timer = timeout ? setTimeout(() => { exceeded = true; stopTree(child); }, timeout) : null;
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.length > maxOutput) { exceeded = true; stopTree(child); return; }
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) onLine?.(line);
    });
    child.stderr.on('data', (chunk) => { error = (error + chunk).slice(-6000); onStderr?.(chunk); });
    child.on('error', finish);
    child.on('close', (code) => finish(signal?.aborted ? Error('İşlem durduruldu.') : exceeded ? Error('İşlem zaman veya çıktı sınırını aştı.') : code !== 0 ? Error(error.trim().slice(-1500) || `İşlem başarısız (${code}).`) : null));
  });
}
function ytBase(tools) {
  const args = ['--ignore-config', '--no-playlist', '--no-warnings', '--no-colors', '--socket-timeout', '25', '--retries', '3', '--ffmpeg-location', tools.ffmpeg];
  if (tools.node && fs.existsSync(tools.node)) args.push('--js-runtimes', 'node:' + tools.node);
  return args;
}
class DownloadEngine extends EventEmitter {
  constructor({ dataDir, outputDir, tools, concurrency = 2 }) {
    super();
    this.dataDir = dataDir; this.tools = tools; this.concurrency = concurrency;
    fs.mkdirSync(dataDir, { recursive: true });
    this.settings = { watch: true, outputDir, ...readJSON(path.join(dataDir, 'settings.json'), {}) };
    this.jobs = readJSON(path.join(dataDir, 'jobs.json'), []).filter(j => j && typeof j.id === 'string' && /^[a-f0-9-]{36}$/.test(j.id)).slice(-200);
    for (const j of this.jobs) if (['queued', 'downloading', 'processing', 'pausing'].includes(j.status)) j.status = 'paused';
    this.active = new Map(); this.metadata = new Map(); this.candidate = null; this.probing = false;
    this.saving = null; this.closing = false; this.save();
  }
  ready() { return ['ytdlp', 'ffmpeg'].every(k => this.tools[k] && fs.existsSync(this.tools[k])); }
  snapshot() {
    return { ready: this.ready(), settings: this.settings, candidate: this.candidate, jobs: this.jobs.map(({ etag, ...job }) => job) };
  }
  save() {
    atomicJSON(path.join(this.dataDir, 'jobs.json'), this.jobs.slice(-200));
    atomicJSON(path.join(this.dataDir, 'settings.json'), this.settings);
  }
  changed(immediate = false) {
    if (immediate) { clearTimeout(this.saving); this.saving = null; this.save(); }
    else if (!this.saving) this.saving = setTimeout(() => { this.saving = null; this.save(); }, 800);
    this.emit('change', this.snapshot());
  }
  setCandidate(url) {
    this.candidate = { url: validURL(url), at: Date.now() }; this.changed();
    this.emit('offer', this.candidate);
  }
  setSettings(value) {
    if (typeof value?.watch === 'boolean') this.settings.watch = value.watch;
    // outputDir is set only through the native folder picker by the bridge.
    if (typeof value?.outputDir === 'string' && path.isAbsolute(value.outputDir)) {
      fs.mkdirSync(value.outputDir, { recursive: true }); this.settings.outputDir = value.outputDir;
    }
    this.changed(true); return this.snapshot();
  }
  async inspect(raw) {
    const url = validURL(raw);
    if (this.metadata.has(url)) return this.metadata.get(url);
    if (this.probing) throw Error('Önceki bağlantı inceleniyor; biraz bekle.');
    if (!this.ready()) throw Error('İndirme araçları eksik. Kurulum klasöründe npm run setup:tools komutunu çalıştır.');
    this.probing = true;
    try {
      const result = await run(this.tools.ytdlp, [...ytBase(this.tools), '--dump-single-json', '--skip-download', '--', url], { timeout: 75000 });
      const info = JSON.parse(result);
      if (info.is_live) throw Error('Canlı yayınlar bu sürümde desteklenmiyor; tamamlanan bir video seç.');
      const formats = Array.isArray(info.formats) ? info.formats : [];
      const heights = [...new Set(formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height).map(f => f.height))].sort((a, b) => b - a);
      const audioOnly = !heights.length && (info.vcodec === 'none' || /^(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(info.ext || ''));
      const meta = { url, title: String(info.title || fileName(url)).slice(0, 300), duration: Number(info.duration) || 0, author: String(info.uploader || info.extractor_key || new URL(url).hostname).slice(0, 150), heights, kind: audioOnly ? 'audio' : 'video' };
      // Generic direct-media responses often lack codecs/duration. Probe only recognized
      // direct HTTP media URLs, never arbitrary pages or local paths.
      if (!meta.duration && /\.(mp4|webm|mov|mkv|mp3|m4a|wav|ogg|flac)$/i.test(new URL(url).pathname)) {
        let diagnostics = '';
        try {
          await run(this.tools.ffmpeg, ['-hide_banner', '-nostdin', '-i', url, '-t', '0', '-f', 'null', '-'], { timeout: 20000, onStderr: text => { diagnostics = (diagnostics + text).slice(-12000); } });
        } catch {} // Metadata is optional; downloading can still succeed without it.
        const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(diagnostics);
        if (durationMatch) meta.duration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
        const videoMatch = /Video:.*?,\s*(\d{2,5})x(\d{2,5})\b/.exec(diagnostics);
        if (videoMatch) { meta.kind = 'video'; meta.heights = [Number(videoMatch[2])]; }
        else if (/Audio:/.test(diagnostics) && !/Video:/.test(diagnostics)) meta.kind = 'audio';
      }
      if (this.metadata.size > 50) this.metadata.delete(this.metadata.keys().next().value);
      this.metadata.set(url, meta); return meta;
    } catch (e) {
      // A direct binary file (ZIP, PDF, etc.) is intentionally handled by our HTTP downloader.
      if (/\.(zip|7z|rar|pdf|exe|msi|iso)(?:$)/i.test(new URL(url).pathname)) return { url, title: fileName(url), duration: 0, author: new URL(url).hostname, heights: [], kind: 'file' };
      throw e;
    } finally { this.probing = false; }
  }
  enqueue(input) {
    const url = validURL(input?.url);
    const format = input?.format;
    if (!['mp4', 'mp3', 'file'].includes(format)) throw Error('MP4, MP3 veya dosya biçimini seç.');
    if (format !== 'file' && !this.ready()) throw Error('yt-dlp / FFmpeg kurulu değil.');
    if (this.jobs.filter(j => !['done', 'canceled', 'error'].includes(j.status)).length >= 50) throw Error('Kuyruk dolu (50).');
    const meta = this.metadata.get(url);
    const clip = input.clip ? clipRange(input.clip.start, input.clip.end, meta?.duration) : null;
    if (clip && format === 'file') throw Error('Kesmek için MP4 veya MP3 seç.');
    const quality = Number(input.quality || 1080), bitrate = Number(input.bitrate || 320);
    if (!Number.isInteger(quality) || quality < 144 || quality > 8640) throw Error('Video kalitesi geçersiz.');
    if (![128, 192, 320].includes(bitrate)) throw Error('Ses kalitesi geçersiz.');
    const id = randomUUID();
    const title = safeName(meta?.title || input.title || fileName(url));
    const filename = format === 'file' ? fileName(url) : title.replace(/\.(mp4|webm|mkv|mov|mp3|wav|m4a)$/i, '') + (clip ? ' - klip' : '') + '.' + format;
    const ext = path.extname(filename);
    const stem = path.basename(filename, ext);
    const output = path.join(this.settings.outputDir, `${stem} - ${id.slice(0, 8)}${ext}`);
    const job = { id, url, title, format, quality, bitrate, clip, duration: meta?.duration || 0, output, status: 'queued', progress: 0, bytes: 0, total: 0, speed: 0, eta: 0, createdAt: Date.now(), error: '' };
    this.jobs.push(job); this.changed(true); this.pump(); return job;
  }
  async pump() {
    if (this.closing) return;
    while (this.active.size < this.concurrency) {
      const job = this.jobs.find(j => j.status === 'queued' && !this.active.has(j.id));
      if (!job) return;
      const controller = new AbortController(); this.active.set(job.id, controller);
      job.status = 'downloading'; job.error = ''; this.changed();
      this.execute(job, controller.signal).then(() => {
        if (!controller.signal.aborted) { job.status = 'done'; job.progress = 100; job.completedAt = Date.now(); this.emit('completed', job); }
      }).catch(e => {
        if (!controller.signal.aborted) { job.status = 'error'; job.error = e.message; }
      }).finally(() => {
        this.active.delete(job.id);
        if (job.status === 'pausing') job.status = 'paused';
        if (job.status === 'canceled' || job.status === 'done') this.clean(job);
        job.speed = 0; this.changed(true); this.pump();
      });
    }
  }
  async execute(job, signal) {
    fs.mkdirSync(path.dirname(job.output), { recursive: true });
    if (job.format === 'file') return this.direct(job, signal);
    const work = path.join(this.dataDir, 'work', job.id);
    fs.mkdirSync(work, { recursive: true });
    const sourceRecord = path.join(work, 'source.json');
    let source = readJSON(sourceRecord, null);
    if (!source || !fs.existsSync(source) || path.dirname(source) !== work) {
      let selector;
      if (job.format === 'mp3') selector = 'bestaudio/best';
      else selector = `bestvideo[height<=?${job.quality}]+bestaudio/best[height<=?${job.quality}]`;
      const args = [...ytBase(this.tools), '--newline', '--progress', '--no-simulate', '--continue', '--windows-filenames', '--no-overwrites',
        '--progress-template', 'download:CHARLES:%(progress)j', '--print', 'after_move:CHARLES_FILE:%(filepath)j',
        '-f', selector, '--merge-output-format', 'mkv', '-o', path.join(work, 'source.%(ext)s'), '--', job.url];
      await run(this.tools.ytdlp, args, { signal, maxOutput: 64 * 1024 * 1024, onLine: line => {
        if (line.startsWith('CHARLES_FILE:')) {
          try { const p = JSON.parse(line.slice(13)); if (path.dirname(p) === work) source = p; } catch {}
        }
        if (!line.startsWith('CHARLES:')) return;
        try {
          const p = JSON.parse(line.slice(8));
          job.bytes = Number(p.downloaded_bytes) || 0; job.total = Number(p.total_bytes || p.total_bytes_estimate) || 0;
          job.speed = Number(p.speed) || 0; job.eta = Number(p.eta) || 0;
          job.progress = job.total ? Math.min(82, job.bytes / job.total * 82) : 0; this.changed();
        } catch {}
      } });
      if (!source || !fs.existsSync(source)) throw Error('İndirilen medya dosyası bulunamadı.');
      atomicJSON(sourceRecord, source);
    }
    if (signal.aborted) throw Error('İşlem durduruldu.');
    job.status = 'processing'; job.progress = 83; job.speed = 0; job.eta = 0; this.changed();
    const tmp = job.output + '.part.' + job.format;
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
    if (job.clip) args.push('-ss', String(job.clip.start));
    args.push('-i', source);
    if (job.clip) args.push('-t', String(job.clip.end - job.clip.start));
    if (job.format === 'mp3') args.push('-vn', '-c:a', 'libmp3lame', '-b:a', job.bitrate + 'k');
    else args.push('-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
    args.push('-progress', 'pipe:1', '-nostats', tmp);
    const duration = job.clip ? job.clip.end - job.clip.start : job.duration;
    await run(this.tools.ffmpeg, args, { signal, maxOutput: 32 * 1024 * 1024, onLine: line => {
      if (line.startsWith('out_time_us=') && duration > 0) {
        job.progress = Math.min(99, 83 + Number(line.split('=')[1]) / 1e6 / duration * 16); this.changed();
      }
    } });
    if (signal.aborted) throw Error('İşlem durduruldu.');
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) throw Error('Çıktı dosyası boş.');
    fs.renameSync(tmp, job.output); job.bytes = fs.statSync(job.output).size; job.total = job.bytes;
  }
  async direct(job, signal) {
    const tmp = job.output + '.part';
    let offset = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
    const headers = { 'Accept-Encoding': 'identity' };
    if (offset) { headers.Range = `bytes=${offset}-`; if (job.etag) headers['If-Range'] = job.etag; }
    let response = await fetch(job.url, { signal, headers, redirect: 'follow' });
    if (response.status === 416 && offset) {
      await response.body?.cancel();
      offset = 0; response = await fetch(job.url, { signal, headers: { 'Accept-Encoding': 'identity' } });
    }
    if (!response.ok) throw Error(`Sunucu indirmeyi reddetti (HTTP ${response.status}).`);
    const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get('content-range') || '');
    if (response.status === 206 && (!range || Number(range[1]) !== offset)) { await response.body?.cancel(); throw Error('Sunucu geçersiz devam aralığı döndürdü.'); }
    if (response.status !== 206) offset = 0;
    const length = Number(response.headers.get('content-length')) || 0;
    job.total = range && range[3] !== '*' ? Number(range[3]) : length ? offset + length : 0;
    job.etag = response.headers.get('etag') || response.headers.get('last-modified') || '';
    const handle = await fs.promises.open(tmp, offset ? 'a' : 'w');
    job.bytes = offset;
    const started = Date.now(); let last = 0;
    try {
      if (!response.body) throw Error('Sunucu boş yanıt döndürdü.');
      for await (const chunk of response.body) {
        if (signal.aborted) throw Error('İşlem durduruldu.');
        let written = 0;
        while (written < chunk.length) { const { bytesWritten } = await handle.write(chunk, written, chunk.length - written); written += bytesWritten; }
        job.bytes += chunk.length;
        if (Date.now() - last > 250) {
          job.speed = (job.bytes - offset) / Math.max(.1, (Date.now() - started) / 1000);
          job.eta = job.total && job.speed ? (job.total - job.bytes) / job.speed : 0;
          job.progress = job.total ? Math.min(99, job.bytes / job.total * 100) : 0;
          last = Date.now(); this.changed();
        }
      }
    } finally { await handle.close(); }
    if (signal.aborted) throw Error('İşlem durduruldu.');
    if (job.total && job.bytes !== job.total) throw Error('Dosya eksik indi; devam ederek yeniden deneyebilirsin.');
    fs.renameSync(tmp, job.output);
  }
  control(id, action) {
    const job = this.jobs.find(j => j.id === id);
    if (!job) throw Error('İndirme bulunamadı.');
    if (action === 'pause') {
      if (job.status === 'processing') throw Error('Dönüştürme sırasında yalnızca iptal edebilirsin.');
      if (!['queued', 'downloading'].includes(job.status)) throw Error('Bu indirme duraklatılamaz.');
      job.status = this.active.has(id) ? 'pausing' : 'paused'; this.active.get(id)?.abort();
    } else if (action === 'resume') {
      if (!['paused', 'error'].includes(job.status) || this.active.has(id)) throw Error('İndirme henüz devam etmeye hazır değil.');
      job.status = 'queued'; job.error = '';
    } else if (action === 'cancel') {
      if (job.status === 'done') throw Error('Tamamlanan dosya iptal edilemez.');
      job.status = 'canceled'; this.active.get(id)?.abort(); if (!this.active.has(id)) this.clean(job);
    } else throw Error('Bilinmeyen işlem.');
    this.changed(true); this.pump(); return this.snapshot();
  }
  clean(job) {
    const workBase = path.resolve(this.dataDir, 'work');
    const work = path.resolve(workBase, job.id);
    if (path.dirname(work) === workBase && /^[a-f0-9-]{36}$/.test(job.id)) fs.rmSync(work, { recursive: true, force: true });
    for (const f of [job.output + '.part', job.output + '.part.' + job.format]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
  async shutdown() {
    this.closing = true;
    for (const [id, controller] of this.active) { const job = this.jobs.find(j => j.id === id); if (job) job.status = 'pausing'; controller.abort(); }
    clearTimeout(this.saving); this.saving = null;
    this.save();
  }
}
module.exports = { DownloadEngine, validURL, time, clipRange, safeName, fileName, candidateURL, run, ytBase };
