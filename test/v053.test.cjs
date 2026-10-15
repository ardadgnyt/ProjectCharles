// v0.5.3: system watchdog, mail dates → calendar proposals, Charles' proposals registry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Watchdog } = require('../app/system/watchdog.cjs');
const {
  parseDeadline,
  reminderTimes,
  icsFile,
  deadlineProposal,
} = require('../app/plugins/deadlines.cjs');
const { parseVerdicts, triageMail, triagePrompt } = require('../app/plugins/mail-triage.cjs');
const { Proposals } = require('../app/core/proposals.cjs');
const { MailAlerts } = require('../app/plugins/mail-alerts.cjs');

test('watchdog warns after two high CPU samples and names the top app', () => {
  let t = 1e9;
  const warned = [];
  const w = new Watchdog({ warn: (x) => warned.push(x), now: () => t });
  const sample = {
    cpu: 93,
    ram: 40,
    apps: [
      { name: 'chrome.exe', cpu: 20, ram: 900 },
      { name: 'blender.exe', cpu: 70, ram: 2048 },
    ],
  };
  assert.equal(w.check(sample).length, 0);
  const out = w.check(sample);
  assert.equal(out.length, 1);
  assert.equal(out[0].metric, 'cpu');
  assert.equal(out[0].app, 'blender');
  assert.match(out[0].text, /blender/);
  // cooldown: no repeat for 20 minutes
  t += 60000;
  w.check(sample);
  assert.equal(w.check(sample).length, 0);
  t += 21 * 60000;
  w.check(sample);
  assert.equal(warned.length, 2);
});

test('watchdog: a normal sample resets the streak; RAM and disk warnings', () => {
  const w = new Watchdog({ now: () => 5e9 });
  w.check({ cpu: 95, ram: 10, apps: [] });
  w.check({ cpu: 20, ram: 10, apps: [] });
  assert.equal(w.check({ cpu: 95, ram: 10, apps: [] }).length, 0);
  w.check({ cpu: 0, ram: 95, apps: [{ name: 'Code.exe', cpu: 1, ram: 3072 }] });
  const ram = w.check({ cpu: 0, ram: 95, apps: [{ name: 'Code.exe', cpu: 1, ram: 3072 }] });
  assert.equal(ram[0].metric, 'ram');
  assert.match(ram[0].text, /Code .*3\.0 GB/);
  const disk = w.check({ cpu: 0, ram: 10, diskFree: 2 * 1024 ** 3, diskTotal: 500 * 1024 ** 3 });
  assert.equal(disk[0].metric, 'disk');
  assert.match(disk[0].text, /2\.0 GB/);
});

test('parseDeadline accepts local dates in the future only', () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  const d = parseDeadline('2026-10-20', now);
  assert.equal(d.allDay, true);
  assert.equal(new Date(d.at).getDate(), 20);
  const t = parseDeadline('2026-10-20T14:30', now);
  assert.equal(t.allDay, false);
  assert.equal(new Date(t.at).getHours(), 14);
  assert.equal(parseDeadline('2026-10-01', now), null);
  assert.equal(parseDeadline('2026-02-31', now), null);
  assert.equal(parseDeadline('yarın', now), null);
  assert.equal(parseDeadline('2028-01-01', now), null);
});

test('reminders: day before + same morning for all-day, 24 h / 2 h for timed', () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  const all = reminderTimes(parseDeadline('2026-10-20', now), now).map((x) => new Date(x));
  assert.deepEqual(
    all.map((d) => [d.getDate(), d.getHours()]),
    [
      [19, 10],
      [20, 9],
    ],
  );
  const timed = parseDeadline('2026-10-20T14:00', now);
  assert.deepEqual(reminderTimes(timed, now), [timed.at - 24 * 3600000, timed.at - 2 * 3600000]);
  // close deadline: only the reminders still in the future
  const soon = parseDeadline('2026-10-14T20:00', now);
  assert.deepEqual(reminderTimes(soon, now), [soon.at - 2 * 3600000]);
});

test('ics file is a valid single event', () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  const ics = icsFile({ title: 'Staj; son gün', ...parseDeadline('2026-10-20', now) }, now);
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261020/);
  assert.match(ics, /DTEND;VALUE=DATE:20261021/);
  assert.match(ics, /SUMMARY:Staj\\; son gün/);
});

test('deadline proposal adds reminders and writes the calendar file', async () => {
  const now = Date.now();
  const due = new Date(now + 5 * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  const added = [];
  const personal = { edit: (action, args) => added.push({ action, ...args }) };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-cal-'));
  const opened = [];
  const p = deadlineProposal({
    mail: { title: 'Başvuru hatırlatması' },
    deadline: iso,
    event: 'Staj başvurusu son gün',
    personal,
    dir,
    open: (f) => opened.push(f),
  });
  assert.match(p.text, /Takvime ekleyip/);
  assert.deepEqual(
    p.actions.map((a) => a.id),
    ['calendar', 'remind', 'no'],
  );
  const reply = await p.actions[0].run();
  assert.equal(added.length, 2);
  assert.ok(added.every((a) => a.action === 'reminder-add' && a.due > now));
  assert.equal(opened.length, 1);
  assert.match(fs.readFileSync(opened[0], 'utf8'), /SUMMARY:Staj başvurusu son gün/);
  assert.match(reply, /hatırlatacağım/);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(deadlineProposal({ mail: {}, deadline: 'yok', personal, dir, open() {} }), null);
});

test('triage keeps deadline and event from the AI answer', async () => {
  const v = parseVerdicts(
    '[{"n":1,"important":true,"reason":"Son tarih","deadline":"2026-10-20","event":"Ödev teslimi"},{"n":2,"important":true,"deadline":"20 Ekim"}]',
    2,
  );
  assert.equal(v.get(0).deadline, '2026-10-20');
  assert.equal(v.get(0).event, 'Ödev teslimi');
  assert.equal(v.get(1).deadline, null);
  const mails = [{ id: '1', kind: 'gmail', title: 'Ödev', from: 'Hoca', text: 'Cuma teslim' }];
  const picked = await triageMail(mails, {
    ask: async () =>
      '[{"n":1,"important":true,"reason":"Teslim","deadline":"2026-10-16T23:59","event":"Ödev"}]',
  });
  assert.equal(picked[0].deadline, '2026-10-16T23:59');
  assert.match(triagePrompt(mails, ''), /Bugün: \d{4}-\d{2}-\d{2}/);
});

test('mail alerts pass dates on and charles bubbles open the panel', async () => {
  const deadlines = [];
  const focused = [];
  const plugins = { data: { rules: '' } };
  const bubble = { add() {}, onOpen: null };
  const alerts = new MailAlerts({
    plugins,
    bubble,
    ask: async () =>
      '[{"n":1,"important":true,"reason":"x","deadline":"2026-12-01","event":"Sınav"}]',
    ingest: () => ({}),
    explain() {},
    deadline: (d) => deadlines.push(d),
    focus: (item) => focused.push(item),
  });
  await alerts.mail([{ id: 'a', kind: 'gmail', title: 'Sınav duyurusu' }]);
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].event, 'Sınav');
  await alerts.open({ id: 'charles|x', kind: 'charles' });
  assert.equal(focused.length, 1);
});

test('proposals run the chosen action once', async () => {
  const shown = [];
  const p = new Proposals({ show: (x) => shown.push(x) });
  let ran = 0;
  const id = p.add({
    text: 'Soru?',
    actions: [
      { id: 'yes', label: 'Evet', primary: true, run: () => (ran++, 'Tamam') },
      { id: 'no', label: 'Hayır' },
    ],
  });
  assert.equal(shown[0].id, id);
  assert.equal(shown[0].actions[0].run, undefined);
  await assert.rejects(p.answer(id, 'maybe'));
  assert.deepEqual(await p.answer(id, 'yes'), { reply: 'Tamam' });
  assert.equal(ran, 1);
  await assert.rejects(p.answer(id, 'yes'));
});
