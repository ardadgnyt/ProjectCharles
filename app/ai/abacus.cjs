// v0.8.0: Abacus AI through its official command line tool (`abacusai`), like Cursor, Gemini
// and Claude. The tool is not shipped with Charles: whoever has an Abacus AI account installs
// it (https://abacus.ai/help/abacusai-desktop/cli-installation) and Charles finds it.
//
// Safety, like the other CLIs: chat mode runs read-only (--permission-mode plan, shell and
// file edits denied) in Charles' own empty workspace; project mode follows Charles' access
// setting (plan, or accept-edits without the shell). The permission-bypassing mode
// (yolo / --dangerously-skip-permissions) is never used.
const fs = require('node:fs');
const path = require('node:path');

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]{0,80}$/i;
const MAX_PROMPT = 28000; // Windows command lines stop at 32 767 characters

const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

/** npm's abacusai.cmd shim → the JavaScript file it starts. */
function parseNpmShim(text, shimDir) {
  const m = /"%(?:~)?dp0%?\\?([^"%]+?\.(?:c?js|mjs))"/i.exec(String(text || '')) || /"%dp0%\\([^"]+?\.(?:c?js|mjs))"/i.exec(String(text || ''));
  if (!m) return null;
  const parts = m[1].split(/[\\/]+/).filter(Boolean);
  const abs = path.join(shimDir, ...parts);
  // the script must sit inside npm's own folder next to the shim
  const back = path.relative(shimDir, abs);
  if (back.startsWith('..') || path.isAbsolute(back)) return null;
  return abs;
}

function onPath(name, env, exists) {
  for (const dir of String(env.PATH || env.Path || '').split(';').filter(Boolean)) {
    const f = path.join(dir.replace(/^"|"$/g, ''), name);
    if (exists(f)) return f;
  }
  return null;
}

/**
 * Where `abacusai` is installed → { exe, args } (a native program, or node + the npm script),
 * or null. `fsx` can be replaced in tests.
 */
function findAbacus(env = process.env, fsx = fs) {
  const exists = (f) => {
    try {
      return fsx.statSync(f).isFile();
    } catch {
      return false;
    }
  };
  const home = env.USERPROFILE || env.HOME || '';
  const local = env.LOCALAPPDATA || (home && path.join(home, 'AppData', 'Local'));
  const roaming = env.APPDATA || (home && path.join(home, 'AppData', 'Roaming'));
  const native = [
    env.CHARLES_ABACUSAI && /\.exe$/i.test(env.CHARLES_ABACUSAI) ? env.CHARLES_ABACUSAI : '',
    local && path.join(local, 'Programs', 'abacusai', 'abacusai.exe'),
    local && path.join(local, 'abacusai', 'abacusai.exe'),
    home && path.join(home, '.abacusai', 'bin', 'abacusai.exe'),
    home && path.join(home, '.local', 'bin', 'abacusai.exe'),
    onPath('abacusai.exe', env, exists),
  ].filter(Boolean);
  for (const f of native) if (exists(f)) return { exe: f, args: [], kind: 'exe' };
  // npm install -g: a .cmd shim; run its script with Node directly (no cmd.exe, so nothing in
  // a message can be read as a shell command)
  const shims = [roaming && path.join(roaming, 'npm', 'abacusai.cmd'), onPath('abacusai.cmd', env, exists)].filter(Boolean);
  for (const shim of shims) {
    if (!exists(shim)) continue;
    let script = null;
    try {
      script = parseNpmShim(fsx.readFileSync(shim, 'utf8'), path.dirname(shim));
    } catch {}
    if (!script || !exists(script)) continue;
    const node = [path.join(path.dirname(shim), 'node.exe'), onPath('node.exe', env, exists), env.ProgramFiles && path.join(env.ProgramFiles, 'nodejs', 'node.exe')]
      .filter(Boolean)
      .find(exists);
    if (node) return { exe: node, args: [script], kind: 'npm' };
  }
  return null;
}

/** "codex/gpt-6.1-sol" → "GPT-6.1-Sol". */
function prettyModel(id) {
  const base = String(id).split('/').pop();
  return base
    .split('-')
    .map((w) => (/^(gpt|ai|llm|o\d)$/i.test(w) ? w.toUpperCase() : /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('-');
}

/** Saved model list (providers/abacus.json) → [[id, label]], checked. */
function cleanModels(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    const id = Array.isArray(m) ? m[0] : m?.id;
    const name = Array.isArray(m) ? m[1] : m?.name;
    if (typeof id !== 'string' || !MODEL_ID.test(id) || id === 'auto' || out.some((x) => x[0] === id)) continue;
    out.push([id, typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : prettyModel(id)]);
    if (out.length >= 60) break;
  }
  return out;
}

// v0.8.0: the account's models are read from the CLI itself (no typing ids by hand). The CLI
// documents its model picker only as the interactive /model command, so these read-only
// listing commands are tried in order; the first one that prints model ids wins.
const MODEL_LIST_COMMANDS = [['models', '--json'], ['models'], ['model', 'list'], ['--list-models']];
const LISTED_ID = /^[a-z0-9][a-z0-9-]{0,30}\/[a-z0-9][a-z0-9._:-]{0,60}$/i;

/** CLI output (JSON or text lines) → [[id, name]] of "provider/model" ids. */
function parseAbacusModels(text) {
  const out = [];
  const add = (id, name) => {
    id = String(id || '').trim();
    if (!LISTED_ID.test(id) || id.includes(':') || out.some((m) => m[0] === id)) return;
    const label = typeof name === 'string' && name.trim() && name.trim() !== id ? name.trim().slice(0, 40) : prettyModel(id);
    out.push([id, label]);
  };
  const clean = stripAnsi(text).trim();
  try {
    const v = JSON.parse(clean);
    const list = Array.isArray(v) ? v : Array.isArray(v?.models) ? v.models : Array.isArray(v?.data) ? v.data : [];
    for (const m of list) typeof m === 'string' ? add(m) : add(m?.id || m?.model, m?.name || m?.displayName || m?.display_name);
    if (out.length) return out.slice(0, 60);
  } catch {}
  for (const raw of clean.split(/\r?\n/)) {
    const line = raw.replace(/^[\s*•>›❯\-–|]+/, '').replace(/\s*\((?:current|default|selected|new chat only)[^)]*\)\s*/gi, ' ').trim();
    const m = /^([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._:-]*)(?:\s+[-–—:|]\s+(.+?)|\s{2,}(.+?))?\s*$/i.exec(line);
    if (m) add(m[1], (m[2] || m[3] || '').replace(/\s{2,}.*$/, ''));
    if (out.length >= 60) break;
  }
  return out;
}

/** The command line for one message. */
function abacusPlan({ model, prompt, mode, access, projectDir, workspace }) {
  const tools = mode === 'project' && !!projectDir;
  const level = ['ask', 'auto', 'full'].includes(access) ? access : 'ask';
  if (typeof prompt !== 'string' || !prompt.trim()) throw Error('Mesaj boş.');
  if (prompt.length > MAX_PROMPT) throw Error('Bu mesaj Abacus AI komut satırı için çok uzun (en fazla 28.000 karakter). Belgeyi kısalt ya da başka bir model seç.');
  const cli = ['-p', prompt, '--no-agents-md'];
  if (model && model !== 'auto') {
    if (!MODEL_ID.test(model)) throw Error('Geçersiz Abacus AI model kimliği.');
    cli.push('--model', model);
  }
  const deny = ['Bash', 'Bash(*)', 'mcp__*'];
  if (!tools || level === 'ask') {
    cli.push('--permission-mode', 'plan');
    if (!tools) deny.push('Edit', 'Write', 'Read', 'WebFetch');
  } else cli.push('--permission-mode', 'accept-edits');
  for (const d of deny) cli.push('--disallowed-tools', d);
  return { cli, cwd: tools ? projectDir : workspace, tools, timeoutMs: tools ? 20 * 60 * 1000 : 180000 };
}

/** The answer text from `abacusai -p` output, or null. */
function abacusAnswer(stdout) {
  const text = stripAnsi(stdout)
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(✓|›|>)?\s*(Update available|Checking for updates|Logged in as)/i.test(l))
    .join('\n')
    .trim();
  return text || null;
}

/** Environment for one run: no self-update, no AGENTS.md, no colours. */
function abacusEnv(env) {
  const out = { ...env, ABACUS_AUTO_UPDATE: 'off', ABACUS_AUTO_LOAD_AGENTS_MD: 'false', NO_COLOR: '1', FORCE_COLOR: '0' };
  delete out.ELECTRON_RUN_AS_NODE;
  return out;
}

module.exports = { findAbacus, parseNpmShim, prettyModel, cleanModels, parseAbacusModels, MODEL_LIST_COMMANDS, abacusPlan, abacusAnswer, abacusEnv, MODEL_ID, MAX_PROMPT };
