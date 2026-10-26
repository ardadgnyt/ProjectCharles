'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {EventEmitter}=require('node:events');
const secureChannel=require('../app/files/quickshare-channel.cjs');
const file=path.resolve(__dirname,'../app/files/quickshare.cjs');
const context={require:createRequire(file),module:{exports:{}},Buffer,process,setTimeout,clearTimeout,setInterval,clearInterval};
vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports={decodeFields,pbFirst,buildKeepAliveFrame,buildPayloadTransferFrame,buildDisconnectionFrame,buildSharingFrame,buildSharingResponseFrame,buildIntroductionFrame};',context);
const wire=context.module.exports;
function channel(messages){
  let id=0,finish;
  const frames=messages.map(body=>wire.buildPayloadTransferFrame({id:BigInt(++id),type:1,totalSize:body.length,body,flags:1}));
  const socket=new EventEmitter();socket.destroy=()=>{socket.destroyed=true;socket.emit('close')};socket.end=()=>socket.destroy();
  const fq={nextFrame:()=>frames.length?Promise.resolve(frames.shift()):new Promise((resolve,reject)=>{finish=()=>reject(Error('closed'))}),writeFrame:(data,cb)=>cb?.()};
  const result=secureChannel(socket,fq,{encryptAndSign:b=>b,verifyAndDecrypt:b=>b},wire);
  return {result,close(){result.close();finish?.()}};
}
test('Samsung ACCEPT before introduction is an intermediate frame, not a failed or accepted transfer',async()=>{
  const intro=wire.buildIntroductionFrame([{name:'photo.png',payloadId:123n,size:12,mime:'image/png'}]);
  const c=channel([wire.buildSharingResponseFrame(true),intro]);
  try{const received=await c.result.expect(1,1000);assert.equal(received.type,1);assert.ok(received.v1Fields.has(2));}finally{c.close()}
});
test('early ACCEPT without introduction does not grant consent or extend the deadline',async()=>{
  const c=channel([wire.buildSharingResponseFrame(true)]);
  try{await assert.rejects(c.result.expect(1,30),/zaman aşımı/)}finally{c.close()}
});
test('peer cancellation still terminates a wait after an intermediate frame',async()=>{
  const c=channel([wire.buildSharingResponseFrame(true),wire.buildSharingFrame(6,7,Buffer.alloc(0))]);
  try{await assert.rejects(c.result.expect(1,1000),/iptal/)}finally{c.close()}
});
