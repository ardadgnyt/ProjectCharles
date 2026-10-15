// Small diagnostic logs under <userData>/logs (e.g. usage.log, mail.log).
// One line per event, no message content or secrets; each file is capped at ~200 KB.
const fs = require('node:fs');
const path = require('node:path');

const LIMIT = 200 * 1024;

function createLog(dir, name) {
  const file = path.join(dir, 'logs', name + '.log');
  return (...parts) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        if (fs.statSync(file).size > LIMIT) fs.renameSync(file, file + '.old');
      } catch {}
      fs.appendFileSync(
        file,
        new Date().toISOString() + ' ' + parts.map((p) => String(p)).join(' ') + '\n',
      );
    } catch {}
  };
}

module.exports = { createLog };
