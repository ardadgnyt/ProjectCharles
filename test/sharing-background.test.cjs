'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ShareService}=require('../app/files/share.cjs');
test('sharing starts once without a sheet, resumes, and respects receive off',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-background-'));
 const s=new ShareService({userData:dir});let starts=0,refreshes=0;
 s.qs.start=async()=>{starts++;await new Promise(r=>setTimeout(r,10))};s.ad.start=async()=>{};
 s.qs.setReceiveMode=m=>s.qs.mode=m;s.ad.setVisible=v=>s.ad.visible=v;
 s.qs.refreshNetwork=async()=>refreshes++;s.discover=()=>s.state();
 try{await Promise.all([s.start(),s.start()]);assert.equal(starts,1);assert.equal(s.qs.mode,'everyone');assert.equal(s.ad.visible,true);
 s.setReceiveMode('off');await s.resume();assert.equal(starts,1);assert.equal(refreshes,1);assert.equal(s.qs.mode,'off');assert.equal(s.ad.visible,false);
 let accepted; s.qs.emit('offer',{id:'off',respond:v=>accepted=v});assert.equal(accepted,false);assert.equal(s.state().offer,null);
 }finally{s.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('incoming consent immediately reaches state and response clears it',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-consent-'));const s=new ShareService({userData:dir});let answer,latest;
 s.on('state',v=>latest=v);
 try{s.setReceiveMode('everyone');s.qs.emit('offer',{id:'photo',protocol:'quickshare',peerName:'S24+',files:[{name:'photo.jpg',size:20}],respond:v=>answer=v});
 assert.equal(latest.offer.id,'photo');const rev=latest.revision;s.respondOffer('photo',true);assert.equal(answer,true);assert.equal(latest.offer,null);assert.ok(latest.revision>rev);
 }finally{s.stop();fs.rmSync(dir,{recursive:true,force:true})}
});

test('main-process heartbeat keeps receiving visible without any renderer and respects Off during recovery',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'charles-idle-'));const s=new ShareService({userData:dir});
 let refreshes=0,announces=0,block,release;
 s.qs.start=async()=>{if(block)await block};s.ad.start=async()=>{};
 let actualMode='off';Object.defineProperty(s.qs,'receiveMode',{get:()=>actualMode});
 s.qs.setReceiveMode=mode=>actualMode=mode;s.ad.setVisible=v=>s.ad.visible=v;
 s.qs.refreshNetwork=s.ad.refreshNetwork=async()=>{refreshes++};
 s.qs.announce=()=>announces++;s.ad.announce=()=>{};s.discover=()=>s.state();
 try{
  await s.start();s.setReceiveMode('everyone');
  actualMode='off';s.ad.visible=false;
  t.mock.timers.tick(10000);await s.maintenancePromise;
  assert.equal(actualMode,'everyone');assert.equal(s.ad.visible,true);assert.equal(refreshes,2);assert.ok(announces>0);
  const count=announces;t.mock.timers.tick(10000);await s.maintenancePromise;assert.ok(announces>count);
  block=new Promise(r=>release=r);t.mock.timers.tick(10000);const pending=s.maintenancePromise;
  await s.setReceiving(false);release();await pending;
  assert.equal(actualMode,'off');assert.equal(s.ad.visible,false);
  const afterOff=announces;t.mock.timers.tick(10000);await Promise.resolve();assert.equal(announces,afterOff);
  s.stop();t.mock.timers.tick(10000);assert.equal(announces,afterOff);
 }finally{s.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
