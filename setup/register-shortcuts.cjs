const { app, shell } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.whenReady().then(() => {
  require('../app/core/windows-identity.cjs').registerShortcuts({ app, shell, root, icon: path.join(root, 'public', 'charles.ico') });
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
