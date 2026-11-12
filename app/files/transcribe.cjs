'use strict';
// v0.9.26: speech in a sound or video file written down, on this computer: FFmpeg turns the sound
// into 16 kHz mono, the local Whisper model (tools/whisper, models/ggml-small.bin, the same one push
// to talk uses) writes it out with its times. Nothing is sent anywhere. TXT, SRT and VTT come from
// Whisper itself; DOCX is made from the text.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LANGS = ['auto', 'tr', 'en', 'de', 'fr', 'es', 'it', 'ar', 'ru', 'zh', 'ja'];

function paths(root) {
  return { exe: path.join(root, 'tools', 'whisper', 'whisper-cli.exe'), model: path.join(root, 'models', 'ggml-small.bin') };
}
function available(root) {
  const p = paths(root);
  return fs.existsSync(p.exe) && fs.existsSync(p.model);
}

function proc(exe, args, { signal, onLine, timeout = 6 * 3600000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    const read = (d) => {
      const s = String(d);
      err = (err + s).slice(-4000);
      for (const line of s.split(/\r?\n/)) if (line.trim()) onLine?.(line);
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener?.('abort', stop, { once: true });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', stop);
      if (signal?.aborted) return reject(Object.assign(Error('İptal edildi.'), { cancelled: true }));
      if (code !== 0) return reject(Error(err.split(/\r?\n/).filter(Boolean).pop()?.slice(0, 200) || 'çıkış kodu ' + code));
      resolve();
    });
  });
}

/**
 * file → { txt, srt, vtt } texts. ffmpeg: path of ffmpeg.exe. language: 'auto' or a code.
 * progress(0..1) follows Whisper's own percent.
 */
async function transcribe(file, { root, ffmpeg, language = 'auto', signal, progress = () => {} } = {}) {
  const { exe, model } = paths(root);
  if (!fs.existsSync(exe) || !fs.existsSync(model)) throw Error('Yerel konuşma modeli (Whisper) bulunamadı; Charles kurulumunu onar.');
  if (!ffmpeg) throw Error('FFmpeg bulunamadı. Charles kurulumundaki tools\\download klasörünü kontrol et.');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-transcribe-'));
  try {
    const wav = path.join(work, 'ses.wav');
    progress(0.02);
    try {
      await proc(ffmpeg, ['-hide_banner', '-nostdin', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { signal });
    } catch (e) {
      if (e.cancelled) throw e;
      throw Error('Dosyadaki ses okunamadı: ' + e.message);
    }
    if (!fs.existsSync(wav) || fs.statSync(wav).size < 1000) throw Error('Dosyada ses yok.');
    progress(0.08);
    const out = path.join(work, 'yazi');
    const lang = LANGS.includes(language) ? language : 'auto';
    const threads = String(Math.max(2, Math.min(8, os.cpus().length - 1)));
    await proc(exe, ['-m', model, '-f', wav, '-l', lang, '-t', threads, '-otxt', '-osrt', '-ovtt', '-of', out, '-pp'], {
      signal,
      onLine: (line) => {
        const m = /progress\s*=\s*(\d+)%/.exec(line);
        if (m) progress(0.08 + (+m[1] / 100) * 0.9);
      },
    });
    const read = (ext) => (fs.existsSync(out + '.' + ext) ? fs.readFileSync(out + '.' + ext, 'utf8') : '');
    // Whisper writes CRLF; one kind of line ending in the text file (Windows: CRLF)
    const result = { txt: read('txt').trim().replace(/\r?\n/g, '\r\n') + '\r\n', srt: read('srt'), vtt: read('vtt') };
    if (!result.txt.trim() && !result.srt.trim()) throw Error('Kayıtta yazıya dökülecek konuşma bulunamadı.');
    return result;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Subtitles without their times: the spoken lines in order. */
function subtitlesToText(text) {
  return (
    String(text)
      .replace(/\r/g, '')
      .replace(/^WEBVTT[^\n]*\n/, '')
      .split(/\n{2,}/)
      .map((block) =>
        block
          .split('\n')
          .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^(NOTE|STYLE|REGION)\b/.test(l))
          .map((l) => l.replace(/<[^>]+>/g, '').trim())
          .join(' '),
      )
      .filter(Boolean)
      .join('\n') + '\n'
  );
}

module.exports = { transcribe, available, subtitlesToText, LANGS };
