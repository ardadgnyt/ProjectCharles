// Standalone tool setup for a ProjectCharles source checkout (Windows x64).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const toolDir = path.resolve(__dirname, '..', 'tools', 'download');
const FF_SHA256 = 'e9fd5e711debab9d680955fc1e38a2c1160fd280b144476cc3f62bc43ef49db1';
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw Error(`HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function setup() {
  fs.mkdirSync(toolDir, { recursive:true });
  const ytBase='https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
  const ffUrl='https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64.gz';
  const sums=(await get(ytBase+'SHA2-256SUMS')).toString('utf8');
  const hash=sums.split(/\r?\n/).find(l=>/\s+\*?yt-dlp\.exe$/.test(l))?.trim().split(/\s+/)[0];
  if(!hash)throw Error('yt-dlp SHA256 listesinde Windows dosyası yok.');
  for(const [name,url,expected,gzip] of [['yt-dlp.exe',ytBase+'yt-dlp.exe',hash,false],['ffmpeg.exe',ffUrl,FF_SHA256,true]]) {
    const file=path.join(toolDir,name);
    if(fs.existsSync(file)&&crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===expected){console.log(name+' güncel.');continue;}
    console.log(name+' indiriliyor…');
    const response=await get(url),data=gzip?zlib.gunzipSync(response):response;
    if(crypto.createHash('sha256').update(data).digest('hex')!==expected)throw Error(name+' SHA256 doğrulaması başarısız.');
    fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);
  }
  fs.writeFileSync(path.join(toolDir,'versions.json'),JSON.stringify({ytdlpSHA256:hash,ffmpegSHA256:FF_SHA256,ffmpeg:'6.0-essentials_build-www.gyan.dev',fetchedAt:new Date().toISOString()},null,2));
  console.log('İndirme araçları hazır. Charles’ı yeniden başlat.');
}
if(require.main===module)setup().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={setup,FF_SHA256};
