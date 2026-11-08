// v0.9.25: Stop also ends a command that Codex already started. Codex's turn/interrupt marks the
// turn "interrupted" but leaves a running shell alive (CH-221: a file was still written 25-40 s
// after Stop). Only shells under this Codex process that started with the running command are
// ended, each with its whole tree; nothing else on the computer is touched.
const { execFile } = require('node:child_process');

const SHELLS = /^(powershell|pwsh|cmd|bash|sh|wsl|python\d*|py|node|ruby|perl)\.exe$/i;

/** Every process as { pid, ppid, name, started } (started: epoch ms). */
function listProcesses(run = execFile) {
  const script =
    "Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.ProcessId, $_.ParentProcessId, $_.Name, $_.CreationDate.ToUniversalTime().ToString('o') }";
  return new Promise((resolve) => {
    run(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) return resolve([]);
        resolve(parseProcesses(String(stdout || '')));
      },
    );
  });
}

function parseProcesses(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const [pid, ppid, name, when] = line.trim().split('|');
    if (!pid || !Number(pid)) continue;
    const started = Date.parse(when);
    rows.push({ pid: Number(pid), ppid: Number(ppid), name: String(name || ''), started: Number.isFinite(started) ? started : 0 });
  }
  return rows;
}

/**
 * The shells to end: under `rootPid` at any depth, started no earlier than `since` (with a little
 * slack for clock rounding). A matching shell inside another matching shell is left to its
 * parent's tree kill.
 */
function pickShells(rows, rootPid, since = 0) {
  const byParent = new Map();
  for (const r of rows) {
    if (!byParent.has(r.ppid)) byParent.set(r.ppid, []);
    byParent.get(r.ppid).push(r);
  }
  const picked = [];
  const walk = (pid, depth) => {
    if (depth > 8) return;
    for (const child of byParent.get(pid) || []) {
      if (child.pid === rootPid) continue;
      if (SHELLS.test(child.name) && child.started >= since - 2000) picked.push(child);
      else walk(child.pid, depth + 1);
    }
  };
  walk(rootPid, 0);
  return picked;
}

function killTree(pid, run = execFile) {
  return new Promise((resolve) => {
    run('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }, () => resolve());
  });
}

/** Ends the running command's shells. Returns the pids that were ended. */
async function stopCommands({ rootPid, since = 0, list = listProcesses, kill = killTree, platform = process.platform } = {}) {
  if (platform !== 'win32' || !rootPid) return [];
  const shells = pickShells(await list(), rootPid, since);
  for (const s of shells) await kill(s.pid);
  return shells.map((s) => s.pid);
}

module.exports = { stopCommands, pickShells, parseProcesses, SHELLS };
