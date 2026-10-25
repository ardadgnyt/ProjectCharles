// v0.8.0: in-place updates from GitHub Releases.
//
// 1. check():   the newest release of ardadgnyt/ProjectCharles (GitHub API; when the API does
//               not answer, the project's GitHub page) compared with package.json as semver.
// 2. prepare(): downloads charles-update-<version>.zip and its .sha256, checks the SHA-256,
//               unpacks it into <app>\_update\stage (zip-slip, size and file-count checks) and
//               writes the PowerShell script that swaps the files.
// 3. The script (swapScript) runs after Charles quits: it moves the old app files that the zip
//    replaces into <app>\_update\backup, puts the new ones in place, rolls everything back on
//    any error and starts Charles again. %APPDATA%\Charles is never touched, and node_modules,
//    models and tools only when the zip contains them.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { unzipSync } = require('fflate');
const { cleanPath } = require('../modules/package.cjs');
const { zipChecksums, verifyZipFiles } = require('./zip-check.cjs');

const REPO = 'ardadgnyt/ProjectCharles';
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const API_LIST = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
const PAGE = `https://github.com/${REPO}`;
const PAGE_LATEST = `${PAGE}/releases/latest`;
// downloads only from GitHub (the release files are served from githubusercontent.com)
// v0.9.1: only GitHub's own release hosts (not raw.githubusercontent.com, which serves any
// repository's files), on the default port
const HOSTS = /^(github\.com|api\.github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|github-releases\.githubusercontent\.com)$/i;
const LIMITS = { zipBytes: 400 * 1024 * 1024, unpackedBytes: 1536 * 1024 * 1024, files: 40000, notes: 20000 };
// never written by an update, even if a zip contains them
const PROTECTED_TOP = new Set(['_update', '.git', 'charles-install.json', 'charles-creator.json', '.env', 'companion.json', 'personal.json', 'charles-history.json', 'preferences.json']);
const ASSET = /^charles-update-(.+)\.zip$/i;

class UpdateError extends Error {
  constructor(message, detail = '') {
    super(message);
    this.detail = detail;
  }
}
const fail = (m, d) => {
  throw new UpdateError(m, d);
};

// ── versions ─────────────────────────────────────────────────────────────────
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
function parseVersion(v) {
  const m = SEMVER.exec(String(v || '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].toLowerCase().split('.') : [] };
}
/** Semantic version order: -1, 0, 1 (1.0.0-beta.2 < 1.0.0-beta.10 < 1.0.0). Invalid → null. */
function compareVersions(a, b) {
  const x = parseVersion(a),
    y = parseVersion(b);
  if (!x || !y) return null;
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i],
      q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p),
      qn = /^\d+$/.test(q);
    if (pn && qn) return +p < +q ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}
/** "v0.8.1-beta.1", "ProjectCharles v0.8.1 Beta" → "0.8.1-beta.1" / "0.8.1" or null. */
function versionFromText(text) {
  const m = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/.exec(String(text || ''));
  return m ? m[1] : null;
}
/** "0.8.0-beta.1" → "v0.8.0 Beta" (the label Charles shows). */
function label(v) {
  const p = parseVersion(v);
  if (!p) return String(v || '');
  return `v${p.major}.${p.minor}.${p.patch}` + (p.pre[0] === 'beta' ? ' Beta' : p.pre.length ? '-' + p.pre.join('.') : '');
}

// ── release info ─────────────────────────────────────────────────────────────
/** A GitHub API release object → what Charles needs, or null. */
function releaseInfo(r) {
  if (!r || typeof r !== 'object' || r.draft) return null;
  const assets = Array.isArray(r.assets) ? r.assets : [];
  const zip = assets.find((a) => ASSET.test(String(a?.name || '')));
  const sha = zip && assets.find((a) => String(a?.name || '').toLowerCase() === String(zip.name).toLowerCase() + '.sha256');
  const version = (zip && ASSET.exec(zip.name)[1]) || versionFromText(r.tag_name) || versionFromText(r.name);
  if (!version || !parseVersion(version)) return null;
  return {
    version,
    label: label(version),
    tag: String(r.tag_name || ''),
    name: String(r.name || r.tag_name || '').slice(0, 200),
    notes: String(r.body || '').slice(0, LIMITS.notes),
    url: typeof r.html_url === 'string' && r.html_url.startsWith(PAGE) ? r.html_url : PAGE + '/releases',
    published: r.published_at || null,
    prerelease: !!r.prerelease,
    zip: zip ? { name: zip.name, url: zip.browser_download_url, size: Number(zip.size) || 0 } : null,
    sha: sha ? { url: sha.browser_download_url } : null,
  };
}

async function getJSON(fetchImpl, url) {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ProjectCharles-updater', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const e = new UpdateError('GitHub yanıt vermedi.', 'HTTP ' + res.status);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/** The GitHub page fallback: /releases/latest redirects to /releases/tag/<tag>. */
async function fromPage(fetchImpl) {
  const res = await fetchImpl(PAGE_LATEST, { redirect: 'follow', headers: { 'User-Agent': 'ProjectCharles-updater' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) fail('GitHub sayfasına ulaşılamadı.', 'HTTP ' + res.status);
  const m = /\/releases\/tag\/([^/?#]+)/.exec(res.url || '');
  if (!m) return null; // no release yet
  const tag = decodeURIComponent(m[1]);
  const version = versionFromText(tag);
  if (!version || !parseVersion(version)) return null;
  const name = `charles-update-${version}.zip`;
  const base = `${PAGE}/releases/download/${encodeURIComponent(tag)}/`;
  return {
    version,
    label: label(version),
    tag,
    name: tag,
    notes: '',
    url: `${PAGE}/releases/tag/${encodeURIComponent(tag)}`,
    published: null,
    prerelease: false,
    zip: { name, url: base + name, size: 0 },
    sha: { url: base + name + '.sha256' },
    guessed: true,
  };
}

/**
 * Newest release vs. the running version → { current, latest, available, source }.
 * Source order: API latest → API list (when "latest" is missing, e.g. only pre-releases) →
 * the GitHub page.
 */
async function check({ current, fetchImpl = globalThis.fetch }) {
  let latest = null,
    source = 'api';
  try {
    try {
      latest = releaseInfo(await getJSON(fetchImpl, API_LATEST));
    } catch (e) {
      if (e.status !== 404) throw e;
      const list = await getJSON(fetchImpl, API_LIST);
      for (const r of Array.isArray(list) ? list : []) {
        const info = releaseInfo(r);
        if (info && (!latest || compareVersions(info.version, latest.version) > 0)) latest = info;
      }
    }
  } catch (apiError) {
    source = 'page';
    try {
      latest = await fromPage(fetchImpl);
    } catch (pageError) {
      fail('Güncelleme bilgisi alınamadı. İnternet bağlantını kontrol edip yeniden dene.', [apiError.detail || apiError.message, pageError.detail || pageError.message].filter(Boolean).join(' · '));
    }
  }
  const available = !!latest && compareVersions(latest.version, current) > 0;
  return { current, currentLabel: label(current), latest, available, source, checkedAt: Date.now() };
}

// ── download and checks ──────────────────────────────────────────────────────
function allowedUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && HOSTS.test(url.hostname) && !url.port && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Streams a GitHub release file to `file`; at most `maxBytes`. → bytes written */
async function download(url, file, { fetchImpl = globalThis.fetch, maxBytes = LIMITS.zipBytes, onProgress = () => {}, signal } = {}) {
  if (!allowedUrl(url)) fail('Güncelleme dosyası GitHub dışından indirilmek istendi; durduruldu.', String(url).slice(0, 120));
  // v0.9.1: redirects are followed one by one, each target checked before it is asked
  let current = String(url),
    res = null;
  for (let hop = 0; ; hop++) {
    res = await fetchImpl(current, { redirect: 'manual', headers: { 'User-Agent': 'ProjectCharles-updater', Accept: 'application/octet-stream' }, signal });
    if (![301, 302, 303, 307, 308].includes(res.status)) break;
    if (hop >= 8) fail('Güncelleme dosyası çok fazla yönlendirildi; durduruldu.');
    let next = '';
    try {
      next = new URL(res.headers.get('location') || '', current).toString();
    } catch {}
    if (!allowedUrl(next)) fail('Güncelleme dosyası GitHub dışından indirilmek istendi; durduruldu.', next.slice(0, 120));
    try {
      await res.body?.cancel?.();
    } catch {}
    current = next;
  }
  // a fetch that cannot hand over redirects (opaque answer): the old way, final target checked
  if (res.type === 'opaqueredirect' || res.status === 0)
    res = await fetchImpl(current, { redirect: 'follow', headers: { 'User-Agent': 'ProjectCharles-updater', Accept: 'application/octet-stream' }, signal });
  if (res.url && !allowedUrl(res.url)) fail('Güncelleme dosyası GitHub dışından indirilmek istendi; durduruldu.', String(res.url).slice(0, 120));
  if (res.status === 404) fail('Bu sürüm için güncelleme dosyası (charles-update-….zip) yayında yok. GitHub sayfasından indirebilirsin.', 'HTTP 404');
  if (!res.ok || !res.body) fail('Güncelleme dosyası indirilemedi.', 'HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  if (total > maxBytes) fail('Güncelleme dosyası beklenenden büyük; indirilmedi.', total + ' B');
  const fd = fs.openSync(file, 'w');
  let got = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (got > maxBytes) {
        try {
          await reader.cancel();
        } catch {}
        fail('Güncelleme dosyası beklenenden büyük; indirilmedi.', got + ' B');
      }
      fs.writeSync(fd, value);
      onProgress(got, total);
    }
  } finally {
    fs.closeSync(fd);
  }
  return got;
}

/** "<64 hex>  charles-update-0.8.1.zip" → the hash (lower case) or null. */
function parseSha(text) {
  const m = /(?:^|\s)([a-f0-9]{64})(?:\s|$)/i.exec(String(text || ''));
  return m ? m[1].toLowerCase() : null;
}
function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

/**
 * Checks an update zip (bytes) without writing anything → { version, files: Map, top, bytes }.
 * The package.json inside must be Charles' (same name) and, when given, the expected version.
 */
function readUpdateZip(bytes, { name, expectVersion } = {}) {
  if (!bytes || bytes.length < 22) fail('Güncelleme dosyası geçerli bir .zip değil.');
  if (bytes.length > LIMITS.zipBytes) fail('Güncelleme dosyası beklenenden büyük; indirilmedi.');
  let count = 0,
    total = 0;
  const seen = new Set();
  let raw;
  try {
    const crcs = zipChecksums(bytes);
    raw = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      filter(file) {
        if (file.name.endsWith('/')) return false;
        const clean = cleanPath(file.name);
        const key = clean.toLowerCase();
        if (seen.has(key)) fail('Güncelleme paketinde aynı adlı iki dosya var.', clean);
        seen.add(key);
        if (++count > LIMITS.files) fail('Güncelleme paketinde çok fazla dosya var.', String(count));
        total += file.originalSize;
        if (total > LIMITS.unpackedBytes) fail('Güncelleme paketinin açılmış hali çok büyük.', Math.round(total / 1048576) + ' MB');
        return true;
      },
    });
    verifyZipFiles(crcs, raw);
  } catch (e) {
    if (e instanceof UpdateError) throw e;
    if (/aynı adlı|yolları çakışıyor/.test(e.message)) fail('Güncelleme paketinde aynı adlı iki dosya veya çakışan yol var.', e.message);
    if (/zip-slip|mutlak yol|ters bölü|geçersiz|ayrılmış|uzun bir dosya yolu|adı olmayan/i.test(e.message)) fail('Güncelleme paketinde güvenli olmayan bir dosya yolu var; kurulmadı.', e.message);
    fail('Güncelleme dosyası açılamadı (bozuk .zip).', e.message);
  }
  // v0.9.1: every file's checksum is compared with the zip's own record (a damaged file is
  // never unpacked as if it were whole)
  let files = new Map(Object.entries(raw).map(([n, d]) => [cleanPath(n), d]));
  // a zip whose files all sit in one top folder ("charles-update-0.8.1/package.json")
  if (!files.has('package.json')) {
    const tops = new Set([...files.keys()].map((n) => n.split('/')[0]));
    const top = tops.size === 1 ? [...tops][0] : null;
    if (top && files.has(top + '/package.json'))
      files = new Map([...files].map(([n, d]) => [n.slice(top.length + 1), d]));
  }
  if (!files.has('package.json')) fail('Güncelleme paketinde package.json yok; bu bir Charles güncellemesi değil.');
  let pkg;
  try {
    pkg = JSON.parse(Buffer.from(files.get('package.json')).toString('utf8'));
  } catch {
    fail('Güncelleme paketindeki package.json okunamadı.');
  }
  if (name && pkg.name !== name) fail('Güncelleme paketi başka bir uygulamaya ait; kurulmadı.', String(pkg.name).slice(0, 60));
  if (!parseVersion(pkg.version)) fail('Güncelleme paketindeki sürüm geçersiz.', String(pkg.version).slice(0, 40));
  if (expectVersion && compareVersions(pkg.version, expectVersion) !== 0)
    fail('Güncelleme paketinin sürümü beklenenle aynı değil; kurulmadı.', pkg.version + ' ≠ ' + expectVersion);
  const top = [...new Set([...files.keys()].map((n) => n.split('/')[0]))];
  const bad = top.find((t) => PROTECTED_TOP.has(t.toLowerCase()));
  if (bad) fail('Güncelleme paketi korunan bir dosyayı değiştirmek istiyor; kurulmadı.', bad);
  return { version: pkg.version, files, top, bytes: total };
}

/** Writes checked files into an empty folder. */
function writeFiles(files, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const base = path.resolve(dir);
  for (const [name, data] of files) {
    const out = path.resolve(base, ...name.split('/'));
    if (!out.startsWith(base + path.sep)) fail('Güncelleme paketinde güvenli olmayan bir dosya yolu var; kurulmadı.', name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  }
}

// ── the swap script ──────────────────────────────────────────────────────────
// Runs with Windows PowerShell after Charles has quit. Parameters are passed by name, so no
// path is ever pasted into the script text. CHARLES_UPDATE_TEST_FAIL=<name> makes it fail
// while placing that item (tests use it to check the roll-back).
const SWAP_SCRIPT = String.raw`# Charles update: swaps the app files, keeps a backup, rolls back on errors, restarts Charles.
param(
  [Parameter(Mandatory = $true)][string]$App,
  [Parameter(Mandatory = $true)][string]$Stage,
  [Parameter(Mandatory = $true)][string]$Backup,
  [Parameter(Mandatory = $true)][string]$Result,
  [string]$Ready = '',
  [int]$WaitPid = 0,
  [string]$Exe = '',
  [string]$AppArg = '',
  [string]$Version = '',
  [string]$Lang = 'tr'
)
$ErrorActionPreference = 'Stop'
$Log = Join-Path (Split-Path -Parent $Stage) 'update.log'
function Log($tr, $en) {
  $m = if ($Lang -eq 'tr') { $tr } else { $en }
  try { Add-Content -LiteralPath $Log -Value ((Get-Date -Format s) + ' ' + $m) -Encoding UTF8 } catch {}
}
function Save-Result($ok, $code, $message) {
  $o = [ordered]@{ ok = $ok; code = $code; version = $Version; message = $message; time = (Get-Date).ToString('s') }
  [IO.File]::WriteAllText($Result, ($o | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
}
function Retry([scriptblock]$Do) {
  for ($i = 0; $i -lt 15; $i++) {
    try { & $Do; return } catch { if ($i -eq 14) { throw }; Start-Sleep -Milliseconds 400 }
  }
}
function Start-Charles {
  if (-not $Exe) { return }
  try {
    $env:ELECTRON_RUN_AS_NODE = $null
    if ($AppArg) { Start-Process -FilePath $Exe -ArgumentList ('"' + $AppArg + '"') -WorkingDirectory $App }
    else { Start-Process -FilePath $Exe -WorkingDirectory $App }
  } catch { Log ('Charles yeniden başlatılamadı: ' + $_.Exception.Message) ('Charles could not be restarted: ' + $_.Exception.Message) }
}

# Validate every mutation target before moving or recursively removing files.
$sep = [IO.Path]::DirectorySeparatorChar
$App = [IO.Path]::GetFullPath($App).TrimEnd($sep)
$workRoot = $App + $sep + '_update' + $sep
foreach ($targetPath in @($Stage, $Backup, $Result)) {
  if (-not [IO.Path]::GetFullPath($targetPath).StartsWith($workRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Update path outside _update' }
}
if ($Ready) {
  if ([IO.Path]::GetFullPath($Ready) -ne ($workRoot + 'ready.json')) { throw 'Invalid ready path' }
  [IO.File]::WriteAllText($Ready, ('{"pid":' + $PID + '}'), [Text.UTF8Encoding]::new($false))
}
Log "Güncelleme başlıyor: $Version" "Update starting: $Version"
# 1. Wait until Charles (and its helper processes from this folder) have closed.
if ($WaitPid -gt 0) {
  try { Wait-Process -Id $WaitPid -Timeout 60 -ErrorAction Stop } catch {}
  if (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) {
    Save-Result $false 'app-running' 'Charles did not exit; no files were changed.'
    exit 1
  }
}
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Id -ne $PID -and $_.Path -and $_.Path.StartsWith(($App + $sep), [StringComparison]::OrdinalIgnoreCase) } catch { $false }
  })
  if (-not $left.Count) { break }
  Start-Sleep -Milliseconds 500
}

# 2. Swap: old item → backup, new item → app folder. Every step is recorded for the roll-back.
$items = @(Get-ChildItem -LiteralPath $Stage -Force)
if (-not $items.Count) { Save-Result $false 'empty' 'empty update'; Start-Charles; exit 1 }
try {
  if (Test-Path -LiteralPath $Backup) { Retry { Remove-Item -LiteralPath $Backup -Recurse -Force } }
  New-Item -ItemType Directory -Force -Path $Backup | Out-Null
} catch {
  Log ('Yedek klasörü hazırlanamadı: ' + $_.Exception.Message) ('The backup folder could not be prepared: ' + $_.Exception.Message)
  Save-Result $false 'backup' $_.Exception.Message
  Start-Charles
  exit 1
}
$done = New-Object System.Collections.ArrayList
try {
  foreach ($it in $items) {
    $name = $it.Name
    $dest = Join-Path $App $name
    $hadOld = Test-Path -LiteralPath $dest
    if ($hadOld) { Retry { Move-Item -LiteralPath $dest -Destination (Join-Path $Backup $name) -Force } }
    [void]$done.Add([pscustomobject]@{ Name = $name; HadOld = $hadOld })
    if ($env:CHARLES_UPDATE_TEST_FAIL -and $env:CHARLES_UPDATE_TEST_FAIL -eq $name) { throw "test: $name" }
    Retry { Move-Item -LiteralPath $it.FullName -Destination $dest -Force }
    Log "Yerleştirildi: $name" "Placed: $name"
  }
} catch {
  $err = $_.Exception.Message
  Log "Hata: $err. Eski dosyalar geri yükleniyor…" "Error: $err. Restoring the old files…"
  $restored = $true
  for ($i = $done.Count - 1; $i -ge 0; $i--) {
    $d = $done[$i]
    $dest = Join-Path $App $d.Name
    try {
      if (Test-Path -LiteralPath $dest) { Retry { Remove-Item -LiteralPath $dest -Recurse -Force } }
      if ($d.HadOld) { Retry { Move-Item -LiteralPath (Join-Path $Backup $d.Name) -Destination $dest -Force } }
    } catch {
      $restored = $false
      Log ('Geri yüklenemedi: ' + $d.Name + ' (' + $_.Exception.Message + '). Yedek: ' + $Backup) ('Could not restore: ' + $d.Name + ' (' + $_.Exception.Message + '). Backup: ' + $Backup)
    }
  }
  if ($restored) { Log 'Önceki sürüm geri yüklendi.' 'The previous version was restored.' }
  Save-Result $false $(if ($restored) { 'rolled-back' } else { 'restore-failed' }) $err
  Start-Charles
  exit 1
}
try { Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue } catch {}
Log "Güncelleme tamamlandı: $Version" "Update complete: $Version"
Save-Result $true 'updated' ''
Start-Charles
exit 0
`;

/**
 * Downloads, verifies and unpacks an update into <root>\_update. → { version, script, args }
 * where `args` are the PowerShell parameters for swap.ps1.
 */
async function prepare({ root, latest, name, fetchImpl = globalThis.fetch, onProgress = () => {}, signal }) {
  if (!latest?.zip?.url) fail('Bu sürüm için güncelleme dosyası (charles-update-….zip) yayında yok. GitHub sayfasından indirebilirsin.');
  if (!latest.sha?.url) fail('Güncelleme dosyasının SHA-256 değeri yayında yok; güvenlik için kurulmadı.');
  const work = path.join(root, '_update');
  fs.mkdirSync(work, { recursive: true });
  for (const f of ['charles-update.zip', 'charles-update.zip.sha256', 'result.json']) fs.rmSync(path.join(work, f), { force: true });
  const zipFile = path.join(work, 'charles-update.zip');
  onProgress({ phase: 'download', received: 0, total: latest.zip.size || 0 });
  const shaFile = path.join(work, 'charles-update.zip.sha256');
  await download(latest.sha.url, shaFile, { fetchImpl, maxBytes: 4096, signal });
  const expected = parseSha(fs.readFileSync(shaFile, 'utf8'));
  if (!expected) fail('SHA-256 dosyası okunamadı; güvenlik için kurulmadı.');
  await download(latest.zip.url, zipFile, {
    fetchImpl,
    signal,
    onProgress: (received, total) => onProgress({ phase: 'download', received, total: total || latest.zip.size || 0 }),
  });
  onProgress({ phase: 'verify' });
  const actual = sha256File(zipFile);
  if (actual !== expected) {
    fs.rmSync(zipFile, { force: true });
    fail('İndirilen dosya doğrulanamadı (SHA-256 uyuşmuyor); kurulmadı.', actual.slice(0, 12) + '… ≠ ' + expected.slice(0, 12) + '…');
  }
  onProgress({ phase: 'extract' });
  const pkg = readUpdateZip(fs.readFileSync(zipFile), { name, expectVersion: latest.version });
  writeFiles(pkg.files, path.join(work, 'stage'));
  const script = path.join(work, 'swap.ps1');
  fs.writeFileSync(script, '﻿' + SWAP_SCRIPT.replace(/\r?\n/g, '\r\n'), 'utf8');
  fs.rmSync(zipFile, { force: true });
  return {
    version: pkg.version,
    top: pkg.top,
    script,
    params: { App: root, Stage: path.join(work, 'stage'), Backup: path.join(work, 'backup'), Result: path.join(work, 'result.json'), Version: pkg.version },
  };
}

/** PowerShell command line for swap.ps1 (each value a separate argument). */
function swapArgs(script, params) {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script];
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') args.push('-' + k, String(v));
  return args;
}

/** Do not close the app until the independent worker has parsed its script and started. */
async function launchSwap({ script, params, timeoutMs = 12000 }) {
  const ready = path.join(params.App, '_update', 'ready.json');
  fs.rmSync(ready, { force: true });
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
  const command = '& ' + quote(script) + ' ' + Object.entries({ ...params, Ready: ready })
    .filter(([,v]) => v !== undefined && v !== null && v !== '')
    .map(([k,v]) => '-' + k + ' ' + quote(v)).join(' ');
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  // Start-Process creates a proper independent Windows process. A Node detached
  // powershell with hidden/ignored console handles can exit 0 before running -File.
  const launch = "$ErrorActionPreference='Stop'; $worker=Start-Process -FilePath " + quote(shell) +
    " -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand'," + quote(encoded) +
    ') -WindowStyle Hidden -WorkingDirectory ' + quote(path.dirname(script)) +
    ' -RedirectStandardOutput ' + quote(path.join(params.App, '_update', 'launch.log')) +
    ' -RedirectStandardError ' + quote(path.join(params.App, '_update', 'launch-error.log')) + ' -PassThru; $worker.Id';
  const pid = await new Promise((resolve, reject) => {
    require('node:child_process').execFile(shell,
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(launch, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: timeoutMs, encoding: 'utf8' }, (error, stdout) => {
        if (error || !/^\d+$/.test(stdout.trim())) return reject(new UpdateError('Güncelleyici başlatılamadı; Charles açık bırakıldı.', error?.message || stdout));
        resolve(Number(stdout.trim()));
      });
  });
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const ack = JSON.parse(fs.readFileSync(ready, 'utf8'));
      if (ack.pid === pid) return pid;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  try { process.kill(pid); } catch {}
  throw new UpdateError('Güncelleyici başlatılamadı; Charles açık bırakıldı.', '_update/launch-error.log');
}

/** The result of the last update (written by swap.ps1), read once. */
function takeResult(root) {
  const file = path.join(root, '_update', 'result.json');
  try {
    if (fs.statSync(file).size > 8192) return null;
    const v = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    fs.rmSync(file, { force: true });
    return v && typeof v === 'object' ? { ok: v.ok === true, code: String(v.code || ''), version: String(v.version || ''), message: String(v.message || '').slice(0, 300) } : null;
  } catch {
    return null;
  }
}

module.exports = {
  REPO,
  API_LATEST,
  PAGE,
  PAGE_LATEST,
  LIMITS,
  UpdateError,
  parseVersion,
  compareVersions,
  versionFromText,
  label,
  releaseInfo,
  check,
  allowedUrl,
  download,
  parseSha,
  sha256File,
  readUpdateZip,
  writeFiles,
  prepare,
  swapArgs,
  launchSwap,
  takeResult,
  SWAP_SCRIPT,
};
