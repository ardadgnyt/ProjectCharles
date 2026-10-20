// One Windows identity for the window, launcher and shortcuts.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const APP_ID = 'ProjectCharles.Charles';
function launcher(root, executable = process.execPath) {
  const branded = path.join(root, 'Charles.exe');
  return fs.existsSync(branded) ? { target: branded, args: '' } : { target: executable, args: '"' + root + '"' };
}
function iconResource(userData, root) {
  // Do not overwrite a file Explorer has already cached. The content address also
  // avoids a blank icon cached against charles.ico by an older release.
  for (const source of [path.join(userData, 'charles.ico'), path.join(root, 'public', 'charles.ico')]) {
    try {
      const data = fs.readFileSync(source);
      if (data.length < 22 || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1 || !data.readUInt16LE(4)) continue;
      const dir = path.join(userData, 'icons');
      const file = path.join(dir, 'slime-' + createHash('sha256').update(data).digest('hex').slice(0, 24) + '.ico');
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file + '.tmp', data);
        fs.renameSync(file + '.tmp', file);
      }
      return file;
    } catch {}
  }
  return path.join(root, 'Charles.exe');
}
function shortcutOptions(root, icon, executable) {
  return { ...launcher(root, executable), cwd: root, description: 'Charles', icon, iconIndex: 0, appUserModelId: APP_ID };
}
function registerShortcuts({ app, shell, root, icon, executable = process.execPath }) {
  const programs = path.join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs/ProjectCharles');
  fs.mkdirSync(programs, { recursive: true });
  const options = shortcutOptions(root, icon, executable);
  const canonical = path.join(programs, 'Charles.lnk');
  let old;
  try { old = shell.readShortcutLink(canonical); } catch {}
  if (!old || Object.entries(options).some(([k,v]) => old[k] !== v)) {
    if (!shell.writeShortcutLink(canonical, 'create', options)) throw Error('Charles Başlat menüsü kimliği kaydedilemedi.');
  }
  // Repair only this installation's existing shortcuts; never repoint another copy.
  for (const dir of [programs, app.getPath('desktop')]) {
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const name of files.filter(n => /charles.*\.lnk$/i.test(n))) {
      const file = path.join(dir, name);
      if (file === canonical) continue;
      try {
        const link = shell.readShortcutLink(file);
        const target = path.resolve(link.target).toLowerCase();
        const sameExe = target === path.resolve(executable).toLowerCase() ||
          target === path.join(root, 'node_modules/electron/dist/electron.exe').toLowerCase();
        const sameLauncher = path.resolve(link.target).toLowerCase() === path.join(root, 'Charles.exe').toLowerCase();
        if (!sameLauncher && !(sameExe && link.args === '"' + root + '"')) continue;
        if (Object.entries(options).some(([k,v]) => link[k] !== v)) shell.writeShortcutLink(file, 'update', options);
      } catch {}
    }
  }
  return canonical;
}
module.exports = { APP_ID, launcher, iconResource, shortcutOptions, registerShortcuts };
