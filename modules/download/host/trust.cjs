'use strict';
// v0.8.5: the Download bridge (network downloads, yt-dlp / FFmpeg, clipboard) is given only to
// Charles' own Download module. A module that merely calls itself "download" is not enough:
// the installed files must match a package Charles knows (trusted.json, written by
// modules/download/scripts/pack.mjs), or the user loaded the folder in developer mode.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/** SHA-256 over every file of a module folder: "path\0sha256\n" lines, sorted by path. */
function packageDigest(dir) {
  const files = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) throw Error('link');
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) files.push(r);
    }
  };
  walk(dir, '');
  const lines = files
    .sort()
    .map((r) => r + '\0' + crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, ...r.split('/')))).digest('hex') + '\n');
  return crypto.createHash('sha256').update(lines.join('')).digest('hex');
}

function trustedList(file = path.join(__dirname, 'trusted.json')) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Array.isArray(v?.packages) ? v.packages : []).map((p) => String(p?.sha256 || '').toLowerCase()).filter((h) => /^[a-f0-9]{64}$/.test(h));
  } catch {
    return [];
  }
}

/** → { ok, reason } for the installed "download" module. Cached per installed version. */
function createTrust({ registry, list = trustedList() }) {
  let cache = null;
  return function check() {
    const m = registry.get('download');
    if (!m || m.enabled === false) return { ok: false, reason: 'off' };
    if (!(m.permissions || []).includes('download')) return { ok: false, reason: 'permission' };
    if (m.devPath) return registry.data?.dev === true ? { ok: true, reason: 'dev' } : { ok: false, reason: 'dev-off' };
    const key = [m.version, m.installedAt, m.updatedAt].join('|');
    if (!cache || cache.key !== key) {
      let digest = '';
      try {
        digest = packageDigest(registry.root('download'));
      } catch {}
      cache = { key, ok: !!digest && list.includes(digest), digest };
    }
    return cache.ok ? { ok: true, reason: 'trusted' } : { ok: false, reason: 'untrusted' };
  };
}

module.exports = { packageDigest, trustedList, createTrust };
