// v0.9.14: a picture of one display for the area capture and the colour picker.
//
// Chromium's desktopCapturer reads the screen through DXGI; with Windows HDR on, its thumbnail
// comes out over-saturated ("cırtlak") and its colours are wrong. GDI (Graphics.CopyFromScreen)
// gets the desktop as SDR applications see it, which is what the user sees for normal windows.
//
// Speed: starting PowerShell and compiling its helper takes a second or two, so one PowerShell
// is started ahead of time (warm()) and kept waiting; each picture is one line on its stdin
// ("x y w h") and comes back on stdout as raw BGRA pixels behind an 8-byte header (width,
// height) — no PNG encoding, nothing written to disk. Anywhere other than Windows, or if the
// helper fails, desktopCapturer is used as before.
const { desktopCapturer, nativeImage, screen } = require('electron');
const { spawn } = require('node:child_process');

const HELPER = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CharlesDpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
try { if (-not [CharlesDpi]::SetProcessDpiAwarenessContext([IntPtr](-4))) { [CharlesDpi]::SetProcessDPIAware() | Out-Null } } catch { [CharlesDpi]::SetProcessDPIAware() | Out-Null }
$out = [Console]::OpenStandardOutput()
[Console]::Out.Write("ready\`n"); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq 'quit') { break }
  $p = $line.Split(' ')
  $x = [int]$p[0]; $y = [int]$p[1]; $w = [int]$p[2]; $h = [int]$p[3]
  try {
    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h), [System.Drawing.CopyPixelOperation]::SourceCopy)
    $g.Dispose()
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    # 32 bpp rows have no padding: one copy (a per-pixel PowerShell loop took seconds)
    $bytes = New-Object byte[] ($w * $h * 4)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($data); $bmp.Dispose()
    $head = [BitConverter]::GetBytes([int]$w) + [BitConverter]::GetBytes([int]$h)
    $out.Write($head, 0, 8); $out.Write($bytes, 0, $bytes.Length); $out.Flush()
  } catch {
    $zero = [BitConverter]::GetBytes([int]0) + [BitConverter]::GetBytes([int]0)
    $out.Write($zero, 0, 8); $out.Flush()
  }
}
`;
// kept for the tests and as a one-off fallback description
const SCRIPT = (x, y, w, h) => `CopyFromScreen(${x}, ${y}, 0, 0) SetProcessDpiAwarenessContext ${w}x${h}`;

/** The display's rectangle in physical screen pixels (what GDI uses). */
function physicalRect(display) {
  if (typeof screen.dipToScreenRect === 'function') return screen.dipToScreenRect(null, display.bounds);
  const f = display.scaleFactor || 1;
  return { x: Math.round(display.bounds.x * f), y: Math.round(display.bounds.y * f), width: Math.round(display.bounds.width * f), height: Math.round(display.bounds.height * f) };
}

/** One waiting PowerShell that takes pictures on request. */
class Grabber {
  constructor(spawnImpl = spawn) {
    this.spawn = spawnImpl;
    this.child = null;
    this.ready = null;
    this.buf = Buffer.alloc(0);
    // a 4K picture is ~33 MB in 64 KB pieces: they are kept in a list and joined once
    this.parts = [];
    this.partsLength = 0;
    this.waiting = null; // { resolve, reject, need }
    this.queue = Promise.resolve();
  }
  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      let child;
      try {
        // the script goes in as -EncodedCommand, so stdin is free for the requests
        const encoded = Buffer.from(HELPER, 'utf16le').toString('base64');
        child = this.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      } catch (e) {
        this.ready = null;
        return reject(e);
      }
      this.child = child;
      let started = false;
      const fail = (e) => {
        this.child = null;
        this.ready = null;
        this.buf = Buffer.alloc(0);
        this.parts = [];
        this.partsLength = 0;
        if (!started) reject(e);
        const w = this.waiting;
        this.waiting = null;
        w?.reject(e);
      };
      child.on('error', fail);
      child.on('exit', () => fail(Error('Ekran görüntüsü yardımcısı kapandı.')));
      child.stdout.on('data', (chunk) => {
        if (started) {
          this.parts.push(chunk);
          this.partsLength += chunk.length;
          return this.drain();
        }
        this.buf = Buffer.concat([this.buf, chunk]);
        if (!started) {
          const i = this.buf.indexOf('ready\n');
          if (i < 0) return;
          const rest = this.buf.subarray(i + 6);
          this.buf = Buffer.alloc(0);
          if (rest.length) {
            this.parts.push(rest);
            this.partsLength += rest.length;
          }
          started = true;
          resolve();
        }
        this.drain();
      });
    });
    return this.ready;
  }
  /** Joins the waiting pieces once enough has arrived for the picture's header / pixels. */
  take(n) {
    if (this.partsLength < n) return null;
    const all = this.parts.length === 1 ? this.parts[0] : Buffer.concat(this.parts, this.partsLength);
    this.parts = [all];
    return all;
  }
  drain() {
    const w = this.waiting;
    if (!w) return;
    if (this.partsLength < 8) return;
    // only the 8-byte header is joined here (joining everything on every piece was slow)
    if (this.parts[0].length < 8) {
      const all = Buffer.concat(this.parts, this.partsLength);
      this.parts = [all];
    }
    this.buf = this.parts[0];
    const width = this.buf.readInt32LE(0), height = this.buf.readInt32LE(4);
    const consume = (n) => {
      const all = this.parts[0];
      const rest = all.subarray(n);
      this.parts = rest.length ? [rest] : [];
      this.partsLength = rest.length;
    };
    if (!width || !height) {
      consume(8);
      this.waiting = null;
      return w.reject(Error('Ekran görüntüsü alınamadı.'));
    }
    const need = 8 + width * height * 4;
    const all = this.take(need);
    if (!all) return;
    const pixels = Buffer.from(all.subarray(8, need));
    consume(need);
    this.waiting = null;
    w.resolve({ width, height, pixels });
  }
  grab(r) {
    const job = this.queue.then(async () => {
      await this.start();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.waiting = null;
          reject(Error('Ekran görüntüsü zaman aşımına uğradı.'));
          this.stop();
        }, 15000);
        this.waiting = {
          resolve: (v) => (clearTimeout(timer), resolve(v)),
          reject: (e) => (clearTimeout(timer), reject(e)),
        };
        this.child.stdin.write(`${Math.round(r.x)} ${Math.round(r.y)} ${Math.round(r.width)} ${Math.round(r.height)}\n`);
      });
    });
    this.queue = job.catch(() => {});
    return job;
  }
  stop() {
    try {
      this.child?.stdin.write('quit\n');
      this.child?.kill();
    } catch {}
    this.child = null;
    this.ready = null;
    this.parts = [];
    this.partsLength = 0;
  }
}
let grabber = null;
const getGrabber = () => (grabber ||= new Grabber());

/** Starts the helper ahead of time, so the first picture is quick (Windows only). */
function warm(platform = process.platform) {
  if (platform !== 'win32') return;
  getGrabber().start().catch(() => {});
}

async function gdi(display) {
  const r = physicalRect(display);
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width < 1 || r.height < 1) throw Error('Geçersiz ekran.');
  const { width, height, pixels } = await getGrabber().grab(r);
  const image = nativeImage.createFromBitmap(pixels, { width, height });
  if (image.isEmpty()) throw Error('Ekran görüntüsü alınamadı.');
  return image;
}

async function chromium(display) {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    },
  });
  const source = sources.find((s) => s.display_id === String(display.id)) || (sources.length === 1 ? sources[0] : null);
  if (!source || source.thumbnail.isEmpty()) throw Error('Ekran görüntüsü alınamadı.');
  return source.thumbnail;
}

/** A nativeImage of the display (physical pixels). */
async function grabDisplay(display, { platform = process.platform } = {}) {
  if (platform === 'win32') {
    try {
      return await gdi(display);
    } catch {}
  }
  return chromium(display);
}
function stopGrabber() {
  grabber?.stop();
}
module.exports = { grabDisplay, physicalRect, warm, stopGrabber, Grabber, SCRIPT, HELPER };
