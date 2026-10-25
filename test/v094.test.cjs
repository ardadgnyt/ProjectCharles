'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { zipSync, strToU8 } = require('fflate');
const cv = require('../app/files/convert.cjs');
const { readZip } = require('../app/modules/package.cjs');
const { readUpdateZip } = require('../app/core/updater.cjs');
const { zipChecksums } = require('../app/core/zip-check.cjs');
const { QuickShareEngine, parseMdnsPacket } = require('../app/files/quickshare.cjs');
const { ShareService } = require('../app/files/share.cjs');
const zip = files => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k,v]) => [k,strToU8(v)])), { level:0 }));
const pkg = JSON.stringify({ name:'project-charles', version:'0.9.4-beta.1' });
const manifest = JSON.stringify({ id:'crc-test', name:'CRC', version:'1.0.0', author:'Test', description:'Fixture', charlesApi:1, entry:'index.html', permissions:[] });
function corrupt(z, name) {
  z = Buffer.from(z); let p = 0;
  while (z.readUInt32LE(p) === 0x04034b50) {
    const n = z.readUInt16LE(p+26), x = z.readUInt16LE(p+28), data = p+30+n+x;
    if (z.toString('utf8',p+30,p+30+n) === name) { z[data] ^= 1; return z; }
    p = data + z.readUInt32LE(p+18);
  }
  throw Error('missing fixture entry');
}
function zip64(z) {
  const at=z.length-22, old=z.subarray(at), end=Buffer.alloc(56), loc=Buffer.alloc(20), last=Buffer.from(old);
  end.writeUInt32LE(0x06064b50); end.writeBigUInt64LE(44n,4); end.writeUInt16LE(45,12); end.writeUInt16LE(45,14);
  end.writeBigUInt64LE(BigInt(old.readUInt16LE(10)),24); end.writeBigUInt64LE(BigInt(old.readUInt16LE(10)),32);
  end.writeBigUInt64LE(BigInt(old.readUInt32LE(12)),40); end.writeBigUInt64LE(BigInt(old.readUInt32LE(16)),48);
  loc.writeUInt32LE(0x07064b50); loc.writeBigUInt64LE(BigInt(at),8); loc.writeUInt32LE(1,16);
  last.writeUInt16LE(65535,8); last.writeUInt16LE(65535,10); last.writeUInt32LE(0xffffffff,12); last.writeUInt32LE(0xffffffff,16);
  return Buffer.concat([z.subarray(0,at),end,loc,last]);
}
test('ZIP and ZIP64: valid updates/modules/extraction pass, CRC corruption fails before output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'charles-v094-'));
  try {
    for (const transform of [z=>z, zip64]) {
      const good = transform(zip({'package.json':pkg,'app/a.js':'ORIGINAL'}));
      assert.equal(readUpdateZip(good).version,'0.9.4-beta.1');
      const bad = transform(corrupt(zip({'package.json':pkg,'app/a.js':'ORIGINAL'}),'app/a.js'));
      assert.throws(()=>readUpdateZip(bad),/bozuk/);
      const input=path.join(dir,'input.zip'), output=path.join(dir,'out');
      fs.writeFileSync(input,bad); assert.throws(()=>cv.unzipTo(input,output),/bozuk/); assert.ok(!fs.existsSync(output));
      fs.writeFileSync(input,good); assert.equal(cv.unzipTo(input,output),2); fs.rmSync(output,{recursive:true});
      const mod=zip({'manifest.json':manifest,'index.html':'ORIGINAL'});
      assert.equal(readZip(transform(mod)).files.size,2);
      assert.throws(()=>readZip(transform(corrupt(mod,'index.html'))),/bozuk/);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('ZIP64 malformed locator, unsafe integer and truncated directory fail closed', () => {
  const z=zip64(zip({'a.txt':'hello'}));
  const missing=Buffer.from(z); missing.writeUInt32LE(0,z.length-42); assert.throws(()=>zipChecksums(missing),/bozuk/);
  const huge=Buffer.from(z); huge.writeBigUInt64LE(2n**60n,z.length-34); assert.throws(()=>zipChecksums(huge),/bozuk/);
  assert.throws(()=>zipChecksums(z.subarray(0,z.length-4)),/bozuk/);
});
test('ZIP64 per-entry extra sizes and offsets, compressed Unicode filenames and comments remain supported', () => {
  const original=zip({'package.json':pkg,'app/a.js':'hello'}), eo=original.length-22, start=original.readUInt32LE(eo+16);
  const entries=[]; let p=start;
  while(p<eo) {
    const n=original.readUInt16LE(p+28), x=original.readUInt16LE(p+30), c=original.readUInt16LE(p+32), next=p+46+n+x+c;
    const header=Buffer.from(original.subarray(p,p+46+n)), extra=Buffer.alloc(28);
    extra.writeUInt16LE(1);extra.writeUInt16LE(24,2);
    extra.writeBigUInt64LE(BigInt(original.readUInt32LE(p+24)),4);extra.writeBigUInt64LE(BigInt(original.readUInt32LE(p+20)),12);extra.writeBigUInt64LE(BigInt(original.readUInt32LE(p+42)),20);
    header.writeUInt32LE(0xffffffff,20);header.writeUInt32LE(0xffffffff,24);header.writeUInt32LE(0xffffffff,42);header.writeUInt16LE(x+28,30);
    entries.push(header,extra,original.subarray(p+46+n,next));p=next;
  }
  const directory=Buffer.concat(entries), tail=Buffer.from(original.subarray(eo));tail.writeUInt32LE(directory.length,12);
  const full=zip64(Buffer.concat([original.subarray(0,start),directory,tail]));
  assert.equal(readUpdateZip(full).version,'0.9.4-beta.1');
  const compressed=zipSync({'package.json':strToU8(pkg),'app/İstanbul.txt':strToU8('Türkçe '.repeat(200))},{comment:'test comment',level:6});
  assert.ok(readUpdateZip(compressed).files.has('app/İstanbul.txt'));
});
test('invalid CSV and subtitle inputs fail through the public converter without output', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-convert-v094-'));
  try {
    for (const [name,text,target] of [['duplicate.csv','name,name\nFIRST,SECOND','json'],['extra.csv','name\nFIRST,SECOND','json'],['invalid.srt','1\n99:99:99,999 --> 00:00:00,000\nHello','vtt']]) {
      const file=path.join(dir,name);fs.writeFileSync(file,text);const converter=new cv.Converter();const batch=await converter.add([file]);
      const result=await converter.run(batch.id,target);assert.equal(result.failed,1);assert.equal(fs.readFileSync(file,'utf8'),text);assert.ok(!converter.output(batch.id));
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('extraction rejects case, normalized path and file/folder collisions without creating destination', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-collision-'));
  try {
    for (const names of [['a.txt','A.txt'],['a/b.txt','A/B.txt'],['a//b.txt','a/b.txt'],['a','A/b.txt']]) {
      const file=path.join(dir,'input.zip'),out=path.join(dir,'out');
      fs.writeFileSync(file,zip(Object.fromEntries(names.map(n=>[n,n]))));
      assert.throws(()=>cv.unzipTo(file,out),/çakış/); assert.ok(!fs.existsSync(out));
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('CSV rejects repeated/generated-key collisions and excess columns, retains valid quoted data', () => {
  for (const text of ['name,name\nFIRST,SECOND',',sütun1\nFIRST,SECOND','name\nFIRST,SECOND']) assert.throws(()=>cv.tableToObjects(cv.parseDelimited(text,',')),/başlık|kolon/);
  assert.deepEqual(cv.tableToObjects(cv.parseDelimited('name,note\nİstanbul,"a,b"\nAnkara',',')),[{name:'İstanbul',note:'a,b'},{name:'Ankara',note:''}]);
});
test('subtitle times reject out-of-range fields, reversed/equal ranges and malformed timestamps', () => {
  for (const times of ['99:99:99,999 --> 00:00:00,000','00:00:03,000 --> 00:00:02,000','00:00:01,000 --> 00:00:01,000','00:60:01,000 --> 00:61:01,000','bad --> worse']) assert.throws(()=>cv.srtToVtt('1\n'+times+'\nHello'),/zaman/);
  const good='1\n00:00:01,000 --> 00:00:02,500\nİstanbul\n';
  assert.equal(cv.vttToSrt(cv.srtToVtt(good)).trim(),good.trim());
  assert.match(cv.vttToSrt('WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nHi'),/00:00:01,000/);
});
test('pre-aborted FFmpeg never spawns', async () => {
  const controller=new AbortController(); controller.abort(); let calls=0;
  await assert.rejects(cv.runFFmpeg('unused',[],{signal:controller.signal,spawnFn(){ calls++; throw Error('must not spawn'); }}),e=>e.cancelled===true);
  assert.equal(calls,0);
});
test('Quick Share recovers failed BLE, mDNS and same-address resume without a UI, respecting off', async () => {
  const sockets=[], children=[];
  const engine=new QuickShareEngine({downloadDir:os.tmpdir(),networkAddress:async()=> '127.0.0.1',
    createMdnsSocket(){ const s=new EventEmitter(); s.sent=[]; s.bind=(p,host,cb)=>queueMicrotask(cb); s.send=(data)=>s.sent.push(data); s.close=()=>s.closed=true; s.addMembership=s.setMulticastTTL=s.setMulticastInterface=s.setMulticastLoopback=()=>{}; sockets.push(s); return s; },
    startBle(){const c=new EventEmitter(); c.kill=()=>{c.killed=true;c.emit('exit')};children.push(c);return c;}
  });
  try {
    await engine.start(); await new Promise(r=>setImmediate(r));
    assert.ok(sockets[0].sent.some(p=>parseMdnsPacket(p)?.isResponse)); assert.equal(children.length,1);
    children[0].emit('exit',2); await engine.refreshNetwork(); assert.equal(children.length,2);
    sockets[0].emit('error',Error('network disconnected')); await engine.refreshNetwork(); assert.equal(sockets.length,2);
    await engine.refreshNetwork({force:true}); assert.equal(sockets.length,3); assert.equal(sockets[1].closed,true);
    engine.setReceiveMode('off'); const n=children.length;
    await new Promise(r=>setImmediate(r)); sockets.at(-1).sent=[]; await engine.refreshNetwork();
    assert.equal(children.length,n); assert.ok(!sockets.at(-1).sent.some(p=>parseMdnsPacket(p)?.isResponse));
    engine.setReceiveMode('everyone'); assert.equal(children.length,n+1);
    assert.ok(sockets.at(-1).sent.some(p=>parseMdnsPacket(p)?.isResponse));
  } finally { engine.stop(); }
});
test('sharing retries failed startup without UI activity and stops its retry timer on shutdown', async t => {
  t.mock.timers.enable({apis:['setInterval']});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-retry-'));
  const service=new ShareService({userData:dir});let starts=0;
  service.qs.start=async()=>{if(++starts===1)throw Error('adapter unavailable')};service.ad.start=async()=>{};
  service.qs.setReceiveMode=()=>{};service.ad.setVisible=()=>{};
  try {
    await assert.rejects(service.start(),/adapter/);assert.equal(service.started,false);
    t.mock.timers.tick(15000);await service.startPromise;assert.equal(service.started,true);assert.equal(starts,2);
    service.stop();t.mock.timers.tick(30000);assert.equal(starts,2);
  } finally {service.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
