// SPDX-License-Identifier: GPL-3.0-or-later
// MultiDrop protocol adaptation; see THIRD-PARTY-NOTICES.md.
'use strict';

// One reader owns the encrypted stream, including while the user is deciding.
// Inject the wire codec so the channel and the engine use exactly one schema.
module.exports = function secureChannel(socket, fq, session, wire, log = () => {}) {
  const { decodeFields: fields, pbFirst: first, buildKeepAliveFrame: keepAlive,
    buildPayloadTransferFrame: payloadFrame, buildDisconnectionFrame: disconnect } = wire;
  const queue = [], waiters = [], chunks = new Map();
  let terminal = null, stopped = false, queuedBytes = 0;
  let resolveEnded;
  const ended = new Promise(resolve => { resolveEnded = resolve; });
  const fail = error => {
    if (terminal) return;
    terminal = { kind: 'closed', error };
    resolveEnded(terminal);
    for (const w of waiters.splice(0)) { clearTimeout(w.timer); w.resolve(terminal); }
    chunks.clear();
  };
  const push = event => {
    if (terminal) return;
    const w = waiters.shift();
    if (w) { clearTimeout(w.timer); w.resolve(event); }
    else {
      queuedBytes += event.body?.length || 0;
      if (queuedBytes > 64 * 1024 * 1024 || queue.length >= 4096) {
        fail(Error('Quick Share alım kuyruğu sınırı aşıldı.'));
        socket.destroy();
      } else queue.push(event);
    }
  };
  // Encrypt/write synchronously to keep sequence numbers in wire order.
  const send = data => {
    if (terminal || stopped || socket.destroyed) return Promise.reject(terminal?.error || Error('Bağlantı kapalı.'));
    const encoded = session.encryptAndSign(data);
    return new Promise((resolve, reject) => {
      fq.writeFrame(encoded, err => err ? reject(err) : resolve());
    });
  };
  const next = (ms = 30000) => {
    if (queue.length) { const e = queue.shift(); queuedBytes -= e.body?.length || 0; return Promise.resolve(e); }
    if (terminal) return Promise.resolve(terminal);
    return new Promise((resolve, reject) => {
      const w = { resolve, timer: setTimeout(() => {
        const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1);
        reject(Error('Quick Share yanıt zaman aşımı.'));
      }, ms) };
      waiters.push(w);
    });
  };
  const parseSharing = body => {
    const v1 = fields(first(fields(body), 2));
    const type = Number(first(v1, 1) || 0);
    if (type === 6) throw Error('Karşı cihaz aktarımı iptal etti.');
    return { type, v1Fields: v1 };
  };
  const timer = setInterval(() => { send(keepAlive(false)).catch(fail); }, 5000);
  timer.unref?.();
  const reader = (async () => {
    try {
      while (!stopped && !terminal) {
        const plain = session.verifyAndDecrypt(await fq.nextFrame(120000));
        const v1 = fields(first(fields(plain), 2));
        const type = Number(first(v1, 1) || 0);
        if (type === 5) {
          const ka = fields(first(v1, 6));
          if (!Number(first(ka, 1) || 0)) await send(keepAlive(true, Number(first(ka, 2) || 0)));
        } else if (type === 6) {
          fail(Error('Karşı cihaz bağlantıyı sonlandırdı.'));
        } else if (type === 3) {
          const pt = fields(first(v1, 4));
          if (Number(first(pt, 1)) === 2) {
            const control = fields(first(pt, 4));
            if ([1, 2].includes(Number(first(control, 1)))) throw Error('Karşı cihaz dosya aktarımını durdurdu.');
            continue;
          }
          const hdr = fields(first(pt, 2)), chk = fields(first(pt, 3));
          const id = String(first(hdr, 1) ?? 0n);
          const payloadType = Number(first(hdr, 2));
          const total = Number(first(hdr, 3)), offset = Number(first(chk, 2) || 0);
          const body = first(chk, 3) || Buffer.alloc(0);
          const last = (Number(first(chk, 1) || 0) & 1) !== 0;
          if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(offset) || offset < 0) throw Error('Geçersiz dosya boyutu.');
          if (payloadType === 2) push({ kind: 'file', id, total, offset, body, last });
          else if (payloadType === 1) {
            if (total > 5 * 1024 * 1024 || (!chunks.has(id) && chunks.size >= 64)) throw Error('Quick Share mesaj sınırı aşıldı.');
            const item = chunks.get(id) || { parts: [], size: 0, total };
            if (offset !== item.size || item.total !== total || offset + body.length > total) throw Error('Quick Share parça sırası geçersiz.');
            item.parts.push(body); item.size += body.length; chunks.set(id, item);
            if (last) {
              if (item.size !== total) throw Error('Eksik Quick Share mesajı.');
              chunks.delete(id);
              push({ kind: 'bytes', id, body: Buffer.concat(item.parts) });
            }
          }
        }
      }
    } catch (error) { if (!stopped) { log('channel-error', error.message); fail(error); } }
    finally { clearInterval(timer); }
  })();
  return {
    ended, next, send, parseSharing,
    async sendSharing(body) {
      const id = require('node:crypto').randomBytes(8).readBigUInt64BE() & 0x7fffffffffffffffn;
      await send(payloadFrame({ id, type: 1, totalSize: body.length, body }));
      await send(payloadFrame({ id, type: 1, totalSize: body.length, offset: body.length, flags: 1 }));
    },
    async expect(type, ms = 30000) {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const e = await next(Math.max(1, deadline - Date.now()));
        if (e.kind === 'closed') throw e.error;
        if (e.kind !== 'bytes') throw Error('Dosya kabul edilmeden veri gönderildi.');
        const frame = parseSharing(e.body);
        log('sharing-frame', String(frame.type));
        if (frame.type === type) return frame;
        if (frame.type !== 5) throw Error(`Beklenmeyen Quick Share mesajı (${frame.type}, beklenen ${type}).`);
      }
      throw Error('Quick Share yanıt zaman aşımı.');
    },
    close() {
      if (stopped) return;
      if (!terminal && !socket.destroyed) fq.writeFrame(session.encryptAndSign(disconnect()));
      stopped = true; clearInterval(timer); fail(Error('Bağlantı kapatıldı.'));
      socket.end();
      const timeout = setTimeout(() => socket.destroy(), 1000); timeout.unref?.();
      socket.once('close', () => clearTimeout(timeout));
    },
  };
};
