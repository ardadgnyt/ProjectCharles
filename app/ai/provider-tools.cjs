// Tools (files, commands, web) for the Claude, Gemini and Cursor subscription CLIs.
//
// Chat mode stays tool-free, exactly like before. In project mode the CLI runs inside the
// project folder the user selected, and Charles' access setting decides what it may do:
//
//   access         | Claude Code                         | Gemini (agy)          | Cursor
//   ---------------+-------------------------------------+-----------------------+------------------------
//   ask            | --permission-mode plan (read only)  | --mode plan           | --mode plan
//   auto / full    | --permission-mode acceptEdits,      | --mode accept-edits   | agent mode, sandbox on,
//                  | file tools only (no shell)          |                       | commands not forced
//
// Permission-bypassing modes (Claude bypassPermissions, agy --dangerously-skip-permissions,
// Cursor --force) are deliberately never used: these CLIs can edit files in the project but
// cannot run shell commands without their own approval. Commands stay a GPT/Codex feature.
const path = require('node:path');

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite'];
const EDIT_TOOLS = [...READ_TOOLS, 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'];

function geminiModel(model) {
  if (model === 'auto') return [];
  if (model === 'pro') return ['--model', 'gemini-3.1-pro-high'];
  if (model === 'flash') return ['--model', 'gemini-3.8-flash-medium'];
  // v0.9.6: any model the account lists (send() only accepts listed ids); never a flag
  if (/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(model || '')) return ['--model', model];
  // v0.9.6: a stored name that is not a Gemini id (an old choice, another provider's alias)
  // falls back to the account's own default instead of failing the message. Nothing that is
  // not a well-formed gemini-* id ever reaches the command line.
  return [];
}

// Antigravity reads its permissions from <profile>/.gemini/antigravity-cli/settings.json.
//
// v0.9.25: agy's "strict" mode no longer honours allow rules at all (1.4.7 and 1.5.3 alike): every
// read_file was refused, so pictures never reached the model, project mode could not read its own
// files, and agy's own image generator was blocked. The default "request-review" mode honours the
// rules, so the allow rules name exact folders: the pictures of this message, the project. A
// headless run cannot ask anybody, so whatever no rule allows is refused (checked live: reading
// C:\Windows\win.ini, writing, commands and URLs were all refused). agy's built-in web search and
// image generator are not permission actions; they run in this mode and send nothing beyond what
// the conversation already sends to Google.
const AGY_ACTIONS = ['read_file', 'write_file', 'command', 'unsandboxed', 'mcp', 'read_url', 'execute_url'];
/** read_file(C:/folder/**): agy's rules name a path with forward slashes. */
function agyRule(action, dir) {
  return `${action}(${String(dir).replace(/\\/g, '/').replace(/\/+$/, '')}/**)`;
}
function geminiSettings(access, tools, { imageDir = null, projectDir = null, web = false } = {}) {
  const allow = [];
  if (imageDir) allow.push(agyRule('read_file', imageDir));
  if (web && !(tools && projectDir)) allow.push('read_url(*)');
  if (tools && projectDir) {
    allow.push(agyRule('read_file', projectDir), 'read_url(*)');
    if (access === 'auto' || access === 'full') allow.push(agyRule('write_file', projectDir));
  }
  const granted = new Set(allow.map((a) => a.slice(0, a.indexOf('('))));
  return {
    toolPermission: 'request-review',
    allowNonWorkspaceAccess: false,
    useG1Credits: false,
    enableTelemetry: false,
    permissions: {
      ...(allow.length ? { allow } : {}),
      // an action with a narrow allow rule is not denied as a whole: a deny would win over it
      deny: AGY_ACTIONS.filter((a) => !granted.has(a)).map((a) => a + '(*)'),
    },
  };
}

// Returns how to launch a provider for one message.
// v0.8.7: `images` → Claude reads the message as stream-json (with image blocks);
// `imageDir` → the folder Gemini may read the message's images from.
// v0.9.6: `effort` is the level the panel chose ('' = Otomatik). Only Claude takes it as a
// flag — the id-level providers spell it inside the model id, and GPT rides on the Codex
// thread instead. It is checked here again so no invalid value can become a CLI argument.
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// v0.9.25: `task` is the + menu's choice ('web', 'research', 'image' or ''). Web search and research
// give Claude its WebSearch and WebFetch tools (nothing else: no shell, no files) and let agy open
// the pages it found.
const WEB_TASKS = ['web', 'research'];
function launchPlan({ provider, model, mode, access, projectDir, workspace, images = false, imageDir = null, effort = '', task = '' }) {
  const web = WEB_TASKS.includes(task);
  const tools = mode === 'project' && !!projectDir;
  const level = ['ask', 'auto', 'full'].includes(access) ? access : 'ask';
  const cwd = tools ? projectDir : workspace;
  const timeoutMs = tools ? 20 * 60 * 1000 : 180000;
  if (provider === 'claude') {
    const cli = ['-p', '--model', model, '--output-format', 'stream-json', '--verbose'];
    const picked = String(effort || '').trim();
    if (picked) {
      if (!CLAUDE_EFFORTS.includes(picked)) throw Error('Bu model için geçerli bir efor seçimi değil.');
      cli.push('--effort', picked);
    }
    if (!tools && web) cli.push('--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch');
    else if (!tools) cli.push('--tools', '');
    else if (level === 'auto' || level === 'full')
      cli.push('--permission-mode', 'acceptEdits', '--allowedTools', EDIT_TOOLS.join(','));
    else cli.push('--permission-mode', 'plan', '--allowedTools', READ_TOOLS.join(','));
    cli.push('--disallowedTools', 'mcp__*', '--no-session-persistence', '--safe-mode');
    if (images) cli.push('--input-format', 'stream-json');
    return { cli, cwd, timeoutMs, tools };
  }
  if (provider === 'gemini') {
    const cli = [
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--disable-slash-commands',
      '--mode',
      tools && level !== 'ask' ? 'accept-edits' : 'plan',
      ...geminiModel(model),
    ];
    if (tools) cli.push('--add-dir', cwd);
    if (imageDir) cli.push('--add-dir', imageDir);
    // v0.9.25: a picture agy draws takes its image-generator a while; chat answers get 6 minutes
    return {
      cli,
      cwd,
      timeoutMs: tools ? timeoutMs : 360000,
      tools,
      geminiSettings: geminiSettings(level, tools, { imageDir, projectDir: tools ? cwd : null, web }),
    };
  }
  // cursor
  // --trust: print mode stops at Cursor's "Workspace Trust Required" prompt otherwise and
  // never answers (v0.7.0 fix). It trusts only this folder: Charles' own empty workspace in
  // chat mode, or the project folder the user picked. It is not --force / --yolo.
  // v0.9.25: a chat message with pictures runs in the pictures' own folder, whose .cursor settings
  // (cursorFolder below) let the Read tool open those pictures and nothing else.
  const own = !tools && !!imageDir;
  const where = own ? imageDir : cwd;
  const cli = ['-p', '--output-format', 'json', '--trust', '--workspace', where];
  // v0.7.3: Composer / Grok; "auto" leaves the choice to Cursor
  if (model && model !== 'auto' && /^[a-z0-9][a-z0-9._-]*$/.test(model)) cli.push('--model', model);
  if (!tools) cli.push('--mode', 'ask');
  else if (level === 'ask') cli.push('--mode', 'plan');
  else cli.push('--sandbox', 'enabled');
  return { cli, cwd: where, timeoutMs, tools, cursorFolder: own ? imageDir : null };
}

/**
 * v0.9.25: the .cursor settings of a picture folder: Read is not denied in cli.json (a deny would
 * win over everything), the hook allows it inside the folder only and refuses every other tool.
 * `node` and `hook` are the shipped tools/cursor/node.exe and app/ai/cursor-hook.cjs.
 */
function cursorPictureConfig(folder, node, hook) {
  const command = `"${node}" "${hook}" "${folder}"`;
  return {
    cli: { permissions: { allow: [], deny: ['Shell(*)', 'Write(**)', 'WebFetch(*)', 'Mcp(*:*)'] } },
    hooks: { version: 1, hooks: { preToolUse: [{ command }], beforeReadFile: [{ command }] } },
  };
}

// Claude Code stream-json → Charles/Codex style item events (for the activity list and
// Slime's work animations). Returns [{ method, item }] for one parsed line.
function claudeItems(event) {
  const out = [];
  const content = event?.message?.content;
  if (event?.type === 'assistant' && Array.isArray(content))
    for (const part of content) {
      if (part?.type !== 'tool_use') continue;
      const input = part.input || {};
      const name = String(part.name || '');
      let item;
      if (name === 'Bash' || name === 'PowerShell')
        item = { type: 'commandExecution', command: String(input.command || '').slice(0, 500) };
      else if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(name))
        item = {
          type: 'fileChange',
          changes: [{ path: String(input.file_path || input.notebook_path || '') }],
        };
      else if (/^(WebSearch|WebFetch)$/.test(name))
        item = { type: 'webSearch', query: String(input.query || input.url || '') };
      else
        item = {
          type: 'mcpToolCall',
          tool: /^(Read|Glob|Grep)$/.test(name) ? 'read_file' : name,
          command: String(input.file_path || input.pattern || input.path || name).slice(0, 300),
        };
      out.push({ method: 'item/started', item: { id: part.id, status: 'inProgress', ...item } });
    }
  if (event?.type === 'user' && Array.isArray(content))
    for (const part of content)
      if (part?.type === 'tool_result')
        out.push({
          method: 'item/completed',
          item: {
            id: part.tool_use_id,
            type: 'mcpToolCall',
            status: part.is_error ? 'failed' : 'completed',
          },
        });
  return out;
}

module.exports = { launchPlan, claudeItems, geminiSettings, cursorPictureConfig, agyRule, READ_TOOLS, EDIT_TOOLS };
void path;
