// Opens Start-menu apps and controls Spotify; parses "… aç" style commands.
const path = require('node:path');
const fs = require('node:fs');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { MediaWorker } = require('./media-worker.cjs');
function normalize(s) {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .trim();
}
function parseCommand(prompt) {
  if (typeof prompt !== 'string' || prompt.length > 500) return null;
  let s = normalize(prompt)
    .replace(/[.!?]+$/, '')
    .replace(/\b(?:lutfen|bana|charles)\b[, ]*/g, '')
    .replace(/\s+(?:misin|misiniz)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/(?:nasil|acma\b|calma\b|acmadan|acarsam|ornek|komut|yaz|kod|isteme|acabilir)/.test(s))
    return null;
  s = s.replace(
    /\b(acar|calar|oynatir|baslatir|gecer|atlar|duraklatir|durdurur)$/,
    (v) =>
      ({
        acar: 'ac',
        calar: 'cal',
        oynatir: 'oynat',
        baslatir: 'baslat',
        gecer: 'gec',
        atlar: 'atla',
        duraklatir: 'duraklat',
        durdurur: 'durdur',
      })[v],
  );
  const generic =
    /^(?:(?:spotify(?:dan|da|i|yi)?|muzik|sarki)\s*)?(?:(?:bir|bi|biraz|herhangi bir)\s+)?(?:(?:sarki|muzik)\s+)?(?:ac|cal|oynat|baslat)$/;
  if (
    (s.includes('muzik') ||
      s.includes('sarki') ||
      (/spotify/.test(s) && / (?:cal|oynat|baslat)$/.test(s))) &&
    generic.test(s)
  )
    return { type: 'media', action: 'play' };
  if (/^(?:spotify(?:i|yi|da)? ?)?(?:(?:muzigi|sarkiyi|muzik|sarki) )?(?:duraklat|durdur)$/.test(s))
    return { type: 'media', action: 'pause' };
  if (
    /^(?:spotify(?:da)? )?(?:sonraki (?:sarki(?:ya)?|parca(?:ya)?)(?: gec)?|sarkiyi atla|sarki atla)$/.test(
      s,
    )
  )
    return { type: 'media', action: 'next' };
  if (/^(?:spotify(?:da)? )?(?:onceki (?:sarkiya|parcaya) (?:gec|don)|geri git)$/.test(s))
    return { type: 'media', action: 'previous' };
  const search = s.match(/^spotify(?:da|dan)?\s+(.+?)\s+(?:cal|oynat|ac)$/);
  if (search && !/^(?:uygulama|program)/.test(search[1]))
    return { type: 'search', query: search[1] };
  const open = s.match(
    /^(.+?)\s+(?:(?:uygulamasini|uygulamasi|programini)\s+)?(?:ac|baslat)(?:ar)?$/,
  );
  if (!open || /[;`$\n\r/\\<>]/.test(open[1])) return null;
  let name = open[1].replace(/\s+(?:uygulamasini|uygulamasi|programini)$/, '');
  const aliases = {
    'not defterini': 'not defteri',
    'hesap makinesini': 'hesap makinesi',
    steami: 'steam',
    spotifyi: 'spotify',
    spotifyyi: 'spotify',
    discordu: 'discord',
    chromeu: 'google chrome',
    chrome: 'google chrome',
    hesapmakinesi: 'hesap makinesi',
  };
  name = aliases[name] || name;
  return { type: 'open', name };
}
class Desktop {
  constructor(shell, runner = run, launcher = spawn) {
    this.shell = shell;
    this.run = runner;
    this.spawn = launcher;
    this.catalog = null;
    this.pending = false;
    this.mediaWorker = runner === run ? new MediaWorker() : null;
  }
  async helper(action) {
    if (action !== 'list' && this.mediaWorker) return this.mediaWorker.request(action);
    if (!['list', 'status', 'play', 'pause', 'next', 'previous'].includes(action))
      throw Error('Geçersiz medya işlemi.');
    const exe = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    let output;
    try {
      output = await this.run(
        exe,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '& {\n' +
            fs.readFileSync(path.join(__dirname, 'desktop.ps1'), 'utf8') +
            '\n} -Action ' +
            action,
        ],
        {
          windowsHide: true,
          timeout: 20000,
          maxBuffer: 2 * 1024 * 1024,
          encoding: 'utf8',
        },
      );
    } catch (e) {
      try {
        const result = JSON.parse(e.stdout);
        if (action !== 'list') return result;
      } catch {}
      throw Error('Windows uygulama/medya bağlantısı kurulamadı.');
    }
    return JSON.parse(output.stdout.replace(/^\uFEFF/, ''));
  }
  stop() {
    this.mediaWorker?.stop();
  }
  async media(action) {
    if (typeof action === 'object') return this.mediaWorker.request(action);
    let r = await this.helper(action);
    // v0.8.14: "Çalmaya başla" with Spotify closed (or not answering) opens Spotify first
    if (action === 'play' && !r?.ok) {
      await this.openSpotify();
      for (let i = 0; i < 12; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        r = await this.helper(action).catch(() => r);
        if (r?.ok) break;
      }
    }
    return r;
  }
  /** v0.8.14: brings up the Spotify app (its spotify: link, else the Start menu entry). */
  async openSpotify() {
    try {
      if (this.shell?.openExternal) {
        await this.shell.openExternal('spotify:');
        return 'Spotify';
      }
    } catch {}
    return this.open('spotify');
  }
  async apps() {
    if (!this.catalog) this.catalog = (await this.helper('list')) || [];
    return Array.isArray(this.catalog) ? this.catalog : [this.catalog];
  }
  async open(name) {
    const apps = await this.apps();
    let found = apps.filter((a) => normalize(a.Name) === name);
    if (!found.length)
      found = apps.filter((a) => normalize(a.Name).replace(/\s/g, '') === name.replace(/\s/g, ''));
    if (found.length !== 1)
      throw Error(
        found.length
          ? 'Bu isimde birden fazla uygulama var; tam adını yaz.'
          : `“${name}” Başlat menüsündeki uygulamalarda bulunamadı. Kurulu uygulamanın tam adını yaz.`,
      );
    const target = found[0];
    if (typeof target.AppID !== 'string' || /[\r\n"<>|]/.test(target.AppID))
      throw Error('Uygulama kısayolu geçersiz.');
    await new Promise((resolve, reject) => {
      const child = this.spawn(
        path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'),
        ['shell:AppsFolder\\' + target.AppID],
        { windowsHide: true, detached: true, stdio: 'ignore', shell: false },
      );
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
    return target.Name;
  }
  async execute(command) {
    if (this.pending) throw Error('Önceki uygulama komutu tamamlanıyor.');
    this.pending = true;
    try {
      if (command.type === 'open') {
        const name = await this.open(command.name);
        return `${name} için açma komutunu Windows’a gönderdim.`;
      }
      if (command.type === 'search') {
        await this.open('spotify');
        await this.shell.openExternal('spotify:search:' + encodeURIComponent(command.query));
        return `Spotify’da “${command.query}” aramasını açtım. Belirli bir parçayı bu bağlantıyla otomatik başlatamıyorum; sonuçtan seçebilirsin.`;
      }
      const r = await this.media(command.action);
      if (!r.ok || r.accepted === false)
        return 'Spotify oynatmayı kabul etmedi veya hazır bir müzik oturumu bulunamadı. Spotify’da giriş yapıp bir parçayı ilk kez başlat; ardından buradan çalma, duraklatma ve sonraki şarkı komutlarını kullanabilirsin.';
      if (command.action === 'play')
        return r.state === 'Playing'
          ? 'Spotify’da müzik çalıyor.'
          : 'Spotify’a oynatma isteğini gönderdim; henüz çalıyor durumunu doğrulayamadım.';
      return command.action === 'pause'
        ? 'Spotify duraklatma isteğini kabul etti.'
        : command.action === 'previous'
          ? 'Spotify önceki şarkıya geçme isteğini kabul etti.'
          : 'Spotify sonraki şarkıya geçme isteğini kabul etti.';
    } finally {
      this.pending = false;
    }
  }
}
module.exports = { Desktop, parseCommand, normalize };
