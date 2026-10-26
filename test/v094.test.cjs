'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { zipSync, strToU8 } = require('fflate');
const cv = require('../app/files/convert.cjs');
const { readZip } = require('../app/modules/package.cjs');
const { readUpdateZip } = require('../app/core/updater.cjs');
const { zipChecksums } = require('../app/core/zip-check.cjs');
const { QuickShareEngine, parseMdnsPacket, buildMdnsAnnouncement, buildMdnsQuery } = require('../app/files/quickshare.cjs');
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
    createMdnsSocket(){ const s=new EventEmitter(); s.sent=[]; s.deliveries=[]; s.bind=(p,host,cb)=>queueMicrotask(cb); s.send=(data,...args)=>{s.sent.push(data);s.deliveries.push(args.at(-1))}; s.close=()=>s.closed=true; s.setTTL=value=>s.ttl=value; s.addMembership=s.setMulticastTTL=s.setMulticastInterface=s.setMulticastLoopback=()=>{}; sockets.push(s); return s; },
    startBle(log){const c=new EventEmitter(); c.report=log; c.kill=()=>{c.killed=true;c.emit('exit')};children.push(c);return c;}
  });
  try {
    await engine.start(); await new Promise(r=>setImmediate(r));
    assert.ok(sockets[0].sent.some(p=>parseMdnsPacket(p)?.isResponse)); assert.equal(children.length,0,'receiver registration must not advertise the sender BLE beacon');
    engine.scan({wake:true});assert.equal(children.length,1);
    engine.announce();engine.announce();
    const info=sockets[0].sent.map(parseMdnsPacket).flatMap(p=>p.records).filter(r=>r.type===16).map(r=>r.parsed.n);
    assert.equal(new Set(info).size,1,'receiver TXT must stay stable across announcements');
    assert.equal(sockets[0].ttl,255,'unicast mDNS requires TTL 255 too');
    const phone=buildMdnsAnnouncement({serviceType:'_FC9F5ED42C8A._tcp.local.',instanceName:'phone',hostName:'phone.local',ip:'192.0.2.22',port:54000,txtMap:{n:'ignored'}});
    sockets[0].emit('message',phone,{address:'192.0.2.22',port:5353});
    assert.ok(sockets[0].deliveries.includes('192.0.2.22'),'unsolicited phone service receives a direct receiver announcement');
    sockets[0].deliveries=[];engine.announce();assert.ok(sockets[0].deliveries.includes('192.0.2.22'),'periodic announcements also refresh the known phone directly');
    sockets[0].sent=[];children[0].report('ble-status','Started');
    assert.ok(sockets[0].sent.some(p=>parseMdnsPacket(p)?.isResponse),'BLE readiness republishes the receiver without mode toggling');
    const oldService=sockets[0].sent.map(parseMdnsPacket).flatMap(p=>p.records).find(r=>r.type===12).parsed;
    sockets[0].sent=[];engine.setReceiveMode('auto');
    const renewed=sockets[0].sent.map(parseMdnsPacket).flatMap(p=>p.records).filter(r=>r.type===12);
    assert.ok(renewed.length>0);
    assert.ok(renewed.every(r=>r.ttl>0&&r.parsed===oldService),'keep the receiver identity when changing enabled modes');
    assert.equal(children[0].killed,true,'entering receiving stops sender advertising');
    engine.scan({wake:true});children.at(-1).emit('exit',2); await engine.refreshNetwork(); assert.equal(children.length,3);
    sockets[0].emit('error',Error('network disconnected')); await engine.refreshNetwork(); assert.equal(sockets.length,2);
    await engine.refreshNetwork({force:true}); assert.equal(sockets.length,3); assert.equal(sockets[1].closed,true);
    engine.stopDiscoveryWake();engine.setReceiveMode('off'); const n=children.length;
    await new Promise(r=>setImmediate(r)); sockets.at(-1).sent=[]; await engine.refreshNetwork();
    assert.equal(children.length,n); assert.ok(!sockets.at(-1).sent.some(p=>parseMdnsPacket(p)?.isResponse));
    engine.setReceiveMode('everyone'); assert.equal(children.length,n,'receiving alone never starts a sender beacon');
    assert.ok(sockets.at(-1).sent.some(p=>parseMdnsPacket(p)?.isResponse));
  } finally { engine.stop(); }
});
test('startup enables receiving with consent even if a previous launch saved automatic acceptance', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-visible-'));
  fs.writeFileSync(path.join(dir,'share-settings.json'),JSON.stringify({receiveMode:'auto'}));
  const service=new ShareService({userData:dir});const modes=[];let ready=false,announcements=0;
  service.qs.start=async()=>{ready=true};service.ad.start=async()=>{};
  service.qs.setReceiveMode=mode=>modes.push({mode,ready});service.ad.setVisible=()=>{};
  service.discover=()=>{if(ready)announcements++;return service.state()};
  try {await service.start();assert.deepEqual(modes,[{mode:'everyone',ready:false},{mode:'everyone',ready:true}]);assert.equal(announcements,1);
    const restarted=new ShareService({userData:dir});assert.equal(restarted.receiveMode,'everyone');restarted.stop();}
  finally {service.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('receiver registration repeats safely, throttles phone queries and never leaves a sender beacon running', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const packets=[],children=[];let socket;
  const engine=new QuickShareEngine({receiveMode:'off',networkAddress:async()=> '127.0.0.1',
    createMdnsSocket(){socket=new EventEmitter();socket.bind=(port,host,cb)=>queueMicrotask(cb);
      socket.send=(data,...args)=>packets.push({data,address:args.at(-1)});
      socket.close=socket.setTTL=socket.addMembership=socket.setMulticastTTL=socket.setMulticastInterface=socket.setMulticastLoopback=()=>{};return socket;},
    startBle(){const child=new EventEmitter();child.kill=()=>{child.killed=true;child.emit('exit')};children.push(child);return child;}
  });
  const responses=()=>packets.filter(p=>parseMdnsPacket(p.data).isResponse);
  try {
    await engine.start();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(responses().length,0);assert.equal(children.length,0);
    engine.setReceiveMode('everyone');packets.length=0;
    t.mock.timers.tick(3000);assert.equal(responses().length,2,'initial registration repeats twice');
    assert.equal(children.length,0);
    const question=buildMdnsQuery([{name:'_FC9F5ED42C8A._tcp.local.',type:12}]);
    packets.length=0;
    for(let i=0;i<20;i++)socket.emit('message',question,{address:'192.0.2.44',port:5353});
    assert.equal(responses().filter(p=>p.address==='192.0.2.44').length,1,'rapid queries get one directed response');
    const idQuery=Buffer.from(question);idQuery.writeUInt16BE(123,0);
    socket.emit('message',idQuery,{address:'192.0.2.44',port:60000});
    assert.ok(responses().some(p=>parseMdnsPacket(p.data).id===123),'legacy queries still receive the matching id');
    engine.setReceiveMode('off');packets.length=0;
    t.mock.timers.tick(3000);assert.equal(responses().length,0,'Off cancels every pending registration');
    engine.scan({wake:true});assert.equal(children.length,1,'outbound scan works while receiving is off');
    t.mock.timers.tick(15000);assert.equal(children[0].killed,true,'sender beacon has a bounded lifetime');
    await engine.refreshNetwork();assert.equal(children.length,1,'background recovery cannot resurrect an expired sender beacon');
  } finally {engine.stop();}
});
test('Windows BLE helper actually reaches Started using WinRT', {skip:process.platform!=='win32'||process.env.CHARLES_TEST_BLE!=='1'}, async () => {
  const vm=require('node:vm'),{createRequire}=require('node:module');
  const file=path.join(__dirname,'../app/files/quickshare.cjs');
  const box={require:createRequire(file),module:{exports:{}},Buffer,process,setTimeout,clearTimeout,setInterval,clearInterval};
  vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports=startWindowsBleWakeAdvertiser;',box);
  let child,timer;
  try {
    await new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('Bluetooth publisher did not start within 15 seconds')),15000);
      child=box.module.exports((stage,detail)=>{
        if(stage==='ble-error')reject(Error(detail));
        if(stage==='ble-status'&&detail.split(/\s+/).includes('Started'))resolve();
      });
      if(!child)return reject(Error('No BLE process'));
      child.once('exit',code=>reject(Error('BLE exited before advertising: '+code)));
    });
  } finally {clearTimeout(timer);child?.kill();}
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
test('one receiver accepts four rapid transfers with fresh consent and one stable discovery identity', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-sequential-'));
  const service=new ShareService({userData:path.join(dir,'settings'),downloadDir:path.join(dir,'in')});
  const packets=[];
  service.qs.networkAddress=async()=> '127.0.0.1';
  service.qs.createMdnsSocket=()=>{
    const socket=new EventEmitter();
    socket.bind=(port,host,cb)=>queueMicrotask(cb);
    socket.send=data=>packets.push(data);
    socket.close=socket.setTTL=socket.addMembership=socket.setMulticastTTL=socket.setMulticastInterface=socket.setMulticastLoopback=()=>{};
    return socket;
  };
  service.qs.startBle=()=>{const child=new EventEmitter();child.kill=()=>child.emit('exit');return child};
  service.ad.start=service.ad.refreshNetwork=async()=>{};
  const sender=new QuickShareEngine({discovery:false});let offers=0;
  service.on('offer',offer=>{offers++;service.respondOffer(offer.id,true)});
  try {
    await service.setReceiving(true);
    for(let i=0;i<4;i++) {
      const file=path.join(dir,'sample.txt'),content='transfer '+i;fs.writeFileSync(file,content);
      const received=new Promise((resolve,reject)=>{
        const done=value=>{service.qs.off('transfer-error',failed);resolve(value)};
        const failed=error=>{service.off('received',done);reject(Error(error.error))};
        service.once('received',done);service.qs.once('transfer-error',failed);
      });
      await sender.sendFiles({host:'127.0.0.1',port:service.qs.port,files:[file]});
      const result=await received;assert.equal(fs.readFileSync(result.files[0].path,'utf8'),content);
      assert.equal(service.pendingOffer,null);assert.equal(service.transfer.status,'done');
    }
    assert.equal(offers,4);assert.equal(service.history.length,4);
    await new Promise(resolve=>setImmediate(resolve));
    const records=packets.map(parseMdnsPacket).flatMap(packet=>packet.records);
    const services=records.filter(record=>record.type===12);
    assert.ok(services.length>0);
    assert.ok(services.every(record=>record.ttl>0),'successful transfers must not withdraw the receiver');
    assert.equal(new Set(services.map(record=>record.parsed)).size,1,'all four transfers advertise one receiver');
    assert.equal(new Set(records.filter(record=>record.type===16).map(record=>record.parsed.n)).size,1,'endpoint information stays stable');
    packets.length=0;
    await service.setReceiving(false);
    const withdrawals=packets.map(parseMdnsPacket).flatMap(packet=>packet.records).filter(record=>record.type===12);
    assert.ok(withdrawals.some(record=>record.ttl===0&&record.parsed===services[0].parsed),'Off withdraws the same receiver');
  } finally {service.stop();sender.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('explicit receiving opens fresh discovery, asks consent, closes and rejects stale enable attempts', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-receive-switch-'));
  const service=new ShareService({userData:dir});const operations=[];
  service.qs.start=service.ad.start=async()=>{};
  service.qs.setReceiveMode=mode=>operations.push(mode);service.ad.setVisible=()=>{};
  service.qs.refreshNetwork=async options=>{assert.equal(options.force,true);operations.push('refresh')};
  service.ad.refreshNetwork=async()=>{};service.discover=()=>service.state();
  try {
    await service.start();assert.equal(service.receiveMode,'everyone');await service.setReceiving(false);
    await service.setReceiving(true);assert.equal(service.receiveMode,'everyone');assert.equal(service.receiveStarting,false);
    assert.ok(operations.lastIndexOf('refresh')<operations.lastIndexOf('everyone'));
    let accepted;service.qs.emit('offer',{id:'consent',files:[],respond:value=>accepted=value});
    assert.equal(accepted,undefined);assert.equal(service.pendingOffer.id,'consent');
    await service.setReceiving(false);assert.equal(accepted,false);assert.equal(service.pendingOffer,null);
    let release;service.qs.refreshNetwork=()=>new Promise(resolve=>release=resolve);
    const pending=service.setReceiving(true);await new Promise(resolve=>setImmediate(resolve));
    await service.setReceiving(false);release();await pending;assert.equal(service.receiveMode,'off');
    service.qs.refreshNetwork=async()=>{throw Error('adapter failed')};
    await assert.rejects(service.setReceiving(true),/adapter failed/);assert.equal(service.receiveMode,'off');assert.equal(service.receiveStarting,false);
    assert.throws(()=>service.setReceiveMode('auto'),/açık veya kapalı/);
  } finally {service.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
