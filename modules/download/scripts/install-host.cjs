'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] || 'C:\\Project Charles\\ProjectCharles v0.8.0 Beta');
const modDir = path.join(target, 'app', 'modules');
const hostFile = path.join(modDir, 'host.cjs'), preloadFile = path.join(modDir, 'module-preload.cjs');
const hostBefore = fs.readFileSync(hostFile, 'utf8'), preloadBefore = fs.readFileSync(preloadFile, 'utf8');
let host = hostBefore, preload = preloadBefore;
const newline = host.includes('\r\n') ? '\r\n' : '\n';
function insert(text, needle, value) {
  if (text.split(needle).length !== 2) throw Error('Charles sürümü ile köprü eşleşmedi; dosya değiştirilmedi: ' + needle);
  return text.replace(needle, value);
}
if (!host.includes('// Charles Download optional bridge')) {
  host = insert(host, '  const allow = rateLimiter();', [
    '  const allow = rateLimiter();',
    '  // Charles Download optional bridge.',
    "  const downloadBridge = fs.existsSync(path.join(__dirname, 'download', 'config.json'))",
    "    ? require('./download/bridge.cjs').createDownloadBridge({ registry, owners, sessionFor, open, deps })",
    '    : null;',
  ].join(newline));
  host = insert(host, '    const s = () => storage(id);', [
    "    if (method.startsWith('download.')) {",
    "      if (!downloadBridge) throw Error('Charles Download host eklentisi kurulu değil.');",
    '      return downloadBridge.call(id, method, args);',
    '    }',
    '    const s = () => storage(id);',
  ].join(newline));
}
if (!preload.includes('// Charles Download API')) {
  preload = insert(preload, '  apiVersion: 1,', [
    '  apiVersion: 1,',
    '  // Charles Download API; host restricts this capability to the download module.',
    '  download: {',
    "    state: () => call('download.state'),",
    "    inspect: (url) => call('download.inspect', { url }),",
    "    enqueue: (options) => call('download.enqueue', options),",
    "    control: (id, action) => call('download.control', { id, action }),",
    "    settings: (options) => call('download.settings', options),",
    "    clipboard: () => call('download.clipboard'),",
    "    folder: () => call('download.folder'),",
    "    chooseFolder: () => call('download.chooseFolder'),",
    "    reveal: (id) => call('download.reveal', { id }),",
    "    open: () => call('download.open'),",
    "    hide: () => call('download.hide'),",
    '  },',
  ].join(newline));
}
const backup = path.join(root, 'backups', crypto.createHash('sha256').update(target).digest('hex').slice(0, 10));
fs.mkdirSync(backup, { recursive: true });
for (const [name, value] of [['host.cjs', hostBefore], ['module-preload.cjs', preloadBefore]]) {
  const file = path.join(backup, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, value);
}
fs.writeFileSync(path.join(backup, 'target.txt'), target);
// Validate all changes before writing either original.
new Function(host); new Function(preload);
fs.mkdirSync(path.join(modDir, 'download'), { recursive: true });
for (const name of ['engine.cjs', 'bridge.cjs', 'trust.cjs']) fs.copyFileSync(path.join(root, 'host', name), path.join(modDir, 'download', name));
const config = {};
fs.writeFileSync(path.join(modDir, 'download', 'config.json'), JSON.stringify(config, null, 2));
// yt-dlp / FFmpeg are not part of this module; Charles provides them (tools/download).
fs.writeFileSync(hostFile, host); fs.writeFileSync(preloadFile, preload);
console.log('Download köprüsü hazır: ' + target);
console.log('Yedek: ' + backup);
console.log('Köprü için main.cjs değiştirilmedi. Etkinleşmesi için Charles yeniden başlatılmalı.');
