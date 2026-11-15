# Builds Charles.exe from setup/CharlesLauncher.cs with the .NET Framework compiler that comes with Windows.
#   scripts/build-launcher.ps1 [output.exe] [extra source for a test build] [test Main class]
# v1.0.0: the launcher also puts a newer Electron in place (zip, JSON), so it references
# System.IO.Compression and System.Web.Extensions; a test build (.qa/h100/runtime) adds a harness.
param([string]$Output = '', [string]$Extra = '', [string]$Main = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$net = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path -LiteralPath (Join-Path $net 'csc.exe'))) { $net = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319' }
$compiler = Join-Path $net 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler not found.' }
if (-not $Output) { $Output = Join-Path $projectRoot 'Charles.exe' }
$icon = Join-Path $projectRoot 'public\charles.ico'
$source = Join-Path $projectRoot 'setup\CharlesLauncher.cs'
$arguments = @(
  '/nologo', $(if ($Main) { '/target:exe' } else { '/target:winexe' }), '/platform:anycpu', '/optimize+',
  '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
  "/reference:$(Join-Path $net 'System.IO.Compression.dll')",
  "/win32icon:$icon", "/out:$Output", $source
)
if ($Extra) { $arguments += $Extra }
if ($Main) { $arguments += "/main:$Main" }
& $compiler $arguments
if ($LASTEXITCODE -ne 0) { throw 'Charles launcher build failed.' }
