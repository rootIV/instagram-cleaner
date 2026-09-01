@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale o Node.js LTS e tente novamente.
  pause
  exit /b 1
)

if not exist "node_modules\playwright-core" (
  echo Instalando a dependencia local...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar a dependencia.
    pause
    exit /b 1
  )
)

call npm start
pause
