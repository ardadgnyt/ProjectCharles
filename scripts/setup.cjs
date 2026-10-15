const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
// Explicit installation of the two pinned official build runtimes. No admin step.
for (const module of ['esbuild', 'electron']) {
  const installer = path.join(root, 'node_modules', module, 'install.js');
  if (!fs.existsSync(installer)) throw new Error('Önce npm ci çalıştırın.');
  const result = spawnSync(process.execPath, [installer], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Charles hazır. Başlatmak için: npm start');
