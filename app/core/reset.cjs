// v0.7.1: Ayarlar → Hesap → reset. Charles writes reset-request.json and restarts with
// --reset-local; on the next start, before anything reads them, the chosen files are moved
// into %APPDATA%\Charles\reset-backup-<time> (nothing is deleted).
//   scope 'all'      → chats, memory, settings, plugin and AI connections
//   scope 'accounts' → only the account connections (plugins, Gemini Live key, services,
//                      the Claude/Gemini sign-ins Charles keeps in providers/)
const fs = require('node:fs');
const path = require('node:path');

const ACCOUNT_FILES = ['plugins.enc.json', 'gemini-live.enc.json', 'services.enc.json', 'evren.enc.json'];
const ACCOUNT_DIRS = ['providers'];
const DATA_FILES = [
  'personal.json',
  'charles-history.json',
  'display.json',
  'preferences.json',
  'companion.json',
  'resource-history.sqlite',
  'weekly.json',
  'computer-time.json',
  'shortcuts.json',
];
const DATA_DIRS = ['chat-workspace', 'inbox', 'voice-temp'];

function request(dir, scope) {
  if (!['all', 'accounts'].includes(scope)) throw Error('Geçersiz sıfırlama seçimi.');
  fs.writeFileSync(path.join(dir, 'reset-request.json'), JSON.stringify({ scope, at: Date.now() }));
}

// Called at start-up with --reset-local. Without a request file (setup\Reset-Charles.cmd)
// the data files are reset as before.
function apply(dir, now = Date.now()) {
  let scope = 'data';
  const marker = path.join(dir, 'reset-request.json');
  try {
    const r = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (['all', 'accounts'].includes(r.scope)) scope = r.scope;
  } catch {}
  try {
    fs.rmSync(marker, { force: true });
  } catch {}
  const files = scope === 'accounts' ? ACCOUNT_FILES : scope === 'all' ? [...DATA_FILES, ...ACCOUNT_FILES] : DATA_FILES;
  const dirs = scope === 'accounts' ? ACCOUNT_DIRS : scope === 'all' ? [...DATA_DIRS, ...ACCOUNT_DIRS] : [];
  const backup = path.join(dir, 'reset-backup-' + now);
  const moved = [];
  const move = (name) => {
    const from = path.join(dir, name);
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(backup, { recursive: true });
    try {
      fs.renameSync(from, path.join(backup, name));
      moved.push(name);
    } catch {}
  };
  for (const name of files) for (const suffix of ['', '.bak', '.tmp']) move(name + suffix);
  for (const name of dirs) move(name);
  return { scope, backup: moved.length ? backup : null, moved };
}

module.exports = { request, apply, ACCOUNT_FILES, DATA_FILES };
