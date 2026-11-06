// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.21: a file let go on Explorer may take Charles' main thread with it: Windows' Drop is one
// call, and with a name that already exists it lasts until "Replace or Skip" is answered. Nothing in
// Charles can run meanwhile, so the helper (setup/CharlesHelper.cs, channel "guard") watches from
// outside: the button is up and the drag has not ended, so the frozen window stops taking clicks and
// stops covering what Windows opened. main.cjs puts both back when startDrag returns.

/** Starts watching `window`; returns { stop }. Without the helper it does nothing. */
function watch({ window, pid = process.pid, open = (name) => require('../system/helper-hub.cjs').open(name) }) {
  let child = null;
  try {
    child = open('guard');
    child.on('error', () => {});
    child.stdout.resume();
    child.stdin.write(JSON.stringify({ window, pid }) + '\n');
  } catch {
    child = null;
  }
  return {
    stop() {
      try {
        child?.kill();
      } catch {}
      child = null;
    },
  };
}

module.exports = { watch };
