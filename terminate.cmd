@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%~dp0data\runtime\node-v24.18.0-win-x64\node.exe"
if exist "%NODE_EXE%" goto run

set "NODE_EXE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE (
  echo No TypingManiaNovel background service was running.
  exit /b 0
)

:run
"%NODE_EXE%" "%~dp0scripts\terminate-local-server.js"
exit /b %errorlevel%
