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
[assembly: AssemblyTitle("Charles")]
[assembly: AssemblyProduct("ProjectCharles")]
[assembly: AssemblyDescription("Charles desktop assistant")]
[assembly: AssemblyVersion("0.8.3.0")]
[assembly: AssemblyFileVersion("0.8.3.0")]
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
      if (!EndUpdateResource(update,false)) throw new Win32Exception();
      update=IntPtr.Zero;
    } finally { if (update!=IntPtr.Zero) EndUpdateResource(update,true); }
  }
  static string Runtime(string root, string original) {
    byte[] ico=File.ReadAllBytes(Path.Combine(root,"public","charles.ico"));
    var info=new FileInfo(original);
    string key;
    using (var hash=SHA256.Create()) {
      // Runtime replacement and logo updates each get a new Shell cache identity.
      string stamp="host-v1:"+info.Length+":"+info.LastWriteTimeUtc.Ticks+":"+Hex(hash.ComputeHash(ico));
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
      Process.Start(start); return 0;
    } catch (Exception e) { MessageBox.Show(e.Message, "Charles", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
  }
}
