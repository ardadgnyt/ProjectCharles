// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Older Charles updaters replace complete top-level directories. An update
// carries quickshare-tools/, then moves only this managed runtime into tools/.
// Never ship or replace tools/ wholesale: it holds unrelated AI/voice tools.
function migrateQuickShareRuntime(appRoot) {
  const root = path.resolve(appRoot);
  const incoming = path.join(root, 'quickshare-tools');
  const target = path.join(root, 'tools', 'quickshare');
  if (!fs.existsSync(incoming)) return target;
  if (!fs.statSync(path.join(incoming, 'python', 'python.exe')).isFile() ||
      !fs.statSync(path.join(incoming, 'bridge.py')).isFile()) throw Error('Quick Share güncelleme dosyaları eksik.');
  const previous = path.join(root, 'tools', '.quickshare-previous-' + crypto.randomUUID());
  // All recursive cleanup is confined to a freshly generated backup of the
  // application-managed runtime; no settings/download directories live here.
  if (![target, previous].every(p => p.startsWith(root + path.sep))) throw Error('Geçersiz çalışma klasörü.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let moved = false;
  if (fs.existsSync(target)) { fs.renameSync(target, previous); moved = true; }
  try { fs.renameSync(incoming, target); }
  catch (error) {
    if (moved) fs.renameSync(previous, target);
    throw error;
  }
  if (moved) {
    try { fs.rmSync(previous, { recursive: true }); } catch {} // locked remnants are harmless
  }
  return target;
}

module.exports = { migrateQuickShareRuntime };
