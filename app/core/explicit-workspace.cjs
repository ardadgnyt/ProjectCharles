// A folder written in the current user message can become the project folder — but only
// after the user agrees (v0.8.5), and never a drive root or a system / Charles folder.
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

const norm = (p) => path.win32.resolve(String(p || '')).replace(/[\\/]+$/, '').toLowerCase();
/**
 * Folders that are never offered as a project: drive roots, Windows, Program Files,
 * ProgramData, the user profile and AppData roots, Charles' own app and data folders.
 */
function blockedWorkspace(dir, { env = process.env, appRoot = '', userData = '' } = {}) {
  if (/^[A-Za-z]:[\\/]?$/.test(String(dir || '').trim())) return 'root';
  const d = norm(dir);
  if (/^[a-z]:$/.test(d) || /^\\\\[^\\]+\\[^\\]+$/.test(d)) return 'root';
  const exact = [env.USERPROFILE, env.APPDATA, env.LOCALAPPDATA, env.USERPROFILE && path.win32.join(env.USERPROFILE, 'AppData')]
    .filter(Boolean)
    .map(norm);
  if (exact.includes(d)) return 'profile';
  const inside = [env.SystemRoot || env.windir || 'C:\\Windows', env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData, appRoot, userData]
    .filter(Boolean)
    .map(norm);
  if (inside.some((b) => d === b || d.startsWith(b + '\\'))) return 'system';
  return null;
}
module.exports = { explicitWorkspace, blockedWorkspace };
