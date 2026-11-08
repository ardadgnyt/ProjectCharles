// v0.9.24: Charles' installer and uninstaller, one program. Built by scripts/build-setup.ps1 with the
// .NET Framework compiler that comes with Windows (C# 5, like CharlesLauncher.cs and CharlesHelper.cs);
// scripts/setup-pack.py appends the application as a zip and a footer, which gives CharlesSetup.exe.
//
// Engine has no window, no registry and no shortcuts: it works in the folder it is given, so
// .qa tests can run it on sample data. Shell holds what touches the rest of the user's Windows.
// No administrator rights: everything goes in the user's own folders and HKCU.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Charles Setup")]
[assembly: AssemblyProduct("Charles")]
[assembly: AssemblyCompany("HzPederPan")]
[assembly: AssemblyDescription("Charles Setup")]
[assembly: AssemblyVersion("0.9.25.0")]
[assembly: AssemblyFileVersion("0.9.25.0")]

namespace CharlesSetup {

static class Tx {
  public static bool Turkish;
  // English, Turkish. Windows' language picks the first choice; the first page can change it.
  static readonly Dictionary<string, string[]> All = new Dictionary<string, string[]> {
    {"title", new[] {"Charles Setup", "Charles Kurulumu"}},
    {"uninstallTitle", new[] {"Remove Charles", "Charles'ı Kaldır"}},
    {"next", new[] {"Next", "İleri"}},
    {"back", new[] {"Back", "Geri"}},
    {"cancel", new[] {"Cancel", "İptal"}},
    {"install", new[] {"Install", "Kur"}},
    {"finish", new[] {"Finish", "Bitir"}},
    {"close", new[] {"Close", "Kapat"}},
    {"browse", new[] {"Browse…", "Gözat…"}},
    {"retry", new[] {"Try again", "Yeniden dene"}},
    {"langHead", new[] {"Choose a language", "Dil seçin"}},
    {"langSub", new[] {"This language is used in this setup. Charles keeps its own language setting.", "Bu dil kurulum sihirbazında kullanılır. Charles kendi dil ayarını korur."}},
    {"licHead", new[] {"License", "Lisans sözleşmesi"}},
    {"licSub", new[] {"Read the terms below to continue.", "Devam etmek için aşağıdaki koşulları okuyun."}},
    {"licNote", new[] {"", "Lisans metinleri İngilizcedir; onaylanmış bir Türkçe çevirisi yoktur. Geçerli metin aşağıdaki İngilizce metindir."}},
    {"licDoc0", new[] {"Charles: GNU General Public License v3", "Charles: GNU General Public License v3"}},
    {"licDoc1", new[] {"Names, character and artwork", "Adlar, karakter ve görseller"}},
    {"licDoc2", new[] {"Third-party components", "Üçüncü taraf bileşenler"}},
    {"licAccept", new[] {"I have read and accept the license terms", "Lisans koşullarını okudum ve kabul ediyorum"}},
    {"dirHead", new[] {"Install location", "Kurulum konumu"}},
    {"dirSub", new[] {"Charles needs no administrator rights in this folder.", "Charles bu klasör için yönetici izni istemez."}},
    {"dirLabel", new[] {"Folder:", "Klasör:"}},
    {"dirSpace", new[] {"Needs {0} of free disk space. Free now: {1}.", "{0} boş disk alanı gerekir. Şu an boş: {1}."}},
    {"dirDesktop", new[] {"Create a desktop shortcut", "Masaüstü kısayolu oluştur"}},
    {"dirSame", new[] {"Charles {0} is already here. It will be installed again.", "Charles {0} zaten burada kurulu. Yeniden kurulacak."}},
    {"dirOlder", new[] {"Charles {0} is here and will be updated to {1}.", "Burada Charles {0} kurulu, {1} sürümüne geçirilecek."}},
    {"dirNewer", new[] {"A newer Charles ({0}) is here. It will be replaced by {1}.", "Burada daha yeni bir Charles ({0}) kurulu. {1} ile değiştirilecek."}},
    {"dirKeep", new[] {"Your chats, settings and accounts in %APPDATA%\\Charles are kept.", "%APPDATA%\\Charles içindeki sohbetlerin, ayarların ve hesapların korunur."}},
    {"workHead", new[] {"Installing Charles", "Charles kuruluyor"}},
    {"workSub", new[] {"This takes a few minutes.", "Bu işlem birkaç dakika sürer."}},
    {"stepCheck", new[] {"Checking the package…", "Paket denetleniyor…"}},
    {"stepCopy", new[] {"Copying files…", "Dosyalar kopyalanıyor…"}},
    {"stepSwap", new[] {"Putting the new files in place…", "Yeni dosyalar yerleştiriliyor…"}},
    {"stepFinish", new[] {"Creating shortcuts…", "Kısayollar oluşturuluyor…"}},
    {"stepRemove", new[] {"Removing Charles…", "Charles kaldırılıyor…"}},
    {"doneHead", new[] {"Charles is installed", "Charles kuruldu"}},
    {"doneSub", new[] {"Installed in {0}", "Kurulum yeri: {0}"}},
    {"doneStart", new[] {"Start Charles now", "Charles'ı şimdi başlat"}},
    {"doneNote", new[] {"Some shortcuts could not be created. Charles repairs them on its first start. Log: {0}", "Bazı kısayollar oluşturulamadı. Charles ilk açılışta onarır. Günlük: {0}"}},
    {"failHead", new[] {"Setup could not finish", "Kurulum tamamlanamadı"}},
    {"failSub", new[] {"Nothing was changed in your existing Charles.", "Mevcut Charles kurulumunda bir şey değişmedi."}},
    {"cancelledHead", new[] {"Setup was cancelled", "Kurulum iptal edildi"}},
    {"failLog", new[] {"Log: {0}", "Günlük: {0}"}},
    {"askCancel", new[] {"Cancel the setup?", "Kurulum iptal edilsin mi?"}},
    {"errRunning", new[] {"Charles is running from this folder. Close it from its tray icon, then try again.", "Charles bu klasörden çalışıyor. Sistem tepsisindeki simgesinden kapatıp yeniden dene."}},
    {"errPath", new[] {"This folder cannot be used: {0}", "Bu klasör kullanılamıyor: {0}"}},
    {"errRoot", new[] {"Choose a folder, not a whole drive or a Windows folder.", "Tüm bir sürücü ya da Windows klasörü değil, bir klasör seç."}},
    {"errLong", new[] {"The path is too long ({0} characters, at most {1}).", "Yol çok uzun ({0} karakter, en fazla {1})."}},
    {"errOther", new[] {"This folder holds other files and no Charles. Choose an empty folder or a Charles folder.", "Bu klasörde başka dosyalar var ve Charles yok. Boş bir klasör ya da Charles klasörü seç."}},
    {"errWrite", new[] {"This folder cannot be written without administrator rights. Choose a folder of your own.", "Bu klasöre yönetici izni olmadan yazılamıyor. Sana ait bir klasör seç."}},
    {"errSpace", new[] {"Not enough disk space: {0} needed, {1} free.", "Disk alanı yetmiyor: {0} gerekli, {1} boş."}},
    {"errDamaged", new[] {"The setup file is damaged. Download CharlesSetup.exe again.", "Kurulum dosyası bozuk. CharlesSetup.exe dosyasını yeniden indir."}},
    {"errLocked", new[] {"A file in use could not be replaced: {0}. Your old files were put back.", "Kullanımdaki bir dosya değiştirilemedi: {0}. Eski dosyaların geri kondu."}},
    {"errWin", new[] {"Charles needs 64-bit Windows 10 or 11.", "Charles 64 bit Windows 10 veya 11 gerektirir."}},
    {"unHead", new[] {"Remove Charles from this computer", "Charles'ı bu bilgisayardan kaldır"}},
    {"unFolder", new[] {"Folder: {0}", "Klasör: {0}"}},
    {"unData", new[] {"Also delete my chats, settings, memory and connected accounts (%APPDATA%\\Charles)", "Sohbetlerimi, ayarlarımı, hafızamı ve bağlı hesaplarımı da sil (%APPDATA%\\Charles)"}},
    {"unKeep", new[] {"If you leave this off, they stay and a later install finds them again.", "Bunu işaretlemezsen kalırlar ve sonraki kurulum onları yeniden bulur."}},
    {"unConfirm", new[] {"This permanently deletes your chats, settings, memory and account connections in %APPDATA%\\Charles. It cannot be undone. Delete them?", "Bu işlem %APPDATA%\\Charles içindeki sohbetlerini, ayarlarını, hafızanı ve hesap bağlantılarını kalıcı olarak siler. Geri alınamaz. Silinsin mi?"}},
    {"unRemove", new[] {"Remove", "Kaldır"}},
    {"unDone", new[] {"Charles was removed.", "Charles kaldırıldı."}},
    {"unDoneKept", new[] {"Charles was removed. Your data stayed in %APPDATA%\\Charles.", "Charles kaldırıldı. Verilerin %APPDATA%\\Charles içinde kaldı."}},
    {"unLeft", new[] {"Some files stayed in {0}.", "Bazı dosyalar {0} içinde kaldı."}},
    {"unNotCharles", new[] {"This folder is not a Charles installation: {0}", "Bu klasör bir Charles kurulumu değil: {0}"}},
  };
  public static string T(string key, params object[] args) {
    string[] v;
    if (!All.TryGetValue(key, out v)) return key;
    string s = v[Turkish ? 1 : 0];
    return args.Length > 0 ? string.Format(s, args) : s;
  }
  public static string Size(long bytes) {
    return bytes >= 1L << 30 ? (bytes / (double)(1L << 30)).ToString("0.0") + " GB" : (bytes >> 20) + " MB";
  }
}

// ── The appended package ─────────────────────────────────────────────────────────────────────────
// [program][zip][sha-256 of the zip: 32][program length: 8][zip length: 8]["CHARLES1": 8]
class Part : Stream {
  readonly Stream inner; readonly long start, length; long at;
  public Part(Stream inner, long start, long length) { this.inner = inner; this.start = start; this.length = length; }
  public override bool CanRead { get { return true; } }
  public override bool CanSeek { get { return true; } }
  public override bool CanWrite { get { return false; } }
  public override long Length { get { return length; } }
  public override long Position { get { return at; } set { at = value; } }
  public override void Flush() {}
  public override int Read(byte[] buffer, int offset, int count) {
    long left = length - at;
    if (left <= 0) return 0;
    inner.Position = start + at;
    int n = inner.Read(buffer, offset, (int)Math.Min(count, left));
    at += n;
    return n;
  }
  public override long Seek(long offset, SeekOrigin origin) {
    at = origin == SeekOrigin.Begin ? offset : origin == SeekOrigin.Current ? at + offset : length + offset;
    return at;
  }
  public override void SetLength(long value) { throw new NotSupportedException(); }
  public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
  protected override void Dispose(bool disposing) { if (disposing) inner.Dispose(); base.Dispose(disposing); }
}

class Package {
  public string File; public long Stub, Length; public byte[] Sha;
  public static Package Find(string file) {
    using (var f = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read)) {
      if (f.Length < 56) return null;
      f.Position = f.Length - 56;
      var b = new byte[56];
      if (f.Read(b, 0, 56) != 56 || Encoding.ASCII.GetString(b, 48, 8) != "CHARLES1") return null;
      var sha = new byte[32];
      Array.Copy(b, sha, 32);
      return new Package { File = file, Sha = sha, Stub = BitConverter.ToInt64(b, 32), Length = BitConverter.ToInt64(b, 40) };
    }
  }
  public Stream Open() {
    return new Part(new FileStream(File, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20), Stub, Length);
  }
}

class Job {
  public string Target;
  public Func<Stream> OpenZip;
  public byte[] Sha;
  public CancellationToken Cancel;
  public Action<int, string> Report = delegate {};
  public Action<string> Log = delegate {};
  public string FailAt = Environment.GetEnvironmentVariable("CHARLES_SETUP_TEST_FAIL");
}

class SetupError : Exception { public SetupError(string message) : base(message) {} }

static class Engine {
  public static int MaxTarget = 100;
  // A setup never replaces these, even if a package contains them (the same list as app/core/updater.cjs).
  static readonly HashSet<string> Protected = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
    "_setup", "_update", ".git", "charles-install.json", "charles-creator.json", ".env", "companion.json", "personal.json", "charles-history.json", "preferences.json"
  };
  // What an uninstall removes: the app's own top-level folders and files, and nothing else in the folder.
  static readonly string[] OwnFolders = { "app", "dist", "public", "src", "test", "docs", "setup", "scripts", "licenses", "node_modules", "models", "tools", "quickshare-tools", "download-tools", "_update", "_setup" };
  static readonly string[] OwnFiles = { "Charles.exe", "Start-Charles.cmd", "package.json", "package-lock.json", "LICENSE", "LICENSE-ASSETS.md", "THIRD-PARTY-NOTICES.md", "README.md", "CHANGELOG.md", "DEVELOPMENT.md", "biome.json", ".gitattributes", ".gitignore", "charles-manifest.json", "charles-install.json", "Uninstall Charles.exe" };

  public static string InstalledVersion(string target) {
    try {
      var m = Regex.Match(File.ReadAllText(Path.Combine(target, "package.json")), "\"version\"\\s*:\\s*\"([^\"]+)\"");
      return m.Success && File.Exists(Path.Combine(target, "Charles.exe")) ? m.Groups[1].Value : null;
    } catch (Exception) { return null; }
  }

  public static string PackageVersion(ZipArchive zip) {
    var e = zip.GetEntry("package.json");
    if (e == null) return null;
    using (var r = new StreamReader(e.Open())) {
      var m = Regex.Match(r.ReadToEnd(), "\"version\"\\s*:\\s*\"([^\"]+)\"");
      return m.Success ? m.Groups[1].Value : null;
    }
  }

  // "0.9.24-rc.1" → (0, 9, 24, pre-release?, "rc.1"); the order of app/core/updater.cjs for what setups meet.
  public static int Compare(string a, string b) {
    Func<string, int[]> nums = s => { var m = Regex.Match(s, @"^(\d+)\.(\d+)\.(\d+)"); return m.Success ? new[] { int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value) } : new[] { 0, 0, 0 }; };
    int[] x = nums(a), y = nums(b);
    for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i] < y[i] ? -1 : 1;
    bool pa = a.Contains("-"), pb = b.Contains("-");
    if (pa != pb) return pa ? -1 : 1;
    return Math.Sign(string.CompareOrdinal(a, b));
  }

  /// <summary>The reason a folder cannot take Charles, or null. `need` is 0 when the size is not known yet.</summary>
  public static string CheckFolder(string target, long need) {
    string full;
    try { full = Path.GetFullPath(target).TrimEnd('\\'); }
    catch (Exception e) { return Tx.T("errPath", e.Message); }
    if (full.Length > MaxTarget) return Tx.T("errLong", full.Length, MaxTarget);
    string root = Path.GetPathRoot(full).TrimEnd('\\');
    if (string.Equals(full, root, StringComparison.OrdinalIgnoreCase) || !Regex.IsMatch(full, @"^[A-Za-z]:\\")) return Tx.T("errRoot");
    foreach (var f in new[] { Environment.SpecialFolder.Windows, Environment.SpecialFolder.UserProfile, Environment.SpecialFolder.Desktop, Environment.SpecialFolder.MyDocuments, Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.ProgramFilesX86 }) {
      string p = Environment.GetFolderPath(f);
      if (p != "" && (string.Equals(full, p, StringComparison.OrdinalIgnoreCase) || (f == Environment.SpecialFolder.Windows && full.StartsWith(p + "\\", StringComparison.OrdinalIgnoreCase)))) return Tx.T("errRoot");
    }
    if (Directory.Exists(full) && InstalledVersion(full) == null && Directory.EnumerateFileSystemEntries(full).Any()) return Tx.T("errOther");
    try {
      string probe = Directory.Exists(full) ? full : Path.GetDirectoryName(full);
      while (probe != null && !Directory.Exists(probe)) probe = Path.GetDirectoryName(probe);
      if (probe == null) return Tx.T("errRoot");
      string file = Path.Combine(probe, ".charles-write-" + Guid.NewGuid().ToString("N"));
      File.WriteAllBytes(file, new byte[0]);
      File.Delete(file);
    } catch (Exception) { return Tx.T("errWrite"); }
    if (need > 0) {
      long free = new DriveInfo(Path.GetPathRoot(full)).AvailableFreeSpace;
      if (free < need) return Tx.T("errSpace", Tx.Size(need), Tx.Size(free));
    }
    return null;
  }

  public static void VerifyPackage(Job job) {
    using (var sha = SHA256.Create())
    using (var s = job.OpenZip()) {
      var b = new byte[1 << 20];
      long done = 0, all = s.Length;
      int n, last = -1;
      while ((n = s.Read(b, 0, b.Length)) > 0) {
        job.Cancel.ThrowIfCancellationRequested();
        sha.TransformBlock(b, 0, n, null, 0);
        done += n;
        int p = (int)(done * 15 / Math.Max(all, 1));
        if (p != last) { job.Report(p, Tx.T("stepCheck")); last = p; }
      }
      sha.TransformFinalBlock(b, 0, 0);
      if (job.Sha != null && !sha.Hash.SequenceEqual(job.Sha)) throw new SetupError(Tx.T("errDamaged"));
    }
  }

  /// <summary>A zip entry's path inside `folder`, or an error: it never ends up outside it.</summary>
  public static string Inside(string folder, string name) {
    string rel = name.Replace('/', '\\');
    if (rel.Length == 0 || rel.StartsWith("\\") || rel.Contains(":") || rel.IndexOfAny(Path.GetInvalidPathChars()) >= 0 || rel.Split('\\').Any(p => p == ".." || p == ".")) throw new SetupError(Tx.T("errDamaged"));
    string root = Path.GetFullPath(folder).TrimEnd('\\') + "\\";
    string full = Path.GetFullPath(Path.Combine(root, rel));
    if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new SetupError(Tx.T("errDamaged"));
    return full;
  }

  static Dictionary<string, object> Manifest(ZipArchive zip) {
    var e = zip.GetEntry("charles-manifest.json");
    if (e == null) return null;
    using (var r = new StreamReader(e.Open(), Encoding.UTF8)) {
      try {
        var json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        var all = json.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
        return all["files"] as Dictionary<string, object>;
      } catch (ArgumentException) { throw new SetupError(Tx.T("errDamaged")); }
    }
  }

  static void Extract(Job job, ZipArchive zip, string stage) {
    var manifest = Manifest(zip);
    var entries = zip.Entries.Where(e => !e.FullName.EndsWith("/")).ToList();
    long all = Math.Max(entries.Sum(e => e.Length), 1), done = 0;
    int last = -1;
    var buffer = new byte[1 << 18];
    foreach (var entry in entries) {
      job.Cancel.ThrowIfCancellationRequested();
      string file = Inside(stage, entry.FullName);
      Directory.CreateDirectory(Path.GetDirectoryName(file));
      object listed = null;
      if (manifest != null) manifest.TryGetValue(entry.FullName, out listed);
      var want = listed as System.Collections.IList;
      string hash = want != null && want.Count > 1 ? want[1] as string : null;
      using (var sha = hash != null ? SHA256.Create() : null)
      using (var input = entry.Open())
      using (var output = new FileStream(file, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1 << 18)) {
        int n;
        long size = 0;
        while ((n = input.Read(buffer, 0, buffer.Length)) > 0) {
          job.Cancel.ThrowIfCancellationRequested();
          output.Write(buffer, 0, n);
          if (sha != null) sha.TransformBlock(buffer, 0, n, null, 0);
          size += n;
          done += n;
          int p = 15 + (int)(done * 75 / all);
          if (p != last) { job.Report(p, Tx.T("stepCopy")); last = p; }
        }
        if (size != entry.Length) throw new SetupError(Tx.T("errDamaged"));
        if (want != null && Convert.ToInt64(want[0]) != size) throw new SetupError(Tx.T("errDamaged"));
        if (sha != null) {
          sha.TransformFinalBlock(buffer, 0, 0);
          if (BitConverter.ToString(sha.Hash).Replace("-", "") != hash.ToUpperInvariant()) throw new SetupError(Tx.T("errDamaged"));
        }
      }
      File.SetLastWriteTimeUtc(file, entry.LastWriteTime.UtcDateTime);
    }
  }

  static bool Exists(string path) { return File.Exists(path) || Directory.Exists(path); }
  static void Move(string from, string to) {
    for (int i = 0; ; i++) {
      try {
        if (Directory.Exists(from)) Directory.Move(from, to); else File.Move(from, to);
        return;
      } catch (Exception e) {
        if (i >= 6 || !(e is IOException || e is UnauthorizedAccessException)) throw;
        Thread.Sleep(300);
      }
    }
  }
  public static void Remove(string path) {
    for (int i = 0; ; i++) {
      try {
        if (Directory.Exists(path)) {
          foreach (var f in new DirectoryInfo(path).EnumerateFiles("*", SearchOption.AllDirectories))
            if ((f.Attributes & FileAttributes.ReadOnly) != 0) f.Attributes &= ~FileAttributes.ReadOnly;
          Directory.Delete(path, true);
        } else if (File.Exists(path)) {
          File.SetAttributes(path, FileAttributes.Normal);
          File.Delete(path);
        }
        return;
      } catch (Exception e) {
        if (i >= 6 || !(e is IOException || e is UnauthorizedAccessException)) throw;
        Thread.Sleep(300);
      }
    }
  }

  static string Journal(string target) { return Path.Combine(target, "_setup", "swap.txt"); }
  /// <summary>A swap that was cut short (a crash, a power cut): puts the old files back.</summary>
  public static bool Recover(string target, Action<string> log) {
    string journal = Journal(target);
    if (!File.Exists(journal)) return false;
    string backup = Path.Combine(target, "_setup", "backup");
    foreach (string line in File.ReadAllLines(journal).Reverse()) {
      if (line.Length < 5) continue;
      string name = line.Substring(4);
      if (line.StartsWith("new ")) {
        if (Exists(Path.Combine(target, name))) Remove(Path.Combine(target, name));
      } else if (line.StartsWith("old ") && Exists(Path.Combine(backup, name))) {
        if (Exists(Path.Combine(target, name))) Remove(Path.Combine(target, name));
        Move(Path.Combine(backup, name), Path.Combine(target, name));
      }
    }
    File.Delete(journal);
    log("rolled back an unfinished swap");
    return true;
  }

  static void Swap(Job job, string stage, string backup) {
    string journal = Journal(job.Target);
    Directory.CreateDirectory(backup);
    using (var w = new StreamWriter(new FileStream(journal, FileMode.Create, FileAccess.Write, FileShare.Read), new UTF8Encoding(false))) {
      w.AutoFlush = true;
      var items = new DirectoryInfo(stage).EnumerateFileSystemInfos().Where(i => !Protected.Contains(i.Name)).ToList();
      foreach (var item in items) {
        string live = Path.Combine(job.Target, item.Name);
        if (Exists(live)) {
          w.WriteLine("old " + item.Name);
          Move(live, Path.Combine(backup, item.Name));
        }
        if (job.FailAt == item.Name) throw new IOException("test failure at " + item.Name);
        w.WriteLine("new " + item.Name);
        Move(item.FullName, live);
      }
    }
    // from here on the new files are the installation
    File.Delete(journal);
  }
  /// <summary>The largest folder path that keeps every file of the package under Windows' 260 characters.</summary>
  public static int RoomFor(ZipArchive zip) {
    return 259 - zip.Entries.Max(e => e.FullName.Length) - "\\_setup\\stage\\".Length;
  }

  /// <summary>Unpacks and checks everything beside the live files first; only a complete copy replaces them.</summary>
  public static void Install(Job job) {
    bool created = !Directory.Exists(job.Target);
    string work = Path.Combine(job.Target, "_setup"), stage = Path.Combine(work, "stage"), backup = Path.Combine(work, "backup");
    try {
      Directory.CreateDirectory(job.Target);
      Recover(job.Target, job.Log);
      if (Directory.Exists(work)) Remove(work);
      VerifyPackage(job);
      using (var s = job.OpenZip())
      using (var zip = new ZipArchive(s, ZipArchiveMode.Read)) {
        int room = Engine.RoomFor(zip);
        if (job.Target.Length > room) throw new SetupError(Tx.T("errLong", job.Target.Length, room));
        Directory.CreateDirectory(stage);
        Extract(job, zip, stage);
      }
      job.Cancel.ThrowIfCancellationRequested();
      job.Report(92, Tx.T("stepSwap"));
      try {
        Swap(job, stage, backup);
      } catch (Exception e) {
        job.Log("swap failed: " + e);
        Recover(job.Target, job.Log);
        throw new SetupError(Tx.T("errLocked", e.Message));
      }
      try { Remove(work); } catch (Exception e) { job.Log("old files stayed in _setup: " + e.Message); }
    } catch (Exception) {
      try { if (!File.Exists(Journal(job.Target)) && Directory.Exists(work)) Remove(work); } catch (Exception) {}
      try { if (created && Directory.Exists(job.Target) && !Directory.EnumerateFileSystemEntries(job.Target).Any()) Directory.Delete(job.Target); } catch (Exception) {}
      throw;
    }
  }

  /// <summary>Removes the app's own files. What is left in the folder stays and is returned.</summary>
  public static bool Uninstall(string target, Action<int, string> report) {
    if (InstalledVersion(target) == null) throw new SetupError(Tx.T("unNotCharles", target));
    var names = new List<string>();
    names.AddRange(OwnFiles.Select(n => Path.Combine(target, n)));
    string manifest = Path.Combine(target, "charles-manifest.json");
    if (File.Exists(manifest))
      try {
        var all = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Deserialize<Dictionary<string, object>>(File.ReadAllText(manifest));
        foreach (string rel in ((Dictionary<string, object>)all["files"]).Keys) names.Add(Inside(target, rel));
      } catch (Exception) {}
    names = names.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    for (int i = 0; i < OwnFolders.Length; i++) {
      report(i * 90 / OwnFolders.Length, Tx.T("stepRemove"));
      try { Remove(Path.Combine(target, OwnFolders[i])); } catch (Exception) {}
    }
    foreach (string file in names) try { Remove(file); } catch (Exception) {}
    report(95, Tx.T("stepRemove"));
    foreach (string dir in Directory.Exists(target) ? Directory.EnumerateDirectories(target, "*", SearchOption.AllDirectories).OrderByDescending(d => d.Length).ToList() : new List<string>())
      try { if (!Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir); } catch (Exception) {}
    // an antivirus or the search index may hold a file for a moment after it was deleted
    for (int i = 0; i < 8 && Directory.Exists(target) && !Directory.EnumerateFileSystemEntries(target).Any(); i++) {
      try { Directory.Delete(target); } catch (Exception) { Thread.Sleep(250); }
    }
    return !Directory.Exists(target);
  }
}

// ── What touches the rest of the user's Windows ──────────────────────────────────────────────────
static class Shell {
  const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ProjectCharles";
  public static string StartMenu { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "ProjectCharles"); } }
  static string DesktopLink { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Charles.lnk"); } }
  static string StartLink { get { return Path.Combine(StartMenu, "Charles.lnk"); } }
  static string AutoStartLink { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "ProjectCharles.lnk"); } }
  public static string DataFolder { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Charles"); } }

  static object Script() { return Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")); }
  static object Call(object on, string name, params object[] args) { return on.GetType().InvokeMember(name, BindingFlags.InvokeMethod, null, on, args); }
  static object Get(object on, string name) { return on.GetType().InvokeMember(name, BindingFlags.GetProperty, null, on, null); }
  static void Set(object on, string name, object value) { on.GetType().InvokeMember(name, BindingFlags.SetProperty, null, on, new[] { value }); }

  public static string LinkTarget(string link) {
    try {
      if (!File.Exists(link)) return null;
      return Get(Call(Script(), "CreateShortcut", link), "TargetPath") as string;
    } catch (Exception) { return null; }
  }
  static void Link(string file, string target, string folder, string icon) {
    Directory.CreateDirectory(Path.GetDirectoryName(file));
    object link = Call(Script(), "CreateShortcut", file);
    Set(link, "TargetPath", target);
    Set(link, "WorkingDirectory", folder);
    Set(link, "IconLocation", icon);
    Set(link, "Description", "Charles");
    Call(link, "Save");
  }
  static bool Ours(string link, string folder) {
    string t = LinkTarget(link);
    return t != null && t.StartsWith(folder.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase);
  }

  /// <summary>Where an earlier Charles lives: this setup's own entry, then the Start menu shortcut.</summary>
  public static string FindInstalled() {
    try {
      using (var k = Registry.CurrentUser.OpenSubKey(UninstallKey)) {
        string p = k == null ? null : k.GetValue("InstallLocation") as string;
        if (!string.IsNullOrEmpty(p) && Engine.InstalledVersion(p) != null) return p;
      }
    } catch (Exception) {}
    string t = LinkTarget(StartLink);
    if (t != null) {
      string dir = Path.GetDirectoryName(t);
      if (Engine.InstalledVersion(dir) != null) return dir;
    }
    return null;
  }
  public static string DefaultFolder() {
    return FindInstalled() ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Charles");
  }

  /// <summary>Everything after the files. A failure here never undoes the install: Charles repairs its own shortcuts.</summary>
  public static bool Finish(string target, string version, string uninstaller, bool desktop, string language, Action<string> log) {
    bool ok = true;
    Action<Action> step = a => { try { a(); } catch (Exception e) { ok = false; log("step failed: " + e.Message); } };
    string launcher = Path.Combine(target, "Charles.exe"), icon = Path.Combine(target, "public", "charles.ico");
    step(() => Link(StartLink, launcher, target, icon));
    if (desktop) step(() => Link(DesktopLink, launcher, target, icon));
    step(() => {
      using (var k = Registry.CurrentUser.CreateSubKey(UninstallKey)) {
        k.SetValue("DisplayName", "Charles");
        k.SetValue("DisplayVersion", version);
        k.SetValue("Publisher", "HzPederPan");
        k.SetValue("InstallLocation", target);
        k.SetValue("DisplayIcon", icon);
        k.SetValue("UninstallString", "\"" + uninstaller + "\" /uninstall");
        k.SetValue("NoModify", 1, RegistryValueKind.DWord);
        k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
      }
    });
    // Only a computer with no Charles settings yet takes the setup's language: an installer never
    // changes a language somebody chose (app/core/install-language.cjs reads this file).
    step(() => {
      if (File.Exists(Path.Combine(DataFolder, "companion.json"))) return;
      string stamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
      File.WriteAllText(Path.Combine(target, "charles-install.json"), "{\"language\":\"" + language + "\",\"stamp\":\"" + stamp + "\"}", new UTF8Encoding(false));
    });
    // the branded runtime is made once here, so the first start does not wait for it
    step(() => Hidden(launcher, "--prepare-runtime", target, 120000, null));
    // the Windows identity of the shortcuts (app/core/windows-identity.cjs)
    step(() => Hidden(Path.Combine(target, "node_modules", "electron", "dist", "electron.exe"), "\"" + Path.Combine(target, "setup", "register-shortcuts.cjs") + "\"", target, 60000, null));
    return ok;
  }
  static void Hidden(string file, string args, string folder, int wait, string[] unset) {
    var start = new ProcessStartInfo(file, args) { WorkingDirectory = folder, UseShellExecute = false, CreateNoWindow = true };
    start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
    using (var p = Process.Start(start)) if (!p.WaitForExit(wait)) throw new TimeoutException(file);
  }
  public static void RemoveTraces(string target) {
    foreach (string link in new[] { DesktopLink, StartLink, AutoStartLink })
      try { if (Ours(link, target)) File.Delete(link); } catch (Exception) {}
    try { if (Directory.Exists(StartMenu) && !Directory.EnumerateFileSystemEntries(StartMenu).Any()) Directory.Delete(StartMenu); } catch (Exception) {}
    try {
      using (var k = Registry.CurrentUser.OpenSubKey(UninstallKey)) {
        string p = k == null ? null : k.GetValue("InstallLocation") as string;
        if (p != null && !string.Equals(p.TrimEnd('\\'), target.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) return;
      }
      Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
    } catch (Exception) {}
  }

  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static bool RunningFrom(string target) {
    string prefix = Path.GetFullPath(target).TrimEnd('\\') + "\\";
    int self = Process.GetCurrentProcess().Id;
    foreach (var p in Process.GetProcesses()) {
      try {
        if (p.Id == self || p.Id < 8) continue;
        IntPtr h = OpenProcess(0x1000, false, p.Id);
        if (h == IntPtr.Zero) continue;
        try {
          var b = new StringBuilder(1024);
          int n = b.Capacity;
          if (QueryFullProcessImageName(h, 0, b, ref n) && b.ToString().StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return true;
        } finally { CloseHandle(h); }
      } catch (Exception) {} finally { p.Dispose(); }
    }
    return false;
  }
}

// ── The wizard ───────────────────────────────────────────────────────────────────────────────────
class Palette {
  public static readonly Color Back = Color.FromArgb(16, 15, 14), Card = Color.FromArgb(27, 25, 23), Line = Color.FromArgb(58, 53, 48);
  public static readonly Color Ink = Color.FromArgb(243, 238, 231), Quiet = Color.FromArgb(179, 174, 167), Cream = Color.FromArgb(237, 201, 169), Dark = Color.FromArgb(27, 23, 18);
}

class Base : Form {
  protected readonly Label Head = new Label(), Sub = new Label();
  protected readonly Panel Body = new Panel(), Foot = new Panel();
  protected readonly Button Primary = new Button(), Secondary = new Button(), Third = new Button();
  protected readonly float K;
  protected void ScaleBody() { foreach (Control c in Body.Controls) c.Scale(new SizeF(K, K)); }
  public Base() {
    Font = new Font("Segoe UI", 9.75f);
    // sizes below are at 100%; the font already follows the display's scale, the boxes follow here
    AutoScaleMode = AutoScaleMode.None;
    using (var g = CreateGraphics()) K = g.DpiX / 96f;
    ClientSize = new Size((int)(660 * K), (int)(500 * K));
    FormBorderStyle = FormBorderStyle.FixedSingle;
    MaximizeBox = false;
    StartPosition = FormStartPosition.CenterScreen;
    BackColor = Palette.Back;
    ForeColor = Palette.Ink;
    try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) {}
    var top = new Panel { Dock = DockStyle.Top, Height = 84, BackColor = Palette.Card };
    var picture = new PictureBox { Left = 22, Top = 18, Width = 48, Height = 48, SizeMode = PictureBoxSizeMode.Zoom };
    if (Icon != null) picture.Image = Icon.ToBitmap();
    Head.SetBounds(84, 16, 550, 30);
    Head.Font = new Font("Segoe UI Semibold", 14f);
    Head.ForeColor = Palette.Ink;
    Sub.SetBounds(85, 48, 550, 22);
    Sub.ForeColor = Palette.Quiet;
    top.Controls.AddRange(new Control[] { picture, Head, Sub });
    Foot.Dock = DockStyle.Bottom;
    Foot.Height = 62;
    Foot.BackColor = Palette.Card;
    Style(Third, false); Third.SetBounds(22, 14, 110, 34);
    Style(Secondary, false); Secondary.SetBounds(404, 14, 110, 34);
    Style(Primary, true); Primary.SetBounds(528, 14, 110, 34);
    Foot.Controls.AddRange(new Control[] { Third, Secondary, Primary });
    Body.Dock = DockStyle.Fill;
    Body.Padding = new Padding(22, 18, 22, 12);
    Controls.Add(Body);
    Controls.Add(top);
    Controls.Add(Foot);
    top.Scale(new SizeF(K, K));
    Foot.Scale(new SizeF(K, K));
  }
  protected static void Style(Button b, bool main) {
    b.FlatStyle = FlatStyle.Flat;
    b.FlatAppearance.BorderColor = main ? Palette.Cream : Palette.Line;
    b.BackColor = main ? Palette.Cream : Palette.Card;
    b.ForeColor = main ? Palette.Dark : Palette.Ink;
    b.UseVisualStyleBackColor = false;
  }
  protected Label Note(string text, int top, int height) {
    var l = new Label { Text = text, ForeColor = Palette.Quiet, AutoSize = false };
    l.SetBounds(22, top, 616, height);
    return l;
  }
  // a disabled flat button keeps a readable look
  protected void Enable(Button b, bool on) {
    b.Enabled = on;
    b.BackColor = !on ? Palette.Card : b == Primary ? Palette.Cream : Palette.Card;
    b.FlatAppearance.BorderColor = !on ? Palette.Line : b == Primary ? Palette.Cream : Palette.Line;
  }
}

class Wizard : Base {
  readonly Package package;
  readonly string version;
  readonly long need;
  int page;
  string folder = Shell.DefaultFolder();
  readonly CheckBox accept = new CheckBox(), desktop = new CheckBox(), startNow = new CheckBox();
  readonly TextBox folderBox = new TextBox();
  readonly RadioButton english = new RadioButton(), turkish = new RadioButton();
  readonly ComboBox docs = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
  readonly TextBox licence = new TextBox();
  readonly Label folderNote = new Label(), spaceNote = new Label(), workNote = new Label();
  readonly ProgressBar bar = new ProgressBar { Minimum = 0, Maximum = 100 };
  CancellationTokenSource cancel;
  bool working;
  public readonly string LogFile = Path.Combine(Path.GetTempPath(), "Charles-setup.log");

  public Wizard(Package package, string version, long need) {
    this.package = package;
    this.version = version;
    this.need = need;
    desktop.Checked = true;
    startNow.Checked = true;
    Primary.Click += delegate { Forward(); };
    Secondary.Click += delegate { if (page > 0 && !working) Show(page - 1); };
    Third.Click += delegate { Close(); };
    FormClosing += (s, e) => {
      if (page >= 4) return;
      if (working) {
        e.Cancel = true;
        if (Ask()) { Enable(Third, false); cancel.Cancel(); }
      } else if (!Ask()) e.Cancel = true;
    };
    english.CheckedChanged += delegate { if (english.Checked) { Tx.Turkish = false; Show(0); } };
    turkish.CheckedChanged += delegate { if (turkish.Checked) { Tx.Turkish = true; Show(0); } };
    Show(0);
  }
  bool Ask() { return MessageBox.Show(this, Tx.T("askCancel"), Tx.T("title"), MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes; }
  void Log(string text) { try { File.AppendAllText(LogFile, DateTime.Now.ToString("s") + " " + text + Environment.NewLine); } catch (Exception) {} }

  public void Show(int next) {
    page = next;
    Body.Controls.Clear();
    Text = Tx.T("title") + " · " + Label(version);
    Third.Text = Tx.T("cancel");
    Secondary.Text = Tx.T("back");
    Primary.Text = page == 2 ? Tx.T("install") : Tx.T("next");
    Third.Visible = Secondary.Visible = true;
    Enable(Third, true);
    Enable(Secondary, page > 0 && page < 3);
    Enable(Primary, true);
    if (page == 0) PageLanguage();
    else if (page == 1) PageLicense();
    else if (page == 2) PageFolder();
    else if (page == 3) PageWork();
    ScaleBody();
  }
  public static string Label(string v) {
    var m = Regex.Match(v ?? "", @"^(\d+\.\d+\.\d+)(?:-([a-z]+))?");
    if (!m.Success) return v ?? "";
    return "v" + m.Groups[1].Value + (m.Groups[2].Value == "rc" ? " Release Candidate" : m.Groups[2].Value == "beta" ? " Beta" : "");
  }
  void PageLanguage() {
    Head.Text = Tx.T("langHead");
    Sub.Text = Tx.T("langSub");
    english.Text = "English";
    turkish.Text = "Türkçe";
    english.AutoSize = turkish.AutoSize = true;
    english.Location = new Point(26, 34);
    turkish.Location = new Point(26, 70);
    english.ForeColor = turkish.ForeColor = Palette.Ink;
    english.Font = turkish.Font = new Font("Segoe UI", 11f);
    if (Tx.Turkish) { if (!turkish.Checked) turkish.Checked = true; } else if (!english.Checked) english.Checked = true;
    Body.Controls.AddRange(new Control[] { english, turkish });
  }
  static string Resource(string name) {
    using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
    using (var r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd();
  }
  void PageLicense() {
    Head.Text = Tx.T("licHead");
    Sub.Text = Tx.T("licSub");
    int y = 8;
    if (Tx.Turkish) { Body.Controls.Add(Note(Tx.T("licNote"), y, 40)); y += 42; }
    docs.Items.Clear();
    docs.Items.AddRange(new object[] { Tx.T("licDoc0"), Tx.T("licDoc1"), Tx.T("licDoc2") });
    docs.SetBounds(22, y, 616, 26);
    docs.SelectedIndexChanged -= ShowDoc;
    docs.SelectedIndexChanged += ShowDoc;
    licence.Multiline = true;
    licence.ReadOnly = true;
    licence.ScrollBars = ScrollBars.Vertical;
    licence.BackColor = Palette.Card;
    licence.ForeColor = Palette.Ink;
    licence.BorderStyle = BorderStyle.FixedSingle;
    licence.Font = new Font("Consolas", 9f);
    licence.SetBounds(22, y + 34, 616, 348 - y - 74);
    accept.Text = Tx.T("licAccept");
    accept.ForeColor = Palette.Ink;
    accept.AutoSize = true;
    accept.Location = new Point(22, 318);
    accept.CheckedChanged -= LicenseTicked;
    accept.CheckedChanged += LicenseTicked;
    Body.Controls.AddRange(new Control[] { docs, licence, accept });
    docs.SelectedIndex = 0;
    Enable(Primary, accept.Checked);
  }
  void LicenseTicked(object s, EventArgs e) { Enable(Primary, accept.Checked); }
  void ShowDoc(object s, EventArgs e) {
    licence.Text = Resource(new[] { "LICENSE.txt", "LICENSE-ASSETS.txt", "THIRD-PARTY-NOTICES.txt" }[Math.Max(0, docs.SelectedIndex)]).Replace("\r\n", "\n").Replace("\n", "\r\n");
  }
  void PageFolder() {
    Head.Text = Tx.T("dirHead");
    Sub.Text = Tx.T("dirSub");
    var label = Note(Tx.T("dirLabel"), 10, 22);
    folderBox.Text = folder;
    folderBox.BackColor = Palette.Card;
    folderBox.ForeColor = Palette.Ink;
    folderBox.BorderStyle = BorderStyle.FixedSingle;
    folderBox.SetBounds(22, 34, 500, 28);
    folderBox.TextChanged -= FolderChanged;
    folderBox.TextChanged += FolderChanged;
    var browse = new Button { Text = Tx.T("browse") };
    Style(browse, false);
    browse.SetBounds(532, 32, 106, 30);
    browse.Click += delegate {
      using (var d = new FolderBrowserDialog { SelectedPath = Directory.Exists(folderBox.Text) ? folderBox.Text : "", ShowNewFolderButton = true })
        if (d.ShowDialog(this) == DialogResult.OK) folderBox.Text = d.SelectedPath;
    };
    folderNote.ForeColor = Palette.Cream;
    folderNote.SetBounds(22, 74, 616, 44);
    spaceNote.ForeColor = Palette.Quiet;
    spaceNote.SetBounds(22, 122, 616, 22);
    var keep = Note(Tx.T("dirKeep"), 150, 22);
    desktop.Text = Tx.T("dirDesktop");
    desktop.ForeColor = Palette.Ink;
    desktop.AutoSize = true;
    desktop.Location = new Point(22, 190);
    Body.Controls.AddRange(new Control[] { label, folderBox, browse, folderNote, spaceNote, keep, desktop });
    FolderChanged(null, null);
  }
  void FolderChanged(object s, EventArgs e) {
    folder = folderBox.Text.Trim();
    string problem = Engine.CheckFolder(folder, need * 11 / 10);
    string text = problem;
    if (problem == null) {
      string old = Engine.InstalledVersion(folder);
      if (old != null) {
        int c = Engine.Compare(old, version);
        text = c == 0 ? Tx.T("dirSame", Label(old)) : c < 0 ? Tx.T("dirOlder", Label(old), Label(version)) : Tx.T("dirNewer", Label(old), Label(version));
      } else text = "";
    }
    folderNote.Text = text;
    long free = 0;
    try { free = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(folder))).AvailableFreeSpace; } catch (Exception) {}
    spaceNote.Text = Tx.T("dirSpace", Tx.Size(need), Tx.Size(free));
    Enable(Primary, problem == null);
  }
  void Forward() {
    if (page == 3) return;
    if (page == 4) { Close(); return; }
    if (page == 2) {
      if (Shell.RunningFrom(folder)) { folderNote.Text = Tx.T("errRunning"); return; }
      Show(3);
      return;
    }
    Show(page + 1);
  }
  void PageWork() {
    Head.Text = Tx.T("workHead");
    Sub.Text = Tx.T("workSub");
    bar.SetBounds(22, 60, 616, 22);
    bar.Value = 0;
    workNote.ForeColor = Palette.Quiet;
    workNote.SetBounds(22, 30, 616, 22);
    workNote.Text = Tx.T("stepCheck");
    Body.Controls.AddRange(new Control[] { workNote, bar });
    Enable(Primary, false);
    Enable(Secondary, false);
    cancel = new CancellationTokenSource();
    working = true;
    string target = Path.GetFullPath(folder).TrimEnd('\\');
    bool wantDesktop = desktop.Checked;
    string language = Tx.Turkish ? "tr" : "en";
    File.WriteAllText(LogFile, "Charles setup " + version + " → " + target + Environment.NewLine);
    var worker = new Thread(() => {
      Exception failure = null;
      bool shortcuts = true;
      try {
        var job = new Job { Target = target, OpenZip = package.Open, Sha = package.Sha, Cancel = cancel.Token, Log = Log };
        job.Report = (p, t) => BeginInvoke((Action)(() => { bar.Value = Math.Min(100, p); workNote.Text = t; }));
        Engine.Install(job);
        BeginInvoke((Action)(() => { Enable(Third, false); workNote.Text = Tx.T("stepFinish"); bar.Value = 96; }));
        string uninstaller = Path.Combine(target, "Uninstall Charles.exe");
        using (var from = new FileStream(package.File, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (var to = new FileStream(uninstaller, FileMode.Create, FileAccess.Write)) {
          var b = new byte[1 << 16];
          long left = package.Stub;
          int n;
          while (left > 0 && (n = from.Read(b, 0, (int)Math.Min(b.Length, left))) > 0) { to.Write(b, 0, n); left -= n; }
        }
        shortcuts = Shell.Finish(target, version, uninstaller, wantDesktop, language, Log);
      } catch (Exception e) { failure = e; Log("failed: " + e); }
      BeginInvoke((Action)(() => Finished(failure, shortcuts, target)));
    }) { IsBackground = false };
    worker.SetApartmentState(ApartmentState.STA); // WScript.Shell
    worker.Start();
  }
  void Finished(Exception failure, bool shortcuts, string target) {
    working = false;
    page = 4;
    Body.Controls.Clear();
    Third.Visible = false;
    Secondary.Visible = false;
    Enable(Primary, true);
    Primary.Text = Tx.T("finish");
    if (failure == null) {
      Head.Text = Tx.T("doneHead");
      Sub.Text = Tx.T("doneSub", target);
      startNow.Text = Tx.T("doneStart");
      startNow.ForeColor = Palette.Ink;
      startNow.AutoSize = true;
      startNow.Location = new Point(22, 30);
      Body.Controls.Add(startNow);
      if (!shortcuts) Body.Controls.Add(Note(Tx.T("doneNote", LogFile), 70, 44));
      Primary.Click += delegate {
        if (!startNow.Checked) return;
        try { Process.Start(new ProcessStartInfo(Path.Combine(target, "Charles.exe")) { WorkingDirectory = target, UseShellExecute = true }); } catch (Exception e) { Log("start: " + e.Message); }
      };
    } else if (failure is OperationCanceledException) {
      Head.Text = Tx.T("cancelledHead");
      Sub.Text = Tx.T("failSub");
    } else {
      Head.Text = Tx.T("failHead");
      Sub.Text = Tx.T("failSub");
      Body.Controls.Add(Note(failure is SetupError ? failure.Message : failure.GetType().Name + ": " + failure.Message, 24, 100));
      Body.Controls.Add(Note(Tx.T("failLog", LogFile), 130, 24));
    }
    ScaleBody();
  }
}

class Remover : Base {
  readonly string target;
  readonly CheckBox data = new CheckBox();
  readonly ProgressBar bar = new ProgressBar { Minimum = 0, Maximum = 100 };
  bool working;
  public Remover(string target) {
    this.target = target;
    Tx.Turkish = Thread.CurrentThread.CurrentUICulture.TwoLetterISOLanguageName == "tr";
    Text = Tx.T("uninstallTitle");
    Head.Text = Tx.T("unHead");
    Sub.Text = Tx.T("unFolder", target);
    Third.Visible = false;
    Primary.Text = Tx.T("unRemove");
    Secondary.Text = Tx.T("cancel");
    Secondary.Click += delegate { if (!working) Close(); };
    Primary.Click += delegate { Go(); };
    data.Text = Tx.T("unData");
    data.ForeColor = Palette.Ink;
    data.SetBounds(22, 24, 616, 44);
    data.Checked = false;
    Body.Controls.Add(data);
    Body.Controls.Add(Note(Tx.T("unKeep"), 74, 44));
    ScaleBody();
    FormClosing += (s, e) => { if (working) e.Cancel = true; };
  }
  void Go() {
    if (Shell.RunningFrom(target)) { MessageBox.Show(this, Tx.T("errRunning"), Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
    bool removeData = data.Checked;
    if (removeData && MessageBox.Show(this, Tx.T("unConfirm"), Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
    working = true;
    Enable(Primary, false);
    Enable(Secondary, false);
    Body.Controls.Clear();
    bar.SetBounds(22, 60, 616, 22);
    Body.Controls.Add(bar);
    ScaleBody();
    var worker = new Thread(() => {
      string message;
      try {
        bool gone = Engine.Uninstall(target, (p, t) => BeginInvoke((Action)(() => bar.Value = Math.Min(100, p))));
        Shell.RemoveTraces(target);
        if (removeData && Directory.Exists(Shell.DataFolder)) Engine.Remove(Shell.DataFolder);
        message = (removeData ? Tx.T("unDone") : Tx.T("unDoneKept")) + (gone ? "" : "\n" + Tx.T("unLeft", target));
      } catch (Exception e) { message = e.Message; }
      BeginInvoke((Action)(() => {
        working = false;
        Body.Controls.Clear();
        Body.Controls.Add(Note(message, 30, 80));
        ScaleBody();
        Secondary.Visible = false;
        Enable(Primary, true);
        Primary.Text = Tx.T("close");
        Primary.Click += delegate { Close(); };
      }));
    });
    worker.SetApartmentState(ApartmentState.STA);
    worker.Start();
  }
}

static class Program {
  [STAThread]
  static int Main(string[] args) {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Tx.Turkish = Thread.CurrentThread.CurrentUICulture.TwoLetterISOLanguageName == "tr";
    string self = Assembly.GetExecutingAssembly().Location;
    if (!Environment.Is64BitOperatingSystem || Environment.OSVersion.Version.Major < 6) { MessageBox.Show(Tx.T("errWin"), "Charles"); return 1; }
    string remove = args.FirstOrDefault(a => a.StartsWith("/uninstall", StringComparison.OrdinalIgnoreCase));
    if (remove != null) return Uninstall(self, remove);
    Package package = Package.Find(self);
    if (package == null) { MessageBox.Show(Tx.T("errDamaged"), Tx.T("title"), MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
    string version;
    long need;
    try {
      using (var s = package.Open())
      using (var zip = new ZipArchive(s, ZipArchiveMode.Read)) {
        version = Engine.PackageVersion(zip);
        need = zip.Entries.Sum(e => e.Length);
        Engine.MaxTarget = Math.Min(Engine.MaxTarget, Engine.RoomFor(zip));
      }
    } catch (Exception) { MessageBox.Show(Tx.T("errDamaged"), Tx.T("title"), MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
    Application.Run(new Wizard(package, version, need));
    return 0;
  }
  // The folder cannot be removed while this program runs from it: a copy in Temp does the work, and
  // goes away a moment after it ends.
  static int Uninstall(string self, string arg) {
    string given = arg.Contains(":") && arg.Length > arg.IndexOf(':') + 1 ? arg.Substring(arg.IndexOf(':') + 1).Trim('"') : null;
    string target = given ?? Path.GetDirectoryName(self);
    if (given == null) {
      string copy = Path.Combine(Path.GetTempPath(), "charles-uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
      File.Copy(self, copy);
      Process.Start(new ProcessStartInfo(copy, "/uninstall:\"" + target + "\"") { UseShellExecute = false, WorkingDirectory = Path.GetTempPath() });
      return 0;
    }
    if (Engine.InstalledVersion(target) == null) { MessageBox.Show(Tx.T("unNotCharles", target), Tx.T("uninstallTitle"), MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
    Application.Run(new Remover(target));
    var bye = new ProcessStartInfo("cmd.exe", "/c ping -n 3 127.0.0.1 >nul & del /q \"" + self + "\"") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetTempPath() };
    try { Process.Start(bye); } catch (Exception) {}
    return 0;
  }
}
}
