# v0.9.18: finds and reads the one window or document Charles was dropped on (content-drop.cjs).
# Started for a drag and closed soon after; it reads only when a drop asks it to, never watches.
# It uses Windows UI Automation, the interface screen readers use, so what a program does not
# expose stays unread. A window it cannot read may be pictured with PrintWindow (that window only).
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Drawing,WindowsBase
Add-Type -ReferencedAssemblies UIAutomationClient,UIAutomationTypes,System.Drawing,System.Collections,WindowsBase @"
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;
public static class CharlesContent {
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h, out uint key, out byte alpha, out uint flags);
 [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
 [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetLongPtr(IntPtr h, int i);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
 [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int DwmRect(IntPtr h, int a, out RECT v, int s);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
 static readonly HashSet<string> Pages = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "iexplore" };
 static readonly HashSet<string> Docs = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "winword", "wordpad", "notepad", "notepad++", "acrobat", "acrord32", "sumatrapdf", "powerpnt", "soffice", "code" };
 static readonly HashSet<string> Mail = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "outlook", "olk", "thunderbird", "hxoutlook" };
 static readonly HashSet<string> Secret = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "1password", "keepass", "keepassxc", "bitwarden", "lastpass", "dashlane", "credentialuibroker", "consent" };
 public static void Init() { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); }
 static string Text(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
 static string Class(IntPtr h) { var s = new StringBuilder(128); GetClassName(h, s, 128); return s.ToString(); }
 static RECT Frame(IntPtr h) { RECT r; if (DwmRect(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(h, out r); return r; }
 static string ProcessName(uint pid) { try { using (var p = Process.GetProcessById((int)pid)) return p.ProcessName; } catch { return ""; } }
 /** The first real window under a point, from the top of the stack, skipping Charles' own. */
 static IntPtr WindowAt(int x, int y, uint own, out uint pid) {
  pid = 0;
  for (var h = GetTopWindow(GetDesktopWindow()); h != IntPtr.Zero; h = GetWindow(h, 2)) {
   if (!IsWindowVisible(h)) continue;
   uint p; GetWindowThreadProcessId(h, out p); if (p == own) continue;
   var ex = GetLongPtr(h, -20).ToInt64();
   if ((ex & 0x20) != 0) continue; // WS_EX_TRANSPARENT: overlays that take no input
   // v0.9.19: what looks like nothing on screen is not the target: a fully transparent layered
   // window, or a nameless popup (a browser's hover card, tooltip or drag shadow)
   if ((ex & 0x80000) != 0) { uint key, flags; byte alpha; if (GetLayeredWindowAttributes(h, out key, out alpha, out flags) && (flags & 2) != 0 && alpha == 0) continue; }
   // A window nobody can activate is no target, whatever its name: the NVIDIA overlay is one, as big
   // as the screen, invisible over the wallpaper, and a Chromium page inside, so the desktop read
   // as a web page. WS_EX_NOACTIVATE; a layered or nameless WS_EX_TOOLWINDOW is the same kind of thing.
   if ((ex & 0x08000000) != 0) continue;
   if ((ex & 0x80) != 0 && ((ex & 0x80000) != 0 || Text(h).Length == 0)) continue;
   int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) continue;
   var r = Frame(h); if (x < r.L || x >= r.R || y < r.T || y >= r.B || r.R - r.L < 2 || r.B - r.T < 2) continue;
   pid = p; return h;
  }
  return IntPtr.Zero;
 }
 public static string Kind2(long handle) { return Kind(AppOf(handle)); }
 public static string TitleOf(long handle) { return Text(new IntPtr(handle)); }
 public static string AppOf(long handle) { uint p; GetWindowThreadProcessId(new IntPtr(handle), out p); return ProcessName(p); }
 static string Kind(string app) { return Pages.Contains(app) ? "page" : Docs.Contains(app) ? "document" : Mail.Contains(app) ? "mail" : "app"; }
 static Hashtable RectOf(RECT r) { var t = new Hashtable(); t["x"] = r.L; t["y"] = r.T; t["width"] = r.R - r.L; t["height"] = r.B - r.T; return t; }
 static Hashtable RectOf(System.Windows.Rect r) { var t = new Hashtable(); t["x"] = (int)r.X; t["y"] = (int)r.Y; t["width"] = (int)r.Width; t["height"] = (int)r.Height; return t; }
 static List<AutomationElement> Documents(IntPtr h) {
  var list = new List<AutomationElement>();
  Wake(h);
  var root = AutomationElement.FromHandle(h);
  var found = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
  var w = Frame(h); uint owner; GetWindowThreadProcessId(h, out owner); var min = (Pages.Contains(ProcessName(owner)) ? 0.3 : 0.08) * Math.Max(1, (w.R - w.L) * (w.B - w.T)); // a page fills its window; a bubble or a bar does not
  foreach (AutomationElement e in found) { try { var b = e.Current.BoundingRectangle; if (!e.Current.IsOffscreen && b.Width * b.Height >= min) list.Add(e); } catch {} }
  return list;
 }
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string n);
 /** Chromium browsers build their accessibility tree only after someone asks its page window. */
 static void Wake(IntPtr h) {
  var page = FindWindowEx(h, IntPtr.Zero, "Chrome_RenderWidgetHostHWND", null);
  if (page != IntPtr.Zero) { try { AutomationElement.FromHandle(page).FindFirst(TreeScope.Children, Condition.TrueCondition); } catch {} }
 }
 /** The address a browser shows for its active tab. */
 public static string Address(long handle) {
  try {
   var edits = AutomationElement.FromHandle(new IntPtr(handle)).FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
   foreach (AutomationElement e in edits) { object p; if (e.TryGetCurrentPattern(ValuePattern.Pattern, out p)) { var v = ((ValuePattern)p).Current.Value; if (!string.IsNullOrEmpty(v) && (v.StartsWith("file:") || v.Contains(":/") || v.Contains(":\\"))) return v; } }
  } catch {}
  return "";
 }
 /** The document under the point; several and none under the point: null, and the list says so. */
 static AutomationElement Pick(List<AutomationElement> docs, int x, int y, int pick) {
  if (pick >= 0 && pick < docs.Count) return docs[pick];
  AutomationElement best = null; double area = double.MaxValue;
  foreach (var d in docs) {
   var r = d.Current.BoundingRectangle;
   if (x < r.Left || x >= r.Right || y < r.Top || y >= r.Bottom) continue;
   // the largest one: a frame inside a page belongs to that page
   if (area == double.MaxValue || r.Width * r.Height > area) { area = r.Width * r.Height; best = d; }
  }
  return best ?? (docs.Count == 1 ? docs[0] : null);
 }
 public static Hashtable Probe(int x, int y, uint own) {
  var t = new Hashtable(); t["found"] = false;
  uint pid; var h = WindowAt(x, y, own, out pid);
  if (h == IntPtr.Zero) return t;
  var cls = Class(h);
  if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return t;
  var app = ProcessName(pid);
  t["found"] = true; t["hwnd"] = h.ToInt64(); t["app"] = app; t["title"] = Text(h); t["kind"] = Kind(app);
  t["rect"] = RectOf(Frame(h)); t["blocked"] = Secret.Contains(app);
  return t;
 }
 /** v0.9.19: the exact area, from UI Automation; the slow half of what Probe used to do. */
 public static Hashtable Refine(long handle, int x, int y) {
  var t = new Hashtable(); var h = new IntPtr(handle);
  if (!IsWindow(h)) return t;
  try {
   var docs = Documents(h); t["documents"] = docs.Count;
   var d = Pick(docs, x, y, -1);
   if (d != null) { t["rect"] = RectOf(d.Current.BoundingRectangle); var n = d.Current.Name; if (!string.IsNullOrWhiteSpace(n)) t["name"] = n; }
  } catch {}
  return t;
 }
 static string Of(AutomationElement e, int max) {
  object p;
  if (e.TryGetCurrentPattern(TextPattern.Pattern, out p)) { try { return ((TextPattern)p).DocumentRange.GetText(max); } catch {} }
  if (e.TryGetCurrentPattern(ValuePattern.Pattern, out p)) { try { return ((ValuePattern)p).Current.Value; } catch {} }
  // what a program shows as separate text elements
  var sb = new StringBuilder(); var n = 0;
  foreach (AutomationElement c in e.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text))) {
   try { sb.AppendLine(c.Current.Name); } catch {}
   if (++n > 6000 || sb.Length > max) break;
  }
  return sb.ToString();
 }
 static bool PasswordFocused(IntPtr h) {
  try {
   var f = AutomationElement.FocusedElement; if (f == null) return false;
   var hw = new IntPtr(f.Current.NativeWindowHandle);
   uint a, b; GetWindowThreadProcessId(h, out a); GetWindowThreadProcessId(hw == IntPtr.Zero ? h : hw, out b);
   return f.Current.ProcessId == (int)a && f.Current.IsPassword;
  } catch { return false; }
 }
 static bool Picture(IntPtr h, string file) {
  RECT r; if (!GetWindowRect(h, out r) || r.R <= r.L || r.B <= r.T) return false;
  using (var bmp = new Bitmap(r.R - r.L, r.B - r.T, PixelFormat.Format32bppArgb))
  using (var g = Graphics.FromImage(bmp)) {
   var dc = g.GetHdc(); var ok = PrintWindow(h, dc, 2); g.ReleaseHdc(dc);
   if (!ok) return false;
   bmp.Save(file, ImageFormat.Png);
  }
  return true;
 }
 public static Hashtable Read(long handle, int x, int y, int pick, int max, string png) {
  var t = new Hashtable(); var h = new IntPtr(handle);
  if (!IsWindow(h)) { t["error"] = "gone"; return t; }
  uint pid; GetWindowThreadProcessId(h, out pid); var app = ProcessName(pid);
  t["app"] = app; t["title"] = Text(h); t["kind"] = Kind(app);
  if (Secret.Contains(app)) { t["error"] = "protected"; return t; }
  if (PasswordFocused(h)) { t["error"] = "password"; return t; }
  var docs = new List<AutomationElement>();
  // a Chromium browser may need a moment after the first question
  for (var i = 0; i < 6; i++) {
   try { docs = Documents(h); } catch {}
   if (docs.Count > 0 || !Pages.Contains(app)) break;
   System.Threading.Thread.Sleep(400);
  }
  var d = Pick(docs, x, y, pick);
  if (d == null && docs.Count > 1) {
   var names = new ArrayList();
   for (int i = 0; i < docs.Count && i < 6; i++) { try { names.Add(string.IsNullOrWhiteSpace(docs[i].Current.Name) ? "Bölüm " + (i + 1) : docs[i].Current.Name); } catch { names.Add("Bölüm " + (i + 1)); } }
   t["candidates"] = names; return t;
  }
  var text = "";
  try { text = Of(d ?? AutomationElement.FromHandle(h), max + 1) ?? ""; } catch {}
  text = text.Trim();
  if (d != null) { try { var n = d.Current.Name; if (!string.IsNullOrWhiteSpace(n)) t["name"] = n; } catch {} }
  if (text.Length >= 40) { t["truncated"] = text.Length > max; t["text"] = text.Length > max ? text.Substring(0, max) : text; return t; }
  if (!string.IsNullOrEmpty(png)) { try { if (Picture(h, png)) { t["image"] = png; return t; } } catch {} }
  t["error"] = "unreadable"; return t;
 }
}
"@
[CharlesContent]::Init()
# A saved Word or PowerPoint document is read from its file: slide numbers, notes and all pages
# come through Charles' own readers. Only names are asked for here; nothing is changed in the app.
function OfficeFile([int64]$hwnd) {
 try {
  $app=[CharlesContent]::AppOf($hwnd)
  if($app -eq 'POWERPNT'){
   $office=[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
   foreach($w in $office.Windows){ if([int64]$w.HWND -eq $hwnd){ $d=$w.Presentation; return @{file=[string]$d.FullName;unsaved=($d.Saved -eq 0)} } }
   # older files: the window's handle is not always reported, its caption names the file
   $title=[CharlesContent]::TitleOf($hwnd)
   foreach($d in $office.Presentations){ if($title -like ($d.Name+'*')){ return @{file=[string]$d.FullName;unsaved=($d.Saved -eq 0)} } }
  } elseif($app -eq 'WINWORD'){
   $office=[Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
   foreach($w in $office.Windows){ if([int64]$w.Hwnd -eq $hwnd){ $d=$w.Document; return @{file=[string]$d.FullName;unsaved=(-not [bool]$d.Saved)} } }
  }
 } catch {}
 $null
}
# A PDF opened from this computer in a browser: Charles' PDF reader takes the file itself.
function LocalPdf([int64]$hwnd) {
 try {
  $a=[CharlesContent]::Address($hwnd)
  if($a -match '\.pdf([#?].*)?$'){
   $a=$a -replace '[#?].*$',''
   $p=if($a -match '^file:'){([Uri]$a).LocalPath}elseif($a -match '^[A-Za-z]:[\\/]'){$a}else{''}
   if($p -and (Test-Path -LiteralPath $p)){return $p}
  }
 } catch {}
 ''
}
[Console]::WriteLine('{"ready":true}')
while($null -ne ($line=[Console]::ReadLine())) {
 try {
  $c=$line|ConvertFrom-Json
  $r=$null
  if($c.cmd -eq 'probe'){$r=[CharlesContent]::Probe([int]$c.x,[int]$c.y,[uint32]$c.own)}
  elseif($c.cmd -eq 'refine'){$r=[CharlesContent]::Refine([int64]$c.hwnd,[int]$c.x,[int]$c.y)}
  else{
   $saved=OfficeFile ([int64]$c.hwnd)
   if($saved -and $saved.file -match '^[A-Za-z]:\\' -and (Test-Path -LiteralPath $saved.file)){$r=@{file=$saved.file;unsaved=$saved.unsaved;app=[CharlesContent]::AppOf([int64]$c.hwnd);title=[IO.Path]::GetFileName($saved.file);kind='document'}}
   elseif(([CharlesContent]::Kind2([int64]$c.hwnd) -eq 'page') -and ($path=LocalPdf ([int64]$c.hwnd))){$r=@{file=$path;unsaved=$false;app=[CharlesContent]::AppOf([int64]$c.hwnd);title=[IO.Path]::GetFileName($path);kind='document'}}
   else{$r=[CharlesContent]::Read([int64]$c.hwnd,[int]$c.x,[int]$c.y,[int]$c.pick,[int]$c.max,[string]$c.png)}
  }
  [Console]::WriteLine(($r|ConvertTo-Json -Compress -Depth 4))
 } catch { [Console]::WriteLine('{"error":"failed"}') }
}
