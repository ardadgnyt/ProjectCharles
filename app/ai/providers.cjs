// Gemini (Antigravity), Claude Code, Cursor and (v0.8.0) Abacus AI CLIs: login, auth checks, chat answers, quotas.
const fs = require('node:fs'),
  path = require('node:path'),
  { spawn, execFile } = require('node:child_process'),
  { randomUUID } = require('node:crypto');
const { ClaudeUsage } = require('../usage/claude-usage.cjs');
const { launchPlan, claudeItems } = require('./provider-tools.cjs');
const { ASK_FORMAT } = require('../core/ask-format.cjs');
const abacus = require('./abacus.cjs');
const imagesKit = require('./provider-images.cjs');
const { Evren } = require('./evren.cjs');
// v0.8.0: every provider Charles can sign in to besides GPT
// v0.9.6: EVREN - an OpenAI-compatible HTTP API reached with the user's own API key.
const PROVIDERS = ['gemini', 'claude', 'cursor', 'abacus', 'evren'];
// Runs a CLI in a worker thread; resolves { error, out, err } like execFile's callback.
function runOffThread(exe, args, options) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    try {
      const { Worker } = require('node:worker_threads');
      const worker = new Worker(path.join(__dirname, 'probe-worker.cjs'), {
        workerData: { exe, args, options },
      });
      worker.once('message', (m) => {
        finish(m);
        void worker.terminate();
      });
      worker.once('error', (e) => finish({ error: { message: e.message }, out: '', err: '' }));
      worker.once('exit', () => finish({ error: { message: 'worker exited' }, out: '', err: '' }));
    } catch (e) {
      finish({ error: { message: e.message }, out: '', err: '' });
    }
  });
}
// Account checks are re-run in the background at most this often.
const AUTH_TTL = 10 * 60 * 1000;
const MODELS = [
  ['cursor:auto', 'Cursor · Auto'],
  ['gemini:auto', 'Antigravity · Otomatik'],
  ['gemini:pro', 'Antigravity · Pro'],
  ['gemini:flash', 'Antigravity · Flash'],
  ['claude:sonnet', 'Claude · Sonnet'],
  ['claude:opus', 'Claude · Opus'],
  ['claude:haiku', 'Claude · Haiku'],
];
// v0.7.3: Cursor's own models (Composer, Grok) next to Auto. The list comes from the signed-in
// account (`cursor-agent models`); only the Composer and Grok families are offered.
const CURSOR_FALLBACK = [['composer-2.5', 'Composer 2.5']];
const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '');
function parseGeminiModels(text) {
  const seen = new Set(), models = [];
  for (const line of stripAnsi(text).split(/\r?\n/)) {
    // v0.9.6: every model the Antigravity account lists (its Claude and GPT-OSS models too)
    // (an id always has a hyphen: "Fetching available models..." is not a model)
    const match = line.trim().match(/^([a-z0-9][a-z0-9._]*-[a-z0-9._-]{1,80})\s+([^\x00-\x1f]{1,120})$/i);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    models.push([match[1], match[2].trim()]);
    if (models.length === 100) break;
  }
  return models;
}
function prettyCursorName(id) {
  return id
    .split('-')
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/^Grok (\d)/, 'Grok $1');
}
/** `cursor-agent models` output → [[id, name]] for the Composer and Grok models. */
function parseCursorModels(text) {
  const out = [];
  const seen = new Set();
  for (const raw of stripAnsi(text).split(/\r?\n/)) {
    const line = raw.replace(/^[\s*•>\-–]+/, '').trim();
    const m = line.match(/^([a-z0-9][a-z0-9._-]*)(?:\s+[-–—:|]\s+(.+?))?\s*$/i);
    if (!m) continue;
    const id = m[1].toLowerCase();
    // v0.9.6: every model the Cursor account lists, not only Composer and Grok
    if (seen.has(id) || /^(auto|available|models?|loading|tip|usage)$/.test(id)) continue;
    seen.add(id);
    const name = String(m[2] || '')
      .replace(/\s*\((?:current|default|selected)[^)]*\)\s*/gi, ' ')
      .trim();
    out.push([id, name || prettyCursorName(id)]);
    if (out.length >= 120) break;
  }
  return out;
}
// v0.9.6: the effort levels each provider side offers (the panel next to the model picker).
// Every side keeps its own vocabulary and the rows print it as-is in every UI language —
// a level called "xLow" reads "xLow", not a translation of it. A model with no levels (the
// "Auto" rows, Cursor's Composer, Abacus AI) keeps "Otomatik" and the panel is locked.
// GPT is not here: Codex lists each model's own levels (app/ai/agent.cjs → models()).
const EFFORT_LEVELS = {
  gemini: [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
  ],
  // Claude Code's own --effort values (claude --help: low, medium, high, xhigh, max)
  claude: [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
    ['xhigh', 'Extra High'],
    ['max', 'Max'],
  ],
  cursor: [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
    ['xhigh', 'Extra High'],
  ],
  evren: [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
  ],
};
// Providers that take the level as a request parameter (the model id stays as it is). The
// others carry the level inside the model id itself ("gemini-4-argon-high", "grok-4.7-xhigh").
const EFFORT_BY_PARAM = new Set(['claude', 'evren']);
// Models that take no level even though their provider does: Claude Haiku and the Claude
// models before Opus/Sonnet 4.5 have no effort setting.
const NO_EFFORT = new Set(['claude:haiku']);
function noEffort(key) {
  if (NO_EFFORT.has(key)) return true;
  if (/^claude:claude-\d/.test(key)) return true; // Claude 3.x ids ("claude-3-opus-…")
  const m = /^claude:claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d))?(?:-|$)/.exec(key);
  if (!m) return false;
  if (m[1] === 'haiku') return true;
  if (m[1] === 'fable') return false;
  const version = Number(m[2]) + (m[3] ? Number(m[3]) / 10 : 0);
  return version < 4.5;
}
const EFFORT_RE = /-(low|medium|high|extra[-_]?high|xhigh|max|ultra|minimal)(-fast)?$/i;
const EFFORT_WORDS =
  '(?:low|medium|high|extra\\s*high|xhigh|max|ultra|minimal|d[uü]ş[uü]k|orta|y[uü]ksek|çok\\s*y[uü]ksek|maksimum)';
/** Splits "gemini-4-argon-high" into its model and its effort; a model without one is all model. */
function splitEffort(id) {
  const text = String(id || '');
  const m = EFFORT_RE.exec(text);
  if (!m) return { base: text, effort: null };
  // v0.9.6: Cursor's "-fast" variants are their own model ("grok-4.7-fast") with the same levels
  return { base: text.slice(0, m.index) + (m[2] || '').toLowerCase(), effort: m[1].toLowerCase().replace(/_/g, '-') };
}
/** The row label of one level: the provider's own spelling ("xLow" stays "xLow"). */
function effortLabel(provider, value) {
  const hit = (EFFORT_LEVELS[provider] || []).find(([key]) => key === value);
  return hit ? hit[1] : String(value || '');
}
/** Where one level sits in its provider's set (an unknown value sorts last). */
function effortOrder(provider, value) {
  const i = (EFFORT_LEVELS[provider] || []).findIndex(([key]) => key === value);
  return i < 0 ? 99 : i;
}
/** "Gemini 4 Argon (High)" -> "Gemini 4 Argon": the level lives in the effort panel now. */
function stripEffortName(name) {
  return String(name || '')
    .replace(new RegExp(`\\s*[([]\\s*${EFFORT_WORDS}\\s*[)\\]]\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s*[-–—:]?\\s*${EFFORT_WORDS}\\s*$`, 'i'), '')
    // "Grok 4.7 High Fast" -> "Grok 4.7 Fast"
    .replace(new RegExp(`\\s*[-–—:]?\\s*${EFFORT_WORDS}(\\s+fast)\\s*$`, 'i'), '$1')
    .trim();
}
/** [[id, name]] from Anthropic's model list ({ id, display_name }); ids only, newest first as
 *  listed; models that need extra usage credits (Fable) are left out. "Claude Opus 4.8" is shown as "Opus 4.8" (the provider is the menu's first step). */
function cleanClaudeModels(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const m of list) {
    const id = Array.isArray(m) ? m[0] : m?.id;
    const raw = Array.isArray(m) ? m[1] : m?.display_name || m?.id;
    if (typeof id !== 'string' || !/^claude-[a-z0-9._-]{1,80}$/i.test(id) || seen.has(id)) continue;
    // Fable models need extra usage credits on a subscription; the subscription's own models only
    if (/fable/i.test(id)) continue;
    seen.add(id);
    out.push([id, String(raw || id).replace(/^Claude\s+/i, '').slice(0, 80)]);
    if (out.length >= 60) break;
  }
  return out;
}
function subscriptionEnv(env, dir) {
  const result = { ...env };
  for (const k of Object.keys(result))
    if (
      /^(CURSOR_API_KEY$|CURSOR_API_ENDPOINT$|SSH_CONNECTION$|SSH_CLIENT$|SSH_TTY$|ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_USE_|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION)/i.test(
        k,
      )
    )
      delete result[k];
  return {
    ...result,
    CLAUDE_CONFIG_DIR: path.join(dir, 'claude'),
    GEMINI_CLI_HOME: path.join(dir, 'gemini'),
    ELECTRON_RUN_AS_NODE: '1',
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(dir, 'gemini-system.json'),
  };
}
// Emits an answer as item/started + agentMessage deltas over at most ~2 seconds.
function streamText(text, emit, id, done, tick = 16) {
  emit('item/started', { item: { id, type: 'agentMessage', text: '' } });
  const size = Math.max(6, Math.ceil(text.length / 120));
  let at = 0;
  const step = () => {
    if (at >= text.length) return done();
    const delta = text.slice(at, at + size);
    at += size;
    emit('item/agentMessage/delta', { itemId: id, delta });
    setTimeout(step, tick);
  };
  step();
}
class Providers {
  constructor(root, dir) {
    this.root = root;
    this.dir = path.join(dir, 'providers');
    fs.mkdirSync(this.dir, { recursive: true });
    for (const p of ['claude', 'gemini/.gemini', 'workspace'])
      fs.mkdirSync(path.join(this.dir, p), { recursive: true });
    this.env = subscriptionEnv(process.env, this.dir);
    this.geminiModels = [];
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(this.dir, 'gemini-models.json'), 'utf8'));
      if (Array.isArray(saved)) this.geminiModels = parseGeminiModels(saved.filter(x => Array.isArray(x) && x.length === 2 && x.every(v => typeof v === 'string' && !/[\r\n\t]/.test(v))).map(x => x.join('\t')).join('\n'));
    } catch {}
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(this.dir, 'cursor-models.json'), 'utf8'));
      if (Array.isArray(saved))
        this.cursorModels = saved.filter(
          (x) => Array.isArray(x) && /^[a-z0-9][a-z0-9._-]*$/.test(x[0]) && typeof x[1] === 'string',
        );
    } catch {}
    this.enabledFile = path.join(this.dir, 'enabled.json');
    try {
      this.enabled = JSON.parse(fs.readFileSync(this.enabledFile, 'utf8'));
    } catch {
      this.enabled = {};
    }
    fs.writeFileSync(
      path.join(this.dir, 'gemini-system.json'),
      JSON.stringify({
        security: { auth: { selectedType: 'oauth-personal', enforcedType: 'oauth-personal' } },
        tools: { core: [] },
        hooks: { enabled: false },
        mcpServers: {},
        telemetry: { enabled: false },
      }),
    );
    const agyConfig = path.join(this.dir, 'gemini/.gemini/antigravity-cli');
    fs.mkdirSync(agyConfig, { recursive: true });
    fs.writeFileSync(
      path.join(agyConfig, 'settings.json'),
      JSON.stringify({
        toolPermission: 'strict',
        allowNonWorkspaceAccess: false,
        useG1Credits: false,
        enableTelemetry: false,
        permissions: {
          deny: [
            'read_file(*)',
            'write_file(*)',
            'command(*)',
            'unsandboxed(*)',
            'mcp(*)',
            'read_url(*)',
            'execute_url(*)',
          ],
        },
      }),
    );
    fs.writeFileSync(
      path.join(this.dir, 'deny-tools.toml'),
      '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n',
    );
    const cursorDir = path.join(this.dir, 'workspace/.cursor');
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, 'cli.json'),
      JSON.stringify({
        permissions: {
          allow: [],
          deny: ['Shell(*)', 'Write(**)', 'Read(**)', 'WebFetch(*)', 'Mcp(*:*)'],
        },
      }),
    );
    this.jobs = new Map();
    // Claude quota is read with the CLI's own claude.ai session; the CLI renews it if needed.
    this.claudeUsage = new ClaudeUsage(path.join(this.dir, 'claude'), {
      refreshSession: () => this.probe('claude'),
      ping: () => this.pingClaude(),
      cacheFile: path.join(this.dir, 'claude-usage.json'),
      log: require('../core/log.cjs').createLog(dir, 'usage'),
    });
    // v0.9.6: the Claude models the account offers (Anthropic's model list, read with the same
    // claude.ai session Claude Code uses); cached in providers/claude-models.json
    this.claudeModels = [];
    try {
      this.claudeModels = cleanClaudeModels(JSON.parse(fs.readFileSync(path.join(this.dir, 'claude-models.json'), 'utf8')));
    } catch {}
    // v0.8.0 Abacus AI: the user's own `abacusai` install; the connection test result and the
    // account's model list (read from the CLI) are kept in providers/abacus.json (no keys)
    this.abacusFile = path.join(this.dir, 'abacus.json');
    this.abacus = { verified: false, models: [] };
    try {
      const saved = JSON.parse(fs.readFileSync(this.abacusFile, 'utf8'));
      this.abacus = { verified: saved?.verified === true, models: abacus.cleanModels(saved?.models) };
    } catch {}
    // v0.9.6 EVREN: the API key lives encrypted in %APPDATA%\Charles\evren.enc.json and the
    // connection test result / model cache in providers/ (no keys anywhere in the project).
    this.evren = new Evren(dir);
    this.evrenQuotaCache = null;
    this.evrenQuotaPending = null;
    this.auth = {};
    this.authChecked = 0;
    this.authPending = null;
  }
  spec(provider) {
    // v0.9.6: EVREN is a plain HTTP API - no executable to find or launch.
    if (provider === 'evren') return { http: true };
    if (provider === 'cursor')
      return {
        exe: path.join(this.root, 'tools/cursor/node.exe'),
        args: [path.join(this.root, 'tools/cursor/index.js')],
      };
    if (provider === 'gemini')
      return { exe: path.join(this.root, 'tools/antigravity/agy.exe'), args: [] };
    if (provider === 'claude')
      return {
        exe: path.join(this.root, 'node_modules/@anthropic-ai/claude-code-win32-x64/claude.exe'),
        args: [],
      };
    if (provider === 'abacus') {
      // not shipped with Charles: looked up where its installer puts it (cached for 30 s)
      if (!this.abacusSpec || Date.now() - this.abacusSpec.at > 30000)
        this.abacusSpec = { at: Date.now(), found: abacus.findAbacus(process.env) };
      const found = this.abacusSpec.found;
      return found ? { exe: found.exe, args: found.args } : { exe: '', args: [], missing: true };
    }
    throw Error('Geçersiz sağlayıcı.');
  }
  async usage(force = false) {
    if (this.quotaPending) return this.quotaPending;
    // Gemini is fetched only by manual refresh or opening the workspace window.
    if (!force) return this.quotaCache || {provider:'gemini',fiveHour:null,weekly:null,blocked:null,updatedAt:null,unavailable:'Kotayı okumak için yenile'};
    if (this.quotaCache && Date.now()-this.quotaCache.updatedAt<5000) return this.quotaCache;
    this.quotaPending=(async()=>{
      const spec=this.spec('gemini');
      const cli=await runOffThread(spec.exe,[...spec.args,'--output-format','json','-p','/usage'],{
        cwd:path.join(this.dir,'workspace'),env:{...this.env,USERPROFILE:path.join(this.dir,'gemini')},windowsHide:true,timeout:20000,maxBuffer:262144,
      });
      const {geminiUsage}=require('../usage/gemini-usage.cjs');
      // v0.8.5: only what the official CLI reports. (0.8.4 also read Antigravity's Google sign-in
      // token from Windows Credential Manager and called Google's internal quota service; removed.)
      const value=geminiUsage(cli.out || '');
      if(value.unavailable && (this.quotaCache?.fiveHour || this.quotaCache?.weekly)) return {...this.quotaCache,stale:true};
      this.quotaCache=value;return value;
    })();
    try{return await this.quotaPending;}finally{this.quotaPending=null;}
  }

  status() {
    return PROVIDERS.map((id) => {
      if (id === 'evren')
        return {
          id,
          enabled: !!this.auth[id],
          signedIn: !!this.auth[id],
          configured: this.evren.hasKey(),
          installed: true, // nothing to install: an API key is all EVREN needs
        };
      const exe = this.spec(id).exe;
      return {
        id,
        enabled: !!this.auth[id],
        signedIn: !!this.auth[id],
        installed: !!exe && fs.existsSync(exe),
      };
    });
  }
  /**
   * v0.7.4: one tiny, invisible message to Claude (Haiku, one-word system prompt, no tools,
   * not saved as a session). It makes the Claude CLI renew its sign-in, so the quota can be
   * read again. Never shown in a chat. → true when Claude answered.
   */
  async pingClaude() {
    if (!this.auth.claude) return false;
    const spec = this.spec('claude');
    if (!fs.existsSync(spec.exe)) return false;
    const { error, out } = await runOffThread(
      spec.exe,
      [
        ...spec.args,
        '-p',
        'Reply with: ok',
        '--model',
        'haiku',
        '--system-prompt',
        'Reply with one word.',
        '--tools',
        '',
        '--max-turns',
        '1',
        '--output-format',
        'json',
        '--no-session-persistence',
      ],
      {
        cwd: path.join(this.dir, 'workspace'),
        env: this.env,
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 256 * 1024,
      },
    );
    return !error && /"type"\s*:\s*"result"/.test(String(out || ''));
  }
  /** Every selectable model, with Cursor's Composer/Grok models from the account. */
  allModels() {
    // v0.9.6: the "-fast" variants are their own rows for now (they come back as a separate
    // option later); they are not folded into the level picker.
    const cursor = (this.cursorModels && this.cursorModels.length ? this.cursorModels : CURSOR_FALLBACK)
      .map(([id, name]) => ['cursor:' + id, 'Cursor · ' + name]);
    // v0.8.0: Abacus AI models start with "Abacus AI · " so they never mix with the others
    const abacusModels = [
      ['abacus:auto', 'Abacus AI · Otomatik'],
      ...this.abacus.models.map(([id, name]) => ['abacus:' + id, 'Abacus AI · ' + name]),
    ];
    // v0.9.6: the provider is Antigravity (its CLI serves these models). The listing still
    // prints "Gemini …" for the model names, so that prefix is stripped either way.
    const gemini = this.geminiModels.map(
      ([id, name]) => ['gemini:' + id, 'Antigravity · ' + name.replace(/^Antigravity\s+/i, '')],
    );
    // v0.9.6: one provider's models stay together. The account's models (Argon and friends)
    // used to be appended after the Claude rows, so "Gemini · 4 Argon" ended up underneath
    // "Claude · Haiku" while the other Gemini models sat above it.
    const staticGroup = (prefix) => MODELS.filter(([id]) => id.startsWith(prefix + ':'));
    // v0.9.6: EVREN's own models from the account's cached list next to its "Otomatik" row.
    // The API may also list a model literally called "auto"; that would be the same row twice.
    // Each model carries its own level names ("xLow" is one of them) — the id stays the same
    // across levels, so they ride along as an explicit list on the row.
    const evrenModels = [
      ['evren:auto', 'EVREN · Otomatik'],
      ...this.evren.models
        .filter(([id]) => id !== 'auto')
        .map(([id, name]) => {
          const values = this.evren.effortValues(id);
          // Even an empty list is a statement: the model takes no level at all.
          return [`evren:${id}`, 'EVREN · ' + name, { efforts: values.map((v) => [v, `evren:${id}`]) }];
        }),
    ];
    return [
      MODELS[0],
      ...cursor,
      ...staticGroup('gemini'),
      ...gemini,
      ...(this.claudeModels.length
        ? this.claudeModels.map(([id, name]) => ['claude:' + id, 'Claude · ' + name])
        : staticGroup('claude')),
      ...abacusModels,
      ...evrenModels,
    ];
  }
  saveAbacus() {
    try {
      fs.writeFileSync(this.abacusFile, JSON.stringify(this.abacus));
    } catch {}
  }
  /**
   * v0.8.0: every model of the signed-in Abacus AI account, read from the CLI (cached on disk,
   * like Cursor's). Shown as "Abacus AI · <name>" so they never mix with the GPT models.
   */
  async refreshAbacusModels() {
    const spec = this.spec('abacus');
    if (!spec.exe || this.abacusListing) return this.abacus.models;
    this.abacusListing = true;
    try {
      for (const args of abacus.MODEL_LIST_COMMANDS) {
        const { error, out } = await runOffThread(spec.exe, [...spec.args, ...args], {
          cwd: path.join(this.dir, 'workspace'),
          env: abacus.abacusEnv(this.env),
          windowsHide: true,
          timeout: 20000,
          maxBuffer: 1024 * 1024,
        });
        const list = error ? [] : abacus.parseAbacusModels(out);
        if (list.length) {
          this.abacus.models = list;
          this.saveAbacus();
          break;
        }
      }
    } finally {
      this.abacusListing = false;
    }
    return this.abacus.models;
  }
  /**
   * v0.8.0: Abacus AI has no sign-in status command, so the connection is tested with one tiny
   * read-only message (only when the user presses the button). → { ok, message }
   */
  async testAbacus() {
    const spec = this.spec('abacus');
    if (!spec.exe) return { ok: false, message: 'Abacus AI komut satırı aracı bu bilgisayarda bulunamadı.' };
    const plan = abacus.abacusPlan({
      model: 'auto',
      prompt: 'Reply with one word: ok',
      mode: 'chat',
      workspace: path.join(this.dir, 'workspace'),
    });
    const { error, out, err } = await runOffThread(spec.exe, [...spec.args, ...plan.cli], {
      cwd: plan.cwd,
      env: abacus.abacusEnv(this.env),
      windowsHide: true,
      timeout: 90000,
      maxBuffer: 256 * 1024,
    });
    const answer = !error && abacus.abacusAnswer(out);
    const text = String(out || '') + '\n' + String(err || '');
    this.abacus.verified = !!answer && !/not logged in|please log ?in|unauthori[sz]ed|invalid api key|\/login/i.test(text);
    this.saveAbacus();
    if (this.abacus.verified) await this.refreshAbacusModels().catch(() => {});
    this.auth.abacus = this.abacus.verified;
    this.authChecked = 0;
    return this.abacus.verified
      ? { ok: true, message: 'Bağlı · Abacus AI yanıt verdi.' }
      : {
          ok: false,
          message: /login|unauthori|api key/i.test(text)
            ? 'Abacus AI girişi yapılmamış. Abacus AI ile giriş’e bas, açılan pencerede /login yaz.'
            : error?.killed || /timed? ?out/i.test(String(error?.message || ''))
              ? 'Abacus AI zamanında yanıt vermedi. İnternet bağlantını kontrol edip yeniden dene.'
              : 'Abacus AI yanıt vermedi. Hesabını ve kullanım hakkını kontrol et.',
        };
  }
  /** Reads the Composer/Grok models of the signed-in Cursor account (cached on disk). */
  async refreshCursorModels() {
    const spec = this.spec('cursor');
    if (!fs.existsSync(spec.exe)) return this.cursorModels;
    const { error, out } = await runOffThread(spec.exe, [...spec.args, 'models'], {
      cwd: path.join(this.dir, 'workspace'),
      env: this.env,
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
    const list = error ? [] : parseCursorModels(out);
    if (list.length) {
      this.cursorModels = list;
      try {
        fs.writeFileSync(path.join(this.dir, 'cursor-models.json'), JSON.stringify(list));
      } catch {}
    }
    return this.cursorModels;
  }
  /** v0.9.6: every Claude model of the account (GET /v1/models with the claude.ai session). */
  async refreshClaudeModels(fetcher = fetch) {
    if (this.claudeListing) return this.claudeListing;
    this.claudeListing = (async () => {
      const { readCredentials } = require('../usage/claude-usage.cjs');
      const cred = readCredentials(path.join(this.dir, 'claude'));
      if (!cred) return this.claudeModels;
      const res = await fetcher('https://api.anthropic.com/v1/models?limit=100', {
        headers: {
          authorization: 'Bearer ' + cred.accessToken,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return this.claudeModels;
      const list = cleanClaudeModels((await res.json())?.data);
      if (list.length) {
        this.claudeModels = list;
        try {
          fs.writeFileSync(path.join(this.dir, 'claude-models.json'), JSON.stringify(list));
        } catch {}
      }
      return this.claudeModels;
    })();
    try {
      return await this.claudeListing.catch(() => this.claudeModels);
    } finally {
      this.claudeListing = null;
    }
  }
  // ── v0.9.6 EVREN ──────────────────────────────────────────────────────────────────────────
  /** EVREN's model list from the account (cached in providers/evren-models.json). */
  async refreshEvrenModels() {
    if (this.evrenListing) return this.evrenListing;
    this.evrenListing = this.evren.refreshModels();
    try {
      return await this.evrenListing;
    } finally {
      this.evrenListing = null;
    }
  }
  /**
   * The real connection test the button performs: GET /v1/models with the saved key. The
   * background probe never touches the network (it reports this result instead).
   */
  async testEvren() {
    if (!this.evren.hasKey())
      return { ok: false, message: 'EVREN API anahtarı eklenmemiş. Önce anahtarını kaydet.' };
    try {
      const list = await this.evren.refreshModels();
      if (!list.length) throw Error('EVREN model listesi boş geldi.');
      this.evren.verified = true;
      this.evren.saveState();
      this.auth.evren = true;
      this.authChecked = 0;
      return { ok: true, message: 'Bağlı · Modeller kullanıma hazır' };
    } catch (e) {
      this.evren.verified = false;
      this.evren.saveState();
      this.auth.evren = false;
      this.authChecked = 0;
      return {
        ok: false,
        message: e?.message || 'EVREN bağlantısı kurulamadı.',
        terms: e?.code === 'terms_not_accepted',
      };
    }
  }
  evrenKeySave(key) {
    const value = this.evren.setKey(key);
    this.auth.evren = false;
    this.authChecked = 0;
    return value;
  }
  evrenKeyClear() {
    const value = this.evren.clearKey();
    this.auth.evren = false;
    this.authChecked = 0;
    this.evrenQuotaCache = null;
    return value;
  }
  /** Usage terms: { accepted, version, text } (the service asks for acceptance once). */
  evrenTerms() {
    return Promise.all([this.evren.termsStatus(), this.evren.termsText()]).then(([status, text]) => ({
      accepted: status.accepted,
      version: text.version || status.version,
      text: text.text,
    }));
  }
  evrenTermsAccept() {
    return this.evren.acceptTerms();
  }
  /** Daily token quota for the island gauges (60 s cache; a failed read keeps the last one). */
  async evrenUsage(force = false) {
    const shape = () => ({
      provider: 'evren',
      fiveHour: null,
      weekly: null,
      credits: null,
      blocked: null,
      updatedAt: Date.now(),
      labels: { fiveHour: 'Günlük token' },
      missingWindows: ['weekly'],
    });
    if (this.evrenQuotaPending) return this.evrenQuotaPending;
    if (!force && this.evrenQuotaCache && Date.now() - this.evrenQuotaCache.updatedAt < 60000)
      return this.evrenQuotaCache;
    if (!this.evren.hasKey()) return { ...shape(), unavailable: 'EVREN anahtarı eklenmemiş' };
    this.evrenQuotaPending = (async () => {
      try {
        const value = await this.evren.quota();
        if (value.unavailable && this.evrenQuotaCache?.fiveHour)
          return { ...this.evrenQuotaCache, stale: true, updatedAt: Date.now() };
        this.evrenQuotaCache = value;
        return value;
      } catch (e) {
        if (this.evrenQuotaCache?.fiveHour)
          return { ...this.evrenQuotaCache, stale: true, updatedAt: Date.now() };
        return { ...shape(), unavailable: e?.message || 'Kota bilgisi okunamadı' };
      }
    })();
    try {
      return await this.evrenQuotaPending;
    } finally {
      this.evrenQuotaPending = null;
    }
  }
  /**
   * v0.9.6: one entry per model, with the effort levels it offers. Antigravity lists every
   * level as its own model id ("gemini-4-argon-low/medium/high"), which is one model to the
   * user: the panel next to the picker chooses the level and the id that goes with it.
   * A row may also declare its levels itself (`[id, name, { efforts: [[value, id], …] }]`),
   * which is how an HTTP provider offers levels that are not part of the model id.
   */
  models() {
    const rows = this.allModels().filter(([id]) => this.auth[id.split(':')[0]]);
    const groups = new Map();
    for (const [id, name, extra] of rows) {
      // A row may declare its levels itself (`extra.efforts`), even when the list is empty —
      // that means "this model takes no level at all", not "fall back to the provider set".
      const explicit = extra && Array.isArray(extra.efforts)
        ? extra.efforts.map(([value, effortId]) => ({ value, id: effortId || id, label: String(value) }))
        : null;
      const { base, effort } = splitEffort(id);
      const key = explicit || effort ? base : id;
      const group = groups.get(key) || { key, name, variants: [], explicit: null };
      group.name = group.name || name;
      if (explicit !== null) group.explicit = explicit;
      else if (effort) group.variants.push({ id, name, effort });
      groups.set(key, group);
    }
    const models = [];
    for (const [key, group] of groups) {
      const provider = key.split(':')[0];
      const byParam = EFFORT_BY_PARAM.has(provider);
      // Abacus AI is offered with no levels at all ("Otomatik" only) — its transport has no
      // effort parameter, and it is not tested yet.
      // Abacus AI is offered with no levels at all ("Otomatik" only) — its transport has no
      // effort parameter, and it is not tested yet. A row's own list wins over everything,
      // including an empty one ("this model takes no level").
      const offered =
        provider === 'abacus'
          ? []
          : group.explicit !== null
            ? group.explicit
            : group.variants.length
              ? [...group.variants]
                  .sort((a, b) => effortOrder(provider, a.effort) - effortOrder(provider, b.effort))
                  .map((v) => ({ value: v.effort, id: v.id, label: effortLabel(provider, v.effort) }))
              : byParam && !key.endsWith(':auto') && !noEffort(key)
                // gpt / claude / evren carry the level as a request parameter: one row per
                // model, the whole provider set behind it (the id never changes). An
                // "Otomatik" row is the provider's own default and offers nothing.
                ? (EFFORT_LEVELS[provider] || []).map(([value, label]) => ({ value, id: key, label }))
                : [];
      if (!offered.length) {
        // No levels of its own ("Otomatik" rows, Composer, Abacus AI): locked on Otomatik.
        models.push({ id: key, name: group.name, isDefault: false });
        continue;
      }
      // An id-level provider's row points at its default variant (Medium); a parameter
      // provider's row points at the plain id — the level travels beside it, not inside it.
      const chosen = offered.find((v) => v.value === 'medium') || offered.find((v) => v.value === 'low') || offered[0];
      models.push({
        id: byParam ? key : chosen.id,
        name: stripEffortName(group.name) || key,
        isDefault: false,
        effort: byParam ? '' : chosen.value,
        efforts: offered.map((v) => ({ value: v.value, label: v.label || effortLabel(provider, v.value), id: v.id })),
      });
    }
    return models;
  }
  async refreshGeminiModels() {
    if (this.geminiListing) return this.geminiListing;
    const spec = this.spec('gemini');
    if (!spec.exe || !fs.existsSync(spec.exe)) return this.geminiModels;
    this.geminiListing = (async () => {
      const { error, out } = await runOffThread(spec.exe, [...spec.args, 'models'], {
        cwd: path.join(this.dir, 'workspace'),
        env: { ...this.env, USERPROFILE: path.join(this.dir, 'gemini') },
        windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024,
      });
      const list = error ? [] : parseGeminiModels(out);
      if (list.length) {
        this.geminiModels = list;
        try { fs.writeFileSync(path.join(this.dir, 'gemini-models.json'), JSON.stringify(list)); } catch {}
      }
      return this.geminiModels;
    })();
    try { return await this.geminiListing; }
    finally { this.geminiListing = null; }
  }
  // Legacy preferences cannot establish authentication.
  enable(id, value) {
    this.spec(id);
    if (typeof value !== 'boolean') throw Error('Geçersiz bağlantı tercihi.');
    if (!value) this.auth[id] = false;
    return this.status();
  }
  probe(id) {
    // v0.9.6: EVREN has no CLI to ask. The probe only reports what the user's last connection
    // test proved (key saved + verified), so it never needs the network. "Bağlantıyı test et"
    // does the real GET /v1/models check (testEvren).
    if (id === 'evren') return Promise.resolve(this.evren.hasKey() && this.evren.verified === true);
    const spec = this.spec(id);
    if (!spec.exe || !fs.existsSync(spec.exe)) return Promise.resolve(false);
    // Abacus AI: the result of the user's last connection test (no status command to ask)
    if (id === 'abacus') return Promise.resolve(this.abacus.verified);
    // Checks never wait for user input or submit a model prompt. They run in a worker thread
    // so launching the CLI cannot stall the main process (see probe-worker.cjs).
    return runOffThread(
      spec.exe,
      [
        ...spec.args,
        ...(id === 'claude'
          ? ['auth', 'status']
          : id === 'cursor'
            ? ['status', '--format', 'json']
            : ['-p', '/usage']),
      ],
      {
        cwd: path.join(this.dir, 'workspace'),
        env:
          id === 'gemini' ? { ...this.env, USERPROFILE: path.join(this.dir, 'gemini') } : this.env,
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 65536,
      },
    ).then(({ error, out, err }) => {
      if (error) return false;
      if (id === 'claude') {
        try {
          const r = JSON.parse(out);
          return r.loggedIn === true && r.authMethod === 'claude.ai';
        } catch {
          return false;
        }
      }
      if (id === 'cursor') {
        try {
          const r = JSON.parse(out);
          return r.isAuthenticated === true && r.hasAccessToken === true;
        } catch {
          return false;
        }
      }
      const text = out + '\n' + err;
      return (
        !!out.trim() &&
        !/authentication required|not signed in|log in|login required|error|failed|unauthorized/i.test(
          text,
        ) &&
        /quota|remaining|usage|credits/i.test(out)
      );
    });
  }
  async refreshAuth(force = false) {
    if (this.authPending && (force || !this.authChecked)) return this.authPending;
    // After the first check, callers get the known state at once and an expired state is
    // re-checked in the background (the check starts three CLIs and can take seconds).
    if (!force && this.authChecked) {
      if (Date.now() - this.authChecked >= AUTH_TTL && !this.authPending)
        void this.refreshAuth(true).catch(() => {});
      return this.status();
    }
    this.authPending = (async () => {
      // One CLI at a time: starting large executables blocks the main process briefly on
      // Windows (antivirus scans each launch); three at once froze the UI for ~0.5 s.
      const results = [];
      for (const id of PROVIDERS)
        results.push([id, await this.probe(id).catch(() => false)]);
      for (const [id, value] of results) {
        // A single slow or failed check (busy PC, CLI timeout) must not drop a signed-in
        // account: its models would vanish and the chat would silently fall back to GPT.
        // Two failed checks in a row, or an explicit disconnect, sign it out.
        this.authFailures = this.authFailures || {};
        if (value) this.authFailures[id] = 0;
        else if (this.auth[id] && (this.authFailures[id] = (this.authFailures[id] || 0) + 1) < 2)
          continue;
        this.auth[id] = value;
      }
      this.authChecked = Date.now();
      // v0.7.3: Cursor's Composer and Grok models (in the background, the list is cached)
      if (this.auth.cursor) void this.refreshCursorModels().catch(() => {});
      if (this.auth.claude) void this.refreshClaudeModels().catch(() => {});
      if (this.auth.gemini) await this.refreshGeminiModels().catch(() => {});
      if (this.auth.abacus) void this.refreshAbacusModels().catch(() => {});
      // v0.9.6: EVREN's model list (cached in providers/evren-models.json; a failed refresh
      // keeps the cached list, so going offline never empties the model picker)
      if (this.auth.evren) void this.refreshEvrenModels().catch(() => {});
      return this.status();
    })();
    try {
      return await this.authPending;
    } finally {
      this.authPending = null;
    }
  }
  async login(id) {
    if (await this.probe(id)) {
      this.auth[id] = true;
      this.authChecked = 0;
      return { opened: false, signedIn: true };
    }
    const spec = this.spec(id),
      quote = (s) => "'" + s.replace(/'/g, "''") + "'";
    if (id === 'abacus' && !spec.exe)
      throw Error(
        'Abacus AI komut satırı aracı bulunamadı. Önce Abacus AI’ın kurulum sayfasındaki adımlarla kur, sonra yeniden dene.',
      );
    if (!fs.existsSync(spec.exe))
      throw Error('Giriş aracı eksik. Kurulum ZIP dosyasının tamamını çıkar.');
    const script = path.join(this.dir, `login-${id}.ps1`),
      env = subscriptionEnv({}, this.dir);
    if (id === 'gemini') env.USERPROFILE = path.join(this.dir, 'gemini');
    if (id === 'abacus') Object.assign(env, { ABACUS_AUTO_UPDATE: 'off', ABACUS_AUTO_LOAD_AGENTS_MD: 'false' });
    const commands = [
      "$ErrorActionPreference='Stop'",
      ...Object.keys(process.env)
        .filter((k) =>
          /^(ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_USE_|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI)/i.test(
            k,
          ),
        )
        .map((k) => `Remove-Item -LiteralPath ${quote('Env:' + k)} -ErrorAction Ignore`),
      ...Object.entries(env).map(
        ([k, v]) => `[Environment]::SetEnvironmentVariable(${quote(k)},${quote(v)},'Process')`,
      ),
      `Set-Location -LiteralPath ${quote(path.join(this.dir, 'workspace'))}`,
      id === 'abacus'
        ? "Write-Host 'Charles: Abacus AI acilinca /login yazip hesabinla giris yap. Bitince /exit yaz, pencereyi kapat ve Charles ayarlarinda Baglantiyi test et dugmesine bas. (Abacus AI: type /login, then /exit and press Test connection in Charles.)'"
        : "Write-Host 'Charles: Abonelik hesabinizi secin. API / Console secmeyin.'",
      '& ' +
        quote(spec.exe) +
        ' ' +
        [
          ...spec.args,
          ...(id === 'claude' ? ['auth', 'login', '--claudeai'] : id === 'cursor' ? ['login'] : []),
        ]
          .map(quote)
          .join(' '),
      "Write-Host 'Giris islemi bitti. Bu pencereyi kapatabilirsiniz.'",
    ];
    fs.writeFileSync(script, '\uFEFF' + commands.join('\r\n'), 'utf8');
    // A detached child with ignored stdio is not an interactive login console.
    // Let Windows create a dedicated console with its own input/output handles.
    const shell = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    );
    const inner = Buffer.from(commands.join('\r\n'), 'utf16le').toString('base64');
    const launch = `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ${quote(shell)} -ArgumentList @('-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-EncodedCommand','${inner}') -WindowStyle Normal -PassThru; $p.Id`;
    return new Promise((resolve, reject) =>
      execFile(
        shell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(launch, 'utf16le').toString('base64'),
        ],
        { cwd: this.dir, env: this.env, windowsHide: true, timeout: 15000, encoding: 'utf8' },
        (error, out) => {
          if (error || !/^\d+$/m.test(out.trim()))
            reject(
              Error(
                'Hesap giriş penceresi açılamadı. Windows terminal erişimini kontrol edip yeniden dene.',
              ),
            );
          else resolve({ opened: true, pid: Number(out.trim()) });
        },
      ),
    );
  }
  async send(agent, args) {
    if (!this.allModels().some(([id]) => id === args.model)) throw Error('Model bulunamadı.');
    const cut = args.model.indexOf(':');
    const provider = args.model.slice(0, cut),
      model = args.model.slice(cut + 1);
    await this.refreshAuth();
    if (!this.auth[provider]) throw Error('Önce ayarlardan bu sağlayıcıyı bağla.');
    if (args.task)
      throw Error(
        'Web arama, derin araştırma ve görsel oluşturma GPT ile çalışır. Bu istek için GPT seç.',
      );
    if (args.mode === 'project' && !args.cwd) throw Error('Proje modu için klasör seç.');
    // v0.9.6: the level the panel chose. It is checked against the model's own set right here,
    // so nothing invented upstream can reach a CLI flag or a request body. An id-level
    // provider ("gemini-4-argon-high") carries the level inside the id and gets no parameter.
    const effort = String(args.effort || '').trim();
    const row = this.models().find((m) => m.id === args.model || (m.efforts || []).some((e) => e.id === args.model));
    if (effort && !(row?.efforts || []).some((e) => e.value === effort))
      throw Error('Bu model için geçerli bir efor seçimi değil.');
    // v0.8.7: Claude and Gemini take images too (app/ai/provider-images.cjs)
    const { texts, images } = imagesKit.splitAttachments(provider, args.attachments);
    const claudeImages = provider === 'claude' && images.length ? imagesKit.loadImages(images, this.shrinkImage) : null;
    if (agent.busy) throw Error('Önce etkin yanıtı durdur.');
    const spec = this.spec(provider);
    const isHttp = !!spec.http;
    if (!isHttp && (!spec.exe || !fs.existsSync(spec.exe)))
      throw Error(
        provider === 'abacus'
          ? 'Abacus AI komut satırı aracı bulunamadı. Kurup Ayarlar → Hesap\'tan bağlantıyı yeniden test et.'
          : 'Sağlayıcının resmi aracı bulunamadı. Kurulum paketini yeniden çıkar.',
      );
    const isAbacus = provider === 'abacus';
    const id = randomUUID();
    const workspace = path.join(this.dir, 'workspace');
    const staged = provider === 'gemini' && images.length ? imagesKit.stageGeminiImages(workspace, id, images) : null;
    // Sign-in was verified by refreshAuth above (claude.ai subscription only, see probe);
    // no extra `claude auth status` launch before every message.
    const planArgs = {
      provider,
      model,
      effort: EFFORT_BY_PARAM.has(provider) ? effort : '',
      mode: args.mode,
      access: args.access,
      projectDir: args.mode === 'project' ? args.cwd : null,
      workspace,
      images: images.length > 0,
      imageDir: staged?.dir || null,
    };
    // Abacus AI takes the message on its command line (-p), so its plan is made once the full
    // message is known (below); this first plan only says where it runs. EVREN has no CLI: the
    // plan only carries the same fields the answer flow below reads.
    let plan = isHttp
      ? { cli: [], cwd: workspace, timeoutMs: 600000, tools: false }
      : isAbacus
        ? abacus.abacusPlan({ ...planArgs, prompt: '.' })
        : launchPlan(planArgs);
    if (plan.geminiSettings)
      fs.writeFileSync(
        path.join(this.dir, 'gemini/.gemini/antigravity-cli/settings.json'),
        JSON.stringify(plan.geminiSettings),
      );
    agent.busy = true;
    const emit = (method, params) => agent.publish('agent', { method, params });
    emit('turn/started', { turn: { id } });
    // These CLIs report no tool steps. When the answer is based on a document or on
    // mail Charles fetched, report one reading step so Slime shows its reading animation.
    const mailData = /<mail_verisi>/.test(args.prompt);
    const reading = mailData || (args.attachments || []).length > 0;
    const readItem = (status) => ({
      id: id + '-read',
      type: 'mcpToolCall',
      tool: 'read_document',
      status,
      command: mailData ? 'E-postalar okunuyor' : images.length && !texts.length ? 'Görsel inceleniyor' : 'Belge okunuyor',
    });
    if (reading) emit('item/started', { item: readItem('inProgress') });
    if (plan.tools)
      emit('item/started', {
        item: {
          id: id + '-work',
          type: 'mcpToolCall',
          tool: 'project',
          status: 'inProgress',
          command: 'Proje klasöründe çalışıyor: ' + plan.cwd,
        },
      });
    const prompt =
      (plan.tools
        ? 'Sen Charles, HzPederPan tarafından geliştirilmiş bir masaüstü asistanısın. Şu an kullanıcının seçtiği proje klasöründe çalışıyorsun: ' +
          plan.cwd +
          '. ' +
          (args.access === 'ask'
            ? 'Erişim ayarı “Onay iste”: dosyaları okuyup inceleyebilir ve plan önerebilirsin, değişiklik yapma. '
            : 'Proje dosyalarını okuyup düzenleyebilirsin; komut çalıştırma iznin yok, gerekirse kullanıcıya hangi komutu çalıştırması gerektiğini söyle. ') +
          'Kullanıcıyla Türkçe konuş; sonunda değişen dosyaları kısaca özetle. Yapmadığın işlemleri yaptığını söyleme.\n'
        : 'Sen Charles, HzPederPan tarafından geliştirilmiş bir masaüstü sohbet asistanısın. Bu bağlantıda bilgisayar araçların yok. Yapmadığın işlemleri yaptığını söyleme.\n') +
      ASK_FORMAT.trim() +
      '\n' +
      args.prompt +
      '\n' +
      texts.map((a) => a.text).join('\n') +
      (staged ? imagesKit.geminiImagePrompt(staged.files) : '');
    if (isAbacus) {
      try {
        plan = abacus.abacusPlan({ ...planArgs, prompt });
      } catch (e) {
        agent.busy = false;
        if (reading) emit('item/completed', { item: readItem('failed') });
        if (plan.tools)
          emit('item/completed', {
            item: { id: id + '-work', type: 'mcpToolCall', tool: 'project', status: 'failed', command: plan.cwd },
          });
        emit('turn/completed', { turn: { id, status: 'failed', error: { message: e.message } } });
        return { turnId: id };
      }
    }
    // v0.9.6: EVREN answers over its HTTP API, so there is no CLI to spawn. Its deltas are
    // real: the answer streams into the chat while it arrives, and the interrupt button
    // aborts the request (the job in this.jobs carries the same kill/cancelled surface as a
    // child process).
    if (isHttp) {
      const controller = new AbortController();
      const job = {
        cancelled: false,
        finished: false,
        kill() {
          this.cancelled = true;
          controller.abort();
        },
      };
      this.jobs.set(agent, job);
      let answer = '';
      let startedItem = false;
      const done = (error) => {
        if (job.finished) return;
        job.finished = true;
        this.jobs.delete(agent);
        if (!error && !answer.trim()) error = 'EVREN yanıtı boş geldi.';
        if (reading) emit('item/completed', { item: readItem(error ? 'failed' : 'completed') });
        agent.busy = false;
        if (answer) {
          if (!startedItem) emit('item/started', { item: { id, type: 'agentMessage', text: '' } });
          emit('item/completed', { item: { id, type: 'agentMessage', text: answer } });
        }
        emit('turn/completed', {
          turn: {
            id,
            status: error ? (job.cancelled ? 'interrupted' : 'failed') : 'completed',
            ...(error ? { error: { message: error } } : {}),
          },
        });
      };
      this.evren
        .chat({
          model,
          prompt,
          effort,
          signal: controller.signal,
          onDelta: (piece) => {
            if (!startedItem) {
              startedItem = true;
              emit('item/started', { item: { id, type: 'agentMessage', text: '' } });
            }
            answer += piece;
            emit('item/agentMessage/delta', { itemId: id, delta: piece });
          },
        })
        .then((text) => {
          answer = text || answer;
          done(null);
        })
        .catch((e) => done(job.cancelled ? 'Yanıt durduruldu.' : e?.message || 'EVREN yanıtı alınamadı.'));
      return { turnId: id };
    }
    const cli = plan.cli;
    const started = new Map();
    let lineBuffer = '';
    const child = spawn(spec.exe, [...spec.args, ...cli], {
      cwd: plan.cwd,
      env:
        provider === 'gemini'
          ? { ...this.env, USERPROFILE: path.join(this.dir, 'gemini') }
          : isAbacus
            ? abacus.abacusEnv(this.env)
            : this.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.jobs.set(agent, child);
    let stdout = '',
      stderr = '',
      finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      imagesKit.removeStaged(staged?.dir);
      this.jobs.delete(agent);
      // v0.7.3: the Claude CLI renews its session while answering, so the quota can be read
      // again with the fresh token right away
      if (provider === 'claude') this.claudeUsage.invalidate();
      let text = '';
      if (!error) {
        try {
          const lines = () =>
            stdout
              .trim()
              .split(/\r?\n/)
              .map((line) => {
                try {
                  return JSON.parse(line);
                } catch {
                  return null;
                }
              })
              .filter(Boolean);
          if (isAbacus) {
            text = abacus.abacusAnswer(stdout) || '';
            if (!text) throw Error('Yanıt boş.');
          }
          const r = isAbacus
            ? { result: text }
            : provider === 'gemini'
              ? lines()
                  .filter((e) => e.event === 'result')
                  .at(-1)?.result
              : provider === 'claude'
                ? lines()
                    .filter((e) => e.type === 'result')
                    .at(-1)
                : JSON.parse(stdout);
          if (!r || r.error || r.is_error || (provider === 'gemini' && r.status !== 'SUCCESS'))
            throw Error('Sağlayıcı yanıt vermedi.');
          text = provider === 'gemini' ? r.response : r.result;
          if (isAbacus && /not logged in|please log ?in|unauthori[sz]ed|invalid api key/i.test(text.slice(0, 300))) {
            this.abacus.verified = false;
            this.auth.abacus = false;
            this.saveAbacus();
            throw Error('login');
          }
          if (typeof text !== 'string' || !text.trim()) throw Error('Yanıt boş.');
        } catch {
          error = 'Yanıt okunamadı. Sağlayıcı hesabını ve kullanım kotasını kontrol et.';
        }
      }
      if (reading) emit('item/completed', { item: readItem(error ? 'failed' : 'completed') });
      for (const item of started.values())
        emit('item/completed', { item: { ...item, status: error ? 'failed' : 'completed' } });
      if (plan.tools)
        emit('item/completed', {
          item: {
            id: id + '-work',
            type: 'mcpToolCall',
            tool: 'project',
            status: error ? 'failed' : 'completed',
            command: 'Proje klasöründe çalışıldı: ' + plan.cwd,
          },
        });
      const complete = () => {
        agent.busy = false;
        if (text) emit('item/completed', { item: { id, type: 'agentMessage', text } });
        emit('turn/completed', {
          turn: {
            id,
            status: error ? (child.cancelled ? 'interrupted' : 'failed') : 'completed',
            ...(error ? { error: { message: error } } : {}),
          },
        });
      };
      // These CLIs return the whole answer at once. Replay it as a short stream, like Codex
      // does, so the chat types it out and Slime's writing/talking animations run too.
      if (text && args.stream !== false) streamText(text, emit, id, complete);
      else complete();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish('Yanıt zaman aşımına uğradı.');
    }, plan.timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (s) => {
      stdout += s;
      // Claude reports each tool step as a stream-json line: show it in the activity list
      // and let Slime switch to its search / reading / laptop / keyboard animations.
      if (provider === 'claude') {
        lineBuffer += s;
        const parts = lineBuffer.split(/\r?\n/);
        lineBuffer = parts.pop() || '';
        for (const line of parts) {
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          for (const { method, item } of claudeItems(event)) {
            if (method === 'item/started') started.set(item.id, item);
            const known = started.get(item.id);
            if (method === 'item/completed' && known) {
              started.delete(item.id);
              emit(method, { item: { ...known, status: item.status } });
            } else emit(method, { item });
          }
        }
      }
      if (stdout.length > 2000000) {
        child.kill();
        finish('Yanıt boyutu sınırı aşıldı.');
      }
    });
    child.stderr.on('data', (s) => {
      stderr = (stderr + s).slice(-2000);
    });
    child.on('error', () => finish('Sağlayıcı başlatılamadı.'));
    child.on('close', (code) =>
      finish(
        code
          ? 'Hesap bağlantısını ve kullanım kotasını kontrol et. Ayarlardan yeniden giriş yapabilirsin.'
          : null,
      ),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(
      isAbacus
        ? ''
        : claudeImages
          ? imagesKit.claudeInput(prompt, claudeImages)
          : provider === 'gemini'
            ? JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n'
            : prompt,
    );
    return { turnId: id };
  }
  interrupt(agent) {
    const child = this.jobs.get(agent);
    if (!child) return false;
    child.cancelled = true;
    child.kill();
    return true;
  }
  stop() {
    for (const child of this.jobs.values()) {
      child.cancelled = true;
      child.kill();
    }
  }
}
module.exports = {
  cleanClaudeModels,
  PROVIDERS,
  streamText,
  Providers,
  subscriptionEnv,
  MODELS,
  parseCursorModels,
  parseGeminiModels,
  EFFORT_LEVELS,
  EFFORT_BY_PARAM,
  splitEffort,
  effortLabel,
  stripEffortName,
};
