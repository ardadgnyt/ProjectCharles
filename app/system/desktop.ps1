param([ValidateSet('list','status','play','pause','next','previous')][string]$Action='list')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
try {
  if ($Action -eq 'list') { @(Get-StartApps | Select-Object Name,AppID) | ConvertTo-Json -Compress; exit }
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $managerType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
  $asyncMethod=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1)
  function Await-Result($operation,[Type]$resultType) {
    $task=$asyncMethod.MakeGenericMethod($resultType).Invoke($null,@($operation))
    if (-not $task.Wait(5000)) { throw 'Media request timeout' }
    return $task.Result
  }
  $manager=Await-Result ($managerType::RequestAsync()) $managerType
  $media=$null
  $attempts=if($Action -eq 'status'){1}else{12}
  for($i=0;$i -lt $attempts;$i++) {
    $media=$manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match '(?i)spotify' } | Select-Object -First 1
    if($media){break}
    if($i -lt $attempts-1){Start-Sleep -Milliseconds 500}
  }
  if(-not $media){@{ok=$false;reason='no-session'} | ConvertTo-Json -Compress;exit}
  $accepted=$true
  switch($Action){
    'play' {$accepted=Await-Result ($media.TryPlayAsync()) ([bool])}
    'pause' {$accepted=Await-Result ($media.TryPauseAsync()) ([bool])}
    'previous' {$accepted=Await-Result ($media.TrySkipPreviousAsync()) ([bool])}
    'next' {$accepted=Await-Result ($media.TrySkipNextAsync()) ([bool])}
  }
  $properties=Await-Result ($media.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime])
  @{ok=$accepted;state=$media.GetPlaybackInfo().PlaybackStatus.ToString();title=$properties.Title;artist=$properties.Artist} | ConvertTo-Json -Compress
} catch { @{ok=$false;reason='media-unavailable';detail=$_.Exception.Message} | ConvertTo-Json -Compress; exit 1 }
