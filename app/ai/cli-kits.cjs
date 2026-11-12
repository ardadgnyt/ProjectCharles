// v0.9.27: GitHub Copilot as an AI connection through its own official command line tool (Copilot
// CLI), the way Abacus AI is connected (app/ai/abacus.cjs). The tool is not shipped with Charles:
// whoever has the account installs it, signs in with it, and Charles finds it and talks to it. It
// works with what the account's own plan allows; the plan's models are asked from the tool, again
// every hour, so a changed plan shows up by itself.
//
// A "kit" says: where the tool is installed, how one message is sent, how the answer is read, how to
// sign in, and how its models are listed. app/ai/providers.cjs drives a kit through the same branches
// as Abacus AI. (Kimi and OpenCode were kits too in the first builds of v0.9.27 and were taken out
// again before the release.)
//
// Safety, as for every CLI connection: a chat runs without tools in Charles' own empty folder;
// project mode gets reading, or reading and editing, never the shell, and never a mode that skips
// permissions (--allow-all / --yolo).
//
// What is known from where: GitHub Docs and the tool's own --help (1.0.109, on the user's computer):
// -p, -s, --model, --reasoning-effort, --no-ask-user, --no-custom-instructions, --allow-tool /
// --deny-tool (shell, write, read, url). With VS Code installed, `copilot` is VS Code's own launcher
// (bin\copilot-shim): it runs the same tool and is the usual way to have it on Windows. The account's
// models come from a session opened over `--acp`. Answers are read as plain text.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseNpmShim } = require('./abacus.cjs');

const MAX_PROMPT = 28000; // Windows command lines stop at 32 767 characters
const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

const isFile = (fsx) => (f) => {
  try {
    return fsx.statSync(f).isFile();
  } catch {
    return false;
  }
};
function onPath(name, env, exists, skip = null) {
  for (const dir of String(env.PATH || env.Path || '').split(';').filter(Boolean)) {
    const f = path.join(dir.replace(/^"|"$/g, ''), name);
    if (skip && skip.test(f)) continue;
    if (exists(f)) return f;
  }
  return null;
}
function folders(env) {
  const home = env.USERPROFILE || env.HOME || '';
  return {
    home,
    local: env.LOCALAPPDATA || (home && path.join(home, 'AppData', 'Local')),
    roaming: env.APPDATA || (home && path.join(home, 'AppData', 'Roaming')),
  };
}
/** A program among `candidates`, or node + the script of an npm shim called `shimName`. */
function findTool({ env, fsx, candidates, shimName }) {
  const exists = isFile(fsx);
  for (const f of candidates.filter(Boolean)) if (exists(f)) return { exe: f, args: [], kind: 'exe' };
  const { roaming } = folders(env);
  for (const shim of [roaming && path.join(roaming, 'npm', shimName), onPath(shimName, env, exists)].filter(Boolean)) {
    if (!exists(shim)) continue;
    let script = null;
    try {
      script = parseNpmShim(fsx.readFileSync(shim, 'utf8'), path.dirname(shim));
    } catch {}
    if (!script || !exists(script)) continue;
    const node = [path.join(path.dirname(shim), 'node.exe'), onPath('node.exe', env, exists), env.ProgramFiles && path.join(env.ProgramFiles, 'nodejs', 'node.exe')].filter(Boolean).find(exists);
    if (node) return { exe: node, args: [script], kind: 'npm' };
  }
  return null;
}

function checkPrompt(prompt, name) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw Error('Mesaj boş.');
  if (prompt.length > MAX_PROMPT) throw Error(`Bu mesaj ${name} komut satırı için çok uzun (en fazla 28.000 karakter). Belgeyi kısalt ya da başka bir model seç.`);
}
const NEEDS_LOGIN = /not (?:logged|signed) in|please (?:log ?in|sign in|authenticate)|no (?:auth|credentials|token|provider)|unauthori[sz]ed|authentication (?:required|failed)|\b401\b|invalid (?:api )?(?:key|token)|\/login|auth login/i;
const NEEDS_PLAN = /quota|premium request|usage limit|rate limit|\b429\b|\b402\b|billing|subscription|insufficient|exceeded|not (?:available|included) (?:on|in) your plan/i;
// "Model "grok-4.7" is not available.": the account's plan does not have that model
const NO_MODEL = /model\b.{1,90}\bis not available|model not found|unknown model|invalid model/i;
/** Plain-text output of one run → { text, error, reason }. */
function textAnswer(name, stdout, stderr, code, noise = null) {
  let text = stripAnsi(stdout).replace(/\r/g, '');
  if (noise) text = text.split('\n').filter((l) => !noise.test(l)).join('\n');
  text = text.trim();
  const said = stripAnsi(stderr).slice(-1500);
  // a refusal is told apart from an answer by the exit code first; an answer about "login" is an answer
  const refusal = code ? said + '\n' + text.slice(0, 400) : !text ? said : '';
  if (refusal && NEEDS_LOGIN.test(refusal)) return { text: '', error: `${name} oturumu açık değil. Ayarlar → AI Modelleri → ${name} kartından giriş yap, sonra Bağlantıyı kontrol et’e bas.`, reason: 'login' };
  if (refusal && NO_MODEL.test(refusal)) return { text: '', error: `${name} hesabın bu modeli kullanamıyor. Otomatik’i ya da listeden başka bir model seç.`, reason: 'model' };
  if (refusal && NEEDS_PLAN.test(refusal)) return { text: '', error: `${name} bu hesabın kullanım hakkının dolduğunu ya da planının bu modeli kapsamadığını bildirdi. Başka bir model seç ya da daha sonra yeniden dene.`, reason: 'quota' };
  if (text && !code) return { text, error: '' };
  const last = said.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || '';
  return { text: '', error: `${name} yanıt vermedi.` + (last ? ' (' + last.slice(0, 200) + ')' : ''), reason: 'error' };
}

const COPILOT_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
/**
 * The models the signed-in account may really use. `copilot help config` lists every id the tool
 * knows (27 of them), and the second build of v0.9.27 offered all of those: on an account whose plan
 * has only "Auto", each one answered "Model … is not available". The tool tells the account's own
 * list when a session is opened over its Agent Client Protocol mode (`--acp`): nothing is sent to a
 * model for it. → [[id, name, []]], or null when the tool did not tell (not signed in, too old).
 */
function parseAcpModels(result) {
  const list = result?.models?.availableModels;
  if (!Array.isArray(list)) return null;
  const rows = [];
  for (const m of list) {
    const id = String(m?.modelId || '');
    const state = m?._meta?.copilotEnablement;
    if (id === 'auto' || !COPILOT_MODEL.test(id) || (state && state !== 'enabled') || rows.some((r) => r[0] === id)) continue;
    rows.push([id, typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 40) : copilotName(id), []]);
    if (rows.length >= 80) break;
  }
  return rows;
}
function copilotAccountModels(exe, args, { cwd, env, timeoutMs = 25000, spawnFn = spawn } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(exe, [...args, '--acp', '--no-custom-instructions'], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      return resolve(null);
    }
    let buf = '';
    let done = false;
    const end = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => end(null), timeoutMs);
    const send = (id, method, params) => {
      try {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      } catch {
        end(null);
      }
    };
    child.on('error', () => end(null));
    child.on('close', () => end(null));
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 4e6) return end(null);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        let m = null;
        try {
          m = line ? JSON.parse(line) : null;
        } catch {}
        if (!m || typeof m !== 'object') continue;
        if (m.id === 1) m.result ? send(2, 'session/new', { cwd, mcpServers: [] }) : end(null);
        else if (m.id === 2) end(m.result ? parseAcpModels(m.result) : null);
      }
    });
    send(1, 'initialize', { protocolVersion: 1, clientCapabilities: {} });
  });
}
/** "claude-sonnet-5.5" → "Claude Sonnet 5.5", "gpt-6.1-sol" → "GPT 6.1 Sol". */
function copilotName(id) {
  return id
    .split('-')
    .map((w) => (/^(gpt|mai)$/i.test(w) ? w.toUpperCase() : /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// ── GitHub Copilot ─────────────────────────────────────────────────────────────────────────────
const COPILOT_MODEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const copilot = {
  id: 'copilot',
  name: 'GitHub Copilot',
  docs: 'https://docs.github.com/copilot/how-tos/copilot-cli',
  find(env = process.env, fsx = fs) {
    const { home, local, roaming } = folders(env);
    // A tool installed by itself comes first; VS Code's launcher (bin\copilot-shim\copilot.exe)
    // runs the same GitHub Copilot CLI and counts too. The first build of v0.9.27 left it out and
    // so found nothing on a computer where VS Code is the only place Copilot came from.
    const launcher = /copilot-shim/i;
    const exists = isFile(fsx);
    const own = findTool({
      env,
      fsx,
      shimName: 'copilot.cmd',
      candidates: [
        env.CHARLES_COPILOT && /\.exe$/i.test(env.CHARLES_COPILOT) ? env.CHARLES_COPILOT : '',
        roaming && path.join(roaming, 'npm', 'node_modules', '@github', 'copilot', 'node_modules', '@github', 'copilot-win32-x64', 'copilot.exe'),
        local && path.join(local, 'Microsoft', 'WinGet', 'Links', 'copilot.exe'),
        home && path.join(home, '.local', 'bin', 'copilot.exe'),
        onPath('copilot.exe', env, exists, launcher),
      ],
    });
    if (own) return own;
    const vscode = [
      onPath('copilot.exe', env, exists),
      local && path.join(local, 'Programs', 'Microsoft VS Code', 'bin', 'copilot-shim', 'copilot.exe'),
      local && path.join(local, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'copilot-shim', 'copilot.exe'),
      env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft VS Code', 'bin', 'copilot-shim', 'copilot.exe'),
    ].filter(Boolean).find(exists);
    return vscode ? { exe: vscode, args: [], kind: 'vscode' } : null;
  },
  env(base) {
    const out = { ...base, NO_COLOR: '1', FORCE_COLOR: '0' };
    delete out.ELECTRON_RUN_AS_NODE;
    delete out.COPILOT_ALLOW_ALL; // never the mode that approves everything
    return out;
  },
  plan({ model, prompt, mode, access, projectDir, workspace, imageDir = null, effort = '' }) {
    const tools = mode === 'project' && !!projectDir;
    checkPrompt(prompt, 'GitHub Copilot');
    // -s: only the answer. --no-ask-user: never waits for a person. Deny wins over allow.
    // --no-custom-instructions: a chat does not pick up AGENTS.md files of whatever folder it is in.
    const cli = ['-p', prompt, '-s', '--no-ask-user', '--no-custom-instructions', '--deny-tool=shell', '--deny-tool=url'];
    if (tools) {
      cli.push('--allow-tool=read');
      cli.push(access === 'ask' ? '--deny-tool=write' : '--allow-tool=write');
    } else {
      cli.push('--deny-tool=write');
      // pictures the user attached are opened from their own folder; otherwise nothing is read
      cli.push(imageDir ? '--allow-tool=read' : '--deny-tool=read');
    }
    if (model && model !== 'auto') {
      if (!COPILOT_MODEL.test(model)) throw Error('Geçersiz GitHub Copilot model kimliği.');
      cli.push('--model=' + model);
      if (effort) {
        if (!COPILOT_EFFORTS.includes(effort)) throw Error('Geçersiz GitHub Copilot efor düzeyi.');
        cli.push('--reasoning-effort=' + effort);
      }
    }
    return { cli, cwd: tools ? projectDir : imageDir || workspace, tools, timeoutMs: tools ? 20 * 60 * 1000 : 300000 };
  },
  answer: (stdout, stderr, code) => textAnswer('GitHub Copilot', stdout, stderr, code),
  loginArgs: ['login'],
  loginHint: "Write-Host 'Charles: GitHub Copilot girisi icin tarayici acilacak. GitHub hesabinla izin ver; bitince bu pencereyi kapat ve Charles ayarlarinda Baglantiyi kontrol et dugmesine bas. (Sign in with GitHub in the browser, then press Check connection in Charles.)'",
  // the account's own models come from the tool's ACP mode; its help text lists every id it knows,
  // which is not what an account may use
  modelCommands: [],
  parseModels: () => [],
  listModels: (exe, args, options) => copilotAccountModels(exe, args, options),
  effortLabel: (value) => VARIANT_LABELS[String(value).toLowerCase()] || String(value),
  modelId: COPILOT_MODEL,
};

const VARIANT_LABELS = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High', max: 'Max' };

const KITS = { copilot };

module.exports = { KITS, findTool, textAnswer, parseAcpModels, copilotAccountModels, MAX_PROMPT, COPILOT_MODEL };
