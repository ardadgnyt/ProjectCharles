// v0.6.0: the Slime colour, moustache and accessory chosen in the "Design Test" build
// (%APPDATA%\Charles Design Test) are taken over once, if this profile has no Slime look yet.
const fs = require('node:fs');
const path = require('node:path');

function fromDesignTest(appData, personal) {
  if (personal.data.slime) return false;
  try {
    const file = path.join(appData, 'Charles Design Test', 'personal.json');
    const test = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (!test.slime) return false;
    personal.edit('slime', { value: test.slime });
    if (test.outfit) personal.edit('outfit', { value: test.outfit });
    return true;
  } catch {
    return false;
  }
}

module.exports = { fromDesignTest };
