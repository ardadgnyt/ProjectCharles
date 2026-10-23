$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$propertyType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$asyncMethod=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1)
# v0.8.14: a Windows media call that never finishes used to make every later status time out
# (the worker stayed alive but stuck). A timeout is now reported with restart=true and this
# process ends; Charles starts a fresh one for the next request.
$script:restart=$false
function Await-Result($operation,[Type]$resultType,[int]$ms=3000) {
 $task=$asyncMethod.MakeGenericMethod($resultType).Invoke($null,@($operation))
 if(-not $task.Wait($ms)){$script:restart=$true;throw [System.TimeoutException]::new('Media timeout')}
 return $task.Result
}
$art=$false
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class CharlesMediaArt {
 [DllImport("shcore.dll", PreserveSig=false)]
 static extern void CreateStreamOverRandomAccessStream([MarshalAs(UnmanagedType.IUnknown)] object source, ref Guid iid, out IStream result);
 public static byte[] Read(object source) {
  IStream stream=null;var iid=new Guid("0000000c-0000-0000-C000-000000000046");
  try {CreateStreamOverRandomAccessStream(source,ref iid,out stream);System.Runtime.InteropServices.ComTypes.STATSTG stat;stream.Stat(out stat,1);if(stat.cbSize<1||stat.cbSize>2097152)return null;
   var bytes=new byte[(int)stat.cbSize];var count=Marshal.AllocCoTaskMem(4);
   try{stream.Read(bytes,bytes.Length,count);Array.Resize(ref bytes,Marshal.ReadInt32(count));return bytes;}finally{Marshal.FreeCoTaskMem(count);}
  }finally{if(stream!=null)Marshal.ReleaseComObject(stream);}
 }
}
"@
$art=$true
} catch { $art=$false } # no cover art (the C# part could not be built); the rest still works
$keys=$false
try {
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class CharlesMediaKeys{[DllImport("user32.dll")]static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);public static void Press(byte k){keybd_event(k,0,1,UIntPtr.Zero);keybd_event(k,0,3,UIntPtr.Zero);}}'
$keys=$true
} catch { $keys=$false }
# v0.8.14: when Windows' media sessions do not answer, or Spotify is not in them (a Spotify
# setting turns that off), Spotify's own window tells what plays: "Artist - Song" while playing.
function Window-Status {
 $p=Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle} | Select-Object -First 1
 if(-not $p){
  if(Get-Process -Name Spotify -ErrorAction SilentlyContinue){return @{state='Stopped';title='';artist=''}}
  return $null
 }
 $t=[string]$p.MainWindowTitle
 if($t -notmatch '^Spotify' -and $t -match '^(.+?) - (.+)$'){return @{state='Playing';artist=$matches[1].Trim();title=$matches[2].Trim()}}
 return @{state='Stopped';title='';artist=''}
}
function Window-Answer($action) {
 $w=Window-Status
 if(-not $w){return '{"ok":false,"reason":"no-session"}'}
 $accepted=$true
 $key=0
 switch($action){
  'play' {if($w.state -ne 'Playing'){$key=0xB3}}
  'pause' {if($w.state -eq 'Playing'){$key=0xB3}}
  'next' {$key=0xB0}
  'previous' {$key=0xB1}
  {$_ -in @('seek','shuffle','repeat')} {$accepted=$false}
 }
 if($key){if($keys){[CharlesMediaKeys]::Press([byte]$key);Start-Sleep -Milliseconds 600;$w=Window-Status;if(-not $w){$w=@{state='Stopped';title='';artist=''}}}else{$accepted=$false}}
 return (@{ok=$true;accepted=$accepted;fallback=$true;restart=$script:restart;state=$w.state;title=$w.title;artist=$w.artist;duration=0;position=0;art=$null;shuffle=$null;repeat=$null;capabilities=@{seek=$false;shuffle=$false;repeat=$false}} | ConvertTo-Json -Compress -Depth 4)
}
$manager=$null
$artKey='';$artData=$null
$known=@{}
function Pick-Session {
 if(-not $script:manager){$script:manager=Await-Result ($managerType::RequestAsync()) $managerType}
 $all=@($script:manager.GetSessions() | Where-Object {$_.SourceAppUserModelId -match '(?i)spotify'})
 if(-not $all.Count){return $null}
 # several Spotify sessions (desktop app + web player): the one that plays wins
 foreach($s in $all){try{if($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing'){return $s}}catch{}}
 return $all[0]
}
while($null -ne ($line=[Console]::ReadLine())) {
 try {
  $action=$null
  $request=$line | ConvertFrom-Json
  $asked=[string]$request.action
  if($asked -notin @('status','play','pause','next','previous','seek','shuffle','repeat')){throw 'Invalid action'}
  $action=$asked
  # Windows' media sessions hung a moment ago: only Spotify's window for a while
  if($request.window -eq $true){[Console]::WriteLine((Window-Answer $action));continue}
  $media=Pick-Session
  if(-not $media){[Console]::WriteLine((Window-Answer $action));continue}
  $accepted=$true
  $info=$media.GetPlaybackInfo();$controls=$info.Controls
  $timeline=$media.GetTimelineProperties()
  switch($action){
   'seek' {if(-not $controls.IsPlaybackPositionEnabled){$accepted=$false}else{$pos=[double]$request.position;if([double]::IsNaN($pos) -or $pos -lt 0 -or $pos -gt 86400){throw 'Invalid position'};$target=$timeline.StartTime.Ticks+[long]($pos*10000000);$target=[Math]::Min($timeline.EndTime.Ticks,[Math]::Max($timeline.StartTime.Ticks,$target));$accepted=Await-Result ($media.TryChangePlaybackPositionAsync($target)) ([bool])}}
   'shuffle' {if(-not $controls.IsShuffleEnabled){$accepted=$false}else{$accepted=Await-Result ($media.TryChangeShuffleActiveAsync([bool]$request.enabled)) ([bool])}}
   'repeat' {if(-not $controls.IsRepeatEnabled){$accepted=$false}else{if($request.mode -notin @('None','Track','List')){throw 'Invalid mode'};$mode=[Enum]::Parse([Windows.Media.MediaPlaybackAutoRepeatMode,Windows.Media,ContentType=WindowsRuntime],$request.mode);$accepted=Await-Result ($media.TryChangeAutoRepeatModeAsync($mode)) ([bool])}}
   'play' {$accepted=Await-Result ($media.TryPlayAsync()) ([bool])}
   'pause' {$accepted=Await-Result ($media.TryPauseAsync()) ([bool])}
   'next' {$accepted=Await-Result ($media.TrySkipNextAsync()) ([bool])}
   'previous' {$accepted=Await-Result ($media.TrySkipPreviousAsync()) ([bool])}
  }
  # the song's name: if Windows is slow to hand it over, the last one known for this session
  $sid=[string]$media.SourceAppUserModelId
  $title='';$artist='';$properties=$null
  try{
   $properties=Await-Result ($media.TryGetMediaPropertiesAsync()) $propertyType 2500
   $title=[string]$properties.Title;$artist=[string]$properties.Artist
   $known[$sid]=@($title,$artist)
  }catch{if($known.ContainsKey($sid)){$title=$known[$sid][0];$artist=$known[$sid][1]}}
  $key=$title+'|'+$artist
  if($key -ne $artKey -and $properties){
   $artKey=$key;$artData=$null
   try{
    if($art -and $properties.Thumbnail){
     $stream=Await-Result ($properties.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]) 2000
     $bytes=[CharlesMediaArt]::Read($stream)
     if($bytes -and $bytes.Length -gt 1){$mime=$(if($bytes[0] -eq 137 -and $bytes[1] -eq 80){'image/png'}elseif($bytes[0] -eq 255 -and $bytes[1] -eq 216){'image/jpeg'}else{''});if($mime){$artData='data:'+$mime+';base64,'+[Convert]::ToBase64String($bytes)}}
    }
   }catch{$artData=$null}
  }
  $info=$media.GetPlaybackInfo();$timeline=$media.GetTimelineProperties();$controls=$info.Controls
  $duration=[Math]::Max(0,($timeline.EndTime-$timeline.StartTime).TotalSeconds)
  $position=[Math]::Max(0,($timeline.Position-$timeline.StartTime).TotalSeconds)
  if($info.PlaybackStatus.ToString() -eq 'Playing' -and $duration -gt 0){$delta=([DateTimeOffset]::Now-$timeline.LastUpdatedTime).TotalSeconds;if($delta -ge 0 -and $delta -lt 86400){$position+=$delta}}
  $position=[Math]::Min($duration,$position)
  $shuffle=$null;if($null -ne $info.IsShuffleActive){$shuffle=[bool]$info.IsShuffleActive}
  $repeat=$null;if($null -ne $info.AutoRepeatMode){$repeat=$info.AutoRepeatMode.ToString()}
  [Console]::WriteLine((@{art=$artData;ok=$true;accepted=$accepted;restart=$script:restart;state=$info.PlaybackStatus.ToString();title=$title;artist=$artist;duration=$duration;position=$position;shuffle=$shuffle;repeat=$repeat;capabilities=@{seek=[bool]$controls.IsPlaybackPositionEnabled;shuffle=[bool]$controls.IsShuffleEnabled;repeat=[bool]$controls.IsRepeatEnabled}} | ConvertTo-Json -Compress -Depth 4))
 }catch{
  $script:manager=$null
  $answer=$null
  try{if($action){$answer=Window-Answer $action}}catch{$answer=$null}
  if($answer){[Console]::WriteLine($answer)}
  elseif($script:restart){[Console]::WriteLine('{"ok":false,"reason":"timeout","restart":true}')}else{[Console]::WriteLine('{"ok":false,"reason":"media-unavailable"}')}
 }
 if($script:restart){[Console]::Out.Flush();exit 0}
}
