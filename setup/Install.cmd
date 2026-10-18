@echo off
rem ProjectCharles setup / kurulum. The work is done by install.ps1 next to this file.
rem Works in two ways:
rem   1) An installer kit: Install.cmd + install.ps1 + Charles.zip in one folder
rem   2) Inside a full Charles folder: <Charles>\setup\Install.cmd
setlocal
chcp 65001 >nul
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" (
 echo install.ps1 not found. Copy the whole setup folder and try again.
 echo install.ps1 bulunamadi. Kurulum klasorunun tamamini kopyala.
 pause
 exit /b 1
)
set "SRC=%~dp0."
if not exist "%~dp0Charles.zip" if exist "%~dp0..\node_modules\electron\dist\electron.exe" set "SRC=%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Root "%SRC%"
set CODE=%ERRORLEVEL%
echo.
pause
exit /b %CODE%
