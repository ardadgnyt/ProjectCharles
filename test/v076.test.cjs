// v0.7.6 Beta: taskbar icon of the app window, layout of a narrow app window
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('app window tells Windows its id and icon for the taskbar', () => {
  const main = read('app/main.cjs');
  assert.match(main, /app\.setAppUserModelId\(APP_ID\)/);
  assert.match(main, /setAppDetails\(\{\s*appId: APP_ID,\s*appIconPath:/);
  assert.match(main, /appWin\.on\('show', \(\) => taskbarIcon\(appWin\)\)/);
  // a new Slime colour also refreshes the taskbar icon
  assert.match(main, /setImmediate\(\(\) => taskbarIcon\(appWin\)\)/);
});

test('narrow app window: cards size from their own width', () => {
  const html = read('public/index.html');
  assert.ok(html.indexOf('styles/11-fit.css') > html.indexOf('styles/10-noir.css'));
  const css = read('public/styles/11-fit.css');
  assert.match(css, /container: ws-home \/ inline-size/);
  assert.match(css, /#workspace \.ws-home \{\s*overflow-x: hidden;/);
  assert.match(css, /grid-template-columns: 150px minmax\(0, 1fr\)/);
  assert.match(css, /\.ws-usage-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
