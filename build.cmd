@echo off
set "NODE_DIR=%ProgramFiles%\nodejs"
set "NPM=%NODE_DIR%\npm.cmd"
if not exist "%NPM%" (
  echo Node.js bulunamadi. https://nodejs.org adresinden kurun.
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
"%NPM%" run build %*
