// v0.9.25: an SVG drawing (app/ai/provider-drawing.cjs cleans it first) → a PNG, drawn by Chromium in
// a hidden off-screen page. The page has its own in-memory session that may load nothing from the
// network, and the SVG is shown as an <img>, where scripts never run and outside files never load.
// One drawing at a time; each takes a fresh page.

function createSvgRenderer({ BrowserWindow, session, timeoutMs = 20000 }) {
  let queue = Promise.resolve();
  let ses = null;
  const sessionFor = () => {
    if (ses) return ses;
    ses = session.fromPartition('charles-svg-render', { cache: false });
    ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(?:data|about|blob):/i.test(details.url) }));
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    return ses;
  };
  async function render(svg) {
    const win = new BrowserWindow({
      show: false,
      width: 64,
      height: 64,
      webPreferences: {
        session: sessionFor(),
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });
    let timer;
    try {
      await win.loadURL('about:blank');
      const url = 'data:image/svg+xml;base64,' + Buffer.from(String(svg), 'utf8').toString('base64');
      const job = win.webContents.executeJavaScript(
        `(async () => {
          const img = new Image();
          img.src = ${JSON.stringify(url)};
          await img.decode();
          const w = Math.min(2048, img.naturalWidth || 1024), h = Math.min(2048, img.naturalHeight || 1024);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d');
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, w, h);
          g.drawImage(img, 0, 0, w, h);
          return c.toDataURL('image/png');
        })()`,
        true,
      );
      const data = await Promise.race([
        job,
        new Promise((_, reject) => (timer = setTimeout(() => reject(Error('timeout')), timeoutMs))),
      ]);
      if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/.test(data)) throw Error('empty');
      return data;
    } finally {
      clearTimeout(timer);
      // closing the last window quits Charles (main.cjs window-all-closed): never this one alone
      if (!win.isDestroyed()) {
        if (BrowserWindow.getAllWindows().length > 1) win.destroy();
        else {
          win.webContents.loadURL('about:blank').catch(() => {});
          setTimeout(() => {
            if (!win.isDestroyed() && BrowserWindow.getAllWindows().length > 1) win.destroy();
          }, 60000).unref?.();
        }
      }
    }
  }
  return (svg) => {
    const job = queue.then(() => render(svg));
    queue = job.catch(() => {});
    return job;
  };
}

module.exports = { createSvgRenderer };
