// v0.9.14: a picture of one display for the area capture and the colour picker.
//
// Chromium's desktopCapturer reads the screen through DXGI; with Windows HDR on, its thumbnail
// comes out over-saturated ("cırtlak") and its colours are wrong. GDI (Graphics.CopyFromScreen)
// gets the desktop as SDR applications see it, which is what the user sees for normal windows.
//
// Speed and size: v0.9.20: charles-helper.exe --grab starts in moments, takes pictures on request
// and goes after REST_MS; nothing waits while no picture is wanted. Each picture is one line on its
// stdin ("x y w h") and comes back on stdout as raw BGRA pixels behind an 8-byte header (width,
// height) — no PNG encoding, nothing written to disk. Anywhere other than Windows, or if the
// helper fails, desktopCapturer is used as before.
const { desktopCapturer, nativeImage, screen } = require('electron');
const REST_MS = 60000;

/** The display's rectangle in physical screen pixels (what GDI uses). */
function physicalRect(display) {
  if (typeof screen.dipToScreenRect === 'function') return screen.dipToScreenRect(null, display.bounds);
  const f = display.scaleFactor || 1;
  return { x: Math.round(display.bounds.x * f), y: Math.round(display.bounds.y * f), width: Math.round(display.bounds.width * f), height: Math.round(display.bounds.height * f) };
}

/** The helper in its picture mode, for as long as pictures are being taken. */
class Grabber {
  constructor(spawnImpl = () => require('./helper-hub.cjs').startHelper(['--grab'])) {
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
        child = this.spawn();
      } catch (e) {
        this.ready = null;
        return reject(e);
      }
      this.child = child;
      let started = false;
      const fail = (e) => {
        if (this.child && this.child !== child) return; // an older helper going away
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
  /** Keeps the helper for a while yet; with nothing asked it goes, and comes back when needed. */
  keep() {
    clearTimeout(this.rest);
    this.rest = setTimeout(() => !this.waiting && this.stop(), REST_MS);
    this.rest.unref?.();
  }
  grab(r) {
    const job = this.queue.then(async () => {
      this.keep();
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
    clearTimeout(this.rest);
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
module.exports = { grabDisplay, physicalRect, stopGrabber, Grabber };
