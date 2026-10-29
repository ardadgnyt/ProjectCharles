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
  $existing = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
  if ($existing) { $existing | Set-NetFirewallRule -Enabled True -Action Allow -Profile 'Private,Domain'; continue }
  $parameters = @{
    Name = $name
    DisplayName = "Charles Quick Share ($suffix) $protocol - Local network"
    Direction = 'Inbound'
    Action = 'Allow'
    Program = $runtime
    Protocol = $protocol
    Profile = 'Private,Domain'
    RemoteAddress = 'LocalSubnet'
  }
  $parameters.LocalPort = if ($protocol -eq 'UDP') { '5353' } else { '53318' }
  New-NetFirewallRule @parameters | Out-Null
}
# Windows writes a Block rule for the runtime when its first-run prompt is dismissed; a block
# rule wins over every allow rule. Remove only inbound Block rules for this exact executable.
Get-NetFirewallApplicationFilter -Program $runtime -ErrorAction SilentlyContinue |
  Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } |
  Remove-NetFirewallRule -ErrorAction SilentlyContinue
Write-Output 'Charles Quick Share local-network rules are ready.'
