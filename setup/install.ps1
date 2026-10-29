# ProjectCharles setup (Windows 10/11, x64).
#
# Started by Install.cmd. Steps:
#   0. Asks for the setup language (English by default; every language Charles supports).
#      Charles starts in the same language (charles-install.json in the app folder).
#   1. Checks Windows (64-bit, Windows 10 or 11).
#   2. Copies Charles to a short folder (default: C:\ProjectCharles v0.9.10 Beta).
#      Source: Charles.zip next to this file, or the Charles folder that holds this setup folder.
#   3. Removes the "blocked" mark of files that came from the internet / a USB stick.
#   4. Creates desktop and Start menu shortcuts.
#   5. Opens Charles.
# No administrator rights needed. User data (%APPDATA%\Charles) is created on first start.
param([string]$Root = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
$Version = 'v0.9.10 Beta'
$Name = "ProjectCharles $Version"
$DefaultTarget = "C:\$Name"
$Log = Join-Path $env:TEMP 'Charles-setup.log'
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}

# ── Texts: English, Türkçe, Deutsch, Français, Español, 中文 ──────────────────────
$Langs = @('en', 'tr', 'de', 'fr', 'es', 'zh')
$LangNames = @('English', "Türkçe", 'Deutsch', "Français", "Español", "中文 (简体)")
$S = @{
  title = @("ProjectCharles {0} setup", "ProjectCharles {0} kurulumu", "ProjectCharles {0} – Installation", "Installation de ProjectCharles {0}", "Instalación de ProjectCharles {0}", "ProjectCharles {0} 安装程序")
  yesno = @("(Y/N)", "(E/H)", "(J/N)", "(O/N)", "(S/N)", "(Y/N)")
  error = @("ERROR: {0}", "HATA: {0}", "FEHLER: {0}", "ERREUR : {0}", "ERROR: {0}", "错误：{0}")
  details = @("Details: {0}", "Ayrıntılar: {0}", "Details: {0}", "Détails : {0}", "Detalles: {0}", "详细信息：{0}")
  langSet = @("Language: English. Charles will start in English.", "Dil: Türkçe. Charles Türkçe açılacak.", "Sprache: Deutsch. Charles startet auf Deutsch.", "Langue : français. Charles démarrera en français.", "Idioma: español. Charles se abrirá en español.", "语言：中文。Charles 将以中文启动。")
  need64 = @("Charles requires 64-bit Windows.", "Charles 64 bit Windows gerektirir.", "Charles benötigt 64-Bit-Windows.", "Charles nécessite Windows 64 bits.", "Charles requiere Windows de 64 bits.", "Charles 需要 64 位 Windows。")
  needWin = @("Charles requires Windows 10 or 11.", "Charles Windows 10 veya 11 gerektirir.", "Charles benötigt Windows 10 oder 11.", "Charles nécessite Windows 10 ou 11.", "Charles requiere Windows 10 u 11.", "Charles 需要 Windows 10 或 11。")
  osLine = @("{0} (build {1}), processor: {2}", "{0} (derleme {1}), işlemci: {2}", "{0} (Build {1}), Prozessor: {2}", "{0} (build {1}), processeur : {2}", "{0} (compilación {1}), procesador: {2}", "{0}（版本 {1}），处理器：{2}")
  armOld = @("This computer has an ARM64 processor. Charles runs here only on Windows 11 (x64 emulation).", "Bu bilgisayarın işlemcisi ARM64. Charles burada yalnızca Windows 11 ile (x64 öykünmesi) çalışabilir.", "Dieser Computer hat einen ARM64-Prozessor. Charles läuft hier nur unter Windows 11 (x64-Emulation).", "Cet ordinateur a un processeur ARM64. Charles n'y fonctionne qu'avec Windows 11 (émulation x64).", "Este equipo tiene un procesador ARM64. Charles solo funciona aquí con Windows 11 (emulación x64).", "此电脑使用 ARM64 处理器。Charles 仅能在 Windows 11 上通过 x64 仿真运行。")
  armNote = @("ARM processor: Charles will run through the x64 emulation of Windows 11 (it may be a little slower).", "ARM işlemci: Charles, Windows 11'in x64 öykünmesiyle çalışacak (biraz daha yavaş olabilir).", "ARM-Prozessor: Charles läuft über die x64-Emulation von Windows 11 (eventuell etwas langsamer).", "Processeur ARM : Charles passera par l'émulation x64 de Windows 11 (un peu plus lent).", "Procesador ARM: Charles usará la emulación x64 de Windows 11 (puede ir algo más lento).", "ARM 处理器：Charles 将通过 Windows 11 的 x64 仿真运行（可能稍慢）。")
  archBad = @("This processor type ({0}) is not supported. Charles requires 64-bit (x64) Windows.", "Bu işlemci türü ({0}) desteklenmiyor. Charles 64 bit (x64) Windows gerektirir.", "Dieser Prozessortyp ({0}) wird nicht unterstützt. Charles benötigt 64-Bit-Windows (x64).", "Ce type de processeur ({0}) n'est pas pris en charge. Charles nécessite Windows 64 bits (x64).", "Este tipo de procesador ({0}) no es compatible. Charles requiere Windows de 64 bits (x64).", "不支持此处理器类型（{0}）。Charles 需要 64 位（x64）Windows。")
  noFiles = @("The files to install were not found. Make sure you copied the WHOLE setup folder (with Charles.zip) or the whole Charles folder.", "Kurulacak dosyalar bulunamadı. Kurulum klasörünün (Charles.zip ile birlikte) ya da Charles klasörünün TAMAMINI kopyaladığından emin ol.", "Die Installationsdateien wurden nicht gefunden. Kopiere den GESAMTEN Setup-Ordner (mit Charles.zip) oder den ganzen Charles-Ordner.", "Fichiers d'installation introuvables. Copiez TOUT le dossier d'installation (avec Charles.zip) ou tout le dossier Charles.", "No se encontraron los archivos de instalación. Copia la carpeta de instalación COMPLETA (con Charles.zip) o toda la carpeta de Charles.", "未找到安装文件。请确认已复制完整的安装文件夹（包括 Charles.zip）或整个 Charles 文件夹。")
  place = @("Install location: {0}", "Kurulum yeri: {0}", "Installationsort: {0}", "Emplacement : {0}", "Ubicación: {0}", "安装位置：{0}")
  placeAsk = @("Type another location if you want, otherwise press Enter", "Başka bir yer istiyorsan yaz, yoksa Enter'a bas", "Gib einen anderen Ort ein oder drücke Enter", "Saisissez un autre emplacement ou appuyez sur Entrée", "Escribe otra ubicación o pulsa Enter", "如需其他位置请输入，否则按 Enter")
  pathLong = @("The install path is too long ({0} characters). Choose a short folder under C:\.", "Kurulum yolu çok uzun ({0} karakter). C:\ altında kısa bir klasör seç.", "Der Installationspfad ist zu lang ({0} Zeichen). Wähle einen kurzen Ordner unter C:\.", "Le chemin est trop long ({0} caractères). Choisissez un dossier court sous C:\.", "La ruta es demasiado larga ({0} caracteres). Elige una carpeta corta en C:\.", "安装路径过长（{0} 个字符）。请在 C:\ 下选择一个较短的文件夹。")
  running = @("Charles in this folder is open right now. Choose Charles → Quit in the system tray, then continue.", "Bu klasördeki Charles şu an açık. Sistem tepsisinden Charles → Çıkış yap, sonra devam et.", "Charles aus diesem Ordner ist gerade geöffnet. Wähle im Infobereich Charles → Beenden und fahre dann fort.", "Charles est ouvert depuis ce dossier. Choisissez Charles → Quitter dans la zone de notification, puis continuez.", "Charles de esta carpeta está abierto. Elige Charles → Salir en la bandeja del sistema y continúa.", "此文件夹中的 Charles 正在运行。请在系统托盘中选择 Charles → 退出，然后继续。")
  ready = @("Press Enter when ready", "Hazır olunca Enter", "Enter, wenn bereit", "Appuyez sur Entrée quand c'est prêt", "Pulsa Enter cuando estés listo", "准备好后按 Enter")
  same = @("Charles is already in this folder; copying skipped.", "Charles zaten bu klasörde; kopyalama atlandı.", "Charles ist bereits in diesem Ordner; Kopieren übersprungen.", "Charles est déjà dans ce dossier ; copie ignorée.", "Charles ya está en esta carpeta; se omite la copia.", "Charles 已在此文件夹中；跳过复制。")
  exists = @("{0} already exists. Its files will be updated; your chats and settings are not affected (%APPDATA%\Charles).", "{0} zaten var. Dosyalar güncellenecek; sohbetlerin ve ayarların etkilenmez (%APPDATA%\Charles).", "{0} existiert bereits. Die Dateien werden aktualisiert; Chats und Einstellungen bleiben erhalten (%APPDATA%\Charles).", "{0} existe déjà. Les fichiers seront mis à jour ; vos discussions et réglages ne sont pas touchés (%APPDATA%\Charles).", "{0} ya existe. Se actualizarán los archivos; tus chats y ajustes no cambian (%APPDATA%\Charles).", "{0} 已存在。将更新其中的文件；你的聊天和设置不受影响（%APPDATA%\Charles）。")
  goOn = @("Continue?", "Devam edilsin mi?", "Fortfahren?", "Continuer ?", "¿Continuar?", "是否继续？")
  cancelled = @("Setup cancelled.", "Kurulum iptal edildi.", "Installation abgebrochen.", "Installation annulée.", "Instalación cancelada.", "安装已取消。")
  extracting = @("Extracting files (about 2 GB, this can take a few minutes)…", "Dosyalar çıkarılıyor (2 GB kadar, birkaç dakika sürebilir)…", "Dateien werden entpackt (etwa 2 GB, kann einige Minuten dauern)…", "Extraction des fichiers (environ 2 Go, quelques minutes)…", "Extrayendo archivos (unos 2 GB, puede tardar unos minutos)…", "正在解压文件（约 2 GB，可能需要几分钟）…")
  tarFail = @("The archive could not be extracted (tar code {0}). Make sure there is space on the disk.", "Arşiv çıkarılamadı (tar kodu {0}). Diskte yer olduğundan emin ol.", "Das Archiv konnte nicht entpackt werden (tar-Code {0}). Prüfe den freien Speicherplatz.", "Impossible d'extraire l'archive (code tar {0}). Vérifiez l'espace disque.", "No se pudo extraer el archivo (código tar {0}). Comprueba el espacio en disco.", "无法解压归档（tar 代码 {0}）。请确认磁盘空间充足。")
  copying = @("Copying files (about 2 GB, this can take a few minutes)…", "Dosyalar kopyalanıyor (2 GB kadar, birkaç dakika sürebilir)…", "Dateien werden kopiert (etwa 2 GB, kann einige Minuten dauern)…", "Copie des fichiers (environ 2 Go, quelques minutes)…", "Copiando archivos (unos 2 GB, puede tardar unos minutos)…", "正在复制文件（约 2 GB，可能需要几分钟）…")
  copyFail = @("Copying failed (robocopy code {0}).", "Kopyalama başarısız (robocopy kodu {0}).", "Kopieren fehlgeschlagen (robocopy-Code {0}).", "Échec de la copie (code robocopy {0}).", "Error al copiar (código robocopy {0}).", "复制失败（robocopy 代码 {0}）。")
  missingExe = @("Installation incomplete: {0} not found.", "Kurulum eksik: {0} bulunamadı.", "Installation unvollständig: {0} nicht gefunden.", "Installation incomplète : {0} introuvable.", "Instalación incompleta: no se encontró {0}.", "安装不完整：未找到 {0}。")
  verifying = @("Checking files…", "Dosyalar doğrulanıyor…", "Dateien werden geprüft…", "Vérification des fichiers…", "Comprobando archivos…", "正在校验文件…")
  noManifest = @("No check list (older package); only the main program will be checked.", "Doğrulama listesi yok (eski paket); yalnızca ana program denetlenecek.", "Keine Prüfliste (älteres Paket); nur das Hauptprogramm wird geprüft.", "Pas de liste de contrôle (ancien paquet) ; seul le programme principal sera vérifié.", "No hay lista de comprobación (paquete antiguo); solo se comprobará el programa principal.", "没有校验清单（旧版安装包）；仅检查主程序。")
  badCount = @("{0} files are missing or damaged; extracting them again…", "{0} dosya eksik veya bozuk çıktı; yeniden çıkarılıyor…", "{0} Dateien fehlen oder sind beschädigt; sie werden erneut entpackt…", "{0} fichiers manquants ou endommagés ; nouvelle extraction…", "{0} archivos faltan o están dañados; extrayéndolos de nuevo…", "{0} 个文件缺失或损坏；正在重新解压…")
  stillBad = @("Some files are still damaged ({0} files, e.g. {1}). Charles.zip may have been damaged while copying; copy the setup folder again and retry. If the folder is in OneDrive, first choose ""Always keep on this device"".", "Bazı dosyalar hâlâ bozuk ({0} dosya, ör. {1}). Charles.zip kopyalanırken bozulmuş olabilir; kurulum klasörünü yeniden kopyalayıp tekrar dene. Klasör OneDrive içindeyse önce ""Bu cihazda her zaman tut"" seç.", "Einige Dateien sind weiterhin beschädigt ({0} Dateien, z. B. {1}). Charles.zip wurde beim Kopieren evtl. beschädigt; kopiere den Setup-Ordner erneut. Liegt der Ordner in OneDrive, wähle zuerst ""Immer auf diesem Gerät beibehalten"".", "Des fichiers sont encore endommagés ({0} fichiers, ex. {1}). Charles.zip a peut-être été abîmé pendant la copie ; recopiez le dossier d'installation et réessayez. Si le dossier est dans OneDrive, choisissez d'abord ""Toujours conserver sur cet appareil"".", "Algunos archivos siguen dañados ({0} archivos, p. ej. {1}). Charles.zip pudo dañarse al copiarlo; vuelve a copiar la carpeta de instalación. Si está en OneDrive, elige antes ""Mantener siempre en este dispositivo"".", "部分文件仍然损坏（{0} 个文件，例如 {1}）。Charles.zip 可能在复制时损坏；请重新复制安装文件夹后重试。如果文件夹位于 OneDrive 中，请先选择「始终保留在此设备上」。")
  repaired = @("Files repaired.", "Dosyalar onarıldı.", "Dateien repariert.", "Fichiers réparés.", "Archivos reparados.", "文件已修复。")
  allOk = @("All files are correct.", "Tüm dosyalar doğru.", "Alle Dateien sind korrekt.", "Tous les fichiers sont corrects.", "Todos los archivos son correctos.", "所有文件均正确。")
  exeBroken = @("The main program came out damaged; extracting the Electron files again…", "Ana program bozuk çıktı; Electron dosyaları yeniden çıkarılıyor…", "Das Hauptprogramm ist beschädigt; Electron-Dateien werden erneut entpackt…", "Le programme principal est endommagé ; nouvelle extraction des fichiers Electron…", "El programa principal está dañado; extrayendo de nuevo los archivos de Electron…", "主程序已损坏；正在重新解压 Electron 文件…")
  exeFixed = @("Electron repaired.", "Electron onarıldı.", "Electron repariert.", "Electron réparé.", "Electron reparado.", "Electron 已修复。")
  exeBad = @("The main program (electron.exe, {0} bytes) is not a valid 64-bit Windows program ({1}). Copy the setup package again.", "Ana program (electron.exe, {0} bayt) geçerli bir 64 bit Windows programı değil ({1}). Kurulum paketini yeniden kopyala.", "Das Hauptprogramm (electron.exe, {0} Bytes) ist kein gültiges 64-Bit-Windows-Programm ({1}). Kopiere das Installationspaket erneut.", "Le programme principal (electron.exe, {0} octets) n'est pas un programme Windows 64 bits valide ({1}). Recopiez le paquet d'installation.", "El programa principal (electron.exe, {0} bytes) no es un programa válido de Windows de 64 bits ({1}). Vuelve a copiar el paquete.", "主程序（electron.exe，{0} 字节）不是有效的 64 位 Windows 程序（{1}）。请重新复制安装包。")
  damaged = @("file damaged", "dosya bozuk", "Datei beschädigt", "fichier endommagé", "archivo dañado", "文件损坏")
  kind = @("type", "tür", "Typ", "type", "tipo", "类型")
  unblock = @("Clearing security marks…", "Güvenlik işaretleri temizleniyor…", "Sicherheitsmarkierungen werden entfernt…", "Suppression des marques de sécurité…", "Quitando marcas de seguridad…", "正在清除安全标记…")
  linkDesc = @("{0} — desktop AI assistant", "{0} — masaüstü yapay zekâ asistanı", "{0} — KI-Assistent für den Desktop", "{0} — assistant IA de bureau", "{0} — asistente de IA de escritorio", "{0} — 桌面 AI 助手")
  links = @("Desktop and Start menu shortcuts created.", "Masaüstü ve Başlat menüsü kısayolları oluşturuldu.", "Verknüpfungen auf dem Desktop und im Startmenü erstellt.", "Raccourcis créés sur le Bureau et dans le menu Démarrer.", "Accesos directos creados en el escritorio y en el menú Inicio.", "已创建桌面和开始菜单快捷方式。")
  done = @("Setup complete: {0}", "Kurulum tamamlandı: {0}", "Installation abgeschlossen: {0}", "Installation terminée : {0}", "Instalación completada: {0}", "安装完成：{0}")
  first = @("On first start:", "İlk açılışta:", "Beim ersten Start:", "Au premier démarrage :", "En el primer inicio:", "首次启动时：")
  tip1 = @("  • Sign in with ChatGPT to chat (Claude / Gemini / Cursor / Abacus AI: Settings → Account).", "  • Sohbet için ChatGPT ile giriş yap (Claude / Gemini / Cursor / Abacus AI: Ayarlar → Hesap).", "  • Melde dich zum Chatten mit ChatGPT an (Claude / Gemini / Cursor / Abacus AI: Einstellungen → Konto).", "  • Connectez-vous avec ChatGPT pour discuter (Claude / Gemini / Cursor / Abacus AI : Réglages → Compte).", "  • Inicia sesión con ChatGPT para chatear (Claude / Gemini / Cursor / Abacus AI: Ajustes → Cuenta).", "  • 使用 ChatGPT 登录即可聊天（Claude / Gemini / Cursor / Abacus AI：设置 → 账户）。")
  tip2 = @("  • Connect your e-mail and calendar accounts again in Settings → Extensions", "  • E-posta ve takvim hesaplarını Ayarlar → Eklentiler bölümünden yeniden bağla", "  • Verbinde E-Mail- und Kalenderkonten erneut unter Einstellungen → Erweiterungen", "  • Reconnectez vos comptes e-mail et agenda dans Réglages → Extensions", "  • Vuelve a conectar tus cuentas de correo y calendario en Ajustes → Extensiones", "  • 请在 设置 → 扩展 中重新连接邮箱和日历账户")
  tip2b = @("    (account keys are encrypted by Windows separately on each computer).", "    (hesap anahtarları her bilgisayarda Windows ile ayrı şifrelenir).", "    (Kontoschlüssel werden auf jedem Computer separat von Windows verschlüsselt).", "    (les clés de compte sont chiffrées par Windows sur chaque ordinateur).", "    (Windows cifra las claves de cuenta por separado en cada equipo).", "    （账户密钥在每台电脑上由 Windows 单独加密）。")
  tip3 = @("  • Chats and memory start fresh on this computer (%APPDATA%\Charles).", "  • Sohbetler ve hafıza bu bilgisayarda sıfırdan başlar (%APPDATA%\Charles).", "  • Chats und Gedächtnis beginnen auf diesem Computer neu (%APPDATA%\Charles).", "  • Les discussions et la mémoire repartent de zéro sur cet ordinateur (%APPDATA%\Charles).", "  • Los chats y la memoria empiezan de cero en este equipo (%APPDATA%\Charles).", "  • 聊天和记忆在此电脑上从头开始（%APPDATA%\Charles）。")
  tip4 = @("  • To start with Windows: Settings → General → Start with Windows.", "  • Windows açılınca başlaması için: Ayarlar → Genel → Windows açılınca başlat.", "  • Mit Windows starten: Einstellungen → Allgemein → Mit Windows starten.", "  • Démarrer avec Windows : Réglages → Général → Démarrer avec Windows.", "  • Para iniciar con Windows: Ajustes → General → Iniciar con Windows.", "  • 随 Windows 启动：设置 → 通用 → 随 Windows 启动。")
  openQ = @("Open Charles now?", "Charles şimdi açılsın mı?", "Charles jetzt öffnen?", "Ouvrir Charles maintenant ?", "¿Abrir Charles ahora?", "现在打开 Charles 吗？")
  openFail = @("Charles could not be opened: {0}", "Charles açılamadı: {0}", "Charles konnte nicht geöffnet werden: {0}", "Impossible d'ouvrir Charles : {0}", "No se pudo abrir Charles: {0}", "无法打开 Charles：{0}")
}
$L = 0
function T($key) {
  $a = $S[$key]
  if (-not $a) { return $key }
  if ($a[$L]) { return $a[$L] }
  return $a[0]
}

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color; Add-Content -Path $Log -Value $text -ErrorAction SilentlyContinue }
function Fail($text) { Say ''; Say ((T 'error') -f $text) 'Red'; Say ((T 'details') -f $Log) 'DarkGray'; exit 1 }
function Ask($question, $default) {
  $answer = Read-Host $question
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
  return $answer.Trim()
}
# Enter = yes. Y/E/J/O/S/是 = yes in the six languages.
function Yes($question) { return (Ask "$question $(T 'yesno')" 'y') -match '^[YyEeJjOoSs是]' }

Set-Content -Path $Log -Value "Charles setup $(Get-Date -Format s)" -ErrorAction SilentlyContinue

# 0. Language (English by default)
Write-Host ''
Write-Host '  Choose the setup language:' -ForegroundColor Cyan
for ($i = 0; $i -lt $Langs.Count; $i++) {
  $mark = if ($i -eq 0) { '   (default)' } else { '' }
  Write-Host ("   {0}) {1}{2}" -f ($i + 1), $LangNames[$i], $mark)
}
$pick = Read-Host '  Language [1]'
if ($pick -match '^\s*([1-6])\s*$') { $L = [int]$Matches[1] - 1 }
else {
  $code = "$pick".Trim().ToLower()
  $at = [array]::IndexOf($Langs, $code)
  if ($at -ge 0) { $L = $at }
}
$Lang = $Langs[$L]
Add-Content -Path $Log -Value "language: $Lang" -ErrorAction SilentlyContinue

$Root = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
# Started from <Charles>\setup without a Charles.zip: the app folder is one level up.
if (-not (Test-Path -LiteralPath (Join-Path $Root 'Charles.zip')) -and -not (Test-Path -LiteralPath (Join-Path $Root 'node_modules\electron\dist\electron.exe'))) {
  $parent = Split-Path -Parent $Root
  if ($parent -and (Test-Path -LiteralPath (Join-Path $parent 'node_modules\electron\dist\electron.exe'))) { $Root = $parent }
}
Say ''
Say ('  ' + ((T 'title') -f $Version)) 'Cyan'
Say '  ------------------------------------' 'DarkGray'
Say (T 'langSet') 'Green'
Say ''

# 1. Windows and processor
if (-not [Environment]::Is64BitOperatingSystem) { Fail (T 'need64') }
$os = [Environment]::OSVersion.Version
if ($os.Major -lt 10) { Fail (T 'needWin') }
# Windows 11 also reports version 10.0; build 22000 and later is Windows 11.
$winName = if ($os.Build -ge 22000) { 'Windows 11' } else { 'Windows 10' }
$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
Say ((T 'osLine') -f $winName, $os.Build, $arch) 'Green'
if ($arch -eq 'ARM64') {
  # Charles is an x64 app; Windows 11 on ARM runs it through its built-in x64 emulation.
  if ($os.Build -lt 22000) { Fail (T 'armOld') }
  Say (T 'armNote') 'Yellow'
} elseif ($arch -ne 'AMD64') {
  Fail ((T 'archBad') -f $arch)
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

# 2. Source: Charles.zip or a Charles folder
$zip = Join-Path $Root 'Charles.zip'
$fromZip = Test-Path -LiteralPath $zip
$fromFolder = Test-Path -LiteralPath (Join-Path $Root 'node_modules\electron\dist\electron.exe')
if (-not $fromZip -and -not $fromFolder) { Fail (T 'noFiles') }

# Install location
Say ''
Say ((T 'place') -f $DefaultTarget)
$target = Ask (T 'placeAsk') $DefaultTarget
$target = [IO.Path]::GetFullPath($target).TrimEnd('\')
# Long paths inside node_modules must stay under the 260-character limit of Windows.
if ($target.Length -gt 80) { Fail ((T 'pathLong') -f $target.Length) }
$same = $fromFolder -and -not $fromZip -and ($target -ieq $Root)

# Ask to close a Charles that is running from this folder
$running = @(Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object {
  try { $_.Path -and $_.Path.StartsWith($target, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
})
if ($running.Count -and -not $same) {
  Say ''
  Say (T 'running') 'Yellow'
  [void](Read-Host (T 'ready'))
}

if ($same) {
  Say (T 'same') 'Green'
} else {
  if ((Test-Path -LiteralPath $target) -and (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1)) {
    Say ''
    Say ((T 'exists') -f $target) 'Yellow'
    if (-not (Yes (T 'goOn'))) { Say (T 'cancelled'); exit 2 }
  }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Say ''
  if ($fromZip) {
    Say (T 'extracting') 'Cyan'
    try { Unblock-File -LiteralPath $zip } catch {}
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
      # Windows PowerShell treats native stderr as an error under 'Stop'; tar is checked by exit code.
      $ErrorActionPreference = 'Continue'
      & $tar -xf "$zip" -C "$target"
      $ErrorActionPreference = 'Stop'
      if ($LASTEXITCODE -ne 0) { Fail ((T 'tarFail') -f $LASTEXITCODE) }
    } else {
      Expand-Archive -LiteralPath $zip -DestinationPath $target -Force
    }
  } else {
    Say (T 'copying') 'Cyan'
    $ErrorActionPreference = 'Continue'
    & robocopy $Root $target /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD (Join-Path $Root '.git') /XF 'Charles.zip' | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ge 8) { Fail ((T 'copyFail') -f $LASTEXITCODE) }
  }
}

$exe = Join-Path $target 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $exe)) { Fail ((T 'missingExe') -f $exe) }

# Check the files; extract damaged or missing ones again from Charles.zip.
Say (T 'verifying') 'Cyan'
$bad = Test-Files $target
if ($null -eq $bad) {
  Say (T 'noManifest') 'DarkGray'
} elseif ($bad.Count) {
  Say ((T 'badCount') -f $bad.Count) 'Yellow'
  $bad | Select-Object -First 20 | ForEach-Object { Add-Content -Path $Log -Value "bad: $_" }
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
  if ($bad.Count) { Fail ((T 'stillBad') -f $bad.Count, $bad[0]) }
  Say (T 'repaired') 'Green'
} else {
  Say (T 'allOk') 'Green'
}
$machine = Get-PeMachine $exe
if ($machine -ne 0x8664 -and $fromZip) {
  # Older package (no check list) or a tar error: extract Electron again with .NET.
  Say (T 'exeBroken') 'Yellow'
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
  if ($machine -eq 0x8664) { Say (T 'exeFixed') 'Green' }
}
if ($machine -ne 0x8664) {
  $size = (Get-Item -LiteralPath $exe).Length
  $why = if ($null -eq $machine) { T 'damaged' } else { '{0} 0x{1:X}' -f (T 'kind'), $machine }
  Fail ((T 'exeBad') -f $size, $why)
}

# The chosen language: Charles reads it on its next start (app/core/install-language.cjs).
try {
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  $json = @{ language = $Lang; stamp = $stamp } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText((Join-Path $target 'charles-install.json'), $json, [Text.UTF8Encoding]::new($false))
} catch { Add-Content -Path $Log -Value "language file: $($_.Exception.Message)" -ErrorAction SilentlyContinue }

# 3. Remove the "came from another computer" mark (SmartScreen / blocked DLL problems)
Say (T 'unblock') 'Cyan'
Get-ChildItem -LiteralPath $target -Recurse -File -Include *.exe, *.dll, *.node, *.cmd, *.ps1, *.vbs, *.bat -ErrorAction SilentlyContinue |
  ForEach-Object { try { Unblock-File -LiteralPath $_.FullName } catch {} }

# 4. Shortcuts
$launcher = Join-Path $target 'Charles.exe'
$icon = Join-Path $target 'public\charles.ico'
if (-not (Test-Path -LiteralPath $icon)) { $icon = "$exe,0" }
$shell = New-Object -ComObject WScript.Shell
$places = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'ProjectCharles')
)
foreach ($place in $places) {
  New-Item -ItemType Directory -Force -Path $place | Out-Null
  $link = $shell.CreateShortcut((Join-Path $place "$Name.lnk"))
  $link.TargetPath = if (Test-Path -LiteralPath $launcher) { $launcher } else { $exe }
  $link.Arguments = if (Test-Path -LiteralPath $launcher) { '' } else { '"' + $target + '"' }
  $link.WorkingDirectory = $target
  $link.IconLocation = $icon
  $link.Description = (T 'linkDesc') -f $Name
  $link.Save()
}
$env:ELECTRON_RUN_AS_NODE = $null
$register = Join-Path $target 'setup\register-shortcuts.cjs'
$identityProcess = Start-Process -FilePath $exe -ArgumentList ('"' + $register + '"') -WorkingDirectory $target -WindowStyle Hidden -PassThru -Wait
if ($identityProcess.ExitCode -ne 0) { Add-Content -Path $Log -Value 'Shortcut identity registration failed; Charles will retry on startup.' }
Say (T 'links') 'Green'

# 5. Done
Say ''
Say ((T 'done') -f $target) 'Green'
Say ''
Say (T 'first') 'Cyan'
Say (T 'tip1')
Say (T 'tip2')
Say (T 'tip2b')
Say (T 'tip3')
Say (T 'tip4')
Say ''
if (Yes (T 'openQ')) {
  $env:ELECTRON_RUN_AS_NODE = $null
  try {
    Start-Process -FilePath $exe -ArgumentList ('"' + $target + '"') -WorkingDirectory $target
  } catch {
    Fail ((T 'openFail') -f $_.Exception.Message)
  }
}
exit 0
