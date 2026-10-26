'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const https=require('node:https'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {AirDropEngine,generateSelfSignedCert}=require('../app/files/airdrop.cjs');
const body=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return Buffer.concat(chunks)};
function post(engine,port,url,data){const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data));return new Promise((resolve,reject)=>{const q=https.request({host:'127.0.0.1',port,path:url,method:'POST',rejectUnauthorized:false,key:engine.tls.key,cert:engine.tls.cert,headers:{'Content-Length':bytes.length,'Content-Type':'application/json'}},async r=>resolve({status:r.statusCode,body:await body(r)}));q.on('error',reject);q.end(bytes)})}
test('LocalSend sends a client certificate on preparation and upload',async(t)=>{
 require('./no-lan-discovery.cjs')(t);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-ls-tls-'));const file=path.join(dir,'sample.txt');fs.writeFileSync(file,'certificate test');
 const sender=new AirDropEngine();const cert=generateSelfSignedCert('receiver');let requests=0,uploaded;
 const server=https.createServer({key:cert.key,cert:cert.cert,requestCert:true,rejectUnauthorized:true,ca:sender.tls.cert},async(req,res)=>{
 assert.ok(req.socket.authorized);assert.ok(req.socket.getPeerCertificate().raw);requests++;
 const bytes=await body(req);res.setHeader('Content-Type','application/json');
 if(req.url.endsWith('prepare-upload'))res.end(JSON.stringify({sessionId:'s1',files:{f1:'token'}}));else {uploaded=bytes;res.end('{}')}
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const r=await sender.sendFiles({host:'127.0.0.1',port:server.address().port,subProtocol:'localsend',files:[file]});assert.equal(r.ok,true);assert.equal(requests,2);assert.equal(uploaded.toString(),'certificate test')}
 finally{server.close();sender.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('LocalSend registers in both directions, receives accepted files and hides when off',async(t)=>{
 require('./no-lan-discovery.cjs')(t);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-ls-in-'));const receiver=new AirDropEngine({deviceName:'Charles Test',downloadDir:dir});const phone=new AirDropEngine({deviceName:'Phone Test'});let registered;
 const server=https.createServer({key:phone.tls.key,cert:phone.tls.cert,requestCert:true,rejectUnauthorized:true,ca:receiver.tls.cert},async(req,res)=>{registered=JSON.parse((await body(req)).toString());res.end('{}')});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await receiver.start();await new Promise(r=>setTimeout(r,40));
 const info={...phone.localSendInfo(),port:server.address().port,announce:true};
 receiver.lsSocket.emit('message',Buffer.from(JSON.stringify(info)),{address:'127.0.0.1'});
 for(let i=0;i<50&&!registered;i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(registered.alias,'Charles Test');assert.equal(registered.port,receiver.port);assert.equal(receiver.peers.values().next().value.protocol,'localsend');
 const reg=await post(phone,receiver.port,'/api/localsend/v2/register',info);assert.equal(reg.status,200);assert.equal(JSON.parse(reg.body).alias,'Charles Test');
 receiver.on('offer',o=>{assert.equal(o.protocol,'localsend');o.respond(true)});
 const prep=await post(phone,receiver.port,'/api/localsend/v2/prepare-upload',{info,files:{a:{id:'a',fileName:'sample.txt',size:5}}});assert.equal(prep.status,200);const p=JSON.parse(prep.body);
 const received=once(receiver,'received');const up=await post(phone,receiver.port,`/api/localsend/v2/upload?sessionId=${p.sessionId}&fileId=a&token=${p.files.a}`,Buffer.from('hello'));assert.equal(up.status,200);const [rec]=await received;assert.equal(fs.readFileSync(rec.files[0].path,'utf8'),'hello');
 receiver.setVisible(false);const hidden=await post(phone,receiver.port,'/api/localsend/v2/register',info);assert.equal(hidden.status,403);
 }finally{receiver.stop();phone.stop();server.close();fs.rmSync(dir,{recursive:true,force:true})}
});
