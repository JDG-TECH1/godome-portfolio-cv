@echo off
setlocal
cd /d "%~dp0.."
node companion\server.mjs
if errorlevel 1 (
  echo.
  echo Le compagnon s'est arrete avec une erreur.
  pause
)
