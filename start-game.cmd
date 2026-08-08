@echo off
setlocal
cd /d "%~dp0"

rem Prefer PowerShell 7 when available, but keep Windows 11 zero-install compatibility.
set "TMN_PWSH="
if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "TMN_PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined TMN_PWSH if defined ProgramW6432 if exist "%ProgramW6432%\PowerShell\7\pwsh.exe" set "TMN_PWSH=%ProgramW6432%\PowerShell\7\pwsh.exe"
if not defined TMN_PWSH for /f "delims=" %%P in ('where pwsh 2^>nul') do if not defined TMN_PWSH set "TMN_PWSH=%%~fP"
if not defined TMN_PWSH set "TMN_PWSH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

rem Launch the idempotent PowerShell bootstrapper without leaving a console open.
start "" "%TMN_PWSH%" ^
  -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden ^
  -File "%~dp0start-game.ps1"

exit /b 0
