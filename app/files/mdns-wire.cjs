// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.6: the small mDNS / network helpers the share service still needs (LocalSend and
// AirDrop discovery in airdrop.cjs, the Quick Share query hand-over in
// quickshare-multidrop.cjs). Quick Share itself runs in the vendored MultiDrop backend
// (tools/quickshare); the former JavaScript Quick Share engine was removed with this split.
const dgram = require('node:dgram');
const os = require('node:os');

const QS_SERVICE = '_FC9F5ED42C8A._tcp.local.';

function encodeDnsName(name) {
  const parts = String(name).replace(/\.$/, '').split('.').filter(Boolean);
  const buffers = [];
  for (const p of parts) {
    const b = Buffer.from(p, 'utf8');
    buffers.push(Buffer.from([b.length]), b);
  }
  buffers.push(Buffer.from([0]));
  return Buffer.concat(buffers);
}

function decodeDnsName(buf, offset) {
  const labels = [];
  let pos = offset;
  let jumped = false;
  let nextOffset = offset;
  let hops = 0;
  while (pos < buf.length && hops++ < 40) {
    const len = buf[pos];
    if (len === 0) {
      if (!jumped) nextOffset = pos + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= buf.length) break;
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1];
      if (!jumped) nextOffset = pos + 2;
      pos = ptr;
      jumped = true;
      continue;
    }
    pos++;
    if (pos + len > buf.length) break;
    labels.push(buf.subarray(pos, pos + len).toString('utf8'));
    pos += len;
  }
  return { name: labels.join('.'), offset: nextOffset };
}

function buildMdnsQuery(serviceNames) {
  const names = Array.isArray(serviceNames) ? serviceNames : [serviceNames];
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0, 2);
  header.writeUInt16BE(names.length, 4);
  const qBufs = [];
  for (const q of names) {
    const qName = typeof q === 'string' ? q : q.name;
    const qType = typeof q === 'object' && q.type ? q.type : 12; // 12=PTR, 255=ANY
    const qTail = Buffer.alloc(4);
    qTail.writeUInt16BE(qType, 0);
    qTail.writeUInt16BE(0x0001, 2); // IN
    qBufs.push(encodeDnsName(qName), qTail);
  }
  return Buffer.concat([header, ...qBufs]);
}

function buildDnsRecord(name, type, ttl, rdata, flush = false) {
  const dname = encodeDnsName(name);
  const meta = Buffer.alloc(10);
  meta.writeUInt16BE(type, 0);
  meta.writeUInt16BE(flush ? 0x8001 : 0x0001, 2);
  meta.writeUInt32BE(ttl, 4);
  meta.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([dname, meta, rdata]);
}

function buildMdnsAnnouncement({
  serviceType,
  service,
  instanceName,
  hostName,
  ip,
  port,
  txtMap,
  txtEntries,
  ttl = 120,
  otherTtl = ttl,
  queryId = 0,
  questions = [],
  legacy = false,
}) {
  const svc = String(serviceType || service || QS_SERVICE).replace(/\.$/, '');
  const rawInst = String(instanceName || 'Charles').replace(/\.$/, '');
  const fullInstance = rawInst.toLowerCase().endsWith(svc.toLowerCase()) ? rawInst : `${rawInst}.${svc}`;
  const rawHost = String(hostName || 'Charles-PC.local').replace(/\.$/, '');
  const fullHost = rawHost.toLowerCase().endsWith('.local') ? rawHost : `${rawHost}.local`;

  const qList = Array.isArray(questions) ? questions : [];
  const header = Buffer.alloc(12);
  header.writeUInt16BE(legacy ? queryId & 0xffff : 0, 0);
  header.writeUInt16BE(0x8400, 2); // QR=1, AA=1
  header.writeUInt16BE(legacy ? qList.length : 0, 4);
  header.writeUInt16BE(4, 6); // 4 Answer RRs

  const qBufs = [];
  if (legacy && qList.length) {
    for (const q of qList) {
      const qTail = Buffer.alloc(4);
      qTail.writeUInt16BE(q.type || 12, 0);
      qTail.writeUInt16BE(q.cls || 1, 2);
      qBufs.push(encodeDnsName(q.name), qTail);
    }
  }

  const flush = !legacy;
  const effTtl = legacy ? Math.min(ttl, 10) : ttl;

  const ptrData = encodeDnsName(fullInstance);
  const sharedTtl = legacy ? Math.min(otherTtl, 10) : otherTtl;
  const ptrRec = buildDnsRecord(svc, 12, sharedTtl, ptrData, false);

  const hostEncoded = encodeDnsName(fullHost);
  const srvPre = Buffer.alloc(6);
  srvPre.writeUInt16BE(0, 0);
  srvPre.writeUInt16BE(0, 2);
  srvPre.writeUInt16BE(port, 4);
  const srvRec = buildDnsRecord(fullInstance, 33, effTtl, Buffer.concat([srvPre, hostEncoded]), flush);

  const txtChunks = [];
  if (Array.isArray(txtEntries)) {
    for (const entry of txtEntries) {
      const b = Buffer.from(String(entry), 'utf8');
      if (b.length <= 255) txtChunks.push(Buffer.from([b.length]), b);
    }
  }
  for (const [k, v] of Object.entries(txtMap || {})) {
    const b = Buffer.from(`${k}=${v}`, 'utf8');
    if (b.length <= 255) txtChunks.push(Buffer.from([b.length]), b);
  }
  const txtData = txtChunks.length ? Buffer.concat(txtChunks) : Buffer.from([0]);
  const txtRec = buildDnsRecord(fullInstance, 16, sharedTtl, txtData, flush);

  const ipParts = String(ip || '127.0.0.1').split('.').map((x) => Number(x) & 0xff);
  const aData = Buffer.from(ipParts.length === 4 ? ipParts : [127, 0, 0, 1]);
  const aRec = buildDnsRecord(fullHost, 1, effTtl, aData, flush);

  return Buffer.concat([header, ...qBufs, ptrRec, srvRec, txtRec, aRec]);
}

function parseMdnsPacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const id = buf.readUInt16BE(0);
  const flags = buf.readUInt16BE(2);
  const qdCount = buf.readUInt16BE(4);
  const anCount = buf.readUInt16BE(6);
  const nsCount = buf.readUInt16BE(8);
  const arCount = buf.readUInt16BE(10);
  let pos = 12;
  const questions = [];
  for (let i = 0; i < qdCount && pos < buf.length; i++) {
    const { name, offset } = decodeDnsName(buf, pos);
    pos = offset;
    if (pos + 4 > buf.length) break;
    const type = buf.readUInt16BE(pos);
    const cls = buf.readUInt16BE(pos + 2) & 0x7fff;
    pos += 4;
    questions.push({ name, type, cls });
  }
  const records = [];
  const totalRr = anCount + nsCount + arCount;
  for (let i = 0; i < totalRr && pos < buf.length; i++) {
    const { name, offset } = decodeDnsName(buf, pos);
    pos = offset;
    if (pos + 10 > buf.length) break;
    const type = buf.readUInt16BE(pos);
    const cls = buf.readUInt16BE(pos + 2) & 0x7fff;
    const ttl = buf.readUInt32BE(pos + 4);
    const rdLen = buf.readUInt16BE(pos + 8);
    pos += 10;
    if (pos + rdLen > buf.length) break;
    const rdata = buf.subarray(pos, pos + rdLen);
    const rPos = pos;
    pos += rdLen;

    const rec = { name, type, cls, ttl, parsed: null };
    if (type === 12) {
      // PTR
      rec.ptr = decodeDnsName(buf, rPos).name;
      rec.parsed = rec.ptr;
    } else if (type === 33 && rdLen >= 6) {
      // SRV
      const port = rdata.readUInt16BE(4);
      const target = decodeDnsName(buf, rPos + 6).name;
      rec.port = port;
      rec.target = target;
      rec.parsed = { port, target };
    } else if (type === 16) {
      // TXT
      const txt = {};
      let tPos = 0;
      while (tPos < rdata.length) {
        const l = rdata[tPos++];
        if (tPos + l > rdata.length) break;
        const s = rdata.subarray(tPos, tPos + l).toString('utf8');
        tPos += l;
        const eq = s.indexOf('=');
        if (eq > 0) txt[s.slice(0, eq)] = s.slice(eq + 1);
      }
      rec.txt = txt;
      rec.parsed = txt;
    } else if (type === 1 && rdLen === 4) {
      // A
      rec.ip = `${rdata[0]}.${rdata[1]}.${rdata[2]}.${rdata[3]}`;
      rec.parsed = rec.ip;
    }
    records.push(rec);
  }
  return { id, isResponse: (flags & 0x8000) !== 0, questions, records };
}

function getLocalIPv4Interfaces() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(nets)) {
    if (!Array.isArray(addrs)) continue;
    if (/vethernet|wsl|hyper-v|docker|vmware|virtualbox|loopback|tailscale|tun|tap/i.test(name)) continue;
    for (const a of addrs) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.')) {
        list.push(a.address);
      }
    }
  }
  if (!list.length) {
    for (const addrs of Object.values(nets)) {
      for (const a of addrs || []) {
        if ((a.family === 'IPv4' || a.family === 4) && !a.internal) list.push(a.address);
      }
    }
  }
  return list.length ? list : ['127.0.0.1'];
}

function getLocalIPv4() {
  return getLocalIPv4Interfaces()[0] || '127.0.0.1';
}

async function getRoutedIPv4() {
  // UDP connect selects a route without transmitting any packet. Advertising a
  // host-only adapter (e.g. VirtualBox "Ethernet 3") overwrites our mDNS A record.
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    let done = false;
    const finish = address => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve(address || getLocalIPv4());
    };
    const timer = setTimeout(() => finish(), 1500);
    socket.once('error', () => finish());
    try { socket.connect(9, '192.0.2.1', () => finish(socket.address().address)); }
    catch { finish(); }
  });
}


module.exports = {
  buildMdnsQuery,
  buildMdnsAnnouncement,
  parseMdnsPacket,
  getLocalIPv4,
  getRoutedIPv4,
};
