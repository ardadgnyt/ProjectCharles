// Read-only POP3 over TLS for school mail.
const tls = require('node:tls');
const { simpleParser } = require('mailparser');
class POP3 {
  constructor(config, connect = tls.connect) {
    this.config = config;
    this.connect = connect;
    this.lines = [];
    this.buffer = Buffer.alloc(0);
    this.bytes = 0;
    this.waiter = null;
    this.failure = null;
  }
  async open() {
    const c = this.config;
    if (!c.host || !c.user || !c.password || /[\r\n\0]/.test(c.user + c.password))
      throw Error('POP3 kullanıcı adı/şifre biçimi geçersiz.');
    this.socket = this.connect({
      host: c.host,
      port: c.port || 995,
      servername: c.host,
      rejectUnauthorized: true,
    });
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.bytes += chunk.length;
      if (this.bytes > 12 * 1024 * 1024)
        return this.fail(Error('POP3 mesajı çok büyük; webmail üzerinden aç.'));
      let index;
      while ((index = this.buffer.indexOf('\r\n')) !== -1) {
        const line = this.buffer.subarray(0, index).toString('latin1');
        this.buffer = this.buffer.subarray(index + 2);
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          clearTimeout(w.timer);
          w.resolve(line);
        } else this.lines.push(line);
      }
    });
    this.socket.on('error', (e) =>
      this.fail(
        Error(
          e.code === 'ECONNREFUSED'
            ? 'POP3 bağlantısı reddedildi. Sunucu adresi ve TLS 995 portunu kontrol et.'
            : /CERT|TLS|SSL/.test(e.code || '')
              ? 'POP3 sunucusunun güvenli bağlantısı doğrulanamadı. Sertifikayı okul bilişimine kontrol ettir.'
              : 'POP3 sunucusuna bağlanılamadı. Ağ ve sunucu ayarlarını kontrol et.',
        ),
      ),
    );
    this.socket.on('close', () => this.fail(Error('POP3 bağlantısı kapandı.')));
    this.deadline = setTimeout(() => this.fail(Error('POP3 işlemi zaman aşımına uğradı.')), 60000);
    const greeting = await this.line();
    if (!greeting.startsWith('+OK')) throw Error('Sunucu POP3 bağlantısını kabul etmedi.');
    await this.command('USER ' + c.user);
    await this.command('PASS ' + c.password);
  }
  fail(e) {
    if (this.failure) return;
    this.failure = e;
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.reject(e);
      this.waiter = null;
    }
    this.socket?.destroy();
  }
  line() {
    if (this.failure) return Promise.reject(this.failure);
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    return new Promise((resolve, reject) => {
      this.waiter = {
        resolve,
        reject,
        timer: setTimeout(() => this.fail(Error('POP3 sunucusu yanıt vermedi.')), 15000),
      };
    });
  }
  async command(command, multiline = false, limit = 2 * 1024 * 1024) {
    if (!/^(USER |PASS |UIDL$|TOP \d+ 0$|RETR \d+$|QUIT$)/.test(command) || /[\r\n]/.test(command))
      throw Error('Geçersiz POP3 komutu.');
    this.bytes = 0;
    this.socket.write(command + '\r\n', 'utf8');
    const status = await this.line();
    if (!status.startsWith('+OK')) {
      const error = Error(
        command.startsWith('PASS ') || command.startsWith('USER ')
          ? 'Okul maili kullanıcı adı veya şifresi kabul edilmedi. Tam e-posta adresini ve POP erişim iznini kontrol et.'
          : 'POP3 sunucusu bu okuma komutunu desteklemiyor.',
      );
      error.popNegative = true;
      throw error;
    }
    if (!multiline) return status;
    const rows = [];
    let size = 0;
    for (;;) {
      let line = await this.line();
      if (line === '.') break;
      if (line.startsWith('..')) line = line.slice(1);
      size += line.length + 2;
      if (size > limit) {
        this.fail(Error('Mail okuma sınırını aşıyor; webmail üzerinden aç.'));
        throw this.failure;
      }
      rows.push(line);
    }
    return Buffer.from(rows.join('\r\n') + '\r\n', 'latin1');
  }
  async ids() {
    const raw = (await this.command('UIDL', true)).toString('ascii');
    return raw
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = /^(\d+) ([!-~]+)$/.exec(line);
        if (!match) throw Error('POP3 mesaj kimliği okunamadı.');
        return { number: Number(match[1]), uid: match[2] };
      });
  }
  async message(number, headers = false) {
    let raw;
    if (headers) {
      try {
        raw = await this.command('TOP ' + number + ' 0', true, 262144);
      } catch (e) {
        if (!e.popNegative) throw e;
        raw = await this.command('RETR ' + number, true, 8 * 1024 * 1024);
      }
    } else raw = await this.command('RETR ' + number, true, 8 * 1024 * 1024);
    return simpleParser(raw, {
      skipHtmlToText: false,
      skipImageLinks: true,
      maxHtmlLengthToParse: 300000,
    });
  }
  async close() {
    try {
      if (this.socket && !this.failure) await this.command('QUIT');
    } catch {
    } finally {
      clearTimeout(this.deadline);
      this.socket?.destroy();
    }
  }
}
async function readPOP3(config, selected, connect) {
  const client = new POP3(config, connect);
  try {
    await client.open();
    const ids = await client.ids();
    if (selected) {
      const id = ids.find((r) => 'pop3:' + r.uid === selected);
      if (!id) throw Error('Mail sunucuda bulunamadı. Listeyi yenile.');
      return String((await client.message(id.number)).text || '').slice(0, 30000);
    }
    const rows = [];
    for (const id of ids.slice(-25).reverse()) {
      const m = await client.message(id.number, true);
      rows.push({
        id: 'pop3:' + id.uid,
        title: m.subject || '(Konu yok)',
        from: m.from?.text || '',
        date: m.date?.toISOString(),
        text: '',
        unread: true,
      });
    }
    return rows;
  } finally {
    await client.close();
  }
}
module.exports = { POP3, readPOP3 };
