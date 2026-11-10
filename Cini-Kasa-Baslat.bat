@echo off
chcp 65001 >nul
title KeyKitMedia - Cini Kasa
color 0E
cd /d "%~dp0"
echo.
echo   ==================================================
echo.
echo        K  E  Y  K  I  T  M  E  D  I  A
echo.
echo                   keykitmedia
echo   ==================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js kurulu degil.
  echo   https://nodejs.org adresinden LTS surumunu kurun,
  echo   sonra bu dosyayi tekrar calistirin.
  echo.
  pause
  exit /b 1
)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4173"
node sunucu.js
echo.
pause
