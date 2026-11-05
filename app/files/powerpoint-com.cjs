'use strict';
// v0.9.16: when Microsoft PowerPoint is installed, PDFs of presentations come from PowerPoint
// itself (every font, effect and chart exactly as drawn there). It is optional: without it Charles
// draws the slides on its own (app/files/slides.cjs). Runs on this computer only, read-only, with
// macros off; the path goes in as an argument, never into the script text.
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');

const SCRIPT = `
param([string]$Source, [string]$Target)
$ErrorActionPreference = 'Stop'
$running = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$app = New-Object -ComObject PowerPoint.Application
$deck = $null
try {
  $app.AutomationSecurity = 3
  # "::" gives an empty password: a protected file fails at once instead of opening a dialog
  $deck = $app.Presentations.Open($Source + '::', -1, 0, 0)
  # hidden slides too: a PDF of the file has every slide of the file. Only this read-only copy
  # in memory changes; the file on disk is never saved.
  foreach ($slide in $deck.Slides) { $slide.SlideShowTransition.Hidden = 0 }
  $deck.SaveAs($Target, 32)
  Write-Output ('slides=' + $deck.Slides.Count)
} finally {
  if ($deck) { $deck.Saved = -1; $deck.Close() }
  if (-not $running -and $app.Presentations.Count -eq 0) { $app.Quit() }
}
`;

let found;
/** Whether PowerPoint is registered here (read from the registry; nothing is started). */
function available() {
  if (found) return found;
  found = new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    execFile('reg.exe', ['query', 'HKCR\\PowerPoint.Application\\CurVer'], { windowsHide: true, timeout: 5000 }, (error) => resolve(!error));
  });
  return found;
}

function toPdf(source, target, { signal, timeout = 240000 } = {}) {
  return new Promise((resolve, reject) => {
    const command = `& { ${SCRIPT} } -Source $env:CHARLES_SRC -Target $env:CHARLES_OUT`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CHARLES_SRC: source, CHARLES_OUT: target },
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      if (signal?.aborted) return reject(Object.assign(Error('İptal edildi.'), { cancelled: true }));
      const m = /slides=(\d+)/.exec(out);
      if (code === 0 && m && fs.existsSync(target) && fs.statSync(target).size > 0) return resolve({ slides: +m[1] });
      reject(Error('PowerPoint bu dosyayı dönüştüremedi: ' + (err.split(/\r?\n/)[0] || 'çıkış kodu ' + code).slice(0, 200)));
    });
  });
}

module.exports = { available, toPdf };
