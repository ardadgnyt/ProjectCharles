// v0.9.25: Cursor hook for a message with pictures (preToolUse and beforeReadFile).
//
//   node cursor-hook.cjs <folder>
//
// Cursor's permission rules cannot allow one folder and deny the rest (a deny always wins), so a
// message with pictures runs in a folder of its own with this hook: the Read tool may open files
// inside that folder, every other tool and every other path is refused. Cursor writes the call as
// JSON on stdin (with a UTF-8 BOM) and reads {"permission": "allow" | "deny"} from stdout.
// Charles uses this only when the hook files exist: Cursor lets everything through when a hook
// program cannot be started.
const path = require('node:path');

function decide(input, root) {
  const base = path.resolve(String(root || ''));
  const tool = String(input?.tool_name || '');
  const event = String(input?.hook_event_name || (tool ? 'preToolUse' : 'beforeReadFile'));
  const isRead = event === 'beforeReadFile' || /^read(?:_?file)?$/i.test(tool);
  const args = input?.tool_input || {};
  const file = input?.file_path || args.file_path || args.path || args.target_file || '';
  if (!isRead || !file || !root) return false;
  const abs = path.resolve(base, String(file));
  const rel = path.relative(base, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  // its own settings stay out of reach
  return rel.split(/[\\/]/)[0].toLowerCase() !== '.cursor';
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (s) => (raw += s));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse(raw.replace(/^﻿/, ''));
    } catch {}
    const ok = decide(input, process.argv[2]);
    process.stdout.write(
      JSON.stringify(
        ok
          ? { permission: 'allow' }
          : { permission: 'deny', user_message: 'Charles: only the attached pictures can be read here.', agent_message: 'Only the attached pictures may be read in this chat.' },
      ),
    );
  });
}

module.exports = { decide };
