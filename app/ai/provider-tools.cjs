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
// v0.8.7: `images` (chat mode) allows read_file only, so agy can open the images Charles
// copied for this message; writing, commands, MCP and URLs stay denied.
function geminiSettings(access, tools, images = false) {
  const deny = [
    'read_file(*)',
    'write_file(*)',
    'command(*)',
    'unsandboxed(*)',
    'mcp(*)',
    'read_url(*)',
    'execute_url(*)',
  ];
  if (!tools && images)
    return {
      toolPermission: 'strict',
      allowNonWorkspaceAccess: false,
      useG1Credits: false,
      enableTelemetry: false,
      permissions: { allow: ['read_file(*)'], deny: deny.filter((d) => d !== 'read_file(*)') },
    };
  if (!tools)
    return {
      toolPermission: 'strict',
      allowNonWorkspaceAccess: false,
      useG1Credits: false,
      enableTelemetry: false,
      permissions: { deny },
    };
  const allow =
    access === 'ask'
      ? ['read_file(*)', 'read_url(*)']
      : ['read_file(*)', 'write_file(*)', 'read_url(*)'];
  return {
    toolPermission: 'strict',
    allowNonWorkspaceAccess: false,
    useG1Credits: false,
    enableTelemetry: false,
    permissions: {
      allow,
      deny: deny.filter((d) => !allow.includes(d)),
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
function launchPlan({ provider, model, mode, access, projectDir, workspace, images = false, imageDir = null, effort = '' }) {
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
    if (!tools) cli.push('--tools', '');
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
    return { cli, cwd, timeoutMs, tools, geminiSettings: geminiSettings(level, tools, !!imageDir) };
  }
  // cursor
  // --trust: print mode stops at Cursor's "Workspace Trust Required" prompt otherwise and
  // never answers (v0.7.0 fix). It trusts only this folder: Charles' own empty workspace in
  // chat mode, or the project folder the user picked. It is not --force / --yolo.
  const cli = ['-p', '--output-format', 'json', '--trust', '--workspace', cwd];
  // v0.7.3: Composer / Grok; "auto" leaves the choice to Cursor
  if (model && model !== 'auto' && /^[a-z0-9][a-z0-9._-]*$/.test(model)) cli.push('--model', model);
  if (!tools) cli.push('--mode', 'ask');
  else if (level === 'ask') cli.push('--mode', 'plan');
  else cli.push('--sandbox', 'enabled');
  return { cli, cwd, timeoutMs, tools };
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

module.exports = { launchPlan, claudeItems, geminiSettings, READ_TOOLS, EDIT_TOOLS };
void path;
