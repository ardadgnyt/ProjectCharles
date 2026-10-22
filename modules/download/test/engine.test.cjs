const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { DownloadEngine, validURL, time, clipRange, safeName, candidateURL, run } = require('../host/engine.cjs');
// The module does not ship yt-dlp/FFmpeg. Point CHARLES_DOWNLOAD_TOOLS at Charles' tools/download
// folder to run the real media tests; otherwise they are skipped.
const toolDir = process.env.CHARLES_DOWNLOAD_TOOLS || '';
const tools = { ytdlp: toolDir ? path.join(toolDir, 'yt-dlp.exe') : '', ffmpeg: toolDir ? path.join(toolDir, 'ffmpeg.exe') : '', node: process.execPath };
const waitFor = async (predicate, ms = 20000) => {
  const end = Date.now() + ms;
  while (!predicate()) { if (Date.now() > end) throw Error('Bekleme süresi doldu.'); await new Promise(r => setTimeout(r, 40)); }
};
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-download-test-'));
  const engine = new DownloadEngine({ dataDir: path.join(root, 'data'), outputDir: path.join(root, 'out'), tools, concurrency: 1 });
  return { root, engine };
}
test('URL, zaman ve dosya adları sınırları', () => {
  assert.equal(time('01:02:03.5'), 3723.5);
  assert.equal(time('90'), 90);
  for (const s of ['', '-2', '1:99', 'NaN']) assert.throws(() => time(s));
  assert.throws(() => clipRange(5, 3, 10));
  assert.throws(() => clipRange(0, 11, 10));
  assert.deepEqual(clipRange('00:01', '00:03', 5), { start: 1, end: 3 });
  for (const s of ['file:///C:/Windows', 'javascript:alert(1)', 'https://user:password@example.com']) assert.throws(() => validURL(s));
  assert.equal(candidateURL('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(candidateURL('https://example.com/report.pdf?x=1'), 'https://example.com/report.pdf?x=1');
  assert.equal(candidateURL('https://example.com/account'), null);
  assert.equal(candidateURL('gizli metin'), null);
  assert.equal(safeName('a<>:"/\\|?*.mp4'), 'a_________.mp4');
  assert.match(safeName('CON'), /^indirme_/);
});
test('Doğrudan indirme: duraklat/devam, HTTP Range ve byte bütünlüğü', async t => {
  const payload = crypto.randomBytes(768 * 1024), ranges = [];
  const server = http.createServer((req, res) => {
    const start = Number((/bytes=(\d+)-/.exec(req.headers.range || '') || [0, 0])[1]);
    ranges.push(start);
    res.writeHead(start ? 206 : 200, { 'Content-Length': payload.length - start, 'Content-Type': 'application/octet-stream', ETag: '"fixture-v1"', ...(start ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}) });
    let position = start;
    const interval = setInterval(() => {
      if (position >= payload.length) { clearInterval(interval); res.end(); return; }
      res.write(payload.subarray(position, position += 8192));
    }, 8);
    res.on('close', () => clearInterval(interval));
  });
  server.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const { engine } = fixture(); t.after(async () => { await engine.shutdown(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const j = engine.enqueue({ url: `http://127.0.0.1:${server.address().port}/sample.zip`, format: 'file' });
  await waitFor(() => j.bytes > 64000);
  engine.control(j.id, 'pause'); await waitFor(() => j.status === 'paused');
  const size = fs.statSync(j.output + '.part').size; assert(size > 0 && size < payload.length);
  engine.control(j.id, 'resume'); await waitFor(() => ['done', 'error'].includes(j.status));
  assert.equal(j.status, 'done', j.error);
  assert.deepEqual(fs.readFileSync(j.output), payload);
  assert(ranges.some(n => n > 0));
  assert(!fs.existsSync(j.output + '.part'));
});
test('Devam isteği yok sayıldığında dosya baştan güvenle yazılır; 404 başarılı sayılmaz', async t => {
  const payload = Buffer.from('hello charles');
  const server = http.createServer((req, res) => {
    if (req.url === '/missing.zip') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Length': payload.length }); res.end(payload);
  });
  server.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const { engine } = fixture(); engine.concurrency = 0;
  t.after(async () => { await engine.shutdown(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const j = engine.enqueue({ url: url + '/file.zip', format: 'file' });
  fs.mkdirSync(path.dirname(j.output), { recursive: true }); fs.writeFileSync(j.output + '.part', 'old');
  engine.concurrency = 1; engine.pump(); await waitFor(() => ['done','error'].includes(j.status));
  assert.equal(j.status, 'done', j.error); assert.deepEqual(fs.readFileSync(j.output), payload);
  const bad = engine.enqueue({ url: url + '/missing.zip', format: 'file' });
  await waitFor(() => bad.status === 'error'); assert.match(bad.error, /404/); assert(!fs.existsSync(bad.output));
});
test('Kuyruk ve yeniden açılış: iptal, kalıcılık, otomatik başlamayan yarım iş', async t => {
  const { root, engine } = fixture(); engine.concurrency = 0;
  t.after(() => engine.shutdown());
  const j = engine.enqueue({ url: 'https://example.com/a.zip', format: 'file' });
  engine.control(j.id, 'cancel'); assert.equal(j.status, 'canceled');
  const second = engine.enqueue({ url: 'https://example.com/b.zip', format: 'file' });
  const restored = new DownloadEngine({ dataDir: path.join(root, 'data'), outputDir: path.join(root, 'out'), tools });
  t.after(() => restored.shutdown());
  assert.equal(restored.jobs.find(x => x.id === second.id).status, 'paused');
  assert.throws(() => restored.enqueue({ url: second.url, format: 'file', clip: { start: 0, end: 1 } }));
});
test('Gerçek yt-dlp + FFmpeg: MP4 video kesiti ve MP3 ses kesiti', { timeout: 120000, skip: !fs.existsSync(tools.ytdlp) || !fs.existsSync(tools.ffmpeg) }, async t => {
  const { root, engine } = fixture();
  const media = path.join(root, 'fixture.mp4');
  await run(tools.ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart', media], { timeout: 20000 });
  const data = fs.readFileSync(media);
  const server = http.createServer((req, res) => {
    const start = Number((/bytes=(\d+)-/.exec(req.headers.range || '') || [0, 0])[1]);
    res.writeHead(start ? 206 : 200, { 'Content-Type':'video/mp4', 'Content-Length':data.length - start, 'Accept-Ranges':'bytes', ...(start ? { 'Content-Range':`bytes ${start}-${data.length-1}/${data.length}` } : {}) });
    res.end(data.subarray(start));
  });
  server.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { await engine.shutdown(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const url = `http://127.0.0.1:${server.address().port}/fixture.mp4`;
  const info = await engine.inspect(url); assert(info.title);
  assert.equal(info.kind, 'video', 'direct MP4 must remain selectable as video');
  assert(info.duration >= 3.9 && info.duration <= 4.1);
  for (const format of ['mp4', 'mp3']) {
    const job = engine.enqueue({ url, format, clip: { start: 1, end: 2.5 }, quality: 720 });
    await waitFor(() => ['done','error'].includes(job.status), 45000);
    assert.equal(job.status, 'done', job.error);
    assert(fs.statSync(job.output).size > 1000);
    // Fully decode each result. Verify duration from ffmpeg's output clock, not file naming.
    const decoded = await run(tools.ffmpeg, ['-hide_banner','-loglevel','error','-i',job.output,'-progress','pipe:1','-f','null','-'], { timeout: 15000 });
    const times = [...decoded.matchAll(/out_time_us=(\d+)/g)].map(x => Number(x[1]) / 1e6);
    const seconds = Math.max(...times); assert(seconds >= 1.4 && seconds < 1.7, `Unexpected duration ${seconds}`);
  }
});

test('Remote clip seeks with HTTP Range and transfers less than the full video', {timeout:120000,skip:!fs.existsSync(tools.ytdlp)||!fs.existsSync(tools.ffmpeg)},async t=>{
 const {root,engine}=fixture();const file=path.join(root,'long.mp4');
 await run(tools.ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','90','-c:v','libx264','-preset','ultrafast','-crf','23','-g','24','-movflags','+faststart',file],{timeout:45000});
 const data=fs.readFileSync(file);let sent=0;const ranges=[];
 const server=http.createServer((req,res)=>{
  const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');const start=m?Number(m[1]):0,end=m&&m[2]?Math.min(data.length-1,Number(m[2])):data.length-1;ranges.push(start);
  res.writeHead(m?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(m?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})});
  if(req.method==='HEAD'){res.end();return;}let offset=start;
  const timer=setInterval(()=>{if(offset>end){clearInterval(timer);res.end();return;}const next=Math.min(end+1,offset+16384);sent+=next-offset;res.write(data.subarray(offset,next));offset=next;},5);res.on('close',()=>clearInterval(timer));
 });server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await engine.shutdown();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const job=engine.enqueue({url:`http://127.0.0.1:${server.address().port}/long.mp4`,format:'mp4',clip:{start:45,end:47},quality:720});
 await waitFor(()=>['done','error'].includes(job.status),60000);assert.equal(job.status,'done',job.error);
 assert(ranges.some(x=>x>data.length/3),'Must seek into the remote media');assert(sent<data.length*.65,`Downloaded ${sent} of ${data.length} bytes`);
 const decoded=await run(tools.ffmpeg,['-hide_banner','-loglevel','error','-i',job.output,'-progress','pipe:1','-f','null','-']);
 const secs=Math.max(...[...decoded.matchAll(/out_time_us=(\d+)/g)].map(x=>Number(x[1])/1e6));assert(secs>=1.9&&secs<2.2);
 console.log(JSON.stringify({clipSeconds:secs,transferred:sent,sourceBytes:data.length}));
});
