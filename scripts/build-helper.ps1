# v0.9.20: builds app/system/charles-helper.exe from setup/CharlesHelper.cs with the .NET Framework
# compiler and the WinRT metadata that come with Windows; no SDK and nothing downloaded.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$net = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $net 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler not found.' }
$winmd = Join-Path $env:WINDIR 'System32\WinMetadata'
$references = @(
  (Join-Path $net 'System.Runtime.dll'),
  (Join-Path $net 'System.Runtime.InteropServices.WindowsRuntime.dll'),
  (Join-Path $net 'System.Management.dll'),
  (Join-Path $net 'WPF\UIAutomationClient.dll'),
  (Join-Path $net 'WPF\UIAutomationTypes.dll'),
  (Join-Path $net 'WPF\WindowsBase.dll'),
  (Join-Path $winmd 'Windows.Foundation.winmd'),
  (Join-Path $winmd 'Windows.Media.winmd'),
  (Join-Path $winmd 'Windows.Storage.winmd')
) | ForEach-Object { "/reference:$_" }
$output = Join-Path $projectRoot 'app\system\charles-helper.exe'
$source = Join-Path $projectRoot 'setup\CharlesHelper.cs'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /debug- /nowarn:1701,1702 $references "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw 'Charles helper build failed.' }
