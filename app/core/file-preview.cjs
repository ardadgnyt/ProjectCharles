// v0.7.2: the side panel of the app window shows files the AI wrote and opens them in other
// programs. Only files inside Charles' chat folder or the chosen project folder are shown.
const fs = require('node:fs');
const path = require('node:path');

const MAX = 600 * 1024;
const TEXT = /\.(txt|md|markdown|json|jsonc|js|cjs|mjs|ts|tsx|jsx|py|pyw|java|kt|c|h|cc|cpp|hpp|cs|go|rs|rb|php|swift|sh|bash|ps1|psm1|bat|cmd|sql|html|htm|css|scss|less|xml|yml|yaml|toml|ini|cfg|conf|env|csv|tsv|log|vue|svelte|lua|r|dart|scala|gradle|properties|dockerfile|makefile|gitignore)$/i;

/** Resolves `file` (absolute or relative to one of the roots) and checks it stays inside a root. */
function resolveInside(file, roots) {
  if (typeof file !== 'string' || !file || file.length > 2000 || file.includes('\0')) throw Error('Geçersiz dosya.');
  const list = roots.filter(Boolean).map((r) => path.resolve(r));
  const candidates = path.isAbsolute(file) ? [path.resolve(file)] : list.map((r) => path.resolve(r, file));
  for (const full of candidates) {
    const root = list.find((r) => full === r || full.startsWith(r + path.sep));
    if (!root) continue;
    let real = full;
    try {
      real = fs.realpathSync(full);
    } catch {}
    const realRoot = (() => {
      try {
        return fs.realpathSync(root);
      } catch {
        return root;
      }
    })();
    if (real === realRoot || real.startsWith(realRoot + path.sep)) return real;
  }
  throw Error('Bu dosya Charles’ın çalışma klasörünün veya seçili projenin dışında.');
}

function preview(file, roots) {
  const full = resolveInside(file, roots);
  const st = fs.statSync(full);
  if (!st.isFile()) throw Error('Bu bir dosya değil.');
  const name = path.basename(full);
  const text = TEXT.test(name) || !path.extname(name);
  if (!text) return { path: full, name, size: st.size, binary: true, text: '' };
  const fd = fs.openSync(full, 'r');
  try {
    const length = Math.min(st.size, MAX);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, 0);
    if (buf.includes(0)) return { path: full, name, size: st.size, binary: true, text: '' };
    return { path: full, name, size: st.size, truncated: st.size > MAX, text: buf.toString('utf8') };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { resolveInside, preview, MAX };
