@echo off
rem ProjectCharles kurulum baslaticisi. Asil isi install.ps1 yapar.
rem Iki sekilde calisir:
rem   1) Kurulum klasorunde (Install.cmd + install.ps1 + Charles.zip)
rem   2) Charles klasorunun icinde (klasorun tamami baska bilgisayara kopyalandiysa)
setlocal
chcp 65001 >nul
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" set "PS1=%~dp0scripts\install.ps1"
if not exist "%PS1%" (
 echo install.ps1 bulunamadi. Kurulum klasorunun tamamini kopyaladigindan emin ol.
 pause
 exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Root "%~dp0."
set CODE=%ERRORLEVEL%
echo.
pause
exit /b %CODE%
