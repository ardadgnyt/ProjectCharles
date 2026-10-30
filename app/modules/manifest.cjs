// v0.8.0: the manifest.json of a Charles module, checked strictly (docs/MODULES.md).
const CHARLES_API = 1;
const PERMISSIONS = {
  ai: 'Yapay zekâya soru sorabilir (Charles’ın bağlı modeliyle; sohbet geçmişine yazılmaz).',
  image: 'Görsel oluşturabilir (sohbetteki görsel aracıyla).',
  voice: 'Metni sesli okuyabilir.',
  // v0.8.5 / v0.8.6: Charles' download engine (any module may ask for it, like the others)
  download:
    'İnternetten video, ses ve dosya indirip İndirilenler klasörüne kaydeder; bunun için Charles’ın yt-dlp ve FFmpeg araçlarını çalıştırır, indirme kuyruğunu görebilir ve yönetebilir. İstersen panoya kopyaladığın bağlantıları da izler.',
  // v0.8.8: accessories on the desktop Slime while the module is open
  appearance:
    'Modül açıkken masaüstündeki Slime’a geçici aksesuar takabilir (ör. yuvarlak gözlük). Senin seçimin değişmez; modül kapanınca Slime eski hâline döner.',
  // v0.9.12: files.save / files.pick
  files:
    'Kaydet penceresiyle bilgisayarına dosya kaydedebilir, Aç penceresiyle seçtiğin dosyaları okuyabilir. Neyin ve nereye kaydedileceğini, hangi dosyanın açılacağını her seferinde sen seçersin; modül başka hiçbir dosyana erişemez.',
};
// every module has these
const DEFAULT_PERMISSIONS = {
  storage: 'Yalnızca kendi veri klasörüne dosya kaydedip okuyabilir.',
  slime: 'Slime’a ifade ve tepki yaptırabilir, görünümünü (renk, aksesuarlar) okuyabilir.',
  notify: 'Charles’ın bildirim balonunda kısa mesaj gösterebilir.',
};
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,30})?$/;
const KEYS = new Set(['id', 'name', 'version', 'author', 'description', 'charlesApi', 'entry', 'icon', 'window', 'permissions']);
const FILE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

const fail = (m) => {
  throw Error('Modül bilgileri (manifest.json) geçersiz: ' + m);
};
const text = (v, name, max, required = true) => {
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || !v.trim()) fail(`“${name}” alanı eksik veya boş.`);
  if (v.length > max) fail(`“${name}” en fazla ${max} karakter olabilir.`);
  return v.trim();
};
const relFile = (v, name, required) => {
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || !FILE.test(v) || v.split('/').some((p) => p === '..' || p === '.'))
    fail(`“${name}” modül içindeki bir dosya yolu olmalı (ör. index.html).`);
  return v;
};
const size = (v, name, min, max) => {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v) || v < min || v > max) fail(`“window.${name}” ${min} ile ${max} arasında bir tam sayı olmalı.`);
  return v;
};

/** The manifest object (already parsed) → a clean copy, or an error in Turkish. */
function validateManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) fail('bir JSON nesnesi olmalı.');
  for (const k of Object.keys(m)) if (!KEYS.has(k)) fail(`bilinmeyen alan “${k}”.`);
  if (typeof m.id !== 'string' || !ID.test(m.id)) fail('“id” küçük harf, rakam ve tireden oluşmalı (2–41 karakter, ör. hello).');
  const out = {
    id: m.id,
    name: text(m.name, 'name', 60),
    version: text(m.version, 'version', 40),
    author: text(m.author, 'author', 60),
    description: text(m.description, 'description', 300),
    charlesApi: m.charlesApi,
    entry: relFile(m.entry, 'entry', true),
    icon: relFile(m.icon, 'icon', false),
  };
  if (!SEMVER.test(out.version)) fail('“version” 1.0.0 biçiminde olmalı.');
  if (m.charlesApi !== CHARLES_API)
    fail(`bu Charles modül API sürümü ${CHARLES_API}’i destekliyor; modül “charlesApi: ${JSON.stringify(m.charlesApi)}” istiyor.`);
  if (!/\.html?$/i.test(out.entry)) fail('“entry” bir .html dosyası olmalı.');
  if (out.icon && !/\.(png|jpe?g|svg|webp)$/i.test(out.icon)) fail('“icon” .png, .jpg, .svg veya .webp olmalı.');
  const w = m.window === undefined ? {} : m.window;
  if (!w || typeof w !== 'object' || Array.isArray(w)) fail('“window” bir nesne olmalı.');
  for (const k of Object.keys(w)) if (!['width', 'height', 'minWidth', 'minHeight'].includes(k)) fail(`“window” içinde bilinmeyen alan “${k}”.`);
  out.window = {
    width: size(w.width, 'width', 320, 3840) ?? 1100,
    height: size(w.height, 'height', 240, 2160) ?? 760,
    minWidth: size(w.minWidth, 'minWidth', 320, 3840) ?? 480,
    minHeight: size(w.minHeight, 'minHeight', 240, 2160) ?? 360,
  };
  if (out.window.minWidth > out.window.width || out.window.minHeight > out.window.height)
    fail('“window.minWidth/minHeight” pencere boyutundan büyük olamaz.');
  const perms = m.permissions === undefined ? [] : m.permissions;
  if (!Array.isArray(perms)) fail('“permissions” bir liste olmalı.');
  const clean = [];
  for (const p of perms) {
    if (typeof p !== 'string') fail('“permissions” yalnızca metin içerebilir.');
    if (Object.hasOwn(DEFAULT_PERMISSIONS, p)) continue; // always granted
    if (!Object.hasOwn(PERMISSIONS, p)) fail(`bilinmeyen izin “${p}” (geçerli izinler: ${Object.keys(PERMISSIONS).join(', ')}).`);
    if (!clean.includes(p)) clean.push(p);
  }
  out.permissions = clean;
  return out;
}

function parseManifest(textValue) {
  let m;
  try {
    m = JSON.parse(String(textValue).replace(/^﻿/, ''));
  } catch {
    fail('JSON olarak okunamadı.');
  }
  return validateManifest(m);
}

/** "1.2.0" vs "1.10.0" → -1 / 0 / 1 (pre-release parts are ignored). */
function compareVersions(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number);
  const pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  return 0;
}

/** Permissions with their Turkish explanations (default ones included). */
function describePermissions(perms) {
  return [
    ...perms.map((p) => ({ id: p, text: PERMISSIONS[p], default: false })),
    ...Object.entries(DEFAULT_PERMISSIONS).map(([id, t]) => ({ id, text: t, default: true })),
  ];
}

module.exports = { validateManifest, parseManifest, compareVersions, describePermissions, PERMISSIONS, DEFAULT_PERMISSIONS, CHARLES_API, ID };
