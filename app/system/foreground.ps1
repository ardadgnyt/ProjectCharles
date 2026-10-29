$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type @"
using System;using System.Runtime.InteropServices;
public class CharlesForeground {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
 [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
 // v0.9.6: a window covering its whole monitor (a game, a video, a presentation) - not the
 // desktop itself
 public static bool FullScreen(IntPtr h) {
  if (h == IntPtr.Zero) return false;
  var c = new System.Text.StringBuilder(64); GetClassName(h, c, 64);
  var cls = c.ToString(); if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") return false;
  RECT r; if (!GetWindowRect(h, out r)) return false;
  var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
  if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
  return r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
 }
}
"@
while($null -ne ($line=[Console]::ReadLine())) {
 try { $handle=[CharlesForeground]::GetForegroundWindow(); [uint32]$foregroundId=0;[void][CharlesForeground]::GetWindowThreadProcessId($handle,[ref]$foregroundId);$proc=Get-Process -Id $foregroundId -ErrorAction Stop;@{app=$proc.ProcessName;pid=[int]$foregroundId;window=[int64]$handle;full=[CharlesForeground]::FullScreen($handle)}|ConvertTo-Json -Compress }
 catch { '{"app":""}' }
}
