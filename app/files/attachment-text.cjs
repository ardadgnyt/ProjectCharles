// Extract PDFs off the main thread. Chat providers have no local filesystem tools.
const { execFile } = require('node:child_process');
const path = require('node:path');
function pdfText(file) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(__dirname, 'pdf-text.cjs'), file], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
      timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8',
    }, (error, text) => {
      if (error) return reject(Error(path.basename(file) + ': PDF okunamadı; dosya bozuk veya parola korumalı olabilir.'));
      if (!text.trim()) return reject(Error('PDF içinde okunabilir metin yok. Taranmış belgede önce OCR kullan veya sayfaları görsel olarak GPT’ye ekle.'));
      resolve(text.slice(0, 900000));
    });
  });
}
module.exports = { pdfText };
