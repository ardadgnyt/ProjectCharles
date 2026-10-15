// Runs one short CLI check (e.g. `claude auth status`) off the main thread.
// Starting large executables on Windows can block the calling thread while antivirus scans
// them; in a worker that pause no longer freezes Charles' window.
const { parentPort, workerData } = require('node:worker_threads');
const { execFile } = require('node:child_process');

const { exe, args, options } = workerData;
const child = execFile(exe, args, options, (error, out, err) => {
  parentPort.postMessage({
    error: error ? { message: String(error.message || error), code: error.code ?? null } : null,
    out: String(out || ''),
    err: String(err || ''),
  });
});
child.stdin?.end();
