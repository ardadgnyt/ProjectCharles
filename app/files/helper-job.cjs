'use strict';
// v0.9.26: one short job of Charles' helper (charles-helper.exe --pdf / --image / --ocr): the request
// goes on stdin as one JSON line, each answer is a JSON line. The helper runs hidden, without a
// shell; a job that stops answering, or that the user cancels, is ended.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const MODES = new Set(['--pdf', '--image', '--ocr']);

function helperPath(appRoot) {
  return path.join(appRoot, 'app', 'system', 'charles-helper.exe');
}

/** Resolves with every answer line (parsed); rejects on a timeout, a cancel or a start failure. */
function helperJob(helper, mode, request, { signal, onLine = () => {}, idleMs = 90000, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    if (!MODES.has(mode)) return reject(Error('Geçersiz yardımcı işi.'));
    if (!helper || !fs.existsSync(helper)) return reject(Error('Charles yardımcısı bulunamadı; kurulumu onar.'));
    let child;
    try {
      child = spawnFn(helper, [mode], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (e) {
      return reject(e);
    }
    const lines = [];
    let finished = false;
    let timer;
    const end = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abort);
      try {
        child.kill();
      } catch {}
      error ? reject(error) : resolve(lines);
    };
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => end(Error('İşlem çok uzun sürdü; durduruldu.')), idleMs);
    };
    const abort = () => end(Object.assign(Error('İptal edildi.'), { cancelled: true }));
    if (signal?.aborted) return abort();
    signal?.addEventListener?.('abort', abort);
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      watch();
      let v;
      try {
        v = JSON.parse(line);
      } catch {
        return;
      }
      lines.push(v);
      try {
        onLine(v);
      } catch (e) {
        end(e);
      }
    });
    child.on('error', (e) => end(e));
    child.on('close', () => end());
    watch();
    child.stdin.end(asciiJson(request) + '\n');
  });
}


/**
 * v0.9.27: the request as JSON in plain ASCII (every other character as \uXXXX). A file called
 * "Başarı Durum Belgesi.pdf" used to reach the helper with its letters broken, because the helper read
 * the line in the console's code page, and the converter said "PDF bulunamadı". Escaped like this the
 * line means the same in every code page, so it is right even with a helper built before the fix.
 */
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

module.exports = { helperJob, helperPath, asciiJson };
