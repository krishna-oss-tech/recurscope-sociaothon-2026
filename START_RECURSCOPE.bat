@echo off
setlocal
cd /d "%~dp0"
title RecurScope MVP v0.5 Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-RecurScope.ps1"
if errorlevel 1 (
  echo.
  echo RecurScope did not start. Read the specific error above, then press any key to close.
  pause >nul
)
endlocal
