// Line-delimited JSON-RPC transport used to talk to the Codex app-server.
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');

// JSONL framing works across split UTF-8 chunks. No shell, local TCP listener or token copying.
class Rpc extends EventEmitter {
  constructor(command, args, options = {}) {
    super();
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.buffer = '';
    this.child = spawn(command, args, {
      ...options,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.receive(chunk));
    this.child.stdin.on('error', (e) => this.finish(e));
    // Drain diagnostics without exposing account data or writing them to disk.
    this.child.stderr.on('data', () => {});
    this.child.on('error', (e) => this.finish(e));
    this.child.on('exit', (code, signal) =>
      this.finish(new Error(`Codex bağlantısı kapandı (${signal ?? code}). Yeniden bağlanın.`)),
    );
  }
  receive(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 16 * 1024 * 1024) {
      this.finish(new Error('Codex mesaj boyutu sınırı aşıldı.'));
      this.child.kill();
      return;
    }
    let pos;
    while ((pos = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, pos);
      this.buffer = this.buffer.slice(pos + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        this.finish(new Error('Codex geçersiz bir protokol mesajı gönderdi.'));
        this.child.kill();
        return;
      }
      if (msg.method) this.emit(msg.id === undefined ? 'notification' : 'request', msg);
      else if (this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message || 'Codex isteği başarısız.'));
        else p.resolve(msg.result);
      }
    }
  }
  send(message) {
    if (this.closed) throw new Error('Codex bağlı değil.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex yanıt vermedi: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  finish(error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.emit('closed', error.message);
  }
  stop() {
    this.finish(new Error('Bağlantı sonlandırıldı.'));
    this.child.stdin.end();
    this.child.kill();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.child.unref();
  }
}
module.exports = { Rpc };
