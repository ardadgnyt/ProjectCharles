'use strict';
// v0.9.26: Word, Excel and PowerPoint themselves, when they are installed, for the converter's Office
// formats (DOC, ODT, RTF, XLS, ODS, PPT, ODP …): their layout, fonts and charts stay as the program
// draws them. Optional: without Office, Charles' own readers and writers are used where they can be
// (app/files/convert.cjs says which formats need Office). Runs on this computer only; the file is
// opened read-only with macros off, the original is never saved, and paths and choices travel in an
// environment variable as JSON, never inside the script text.
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');

const COMMON = `
$ErrorActionPreference = 'Stop'
$job = $env:CHARLES_JOB | ConvertFrom-Json
$missing = [Type]::Missing
`;
const SCRIPTS = {
  word: `${COMMON}
$app = New-Object -ComObject Word.Application
# a Word the user has open is visible: it is used as it is and never hidden or closed
$own = -not $app.Visible
$doc = $null
try {
  $app.DisplayAlerts = 0
  $app.AutomationSecurity = 3
  # a wrong password makes a protected file fail at once instead of asking
  $doc = $app.Documents.Open($job.source, $false, $true, $false, 'charles-no-password', 'charles-no-password')
  if ($job.format -eq 'pdf') { $doc.ExportAsFixedFormat($job.target, 17) }
  elseif ($job.format -eq 'txt') { $doc.SaveAs2($job.target, 7, $false, '', $false, '', $false, $false, $false, $false, $false, 65001) }
  else {
    $codes = @{ docx = 16; odt = 23; rtf = 6; html = 10; doc = 0 }
    $doc.SaveAs2($job.target, $codes[$job.format])
  }
  Write-Output ('pages=' + $doc.ComputeStatistics(2))
} finally {
  if ($doc) { try { $doc.Saved = $true; $doc.Close(0) } catch {} }
  if ($own) { try { $app.Quit() } catch {} }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
`,
  excel: `${COMMON}
$app = New-Object -ComObject Excel.Application
$own = -not $app.Visible
$book = $null
try {
  $app.DisplayAlerts = $false
  $app.AutomationSecurity = 3
  $app.AskToUpdateLinks = $false
  $book = $app.Workbooks.Open($job.source, 0, $true, $missing, 'charles-no-password')
  if ($job.format -eq 'sheets') {
    $names = @(); foreach ($s in $book.Worksheets) { $names += $s.Name }
    Write-Output ('sheets=' + ($names | ConvertTo-Json -Compress))
  } else {
    if ($job.sheet) { $book.Worksheets.Item([string]$job.sheet).Activate() }
    if ($job.format -eq 'pdf') {
      if ($job.sheet) { $book.ActiveSheet.ExportAsFixedFormat(0, $job.target) } else { $book.ExportAsFixedFormat(0, $job.target) }
    } else {
      $codes = @{ xlsx = 51; ods = 60; csv = 62; tsv = 42; html = 44; xls = 56 }
      $book.SaveAs($job.target, $codes[$job.format])
    }
    Write-Output ('sheets=' + $book.Worksheets.Count)
  }
} finally {
  if ($book) { try { $book.Saved = $true; $book.Close($false) } catch {} }
  if ($own) { try { $app.Quit() } catch {} }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
`,
  powerpoint: `${COMMON}
$app = New-Object -ComObject PowerPoint.Application
# PowerPoint has one instance: it is closed only when no presentation of the user's is open
$deck = $null
try {
  $app.AutomationSecurity = 3
  # "::" gives an empty password: a protected file fails at once instead of opening a dialog
  $deck = $app.Presentations.Open($job.source + '::', -1, 0, 0)
  # hidden slides too; only this read-only copy in memory changes, the file is never saved
  foreach ($slide in $deck.Slides) { $slide.SlideShowTransition.Hidden = 0 }
  if ($job.format -eq 'images') {
    $i = 0
    foreach ($slide in $deck.Slides) {
      $i++
      $file = Join-Path $job.target ('slide-' + $i.ToString('00000') + '.' + $job.ext)
      $slide.Export($file, $job.filter, [int]$job.width, [int]$job.height)
    }
  } elseif ($job.format -eq 'text') {
    $out = @()
    foreach ($slide in $deck.Slides) {
      $texts = @(); foreach ($shape in $slide.Shapes) { if ($shape.HasTextFrame -and $shape.TextFrame.HasText) { $texts += $shape.TextFrame.TextRange.Text } }
      $notes = ''
      try { foreach ($shape in $slide.NotesPage.Shapes) { if ($shape.PlaceholderFormat.Type -eq 2 -and $shape.HasTextFrame) { $notes = $shape.TextFrame.TextRange.Text } } } catch {}
      $out += @{ number = $slide.SlideNumber; text = ($texts -join "\`n"); notes = $notes }
    }
    [IO.File]::WriteAllText($job.target, ($out | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
  } else {
    $codes = @{ pptx = 24; odp = 35; pdf = 32; ppt = 1 }
    $deck.SaveAs($job.target, $codes[$job.format])
  }
  Write-Output ('slides=' + $deck.Slides.Count)
} finally {
  if ($deck) { try { $deck.Saved = -1; $deck.Close() } catch {} }
  if ($app.Presentations.Count -eq 0 -and -not $app.Visible) { try { $app.Quit() } catch {} }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
`,
};
const PROGIDS = { word: 'Word.Application', excel: 'Excel.Application', powerpoint: 'PowerPoint.Application' };
const NAMES = { word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' };

const found = {};
/** Whether this Office program is registered here (the registry only; nothing is started). */
function available(app) {
  if (!PROGIDS[app]) return Promise.resolve(false);
  if (found[app]) return found[app];
  found[app] = new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    execFile('reg.exe', ['query', `HKCR\\${PROGIDS[app]}\\CurVer`], { windowsHide: true, timeout: 5000 }, (error) => resolve(!error));
  });
  return found[app];
}

/**
 * One conversion by an Office program. job: { source, target, format, sheet?, filter?, ext?,
 * width?, height? }. Resolves with what the script printed (pages=…, sheets=…, slides=…).
 */
function run(app, job, { signal, timeout = 300000, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    if (!SCRIPTS[app]) return reject(Error('Geçersiz Office işi.'));
    const encoded = Buffer.from(`& { ${SCRIPTS[app]} }`, 'utf16le').toString('base64');
    const child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CHARLES_JOB: JSON.stringify(job) },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out = (out + d).slice(-20000)));
    child.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener?.('abort', stop, { once: true });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', stop);
      if (signal?.aborted) return reject(Object.assign(Error('İptal edildi.'), { cancelled: true }));
      if (code === 0 && /(pages|sheets|slides)=/.test(out)) return resolve(out.trim());
      // PowerShell may wrap its errors as CLIXML: the message is in the <S S="Error"> parts
      const clixml = [...err.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((m) => m[1].replace(/_x000D_|_x000A_/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join('').replace(/\s+/g, ' ').trim();
      const first = clixml || err.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#<')) || 'çıkış kodu ' + code;
      const password = /password|parola|şifre/i.test(err);
      reject(Error(password ? `${NAMES[app]} dosyayı açamadı: dosya parolayla korunuyor.` : `${NAMES[app]} bu dosyayı dönüştüremedi: ${first.slice(0, 200)}`));
    });
  });
}

module.exports = { available, run, NAMES };
