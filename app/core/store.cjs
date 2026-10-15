// Durable JSON storage: temp file + fsync + rename, .bak backup and corruption recovery.
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
function parse(file, validate) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (validate && !validate(value)) throw Error('Geçersiz kayıt yapısı');
  return value;
}
function writeDurable(file, text) {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function readStore(file, validate) {
  if (!fs.existsSync(file)) {
    // A crash between the two renames in writeStore leaves only .tmp / .bak behind.
    for (const candidate of [file + '.tmp', file + '.bak']) {
      try {
        const value = parse(candidate, validate);
        writeDurable(file + '.recovery', JSON.stringify(value));
        fs.renameSync(file + '.recovery', file);
        return { value, warning: null };
      } catch {}
    }
    return { value: null, warning: null };
  }
  try {
    return { value: parse(file, validate), warning: null };
  } catch (error) {
    const preserved = file + '.corrupt-' + Date.now() + '-' + randomUUID();
    fs.copyFileSync(file, preserved, fs.constants.COPYFILE_EXCL);
    let value = null;
    for (const candidate of [file + '.tmp', file + '.bak']) {
      try {
        value = parse(candidate, validate);
        break;
      } catch {}
    }
    if (value) {
      writeDurable(file + '.recovery', JSON.stringify(value));
      fs.renameSync(file + '.recovery', file);
    } else fs.unlinkSync(file);
    return {
      value,
      warning:
        path.basename(file) +
        ': bozuk kayıt ayrı bir dosyada korundu. ' +
        (value
          ? 'Sağlam yedek geri yüklendi.'
          : 'Okunabilir yedek yok; yeni kayıtla devam ediliyor.'),
    };
  }
}
// Cheap sanity check before the current file becomes the backup: a zero-filled or
// truncated-at-start file (typical after power loss) must not overwrite a good .bak.
function looksLikeJson(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(1);
    fs.readSync(fd, b, 0, 1, 0);
    return b[0] === 0x7b || b[0] === 0x5b;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
// Writes durably without re-reading the previous file (the history can be 15 MB+ and this
// runs on the main process): new content -> .tmp (fsync), current -> .bak, .tmp -> current.
function writeStore(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeDurable(file + '.tmp', JSON.stringify(value));
  if (fs.existsSync(file) && looksLikeJson(file)) fs.renameSync(file, file + '.bak');
  fs.renameSync(file + '.tmp', file);
}
module.exports = { readStore, writeStore };
