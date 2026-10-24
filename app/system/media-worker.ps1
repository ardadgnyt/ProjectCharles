$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$propertyType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$streamType=[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$asyncMethod=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1)
# v0.8.14: a Windows media call that never finishes made every later status time out. Only
# the session list is required now; when it hangs the answer says restart=true (and where it
# hung) and this process ends, Charles starts a fresh one.
# v0.8.15: the song's name and cover are optional and asked for rarely (a new song, or every
# 20 s): position, length and state come from calls that cannot hang, so the progress bar
# keeps moving even when Windows is slow to hand over the name.
$script:restart=$false
$script:stage=''
function Await-Result($operation,[Type]$resultType,[int]$ms=3000,[switch]$Optional) {
 $task=$asyncMethod.MakeGenericMethod($resultType).Invoke($null,@($operation))
 if(-not $task.Wait($ms)){if(-not $Optional){$script:restart=$true};throw [System.TimeoutException]::new('Media timeout')}
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
$native=$false
try {
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class CharlesSpotifyWindow {
 public delegate bool EnumProc(IntPtr h, IntPtr l);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
 public static string[] Titles(int[] pids) {
  var set=new HashSet<uint>();foreach(var p in pids)set.Add((uint)p);
  var list=new List<string>();
  EnumWindows(delegate(IntPtr h, IntPtr l){uint pid;GetWindowThreadProcessId(h,out pid);if(set.Contains(pid)){var sb=new StringBuilder(512);if(GetWindowText(h,sb,512)>0)list.Add(sb.ToString());}return true;},IntPtr.Zero);
  return list.ToArray();
 }
 public static void Press(byte k){keybd_event(k,0,1,UIntPtr.Zero);keybd_event(k,0,3,UIntPtr.Zero);}
}
"@
$native=$true
} catch { $native=$false }
# Spotify's own window: "Artist - Song" while playing, "Spotify Premium" / "Spotify Free" when
# not. Also read while Spotify sits in the tray (its window is then hidden, not gone).
function Window-Status {
 $procs=@(Get-Process -Name Spotify -ErrorAction SilentlyContinue)
 if(-not $procs.Count){return $null}
 $titles=@()
 if($native){try{$titles=@([CharlesSpotifyWindow]::Titles([int[]]@($procs | ForEach-Object {$_.Id})))}catch{$titles=@()}}
 if(-not $titles.Count){$titles=@($procs | Where-Object {$_.MainWindowTitle} | ForEach-Object {[string]$_.MainWindowTitle})}
 foreach($t in $titles){
  if($t -notmatch '^(Spotify|GDI\+|Default IME|MSCTFIME)' -and $t -match '^(.+?) - (.+)$'){return @{state='Playing';artist=$matches[1].Trim();title=$matches[2].Trim()}}
 }
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
 if($key){if($native){[CharlesSpotifyWindow]::Press([byte]$key);Start-Sleep -Milliseconds 600;$w=Window-Status;if(-not $w){$w=@{state='Stopped';title='';artist=''}}}else{$accepted=$false}}
 return (@{ok=$true;accepted=$accepted;fallback=$true;restart=$script:restart;stage=$script:stage;state=$w.state;title=$w.title;artist=$w.artist;duration=0;position=0;art=$null;shuffle=$null;repeat=$null;capabilities=@{seek=$false;shuffle=$false;repeat=$false}} | ConvertTo-Json -Compress -Depth 4)
}
$manager=$null
$artKey='';$artData=$null
$meta=@{}          # session -> @{key; title; artist; at; failedAt}
function Pick-Session {
 $script:stage='sessions'
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
  $script:stage='request'
  $request=$line | ConvertFrom-Json
  $asked=[string]$request.action
  if($asked -notin @('status','play','pause','next','previous','seek','shuffle','repeat')){throw 'Invalid action'}
  $action=$asked
  # Windows' media sessions hung a moment ago: only Spotify's window for a while
  if($request.window -eq $true){[Console]::WriteLine((Window-Answer $action));continue}
  $media=Pick-Session
  if(-not $media){[Console]::WriteLine((Window-Answer $action));continue}
  $accepted=$true
  $script:stage='control'
  $info=$media.GetPlaybackInfo();$controls=$info.Controls
  $timeline=$media.GetTimelineProperties()
  switch($action){
   'seek' {if(-not $controls.IsPlaybackPositionEnabled){$accepted=$false}else{$pos=[double]$request.position;if([double]::IsNaN($pos) -or $pos -lt 0 -or $pos -gt 86400){throw 'Invalid position'};$target=$timeline.StartTime.Ticks+[long]($pos*10000000);$target=[Math]::Min($timeline.EndTime.Ticks,[Math]::Max($timeline.StartTime.Ticks,$target));$accepted=Await-Result ($media.TryChangePlaybackPositionAsync($target)) ([bool]) 3000 -Optional}}
   'shuffle' {if(-not $controls.IsShuffleEnabled){$accepted=$false}else{$accepted=Await-Result ($media.TryChangeShuffleActiveAsync([bool]$request.enabled)) ([bool]) 3000 -Optional}}
   'repeat' {if(-not $controls.IsRepeatEnabled){$accepted=$false}else{if($request.mode -notin @('None','Track','List')){throw 'Invalid mode'};$mode=[Enum]::Parse([Windows.Media.MediaPlaybackAutoRepeatMode,Windows.Media,ContentType=WindowsRuntime],$request.mode);$accepted=Await-Result ($media.TryChangeAutoRepeatModeAsync($mode)) ([bool]) 3000 -Optional}}
   'play' {$accepted=Await-Result ($media.TryPlayAsync()) ([bool]) 3000 -Optional}
   'pause' {$accepted=Await-Result ($media.TryPauseAsync()) ([bool]) 3000 -Optional}
   'next' {$accepted=Await-Result ($media.TrySkipNextAsync()) ([bool]) 3000 -Optional}
   'previous' {$accepted=Await-Result ($media.TrySkipPreviousAsync()) ([bool]) 3000 -Optional}
  }
  if($action -ne 'status'){Start-Sleep -Milliseconds 150}
  $script:stage='timeline'
  $info=$media.GetPlaybackInfo();$timeline=$media.GetTimelineProperties();$controls=$info.Controls
  $duration=[Math]::Max(0,($timeline.EndTime-$timeline.StartTime).TotalSeconds)
  $position=[Math]::Max(0,($timeline.Position-$timeline.StartTime).TotalSeconds)
  if($info.PlaybackStatus.ToString() -eq 'Playing' -and $duration -gt 0){$delta=([DateTimeOffset]::Now-$timeline.LastUpdatedTime).TotalSeconds;if($delta -ge 0 -and $delta -lt 86400){$position+=$delta}}
  $position=[Math]::Min($duration,$position)
  # the song's name: asked for when the song changes (its length or start moves), at most every
  # 20 s otherwise, never again for 30 s after Windows did not answer in time
  $script:stage='properties'
  $sid=[string]$media.SourceAppUserModelId
  $songKey=[string]$timeline.EndTime.Ticks+'|'+[string]$timeline.StartTime.Ticks
  $m=$meta[$sid];if(-not $m){$m=@{key='';title='';artist='';at=[DateTime]::MinValue;failedAt=[DateTime]::MinValue};$meta[$sid]=$m}
  $now=[DateTime]::UtcNow
  $properties=$null
  if(($m.key -ne $songKey -or ($now-$m.at).TotalSeconds -ge 20) -and ($now-$m.failedAt).TotalSeconds -ge 30){
   try{
    $properties=Await-Result ($media.TryGetMediaPropertiesAsync()) $propertyType 1500 -Optional
    $m.title=[string]$properties.Title;$m.artist=[string]$properties.Artist;$m.key=$songKey;$m.at=$now
   }catch{$m.failedAt=$now}
  }
  $title=$m.title;$artist=$m.artist
  if(-not $title){$w=$null;try{$w=Window-Status}catch{};if($w -and $w.title){$title=$w.title;$artist=$w.artist}}
  $key=$title+'|'+$artist
  if($properties -and $key -ne $artKey){
   $script:stage='art'
   $artKey=$key;$artData=$null
   $stream=$null
   try{
    if($art -and $properties.Thumbnail){
     $stream=Await-Result ($properties.Thumbnail.OpenReadAsync()) $streamType 1500 -Optional
     $bytes=[CharlesMediaArt]::Read($stream)
     if($bytes -and $bytes.Length -gt 1){$mime=$(if($bytes[0] -eq 137 -and $bytes[1] -eq 80){'image/png'}elseif($bytes[0] -eq 255 -and $bytes[1] -eq 216){'image/jpeg'}else{''});if($mime){$artData='data:'+$mime+';base64,'+[Convert]::ToBase64String($bytes)}}
    }
   }catch{$artData=$null}
   finally{
    # v0.8.15: the cover's stream is closed (left open, Spotify's media session could get stuck)
    if($stream){try{$stream.Dispose()}catch{}}
   }
  }
  $shuffle=$null;if($null -ne $info.IsShuffleActive){$shuffle=[bool]$info.IsShuffleActive}
  $repeat=$null;if($null -ne $info.AutoRepeatMode){$repeat=$info.AutoRepeatMode.ToString()}
  [Console]::WriteLine((@{art=$artData;ok=$true;accepted=$accepted;restart=$script:restart;state=$info.PlaybackStatus.ToString();title=$title;artist=$artist;duration=$duration;position=$position;shuffle=$shuffle;repeat=$repeat;capabilities=@{seek=[bool]$controls.IsPlaybackPositionEnabled;shuffle=[bool]$controls.IsShuffleEnabled;repeat=[bool]$controls.IsRepeatEnabled}} | ConvertTo-Json -Compress -Depth 4))
 }catch{
  $script:manager=$null
  $answer=$null
  try{if($action){$answer=Window-Answer $action}}catch{$answer=$null}
  if($answer){[Console]::WriteLine($answer)}
  elseif($script:restart){[Console]::WriteLine((@{ok=$false;reason='timeout';restart=$true;stage=$script:stage} | ConvertTo-Json -Compress))}
  else{[Console]::WriteLine((@{ok=$false;reason='media-unavailable';stage=$script:stage} | ConvertTo-Json -Compress))}
 }
 if($script:restart){[Console]::Out.Flush();exit 0}
}
