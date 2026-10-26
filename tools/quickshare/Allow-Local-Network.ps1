# Charles Quick Share LAN-only rules for this installation's private runtime.
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'python\python.exe'))
if (-not (Test-Path -LiteralPath $runtime -PathType Leaf)) { throw 'Quick Share runtime is missing.' }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this script with Windows administrator permission.' }
$hasher = [Security.Cryptography.SHA256]::Create()
$suffix = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($runtime.ToLowerInvariant())))).Replace('-','').Substring(0,12)
foreach ($protocol in @('TCP','UDP')) {
  $name = "Charles-QuickShare-$suffix-$protocol"
  if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) { continue }
  $parameters = @{
    Name = $name
    DisplayName = "Charles Quick Share ($suffix) $protocol - Local network"
    Direction = 'Inbound'
    Action = 'Allow'
    Program = $runtime
    Protocol = $protocol
    Profile = 'Private'
    RemoteAddress = 'LocalSubnet'
  }
  $parameters.LocalPort = if ($protocol -eq 'UDP') { '5353' } else { '53318' }
  New-NetFirewallRule @parameters | Out-Null
}
Write-Output 'Charles Quick Share local-network rules are ready.'
