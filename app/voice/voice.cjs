// Local Whisper speech-to-text and Windows text-to-speech.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
function validateWave(value) {
  if (!(value instanceof Uint8Array)) throw Error('Geçersiz ses kaydı.');
  const b = Buffer.from(value);
  if (
    b.length < 6444 ||
    b.length > 1920044 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE' ||
    b.toString('ascii', 12, 16) !== 'fmt ' ||
    b.readUInt32LE(16) !== 16 ||
    b.readUInt16LE(20) !== 1 ||
    b.readUInt16LE(22) !== 1 ||
    b.readUInt32LE(24) !== 16000 ||
    b.readUInt32LE(28) !== 32000 ||
    b.readUInt16LE(32) !== 2 ||
    b.readUInt16LE(34) !== 16 ||
    b.toString('ascii', 36, 40) !== 'data' ||
    b.readUInt32LE(40) !== b.length - 44 ||
    b.readUInt32LE(4) !== b.length - 8 ||
    b.length % 2
  )
    throw Error('Ses kaydı 16 kHz mono PCM olmalı ve en fazla 60 saniye sürmeli.');
  let sum = 0;
  for (let i = 44; i < b.length; i += 2) sum += (b.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(sum / ((b.length - 44) / 2)) < 0.002)
    throw Error('Ses duyulamadı. Mikrofonunu kontrol edip yeniden dene.');
  return b;
}
function speechText(text) {
  if (typeof text !== 'string') throw Error('Geçersiz metin.');
  return text
    .replace(/```[\s\S]*?```/g, ' Kod bölümü ekranda. ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' bağlantı ')
    .replace(/[*_`#>|~]/g, '')
    .slice(0, 6000)
    .trim();
}
class Voice {
  constructor(root, userData, wakeOnly = false) {
    this.root = root;
    this.dir = path.join(userData, 'voice-temp');
    this.job = null;
    this.model = wakeOnly ? 'models/ggml-tiny.bin' : 'models/ggml-small.bin';
    this.language = wakeOnly ? 'en' : 'auto';
  }
  available() {
    return (
      fs.existsSync(path.join(this.root, 'tools/whisper/whisper-cli.exe')) &&
      fs.existsSync(path.join(this.root, this.model))
    );
  }
  run(exe, args, options = {}) {
    if (this.job) throw Error('Önce mevcut ses işlemini durdur.');
    return new Promise((resolve, reject) => {
      const child = spawn(exe, args, {
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'pipe'],
        ...options,
      });
      const job = { child, cancelled: false };
      this.job = job;
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 300000);
      child.stderr.on('data', (b) => {
        stderr = (stderr + b).slice(-3000);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(options.input || '');
      const finish = (error) => {
        clearTimeout(timer);
        if (this.job === job) this.job = null;
        if (job.cancelled) reject(Error('Ses işlemi iptal edildi.'));
        else if (timedOut) reject(Error('Ses işlemi zaman aşımına uğradı.'));
        else if (error) reject(error);
        else resolve();
      };
      child.once('error', finish);
      child.once('close', (code) =>
        finish(code !== 0 ? Error('Ses işlemi tamamlanamadı. ' + stderr.slice(-500)) : null),
      );
    });
  }
  async transcribe(value) {
    if (!this.available()) throw Error('Yerel ses modeli bulunamadı. Ses kurulumunu çalıştır.');
    if (this.job) throw Error('Ses işlemi zaten çalışıyor.');
    const b = validateWave(value);
    fs.mkdirSync(this.dir, { recursive: true });
    const prefix = path.join(this.dir, randomUUID());
    const file = prefix + '.wav';
    fs.writeFileSync(file, b);
    try {
      await this.run(path.join(this.root, 'tools/whisper/whisper-cli.exe'), [
        '-m',
        path.join(this.root, this.model),
        '-f',
        file,
        '-l',
        this.language,
        '-otxt',
        '-of',
        prefix,
        '-nt',
        '-np',
        '-ng',
        '-t',
        '4',
      ]);
      const text = fs
        .readFileSync(prefix + '.txt', 'utf8')
        .trim()
        .replace(/\[.*?\]/g, '')
        .trim();
      if (!text) throw Error('Konuşma anlaşılamadı. Yeniden deneyebilirsin.');
      return text;
    } finally {
      for (const f of [file, prefix + '.txt'])
        try {
          fs.unlinkSync(f);
        } catch {}
    }
  }
  async speak(value, language = 'tr') {
    const text = speechText(value);
    if (!text) return;
    const script = fs.readFileSync(path.join(__dirname, 'voice.ps1'), 'utf8');
    await this.run(
      path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { input: JSON.stringify({ text, language }) },
    );
  }
  stop() {
    if (this.job) {
      this.job.cancelled = true;
      this.job.child.kill();
    }
  }
}
module.exports = { Voice, validateWave, speechText };
