@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\playwright-core" call npm install
call npm run dry-run
pause
