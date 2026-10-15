$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$speaker = New-Object -ComObject SAPI.SpVoice
$token = $null
$voiceLanguage = if ($payload.language -eq 'en') { '(^|;)0?409(;|$)' } else { '(^|;)0?41[fF](;|$)' }
foreach ($branch in @('SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens','SOFTWARE\Microsoft\Speech\Voices\Tokens')) {
  foreach ($entry in Get-ChildItem -LiteralPath ('HKLM:\' + $branch) -ErrorAction SilentlyContinue) {
    $attributes = Get-ItemProperty -LiteralPath ($entry.PSPath + '\Attributes') -ErrorAction SilentlyContinue
    if ($attributes.Language -match $voiceLanguage) {
      $token = New-Object -ComObject SAPI.SpObjectToken
      $token.SetId('HKEY_LOCAL_MACHINE\' + $branch + '\' + $entry.PSChildName)
      break
    }
  }
  if ($token) { break }
}
if (-not $token) { throw 'Selected Windows speech language is not installed.' }
try {
  $speaker.Voice = $token
  $speaker.Speak([string]$payload.text, 16) | Out-Null
} finally {
  [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($speaker)
  [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($token)
}
