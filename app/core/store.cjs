// Durable JSON storage: temp file + fsync + rename, .bak backup and corruption recovery.
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
function parse(file, validate) {
  for (let i = 0; ; i++) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (validate && !validate(value)) throw Error('Geçersiz kayıt yapısı');
      return value;
    } catch (e) {
      if (i < 4 && ['EPERM', 'EBUSY', 'EACCES'].includes(e?.code)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (i + 1));
        continue;
      }
      throw e;
    }
  }
}
function backupCandidates(file) {
  const list = [file + '.tmp', file + '.tmp-a', file + '.bak'];
  try {
    const dir = path.dirname(file);
    const prefix = path.basename(file) + '.corrupt-';
    const corrupts = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith(prefix))
      .sort()
      .reverse()
      .map((n) => path.join(dir, n));
    list.push(...corrupts);
  } catch {}
  return list;
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
    for (const candidate of backupCandidates(file)) {
      try {
        const value = parse(candidate, validate);
        writeDurable(file + '.recovery', JSON.stringify(value));
        renameRetry(file + '.recovery', file);
        return { value, warning: null };
      } catch {}
    }
    return { value: null, warning: null };
  }
  try {
    return { value: parse(file, validate), warning: null };
  } catch (error) {
    const preserved = file + '.corrupt-' + Date.now() + '-' + randomUUID();
    try {
      fs.copyFileSync(file, preserved, fs.constants.COPYFILE_EXCL);
    } catch {}
    let value = null;
    for (const candidate of backupCandidates(file)) {
      if (candidate === preserved) continue;
      try {
        value = parse(candidate, validate);
        break;
      } catch {}
    }
    if (value) {
      writeDurable(file + '.recovery', JSON.stringify(value));
      renameRetry(file + '.recovery', file);
    } else {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
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
function recoverNonEmpty(file, validate, hasItems) {
  for (const candidate of backupCandidates(file)) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const value = parse(candidate, validate);
      if (hasItems(value)) {
        writeDurable(file + '.recovery', JSON.stringify(value));
        renameRetry(file + '.recovery', file);
        return value;
      }
    } catch {}
  }
  return null;
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
// v0.8.8: on Windows a rename fails now and then with EPERM / EBUSY / EACCES while the search
// indexer, an antivirus or OneDrive holds the file for a moment; try a few times before giving up.
function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(from, to);
    } catch (e) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (i + 1));
    }
  }
}
function writeStore(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeDurable(file + '.tmp', JSON.stringify(value));
  if (fs.existsSync(file) && looksLikeJson(file)) renameRetry(file, file + '.bak');
  renameRetry(file + '.tmp', file);
}
module.exports = { readStore, writeStore, recoverNonEmpty };
