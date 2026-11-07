# v0.9.24: builds the installer program from setup/CharlesSetup.cs with the .NET Framework compiler that
# comes with Windows; no SDK and nothing downloaded. scripts/setup-pack.py appends the application to it.
#   scripts/build-setup.ps1 [output.exe] [extra source for a test build] [test Main class]
param([string]$Output = '', [string]$Extra = '', [string]$Main = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$net = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $net 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler not found.' }
if (-not $Output) { $Output = Join-Path $projectRoot 'dist-setup\CharlesSetup-stub.exe' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Output) | Out-Null
$arguments = @(
  '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/debug-', '/codepage:65001', '/utf8output',
  "/out:$Output",
  "/win32icon:$(Join-Path $projectRoot 'public\charles.ico')",
  "/win32manifest:$(Join-Path $projectRoot 'setup\CharlesSetup.manifest')",
  '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
  '/reference:System.Web.Extensions.dll', "/reference:$(Join-Path $net 'System.IO.Compression.dll')",
  "/resource:$(Join-Path $projectRoot 'LICENSE'),LICENSE.txt",
  "/resource:$(Join-Path $projectRoot 'LICENSE-ASSETS.md'),LICENSE-ASSETS.txt",
  "/resource:$(Join-Path $projectRoot 'THIRD-PARTY-NOTICES.md'),THIRD-PARTY-NOTICES.txt",
  (Join-Path $projectRoot 'setup\CharlesSetup.cs')
)
if ($Extra) { $arguments += $Extra }
if ($Main) { $arguments += "/main:$Main" }
& $compiler $arguments
if ($LASTEXITCODE -ne 0) { throw 'Charles setup build failed.' }
