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
// v0.8.0: every provider Charles can sign in to besides GPT
const PROVIDERS = ['gemini', 'claude', 'cursor', 'abacus'];
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
  ['gemini:auto', 'Gemini · Otomatik'],
  ['gemini:pro', 'Gemini · Pro'],
  ['gemini:flash', 'Gemini · Flash'],
  ['claude:sonnet', 'Claude · Sonnet'],
  ['claude:opus', 'Claude · Opus'],
  ['claude:haiku', 'Claude · Haiku'],
];
// v0.7.3: Cursor's own models (Composer, Grok) next to Auto. The list comes from the signed-in
// account (`cursor-agent models`); only the Composer and Grok families are offered.
const CURSOR_FALLBACK = [['composer-2.5', 'Composer 2.5']];
const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '');
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
    if (!/^(composer|grok)(?:[-.]|$)/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const name = String(m[2] || '')
      .replace(/\s*\((?:current|default|selected)[^)]*\)\s*/gi, ' ')
      .trim();
    out.push([id, name || prettyCursorName(id)]);
    if (out.length >= 12) break;
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
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(this.dir, 'cursor-models.json'), 'utf8'));
      if (Array.isArray(saved))
        this.cursorModels = saved.filter(
          (x) => Array.isArray(x) && /^(composer|grok)[a-z0-9._-]*$/.test(x[0]) && typeof x[1] === 'string',
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
    // v0.8.0 Abacus AI: the user's own `abacusai` install; the connection test result and the
    // account's model list (read from the CLI) are kept in providers/abacus.json (no keys)
    this.abacusFile = path.join(this.dir, 'abacus.json');
    this.abacus = { verified: false, models: [] };
    try {
      const saved = JSON.parse(fs.readFileSync(this.abacusFile, 'utf8'));
      this.abacus = { verified: saved?.verified === true, models: abacus.cleanModels(saved?.models) };
    } catch {}
    this.auth = {};
    this.authChecked = 0;
    this.authPending = null;
  }
  spec(provider) {
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
    const cursor = (this.cursorModels && this.cursorModels.length ? this.cursorModels : CURSOR_FALLBACK).map(
      ([id, name]) => ['cursor:' + id, 'Cursor · ' + name],
    );
    // v0.8.0: Abacus AI models start with "Abacus AI · " so they never mix with the others
    const abacusModels = [
      ['abacus:auto', 'Abacus AI · Otomatik'],
      ...this.abacus.models.map(([id, name]) => ['abacus:' + id, 'Abacus AI · ' + name]),
    ];
    return [MODELS[0], ...cursor, ...MODELS.slice(1), ...abacusModels];
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
  models() {
    return this.allModels().filter(([id]) => this.auth[id.split(':')[0]]).map(([id, name]) => ({
      id,
      name,
      isDefault: false,
    }));
  }
  // Legacy preferences cannot establish authentication.
  enable(id, value) {
    this.spec(id);
    if (typeof value !== 'boolean') throw Error('Geçersiz bağlantı tercihi.');
    if (!value) this.auth[id] = false;
    return this.status();
  }
  probe(id) {
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
      if (this.auth.abacus) void this.refreshAbacusModels().catch(() => {});
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
    // v0.8.7: Claude and Gemini take images too (app/ai/provider-images.cjs)
    const { texts, images } = imagesKit.splitAttachments(provider, args.attachments);
    const claudeImages = provider === 'claude' && images.length ? imagesKit.loadImages(images, this.shrinkImage) : null;
    if (agent.busy) throw Error('Önce etkin yanıtı durdur.');
    const spec = this.spec(provider);
    if (!spec.exe || !fs.existsSync(spec.exe))
      throw Error(
        provider === 'abacus'
          ? 'Abacus AI komut satırı aracı bulunamadı. Kurup Ayarlar → Hesap’tan bağlantıyı yeniden test et.'
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
      mode: args.mode,
      access: args.access,
      projectDir: args.mode === 'project' ? args.cwd : null,
      workspace,
      images: images.length > 0,
      imageDir: staged?.dir || null,
    };
    // Abacus AI takes the message on its command line (-p), so its plan is made once the full
    // message is known (below); this first plan only says where it runs.
    let plan = isAbacus ? abacus.abacusPlan({ ...planArgs, prompt: '.' }) : launchPlan(planArgs);
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
  PROVIDERS,
  streamText,
  Providers,
  subscriptionEnv,
  MODELS,
  parseCursorModels,
};
