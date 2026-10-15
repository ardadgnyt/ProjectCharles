@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
 echo Charles hazir degil. Hazir paketi kullaniyorsan ZIP dosyasinin tamamini bir klasore cikart.
 echo GitHub'dan indirdiysen once su komutlari calistir: npm ci, npm run setup, npm run build
 pause
 exit /b 1
)
if not exist "%~dp0dist\renderer.js" (
 echo Arayuz derlenmemis. Bu klasorde once "npm run build" komutunu calistir.
 pause
 exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
