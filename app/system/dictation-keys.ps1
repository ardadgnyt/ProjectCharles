# v0.9.18: push-to-talk keys and typing into the active app (app/voice/dictation.cjs).
# Runs only while "Bas-konuş" is turned on. The keyboard hook looks at one key: every other key
# passes untouched and nothing typed is read or kept. When Charles goes away this process ends with
# it and Windows removes the hook. Text is typed as Unicode input, so the clipboard is never used.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type -ReferencedAssemblies UIAutomationClient,UIAutomationTypes,System.Collections @"
using System;
using System.Collections;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

/** The gestures: hold, double press, a single tap that must stay an ordinary key press. */
public class PushToTalk {
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

public static class CharlesKeys {
 [StructLayout(LayoutKind.Sequential)] struct KB { public uint vk, scan, flags, time; public IntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; public uint a, b; }
 [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public KEYBDINPUT k; }
 delegate IntPtr Proc(int code, IntPtr w, IntPtr l);
 [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, Proc p, IntPtr m, uint t);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int c, IntPtr w, IntPtr l);
 [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
 [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] i, int s);
 [DllImport("user32.dll")] static extern uint MapVirtualKey(uint c, uint t);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string n);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint t, ref GUI g);
 [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetLong(IntPtr h, int i);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint p);
 [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
 [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr t, int c, out int v, int l, out int r);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint m; public IntPtr w, l; public uint t; public int x, y; }
 [StructLayout(LayoutKind.Sequential)] struct RC { public int a, b, c, d; }
 [StructLayout(LayoutKind.Sequential)] struct GUI { public int size; public uint flags; public IntPtr active, focus, capture, menu, move, caret; public RC rc; }
 static readonly IntPtr Mark = new IntPtr(0x43484C53); // what Charles itself types: passes the hook
 public static readonly PushToTalk M = new PushToTalk();
 static Proc keep; static IntPtr hook; static Timer timer;
 static int key; static bool ctrl, alt, shift, win, tapBack; static readonly object Lock = new object();
 static readonly object Out = new object();
 static void Line(string s) { lock (Out) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
 public static void Config(int vk, bool c, bool a, bool s, bool w) {
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
 public static void Run() {
  M.Emit = (e) => Line("{\"e\":\"" + e + "\"}");
  M.Inject = () => { if (tapBack) Key(key); };
  M.Start = (which) => { if (timer != null) timer.Dispose(); timer = new Timer(Fire, which, which == "hold" ? 260 : 220, Timeout.Infinite); };
  M.Stop = () => { if (timer != null) { timer.Dispose(); timer = null; } };
  var t = new Thread(() => {
   keep = OnKey;
   hook = SetWindowsHookEx(13, keep, GetModuleHandle(null), 0);
   Line(hook == IntPtr.Zero ? "{\"e\":\"hook-failed\"}" : "{\"e\":\"ready\"}");
   MSG m; while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
  });
  t.IsBackground = true; t.Start();
 }
 public static void Sim(string op) {
  M.Emit = (e) => Line("{\"e\":\"" + e + "\"}");
  M.Inject = () => Line("{\"e\":\"inject\"}");
  M.Start = (w) => Line("{\"timer\":\"" + w + "\"}");
  M.Stop = () => { };
  if (op == "down") Line("{\"swallow\":" + (M.Down() ? "true" : "false") + "}");
  else if (op == "up") Line("{\"swallow\":" + (M.Up() ? "true" : "false") + "}");
  else if (op == "hold" || op == "tap") M.Fire(op);
  else if (op == "other") M.Other();
  else if (op == "esc") { M.EscArmed = true; Line("{\"swallow\":" + (M.Esc(true) ? "true" : "false") + "}"); }
  else if (op == "reset") M.Reset();
  Line("{\"state\":\"" + M.State + "\"}");
 }
 public static void Set(string what, bool on) { lock (Lock) { if (what == "esc") M.EscArmed = on; else if (what == "pause") M.Paused = on; else if (what == "reset") M.Reset(); } }
 /** Waits for held modifiers (a shortcut just let go), then types. Never presses Enter. */
 public static bool Type(string text) {
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
 public static Hashtable Target() {
  var t = new Hashtable(); var h = GetForegroundWindow(); uint pid;
  var thread = GetWindowThreadProcessId(h, out pid);
  var g = new GUI(); g.size = Marshal.SizeOf(typeof(GUI)); GetGUIThreadInfo(thread, ref g);
  var s = new StringBuilder(256); GetWindowText(h, s, 256);
  t["hwnd"] = h.ToInt64(); t["focus"] = g.focus.ToInt64(); t["pid"] = pid; t["title"] = s.ToString();
  try { using (var p = Process.GetProcessById((int)pid)) t["app"] = p.ProcessName; } catch { t["app"] = ""; }
  t["elevated"] = Elevated(pid);
  t["password"] = g.focus != IntPtr.Zero && (GetLong(g.focus, -16).ToInt64() & 0x20) != 0;
  t["readonly"] = false; t["element"] = "";
  try {
   var f = AutomationElement.FocusedElement;
   if (f != null && f.Current.ProcessId == (int)pid) {
    if (f.Current.IsPassword) t["password"] = true;
    t["element"] = string.Join(".", f.GetRuntimeId());
    object v; if (f.TryGetCurrentPattern(ValuePattern.Pattern, out v) && ((ValuePattern)v).Current.IsReadOnly) t["readonly"] = true;
   }
  } catch {}
  return t;
 }
}
"@
[Console]::Out.WriteLine('{"e":"loaded"}')
[Console]::Out.Flush()
while($null -ne ($line=[Console]::ReadLine())) {
 try {
  $c=$line|ConvertFrom-Json
  switch($c.cmd){
   'on' {[CharlesKeys]::Run()}
   'config' {[CharlesKeys]::Config([int]$c.vk,[bool]$c.ctrl,[bool]$c.alt,[bool]$c.shift,[bool]$c.win)}
   'set' {[CharlesKeys]::Set([string]$c.what,[bool]$c.value)}
   'sim' {[CharlesKeys]::Sim([string]$c.op)}
   'target' {[Console]::Out.WriteLine('{"r":'+(([CharlesKeys]::Target())|ConvertTo-Json -Compress)+'}');[Console]::Out.Flush()}
   'type' {$ok=[CharlesKeys]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$c.text)));[Console]::Out.WriteLine('{"r":{"typed":'+([string]$ok).ToLower()+'}}');[Console]::Out.Flush()}
  }
 } catch { [Console]::Out.WriteLine('{"r":null}');[Console]::Out.Flush() }
}
