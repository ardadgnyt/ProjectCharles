// "Start with Windows" entry.
const path = require('node:path'),
  fs = require('node:fs');
class Startup {
  constructor(app, shell, root) {
    this.app = app;
    this.shell = shell;
    this.root = root;
    this.file = path.join(
      app.getPath('appData'),
      'Microsoft/Windows/Start Menu/Programs/Startup/ProjectCharles.lnk',
    );
  }
  enabled() {
    try {
      const l = this.shell.readShortcutLink(this.file);
      const target = path.resolve(l.target).toLowerCase();
      if (target === path.join(this.root, 'Charles.exe').toLowerCase()) return l.args === '--autostart';
      return [process.execPath, path.join(this.root, 'node_modules/electron/dist/electron.exe')]
        .some(exe => path.resolve(exe).toLowerCase() === target) && l.args === `"${this.root}" --autostart`;
    } catch {
      return false;
    }
  }
  set(value) {
    if (value) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const entry = require('./windows-identity.cjs').launcher(this.root);
      if (
        !this.shell.writeShortcutLink(this.file, 'create', {
          target: entry.target,
          args: [entry.args, '--autostart'].filter(Boolean).join(' '),
          cwd: this.root,
          description: 'Charles',
          icon: path.join(this.root, 'public', 'charles.ico'),
          appUserModelId: require('./windows-identity.cjs').APP_ID,
          iconIndex: 0,
        })
      )
        throw Error('Başlangıç kısayolu yazılamadı.');
    } else if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
    this.app.setLoginItemSettings({
      name: 'Charles',
      path: process.execPath,
      args: [this.root, '--autostart'],
      openAtLogin: false,
    });
    if (!!value !== this.enabled()) throw Error('Başlangıç ayarı doğrulanamadı.');
    return this.enabled();
  }
}
module.exports = { Startup };
