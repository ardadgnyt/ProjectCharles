// Launch with Electron. Exercises the actual sandbox/preload/IPC/host, using an isolated profile.
const { app, BrowserWindow, session, ipcMain, dialog, shell, net, screen, protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const hostRoot = 'C:\\Project Charles\\ProjectCharles v0.8.0 Beta';
const output = path.join(root, '.test-output');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'charles-download-ui-')));
fs.mkdirSync(path.join(app.getPath('userData'), 'downloads'), { recursive: true });
app.setPath('downloads', path.join(app.getPath('userData'), 'downloads'));
protocol.registerSchemesAsPrivileged([{ scheme:'charles-module', privileges:{ standard:true, secure:true, supportFetchAPI:true } }]);
app.commandLine.appendSwitch('disable-gpu');
const wait = ms => new Promise(r => setTimeout(r, ms));
const trace = text => fs.appendFileSync(path.join(output, 'ui-trace.log'), new Date().toISOString() + ' ' + text + '\n');
trace('boot');
setTimeout(() => { trace('timeout'); app.exit(2); }, 90000).unref();
app.whenReady().then(async () => {
  let server, host;
  const errors = [], results = [];
  try {
    trace('app ready');
    const { ModuleRegistry } = require(path.join(hostRoot, 'app/modules/registry.cjs'));
    const { readFolder } = require(path.join(hostRoot, 'app/modules/package.cjs'));
    const registry = new ModuleRegistry({ userData: app.getPath('userData') });
    const prepared = registry.prepare(readFolder(path.join(root, 'dist')), { kind:'zip' });
    registry.install(prepared.token);
    let moduleWindow;
    class TestWindow extends BrowserWindow {
      constructor(options) { super({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true, backgroundThrottling: false } }); moduleWindow = this; }
      show() {}
    }
    host = require(path.join(hostRoot, 'app/modules/host.cjs')).createModuleHost({
      registry, electron:{ BrowserWindow: TestWindow, session, ipcMain, dialog, shell, net, screen },
      deps:{ charlesVersion:'0.8.1-beta.1', language:()=>'tr', notify:()=>{}, onChange:()=>{}, emote:()=>{} },
    });
    host.open('download');
    trace('host open');
    const win = moduleWindow;
    if (!win) throw Error('Module window missing.');
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
    if (win.webContents.isLoading()) await Promise.race([new Promise((r, reject) => { win.webContents.once('did-finish-load', r); win.webContents.once('did-fail-load', (_e,code,description)=>reject(Error(code+':'+description))); }),wait(15000).then(()=>{throw Error('Page load timeout: '+win.webContents.getURL());})]);
    trace('page loaded');
    await wait(600);
    win.hide();
    const evaluate = script => win.webContents.executeJavaScript(script, true);
    const initial = await evaluate(`({ready:document.querySelector('#engine').textContent, notice:document.querySelector('#notice').textContent, width:document.documentElement.scrollWidth, viewport:innerWidth})`);
    trace('evaluated '+JSON.stringify(initial));
    if (!initial.ready.includes('Motor hazır')) throw Error('Host not ready: ' + JSON.stringify(initial));
    results.push({ check:'real preload IPC ready', ...initial });
    fs.writeFileSync(path.join(output,'ui-empty.png'), (await win.webContents.capturePage(undefined, { stayHidden:true, stayAwake:true })).toPNG());
    const { run } = require('../host/engine.cjs');
    const media = path.join(output, 'ui-fixture.mp4');
    if (!fs.existsSync(media)) await run(path.join(process.env.CHARLES_DOWNLOAD_TOOLS || path.join(hostRoot, 'tools', 'download'), 'ffmpeg.exe'), ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',media]);
    const buffer = fs.readFileSync(media);
    server = http.createServer((req, res) => {
      res.writeHead(200, {'Content-Type':'video/mp4','Content-Length':buffer.length}); res.end(buffer);
    });
    server.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
    const url = `http://127.0.0.1:${server.address().port}/Charles-test-video.mp4`;
    await evaluate(`document.querySelector('#url').value=${JSON.stringify(url)}; document.querySelector('#link-form').requestSubmit();`);
    for (let i=0;i<100;i++) { if (await evaluate(`!document.querySelector('#media').hidden`)) break; await wait(200); }
    const mediaState = await evaluate(`({hidden:document.querySelector('#media').hidden,title:document.querySelector('#title').textContent,notice:document.querySelector('#notice').textContent})`);
    if (mediaState.hidden) throw Error('Inspect failed: '+JSON.stringify(mediaState));
    if (await evaluate(`document.querySelector('#video').disabled`)) throw Error('Direct video incorrectly classified as audio.');
    await evaluate(`document.querySelector('#video').click();`);
    await evaluate(`document.querySelector('#cut-toggle').click(); document.querySelector('#start').value='00:01';document.querySelector('#end').value='00:03';document.querySelector('#end').dispatchEvent(new Event('change'));`);
    await wait(100);
    fs.writeFileSync(path.join(output,'ui-clip.png'), (await win.webContents.capturePage(undefined, { stayHidden:true, stayAwake:true })).toPNG());
    results.push({check:'inspect and clip controls', ...mediaState});
    await evaluate(`document.querySelector('#download').click();`);
    let snapshot;
    for (let i=0;i<150;i++) {
      snapshot = await host.call('download','download.state');
      if (snapshot.jobs.some(j=>['done','error'].includes(j.status))) break;
      await wait(200);
    }
    const job=snapshot.jobs[0];
    if (!job || job.status!=='done') throw Error('UI download failed: '+JSON.stringify(job));
    if (job.format !== 'mp4' || !job.output.endsWith('.mp4')) throw Error('UI produced the wrong media format.');
    await wait(1300);
    fs.writeFileSync(path.join(output,'ui-complete.png'), (await win.webContents.capturePage(undefined, { stayHidden:true, stayAwake:true })).toPNG());
    results.push({check:'UI enqueue -> real MP4 completion',status:job.status,bytes:job.bytes});
    const compact = BrowserWindow.getAllWindows().find(w=>w!==win && w.webContents.getURL().includes('compact=1'));
    if (compact) {
      await wait(500);
      fs.writeFileSync(path.join(output,'ui-compact.png'),(await compact.webContents.capturePage()).toPNG());
      results.push({check:'compact window',url:compact.webContents.getURL()});
    }
    win.setSize(700,580); await wait(300);
    const narrow=await evaluate(`({width:document.documentElement.scrollWidth,viewport:innerWidth})`);
    if(narrow.width>narrow.viewport) throw Error('Horizontal overflow: '+JSON.stringify(narrow));
    results.push({check:'700px layout',...narrow});
    let denied=false;
    try { await host.call('frp','download.clipboard'); } catch { denied=true; }
    if(!denied) throw Error('Other module access not denied.');
    results.push({check:'other module denied'});
    fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify({ok:true,results,errors},null,2));
  } catch (e) {
    fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify({ok:false,error:e.stack,results,errors},null,2));
    process.exitCode=1;
  } finally {
    server?.closeAllConnections(); server?.close();
    host?.closeAll();
    app.quit();
  }
});
