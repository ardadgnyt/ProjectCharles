# v0.9.18: one long-running helper for the system monitor (app/system/live-metrics.cjs).
# It stays open while the monitor is on screen and answers one line per request, so no shell is
# started per sample. CPU, cache and GPU values come from the same Windows performance counters
# Task Manager reads; GPU names come from DXGI, so nothing here depends on a graphics vendor.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

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
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
struct AdapterDesc {
 [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Description;
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
public static class CharlesMetrics {
 [DllImport("pdh.dll", CharSet=CharSet.Unicode)] static extern uint PdhOpenQueryW(string s, IntPtr d, out IntPtr q);
 [DllImport("pdh.dll", CharSet=CharSet.Unicode)] static extern uint PdhAddEnglishCounterW(IntPtr q, string p, IntPtr d, out IntPtr c);
 [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr q);
 [DllImport("pdh.dll")] static extern uint PdhGetFormattedCounterValue(IntPtr c, uint f, IntPtr t, out FmtValue v);
 [DllImport("pdh.dll", CharSet=CharSet.Unicode)] static extern uint PdhGetFormattedCounterArrayW(IntPtr c, uint f, ref uint size, out uint count, IntPtr buf);
 [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid id, out IDXGIFactory1 f);
 [DllImport("gdi32.dll")] static extern int D3DKMTOpenAdapterFromLuid(ref OpenLuid a);
 [DllImport("gdi32.dll")] static extern int D3DKMTQueryAdapterInfo(ref QueryInfo q);
 const uint FMT = 0x200 | 0x8000; // double, no capping at 100
 static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
 static IntPtr query, cUtil, cPerf, cEngine, cVram, cCache, cStandbyA, cStandbyB, cStandbyC, cModified;
 class Gpu { public string Id, Name; public ulong Vram; public uint Low; public int High; public uint Kmt; }
 static readonly List<Gpu> Gpus = new List<Gpu>();
 static readonly Regex Engine = new Regex(@"luid_(0x[0-9a-f]+)_(0x[0-9a-f]+)_phys_\d+_eng_(\d+)_engtype_", RegexOptions.IgnoreCase);
 static readonly Regex Memory = new Regex(@"luid_(0x[0-9a-f]+)_(0x[0-9a-f]+)_phys_", RegexOptions.IgnoreCase);
 static string Key(string high, string low) { return Convert.ToUInt32(high, 16).ToString("x8") + "_" + Convert.ToUInt32(low, 16).ToString("x8"); }
 static IntPtr Add(string path) { IntPtr c; return PdhAddEnglishCounterW(query, path, IntPtr.Zero, out c) == 0 ? c : IntPtr.Zero; }
 public static void Init() {
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
 static Dictionary<string,double> Many(IntPtr c) {
  var r = new Dictionary<string,double>(); if (c == IntPtr.Zero) return r;
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
 static string N(double? v) { return v.HasValue && !double.IsNaN(v.Value) ? v.Value.ToString("0.##", Inv) : "null"; }
 static string S(string v) { return "\"" + (v ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }
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
  var ok = PdhCollectQueryData(query) == 0;
  var engines = new Dictionary<string,double>(); // adapter|engine → sum over the processes
  foreach (var e in Many(cEngine)) {
   var m = Engine.Match(e.Key); if (!m.Success) continue;
   var k = Key(m.Groups[1].Value, m.Groups[2].Value) + "|" + m.Groups[3].Value;
   double old; engines.TryGetValue(k, out old); engines[k] = old + e.Value;
  }
  var vram = new Dictionary<string,double>();
  foreach (var e in Many(cVram)) {
   var m = Memory.Match(e.Key); if (!m.Success) continue;
   var k = Key(m.Groups[1].Value, m.Groups[2].Value);
   double old; vram.TryGetValue(k, out old); vram[k] = old + e.Value;
  }
  var gpus = new List<string>();
  foreach (var g in Gpus) {
   // like Task Manager: the busiest engine of the adapter; engines are never added together
   double? load = null; var pre = g.Id + "|";
   foreach (var e in engines) if (e.Key.StartsWith(pre)) load = Math.Max(load ?? 0, e.Value);
   if (!load.HasValue && engines.Count > 0) load = 0;
   double v; double? used = null; if (vram.TryGetValue(g.Id, out v)) used = v;
   double? temp, power; Sensors(g, out temp, out power);
   gpus.Add("{\"id\":" + S(g.Id) + ",\"name\":" + S(g.Name) + ",\"load\":" + N(load) + ",\"vramUsed\":" + N(used) + ",\"vramTotal\":" + N(g.Vram) + ",\"temp\":" + N(temp) + ",\"power\":" + N(power) + "}");
  }
  var standby = (One(cStandbyA) ?? 0) + (One(cStandbyB) ?? 0) + (One(cStandbyC) ?? 0) + (One(cModified) ?? 0);
  return "{\"ok\":" + (ok ? "true" : "false") + ",\"cpu\":" + N(One(cUtil)) + ",\"perf\":" + N(One(cPerf)) + ",\"cache\":" + N(standby > 0 ? (double?)standby : One(cCache)) + ",\"gpus\":[" + string.Join(",", gpus) + "]}";
 }
 static Dictionary<int,double> lastCpu = new Dictionary<int,double>(); static long lastAt;
 public static string Top() {
  var now = Stopwatch.GetTimestamp(); var seconds = lastAt == 0 ? 0 : (now - lastAt) / (double)Stopwatch.Frequency; lastAt = now;
  var next = new Dictionary<int,double>(); var names = new Dictionary<string,double[]>();
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
  return "[" + string.Join(",", names.OrderByDescending(n => n.Value[0]).ThenByDescending(n => n.Value[1]).Take(6).Select(n => "{\"name\":" + S(n.Key) + ",\"cpu\":" + N(n.Value[0]) + ",\"ram\":" + N(n.Value[1]) + "}")) + "]";
 }
}
"@
[CharlesMetrics]::Init()
$cpu=$null;$ram=$null
try {
 $p=@(Get-CimInstance Win32_Processor)[0]
 $cpu=@{name=([string]$p.Name).Trim();cores=[int]$p.NumberOfCores;threads=[int]$p.NumberOfLogicalProcessors;mhz=[int]$p.MaxClockSpeed}
 $m=@(Get-CimInstance Win32_PhysicalMemory)[0]
 $ram=@{type=[int]$m.SMBIOSMemoryType;speed=[int]$m.Speed}
} catch {}
[Console]::WriteLine((@{static=$true;cpu=$cpu;ram=$ram}|ConvertTo-Json -Compress))
while($null -ne ($line=[Console]::ReadLine())) {
 try {
  if($line -eq 'top'){[Console]::WriteLine('{"top":'+[CharlesMetrics]::Top()+'}')}
  else{[Console]::WriteLine([CharlesMetrics]::Sample())}
 } catch { [Console]::WriteLine('{"ok":false}') }
}
