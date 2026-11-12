// v0.9.27: Kimi (Moonshot AI) through its official command line tool, Kimi Code (`kimi`), like
// Claude, Cursor and Abacus AI. The tool is not shipped with Charles: whoever has a Kimi account
// installs it (https://moonshotai.github.io/kimi-code/) and Charles finds it. It works with
// whatever the account's plan allows; Charles neither needs nor checks a paid plan.
//
// Written from the tool's own source (@moonshot-ai/kimi-code 2.6.0, MIT):
//   kimi login --region global          device-code sign-in; the link and the code go to stderr
//   kimi -p <text> --output-format stream-json [-m <alias>] [--agent-file <file>]
//                                        one answer, as JSON lines: {role:'assistant',content,
//                                        tool_calls}, {role:'tool',…}, {role:'meta',…}, {type:'error'}
//   <home>/credentials/kimi-code*.json  the session (access_token, refresh_token, expires_at). The
//                                        name depends on the sign-in address: a global account is
//                                        kept as kimi-code-env-<id>.json, and its addresses end in
//                                        kimi.ai (config.toml names them). The access token lasts
//                                        15 minutes; the tool renews it with the refresh token.
//   <home>/config.toml                  the account's models, written by the tool at sign-in
//   GET <base>/usages                   { usages: { limit_5h, limit_7d: { used_ratio, reset_time } } }
//
// Charles gives the tool a home of its own (%APPDATA%\Charles\providers\kimi\home, KIMI_CODE_HOME),
// so a Kimi Code the user runs by hand keeps its own settings and sessions.
//
// Safety, like the other CLIs: `-p` approves every tool call by itself, so what the model may use
// is decided before it starts, by an agent file whose `tools` list is a whitelist. A chat gets no
// tools at all; project mode gets reading, or reading and editing, never the shell.
const fs = require('node:fs');
const path = require('node:path');
const { parseNpmShim } = require('./abacus.cjs');

const MODEL_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,90}$/;
const EFFORT = /^[a-z][a-z0-9_-]{0,20}$/;
const MAX_PROMPT = 28000; // Windows command lines stop at 32 767 characters
const BASE_URL = 'https://api.kimi.com/coding/v1';

const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

function onPath(name, env, exists) {
  for (const dir of String(env.PATH || env.Path || '').split(';').filter(Boolean)) {
    const f = path.join(dir.replace(/^"|"$/g, ''), name);
    if (exists(f)) return f;
  }
  return null;
}

/** Where `kimi` is installed → { exe, args, kind } (a program, or node + the npm script), or null. */
function findKimi(env = process.env, fsx = fs) {
  const exists = (f) => {
    try {
      return fsx.statSync(f).isFile();
    } catch {
      return false;
    }
  };
  const home = env.USERPROFILE || env.HOME || '';
  const local = env.LOCALAPPDATA || (home && path.join(home, 'AppData', 'Local'));
  const roaming = env.APPDATA_REAL || env.APPDATA || (home && path.join(home, 'AppData', 'Roaming'));
  const native = [
    env.CHARLES_KIMI && /\.exe$/i.test(env.CHARLES_KIMI) ? env.CHARLES_KIMI : '',
    home && path.join(home, '.kimi-code', 'bin', 'kimi.exe'),
    home && path.join(home, '.local', 'bin', 'kimi.exe'),
    local && path.join(local, 'Programs', 'kimi-code', 'kimi.exe'),
    local && path.join(local, 'kimi-code', 'kimi.exe'),
    local && path.join(local, 'kimi-code', 'bin', 'kimi.exe'),
    onPath('kimi.exe', env, exists),
  ].filter(Boolean);
  for (const f of native) if (exists(f)) return { exe: f, args: [], kind: 'exe' };
  // npm install -g: a .cmd shim; its script is run with Node directly (no cmd.exe, so nothing in a
  // message can be read as a shell command)
  const shims = [roaming && path.join(roaming, 'npm', 'kimi.cmd'), onPath('kimi.cmd', env, exists)].filter(Boolean);
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

/** Environment for one run: Charles' own Kimi home, no self-update, no colours. */
function kimiEnv(env, home) {
  const out = { ...env, KIMI_CODE_HOME: home, KIMI_CODE_NO_AUTO_UPDATE: '1', NO_COLOR: '1', FORCE_COLOR: '0' };
  // these would switch the tool to another account or model behind the user's back
  for (const k of Object.keys(out)) if (/^(KIMI_MODEL_|KIMI_API_KEY$|KIMI_CODE_BASE_URL$|KIMI_CODE_OAUTH_HOST$|KIMI_OAUTH_HOST$)/.test(k)) delete out[k];
  delete out.ELECTRON_RUN_AS_NODE;
  return out;
}

// ── the session ────────────────────────────────────────────────────────────────────────────────
/**
 * The file that holds the session: kimi-code.json, or kimi-code-env-<id>.json for an account of
 * the global service. v0.9.27's first build looked for the first name only, so a sign-in that had
 * worked was reported as "not finished". With several, the newest one counts.
 */
function sessionFile(home, fsx = fs) {
  const dir = path.join(home, 'credentials');
  let names = [];
  try {
    names = fsx.readdirSync(dir).filter((n) => /^kimi-code(?:-env-[A-Za-z0-9_-]+)?\.json$/.test(n));
  } catch {
    // a reader that cannot list (tests): the plain name
    names = ['kimi-code.json'];
  }
  const stamp = (n) => {
    try {
      return fsx.statSync(path.join(dir, n)).mtimeMs || 0;
    } catch {
      return 0;
    }
  };
  return names.sort((a, b) => stamp(b) - stamp(a)).map((n) => path.join(dir, n))[0] || null;
}
/** The stored session, or null. Never logged, never copied anywhere. */
function readSession(home, fsx = fs) {
  try {
    const file = sessionFile(home, fsx);
    if (!file) return null;
    const v = JSON.parse(fsx.readFileSync(file, 'utf8'));
    const access = typeof v?.access_token === 'string' ? v.access_token : '';
    const refresh = typeof v?.refresh_token === 'string' ? v.refresh_token : '';
    if (!access && !refresh) return null;
    const expires = Number(v.expires_at);
    return { access, refresh: !!refresh, expiresAt: Number.isFinite(expires) ? (expires > 1e12 ? expires : expires * 1000) : null, file };
  } catch {
    return null;
  }
}

const KIMI_HOST = /^https:\/\/(?:[a-z0-9-]+\.)*kimi\.(?:com|ai)(?:\/[A-Za-z0-9._~\/-]*)?$/;
/** The service addresses the account uses (config.toml), only when they are Kimi's own. */
function endpoints(home, fsx = fs) {
  let config = { baseUrl: '', oauthHost: '' };
  try {
    config = parseConfig(fsx.readFileSync(path.join(home, 'config.toml'), 'utf8'));
  } catch {}
  const clean = (v, fallback) => (typeof v === 'string' && KIMI_HOST.test(v.replace(/\/+$/, '')) ? v.replace(/\/+$/, '') : fallback);
  return { base: clean(config.baseUrl, BASE_URL), auth: clean(config.oauthHost, 'https://auth.kimi.com') };
}

const CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098'; // Kimi Code's own public client id
/**
 * Renews an access token that ran out, the way the tool itself does (one form post with the refresh
 * token). The file is rewritten only after Kimi answered with a complete new session, through a
 * temporary file, so a failure of any kind leaves the session as it was. → the session, or null.
 */
async function renewSession(home, { fetcher = globalThis.fetch, now = Date.now(), fsx = fs } = {}) {
  const file = sessionFile(home, fsx);
  let stored;
  try {
    stored = JSON.parse(fsx.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (typeof stored?.refresh_token !== 'string' || !stored.refresh_token) return null;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 10000);
  try {
    const res = await fetcher(endpoints(home, fsx).auth + '/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: stored.refresh_token }).toString(),
      signal: control.signal,
    });
    if (res.status !== 200) return null;
    const data = await res.json();
    const expiresIn = Number(data?.expires_in);
    if (typeof data?.access_token !== 'string' || !data.access_token || typeof data?.refresh_token !== 'string' || !data.refresh_token || !(expiresIn > 0)) return null;
    const next = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(now / 1000) + expiresIn,
      scope: typeof data.scope === 'string' ? data.scope : stored.scope || '',
      token_type: typeof data.token_type === 'string' ? data.token_type : stored.token_type || 'Bearer',
      expires_in: expiresIn,
    };
    const tmp = `${file}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
    fsx.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
    fsx.renameSync(tmp, file);
    return readSession(home, fsx);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
const signedIn = (home, fsx = fs) => !!readSession(home, fsx);

/** The link and the code `kimi login` prints while it waits. */
function parseLogin(text) {
  const clean = stripAnsi(text);
  const url = /Opening browser for Kimi device login:\s*(https:\/\/[^\s]+)/i.exec(clean)?.[1] || /(https:\/\/[^\s]*kimi\.(?:com|ai)[^\s]*)/i.exec(clean)?.[1] || '';
  const code = /enter code:\s*([A-Z0-9-]{4,20})/i.exec(clean)?.[1] || '';
  const safe = /^https:\/\/([a-z0-9-]+\.)*kimi\.(com|ai)(\/|$|\?)/i.test(url) ? url : '';
  return { url: safe, code, done: /Logged in to /i.test(clean), failed: /Login (failed|cancelled)[^\n]*/i.exec(clean)?.[0] || '' };
}

// ── the account's models (config.toml) ─────────────────────────────────────────────────────────
function tomlValue(raw) {
  const s = raw.trim().replace(/\s+#.*$/, '');
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (/^'[^']*'$/.test(s)) return s.slice(1, -1);
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^\[[\s\S]*\]$/.test(s)) return [...s.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => (m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/**
 * The model tables of Kimi Code's config.toml → { models: [{ id, name, efforts, defaultEffort,
 * vision }], defaultModel, effort }. Only what Charles shows is read; a file it cannot read gives
 * an empty list (the picker then has "Kimi · Otomatik" alone).
 */
function parseConfig(text) {
  const out = { models: [], defaultModel: '', effort: '', baseUrl: '', oauthHost: '' };
  let section = '';
  let current = null;
  const pick = (o, ...names) => names.map((n) => o[n]).find((v) => v !== undefined);
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const head = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (head) {
      section = head[1];
      const m = /^models\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.:/-]+))$/.exec(section);
      current = null;
      if (m) {
        const id = m[1] || m[2] || m[3];
        if (MODEL_ALIAS.test(id) && !out.models.some((x) => x.id === id) && out.models.length < 40) {
          current = { id, raw: {} };
          out.models.push(current);
        }
      }
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const value = tomlValue(kv[2]);
    if (current) current.raw[kv[1]] = value;
    else if (section === '' && /^default_?model$/i.test(kv[1]) && typeof value === 'string') out.defaultModel = value;
    else if (section === 'thinking' && kv[1] === 'effort' && typeof value === 'string') out.effort = value;
    else if (section === 'providers."managed:kimi-code"' && /^base_?url$/i.test(kv[1]) && typeof value === 'string') out.baseUrl = value;
    else if (section === 'providers."managed:kimi-code".oauth' && /^oauth_?host$/i.test(kv[1]) && typeof value === 'string') out.oauthHost = value;
    else if (section === '' && kv[1] === 'thinking') out.effort = /effort\s*=\s*"([^"]+)"/.exec(kv[2])?.[1] || out.effort;
  }
  out.models = out.models.map(({ id, raw }) => {
    const efforts = pick(raw, 'support_efforts', 'supportEfforts');
    const caps = pick(raw, 'capabilities');
    const name = pick(raw, 'display_name', 'displayName');
    const def = pick(raw, 'default_effort', 'defaultEffort');
    return {
      id,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : prettyModel(id),
      efforts: Array.isArray(efforts) ? efforts.filter((e) => typeof e === 'string' && EFFORT.test(e)).slice(0, 8) : [],
      defaultEffort: typeof def === 'string' && EFFORT.test(def) ? def : '',
      vision: Array.isArray(caps) && caps.includes('image_in'),
    };
  });
  return out;
}

/** "kimi-code/kimi-k3.1-pro" → "K3.1 Pro". */
function prettyModel(id) {
  const base = String(id).split('/').pop().replace(/^kimi-?/i, '');
  return (
    base
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => (/^k\d/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ') || String(id)
  );
}

/** How a level is named in Charles (Kimi's own app says Standart / Yüksek / Maksimum). */
const EFFORT_LABELS = { off: 'Kapalı', low: 'Standart', standard: 'Standart', medium: 'Orta', high: 'Yüksek', max: 'Maksimum', maximum: 'Maksimum', xhigh: 'Maksimum' };
const effortLabel = (value) => EFFORT_LABELS[value] || String(value);

/**
 * config.toml with the reasoning level for the next run. Kimi Code has no command line option for
 * it (the level is the `effort` of the `[thinking]` table), so Charles sets it in the config of its
 * own Kimi home. '' removes Charles' choice and the model's own default applies.
 */
function withEffort(text, effort) {
  const value = String(effort || '');
  if (value && !EFFORT.test(value)) throw Error('Geçersiz akıl yürütme düzeyi.');
  const lines = String(text || '').split(/\r?\n/);
  // an inline `thinking = { … }` at the top becomes a table, so there is one place to write to
  const inline = lines.findIndex((l) => /^\s*thinking\s*=\s*\{/.test(l));
  if (inline >= 0) lines.splice(inline, 1);
  const start = lines.findIndex((l) => /^\s*\[\s*thinking\s*\]\s*$/.test(l));
  if (start < 0) {
    if (!value) return lines.join('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return [...lines, '', '[thinking]', `effort = "${value}"`, ''].join('\n');
  }
  let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  if (end < 0) end = lines.length;
  const at = lines.findIndex((l, i) => i > start && i < end && /^\s*effort\s*=/.test(l));
  if (at >= 0) {
    if (value) lines[at] = `effort = "${value}"`;
    else lines.splice(at, 1);
  } else if (value) lines.splice(start + 1, 0, `effort = "${value}"`);
  return lines.join('\n');
}

// ── one message ────────────────────────────────────────────────────────────────────────────────
const AGENTS = {
  // a chat: no tools at all
  chat: { name: 'charles-chat', tools: [], about: 'Charles sohbeti: araç yok.' },
  // pictures the user attached are opened from their own folder, nothing else
  pictures: { name: 'charles-pictures', tools: ['Read'], about: 'Charles sohbeti: yalnızca eklenen görselleri açar.' },
  web: { name: 'charles-web', tools: ['WebSearch', 'FetchURL'], about: 'Charles sohbeti: yalnızca web araması.' },
  read: { name: 'charles-read', tools: ['Read', 'Glob', 'Grep'], about: 'Charles proje modu: yalnızca okuma.' },
  edit: { name: 'charles-edit', tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'], about: 'Charles proje modu: okuma ve düzenleme, komut yok.' },
};
/**
 * The agent file that decides the tools of one run (`tools` is a whitelist; [] means none). The
 * description is a quoted string: the tool reads the header as YAML, and a plain value with a colon
 * in it ("Charles sohbeti: araç yok.") made it refuse the whole file.
 */
function agentFile(kind) {
  const a = AGENTS[kind];
  if (!a) throw Error('Geçersiz Kimi çalışma türü.');
  return {
    name: a.name + '.md',
    text: ['---', `name: ${a.name}`, `description: ${JSON.stringify(a.about)}`, `tools: [${a.tools.join(', ')}]`, 'subagents: []', '---', '', 'Kullanıcının isteğini yanıtla. Sana verilmeyen bir aracı kullanmaya çalışma.', ''].join('\n'),
  };
}
function agentKind({ tools, access, imageDir, task }) {
  if (tools) return access === 'ask' ? 'read' : 'edit';
  if (task === 'web' || task === 'research') return 'web';
  return imageDir ? 'pictures' : 'chat';
}

/** The command line for one message. `agentPath` is the agent file written for this kind of run. */
function kimiPlan({ model, prompt, mode, access, projectDir, workspace, imageDir = null, task = '', agentPath }) {
  const tools = mode === 'project' && !!projectDir;
  const level = ['ask', 'auto', 'full'].includes(access) ? access : 'ask';
  if (typeof prompt !== 'string' || !prompt.trim()) throw Error('Mesaj boş.');
  if (prompt.length > MAX_PROMPT) throw Error('Bu mesaj Kimi komut satırı için çok uzun (en fazla 28.000 karakter). Belgeyi kısalt ya da başka bir model seç.');
  if (!agentPath) throw Error('Kimi için araç tanımı eksik.');
  const cli = ['-p', prompt, '--output-format', 'stream-json', '--agent-file', agentPath];
  if (model && model !== 'auto') {
    if (!MODEL_ALIAS.test(model)) throw Error('Geçersiz Kimi model kimliği.');
    cli.push('-m', model);
  }
  return { cli, cwd: tools ? projectDir : imageDir || workspace, tools, kind: agentKind({ tools, access: level, imageDir, task }), timeoutMs: tools ? 20 * 60 * 1000 : 300000 };
}

const TOOL_KIND = { Bash: 'commandExecution', Write: 'fileChange', Edit: 'fileChange', WebSearch: 'webSearch', FetchURL: 'webSearch' };
/** One JSON line of the answer → the steps it reports ([{ method, item }]), for the steps list. */
function kimiItems(event) {
  const out = [];
  if (event?.role === 'assistant' && Array.isArray(event.tool_calls))
    for (const call of event.tool_calls) {
      const name = String(call?.function?.name || '');
      if (!call?.id || !name) continue;
      let input = {};
      try {
        input = JSON.parse(call.function.arguments || '{}') || {};
      } catch {}
      const target = String(input.path || input.file_path || input.pattern || input.query || input.url || input.command || '').slice(0, 300);
      const type = TOOL_KIND[name] || 'mcpToolCall';
      const item =
        type === 'commandExecution'
          ? { type, command: target }
          : type === 'fileChange'
            ? { type, changes: [{ path: target }] }
            : type === 'webSearch'
              ? { type, query: target }
              : { type, tool: /^(Read|Glob|Grep)$/.test(name) ? 'read_file' : name, command: target || name };
      out.push({ method: 'item/started', item: { id: String(call.id), status: 'inProgress', ...item } });
    }
  if (event?.role === 'tool' && event.tool_call_id) out.push({ method: 'item/completed', item: { id: String(event.tool_call_id), type: 'mcpToolCall', status: 'completed' } });
  return out;
}

const NEEDS_LOGIN = /not logged in|please (?:log ?in|run .*login)|\/login|unauthori[sz]ed|authorization failed|\b401\b|no (?:default )?model (?:is )?configured|token (?:has )?expired/i;
const NEEDS_PLAN = /quota|usage limit|rate limit|\b429\b|membership|subscription|plan does not|insufficient|exceeded/i;
/**
 * The whole output of one run → { text, error }. The answer is every assistant text in order; an
 * error line or an empty answer is turned into a sentence the user can act on.
 */
function kimiAnswer(stdout, stderr = '', code = 0) {
  const parts = [];
  let failure = '';
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e?.type === 'error') failure = String(e.message || e.code || 'error');
    else if (e?.role === 'assistant' && typeof e.content === 'string' && e.content.trim()) parts.push(e.content.trim());
  }
  const text = parts.join('\n\n').trim();
  if (text && !failure && !code) return { text, error: '' };
  const said = stripAnsi(failure + '\n' + stderr).slice(-1500);
  if (NEEDS_LOGIN.test(said)) return { text: '', error: 'Kimi oturumu açık değil ya da süresi dolmuş. Ayarlar → AI Modelleri → Kimi’den yeniden giriş yap.', reason: 'login' };
  if (NEEDS_PLAN.test(said)) return { text, error: 'Kimi bu hesabın kullanım hakkının dolduğunu ya da planının bu modeli kapsamadığını bildirdi. Kalan kullanımına bak ya da başka bir model seç.', reason: 'quota' };
  if (text) return { text, error: '' };
  const last = said.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(Warning:|To resume this session|See log:|\d+ \||-+\^)/i.test(l)).pop() || '';
  return { text: '', error: 'Kimi yanıt vermedi.' + (last ? ' (' + last.slice(0, 200) + ')' : ''), reason: 'error' };
}

// ── remaining usage ────────────────────────────────────────────────────────────────────────────
function usageWindow(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const used = Number(raw.used_ratio);
  if (!Number.isFinite(used)) return null;
  // a ratio (0 … 1); a service that answers in percent is read as percent
  const percent = used > 1.5 ? used : used * 100;
  const reset = typeof raw.reset_time === 'string' ? Date.parse(raw.reset_time) : NaN;
  return { remaining: Math.max(0, Math.min(100, Math.round((100 - percent) * 10) / 10)), resetsAt: Number.isFinite(reset) && reset > now ? Math.floor(reset / 1000) : null };
}
/** Kimi Code's usage answer in the shape the island's gauges read. */
function kimiQuota(body, now = Date.now()) {
  const u = body && typeof body === 'object' ? body.usages : null;
  const fiveHour = usageWindow(u?.limit_5h, now);
  const weekly = usageWindow(u?.limit_7d, now);
  const result = { provider: 'kimi', fiveHour, weekly, credits: null, blocked: null, updatedAt: now };
  if (fiveHour || weekly) {
    result.blocked = fiveHour?.remaining === 0 || weekly?.remaining === 0;
    result.missingWindows = [!fiveHour && 'fiveHour', !weekly && 'weekly'].filter(Boolean);
  } else {
    // an account Kimi keeps no allowance windows for answers with an empty object (seen with a real
    // account): that is "no information", not a failed read
    const empty = body && typeof body === 'object' && !Array.isArray(body) && (!u || !Object.keys(u).length);
    result.unavailable = empty ? 'Bilgi yok' : 'Kota bilgisi okunamadı';
  }
  return result;
}
/** Reads the usage with the stored session. The token goes to Kimi's own address only. */
async function fetchUsage(home, { fetcher = globalThis.fetch, now = Date.now(), fsx = fs, renew = true } = {}) {
  let session = readSession(home, fsx);
  const none = (message) => ({ provider: 'kimi', fiveHour: null, weekly: null, credits: null, blocked: null, updatedAt: now, unavailable: message });
  if (!session) return none('Kimi hesabı bağlı değil');
  // the access token lasts 15 minutes: one that ran out is renewed first (never while the tool
  // itself is answering, which renews it too)
  if (!session.access || (session.expiresAt && session.expiresAt < now + 30000)) {
    if (renew && session.refresh) session = (await renewSession(home, { fetcher, now, fsx })) || session;
    if (!session.access || (session.expiresAt && session.expiresAt < now)) return none('Oturum yenilenince görünecek');
  }
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 8000);
  try {
    const res = await fetcher(endpoints(home, fsx).base + '/usages', { headers: { Authorization: 'Bearer ' + session.access, Accept: 'application/json' }, signal: control.signal });
    if (res.status === 401) return none('Oturum yenilenince görünecek');
    if (!res.ok) return none('Kota bilgisi okunamadı');
    return kimiQuota(await res.json(), now);
  } catch {
    return none('Kota bilgisi okunamadı');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { findKimi, kimiEnv, readSession, sessionFile, endpoints, renewSession, signedIn, parseLogin, parseConfig, prettyModel, effortLabel, withEffort, agentFile, agentKind, kimiPlan, kimiItems, kimiAnswer, kimiQuota, fetchUsage, MODEL_ALIAS, MAX_PROMPT, BASE_URL, AGENTS };
