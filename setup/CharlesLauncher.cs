// Small, branded Windows entry point; no console window or installed Node.js required.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.ComponentModel;
using System.Collections.Generic;
using System.Drawing;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
[assembly: AssemblyTitle("Charles")]
[assembly: AssemblyProduct("ProjectCharles")]
[assembly: AssemblyDescription("Charles desktop assistant")]
[assembly: AssemblyCompany("HzPederPan")]
[assembly: AssemblyVersion("1.0.1.0")]
[assembly: AssemblyFileVersion("1.0.1.0")]
static class CharlesLauncher {
  static string Quote(string value) {
    var b = new StringBuilder("\""); int slashes = 0;
    foreach (char c in value) {
      if (c == '\\') { slashes++; continue; }
      if (c == '"') b.Append('\\', slashes * 2 + 1);
      else b.Append('\\', slashes);
      slashes = 0; b.Append(c);
    }
    b.Append('\\', slashes * 2); b.Append('"'); return b.ToString();
  }

  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr BeginUpdateResource(string file, bool deleteExisting);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool UpdateResource(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool EndUpdateResource(IntPtr handle, bool discard);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr LoadLibraryEx(string file, IntPtr unused, uint flags);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
  delegate bool ResourceName(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
  static extern bool EnumResourceNames(IntPtr module, IntPtr type, ResourceName callback, IntPtr param);
  static string Hex(byte[] data) { return BitConverter.ToString(data).Replace("-", "").ToLowerInvariant(); }
  static void Brand(string file, byte[] ico) {
    // Replace every numeric icon group, including Electron's first/default group.
    // Keep the vendor executable intact: only the generated host is edited.
    var groups = new System.Collections.Generic.List<IntPtr>();
    IntPtr module = LoadLibraryEx(file, IntPtr.Zero, 2);
    if (module == IntPtr.Zero) throw new Win32Exception();
    try {
      ResourceName cb = delegate(IntPtr m, IntPtr t, IntPtr n, IntPtr p) {
        if (n.ToInt64() <= 65535) groups.Add(n);
        return true;
      };
      EnumResourceNames(module, new IntPtr(14), cb, IntPtr.Zero);
      GC.KeepAlive(cb);
    } finally { FreeLibrary(module); }
    if (groups.Count == 0) groups.Add(new IntPtr(1));
    IntPtr update = BeginUpdateResource(file, false);
    if (update == IntPtr.Zero) throw new Win32Exception();
    try {
      using (var input = new BinaryReader(new MemoryStream(ico)))
      using (var group = new MemoryStream())
      using (var output = new BinaryWriter(group)) {
        ushort reserved = input.ReadUInt16(), type = input.ReadUInt16(), count = input.ReadUInt16();
        if (reserved != 0 || type != 1 || count == 0) throw new InvalidDataException("Invalid Charles icon");
        output.Write(reserved); output.Write(type); output.Write(count);
        for (int i=0; i<count; i++) {
          input.BaseStream.Position = 6 + i * 16;
          byte[] header = input.ReadBytes(12); uint offset = input.ReadUInt32();
          uint size = BitConverter.ToUInt32(header,8); ushort id = (ushort)(1000+i);
          if ((long)offset+size > ico.Length) throw new InvalidDataException("Truncated Charles icon");
          byte[] image = new byte[size]; Array.Copy(ico,offset,image,0,size);
          if (!UpdateResource(update,new IntPtr(3),new IntPtr(id),1033,image,size)) throw new Win32Exception();
          output.Write(header); output.Write(id);
        }
        byte[] bytes=group.ToArray();
        foreach (IntPtr name in groups)
          if (!UpdateResource(update,new IntPtr(14),name,1033,bytes,(uint)bytes.Length)) throw new Win32Exception();
      }
      // v0.9.24: Task Manager shows a process by the file description of its program, and that was
      // still Electron's. Only this generated copy changes; the Electron file stays as it came.
      byte[] info=VersionInfo();
      if (!UpdateResource(update,new IntPtr(16),new IntPtr(1),1033,info,(uint)info.Length)) throw new Win32Exception();
      if (!EndUpdateResource(update,false)) throw new Win32Exception();
      update=IntPtr.Zero;
    } finally { if (update!=IntPtr.Zero) EndUpdateResource(update,true); }
  }
  // A version resource is a tree of blocks: length, value length, type, key, padding, value, children.
  static void Align(MemoryStream s) { while (s.Length % 4 != 0) s.WriteByte(0); }
  static byte[] Block(string key, byte[] value, ushort valueLength, ushort type, params byte[][] children) {
    using (var s = new MemoryStream())
    using (var w = new BinaryWriter(s)) {
      w.Write((ushort)0); w.Write(valueLength); w.Write(type);
      w.Write(Encoding.Unicode.GetBytes(key + "\0")); w.Flush(); Align(s);
      if (value != null) { w.Write(value); w.Flush(); }
      foreach (byte[] child in children) { Align(s); w.Write(child); w.Flush(); }
      byte[] all = s.ToArray();
      BitConverter.GetBytes((ushort)all.Length).CopyTo(all, 0);
      return all;
    }
  }
  static byte[] Text(string key, string value) {
    return Block(key, Encoding.Unicode.GetBytes(value + "\0"), (ushort)(value.Length + 1), 1);
  }
  static byte[] VersionInfo() {
    Version v = Assembly.GetExecutingAssembly().GetName().Version;
    string version = v.Major + "." + v.Minor + "." + v.Build + "." + v.Revision;
    using (var f = new MemoryStream())
    using (var w = new BinaryWriter(f)) {
      w.Write(0xFEEF04BDu); w.Write(0x00010000u);
      w.Write((uint)(v.Major << 16 | v.Minor)); w.Write((uint)(v.Build << 16 | v.Revision));
      w.Write((uint)(v.Major << 16 | v.Minor)); w.Write((uint)(v.Build << 16 | v.Revision));
      w.Write(0x3Fu); w.Write(0u); w.Write(0x00040004u); w.Write(1u); w.Write(0u); w.Write(0u); w.Write(0u);
      w.Flush();
      byte[] table = Block("040904B0", null, 0, 1,
        Text("CompanyName", "HzPederPan"), Text("FileDescription", "Charles"), Text("FileVersion", version),
        Text("InternalName", "Charles"), Text("LegalCopyright", "Copyright (c) 2026 HzPederPan"),
        Text("OriginalFilename", "Charles.exe"), Text("ProductName", "Charles"), Text("ProductVersion", version));
      byte[] strings = Block("StringFileInfo", null, 0, 1, table);
      byte[] translation = Block("Translation", new byte[] { 0x09, 0x04, 0xB0, 0x04 }, 4, 0);
      byte[] vars = Block("VarFileInfo", null, 0, 1, translation);
      return Block("VS_VERSION_INFO", f.ToArray(), 52, 0, strings, vars);
    }
  }
  static string Runtime(string root, string original) {
    byte[] ico=File.ReadAllBytes(Path.Combine(root,"public","charles.ico"));
    var info=new FileInfo(original);
    string key;
    using (var hash=SHA256.Create()) {
      // Runtime replacement and logo updates each get a new Shell cache identity.
      string stamp="host-v5:"+info.Length+":"+info.LastWriteTimeUtc.Ticks+":"+Hex(hash.ComputeHash(ico));
      key=Hex(hash.ComputeHash(Encoding.UTF8.GetBytes(stamp))).Substring(0,24);
    }
    string target=Path.Combine(info.DirectoryName,"charles-host-"+key+".exe");
    if (!File.Exists(target)) {
      string temp=target+"."+Process.GetCurrentProcess().Id+".tmp.exe";
      try {
        File.Copy(original,temp,true); Brand(temp,ico);
        try { File.Move(temp,target); } catch(IOException) { if (!File.Exists(target)) throw; }
      } finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    return target;
  }
  [STAThread] static int Main(string[] args) {
    string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
    // v1.0.0: a newer Electron waiting in _update\runtime is put in place before Electron runs
    // (app/core/runtime-update.cjs downloads it). Whatever happens there, Charles starts on the
    // dist that is in place afterwards.
    bool runtimeLeft = false;
    try {
      RuntimeApply.Repair(root);
      bool wait = Environment.GetEnvironmentVariable("CHARLES_RUNTIME_WAIT") == "1";
      RuntimeApply.Run(root, wait ? 20000 : 0, true, delegate {
        string fresh = Path.Combine(root, "node_modules", "electron", "dist", "electron.exe");
        try { if (File.Exists(fresh)) Runtime(root, fresh); } catch (Exception) {}
      });
    } catch (Exception) {}
    try { runtimeLeft = File.Exists(RuntimeApply.PendingFile(root)); } catch (Exception) {}
    try {
      string exe = Path.Combine(root, "node_modules", "electron", "dist", "electron.exe");
      if (!File.Exists(exe) || !File.Exists(Path.Combine(root, "dist", "renderer.js")))
        throw new Exception("Charles dosyalari eksik. Setup paketini tamamen cikartip yeniden kurun.");
      exe = Runtime(root, exe);
      if (args.Contains("--prepare-runtime")) return 0;
      var start = new ProcessStartInfo(exe, Quote(root) + " " + String.Join(" ", args.Select(Quote))) {
        WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true
      };
      start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
      // app/main.cjs: a host started any other way (an older updater's restart) comes back through here
      start.EnvironmentVariables["CHARLES_HOST"] = "5";
      // app/main.cjs hands a waiting runtime back here only when this launcher did not just leave it
      start.EnvironmentVariables.Remove("CHARLES_RUNTIME_WAIT");
      if (runtimeLeft) start.EnvironmentVariables["CHARLES_RUNTIME_TRIED"] = "1";
      else start.EnvironmentVariables.Remove("CHARLES_RUNTIME_TRIED");
      Process.Start(start); return 0;
    } catch (Exception e) { MessageBox.Show(e.Message, "Charles", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
  }
}

// v1.0.0: puts the Electron that app/core/runtime-update.cjs downloaded in place:
// _update\runtime\pending.json + the official zip → node_modules\electron\dist.
// dist.new is unpacked and checked first; dist → dist.old, dist.new → dist; any error puts the old
// dist back. A start that finds dist missing and dist.old present (an interrupted swap) renames it back.
static class RuntimeApply {
  public const int MaxTries = 3;
  // the harness (.qa/h100/runtime) shortens the waits and makes a step fail on purpose
  public static int MutexWaitMs = 90000;
  public static long ExtraBytes = 64L * 1024 * 1024;
  public static string TestFail = null;
  public static string LastOutcome = "";

  static string ElectronDir(string root) { return Path.Combine(root, "node_modules", "electron"); }
  static string RuntimeDir(string root) { return Path.Combine(root, "_update", "runtime"); }
  public static string PendingFile(string root) { return Path.Combine(RuntimeDir(root), "pending.json"); }
  static string ResultFile(string root) { return Path.Combine(RuntimeDir(root), "result.json"); }
  // [0-9] and \z: .NET's \d takes any Unicode digit and $ also matches before a final newline
  static readonly Regex Plain = new Regex(@"^[0-9]{1,9}\.[0-9]{1,9}\.[0-9]{1,9}\z");
  static readonly Regex ZipName = new Regex(@"^electron-v([0-9]{1,9}\.[0-9]{1,9}\.[0-9]{1,9})-win32-x64\.zip\z");

  static void Retry(Action step) {
    for (int i = 0; ; i++) {
      try { step(); return; } catch (Exception) { if (i >= 14) throw; Thread.Sleep(400); }
    }
  }
  static void Remove(string dir) {
    if (!Directory.Exists(dir)) return;
    foreach (string f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
      try { File.SetAttributes(f, FileAttributes.Normal); } catch (Exception) {}
    Directory.Delete(dir, true);
  }
  static void TryRemove(string dir) { try { Retry(delegate { Remove(dir); }); } catch (Exception) {} }

  /// <summary>An interrupted swap: dist missing → dist.old back; leftovers of earlier runs go.</summary>
  public static void Repair(string root) {
    string e = ElectronDir(root), dist = Path.Combine(e, "dist"), old = Path.Combine(e, "dist.old"), neu = Path.Combine(e, "dist.new");
    if (!Directory.Exists(old) && !Directory.Exists(neu)) return;
    // a second launcher (Charles started twice) waits for one that is applying right now
    using (var mutex = Lock(root)) {
      bool owned;
      try { owned = mutex.WaitOne(MutexWaitMs); } catch (AbandonedMutexException) { owned = true; }
      if (!owned) return;
      try {
        if (!Directory.Exists(dist) && Directory.Exists(old)) Retry(delegate { Directory.Move(old, dist); });
        if (Directory.Exists(dist) && Directory.Exists(old)) TryRemove(old);
        if (Directory.Exists(neu)) TryRemove(neu);
      } finally { mutex.ReleaseMutex(); }
    }
  }
  /// <summary>One apply at a time per Charles folder.</summary>
  public static Mutex Lock(string root) {
    using (var h = SHA256.Create()) {
      string key = BitConverter.ToString(h.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(root).ToLowerInvariant()))).Replace("-", "").Substring(0, 16);
      return new Mutex(false, "Local\\CharlesRuntime-" + key);
    }
  }

  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static string ImagePath(int pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      var b = new StringBuilder(1024); int n = b.Capacity;
      return QueryFullProcessImageName(h, 0, b, ref n) ? b.ToString(0, n) : null;
    } finally { CloseHandle(h); }
  }
  /// <summary>Processes whose program lives inside `dir` (the running host, its helpers, an electron.exe).</summary>
  public static int RunningFrom(string dir) {
    string prefix = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
    int self = Process.GetCurrentProcess().Id, count = 0;
    foreach (var p in Process.GetProcesses()) {
      try {
        if (p.Id == self) continue;
        string image = ImagePath(p.Id);
        if (image != null && image.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) count++;
      } catch (Exception) {} finally { p.Dispose(); }
    }
    return count;
  }

  static string Sha256(string file) {
    using (var s = File.OpenRead(file)) using (var h = SHA256.Create())
      return BitConverter.ToString(h.ComputeHash(s)).Replace("-", "").ToLowerInvariant();
  }
  static int Compare(string a, string b) { return new Version(a).CompareTo(new Version(b)); }
  static string Read(Dictionary<string, object> d, string key) {
    object v; return d.TryGetValue(key, out v) && v != null ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture) : "";
  }
  static void WriteJson(string file, object value) {
    string tmp = file + "." + Process.GetCurrentProcess().Id + ".tmp";
    File.WriteAllText(tmp, new JavaScriptSerializer().Serialize(value), new UTF8Encoding(false));
    if (File.Exists(file)) File.Delete(file);
    File.Move(tmp, file);
  }
  static void Result(string root, bool ok, string version, string code, string message, int tries) {
    var r = new Dictionary<string, object>();
    r["ok"] = ok; r["version"] = version; r["code"] = code; r["message"] = message ?? ""; r["tries"] = tries;
    r["time"] = DateTime.UtcNow.ToString("s") + "Z";
    try { WriteJson(ResultFile(root), r); } catch (Exception) {}
  }
  static void Drop(string root, string zip) {
    try { File.Delete(PendingFile(root)); } catch (Exception) {}
    if (zip != null) try { File.Delete(zip); } catch (Exception) {}
  }

  /// <summary>
  /// none | invalid | discarded | stale | busy | other-app | applied | failed | gave-up | hash.
  /// waitMs: how long processes from dist may take to end (a restart's old host); 0 = skip at once.
  /// </summary>
  public static string Run(string root, int waitMs, bool window, Action afterSwap) {
    if (!File.Exists(PendingFile(root))) return LastOutcome = "none";
    // everything below runs under the lock: a second launcher waits for one that is applying
    using (var mutex = Lock(root)) {
      bool owned;
      try { owned = mutex.WaitOne(MutexWaitMs); } catch (AbandonedMutexException) { owned = true; }
      if (!owned) return LastOutcome = "busy";
      try { LastOutcome = RunLocked(root, waitMs, window, afterSwap); }
      finally { mutex.ReleaseMutex(); }
    }
    return LastOutcome;
  }
  static string RunLocked(string root, int waitMs, bool window, Action afterSwap) {
    string pendingFile = PendingFile(root);
    // another launcher may have finished it meanwhile
    if (!File.Exists(pendingFile)) return "none";
    Dictionary<string, object> p;
    try {
      if (new FileInfo(pendingFile).Length > 16384) throw new InvalidDataException("pending.json too large");
      p = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(pendingFile));
    } catch (Exception) { Drop(root, null); return "invalid"; }
    string version = Read(p, "electron"), zipName = Read(p, "zip"), sha = Read(p, "sha256").ToLowerInvariant(), app = Read(p, "app"), text = Read(p, "text");
    int tries = 0; int.TryParse(Read(p, "tries"), out tries);
    Match m = ZipName.Match(zipName);
    if (!Plain.IsMatch(version) || !m.Success || m.Groups[1].Value != version || !Regex.IsMatch(sha, @"^[a-f0-9]{64}\z")) {
      Drop(root, null); return "invalid";
    }
    string zip = Path.Combine(RuntimeDir(root), zipName);
    string e = ElectronDir(root), dist = Path.Combine(e, "dist"), old = Path.Combine(e, "dist.old"), neu = Path.Combine(e, "dist.new");
    // never down: a newer runtime is already in place (CharlesSetup, or an earlier run that was cut short)
    string have = "";
    try { have = File.ReadAllText(Path.Combine(dist, "version")).Trim(); } catch (Exception) {}
    if (Plain.IsMatch(have) && Compare(version, have) <= 0) {
      Drop(root, zip);
      if (Compare(version, have) == 0) Result(root, true, version, "applied", "", tries);
      return "stale";
    }
    Dictionary<string, object> pkg = null;
    try { pkg = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(root, "package.json"))); } catch (Exception) {}
    // fetched before an update's swap: only for the version it was fetched with
    if (app.Length > 0 && (pkg == null ? "" : Read(pkg, "version")) != app) return "other-app";
    // only the runtime the package.json beside this launcher pins (it came in the SHA-checked update
    // zip): a pending.json that names another Electron or another hash is dropped (its zip stays for
    // the app to reuse or clean, so a disagreement can never turn into a download loop)
    object pinned = null;
    var want = pkg != null && pkg.TryGetValue("charlesRuntime", out pinned) ? pinned as Dictionary<string, object> : null;
    if (want == null || Read(want, "electron") != version || Read(want, "sha256").ToLowerInvariant() != sha) {
      Drop(root, null); return "invalid";
    }
    if (!File.Exists(zip)) { Drop(root, null); return "invalid"; }
    var until = DateTime.UtcNow.AddMilliseconds(waitMs);
    while (RunningFrom(dist) > 0) {
      if (DateTime.UtcNow >= until) return "busy";
      Thread.Sleep(250);
    }
    string outcome = null;
    Exception failure = null;
    Action work = delegate {
      try { outcome = Apply(root, version, sha, zip, dist, old, neu, afterSwap); }
      catch (Exception x) { failure = x; }
    };
    if (window) Progress.During(text.Length > 0 ? text : "Charles...", work); else work();
    if (outcome != null) return outcome;
    if (failure is HashMismatch) {
      Drop(root, zip);
      Result(root, false, version, "hash", failure.Message, tries + 1);
      return "hash";
    }
    tries++;
    string message = failure == null ? "" : failure.Message;
    if (tries >= MaxTries) {
      Drop(root, zip);
      Result(root, false, version, "apply", message, tries);
      return "gave-up";
    }
    try { p["tries"] = tries; WriteJson(pendingFile, p); } catch (Exception) {}
    return "failed";
  }

  class HashMismatch : Exception { public HashMismatch(string m) : base(m) {} }

  static string Apply(string root, string version, string sha, string zip, string dist, string old, string neu, Action afterSwap) {
    string actual = Sha256(zip);
    if (actual != sha) throw new HashMismatch("SHA-256 " + actual.Substring(0, 12) + " != " + sha.Substring(0, 12));
    try {
      if (Directory.Exists(neu)) Retry(delegate { Remove(neu); });
      if (Directory.Exists(old)) Retry(delegate { Remove(old); });
      using (var archive = new ZipArchive(File.OpenRead(zip), ZipArchiveMode.Read)) {
        long need = ExtraBytes;
        foreach (var entry in archive.Entries) need += entry.Length;
        try { need += new FileInfo(Path.Combine(dist, "electron.exe")).Length; } catch (Exception) {}
        long free = long.MaxValue;
        try { free = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(root))).AvailableFreeSpace; } catch (Exception) {}
        if (free < need) throw new IOException("not enough disk space: " + (free / 1048576) + " MB free, " + (need / 1048576) + " MB needed");
        string baseDir = Path.GetFullPath(neu).TrimEnd('\\') + "\\";
        Directory.CreateDirectory(neu);
        foreach (var entry in archive.Entries) {
          string name = entry.FullName.Replace('/', '\\');
          if (name.Length == 0 || name.StartsWith("\\") || name.Contains(":")) throw new InvalidDataException("unsafe entry: " + entry.FullName);
          string target = Path.GetFullPath(Path.Combine(neu, name));
          if (!target.StartsWith(baseDir, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("unsafe entry: " + entry.FullName);
          if (name.EndsWith("\\")) { Directory.CreateDirectory(target); continue; }
          Directory.CreateDirectory(Path.GetDirectoryName(target));
          using (var input = entry.Open()) using (var output = File.Create(target)) input.CopyTo(output);
        }
      }
      if (!File.Exists(Path.Combine(neu, "electron.exe"))) throw new InvalidDataException("electron.exe missing in the zip");
      string got = "";
      try { got = File.ReadAllText(Path.Combine(neu, "version")).Trim(); } catch (Exception) {}
      if (got != version) throw new InvalidDataException("the zip holds Electron " + got + ", expected " + version);
      if (TestFail == "extract") throw new IOException("test: extract");
      Retry(delegate { Directory.Move(dist, old); });
      try {
        if (TestFail == "swap") throw new IOException("test: swap");
        Retry(delegate { Directory.Move(neu, dist); });
      } catch (Exception) {
        Retry(delegate { Directory.Move(old, dist); });
        throw;
      }
    } catch (Exception) {
      TryRemove(neu);
      throw;
    }
    TryRemove(old);
    try { File.Delete(zip); } catch (Exception) {}
    try { File.Delete(PendingFile(root)); } catch (Exception) {}
    Result(root, true, version, "applied", "", 0);
    if (afterSwap != null) afterSwap();
    return "applied";
  }
}

// The launcher has no window of its own; while the runtime is put in place (a few seconds) this
// small one says so, in Charles' own colours (the warm black surface and the main text of the app,
// --sb-surface and --sb-text in public/styles/01-base.css). It never takes the focus, is not topmost
// and has no taskbar button.
class Progress : Form {
  static readonly Color Surface = Color.FromArgb(0x06, 0x06, 0x06), Ink = Color.FromArgb(0xf5, 0xee, 0xe5);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { var p = base.CreateParams; p.ExStyle |= 0x08000000; return p; } // WS_EX_NOACTIVATE
  }
  Progress(string text) {
    Text = "Charles"; FormBorderStyle = FormBorderStyle.FixedToolWindow; ControlBox = false;
    ShowInTaskbar = false; TopMost = false; StartPosition = FormStartPosition.CenterScreen;
    ClientSize = new System.Drawing.Size(380, 72);
    BackColor = Surface; ForeColor = Ink;
    try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch (Exception) {}
    Controls.Add(new Label { Text = text, Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter, Padding = new Padding(12),
      BackColor = Surface, ForeColor = Ink, Font = new Font("Segoe UI", 10f) });
    if (TestLocation.HasValue) { StartPosition = FormStartPosition.Manual; Location = TestLocation.Value; }
  }
  protected override void OnHandleCreated(EventArgs e) {
    base.OnHandleCreated(e);
    // the title bar in the same dark: dark mode (Windows 10 2004+), then the caption and its text
    // colours (Windows 11); older systems keep their frame
    try {
      int on = 1; DwmSetWindowAttribute(Handle, 20, ref on, 4);
      int caption = Surface.R | Surface.G << 8 | Surface.B << 16; DwmSetWindowAttribute(Handle, 35, ref caption, 4);
      int title = Ink.R | Ink.G << 8 | Ink.B << 16; DwmSetWindowAttribute(Handle, 36, ref title, 4);
    } catch (Exception) {}
  }
  public static IntPtr LastHandle = IntPtr.Zero;
  // the harness (.qa/h100/runtime) draws the window off every screen to capture it
  public static Point? TestLocation = null;
  /// <summary>Shows the window while `work` runs on another thread.</summary>
  public static void During(string text, Action work) {
    var thread = new Thread(delegate () { work(); }) { IsBackground = true };
    using (var form = new Progress(text)) {
      form.Show();
      LastHandle = form.Handle;
      thread.Start();
      while (thread.IsAlive) { Application.DoEvents(); thread.Join(30); }
      form.Close();
    }
  }
}
