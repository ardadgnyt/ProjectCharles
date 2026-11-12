// SPDX-License-Identifier: GPL-3.0-or-later
// v0.9.20: the one Windows helper of Charles (app/system/charles-helper.exe, built by
// scripts/build-helper.ps1 with the .NET Framework compiler that comes with Windows).
//
// It replaces five long-running PowerShell processes. Charles talks to it over stdin/stdout, one
// line per message: "<channel>\t<payload>". There is a fixed list of channels and of requests on
// each; nothing here runs a command, a script or a program. When Charles goes away stdin closes
// and this process ends, and Windows removes its hooks with it.
//
//   fg       the foreground window, reported when it changes (WinEvent hooks, no polling)
//   media    the Spotify session: status and control, and a line when it changes
//   metrics  system monitor: CPU, GPU, RAM counters
//   usage    per-program usage for the statistics, once a minute
//   keys     push to talk: a keyboard hook that looks at one key, and typing as Unicode input
//   guard    a shelf drag: frees the screen if Charles is frozen after the button was released
//
// Each channel has its own thread, so a slow answer on one (a program that does not answer UI
// Automation, say) never holds another up, and the keyboard hook has a thread of its own.
//
// Two more modes, each a short-lived process of its own:
//   --grab    pictures of the screen on request, raw pixels on stdout (it goes after a rest)
//   --static  processor and memory names for the monitor, once
//   --pdf     v0.9.26: the pages of one PDF as PNG pictures, for the converter
//   --image   v0.9.26: frames of TIFF / ICO / GIF / HEIC as PNG, or pictures as one multi-page TIFF
//   --ocr     v0.9.26: the words in one picture (Windows' own text recognition)
using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Automation;
using Windows.Foundation;
using Windows.Media;
using Windows.Media.Control;
using Windows.Storage.Streams;

[assembly: AssemblyTitle("Charles Helper")]
[assembly: AssemblyProduct("Charles")]
[assembly: AssemblyDescription("Charles Helper")]
[assembly: AssemblyCompany("HzPederPan")]

namespace Charles {

static class Native {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
 [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint r);
 [DllImport("user32.dll")] public static extern bool PostThreadMessage(uint t, uint m, IntPtr w, IntPtr l);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr h; public uint m; public IntPtr w, l; public uint t; public int x, y; }
 public const uint WM_QUIT = 0x12, WM_APP = 0x8000;
}

/** Text for a JSON string; nothing else is ever put between quotes unescaped. */
static class Json {
 // v0.9.27: one request line from stdin, read as UTF-8. Console.In uses the console's code page (857
 // on a Turkish Windows), so a path with ş, ı or ğ arrived broken and the file was "not found".
 public static string RequestLine() {
  using (var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), false, 65536)) return input.ReadLine() ?? "";
 }
 public static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
 public static string S(string v) {
  var b = new StringBuilder("\"");
  foreach (var c in v ?? "") {
   if (c == '"') b.Append("\\\""); else if (c == '\\') b.Append("\\\\");
   else if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
   else b.Append(c);
  }
  return b.Append('"').ToString();
 }
 public static string N(double? v) { return v.HasValue && !double.IsNaN(v.Value) && !double.IsInfinity(v.Value) ? v.Value.ToString("0.##", Inv) : "null"; }
 public static string B(bool v) { return v ? "true" : "false"; }

 /** One flat JSON object: strings, numbers, true, false, null. Anything else is refused. */
 public static Dictionary<string, object> Flat(string t) {
  var r = new Dictionary<string, object>(); var i = 0;
  Func<bool> ws = () => { while (i < t.Length && char.IsWhiteSpace(t[i])) i++; return i < t.Length; };
  Func<string> str = () => {
   if (t[i] != '"') throw new FormatException();
   var b = new StringBuilder(); i++;
   while (true) {
    if (i >= t.Length) throw new FormatException();
    var c = t[i++];
    if (c == '"') return b.ToString();
    if (c != '\\') { b.Append(c); continue; }
    if (i >= t.Length) throw new FormatException();
    c = t[i++];
    switch (c) {
     case 'n': b.Append('\n'); break; case 'r': b.Append('\r'); break; case 't': b.Append('\t'); break;
     case 'b': b.Append('\b'); break; case 'f': b.Append('\f'); break;
     case 'u': if (i + 4 > t.Length) throw new FormatException(); b.Append((char)int.Parse(t.Substring(i, 4), NumberStyles.HexNumber, Inv)); i += 4; break;
     default: b.Append(c); break;
    }
   }
  };
  if (!ws() || t[i++] != '{') throw new FormatException();
  if (ws() && t[i] == '}') return r;
  while (true) {
   if (!ws()) throw new FormatException();
   var k = str();
   if (!ws() || t[i++] != ':' || !ws()) throw new FormatException();
   object v;
   if (t[i] == '"') v = str();
   else if (string.CompareOrdinal(t, i, "true", 0, 4) == 0) { v = true; i += 4; }
   else if (string.CompareOrdinal(t, i, "false", 0, 5) == 0) { v = false; i += 5; }
   else if (string.CompareOrdinal(t, i, "null", 0, 4) == 0) { v = null; i += 4; }
   else {
    var s = i; while (i < t.Length && "+-.eE0123456789".IndexOf(t[i]) >= 0) i++;
    if (s == i) throw new FormatException();
    v = double.Parse(t.Substring(s, i - s), NumberStyles.Float, Inv);
   }
   r[k] = v;
   if (!ws()) throw new FormatException();
   var e = t[i++];
   if (e == '}') return r;
   if (e != ',') throw new FormatException();
  }
 }
 public static string Str(Dictionary<string, object> d, string k) { object v; return d.TryGetValue(k, out v) ? v as string : null; }
 public static bool Bool(Dictionary<string, object> d, string k) { object v; return d.TryGetValue(k, out v) && v is bool && (bool)v; }
 public static double? Num(Dictionary<string, object> d, string k) { object v; return d.TryGetValue(k, out v) && v is double ? (double?)(double)v : null; }
}

/** One open channel. */
abstract class Worker {
 public string Name; public volatile bool Closed;
 public void Emit(string text) { if (!Closed) Hub.Write(Name, text); }
 public abstract void Post(string text);
 public virtual void Close() { Closed = true; }
}

/** Requests one after another on a thread of the channel's own. */
class QueueWorker : Worker {
 readonly BlockingCollection<string> queue = new BlockingCollection<string>();
 readonly Action<QueueWorker, string> handle; readonly Action<QueueWorker> closing; public string Failed;
 public QueueWorker(string name, Action<QueueWorker, string> h, string failed, ApartmentState apartment, Action<QueueWorker> c) {
  Name = name; handle = h; Failed = failed; closing = c;
  var t = new Thread(Loop, 1 << 20); t.IsBackground = true; t.SetApartmentState(apartment); t.Start();
 }
 void Loop() {
  foreach (var line in queue.GetConsumingEnumerable()) {
   try { handle(this, line); }
   catch { if (Failed != null) Emit(Failed); }
  }
  if (closing != null) try { closing(this); } catch {}
 }
 public override void Post(string text) { if (!Closed) queue.Add(text); }
 public override void Close() { base.Close(); queue.CompleteAdding(); }
}

static class Hub {
 static Stream output; static readonly object Lock = new object();
 static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
 const int MaxLine = 12 * 1024 * 1024;
 public static void Write(string channel, string text) {
  var bytes = Utf8.GetBytes(channel + "\t" + text.Replace("\n", " ") + "\n");
  lock (Lock) { output.Write(bytes, 0, bytes.Length); output.Flush(); }
 }
 static Worker Open(string name) {
  switch (name) {
   case "fg": return new ForegroundWorker();
   case "media": return new QueueWorker(name, Media.Handle, "{\"ok\":false,\"reason\":\"media-unavailable\"}", ApartmentState.MTA, Media.Closing);
   case "metrics": return new QueueWorker(name, (w, l) => { if (l == "top") w.Emit("{\"top\":" + Metrics.Top() + "}"); else if (l == "sample") w.Emit(Metrics.Sample()); }, "{\"ok\":false}", ApartmentState.MTA, null);
   case "usage": return new QueueWorker(name, (w, l) => { if (l == "usage") w.Emit(Metrics.Usage()); }, "{\"failed\":true}", ApartmentState.MTA, null);
   case "keys": return Keys.Open();
   case "guard": return new QueueWorker(name, Guard.Handle, null, ApartmentState.MTA, null);
   default: return null;
  }
 }
 public static int Run() {
  output = new BufferedStream(Console.OpenStandardOutput(), 65536);
  var open = new Dictionary<string, Worker>();
  using (var input = new StreamReader(Console.OpenStandardInput(), Utf8, false, 65536)) {
   string line;
   while ((line = input.ReadLine()) != null) {
    if (line.Length > MaxLine) continue;
    var tab = line.IndexOf('\t'); if (tab < 1) continue;
    var name = line.Substring(0, tab); var text = line.Substring(tab + 1);
    Worker w; open.TryGetValue(name, out w);
    if (text == "!close") { if (w != null) { w.Close(); open.Remove(name); } continue; }
    if (w == null) { w = Open(name); if (w == null) continue; open[name] = w; }
    if (text != "!open") w.Post(text);
   }
  }
  // the pipe closed: Charles has gone. Windows removes the hooks with the process.
  Environment.Exit(0);
  return 0;
 }
}

// ── The foreground window ─────────────────────────────────────────────────────────────────────
class ForegroundWorker : Worker {
 delegate void Proc(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint thread, uint time);
 [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint a, uint b, IntPtr m, Proc p, uint pid, uint thread, uint flags);
 [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
 [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
 [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
 [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint p);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr p, uint f, StringBuilder s, ref uint n);
 const uint EVENT_SYSTEM_FOREGROUND = 3, EVENT_OBJECT_LOCATIONCHANGE = 0x800B, OUTOFCONTEXT = 0, SKIPOWN = 2;
 readonly ConcurrentQueue<string> queue = new ConcurrentQueue<string>();
 readonly ManualResetEvent ready = new ManualResetEvent(false);
 uint thread, placedPid; IntPtr hookForeground, hookPlace, lastWindow; bool lastFull, live; Proc keep;

 public ForegroundWorker() {
  Name = "fg";
  var t = new Thread(Loop, 1 << 20); t.IsBackground = true; t.Start();
  ready.WaitOne();
 }
 /** A window covering its whole monitor (a game, a video, a presentation), not the desktop itself. */
 static bool FullScreen(IntPtr h) {
  if (h == IntPtr.Zero) return false;
  var c = new StringBuilder(64); GetClassName(h, c, 64);
  var cls = c.ToString(); if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") return false;
  RECT r; if (!GetWindowRect(h, out r)) return false;
  var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
  if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
  return r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
 }
 static string AppName(uint pid) {
  var p = OpenProcess(0x1000, false, pid);
  if (p != IntPtr.Zero) {
   try {
    var s = new StringBuilder(1024); uint n = 1024;
    if (QueryFullProcessImageNameW(p, 0, s, ref n)) return Path.GetFileNameWithoutExtension(s.ToString());
   } finally { CloseHandle(p); }
  }
  using (var g = Process.GetProcessById((int)pid)) return g.ProcessName;
 }
 void Report(bool always) {
  var h = GetForegroundWindow(); var full = FullScreen(h);
  if (!always && h == lastWindow && full == lastFull) return;
  lastWindow = h; lastFull = full;
  uint pid; GetWindowThreadProcessId(h, out pid);
  Follow(pid);
  try {
   if (h == IntPtr.Zero || pid == 0) throw new InvalidOperationException();
   Emit("{\"app\":" + Json.S(AppName(pid)) + ",\"pid\":" + pid + ",\"window\":" + h.ToInt64() + ",\"full\":" + Json.B(full) + ",\"live\":" + Json.B(live) + "}");
  } catch { Emit("{\"app\":\"\",\"live\":" + Json.B(live) + "}"); }
 }
 /** Size changes only of the program in front: entering full screen in a video moves no focus. */
 void Follow(uint pid) {
  if (pid == placedPid) return;
  if (hookPlace != IntPtr.Zero) UnhookWinEvent(hookPlace);
  hookPlace = pid == 0 ? IntPtr.Zero : SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, IntPtr.Zero, keep, pid, 0, OUTOFCONTEXT);
  placedPid = pid;
 }
 void Hook() {
  Unhook();
  hookForeground = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, keep, 0, 0, OUTOFCONTEXT | SKIPOWN);
  live = hookForeground != IntPtr.Zero;
 }
 void Unhook() {
  if (hookForeground != IntPtr.Zero) UnhookWinEvent(hookForeground);
  if (hookPlace != IntPtr.Zero) UnhookWinEvent(hookPlace);
  hookForeground = hookPlace = IntPtr.Zero; placedPid = 0;
 }
 void Event(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint t, uint time) {
  if (ev == EVENT_OBJECT_LOCATIONCHANGE && (obj != 0 || child != 0 || hwnd != lastWindow)) return;
  try { Report(false); } catch {}
 }
 void Loop() {
  keep = Event;
  Native.MSG m;
  Native.PeekMessage(out m, IntPtr.Zero, 0, 0, 0); // the thread's message queue exists from here on
  thread = Native.GetCurrentThreadId();
  ready.Set();
  Hook();
  Report(true);
  while (Native.GetMessage(out m, IntPtr.Zero, 0, 0) > 0) {
   if (m.m != Native.WM_APP) continue;
   string line;
   while (queue.TryDequeue(out line)) {
    try {
     if (line == "read") Report(true);
     else if (line == "!refresh") { Hook(); Report(true); }
    } catch { Emit("{\"app\":\"\"}"); }
   }
  }
  Unhook();
 }
 public override void Post(string text) { queue.Enqueue(text); Native.PostThreadMessage(thread, Native.WM_APP, IntPtr.Zero, IntPtr.Zero); }
 public override void Close() { base.Close(); Native.PostThreadMessage(thread, Native.WM_QUIT, IntPtr.Zero, IntPtr.Zero); }
}

// ── Spotify's media session ───────────────────────────────────────────────────────────────────
static class Media {
 [DllImport("shcore.dll", PreserveSig = false)] static extern void CreateStreamOverRandomAccessStream([MarshalAs(UnmanagedType.IUnknown)] object source, ref Guid iid, out IStream result);
 const int WAIT = 3000;
 static GlobalSystemMediaTransportControlsSessionManager manager;
 static GlobalSystemMediaTransportControlsSession watched;
 static string artKey = "", artData; static QueueWorker owner;
 static readonly string[] Actions = { "status", "play", "pause", "next", "previous", "seek", "shuffle", "repeat" };
 static T Wait<T>(IAsyncOperation<T> op) {
  using (var done = new ManualResetEvent(false)) {
   op.Completed = (o, s) => { try { done.Set(); } catch (ObjectDisposedException) {} };
   if (!done.WaitOne(WAIT)) { try { op.Cancel(); } catch {} throw new TimeoutException(); }
  }
  return op.GetResults();
 }
 static byte[] ReadArt(object source) {
  IStream stream = null; var iid = new Guid("0000000c-0000-0000-C000-000000000046");
  try {
   CreateStreamOverRandomAccessStream(source, ref iid, out stream);
   System.Runtime.InteropServices.ComTypes.STATSTG stat; stream.Stat(out stat, 1);
   if (stat.cbSize < 1 || stat.cbSize > 2097152) return null;
   var bytes = new byte[(int)stat.cbSize]; var count = Marshal.AllocCoTaskMem(4);
   try { stream.Read(bytes, bytes.Length, count); Array.Resize(ref bytes, Marshal.ReadInt32(count)); return bytes; }
   finally { Marshal.FreeCoTaskMem(count); }
  } finally { if (stream != null) Marshal.ReleaseComObject(stream); }
 }
 static void Changed() { var w = owner; if (w != null) w.Emit("{\"changed\":true}"); }
 static void OnPlayback(GlobalSystemMediaTransportControlsSession s, PlaybackInfoChangedEventArgs a) { Changed(); }
 static void OnProperties(GlobalSystemMediaTransportControlsSession s, MediaPropertiesChangedEventArgs a) { Changed(); }
 static void OnSessions(GlobalSystemMediaTransportControlsSessionManager m, SessionsChangedEventArgs a) { Changed(); }
 static GlobalSystemMediaTransportControlsSession Spotify() {
  foreach (var s in manager.GetSessions())
   if (s.SourceAppUserModelId != null && s.SourceAppUserModelId.IndexOf("spotify", StringComparison.OrdinalIgnoreCase) >= 0) return s;
  return null;
 }
 static void Watch(GlobalSystemMediaTransportControlsSession s) {
  if (watched != null) { try { watched.PlaybackInfoChanged -= OnPlayback; watched.MediaPropertiesChanged -= OnProperties; } catch {} }
  watched = s;
  if (s != null) { s.PlaybackInfoChanged += OnPlayback; s.MediaPropertiesChanged += OnProperties; }
 }
 static void Forget() {
  try { Watch(null); } catch { watched = null; }
  if (manager != null) { try { manager.SessionsChanged -= OnSessions; } catch {} }
  manager = null;
 }
 public static void Closing(QueueWorker w) { Forget(); if (owner == w) owner = null; }
 public static void Handle(QueueWorker w, string line) {
  owner = w;
  if (line == "!refresh") { Forget(); return; }
  try { Request(w, line); }
  catch { Forget(); throw; }
 }
 static void Request(QueueWorker w, string line) {
  var c = Json.Flat(line); var action = Json.Str(c, "action");
  if (Array.IndexOf(Actions, action) < 0) throw new ArgumentException();
  // one session manager for the whole life of this channel (asking Windows for a new one on every
  // status could leave Windows' media connection stuck)
  if (manager == null) { manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync()); manager.SessionsChanged += OnSessions; }
  var media = Spotify();
  if (!Same(media, watched)) Watch(media);
  if (media == null) { w.Emit("{\"ok\":false,\"reason\":\"no-session\"}"); return; }
  var accepted = true;
  var info = media.GetPlaybackInfo(); var controls = info.Controls; var timeline = media.GetTimelineProperties();
  switch (action) {
   case "seek":
    if (!controls.IsPlaybackPositionEnabled) { accepted = false; break; }
    var pos = Json.Num(c, "position");
    if (!pos.HasValue || double.IsNaN(pos.Value) || pos.Value < 0 || pos.Value > 86400) throw new ArgumentException();
    var target = timeline.StartTime.Ticks + (long)(pos.Value * 10000000);
    accepted = Wait(media.TryChangePlaybackPositionAsync(Math.Min(timeline.EndTime.Ticks, Math.Max(timeline.StartTime.Ticks, target))));
    break;
   case "shuffle":
    if (!controls.IsShuffleEnabled) { accepted = false; break; }
    accepted = Wait(media.TryChangeShuffleActiveAsync(Json.Bool(c, "enabled")));
    break;
   case "repeat":
    if (!controls.IsRepeatEnabled) { accepted = false; break; }
    var mode = Json.Str(c, "mode");
    if (mode != "None" && mode != "Track" && mode != "List") throw new ArgumentException();
    accepted = Wait(media.TryChangeAutoRepeatModeAsync(mode == "None" ? MediaPlaybackAutoRepeatMode.None : mode == "Track" ? MediaPlaybackAutoRepeatMode.Track : MediaPlaybackAutoRepeatMode.List));
    break;
   case "play": accepted = Wait(media.TryPlayAsync()); break;
   case "pause": accepted = Wait(media.TryPauseAsync()); break;
   case "next": accepted = Wait(media.TrySkipNextAsync()); break;
   case "previous": accepted = Wait(media.TrySkipPreviousAsync()); break;
  }
  var properties = Wait(media.TryGetMediaPropertiesAsync());
  var key = properties.Title + "|" + properties.Artist;
  if (key != artKey) {
   artKey = key; artData = null;
   try {
    if (properties.Thumbnail != null) {
     var stream = Wait(properties.Thumbnail.OpenReadAsync());
     byte[] bytes;
     // the cover's stream is closed after reading (left open, Spotify's media connection could get
     // stuck after a while)
     try { bytes = ReadArt(stream); } finally { try { stream.Dispose(); } catch {} }
     if (bytes != null && bytes.Length > 1) {
      var mime = bytes[0] == 137 && bytes[1] == 80 ? "image/png" : bytes[0] == 255 && bytes[1] == 216 ? "image/jpeg" : "";
      if (mime != "") artData = "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
     }
    }
   } catch { artData = null; }
  }
  info = media.GetPlaybackInfo(); timeline = media.GetTimelineProperties(); controls = info.Controls;
  var duration = Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalSeconds);
  var position = Math.Max(0, (timeline.Position - timeline.StartTime).TotalSeconds);
  var state = info.PlaybackStatus.ToString();
  if (state == "Playing" && duration > 0) { var delta = (DateTimeOffset.Now - timeline.LastUpdatedTime).TotalSeconds; if (delta >= 0 && delta < 86400) position += delta; }
  position = Math.Min(duration, position);
  var shuffle = info.IsShuffleActive; var repeat = info.AutoRepeatMode;
  w.Emit("{\"art\":" + (artData == null ? "null" : Json.S(artData)) + ",\"ok\":true,\"accepted\":" + Json.B(accepted) + ",\"state\":" + Json.S(state) + ",\"title\":" + Json.S(properties.Title) + ",\"artist\":" + Json.S(properties.Artist) +
   ",\"duration\":" + D(duration) + ",\"position\":" + D(position) + ",\"shuffle\":" + (shuffle.HasValue ? Json.B(shuffle.Value) : "null") + ",\"repeat\":" + (repeat.HasValue ? Json.S(repeat.Value.ToString()) : "null") +
   ",\"capabilities\":{\"seek\":" + Json.B(controls.IsPlaybackPositionEnabled) + ",\"shuffle\":" + Json.B(controls.IsShuffleEnabled) + ",\"repeat\":" + Json.B(controls.IsRepeatEnabled) + "}}");
 }
 static string D(double v) { return v.ToString("0.###", Json.Inv); }
 static bool Same(GlobalSystemMediaTransportControlsSession a, GlobalSystemMediaTransportControlsSession b) {
  if (a == null || b == null) return a == b;
  return a.SourceAppUserModelId == b.SourceAppUserModelId;
 }
}

// ── System monitor: the counters Task Manager reads ───────────────────────────────────────────
[ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDXGIFactory1 {
 void _0(); void _1(); void _2(); void _3(); void _4(); void _5(); void _6(); void _7(); void _8();
 [PreserveSig] int EnumAdapters1(uint i, out IDXGIAdapter1 a);
}
[ComImport, Guid("29038f61-3839-4626-91fd-086879011a05"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDXGIAdapter1 {
 void _0(); void _1(); void _2(); void _3(); void _4(); void _5(); void _6();
 [PreserveSig] int GetDesc1(out AdapterDesc d);
}
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
struct AdapterDesc {
 [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Description;
 public uint VendorId, DeviceId, SubSysId, Revision;
 public UIntPtr DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory;
 public uint LuidLow; public int LuidHigh; public uint Flags;
}
[StructLayout(LayoutKind.Explicit)] struct FmtValue { [FieldOffset(0)] public uint Status; [FieldOffset(8)] public double Value; }
[StructLayout(LayoutKind.Sequential)] struct OpenLuid { public uint Low; public int High; public uint Adapter; }
[StructLayout(LayoutKind.Sequential)] struct QueryInfo { public uint Adapter; public int Type; public IntPtr Data; public uint Size; }
[StructLayout(LayoutKind.Sequential)] struct PerfData {
 public uint Index; public ulong MemFreq, MemMax, MemMaxOC, MemBand, PcieBand;
 public uint Fan, Power, Temperature; public byte Override;
}
static class Metrics {
 [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern uint PdhOpenQueryW(string s, IntPtr d, out IntPtr q);
 [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern uint PdhAddEnglishCounterW(IntPtr q, string p, IntPtr d, out IntPtr c);
 [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr q);
 [DllImport("pdh.dll")] static extern uint PdhGetFormattedCounterValue(IntPtr c, uint f, IntPtr t, out FmtValue v);
 [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern uint PdhGetFormattedCounterArrayW(IntPtr c, uint f, ref uint size, out uint count, IntPtr buf);
 [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid id, out IDXGIFactory1 f);
 [DllImport("gdi32.dll")] static extern int D3DKMTOpenAdapterFromLuid(ref OpenLuid a);
 [DllImport("gdi32.dll")] static extern int D3DKMTQueryAdapterInfo(ref QueryInfo q);
 const uint FMT = 0x200 | 0x8000; // double, no capping at 100
 static IntPtr query, cUtil, cPerf, cEngine, cVram, cCache, cStandbyA, cStandbyB, cStandbyC, cModified;
 class Gpu { public string Id, Name; public ulong Vram; public uint Low; public int High; public uint Kmt; }
 static readonly List<Gpu> Gpus = new List<Gpu>();
 static readonly Regex Engine = new Regex(@"luid_(0x[0-9a-f]+)_(0x[0-9a-f]+)_phys_\d+_eng_(\d+)_engtype_", RegexOptions.IgnoreCase);
 static readonly Regex Memory = new Regex(@"luid_(0x[0-9a-f]+)_(0x[0-9a-f]+)_phys_", RegexOptions.IgnoreCase);
 static readonly Regex ProcessId = new Regex(@"pid_(\d+)_", RegexOptions.IgnoreCase);
 static readonly object Sync = new object(); static bool started;
 static string Key(string high, string low) { return Convert.ToUInt32(high, 16).ToString("x8") + "_" + Convert.ToUInt32(low, 16).ToString("x8"); }
 static IntPtr Add(string path) { IntPtr c; return PdhAddEnglishCounterW(query, path, IntPtr.Zero, out c) == 0 ? c : IntPtr.Zero; }
 static void Init() {
  if (started) return; started = true;
  PdhOpenQueryW(null, IntPtr.Zero, out query);
  cUtil = Add(@"\Processor Information(_Total)\% Processor Utility");
  cPerf = Add(@"\Processor Information(_Total)\% Processor Performance");
  cEngine = Add(@"\GPU Engine(*)\Utilization Percentage");
  cVram = Add(@"\GPU Adapter Memory(*)\Dedicated Usage");
  cCache = Add(@"\Memory\Cache Bytes");
  cStandbyA = Add(@"\Memory\Standby Cache Core Bytes");
  cStandbyB = Add(@"\Memory\Standby Cache Normal Priority Bytes");
  cStandbyC = Add(@"\Memory\Standby Cache Reserve Bytes");
  cModified = Add(@"\Memory\Modified Page List Bytes");
  PdhCollectQueryData(query);
  try {
   var id = new Guid("770aae78-f26f-4dba-a829-253c83d1b387"); IDXGIFactory1 f;
   if (CreateDXGIFactory1(ref id, out f) == 0) {
    for (uint i = 0; i < 16; i++) {
     IDXGIAdapter1 a; if (f.EnumAdapters1(i, out a) != 0) break;
     AdapterDesc d; if (a.GetDesc1(out d) != 0 || (d.Flags & 2) != 0) continue; // 2: software adapter
     var g = new Gpu { Id = ((uint)d.LuidHigh).ToString("x8") + "_" + d.LuidLow.ToString("x8"), Name = d.Description.Trim(), Vram = d.DedicatedVideoMemory.ToUInt64(), Low = d.LuidLow, High = d.LuidHigh };
     try { var o = new OpenLuid { Low = g.Low, High = g.High }; if (D3DKMTOpenAdapterFromLuid(ref o) == 0) g.Kmt = o.Adapter; } catch {}
     Gpus.Add(g);
    }
   }
  } catch {}
 }
 static double? One(IntPtr c) {
  if (c == IntPtr.Zero) return null; FmtValue v;
  return PdhGetFormattedCounterValue(c, FMT, IntPtr.Zero, out v) == 0 && v.Status <= 1 ? (double?)v.Value : null;
 }
 static Dictionary<string, double> Many(IntPtr c) {
  var r = new Dictionary<string, double>(); if (c == IntPtr.Zero) return r;
  uint size = 0, count = 0;
  PdhGetFormattedCounterArrayW(c, FMT, ref size, out count, IntPtr.Zero);
  if (size == 0) return r;
  var buf = Marshal.AllocHGlobal((int)size);
  try {
   if (PdhGetFormattedCounterArrayW(c, FMT, ref size, out count, buf) != 0) return r;
   for (int i = 0; i < count; i++) {
    var at = buf + i * 24; var name = Marshal.PtrToStringUni(Marshal.ReadIntPtr(at));
    var v = (FmtValue)Marshal.PtrToStructure(at + 8, typeof(FmtValue));
    if (name != null && v.Status <= 1) r[name] = v.Value;
   }
  } finally { Marshal.FreeHGlobal(buf); }
  return r;
 }
 static void Sensors(Gpu g, out double? temp, out double? power) {
  temp = null; power = null; if (g.Kmt == 0) return;
  var size = Marshal.SizeOf(typeof(PerfData)); var buf = Marshal.AllocHGlobal(size);
  try {
   for (int i = 0; i < size; i++) Marshal.WriteByte(buf, i, 0);
   var q = new QueryInfo { Adapter = g.Kmt, Type = 62, Data = buf, Size = (uint)size };
   if (D3DKMTQueryAdapterInfo(ref q) != 0) return;
   var p = (PerfData)Marshal.PtrToStructure(buf, typeof(PerfData));
   if (p.Temperature > 0 && p.Temperature < 1500) temp = p.Temperature / 10.0;
   if (p.Power > 0 && p.Power <= 1200) power = p.Power / 10.0;
  } catch {} finally { Marshal.FreeHGlobal(buf); }
 }
 public static string Sample() {
  lock (Sync) {
   Init();
   var ok = PdhCollectQueryData(query) == 0;
   var engines = new Dictionary<string, double>(); // adapter|engine → sum over the processes
   foreach (var e in Many(cEngine)) {
    var m = Engine.Match(e.Key); if (!m.Success) continue;
    var k = Key(m.Groups[1].Value, m.Groups[2].Value) + "|" + m.Groups[3].Value;
    double old; engines.TryGetValue(k, out old); engines[k] = old + e.Value;
   }
   var vram = new Dictionary<string, double>();
   foreach (var e in Many(cVram)) {
    var m = Memory.Match(e.Key); if (!m.Success) continue;
    var k = Key(m.Groups[1].Value, m.Groups[2].Value);
    double old; vram.TryGetValue(k, out old); vram[k] = old + e.Value;
   }
   var gpus = new List<string>();
   foreach (var g in Gpus) {
    // like Task Manager: the busiest engine of the adapter; engines are never added together
    double? load = null; var pre = g.Id + "|";
    foreach (var e in engines) if (e.Key.StartsWith(pre, StringComparison.Ordinal)) load = Math.Max(load ?? 0, e.Value);
    if (!load.HasValue && engines.Count > 0) load = 0;
    double v; double? used = null; if (vram.TryGetValue(g.Id, out v)) used = v;
    double? temp, power; Sensors(g, out temp, out power);
    gpus.Add("{\"id\":" + Json.S(g.Id) + ",\"name\":" + Json.S(g.Name) + ",\"load\":" + Json.N(load) + ",\"vramUsed\":" + Json.N(used) + ",\"vramTotal\":" + Json.N(g.Vram) + ",\"temp\":" + Json.N(temp) + ",\"power\":" + Json.N(power) + "}");
   }
   var standby = (One(cStandbyA) ?? 0) + (One(cStandbyB) ?? 0) + (One(cStandbyC) ?? 0) + (One(cModified) ?? 0);
   return "{\"ok\":" + Json.B(ok) + ",\"cpu\":" + Json.N(One(cUtil)) + ",\"perf\":" + Json.N(One(cPerf)) + ",\"cache\":" + Json.N(standby > 0 ? (double?)standby : One(cCache)) + ",\"gpus\":[" + string.Join(",", gpus) + "]}";
  }
 }
 static Dictionary<int, double> lastCpu = new Dictionary<int, double>(); static long lastAt;
 public static string Top() {
  var now = Stopwatch.GetTimestamp(); var seconds = lastAt == 0 ? 0 : (now - lastAt) / (double)Stopwatch.Frequency; lastAt = now;
  var next = new Dictionary<int, double>(); var names = new Dictionary<string, double[]>();
  foreach (var p in Process.GetProcesses()) {
   try {
    if (p.Id == 0) continue;
    var ms = p.TotalProcessorTime.TotalMilliseconds; next[p.Id] = ms;
    double old, cpu = 0; if (seconds > 0 && lastCpu.TryGetValue(p.Id, out old)) cpu = Math.Max(0, (ms - old) / seconds / 10 / Environment.ProcessorCount);
    double[] row; if (!names.TryGetValue(p.ProcessName, out row)) names[p.ProcessName] = row = new double[2];
    row[0] += cpu; row[1] += p.WorkingSet64;
   } catch {} finally { p.Dispose(); }
  }
  lastCpu = next;
  return "[" + string.Join(",", names.OrderByDescending(n => n.Value[0]).ThenByDescending(n => n.Value[1]).Take(6).Select(n => "{\"name\":" + Json.S(n.Key) + ",\"cpu\":" + Json.N(n.Value[0]) + ",\"ram\":" + Json.N(n.Value[1]) + "}")) + "]";
 }
 /** Every program: id, name, start, processor seconds, MB of memory and its busiest GPU engine. */
 public static string Usage() {
  var gpu = new Dictionary<string, double>(); bool available;
  lock (Sync) {
   Init();
   available = cEngine != IntPtr.Zero && PdhCollectQueryData(query) == 0;
   if (available) foreach (var e in Many(cEngine)) {
    var m = ProcessId.Match(e.Key); if (!m.Success) continue;
    double old; gpu.TryGetValue(m.Groups[1].Value, out old); gpu[m.Groups[1].Value] = Math.Max(old, e.Value);
   }
  }
  var items = new List<string>();
  foreach (var p in Process.GetProcesses()) {
   try {
    double g; gpu.TryGetValue(p.Id.ToString(Json.Inv), out g);
    items.Add("{\"id\":" + p.Id + ",\"name\":" + Json.S(p.ProcessName) + ",\"start\":\"" + p.StartTime.Ticks.ToString(Json.Inv) + "\",\"cpu\":" + p.TotalProcessorTime.TotalSeconds.ToString("0.###", Json.Inv) + ",\"ram\":" + Math.Round(p.WorkingSet64 / 1048576.0, 2).ToString("0.##", Json.Inv) + ",\"gpu\":" + (available ? Json.N(g) : "null") + "}");
   } catch {} finally { p.Dispose(); }
  }
  return "{\"gpuAvailable\":" + Json.B(available) + ",\"items\":[" + string.Join(",", items) + "]}";
 }
}

// ── Push to talk ──────────────────────────────────────────────────────────────────────────────
/** The gestures: hold, double press, a single tap that must stay an ordinary key press. */
class PushToTalk {
 public enum S { Idle, Pressed, TapWait, Second, Held, Free, Closing, Drain }
 public S State = S.Idle;
 public bool EscArmed, EscDown, Paused;
 public Action<string> Emit = delegate { };
 public Action Inject = delegate { };
 public Action<string> Start = delegate { }; // "hold" or "tap": starts that timer
 public Action Stop = delegate { };
 public bool Down() {
  switch (State) {
   case S.Idle: if (Paused) return false; State = S.Pressed; Start("hold"); return true;
   case S.TapWait: Stop(); State = S.Second; Emit("free"); return true;
   case S.Free: State = S.Closing; Emit("stop"); return true;
   default: return true; // key repeat: never a second press
  }
 }
 public bool Up() {
  switch (State) {
   case S.Pressed: Stop(); State = S.TapWait; Start("tap"); return true;
   case S.Held: State = S.Idle; Emit("stop"); return true;
   case S.Second: State = S.Free; return true;
   case S.Closing: case S.Drain: State = S.Idle; return true;
   default: return false;
  }
 }
 public void Fire(string which) {
  if (which == "hold" && State == S.Pressed) { State = S.Held; Emit("hold"); }
  else if (which == "tap" && State == S.TapWait) { State = S.Idle; Inject(); }
 }
 /** Any other key while a tap waits: the tap goes first, so the order of the keys stays. */
 public void Other() { if (State == S.TapWait) { Stop(); State = S.Idle; Inject(); } }
 public bool Esc(bool down) {
  if (down && EscArmed) { EscDown = true; EscArmed = false; Emit("cancel"); return true; }
  if (!down && EscDown) { EscDown = false; return true; }
  return false;
 }
 /** Recording ended by itself (cancel, a limit, an error). A key still held stays quiet. */
 public void Reset() {
  Stop();
  State = State == S.Held || State == S.Second || State == S.Closing || State == S.Pressed ? S.Drain : S.Idle;
 }
}

/**
 * Two ordinary keys used together (Right + Up): each still works alone. The first one is held back
 * for a moment, because once the app has it the cursor has moved. The gestures above stay the same:
 * "pressed" is the two keys joining and "released" is the first of them letting go.
 */
class Chord {
 public int A, B, Waiting;
 public bool DownA, DownB, TookA, TookB, Joined;
 public PushToTalk M;
 public Action<int, bool, bool> Send = delegate { }; // key, press, release
 public Action Wait = delegate { };
 public Action Go = delegate { };
 public bool On { get { return B != 0; } }
 public void Set(int a, int b) { Go(); A = a; B = b; Waiting = 0; DownA = DownB = TookA = TookB = Joined = false; }
 void Take(int k, bool v) { if (k == A) TookA = v; else TookB = v; }
 bool Took(int k) { return k == A ? TookA : TookB; }
 /** The key goes through (false) or stays with Charles (true). */
 public bool Down(int k, bool plain) {
  var first = k == A; var other = first ? B : A;
  if (first ? DownA : DownB) return Took(k); // key repeat: never a second press
  if (first) DownA = true; else DownB = true;
  var idle = M.Paused && M.State == PushToTalk.S.Idle;
  if (!(DownA && DownB)) {
   if (!plain || idle) return false; // Shift + Right selects, as always
   Waiting = k; Take(k, true); Wait();
   return true;
  }
  if (!plain || idle) { Flush(); return false; }
  if (Waiting == other) { Go(); Waiting = 0; }
  else if (!Took(other)) Send(other, false, true); // it reached the app first: the app sees it let go
  Take(other, true); Take(k, true);
  Joined = true;
  M.Down();
  return true;
 }
 public bool Up(int k) {
  if (k == A) DownA = false; else DownB = false;
  var took = Took(k);
  Take(k, false);
  if (Waiting == k) { Go(); Waiting = 0; Send(k, true, true); return true; } // a tap: it was only ever this key
  if (Joined) { Joined = false; M.Up(); }
  return took;
 }
 /** The key waited long enough, or another key came: it goes to the app now, in its order. */
 public bool Flush() {
  if (Waiting == 0) return false;
  Go();
  var k = Waiting;
  Waiting = 0;
  Take(k, false);
  Send(k, true, false);
  return true;
 }
}

static class Keys {
 [StructLayout(LayoutKind.Sequential)] struct KB { public uint vk, scan, flags, time; public IntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; public uint a, b; }
 [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public KEYBDINPUT k; }
 delegate IntPtr Proc(int code, IntPtr w, IntPtr l);
 [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, Proc p, IntPtr m, uint t);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int c, IntPtr w, IntPtr l);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
 [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] i, int s);
 [DllImport("user32.dll")] static extern uint MapVirtualKey(uint c, uint t);
 [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string n);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint t, ref GUI g);
 [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetLong(IntPtr h, int i);
 [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint p);
 [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
 [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr t, int c, out int v, int l, out int r);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct RC { public int a, b, c, d; }
 [StructLayout(LayoutKind.Sequential)] struct GUI { public int size; public uint flags; public IntPtr active, focus, capture, menu, move, caret; public RC rc; }
 static readonly IntPtr Mark = new IntPtr(0x43484C53); // what Charles itself types: passes the hook
 static PushToTalk M = new PushToTalk();
 static Chord J = new Chord { M = M };
 const int JOIN_MS = 100, DOUBLE_MS = 220, DOUBLE_CHORD_MS = 340;
 static Proc keep; static Timer timer, joinTimer; static uint hookThread; static QueueWorker owner;
 static int key; static bool ctrl, alt, shift, win, tapBack; static readonly object Lock = new object();
 static void Line(string s) { var w = owner; if (w != null) w.Emit(s); }
 static void Config(int vk, int vk2, bool c, bool a, bool s, bool w) {
  lock (Lock) {
   J.Flush();
   key = vk2 != 0 ? 0 : vk; ctrl = c; alt = a; shift = s; win = w; tapBack = vk2 == 0 && !(c || a || s || w);
   J.Set(vk2 != 0 ? vk : 0, vk2);
   M.Reset(); M.State = PushToTalk.S.Idle;
  }
 }
 static bool D(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
 static void Key(int vk, bool press, bool release) {
  var scan = (ushort)MapVirtualKey((uint)vk, 0);
  uint ext = (vk >= 0x21 && vk <= 0x2E) ? 1u : 0u;
  var i = new INPUT[(press ? 1 : 0) + (release ? 1 : 0)];
  var n = 0;
  if (press) { i[n].type = 1; i[n].k.wVk = (ushort)vk; i[n].k.wScan = scan; i[n].k.dwFlags = ext; i[n].k.extra = Mark; n++; }
  if (release) { i[n].type = 1; i[n].k.wVk = (ushort)vk; i[n].k.wScan = scan; i[n].k.dwFlags = ext | 2; i[n].k.extra = Mark; n++; }
  SendInput((uint)n, i, Marshal.SizeOf(typeof(INPUT)));
 }
 /** A key that came while another was held back: it goes after that one, as it was pressed. */
 static void Again(KB k) {
  var i = new INPUT[1];
  i[0].type = 1; i[0].k.wVk = (ushort)k.vk; i[0].k.wScan = (ushort)k.scan; i[0].k.dwFlags = k.flags & 1u; i[0].k.extra = Mark;
  SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
 }
 static IntPtr OnKey(int code, IntPtr w, IntPtr l) {
  if (code < 0) return CallNextHookEx(IntPtr.Zero, code, w, l);
  var k = (KB)Marshal.PtrToStructure(l, typeof(KB));
  if (k.extra == Mark) return CallNextHookEx(IntPtr.Zero, code, w, l);
  var msg = w.ToInt32(); var down = msg == 0x100 || msg == 0x104; var up = msg == 0x101 || msg == 0x105;
  var swallow = false;
  lock (Lock) {
   var vk = (int)k.vk;
   var chord = J.On && (vk == J.A || vk == J.B);
   var flushed = down && !chord && J.Flush();
   if (chord) {
    var plain = !(D(0x11) || D(0x12) || D(0x10) || D(0x5B) || D(0x5C));
    if (up) swallow = J.Up(vk);
    else if (down) swallow = J.Down(vk, plain);
   }
   else if (vk == 0x1B) swallow = M.Esc(down);
   else if (vk == key) {
    var c = D(0x11); var a = D(0x12); var s = D(0x10); var v = D(0x5B) || D(0x5C);
    var active = M.State != PushToTalk.S.Idle;
    if (up) swallow = M.Up();
    else if (down && (active || (c == ctrl && a == alt && s == shift && v == win))) swallow = M.Down();
   } else if (down && vk != 0x10 && vk != 0x11 && vk != 0x12 && vk != 0xA0 && vk != 0xA1 && vk != 0xA2 && vk != 0xA3 && vk != 0xA4 && vk != 0xA5) M.Other();
   if (flushed && !swallow) { Again(k); swallow = true; }
  }
  return swallow ? new IntPtr(1) : CallNextHookEx(IntPtr.Zero, code, w, l);
 }
 static void Fire(object which) { lock (Lock) { if ((string)which == "join") J.Flush(); else M.Fire((string)which); } }
 static void Wire() {
  M.Emit = (e) => Line("{\"e\":\"" + e + "\"}");
  M.Inject = () => { if (tapBack) Key(key, true, true); };
  // no key waits for the end of a chord's tap, so its second press can have more time
  M.Start = (which) => { if (timer != null) timer.Dispose(); timer = new Timer(Fire, which, which == "hold" ? 260 : J.On ? DOUBLE_CHORD_MS : DOUBLE_MS, Timeout.Infinite); };
  M.Stop = () => { if (timer != null) { timer.Dispose(); timer = null; } };
  J.Send = Key;
  J.Wait = () => { if (joinTimer != null) joinTimer.Dispose(); joinTimer = new Timer(Fire, "join", JOIN_MS, Timeout.Infinite); };
  J.Go = () => { if (joinTimer != null) { joinTimer.Dispose(); joinTimer = null; } };
 }
 static void On() {
  Off();
  Wire();
  var started = new ManualResetEvent(false);
  var t = new Thread(() => {
   keep = OnKey;
   Native.MSG m;
   Native.PeekMessage(out m, IntPtr.Zero, 0, 0, 0);
   hookThread = Native.GetCurrentThreadId();
   // this thread's own hook: the next one may already be in place when this one goes
   var hook = SetWindowsHookEx(13, keep, GetModuleHandle(null), 0);
   Line(hook == IntPtr.Zero ? "{\"e\":\"hook-failed\"}" : "{\"e\":\"ready\"}");
   started.Set();
   while (Native.GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
   if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
  }, 1 << 20);
  t.IsBackground = true; t.Priority = ThreadPriority.AboveNormal; t.Start();
  started.WaitOne();
 }
 static void Off() {
  if (hookThread == 0) return;
  Native.PostThreadMessage(hookThread, Native.WM_QUIT, IntPtr.Zero, IntPtr.Zero);
  hookThread = 0;
  lock (Lock) { if (timer != null) { timer.Dispose(); timer = null; } J.Flush(); J.Set(J.A, J.B); M.State = PushToTalk.S.Idle; }
 }
 static void Sim(string op) {
  M.Emit = (e) => Line("{\"e\":\"" + e + "\"}");
  M.Inject = () => Line("{\"e\":\"inject\"}");
  M.Start = (w) => Line("{\"timer\":\"" + w + "\"}");
  M.Stop = () => { };
  J.Send = (k, p, r) => Line("{\"send\":\"" + k + (p ? " press" : "") + (r ? " release" : "") + "\"}");
  J.Wait = () => Line("{\"timer\":\"join\"}");
  J.Go = () => { };
  if (op == "chord") J.Set(0x27, 0x26);
  else if (op == "a+" || op == "b+" || op == "a!" || op == "b!") Line("{\"swallow\":" + Json.B(J.Down(op[0] == 'a' ? J.A : J.B, op[1] == '+')) + "}");
  else if (op == "a-" || op == "b-") Line("{\"swallow\":" + Json.B(J.Up(op[0] == 'a' ? J.A : J.B)) + "}");
  else if (op == "join") J.Flush();
  if (op == "down") Line("{\"swallow\":" + Json.B(M.Down()) + "}");
  else if (op == "up") Line("{\"swallow\":" + Json.B(M.Up()) + "}");
  else if (op == "hold" || op == "tap") M.Fire(op);
  else if (op == "other") M.Other();
  else if (op == "esc") { M.EscArmed = true; Line("{\"swallow\":" + Json.B(M.Esc(true)) + "}"); }
  else if (op == "reset") M.Reset();
  Line("{\"state\":\"" + M.State + "\"}");
 }
 static void Set(string what, bool on) { lock (Lock) { if (what == "esc") M.EscArmed = on; else if (what == "pause") M.Paused = on; else if (what == "reset") M.Reset(); } }
 /** Waits for held modifiers (a shortcut just let go), then types. Never presses Enter. */
 static bool Type(string text) {
  for (var w = 0; w < 100 && (D(0x11) || D(0x12) || D(0x10) || D(0x5B) || D(0x5C)); w++) Thread.Sleep(10);
  var size = Marshal.SizeOf(typeof(INPUT));
  for (var at = 0; at < text.Length; at += 200) {
   var part = text.Substring(at, Math.Min(200, text.Length - at));
   var i = new INPUT[part.Length * 2];
   for (var n = 0; n < part.Length; n++) {
    i[n * 2].type = i[n * 2 + 1].type = 1;
    i[n * 2].k.wScan = i[n * 2 + 1].k.wScan = part[n];
    i[n * 2].k.dwFlags = 4; i[n * 2 + 1].k.dwFlags = 4 | 2; i[n * 2].k.extra = i[n * 2 + 1].k.extra = Mark;
   }
   if (SendInput((uint)i.Length, i, size) != i.Length) return false;
   Thread.Sleep(4);
  }
  return true;
 }
 static bool Elevated(uint pid) {
  var p = OpenProcess(0x1000, false, pid); if (p == IntPtr.Zero) return true;
  IntPtr t; int v = 0, r;
  var ok = OpenProcessToken(p, 8, out t);
  if (ok) { GetTokenInformation(t, 20, out v, 4, out r); CloseHandle(t); }
  CloseHandle(p);
  return !ok || v != 0;
 }
 /** Which window and box has the keyboard, and whether typing there is allowed. */
 static string Target() {
  var h = GetForegroundWindow(); uint pid;
  var thread = GetWindowThreadProcessId(h, out pid);
  var g = new GUI(); g.size = Marshal.SizeOf(typeof(GUI)); GetGUIThreadInfo(thread, ref g);
  var s = new StringBuilder(256); GetWindowText(h, s, 256);
  var app = ""; try { using (var p = Process.GetProcessById((int)pid)) app = p.ProcessName; } catch {}
  var password = g.focus != IntPtr.Zero && (GetLong(g.focus, -16).ToInt64() & 0x20) != 0;
  var rdonly = false; var element = "";
  try {
   var f = AutomationElement.FocusedElement;
   if (f != null && f.Current.ProcessId == (int)pid) {
    if (f.Current.IsPassword) password = true;
    element = string.Join(".", f.GetRuntimeId());
    object v; if (f.TryGetCurrentPattern(ValuePattern.Pattern, out v) && ((ValuePattern)v).Current.IsReadOnly) rdonly = true;
   }
  } catch {}
  return "{\"hwnd\":" + h.ToInt64() + ",\"focus\":" + g.focus.ToInt64() + ",\"pid\":" + pid + ",\"title\":" + Json.S(s.ToString()) + ",\"app\":" + Json.S(app) + ",\"elevated\":" + Json.B(Elevated(pid)) + ",\"password\":" + Json.B(password) + ",\"readonly\":" + Json.B(rdonly) + ",\"element\":" + Json.S(element) + "}";
 }
 static void Handle(QueueWorker w, string line) {
  owner = w;
  if (line == "!refresh") { if (hookThread != 0) On(); return; }
  var c = Json.Flat(line);
  switch (Json.Str(c, "cmd")) {
   case "on": On(); break;
   case "off": Off(); break;
   case "config": Config((int)(Json.Num(c, "vk") ?? 0), (int)(Json.Num(c, "vk2") ?? 0), Json.Bool(c, "ctrl"), Json.Bool(c, "alt"), Json.Bool(c, "shift"), Json.Bool(c, "win")); break;
   case "set": Set(Json.Str(c, "what"), Json.Bool(c, "value")); break;
   case "sim": Sim(Json.Str(c, "op")); break;
   case "target": w.Emit("{\"r\":" + Target() + "}"); break;
   case "type": w.Emit("{\"r\":{\"typed\":" + Json.B(Type(Encoding.UTF8.GetString(Convert.FromBase64String(Json.Str(c, "text"))))) + "}}"); break;
  }
 }
 public static Worker Open() {
  var w = new QueueWorker("keys", Handle, "{\"r\":null}", ApartmentState.MTA, (q) => { Off(); if (owner == q) owner = null; });
  owner = w;
  w.Emit("{\"e\":\"loaded\"}");
  return w;
 }
}

[StructLayout(LayoutKind.Sequential)] struct BITMAPINFOHEADER {
 public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
}

// ── While a shelf file is dropped ─────────────────────────────────────────────────────────────
/**
 * Explorer's Drop may hold Charles' main thread until "Replace or Skip" is answered. A frozen window
 * takes the clicks and leaves the drag pointer on screen, and that dialog may be under it, so from
 * outside, on the one window Charles named and only if it is Charles': it lets clicks through and
 * leaves the topmost band. Charles undoes both as soon as it runs again.
 */
static class Guard {
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
 [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
 [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetLong(IntPtr h, int i);
 [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetLong(IntPtr h, int i, IntPtr v);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int t, uint f);
 const int GRACE_MS = 260, STEP_MS = 20, GWL_EXSTYLE = -20;
 const long TRANSPARENT = 0x20, LAYERED = 0x80000;
 const uint NOSIZE = 1, NOMOVE = 2, NOACTIVATE = 0x10, ASYNC = 0x4000;
 public static void Handle(QueueWorker w, string line) {
  var c = Json.Flat(line);
  var window = new IntPtr((long)(Json.Num(c, "window") ?? 0)); var pid = (uint)(Json.Num(c, "pid") ?? 0);
  uint owner = 0;
  if (window == IntPtr.Zero || !IsWindow(window) || GetWindowThreadProcessId(window, out owner) == 0 || owner != pid) return;
  var button = GetSystemMetrics(23) != 0 ? 2 : 1;
  while (!w.Closed && (GetAsyncKeyState(button) & 0x8000) != 0) Thread.Sleep(STEP_MS);
  for (var t = 0; t < GRACE_MS && !w.Closed; t += STEP_MS) Thread.Sleep(STEP_MS);
  if (w.Closed) return;
  SetLong(window, GWL_EXSTYLE, new IntPtr(GetLong(window, GWL_EXSTYLE).ToInt64() | TRANSPARENT | LAYERED));
  SetWindowPos(window, new IntPtr(-2), 0, 0, 0, 0, NOSIZE | NOMOVE | NOACTIVATE | ASYNC);
  w.Emit("{\"freed\":true}");
 }
}

// ── Pictures of the screen (a process of its own, while pictures are being taken) ─────────────
static class Grab {
 [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
 [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
 [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
 [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
 [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
 [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
 [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, uint rop);
 [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER b, uint usage, out IntPtr bits, IntPtr section, uint offset);
 const int MaxSide = 32767;
 static bool Shot(Stream output, int x, int y, int w, int h) {
  var b = new BITMAPINFOHEADER { biSize = 40, biWidth = w, biHeight = -h, biPlanes = 1, biBitCount = 32 };
  IntPtr bits; var screen = GetDC(IntPtr.Zero); var mem = CreateCompatibleDC(screen);
  var bmp = CreateDIBSection(screen, ref b, 0, out bits, IntPtr.Zero, 0);
  try {
   if (bmp == IntPtr.Zero) return false;
   var old = SelectObject(mem, bmp);
   var ok = BitBlt(mem, 0, 0, w, h, screen, x, y, 0x00CC0020);
   SelectObject(mem, old);
   if (!ok) return false;
   var bytes = new byte[w * h * 4];
   Marshal.Copy(bits, bytes, 0, bytes.Length);
   for (var i = 3; i < bytes.Length; i += 4) bytes[i] = 255; // GDI leaves the alpha at 0
   output.Write(BitConverter.GetBytes(w), 0, 4); output.Write(BitConverter.GetBytes(h), 0, 4);
   output.Write(bytes, 0, bytes.Length); output.Flush();
   return true;
  } finally {
   if (bmp != IntPtr.Zero) DeleteObject(bmp);
   DeleteDC(mem); ReleaseDC(IntPtr.Zero, screen);
  }
 }
 public static int Run() {
  var output = Console.OpenStandardOutput();
  var hello = Encoding.ASCII.GetBytes("ready\n"); output.Write(hello, 0, hello.Length); output.Flush();
  using (var input = new StreamReader(Console.OpenStandardInput(), Encoding.ASCII)) {
   string line;
   while ((line = input.ReadLine()) != null && line != "quit") {
    var done = false;
    try {
     var p = line.Split(' ');
     int x = int.Parse(p[0], Json.Inv), y = int.Parse(p[1], Json.Inv), w = int.Parse(p[2], Json.Inv), h = int.Parse(p[3], Json.Inv);
     if (p.Length == 4 && w > 0 && h > 0 && w <= MaxSide && h <= MaxSide && (long)w * h * 4 < int.MaxValue) done = Shot(output, x, y, w, h);
    } catch {}
    if (!done) { output.Write(new byte[8], 0, 8); output.Flush(); }
   }
  }
  return 0;
 }
}

/** What the monitor shows beside its charts; asked once, in a process that ends at once. */
static class Static {
 public static int Run() {
  string cpu = "null", ram = "null";
  try {
   using (var q = new ManagementObjectSearcher("SELECT Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed FROM Win32_Processor"))
    foreach (ManagementObject p in q.Get()) {
     cpu = "{\"name\":" + Json.S(Convert.ToString(p["Name"], Json.Inv).Trim()) + ",\"cores\":" + Convert.ToInt32(p["NumberOfCores"]) + ",\"threads\":" + Convert.ToInt32(p["NumberOfLogicalProcessors"]) + ",\"mhz\":" + Convert.ToInt32(p["MaxClockSpeed"]) + "}";
     break;
    }
   using (var q = new ManagementObjectSearcher("SELECT SMBIOSMemoryType,Speed FROM Win32_PhysicalMemory"))
    foreach (ManagementObject m in q.Get()) {
     ram = "{\"type\":" + Convert.ToInt32(m["SMBIOSMemoryType"]) + ",\"speed\":" + Convert.ToInt32(m["Speed"]) + "}";
     break;
    }
  } catch {}
  var bytes = Encoding.UTF8.GetBytes("{\"static\":true,\"cpu\":" + cpu + ",\"ram\":" + ram + "}\n");
  using (var o = Console.OpenStandardOutput()) o.Write(bytes, 0, bytes.Length);
  return 0;
 }
}

// ── v0.9.26: PDF pages as pictures (the converter, app/files/pdf-render.cjs) ─────────────────────
// Windows' own PDF renderer (Windows.Data.Pdf) draws each page: text, vector shapes, pictures,
// embedded fonts and the page's rotation, as a PDF viewer does. One request on stdin, one line per
// page on stdout; one page is in memory at a time. The file is only read; the pictures are written
// as PNG into the folder Charles gives (its own temporary folder). Nothing is run or opened.
static class Pdf {
 const int WAIT = 60000;
 static int PngWidth(byte[] b) { return b.Length > 24 && b[0] == 0x89 && b[1] == 0x50 ? (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19] : 0; }
 static byte[] Render(Windows.Data.Pdf.PdfPage page, Windows.Data.Pdf.PdfPageRenderOptions o) {
  using (var mem = new InMemoryRandomAccessStream()) {
   Wait(page.RenderToStreamAsync(mem, o));
   var bytes = new byte[mem.Size];
   using (var reader = new DataReader(mem.GetInputStreamAt(0))) { Wait(reader.LoadAsync((uint)mem.Size)); reader.ReadBytes(bytes); }
   return bytes;
  }
 }
 /**
  * PdfPage.Size is in 1/96 inch, but the rendered picture is DestinationWidth times the display's
  * scaling (1.4 on the computer this was built on): an A4 page asked at 72 DPI came out 833 pixels
  * wide instead of 595. A page one inch square, written here, is measured and rendered once per run
  * (scale = picture pixels per DestinationWidth unit), so every page gets exactly the asked size.
  */
 static double renderScale = 1;
 static double UnitsPerInch() {
  var file = Path.Combine(Path.GetTempPath(), "charles-pdf-inch-" + Guid.NewGuid().ToString("N") + ".pdf");
  try {
   var body = new StringBuilder("%PDF-1.4\n"); var offs = new List<int>();
   string[] objs = { "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>" };
   for (var i = 0; i < objs.Length; i++) { offs.Add(body.Length); body.Append(i + 1).Append(" 0 obj\n").Append(objs[i]).Append("\nendobj\n"); }
   var x = body.Length; body.Append("xref\n0 4\n0000000000 65535 f \n");
   foreach (var o in offs) body.Append(o.ToString("D10", Json.Inv)).Append(" 00000 n \n");
   body.Append("trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n").Append(x).Append("\n%%EOF\n");
   File.WriteAllBytes(file, Encoding.ASCII.GetBytes(body.ToString()));
   var doc = Wait(Windows.Data.Pdf.PdfDocument.LoadFromFileAsync(Wait(Windows.Storage.StorageFile.GetFileFromPathAsync(file))));
   using (var p = doc.GetPage(0)) {
    var o = new Windows.Data.Pdf.PdfPageRenderOptions(); o.DestinationWidth = 100; o.DestinationHeight = 100;
    var px = PngWidth(Render(p, o));
    renderScale = px >= 50 && px <= 1000 ? px / 100.0 : 1;
    var w = p.Size.Width; return w >= 24 && w <= 1000 ? w : 96;
   }
  } catch (OutOfMemoryException) {
   // Windows could not give the renderer graphics memory: a page drawn after this can bring the
   // process down inside Windows' own code, so the job stops here with a reason instead
   throw;
  } catch { return 96; } finally { try { File.Delete(file); } catch {} }
 }
 const double MaxSide = 12000, MaxPixels = 64000000;
 static void Line(string s) { var b = Encoding.UTF8.GetBytes(s + "\n"); using (var o = Console.OpenStandardOutput()) o.Write(b, 0, b.Length); }
 static T Wait<T>(IAsyncOperation<T> op) {
  using (var done = new ManualResetEvent(false)) {
   op.Completed = (o, s) => { try { done.Set(); } catch (ObjectDisposedException) {} };
   if (!done.WaitOne(WAIT)) { try { op.Cancel(); } catch {} throw new TimeoutException(); }
  }
  return op.GetResults();
 }
 static void Wait(IAsyncAction op) {
  using (var done = new ManualResetEvent(false)) {
   op.Completed = (o, s) => { try { done.Set(); } catch (ObjectDisposedException) {} };
   if (!done.WaitOne(WAIT)) { try { op.Cancel(); } catch {} throw new TimeoutException(); }
  }
  op.GetResults();
 }
 static string Why(Exception e) {
  var h = (uint)e.HResult;
  if (h == 0x8007052B || h == 0x80070056) return "password"; // ERROR_WRONG_PASSWORD, ERROR_INVALID_PASSWORD
  if (h == 0x80070002 || h == 0x80070003) return "missing";
  if (h == 0x80070005) return "denied";
  if (e is TimeoutException) return "timeout";
  if (e is OutOfMemoryException || (uint)e.HResult == 0x8007000E) return "memory";
  return "corrupt";
 }
 public static int Run() {
  Dictionary<string, object> c;
  try { c = Json.Flat(Json.RequestLine()); } catch { Line("{\"error\":\"request\"}"); return 2; }
  var file = Json.Str(c, "file") ?? ""; var cmd = Json.Str(c, "cmd") ?? "info";
  if (!Path.IsPathRooted(file) || !File.Exists(file)) { Line("{\"error\":\"missing\"}"); return 3; }
  Windows.Data.Pdf.PdfDocument doc;
  try {
   var f = Wait(Windows.Storage.StorageFile.GetFileFromPathAsync(file));
   var password = Json.Str(c, "password") ?? "";
   doc = password.Length > 0 ? Wait(Windows.Data.Pdf.PdfDocument.LoadFromFileAsync(f, password)) : Wait(Windows.Data.Pdf.PdfDocument.LoadFromFileAsync(f));
  } catch (Exception e) { Line("{\"error\":" + Json.S(Why(e)) + "}"); return 4; }
  var count = (int)doc.PageCount;
  Line("{\"pages\":" + count + ",\"protected\":" + Json.B(doc.IsPasswordProtected) + "}");
  if (cmd != "render") return 0;
  var outDir = Json.Str(c, "out") ?? "";
  if (!Path.IsPathRooted(outDir) || !Directory.Exists(outDir)) { Line("{\"error\":\"out\"}"); return 5; }
  var dpi = Math.Max(36, Math.Min(600, Json.Num(c, "dpi") ?? 150));
  var clear = Json.Str(c, "bg") == "none";
  double system;
  try { system = UnitsPerInch(); } catch (OutOfMemoryException) { Line("{\"error\":\"memory\"}"); return 6; }
  var list = new List<int>();
  foreach (var part in (Json.Str(c, "pages") ?? "").Split(',')) { int n; if (int.TryParse(part, NumberStyles.Integer, Json.Inv, out n) && n >= 1 && n <= count) list.Add(n); }
  foreach (var n in list) {
   try {
    using (var page = doc.GetPage((uint)(n - 1))) {
     var size = page.Size; // the page as shown: crop box and rotation applied (units: see UnitsPerInch)
     double w = Math.Max(1, size.Width * dpi / system), h = Math.Max(1, size.Height * dpi / system);
     var k = Math.Min(1.0, Math.Min(MaxSide / Math.Max(w, h), Math.Sqrt(MaxPixels / (w * h))));
     var o = new Windows.Data.Pdf.PdfPageRenderOptions();
     // asked in the renderer's own units: the picture then has exactly w × h pixels
     o.DestinationWidth = (uint)Math.Max(1, Math.Round(w * k / renderScale)); o.DestinationHeight = (uint)Math.Max(1, Math.Round(h * k / renderScale));
     o.BackgroundColor = Windows.UI.Color.FromArgb((byte)(clear ? 0 : 255), 255, 255, 255);
     var name = Path.Combine(outDir, "page-" + n.ToString("D5", Json.Inv) + ".png");
     var bytes = Render(page, o);
     File.WriteAllBytes(name, bytes);
     Line("{\"page\":" + n + ",\"file\":" + Json.S(name) + ",\"w\":" + PngWidth(bytes) + ",\"scaled\":" + Json.B(k < 1) + "}");
    }
   } catch (Exception e) { Line("{\"page\":" + n + ",\"error\":" + Json.S(Why(e)) + "}"); }
  }
  Line("{\"done\":true}");
  return 0;
 }
}

// ── v0.9.26: pictures Windows can read (WIC) and text in pictures (Windows' own OCR) ─────────────
// --image: every frame of a TIFF, ICO, GIF or HEIC (HEIF needs Windows' HEIF extension) as PNG, or
//          several pictures written as one multi-page TIFF. Files are only read; output goes into the
//          folder Charles gives. Nothing is run or opened.
// --ocr:   the words of one picture and where they are, by Windows.Media.Ocr, on this computer.
static class Pictures {
 static void Line(string s) { var b = Encoding.UTF8.GetBytes(s + "\n"); using (var o = Console.OpenStandardOutput()) o.Write(b, 0, b.Length); }
 const int MaxFrames = 2000;
 public static int Run() {
  Dictionary<string, object> c;
  try { c = Json.Flat(Json.RequestLine()); } catch { Line("{\"error\":\"request\"}"); return 2; }
  int code = 0;
  // WPF's imaging wants a thread of its own (single-threaded apartment)
  var t = new Thread(() => { try { code = Work(c); } catch (Exception e) { Line("{\"error\":" + Json.S(e is NotSupportedException || (uint)e.HResult == 0x88982F50 ? "codec" : "corrupt") + "}"); code = 4; } });
  t.SetApartmentState(ApartmentState.STA); t.Start(); t.Join();
  return code;
 }
 static int Work(Dictionary<string, object> c) {
  var cmd = Json.Str(c, "cmd") ?? "";
  var outPath = Json.Str(c, "out") ?? "";
  if (cmd == "frames") {
   var file = Json.Str(c, "file") ?? "";
   if (!Path.IsPathRooted(file) || !File.Exists(file)) { Line("{\"error\":\"missing\"}"); return 3; }
   if (!Path.IsPathRooted(outPath) || !Directory.Exists(outPath)) { Line("{\"error\":\"out\"}"); return 5; }
   using (var s = File.OpenRead(file)) {
    var d = System.Windows.Media.Imaging.BitmapDecoder.Create(s, System.Windows.Media.Imaging.BitmapCreateOptions.PreservePixelFormat, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
    var n = Math.Min(MaxFrames, d.Frames.Count);
    Line("{\"frames\":" + d.Frames.Count + ",\"codec\":" + Json.S(d.CodecInfo != null ? d.CodecInfo.FriendlyName : "") + "}");
    for (var i = 0; i < n; i++) {
     var f = d.Frames[i];
     var name = Path.Combine(outPath, "frame-" + (i + 1).ToString("D5", Json.Inv) + ".png");
     var e = new System.Windows.Media.Imaging.PngBitmapEncoder();
     e.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(f));
     using (var o = File.Create(name)) e.Save(o);
     Line("{\"frame\":" + (i + 1) + ",\"file\":" + Json.S(name) + ",\"w\":" + f.PixelWidth + ",\"h\":" + f.PixelHeight + "}");
    }
   }
   Line("{\"done\":true}");
   return 0;
  }
  if (cmd == "tiff") {
   var list = (Json.Str(c, "files") ?? "").Split('|');
   if (!Path.IsPathRooted(outPath) || File.Exists(outPath) || !Directory.Exists(Path.GetDirectoryName(outPath))) { Line("{\"error\":\"out\"}"); return 5; }
   var e = new System.Windows.Media.Imaging.TiffBitmapEncoder();
   e.Compression = System.Windows.Media.Imaging.TiffCompressOption.Lzw;
   foreach (var file in list) {
    if (!Path.IsPathRooted(file) || !File.Exists(file)) continue;
    using (var s = File.OpenRead(file)) {
     var d = System.Windows.Media.Imaging.BitmapDecoder.Create(s, System.Windows.Media.Imaging.BitmapCreateOptions.None, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
     e.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(d.Frames[0]));
    }
   }
   if (e.Frames.Count == 0) { Line("{\"error\":\"empty\"}"); return 6; }
   using (var o = new FileStream(outPath, FileMode.CreateNew)) e.Save(o);
   Line("{\"done\":true,\"pages\":" + e.Frames.Count + "}");
   return 0;
  }
  Line("{\"error\":\"request\"}");
  return 2;
 }

 static T Wait<T>(IAsyncOperation<T> op) {
  using (var done = new ManualResetEvent(false)) {
   op.Completed = (o, s) => { try { done.Set(); } catch (ObjectDisposedException) {} };
   if (!done.WaitOne(60000)) { try { op.Cancel(); } catch {} throw new TimeoutException(); }
  }
  return op.GetResults();
 }
 static string N(double v) { return Math.Round(v, 1).ToString(Json.Inv); }
 public static int Ocr() {
  Dictionary<string, object> c;
  try { c = Json.Flat(Json.RequestLine()); } catch { Line("{\"error\":\"request\"}"); return 2; }
  if (Json.Str(c, "cmd") == "langs") {
   var langs = new List<string>();
   foreach (var l in Windows.Media.Ocr.OcrEngine.AvailableRecognizerLanguages) langs.Add(Json.S(l.LanguageTag));
   Line("{\"langs\":[" + string.Join(",", langs) + "]}");
   return 0;
  }
  var file = Json.Str(c, "file") ?? "";
  if (!Path.IsPathRooted(file) || !File.Exists(file)) { Line("{\"error\":\"missing\"}"); return 3; }
  Windows.Media.Ocr.OcrEngine engine = null;
  var tag = Json.Str(c, "lang") ?? "";
  try { if (tag.Length > 0) engine = Windows.Media.Ocr.OcrEngine.TryCreateFromLanguage(new Windows.Globalization.Language(tag)); } catch {}
  if (engine == null) engine = Windows.Media.Ocr.OcrEngine.TryCreateFromUserProfileLanguages();
  if (engine == null) { Line("{\"error\":\"nolang\"}"); return 7; }
  try {
   var f = Wait(Windows.Storage.StorageFile.GetFileFromPathAsync(file));
   using (var stream = Wait(f.OpenAsync(Windows.Storage.FileAccessMode.Read))) {
    var decoder = Wait(Windows.Graphics.Imaging.BitmapDecoder.CreateAsync(stream));
    double max = Windows.Media.Ocr.OcrEngine.MaxImageDimension;
    var w = decoder.PixelWidth; var h = decoder.PixelHeight;
    var k = Math.Min(1.0, max / Math.Max(w, h));
    var transform = new Windows.Graphics.Imaging.BitmapTransform();
    if (k < 1) { transform.ScaledWidth = (uint)Math.Max(1, w * k); transform.ScaledHeight = (uint)Math.Max(1, h * k); }
    var bitmap = Wait(decoder.GetSoftwareBitmapAsync(Windows.Graphics.Imaging.BitmapPixelFormat.Bgra8, Windows.Graphics.Imaging.BitmapAlphaMode.Premultiplied, transform, Windows.Graphics.Imaging.ExifOrientationMode.RespectExifOrientation, Windows.Graphics.Imaging.ColorManagementMode.DoNotColorManage));
    var result = Wait(engine.RecognizeAsync(bitmap));
    var back = 1 / k; // boxes in the picture's own pixels
    var sb = new StringBuilder();
    sb.Append("{\"lang\":").Append(Json.S(engine.RecognizerLanguage.LanguageTag)).Append(",\"w\":").Append(w).Append(",\"h\":").Append(h);
    sb.Append(",\"angle\":").Append(result.TextAngle.HasValue ? N(result.TextAngle.Value) : "null").Append(",\"lines\":[");
    var first = true;
    foreach (var line in result.Lines) {
     if (!first) sb.Append(','); first = false;
     sb.Append("{\"text\":").Append(Json.S(line.Text)).Append(",\"words\":[");
     var fw = true;
     foreach (var word in line.Words) {
      if (!fw) sb.Append(','); fw = false;
      var r = word.BoundingRect;
      sb.Append("{\"t\":").Append(Json.S(word.Text)).Append(",\"x\":").Append(N(r.X * back)).Append(",\"y\":").Append(N(r.Y * back)).Append(",\"w\":").Append(N(r.Width * back)).Append(",\"h\":").Append(N(r.Height * back)).Append('}');
     }
     sb.Append("]}");
    }
    sb.Append("]}");
    Line(sb.ToString());
   }
  } catch (Exception e) { Line("{\"error\":" + Json.S(e is TimeoutException ? "timeout" : "corrupt") + "}"); return 4; }
  return 0;
 }
}

static class Program {
 [MTAThread]
 static int Main(string[] args) {
  // real pixels everywhere: full-screen checks and screen pictures
  try { if (!Native.SetProcessDpiAwarenessContext(new IntPtr(-4))) Native.SetProcessDPIAware(); } catch { try { Native.SetProcessDPIAware(); } catch {} }
  if (args.Length == 1 && args[0] == "--pdf") return Pdf.Run();
  if (args.Length == 1 && args[0] == "--image") return Pictures.Run();
  if (args.Length == 1 && args[0] == "--ocr") return Pictures.Ocr();
  if (args.Length == 1 && args[0] == "--grab") return Grab.Run();
  if (args.Length == 1 && args[0] == "--static") return Static.Run();
  if (args.Length != 0) return 2;
  return Hub.Run();
 }
}
}
