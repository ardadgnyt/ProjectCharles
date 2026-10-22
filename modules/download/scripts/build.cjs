const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js', 'i18n.js', 'icon.svg']) fs.copyFileSync(path.join(root, 'src', name), path.join(root, 'dist', name));
fs.copyFileSync(path.join(root, 'manifest.json'), path.join(root, 'dist', 'manifest.json'));
console.log('dist hazır.');
