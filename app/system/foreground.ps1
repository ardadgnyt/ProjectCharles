$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type @"
using System;using System.Runtime.InteropServices;
public class CharlesForeground {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
}
"@
while($null -ne ($line=[Console]::ReadLine())) {
 try { $handle=[CharlesForeground]::GetForegroundWindow(); [uint32]$foregroundId=0;[void][CharlesForeground]::GetWindowThreadProcessId($handle,[ref]$foregroundId);$proc=Get-Process -Id $foregroundId -ErrorAction Stop;@{app=$proc.ProcessName}|ConvertTo-Json -Compress }
 catch { '{"app":""}' }
}
