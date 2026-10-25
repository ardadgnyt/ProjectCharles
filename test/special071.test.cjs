// v0.7.1 SpecialBeta: workspace (app) window, folder icons in the chat history, more
// reliable extra instructions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function loadTs(file) {
  const esbuild = require('esbuild');
  const m = { exports: {} };
  const code = esbuild.transformSync(read(file), { loader: 'ts', format: 'cjs' }).code;
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}
const AREA = { x: 0, y: 0, width: 1920, height: 1040 };

test('workspace geometry: centred by default, saved place kept, clamped and resized', () => {
  const { workspaceBounds, resized, fit, MIN } = require('../app/core/workspace.cjs');
  const first = workspaceBounds(null, AREA);
  assert.equal(first.width, 1480);
  assert.equal(first.height, 936);
  assert.equal(first.x, (1920 - 1480) / 2);
  const saved = { bounds: { x: 100, y: 50, width: 1200, height: 800 } };
  assert.deepEqual(workspaceBounds(saved, AREA), saved.bounds);
  // a place on a display that is gone → centred again
  assert.equal(workspaceBounds({ bounds: { x: 5000, y: 50, width: 1200, height: 800 } }, AREA).x, 220);
  // small screens: never larger than the work area
  const small = workspaceBounds(null, { x: 0, y: 0, width: 1280, height: 680 });
  assert.ok(small.width <= 1280 && small.height <= 680);
  assert.deepEqual(fit({ x: -50, y: -20, width: 400, height: 300 }, AREA), { x: 0, y: 0, width: MIN.width, height: MIN.height });
  const start = { x: 200, y: 100, width: 1200, height: 800 };
  assert.deepEqual(resized(start, 'se', 100, 50, AREA), { x: 200, y: 100, width: 1300, height: 850 });
  assert.deepEqual(resized(start, 'w', 100, 0, AREA), { x: 300, y: 100, width: 1100, height: 800 });
  assert.equal(resized(start, 'w', 900, 0, AREA).width, MIN.width); // not below the minimum
  assert.equal(resized(start, 'n', 0, -500, AREA).y, 0); // not above the work area
  assert.equal(resized(start, 'up', 1, 1, AREA), null);
  assert.equal(resized(start, 'e', NaN, 0, AREA), null);
});

test('workspace: main process switches the window and keeps the island logic out of it', () => {
  const main = read('app/main.cjs');
  assert.match(main, /function setWorkspace\(on\)/);
  assert.match(main, /function createAppWindow\(\)/); // v0.7.4: a separate, normal Windows window
  assert.match(main, /if \(!win \|\| workspace\) return;/); // position() leaves the app window alone
  assert.match(main, /const ignore = workspace \? false : !inside;/); // no click-through
  assert.match(main, /if \(workspace\) return; \/\/ a normal app window may sit in the taskbar/);
  assert.match(main, /if \(pluginGuide \|\| workspace\) return detached;/);
  assert.match(main, /safeHandler\('workspace', \(on\) => \{[\s\S]*?return setWorkspace\(on\);/);
  assert.match(main, /safeHandler\('workspace-window'/);
  assert.match(main, /appWin\.on\('close'/); // Alt+F4 / × go back to the island
  assert.match(main, /previous\.workspace/); // "Charles ile kur" comes back to the app window
  for (const name of ['workspace-mail', 'workspace-calendar', 'workspace-home', 'workspace-home-action'])
    assert.match(main, new RegExp(`safeHandler\\('${name}'`), name);
  const preload = read('app/preload.cjs');
  for (const key of ['workspace:', 'workspaceWindow:', 'onWorkspace:', 'workspaceMail:', 'workspaceHome:'])
    assert.ok(preload.includes(key), key);
});

test('workspace window: title bar, sidebar with folders, overview cards and chat view', () => {
  const ws = read('src/workspace/workspace.ts');
  for (const s of ['Adacığa dön', 'Genel bakış', 'Uygulama penceresinde aç', "pin.after(openButton)", 'ws-edge'])
    assert.ok(ws.includes(s), s);
  // the chat and Slime are moved, not copied
  assert.match(ws, /chatBody\.append\(content\)/);
  assert.match(ws, /contentHome\.parent\.insertBefore\(content, contentHome\.next\)/);
  const side = read('src/workspace/sidebar.ts');
  for (const s of ['Klasörler', 'Son sohbetler', 'Yeni sohbet', 'move-chat', 'historyManage']) assert.ok(side.includes(s), s);
  const dash = read('src/workspace/dashboard.ts');
  for (const s of ['Spotify', 'Hatırlatıcılar', 'Takvim', 'Önemli e-postalar', 'Akıllı ev', 'Kalan kullanım'])
    assert.ok(dash.includes(s), s);
  // Quota refresh delegates caching and provider behavior to the shared service.
  assert.match(dash, /api\.usageRead\(force, id\)/);
  assert.match(ws, /if \(\/\^claude:\/\.test\(model\)\) return 'Claude';/);
  assert.match(read('public/index.html'), /styles\/9-special\.css/);
  assert.ok(read('public/index.html').includes('v' + require('../package.json').version.split('-')[0] + ' Beta'));
  assert.match(read('public/styles/9-special.css'), /body\.workspace main\.island/);
  assert.match(read('src/island/desktop-pet.ts'), /classList\.contains\('workspace'\)/);
});

test('chat history: folders get a folder icon instead of the side arrow', () => {
  const h = read('src/chat/history-folders.ts');
  assert.doesNotMatch(h, /'▸ ' \+ f\.name/);
  assert.match(h, /FOLDER_ICON/);
  assert.match(h, /folder-icon/);
  assert.match(read('public/styles/9-special.css'), /#history-list \.folder-icon/);
});

test('extra instructions: Codex waits for the turn id and retries once', async () => {
  const { Agent } = require('../app/ai/agent.cjs');
  const a = new Agent(root);
  a.ready = true;
  a.busy = true;
  a.threadId = 'th';
  a.turnId = null; // turn/start has not answered yet
  const sent = [];
  let fail = true;
  a.rpc = {
    request: async (method, params) => {
      sent.push(params.expectedTurnId);
      if (fail) {
        fail = false;
        throw Error('turn mismatch');
      }
      return { turnId: params.expectedTurnId };
    },
  };
  setTimeout(() => (a.turnId = 'tu1'), 150);
  setTimeout(() => (a.turnId = 'tu2'), 250);
  const r = await a.steer('Başlıkları da ekle');
  assert.equal(sent.length, 2);
  assert.equal(sent[0], 'tu1');
  assert.equal(r.turnId, 'tu2');
  a.busy = false;
  await assert.rejects(() => a.steer('x'));
});

test('extra instructions: held while sending, "Şimdi" interrupts and sends right away', () => {
  const steer = read('src/chat/steer.ts');
  assert.match(steer, /function hold\(text: string\)/);
  assert.match(steer, /async function started\(\)/);
  assert.match(steer, /steer-now/);
  assert.match(steer, /takeInterjection/);
  const r = read('src/renderer.ts');
  assert.match(r, /steer\.hold\(prompt\.value\)/);
  assert.match(r, /steer\.takeInterjection\(\)\) window\.setTimeout\(sendQueued, 300\)/);
  assert.match(r, /if \(!replaying\) void steer\.started\(\)/);
});

test('English: workspace texts are translated, user content is not', () => {
  const { englishSpecial, specialPatterns } = loadTs('src/settings/i18n-special.ts');
  for (const k of ['Adacığa dön', 'Genel bakış', 'Klasörler', 'Son sohbetler', 'Kalan kullanım', 'Şimdi'])
    assert.ok(englishSpecial[k], k);
  const tr = (s) => {
    for (const [re, fn] of specialPatterns) {
      const m = s.match(re);
      if (m) return fn(...m);
    }
  };
  assert.equal(tr('3 yeni'), '3 new');
  assert.equal(tr('Ekim 2026'), 'October 2026');
  assert.equal(tr('Yenilenme: 2sa 10dk'), 'Resets in 2h 10m');
  assert.match(read('src/settings/i18n.ts'), /\[translate="no"\]/);
});

test('round 2: Google Takvim plugin adds events with the Google client, month range is read', async () => {
  const { Plugins } = require('../app/plugins/plugins.cjs');
  const p = Object.create(Plugins.prototype);
  p.data = { tokens: { google: { access_token: 'g', expires: Date.now() + 3600e3 } }, configs: { google: { clientId: 'cid' } } };
  p.cache = {};
  p.epoch = {};
  p.pending = new Map();
  p.errors = {};
  p.save = () => {};
  assert.equal(p.oauthConfig('gcal').clientId, 'cid'); // shares the Google client
  await assert.rejects(() => p.calendarAdd({ title: 'x', start: new Date().toISOString() }), /Google Takvim/);
  p.data.tokens.gcal = { access_token: 'c', expires: Date.now() + 3600e3 };
  assert.equal(p.status().connected.gcal, true);
  const calls = [];
  p.json = async (url, opts) => (calls.push({ url, opts }), { id: 'e1', summary: 'Sunum', start: { dateTime: '2026-10-20T10:00:00Z' } });
  const r = await p.calendarAdd({ title: 'Sunum', start: '2026-10-20T10:00:00Z', minutes: 90 });
  assert.equal(r.id, 'e1');
  assert.match(calls[0].url, /calendars\/primary\/events$/);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer c');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.summary, 'Sunum');
  assert.equal(Date.parse(body.end.dateTime) - Date.parse(body.start.dateTime), 90 * 60000);
  const allDay = JSON.parse((await p.calendarAdd({ title: 'Tatil', start: '2026-10-29T09:00:00', allDay: true }), calls[1].opts.body));
  assert.equal(allDay.start.date, '2026-10-29');
  assert.equal(allDay.end.date, '2026-10-30');
  await assert.rejects(() => p.calendarAdd({ title: '', start: '2026-10-20T10:00:00Z' }));
  p.get = async (id, url) => (calls.push({ id, url }), { items: [{ id: 'a', summary: 'Toplantı', start: { dateTime: '2026-10-21T09:00:00Z' } }, { id: 'b', status: 'cancelled', start: {} }] });
  const rows = await p.calendarRange('2026-10-01T00:00:00Z', '2026-11-08T00:00:00Z');
  assert.equal(calls.at(-1).id, 'gcal');
  assert.deepEqual(rows.map((x) => x.title), ['Toplantı']);
  await assert.rejects(() => p.calendarRange('2026-10-01', '2027-10-01')); // too long a range
  p.disconnect('gcal');
  assert.equal(p.data.tokens.gcal, undefined);
  assert.ok(p.data.configs.google); // the Google plugin stays
});

test('round 2: newest mails, smart home layout, accessory pictures, usage rings, tidier UI', () => {
  const main = read('app/main.cjs');
  assert.match(main, /safeHandler\('workspace-mail-recent'/);
  assert.match(main, /\.slice\(0, 6\)/);
  assert.match(main, /safeHandler\('workspace-home-layout'/);
  assert.match(main, /safeHandler\('workspace-calendar-add'/);
  // v0.7.2: the smart home and calendar cards moved to their own files
  const dash = read('src/workspace/dashboard.ts') + read('src/workspace/home.ts') + read('src/workspace/calendar.ts');
  for (const s of ['Son e-postalar', 'Cihaz ekle', 'function sync(', 'Google Takvim’e ekle', 'ws-ring', 'Haftalık'])
    assert.ok(dash.includes(s), s);
  assert.match(read('src/vendor/slime/outfits.ts'), /export function accessoryIcon\(/);
  assert.match(read('src/island/wardrobe.ts'), /accessoryIcon\(outfit as any, 40\)/);
  assert.doesNotMatch(read('src/workspace/sidebar.ts'), /Tüm servisler hazır/);
  assert.match(read('src/settings/gcal-card.ts'), /pluginsLogin\('gcal'\)/);
  assert.match(read('public/styles/9-special.css'), /left: 113px/);
  assert.match(read('public/styles/9-special.css'), /#composer-bar > \*/);
});
