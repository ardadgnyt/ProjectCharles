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
      return (
        path.resolve(l.target).toLowerCase() === path.resolve(process.execPath).toLowerCase() &&
        l.args === `"${this.root}" --autostart`
      );
    } catch {
      return false;
    }
  }
  set(value) {
    if (value) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (
        !this.shell.writeShortcutLink(this.file, 'create', {
          target: process.execPath,
          args: `"${this.root}" --autostart`,
          cwd: this.root,
          description: 'Charles',
          icon: process.execPath,
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
