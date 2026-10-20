// Only the current user message can explicitly select a local workspace.
const fs = require('node:fs');
const path = require('node:path');
function explicitWorkspace(prompt, io = fs) {
  if (!/(incele|oku|araştır|analiz|düzenle|değiştir|çalış|onar|düzelt|inspect|read|analy[sz]e|edit|review|fix)/iu.test(prompt)) return null;
  const matches = String(prompt).match(/[A-Za-z]:[\\/][^\r\n"'\x60<>|?*]+/g) || [];
  const found = new Set();
  for (const raw of matches) {
    let candidate = raw.trim().replace(/[.,;]+$/, '');
    for (;;) {
      try {
        const stat = io.statSync(candidate);
        const dir = stat.isDirectory() ? candidate : stat.isFile() ? path.win32.dirname(candidate) : null;
        if (dir) found.add(io.realpathSync(dir));
        break;
      } catch {}
      const space = candidate.lastIndexOf(' ');
      if (space < 0) break;
      candidate = candidate.slice(0, space);
    }
  }
  if (found.size > 1) throw Error('Bir seferde tek çalışma klasörü belirt; diğer klasörü ayrı bir mesajda seçebilirsin.');
  return [...found][0] || null;
}
module.exports = { explicitWorkspace };
