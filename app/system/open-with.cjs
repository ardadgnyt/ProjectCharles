// v0.7.4: open a file from the side panel in another program, and say clearly when that
// program is not installed (instead of silently doing nothing).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const NAMES = {
  vscode: 'Visual Studio Code',
  github: 'GitHub Desktop',
  notepadpp: 'Notepad++',
  terminal: 'Terminal',
};

function firstExisting(list) {
  return list.filter(Boolean).find((f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  });
}
function env(name) {
  return process.env[name] || '';
}
/** Where Notepad++ is installed, or ''. */
function notepadPlusPlus() {
  return (
    firstExisting([
      env('ProgramFiles') && path.join(env('ProgramFiles'), 'Notepad++', 'notepad++.exe'),
      env('ProgramFiles(x86)') && path.join(env('ProgramFiles(x86)'), 'Notepad++', 'notepad++.exe'),
      env('ProgramW6432') && path.join(env('ProgramW6432'), 'Notepad++', 'notepad++.exe'),
      env('LOCALAPPDATA') && path.join(env('LOCALAPPDATA'), 'Programs', 'Notepad++', 'notepad++.exe'),
    ]) || ''
  );
}
/** Windows Terminal (wt.exe) if it is installed, else ''. */
function windowsTerminal() {
  return firstExisting([env('LOCALAPPDATA') && path.join(env('LOCALAPPDATA'), 'Microsoft', 'WindowsApps', 'wt.exe')]) || '';
}
/** Is a URL protocol (vscode:, x-github-client:) registered? `appName(url)` is Electron's getApplicationNameForProtocol. */
function hasProtocol(appName, url) {
  try {
    return !!String(appName(url) || '').trim();
  } catch {
    return true; // cannot tell: try to open it
  }
}

/**
 * A new console window in `dir`. cmd.exe started directly with no stdin closed at once
 * (the v0.7.2 bug); "start" gives it its own console.
 */
function terminalCommand(dir) {
  if (/["%\r\n]/.test(dir)) throw Error('Bu klasör adı terminalde açılamıyor.');
  const wt = windowsTerminal();
  const line = wt ? `/d /s /c start "" "${wt}" -d "${dir}"` : `/d /s /c start "Charles" /D "${dir}" cmd.exe /K`;
  return { exe: path.join(env('SystemRoot') || 'C:\\Windows', 'System32', 'cmd.exe'), line };
}
function openTerminal(dir) {
  const { exe, line } = terminalCommand(dir);
  const child = spawn(exe, [line], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
}
function openNotepadPlusPlus(file) {
  const exe = notepadPlusPlus();
  if (!exe) throw Error(missing('notepadpp'));
  const child = spawn(exe, [file], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}
function missing(how) {
  return `${NAMES[how] || 'Bu program'} bu bilgisayarda yüklü değil.`;
}

module.exports = { NAMES, notepadPlusPlus, windowsTerminal, hasProtocol, terminalCommand, openTerminal, openNotepadPlusPlus, missing };
