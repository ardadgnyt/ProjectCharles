const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { QuickShareEngine } = require('../app/files/quickshare.cjs');

function privateCodec() {
  const file = path.resolve(__dirname, '../app/files/quickshare.cjs');
  const box = { require: createRequire(file), module: { exports: {} }, Buffer, process, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.runInNewContext(fs.readFileSync(file,'utf8') + '\nmodule.exports = { createUkey2Client, createUkey2Server, decodeFields, pbFirst };', box);
  return box.module.exports;
}
test('SecureMessage uses Android DEVICE_TO_DEVICE_MESSAGE=13; rejects tampering, replay and wrong commitment', () => {
  const c = privateCodec();
  const client = c.createUkey2Client(), server = c.createUkey2Server(client.clientInitMsgBytes);
  const a = client.processServerInit(server.serverInitMsgBytes), b = server.processClientFinish(client.clientFinishMsgBytes);
  const raw = a.encryptAndSign(Buffer.from('interop'));
  const hb = c.decodeFields(c.pbFirst(c.decodeFields(raw), 1));
  const hdr = c.decodeFields(c.pbFirst(hb, 1));
  const meta = c.decodeFields(c.pbFirst(hdr, 6));
  assert.equal(Number(c.pbFirst(meta, 1)), 13);
  const bad = Buffer.from(raw); bad[bad.length-1] ^= 1;
  assert.throws(() => b.verifyAndDecrypt(bad), /HMAC/);
  assert.equal(b.verifyAndDecrypt(raw).toString(),'interop');
  assert.throws(() => b.verifyAndDecrypt(raw), /sıra/);
  const wrong = c.createUkey2Client();
  assert.throws(() => server.processClientFinish(wrong.clientFinishMsgBytes), /commitment/);
});

test('binary multi-file transfer, empty file, duplicate filename and delayed consent', { timeout: 25000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'charles-alpha-'));
  const rx = new QuickShareEngine({ downloadDir: path.join(tmp,'in'), discovery: false });
  const tx = new QuickShareEngine({ discovery: false });
  const image = crypto.randomBytes(1400000);
  fs.writeFileSync(path.join(tmp,'photo.png'), image); fs.writeFileSync(path.join(tmp,'empty.txt'), '');
  let timer;
  rx.on('offer', o => { timer = setTimeout(() => o.respond(true), 13000); });
  const result = new Promise((resolve,reject) => { rx.once('received',resolve); rx.once('transfer-error',e=>reject(Error(e.error))); });
  try {
    await rx.start();
    await tx.sendFiles({ host:'127.0.0.1',port:rx.port,files:[path.join(tmp,'photo.png'),path.join(tmp,'photo.png'),path.join(tmp,'empty.txt')] });
    const received = await result;
    assert.equal(received.files.length,3);
    assert.notEqual(received.files[0].path,received.files[1].path);
    for (const f of received.files.slice(0,2)) assert.deepEqual(fs.readFileSync(f.path),image);
    assert.equal(fs.statSync(received.files[2].path).size,0);
  } finally { clearTimeout(timer); tx.stop(); rx.stop(); fs.rmSync(tmp,{recursive:true,force:true}); }
});

test('reject and interrupted receive never report success or leave a partial file', { timeout: 10000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'charles-abort-'));
  const rx = new QuickShareEngine({downloadDir:path.join(tmp,'in'),discovery:false});
  const tx = new QuickShareEngine({discovery:false});
  const file = path.join(tmp,'large.png'); fs.writeFileSync(file,crypto.randomBytes(6000000));
  let accept=false, completed=false;
  rx.on('offer',o=>o.respond(accept)); rx.on('received',()=>{completed=true;});
  try {
    await rx.start();
    await assert.rejects(tx.sendFiles({host:'127.0.0.1',port:rx.port,files:[file]}),/reddetti/);
    accept=true;
    const failed = new Promise(r=>rx.once('transfer-error',r));
    rx.once('progress',()=>rx.cancelAll());
    await assert.rejects(tx.sendFiles({host:'127.0.0.1',port:rx.port,files:[file]}));
    await failed;
    assert.equal(completed,false);
    assert.deepEqual(fs.readdirSync(path.join(tmp,'in')),[]);
  } finally {tx.stop();rx.stop();fs.rmSync(tmp,{recursive:true,force:true});}
});

function reference(args) {
  const child = spawn(process.env.QS_PYTHON, [path.join(__dirname,'multidrop-peer.py'),process.env.QS_MULTIDROP_SOURCE,...args], { windowsHide:true });
  let stderr=''; const events=[];
  child.stderr.on('data',d=>stderr+=d);
  let readyResolve, readyReject;
  const ready = new Promise((r,j)=>{readyResolve=r;readyReject=j;});
  createInterface({input:child.stdout}).on('line',line=>{ const e=JSON.parse(line); events.push(e); if(e.port)readyResolve(e.port); });
  const done = new Promise((r,j)=>{
    child.on('error',j);
    child.on('exit',code=>{ if(code) { const e=Error(stderr || `Reference exited ${code}`); readyReject(e); j(e); } else r(events); });
  });
  ready.catch(()=>{}); done.catch(()=>{});
  return { child,ready,done,events };
}
test('unmodified MultiDrop sends to and receives from Charles', { skip: !process.env.QS_MULTIDROP_SOURCE, timeout: 45000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'charles-interop-'));
  const tx = new QuickShareEngine({discovery:false});
  const rx = new QuickShareEngine({discovery:false,downloadDir:path.join(tmp,'charles-in')});
  const file=path.join(tmp,'image.png'), empty=path.join(tmp,'empty.txt');
  fs.writeFileSync(file,crypto.randomBytes(2100000)); fs.writeFileSync(empty,'');
  const peers=[];
  try {
    const refRx=reference(['receive',path.join(tmp,'reference-in')]); peers.push(refRx);
    const port=await refRx.ready;
    await tx.sendFiles({host:'127.0.0.1',port,files:[file,empty]});
    const events=await refRx.done;
    assert.ok(events.some(e=>e.event==='session_done'),JSON.stringify(events));
    assert.deepEqual(fs.readFileSync(path.join(tmp,'reference-in','image.png')),fs.readFileSync(file));
    rx.on('offer',offer=>offer.respond(true));
    const received=new Promise((r,j)=>{rx.once('received',r);rx.once('transfer-error',e=>j(Error(e.error)));});
    await rx.start();
    const refTx=reference(['send',String(rx.port),file,empty]); peers.push(refTx);
    const [rec]=await Promise.all([received,refTx.done]);
    assert.equal(rec.files.length,2);
    assert.deepEqual(fs.readFileSync(rec.files[0].path),fs.readFileSync(file));
    assert.equal(fs.statSync(rec.files[1].path).size,0);
  } finally { for(const p of peers)p.child.kill(); tx.stop();rx.stop();fs.rmSync(tmp,{recursive:true,force:true}); }
});
