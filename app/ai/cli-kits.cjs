// v0.9.27: three more AI connections through their own official command line tools, the way
// Abacus AI is connected (app/ai/abacus.cjs): Kimi (Kimi Code), GitHub Copilot (Copilot CLI) and
// OpenCode. None of the tools is shipped with Charles: whoever has the account installs the tool,
// signs in with it, and Charles finds it and talks to it. Each works with what the account's own
// plan allows (a free plan included, where the service has one); Charles checks no plan.
//
// One "kit" per tool says: where it is installed, how one message is sent, how the answer is read,
// how to sign in, and how its models are listed. app/ai/providers.cjs drives all three the same way.
//
// Safety, as for every CLI connection: a chat runs without tools in Charles' own empty folder;
// project mode gets reading, or reading and editing, never the shell, and never a mode that skips
// permissions (Copilot's --allow-all / --yolo, OpenCode's --dangerously-skip-permissions).
//
// What is known from where:
//   Kimi      the tool's own source (app/ai/kimi.cjs).
//   Copilot   GitHub Docs, "Copilot CLI programmatic reference": -p, -s, --model, --no-ask-user,
//             --allow-tool / --deny-tool (shell, write, read, url); requests that need an approval
//             nobody gives are denied in a non-interactive run.
//   OpenCode  its own program (opencode 1.19.5, read, not run): `opencode run [message..] -m
//             provider/model --variant <level>`, `opencode models --verbose` (a "provider/model" line,
//             then that model as JSON: name, cost, variants), `opencode auth login`, and the
//             `permission` config (edit, bash, webfetch: allow/ask/deny).
// Copilot and OpenCode could not be run on the development computer (no accounts there), so their
// answers are read as plain text, the most forgiving form, and every message has a clear error.
const fs = require('node:fs');
const path = require('node:path');
const kimi = require('./kimi.cjs');
const { parseNpmShim, parseAbacusModels } = require('./abacus.cjs');

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
/** Plain-text output of one run → { text, error, reason }. */
function textAnswer(name, stdout, stderr, code, noise = null) {
  let text = stripAnsi(stdout).replace(/\r/g, '');
  if (noise) text = text.split('\n').filter((l) => !noise.test(l)).join('\n');
  text = text.trim();
  const said = stripAnsi(stderr).slice(-1500);
  // a refusal is told apart from an answer by the exit code first; an answer about "login" is an answer
  const refusal = code ? said + '\n' + text.slice(0, 400) : !text ? said : '';
  if (refusal && NEEDS_LOGIN.test(refusal)) return { text: '', error: `${name} oturumu açık değil. Ayarlar → AI Modelleri → ${name} kartından giriş yap, sonra Bağlantıyı test et’e bas.`, reason: 'login' };
  if (refusal && NEEDS_PLAN.test(refusal)) return { text: '', error: `${name} bu hesabın kullanım hakkının dolduğunu ya da planının bu modeli kapsamadığını bildirdi. Başka bir model seç ya da daha sonra yeniden dene.`, reason: 'quota' };
  if (text && !code) return { text, error: '' };
  const last = said.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || '';
  return { text: '', error: `${name} yanıt vermedi.` + (last ? ' (' + last.slice(0, 200) + ')' : ''), reason: 'error' };
}

// ── GitHub Copilot ─────────────────────────────────────────────────────────────────────────────
const COPILOT_MODEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const copilot = {
  id: 'copilot',
  name: 'GitHub Copilot',
  docs: 'https://docs.github.com/copilot/how-tos/copilot-cli',
  find(env = process.env, fsx = fs) {
    const { home, local, roaming } = folders(env);
    // VS Code's own "copilot" is a stub that downloads the tool when first run: not used
    const stub = /copilot-shim/i;
    return findTool({
      env,
      fsx,
      shimName: 'copilot.cmd',
      candidates: [
        env.CHARLES_COPILOT && /\.exe$/i.test(env.CHARLES_COPILOT) ? env.CHARLES_COPILOT : '',
        roaming && path.join(roaming, 'npm', 'node_modules', '@github', 'copilot', 'node_modules', '@github', 'copilot-win32-x64', 'copilot.exe'),
        local && path.join(local, 'Microsoft', 'WinGet', 'Links', 'copilot.exe'),
        home && path.join(home, '.local', 'bin', 'copilot.exe'),
        onPath('copilot.exe', env, isFile(fsx), stub),
      ],
    });
  },
  env(base) {
    const out = { ...base, NO_COLOR: '1', FORCE_COLOR: '0' };
    delete out.ELECTRON_RUN_AS_NODE;
    delete out.COPILOT_ALLOW_ALL; // never the mode that approves everything
    return out;
  },
  plan({ model, prompt, mode, access, projectDir, workspace, imageDir = null }) {
    const tools = mode === 'project' && !!projectDir;
    checkPrompt(prompt, 'GitHub Copilot');
    // -s: only the answer. --no-ask-user: never waits for a person. Deny wins over allow.
    const cli = ['-p', prompt, '-s', '--no-ask-user', '--deny-tool=shell', '--deny-tool=url'];
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
    }
    return { cli, cwd: tools ? projectDir : imageDir || workspace, tools, timeoutMs: tools ? 20 * 60 * 1000 : 300000 };
  },
  answer: (stdout, stderr, code) => textAnswer('GitHub Copilot', stdout, stderr, code),
  loginArgs: ['login'],
  loginHint: "Write-Host 'Charles: GitHub Copilot girisi icin tarayici acilacak. GitHub hesabinla izin ver; bitince bu pencereyi kapat ve Charles ayarlarinda Baglantiyi test et dugmesine bas. (Sign in with GitHub in the browser, then press Test connection in Charles.)'",
  // the tool documents no command that prints the account's models: "Otomatik" is the tool's own choice
  modelCommands: [],
  parseModels: () => [],
  modelId: COPILOT_MODEL,
};

// ── OpenCode ───────────────────────────────────────────────────────────────────────────────────
const OPENCODE_MODEL = /^[a-z0-9][a-z0-9._-]{0,40}\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,80}$/i;
const opencode = {
  id: 'opencode',
  name: 'OpenCode',
  docs: 'https://opencode.ai/docs/',
  find(env = process.env, fsx = fs) {
    const { home, local, roaming } = folders(env);
    return findTool({
      env,
      fsx,
      shimName: 'opencode.cmd',
      candidates: [
        env.CHARLES_OPENCODE && /\.exe$/i.test(env.CHARLES_OPENCODE) ? env.CHARLES_OPENCODE : '',
        home && path.join(home, '.opencode', 'bin', 'opencode.exe'),
        roaming && path.join(roaming, 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe'),
        roaming && path.join(roaming, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
        home && path.join(home, 'scoop', 'shims', 'opencode.exe'),
        local && path.join(local, 'Microsoft', 'WinGet', 'Links', 'opencode.exe'),
        onPath('opencode.exe', env, isFile(fsx)),
      ],
    });
  },
  /** The permissions travel as the tool's own config, for this one process only. */
  env(base, { tools = false, access = 'ask' } = {}) {
    const permission = { edit: tools && access !== 'ask' ? 'allow' : 'deny', bash: 'deny', webfetch: 'deny' };
    const out = { ...base, NO_COLOR: '1', FORCE_COLOR: '0', OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission, autoupdate: false, share: 'disabled' }) };
    delete out.ELECTRON_RUN_AS_NODE;
    delete out.OPENCODE_PERMISSION;
    return out;
  },
  plan({ model, prompt, mode, projectDir, workspace, imageDir = null, effort = '' }) {
    const tools = mode === 'project' && !!projectDir;
    checkPrompt(prompt, 'OpenCode');
    const cli = ['run'];
    if (model && model !== 'auto') {
      if (!OPENCODE_MODEL.test(model)) throw Error('Geçersiz OpenCode model kimliği.');
      cli.push('-m', model);
      // the model's own reasoning level ("variant"): each model has its own set, read from the tool
      if (effort) {
        if (!VARIANT.test(effort)) throw Error('Geçersiz OpenCode efor düzeyi.');
        cli.push('--variant', effort);
      }
    }
    // the message is one argument of its own, after "--", so it can never be read as an option
    cli.push('--', prompt);
    return { cli, cwd: tools ? projectDir : imageDir || workspace, tools, timeoutMs: tools ? 20 * 60 * 1000 : 300000 };
  },
  answer: (stdout, stderr, code) => textAnswer('OpenCode', stdout, stderr, code, /^\s*(?:[|│>]\s+\w+\s|@\s*[\w./-]+\s*$|opencode\s+v?\d)/i),
  loginArgs: ['auth', 'login'],
  loginHint: "Write-Host 'Charles: OpenCode acilinca bir saglayici sec (ucretsiz modeller icin OpenCode Zen) ve girisi tamamla. Bitince bu pencereyi kapat ve Charles ayarlarinda Baglantiyi test et dugmesine bas. (Pick a provider, finish signing in, then press Test connection in Charles.)'",
  // --verbose adds each model's name and its levels; the plain list is the fallback
  modelCommands: [['models', '--verbose'], ['models']],
  parseModels: (out) => parseOpencodeModels(out),
  effortLabel: (value) => VARIANT_LABELS[String(value).toLowerCase()] || String(value),
  modelId: OPENCODE_MODEL,
};

const VARIANT = /^[A-Za-z][A-Za-z0-9_-]{0,20}$/;
const VARIANT_LABELS = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High', max: 'Max' };
/**
 * `opencode models --verbose` → [[id, name, levels]]. The tool prints a "provider/model" line and
 * then that model as JSON; `variants` holds the levels the model takes (some have "xhigh", some
 * have none at all). Without --verbose only the id lines are there and no model has a level.
 */
function parseOpencodeModels(text) {
  const lines = stripAnsi(text).replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length && out.length < 80; i++) {
    const id = lines[i].trim();
    if (!OPENCODE_MODEL.test(id) || out.some((m) => m[0] === id)) continue;
    let meta = null;
    if ((lines[i + 1] || '').trim().startsWith('{')) {
      // the JSON block: up to the line that closes its first brace
      let depth = 0;
      let block = '';
      let inString = false;
      let end = -1;
      for (let j = i + 1; j < lines.length && end < 0 && j < i + 4000; j++) {
        const line = lines[j];
        for (let k = 0; k < line.length; k++) {
          const c = line[k];
          if (inString) {
            if (c === '\\') k++;
            else if (c === '"') inString = false;
          } else if (c === '"') inString = true;
          else if (c === '{') depth++;
          else if (c === '}' && --depth === 0) end = j;
        }
        block += line + '\n';
      }
      if (end >= 0) {
        try {
          meta = JSON.parse(block);
        } catch {}
        i = end;
      }
    }
    const name = typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim().slice(0, 40) : parseAbacusModels(id)[0]?.[1] || id;
    const levels = meta?.variants && typeof meta.variants === 'object' ? Object.keys(meta.variants).filter((v) => VARIANT.test(v)).slice(0, 8) : [];
    out.push([id, name, levels]);
  }
  return out;
}

// ── Kimi (the richer kit lives in kimi.cjs) ────────────────────────────────────────────────────
const kimiKit = {
  id: 'kimi',
  name: 'Kimi',
  docs: 'https://moonshotai.github.io/kimi-code/',
  find: (env = process.env, fsx = fs) => kimi.findKimi(env, fsx),
  home: (dir) => path.join(dir, 'kimi', 'home'),
  env: (base, { dir }) => kimi.kimiEnv(base, path.join(dir, 'kimi', 'home')),
  /** Writes the agent file that decides this run's tools and returns the command line. */
  plan(args, { dir, fsx = fs }) {
    const tools = args.mode === 'project' && !!args.projectDir;
    const kind = kimi.agentKind({ tools, access: args.access, imageDir: args.imageDir, task: args.task });
    const file = kimi.agentFile(kind);
    const agents = path.join(dir, 'kimi', 'agents');
    fsx.mkdirSync(agents, { recursive: true });
    const agentPath = path.join(agents, file.name);
    fsx.writeFileSync(agentPath, file.text);
    return kimi.kimiPlan({ ...args, agentPath });
  },
  answer: (stdout, stderr, code) => kimi.kimiAnswer(stdout, stderr, code),
  items: (event) => kimi.kimiItems(event),
  modelId: kimi.MODEL_ALIAS,
};

const KITS = { kimi: kimiKit, copilot, opencode };

module.exports = { KITS, findTool, textAnswer, parseOpencodeModels, MAX_PROMPT, COPILOT_MODEL, OPENCODE_MODEL };
