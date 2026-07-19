@echo off
setlocal
cd /d "%~dp0"

rem Launch the idempotent PowerShell bootstrapper without leaving a console open.
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" ^
  -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden ^
  -File "%~dp0start-game.ps1"

exit /b 0
