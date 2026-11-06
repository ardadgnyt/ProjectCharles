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
 static Proc keep; static Timer timer; static uint hookThread; static QueueWorker owner;
 static int key; static bool ctrl, alt, shift, win, tapBack; static readonly object Lock = new object();
 static void Line(string s) { var w = owner; if (w != null) w.Emit(s); }
 static void Config(int vk, bool c, bool a, bool s, bool w) {
  lock (Lock) { key = vk; ctrl = c; alt = a; shift = s; win = w; tapBack = !(c || a || s || w); M.Reset(); M.State = PushToTalk.S.Idle; }
 }
 static bool D(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
 static void Key(int vk) {
  var scan = (ushort)MapVirtualKey((uint)vk, 0);
  uint ext = (vk >= 0x21 && vk <= 0x2E) ? 1u : 0u;
  var i = new INPUT[2];
  i[0].type = i[1].type = 1;
  i[0].k.wVk = i[1].k.wVk = (ushort)vk; i[0].k.wScan = i[1].k.wScan = scan;
  i[0].k.dwFlags = ext; i[1].k.dwFlags = ext | 2; i[0].k.extra = i[1].k.extra = Mark;
  SendInput(2, i, Marshal.SizeOf(typeof(INPUT)));
 }
 static IntPtr OnKey(int code, IntPtr w, IntPtr l) {
  if (code < 0) return CallNextHookEx(IntPtr.Zero, code, w, l);
  var k = (KB)Marshal.PtrToStructure(l, typeof(KB));
  if (k.extra == Mark) return CallNextHookEx(IntPtr.Zero, code, w, l);
  var msg = w.ToInt32(); var down = msg == 0x100 || msg == 0x104; var up = msg == 0x101 || msg == 0x105;
  var swallow = false;
  lock (Lock) {
   var vk = (int)k.vk;
   if (vk == 0x1B) swallow = M.Esc(down);
   else if (vk == key) {
    var c = D(0x11); var a = D(0x12); var s = D(0x10); var v = D(0x5B) || D(0x5C);
    var active = M.State != PushToTalk.S.Idle;
    if (up) swallow = M.Up();
    else if (down && (active || (c == ctrl && a == alt && s == shift && v == win))) swallow = M.Down();
   } else if (down && vk != 0x10 && vk != 0x11 && vk != 0x12 && vk != 0xA0 && vk != 0xA1 && vk != 0xA2 && vk != 0xA3 && vk != 0xA4 && vk != 0xA5) M.Other();
  }
  return swallow ? new IntPtr(1) : CallNextHookEx(IntPtr.Zero, code, w, l);
 }
 static void Fire(object which) { lock (Lock) M.Fire((string)which); }
 static void Wire() {
  M.Emit = (e) => Line("{\"e\":\"" + e + "\"}");
  M.Inject = () => { if (tapBack) Key(key); };
  M.Start = (which) => { if (timer != null) timer.Dispose(); timer = new Timer(Fire, which, which == "hold" ? 260 : 220, Timeout.Infinite); };
  M.Stop = () => { if (timer != null) { timer.Dispose(); timer = null; } };
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
  lock (Lock) { if (timer != null) { timer.Dispose(); timer = null; } M.State = PushToTalk.S.Idle; }
 }
 static void Sim(string op) {
  M.Emit = (e) => Line("{\"e\":\"" + e + "\"}");
  M.Inject = () => Line("{\"e\":\"inject\"}");
  M.Start = (w) => Line("{\"timer\":\"" + w + "\"}");
  M.Stop = () => { };
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
   case "config": Config((int)(Json.Num(c, "vk") ?? 0), Json.Bool(c, "ctrl"), Json.Bool(c, "alt"), Json.Bool(c, "shift"), Json.Bool(c, "win")); break;
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

static class Program {
 [MTAThread]
 static int Main(string[] args) {
  // real pixels everywhere: full-screen checks and screen pictures
  try { if (!Native.SetProcessDpiAwarenessContext(new IntPtr(-4))) Native.SetProcessDPIAware(); } catch { try { Native.SetProcessDPIAware(); } catch {} }
  if (args.Length == 1 && args[0] == "--grab") return Grab.Run();
  if (args.Length == 1 && args[0] == "--static") return Static.Run();
  if (args.Length != 0) return 2;
  return Hub.Run();
 }
}
}
