$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler not found.' }
$output = Join-Path $projectRoot 'Charles.exe'
$icon = Join-Path $projectRoot 'public\charles.ico'
$source = Join-Path $projectRoot 'setup\CharlesLauncher.cs'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /reference:System.Windows.Forms.dll "/win32icon:$icon" "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw 'Charles launcher build failed.' }
