@echo off
setlocal
cd /d "%~dp0"
echo DIKKAT: Bu islem Charles ayarlarini ve sohbet gecmisini yedekleyip sifirlar.
echo Yedek %APPDATA%\Charles\reset-backup-... klasorune alinir.
choice /M "Devam edilsin mi"
if errorlevel 2 exit /b 0
set ELECTRON_RUN_AS_NODE=
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0." --reset-local
