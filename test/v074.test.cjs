// v0.7.4 Beta: Claude quota ping, WhatsApp send, reminder card, indoor climate
// from Home Assistant, side panel fixes, window snapping, weekly summary in hours.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('Claude quota: an idle 5-hour window shows as full; refresh pings Claude quietly to renew', async () => {
  const { claudeUsage, ClaudeUsage } = require('../app/usage/claude-usage.cjs');
  const idle = claudeUsage({ five_hour: null, seven_day: { utilization: 20, resets_at: 2e9 } });
  assert.deepEqual(idle.fiveHour, { remaining: 100, resetsAt: null, idle: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-074-'));
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'a', expiresAt: 0 } }));
  let pinged = 0;
  let calls = 0;
  const u = new ClaudeUsage(dir, {
    ping: async () => (pinged++, true),
    fetcher: async () => {
      calls++;
      return calls === 1
        ? { status: 401, ok: false }
        : { status: 200, ok: true, json: async () => ({ five_hour: { utilization: 3, resets_at: 2e9 }, seven_day: { utilization: 30, resets_at: 2e9 } }) };
    },
    refreshSession: async () => {},
  });
  const v = await u.read(true);
  assert.equal(pinged, 1);
  assert.equal(v.fiveHour.remaining, 97);
  // not more than once every two minutes
  u.cache = null;
  await u.read(true);
  assert.equal(pinged, 1);
  const pr = read('app/ai/providers.cjs');
  assert.match(pr, /'--model',\s*'haiku'/);
  assert.match(pr, /'--no-session-persistence'/);
  assert.match(pr, /'--tools',\s*''/);
});

test('WhatsApp: the window is found by its title, brought forward and checked before keys', async () => {
  const wa = require('../app/system/whatsapp.cjs');
  assert.match(wa.WA_SCRIPT, /EnumWindows/);
  assert.match(wa.WA_SCRIPT, /GetForegroundWindow\(\) -eq \$h/);
  assert.match(wa.WA_SCRIPT, /Ctrl\(0x46\)/); // Ctrl+F: search by name
  // the name and message go in as base64 JSON, never pasted into the script text
  const script = wa.waScript({ mode: 'search', name: "Ali'; Remove-Item C:\\", message: 'x', send: true });
  assert.doesNotMatch(script, /Remove-Item/);
  // flows
  const opened = [];
  const calls = [];
  const contacts = { find: (n) => (n === 'Annem' ? { name: 'Annem', phone: '+905551112233' } : null), read: () => ({ autoSend: true }) };
  const deps = {
    contacts,
    openExternal: async (u) => opened.push(u),
    automate: async (cfg) => (calls.push(cfg), { ok: true, sent: cfg.mode === 'enter' || cfg.send }),
  };
  assert.match(await wa.sendWhatsApp({ to: 'Annem', message: 'Eve geldim' }, deps), /gönderildi/);
  assert.equal(opened[0], 'whatsapp://send?phone=905551112233&text=Eve%20geldim');
  assert.deepEqual(calls[0], { mode: 'enter' });
  // not saved: WhatsApp is opened and the person is searched by name
  assert.match(await wa.sendWhatsApp({ to: 'Ahmet', message: 'Selam' }, deps), /gönderildi/);
  assert.equal(opened[1], 'whatsapp://');
  assert.deepEqual(calls[1], { mode: 'search', name: 'Ahmet', message: 'Selam', send: true });
  // the search failed: WhatsApp opens with the text
  const failed = { ...deps, automate: async () => ({ ok: false }) };
  assert.match(await wa.sendWhatsApp({ to: 'Ahmet', message: 'Selam' }, failed), /açamadım/);
  // clipboard comes back after a search
  const clip = { v: 'eski', readText() { return this.v; }, writeText(t) { this.v = t; } };
  const r = await wa.automateWhatsApp({ mode: 'search', name: 'A', message: 'B', send: true }, { clipboard: clip, run: async () => 'sent' });
  assert.deepEqual([r.ok, r.sent], [true, true]);
  clip.v = 'B';
  await new Promise((res) => setTimeout(res, 450));
  assert.equal(clip.v, 'eski');
});
test('Home Assistant: indoor temperature and humidity questions are answered from sensors', () => {
  const { climateQuestion, climateAnswer } = require('../app/plugins/home-climate.cjs');
  const rows = [
    { id: 'sensor.salon_sicaklik', title: 'Salon Sıcaklık', text: '22.5', unit: '°C', deviceClass: 'temperature' },
    { id: 'sensor.salon_nem', title: 'Salon Nem', text: '48', unit: '%', deviceClass: 'humidity' },
    { id: 'sensor.dis_sicaklik', title: 'Dış sıcaklık', text: '9', unit: '°C', deviceClass: 'temperature' },
    { id: 'climate.termostat', title: 'Termostat', text: 'heat', attrs: { current_temperature: 23.5 } },
  ];
  for (const q of ['Evin içi kaç derece?', 'evde sıcaklık kaç', 'nem oranı ne', 'how warm is it inside?'])
    assert.ok(climateQuestion(q), q);
  for (const q of ['dışarısı kaç derece', 'hava nasıl', 'bugün kaç derece', 'klimayı 22 dereceye ayarla'])
    assert.equal(climateQuestion(q), null, q);
  // "hava" (air) in a device name is not an outdoor sensor
  const purifier = [
    { id: 'sensor.hava_sikici_sicaklik', title: 'Hava Sikici Sıcaklık', text: '24', unit: '°C', deviceClass: 'temperature' },
    { id: 'sensor.hava_sikici_nem', title: 'Hava Sikici Nem', text: '48', unit: '%', deviceClass: 'humidity' },
  ];
  assert.equal(climateAnswer(purifier, climateQuestion('şuanda evin içi kaç derece')), 'Evin içi şu an 24 °C (Hava Sikici Sıcaklık). Nem oranı %48 (Hava Sikici Nem).');
  const hc = require('../app/plugins/home-climate.cjs');
  assert.ok(hc.mentionsClimate('Hava sikici ölçüyor sıcaklık ve nem değerlerini'));
  assert.match(hc.homeContext(purifier), /Hava Sikici Nem \(sensor\.hava_sikici_nem\): 48 %/);
  assert.match(read('app/main.cjs'), /<ev_sensorleri>/);
  const a = climateAnswer(rows, climateQuestion('evin içi kaç derece'));
  assert.match(a, /ortalama 23 °C/);
  assert.match(a, /Nem oranı %48/);
  assert.doesNotMatch(a, /Dış/);
  assert.match(climateAnswer(rows, climateQuestion('salon kaç derece')), /22,5 °C \(Salon Sıcaklık\)/);
  assert.match(climateAnswer([], climateQuestion('evin içi kaç derece')), /bulamadım/);
  assert.deepEqual(require('../app/plugins/plugin-commands.cjs').parse('Evin içi kaç derece?').climate.temperature, true);
  assert.match(read('app/plugins/plugins.cjs'), /deviceClass:/);
  assert.match(read('app/voice/live-plugins.cjs'), /request\.climate/);
});

test('side panel: terminal opens in its own console, Notepad++ and missing-app warnings', () => {
  const ow = require('../app/system/open-with.cjs');
  const t = ow.terminalCommand('C:\\Users\\x\\Proje');
  assert.match(t.line, /start "/);
  assert.match(t.line, /"C:\\Users\\x\\Proje"/);
  assert.throws(() => ow.terminalCommand('C:\\a"b'), /açılamıyor/);
  assert.equal(ow.missing('notepadpp'), 'Notepad++ bu bilgisayarda yüklü değil.');
  assert.equal(ow.hasProtocol(() => '', 'vscode://'), false);
  assert.equal(ow.hasProtocol(() => 'Visual Studio Code', 'vscode://'), true);
  const sp = read('src/workspace/side-panel.ts');
  for (const s of ['Notepad++ ile aç', 'Düzeltme öner', 'ws-panel-findrow', "highlights"]) assert.ok(sp.includes(s), s);
  const css = read('public/styles/9-special.css');
  assert.match(css, /\.ws-gutter,\n\.ws-code \{[^}]*user-select: text;/);
  assert.match(read('app/main.cjs'), /ow\.missing\('vscode'\)/);
});

test('reminders are hard to miss; weekly summary in hours and minutes', () => {
  const ra = read('src/island/reminder-alert.ts');
  assert.match(ra, /10 dk ertele/);
  assert.match(ra, /reminder-add/);
  const main = read('app/main.cjs');
  assert.match(main, /new Notification\(\{\s*title: item\.kind === 'focus'/);
  assert.match(read('src/settings/personal.ts'), /reminderAlert\(item/);
  const wk = read('src/settings/shortcuts.ts');
  assert.match(wk, /\['Bilgisayarda toplam süre', duration\(/);
  assert.doesNotMatch(wk, /\/ 60\) \+ ' dk'\]/);
  const { englishFor } = (() => {
    const esbuild = require('esbuild');
    const out = esbuild.buildSync({ entryPoints: [path.join(root, 'src/settings/i18n.ts')], bundle: true, format: 'cjs', platform: 'node', write: false });
    const m = { exports: {} };
    new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
    return m.exports;
  })();
  assert.equal(englishFor('72 sa 14 dk'), '72 h 14 min');
  assert.equal(englishFor('3 sa 5 dk · aktif 2 sa 1 dk'), '3 h 5 min · active 2 h 1 min');
});

test('app window: a real Windows window (Snap, caption buttons) sharing the page with the island', () => {
  const main = read('app/main.cjs');
  assert.match(main, /new BaseWindow\(\{[\s\S]*?titleBarStyle: 'hidden',\s*titleBarOverlay:/);
  assert.match(main, /new WebContentsView\(/);
  assert.match(main, /view\.setBackgroundColor\('#00000000'\)/);
  assert.match(main, /function moveView\(to\)/);
  // closing the app window returns to the island; closing the island never quits
  assert.match(main, /appWin\.on\('close', \(event\) => \{\s*if \(quitting\) return;\s*event\.preventDefault\(\);\s*setWorkspace\(false\);/);
  assert.match(main, /win\.on\('close', \(event\) => \{\s*if \(quitting\) return;\s*event\.preventDefault\(\);/);
  assert.doesNotMatch(main, /dialog\.show(Open|Save)Dialog\(win,/); // dialogs need the real window
  const css = read('public/styles/9-special.css');
  assert.match(css.match(/\.ws-titlebar \{[^}]*\}/)[0], /-webkit-app-region: drag;/);
  // v0.9.8: Windows drags through the title bar; when the press reaches the page, Charles moves it
  assert.match(read('src/workspace/workspace.ts'), /api\.workspaceWindow\('drag-start'\)/);
  // push-to-talk was taken out again
  assert.ok(!fs.existsSync(path.join(root, 'app/system/push-to-talk.cjs')));
  assert.doesNotMatch(read('src/renderer.ts'), /pushToTalk/);
});

test('side panel: Charles’ own work (pictures, its chat folder) does not open the panel or the terminal', () => {
  const sp = read('src/workspace/side-panel.ts');
  assert.match(sp, /function open\(tab: Tab, reveal = true\)/);
  assert.match(sp, /if \(!item\.cwd \|\| internal\(item\.cwd\) \|\| internal\(item\.command \|\| ''\)\) return;/);
  assert.match(sp, /text: terminal \}, false\)/); // commands never pop the panel open
  assert.match(sp, /chat-workspace\|AppData/);
});
