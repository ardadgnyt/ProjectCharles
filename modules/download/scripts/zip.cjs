// Streaming ZIP writer, no dependencies. Supports archives under 4 GiB and 65535 entries.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Transform, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const CRC = new Uint32Array(256).map((_, n) => { let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0; });
class ZipWriter {
  constructor(file) { this.finalFile=file;this.file=file+'.building';this.fd=fs.openSync(this.file,'wx');this.offset=0;this.entries=[]; }
  write(data) { let n=0;while(n<data.length)n+=fs.writeSync(this.fd,data,n,data.length-n);this.offset+=data.length;if(this.offset>=0xffffffff)throw Error('ZIP 4 GiB sınırı aşıldı.'); }
  async add(name, source, {store=false}={}) {
    if(!name || name.includes('\\') || name.split('/').some(x=>x==='..'||x==='') || path.isAbsolute(name)) throw Error('Geçersiz ZIP yolu.');
    const start=this.offset, nameBuf=Buffer.from(name), method=store?0:8;
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0808,6);header.writeUInt16LE(method,8);header.writeUInt16LE(0x5d54,12);header.writeUInt16LE(nameBuf.length,26);
    this.write(header);this.write(nameBuf);const dataStart=this.offset;
    let crc=0xffffffff,size=0;const hash=crypto.createHash('sha256');let head=Buffer.alloc(0);
    const input=Buffer.isBuffer(source)?require('node:stream').Readable.from([source]):fs.createReadStream(source);
    const scan=new Transform({transform(chunk,_enc,callback){hash.update(chunk);size+=chunk.length;for(const b of chunk)crc=CRC[(crc^b)&0xff]^(crc>>>8);if(head.length<4096)head=Buffer.concat([head,chunk.subarray(0,4096-head.length)]);callback(null,chunk);}});
    const output=new Writable({write:(chunk,_enc,callback)=>{try{this.write(chunk);callback();}catch(e){callback(e);}}});
    await pipeline(input,scan,...(store?[]:[zlib.createDeflateRaw({level:6})]),output);
    const compressed=this.offset-dataStart;crc=(crc^0xffffffff)>>>0;
    const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc,4);descriptor.writeUInt32LE(compressed,8);descriptor.writeUInt32LE(size,12);this.write(descriptor);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0808,8);central.writeUInt16LE(method,10);central.writeUInt16LE(0x5d54,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed,20);central.writeUInt32LE(size,24);central.writeUInt16LE(nameBuf.length,28);central.writeUInt32LE(start,42);this.entries.push(central,nameBuf);
    return {size,hash:hash.digest('hex'),head};
  }
  finish() {const start=this.offset;for(const b of this.entries)this.write(b);const len=this.offset-start,count=this.entries.length/2;if(count>65535)throw Error('ZIP dosya sınırı aşıldı.');const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(len,12);end.writeUInt32LE(start,16);this.write(end);fs.closeSync(this.fd);fs.renameSync(this.file,this.finalFile);return {files:count,bytes:this.offset};}
}
module.exports={ZipWriter};
