const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const executable = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(executable) || !fs.existsSync(path.join(root, 'dist', 'renderer.js'))) {
  console.error(
    'Charles hazır değil. Önce npm.cmd ci, npm.cmd run setup ve npm.cmd run build çalıştırın.',
  );
  process.exit(1);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// A separate process group and no inherited console handles let the terminal exit.
const entry = require('../app/core/windows-identity.cjs').launcher(root, executable);
const child = spawn(entry.target, entry.args ? [root] : [], {
  cwd: root,
  env,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
  shell: false,
});
child.once('error', (error) => {
  console.error(`Charles başlatılamadı: ${error.message}`);
  process.exitCode = 1;
});
child.once('spawn', () => {
  console.log(`Charles açıldı (PID ${child.pid}). Bu pencereyi kapatabilirsiniz.`);
  child.unref();
});
