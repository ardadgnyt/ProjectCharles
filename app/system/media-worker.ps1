$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$propertyType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$asyncMethod=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1)
function Await-Result($operation,[Type]$resultType) {
 $task=$asyncMethod.MakeGenericMethod($resultType).Invoke($null,@($operation))
 if(-not $task.Wait(3000)){throw 'Media timeout'}
 return $task.Result
}
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
$artKey='';$artData=$null;$manager=$null
while($null -ne ($line=[Console]::ReadLine())) {
 try {
  $request=$line | ConvertFrom-Json
  $action=$request.action
  if($action -notin @('status','play','pause','next','previous','seek','shuffle','repeat')){throw 'Invalid action'}
  # v0.9.0: one session manager for the whole life of this worker (asking Windows for a new
  # one on every status, every second in v0.8.12, could leave Windows' media connection stuck)
  if(-not $manager){$manager=Await-Result ($managerType::RequestAsync()) $managerType}
  $media=$manager.GetSessions() | Where-Object {$_.SourceAppUserModelId -match '(?i)spotify'} | Select-Object -First 1
  if(-not $media){[Console]::WriteLine('{"ok":false,"reason":"no-session"}');continue}
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
  $properties=Await-Result ($media.TryGetMediaPropertiesAsync()) $propertyType
  $key=$properties.Title+'|'+$properties.Artist
  if($key -ne $artKey){
   $artKey=$key;$artData=$null
   try{
    if($properties.Thumbnail){
     $stream=Await-Result ($properties.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime])
     $bytes=[CharlesMediaArt]::Read($stream)
     # v0.9.0: the cover's stream is closed after reading (left open, Spotify's media connection
     # could get stuck after a while)
     try{$stream.Dispose()}catch{}
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
  [Console]::WriteLine((@{art=$artData;ok=$true;accepted=$accepted;state=$info.PlaybackStatus.ToString();title=$properties.Title;artist=$properties.Artist;duration=$duration;position=$position;shuffle=$shuffle;repeat=$repeat;capabilities=@{seek=[bool]$controls.IsPlaybackPositionEnabled;shuffle=[bool]$controls.IsShuffleEnabled;repeat=[bool]$controls.IsRepeatEnabled}} | ConvertTo-Json -Compress -Depth 4))
 }catch{$manager=$null;[Console]::WriteLine('{"ok":false,"reason":"media-unavailable"}')}
}
