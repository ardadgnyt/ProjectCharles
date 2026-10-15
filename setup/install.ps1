# ProjectCharles kurulumu (Windows 10/11, x64).
#
# Install.cmd tarafından çalıştırılır. Yaptıkları:
#   1. Windows'u kontrol eder (64 bit, Windows 10 veya 11).
#   2. Charles'ı kısa bir klasöre kopyalar (varsayılan: C:\ProjectCharles v0.6.4 Beta).
#      Kaynak: yanındaki Charles.zip ya da setup klasörünün bulunduğu Charles klasörü.
#   3. İnternetten/USB'den gelen dosyaların "engelli" işaretini kaldırır.
#   4. Masaüstü ve Başlat menüsü kısayolu oluşturur.
#   5. Charles'ı açar.
# Yönetici izni gerekmez. Kullanıcı verisi (%APPDATA%\Charles) ilk açılışta oluşturulur.
param([string]$Root = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
$Version = 'v0.6.4 Beta'
$Name = "ProjectCharles $Version"
$DefaultTarget = "C:\$Name"
$Log = Join-Path $env:TEMP 'Charles-kurulum.log'
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color; Add-Content -Path $Log -Value $text -ErrorAction SilentlyContinue }
function Fail($text) { Say ''; Say "HATA: $text" 'Red'; Say "Ayrıntılar: $Log" 'DarkGray'; exit 1 }
function Ask($question, $default) {
  $answer = Read-Host $question
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
  return $answer.Trim()
}
function Yes($question) { return (Ask "$question (E/H)" 'E') -match '^[EeYy]' }

Set-Content -Path $Log -Value "Charles kurulumu $(Get-Date -Format s)" -ErrorAction SilentlyContinue
$Root = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
# Started from <Charles>\setup without a Charles.zip: the app folder is one level up.
if (-not (Test-Path -LiteralPath (Join-Path $Root 'Charles.zip')) -and -not (Test-Path -LiteralPath (Join-Path $Root 'node_modules\electron\dist\electron.exe'))) {
  $parent = Split-Path -Parent $Root
  if ($parent -and (Test-Path -LiteralPath (Join-Path $parent 'node_modules\electron\dist\electron.exe'))) { $Root = $parent }
}
Say ''
Say "  ProjectCharles $Version kurulumu" 'Cyan'
Say '  ------------------------------------' 'DarkGray'
Say ''

# 1. Windows ve işlemci
if (-not [Environment]::Is64BitOperatingSystem) { Fail 'Charles 64 bit Windows gerektirir.' }
$os = [Environment]::OSVersion.Version
if ($os.Major -lt 10) { Fail 'Charles Windows 10 veya 11 gerektirir.' }
# Windows 11 also reports version 10.0; build 22000 and later is Windows 11.
$winName = if ($os.Build -ge 22000) { 'Windows 11' } else { 'Windows 10' }
$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
Say "$winName (derleme $($os.Build)), işlemci: $arch" 'Green'
if ($arch -eq 'ARM64') {
  # Charles is an x64 app; Windows 11 on ARM runs it through its built-in x64 emulation.
  if ($os.Build -lt 22000) { Fail 'Bu bilgisayarın işlemcisi ARM64. Charles burada yalnızca Windows 11 ile (x64 öykünmesi) çalışabilir.' }
  Say 'ARM işlemci: Charles, Windows 11’in x64 öykünmesiyle çalışacak (biraz daha yavaş olabilir).' 'Yellow'
} elseif ($arch -ne 'AMD64') {
  Fail "Bu işlemci türü ($arch) desteklenmiyor. Charles 64 bit (x64) Windows gerektirir."
}

# Reads the PE header of a Windows program: 0x8664 = x64, 0xAA64 = ARM64, $null = not a program.
function Get-PeMachine($file) {
  try {
    $fs = [IO.File]::OpenRead($file)
    try { $b = New-Object byte[] 4096; $n = $fs.Read($b, 0, 4096) } finally { $fs.Dispose() }
  } catch { return $null }
  if ($n -lt 64 -or $b[0] -ne 0x4D -or $b[1] -ne 0x5A) { return $null }
  $o = [BitConverter]::ToInt32($b, 0x3C)
  if ($o -lt 0 -or ($o + 6) -gt $n) { return $null }
  if ($b[$o] -ne 0x50 -or $b[$o + 1] -ne 0x45 -or $b[$o + 2] -ne 0 -or $b[$o + 3] -ne 0) { return $null }
  return [BitConverter]::ToUInt16($b, $o + 4)
}

# Compares the installed files with charles-manifest.json (size of every file, SHA-256 of
# programs and libraries). Returns the paths that are missing or different.
function Test-Files($dir) {
  $bad = New-Object System.Collections.Generic.List[string]
  $manifest = Join-Path $dir 'charles-manifest.json'
  if (-not (Test-Path -LiteralPath $manifest)) { return $null }
  $m = [IO.File]::ReadAllText($manifest, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($p in $m.files.PSObject.Properties) {
    $f = Join-Path $dir ($p.Name -replace '/', '\')
    $item = Get-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    if (-not $item -or $item.Length -ne [long]$p.Value[0]) { $bad.Add($p.Name); continue }
    if ($p.Value[1] -and (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -ne ([string]$p.Value[1]).ToUpper()) { $bad.Add($p.Name) }
  }
  return ,$bad
}

# 2. Kaynak: Charles.zip veya Charles klasörü
$zip = Join-Path $Root 'Charles.zip'
$fromZip = Test-Path -LiteralPath $zip
$fromFolder = Test-Path -LiteralPath (Join-Path $Root 'node_modules\electron\dist\electron.exe')
if (-not $fromZip -and -not $fromFolder) {
  Fail 'Kurulacak dosyalar bulunamadı. Kurulum klasörünün (Charles.zip ile birlikte) ya da Charles klasörünün TAMAMINI kopyaladığından emin ol.'
}

# Kurulum yeri
Say ''
Say "Kurulum yeri: $DefaultTarget"
$target = Ask 'Başka bir yer istiyorsan yaz, yoksa Enter''a bas' $DefaultTarget
$target = [IO.Path]::GetFullPath($target).TrimEnd('\')
# node_modules içindeki uzun dosya yolları Windows'un 260 karakter sınırını aşmasın.
if ($target.Length -gt 80) { Fail "Kurulum yolu çok uzun ($($target.Length) karakter). C:\ altında kısa bir klasör seç." }
$same = $fromFolder -and -not $fromZip -and ($target -ieq $Root)

# Açık bir Charles varsa kapatılmasını iste
$running = @(Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object {
  try { $_.Path -and $_.Path.StartsWith($target, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
})
if ($running.Count -and -not $same) {
  Say ''
  Say 'Bu klasördeki Charles şu an açık. Sistem tepsisinden Charles → Çıkış yap, sonra devam et.' 'Yellow'
  [void](Read-Host 'Hazır olunca Enter')
}

if ($same) {
  Say 'Charles zaten bu klasörde; kopyalama atlandı.' 'Green'
} else {
  if ((Test-Path -LiteralPath $target) -and (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1)) {
    Say ''
    Say "$target zaten var. Dosyalar güncellenecek; sohbetlerin ve ayarların etkilenmez (%APPDATA%\Charles)." 'Yellow'
    if (-not (Yes 'Devam edilsin mi?')) { Say 'Kurulum iptal edildi.'; exit 2 }
  }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Say ''
  if ($fromZip) {
    Say 'Dosyalar çıkarılıyor (2 GB kadar, birkaç dakika sürebilir)…' 'Cyan'
    try { Unblock-File -LiteralPath $zip } catch {}
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
      # Windows PowerShell treats native stderr as an error under 'Stop'; tar is checked by exit code.
      $ErrorActionPreference = 'Continue'
      & $tar -xf "$zip" -C "$target"
      $ErrorActionPreference = 'Stop'
      if ($LASTEXITCODE -ne 0) { Fail "Arşiv çıkarılamadı (tar kodu $LASTEXITCODE). Diskte yer olduğundan emin ol." }
    } else {
      Expand-Archive -LiteralPath $zip -DestinationPath $target -Force
    }
  } else {
    Say 'Dosyalar kopyalanıyor (2 GB kadar, birkaç dakika sürebilir)…' 'Cyan'
    $ErrorActionPreference = 'Continue'
    & robocopy $Root $target /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD (Join-Path $Root '.git') /XF 'Charles.zip' | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ge 8) { Fail "Kopyalama başarısız (robocopy kodu $LASTEXITCODE)." }
  }
}

$exe = Join-Path $target 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $exe)) { Fail "Kurulum eksik: $exe bulunamadı." }

# Dosyaları doğrula; bozuk/eksik çıkan dosyaları Charles.zip'ten yeniden çıkar.
Say 'Dosyalar doğrulanıyor…' 'Cyan'
$bad = Test-Files $target
if ($null -eq $bad) {
  Say 'Doğrulama listesi yok (eski paket); yalnızca ana program denetlenecek.' 'DarkGray'
} elseif ($bad.Count) {
  Say "$($bad.Count) dosya eksik veya bozuk çıktı; yeniden çıkarılıyor…" 'Yellow'
  $bad | Select-Object -First 20 | ForEach-Object { Add-Content -Path $Log -Value "bozuk: $_" }
  if ($fromZip) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
      foreach ($name in $bad) {
        $entry = $archive.GetEntry($name)
        if (-not $entry) { continue }
        $file = Join-Path $target ($name -replace '/', '\')
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $file, $true)
      }
    } finally { $archive.Dispose() }
    $bad = Test-Files $target
  }
  if ($bad.Count) {
    Fail ("Bazı dosyalar hâlâ bozuk ($($bad.Count) dosya, ör. $($bad[0])). Charles.zip kopyalanırken bozulmuş olabilir; " +
      'kurulum klasörünü yeniden kopyalayıp tekrar dene. Klasör OneDrive içindeyse önce “Bu cihazda her zaman tut” seç.')
  }
  Say 'Dosyalar onarıldı.' 'Green'
} else {
  Say 'Tüm dosyalar doğru.' 'Green'
}
$machine = Get-PeMachine $exe
if ($machine -ne 0x8664 -and $fromZip) {
  # Eski paket (doğrulama listesi yok) ya da tar hatası: Electron'u .NET ile yeniden çıkar.
  Say 'Ana program bozuk çıktı; Electron dosyaları yeniden çıkarılıyor…' 'Yellow'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($zip)
  try {
    foreach ($entry in $archive.Entries) {
      if (-not $entry.FullName.StartsWith('node_modules/electron/dist/') -or -not $entry.Name) { continue }
      $file = Join-Path $target ($entry.FullName -replace '/', '\')
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $file, $true)
    }
  } finally { $archive.Dispose() }
  $machine = Get-PeMachine $exe
  if ($machine -eq 0x8664) { Say 'Electron onarıldı.' 'Green' }
}
if ($machine -ne 0x8664) {
  $size = (Get-Item -LiteralPath $exe).Length
  Fail ("Ana program (electron.exe, $size bayt) geçerli bir 64 bit Windows programı değil" +
    $(if ($null -eq $machine) { ' — dosya bozuk' } else { (' — tür 0x{0:X}' -f $machine) }) +
    '. Kurulum paketini yeniden kopyala.')
}

# 3. "Bu dosya başka bilgisayardan geldi" işaretini kaldır (SmartScreen / engelli DLL sorunları)
Say 'Güvenlik işaretleri temizleniyor…' 'Cyan'
Get-ChildItem -LiteralPath $target -Recurse -File -Include *.exe, *.dll, *.node, *.cmd, *.ps1, *.vbs, *.bat -ErrorAction SilentlyContinue |
  ForEach-Object { try { Unblock-File -LiteralPath $_.FullName } catch {} }

# 4. Kısayollar
$icon = Join-Path $target 'dist\charles.ico'
if (-not (Test-Path -LiteralPath $icon)) { $icon = "$exe,0" }
$shell = New-Object -ComObject WScript.Shell
$places = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'ProjectCharles')
)
foreach ($place in $places) {
  New-Item -ItemType Directory -Force -Path $place | Out-Null
  $link = $shell.CreateShortcut((Join-Path $place "$Name.lnk"))
  $link.TargetPath = $exe
  $link.Arguments = '"' + $target + '"'
  $link.WorkingDirectory = $target
  $link.IconLocation = $icon
  $link.Description = "$Name — masaüstü yapay zekâ asistanı"
  $link.Save()
}
Say 'Masaüstü ve Başlat menüsü kısayolları oluşturuldu.' 'Green'

# 5. Bitti
Say ''
Say "Kurulum tamamlandı: $target" 'Green'
Say ''
Say 'İlk açılışta:' 'Cyan'
Say '  • Sohbet için ChatGPT ile giriş yap (Claude / Gemini / Cursor: Ayarlar → Hesap).'
Say '  • E-posta ve takvim hesaplarını Ayarlar → Eklentiler bölümünden yeniden bağla'
Say '    (hesap anahtarları her bilgisayarda Windows ile ayrı şifrelenir).'
Say '  • Sohbetler ve hafıza bu bilgisayarda sıfırdan başlar (%APPDATA%\Charles).'
Say '  • Windows açılınca başlaması için: Ayarlar → Genel → Windows açılınca başlat.'
Say ''
if (Yes 'Charles şimdi açılsın mı?') {
  $env:ELECTRON_RUN_AS_NODE = $null
  try {
    Start-Process -FilePath $exe -ArgumentList ('"' + $target + '"') -WorkingDirectory $target
  } catch {
    Fail "Charles açılamadı: $($_.Exception.Message)"
  }
}
exit 0
