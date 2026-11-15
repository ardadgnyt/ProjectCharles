// v1.0.0 (perf2 P10): "Düşük bellek modu" (Settings → Performance) turns Chromium's hardware
// acceleration off, which has to be decided before the app is ready. This reads only that one value
// from companion.json, without the settings stack; anything unreadable means off.
const fs = require('node:fs');
const path = require('node:path');

/** True only when companion.json in `userData` says `"lowMemory": true`. */
function lowMemoryWanted(userData) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(userData, 'companion.json'), 'utf8').replace(/^﻿/, ''));
    return !!value && typeof value === 'object' && value.lowMemory === true;
  } catch {
    return false;
  }
}

module.exports = { lowMemoryWanted };
