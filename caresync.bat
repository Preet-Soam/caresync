@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CareSync launcher

:menu
cls
echo ==============================
echo       CareSync launcher
echo ==============================
echo 1. Start
echo 2. End
echo.
choice /C 12 /N /M "Choose an option: "
if errorlevel 2 goto stop
if errorlevel 1 goto start

:start
call :checkNode || goto pausemenu
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing required packages...
  call npm ci
  if errorlevel 1 (
    echo Package installation failed.
    goto pausemenu
  )
)
if exist ".caresync-dev.pid" (
  call :checkExisting
  if not errorlevel 1 (
    echo CareSync is already running at http://127.0.0.1:5173
    start "" "http://127.0.0.1:5173"
    goto pausemenu
  )
  del /q ".caresync-dev.pid" >nul 2>&1
)
echo Starting CareSync...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath $env:ComSpec -ArgumentList '/k','npm run dev -- --host 127.0.0.1 --strictPort' -WorkingDirectory '%CD%' -WindowStyle Normal -PassThru; Set-Content -LiteralPath '%CD%\.caresync-dev.pid' -Value $p.Id"
if errorlevel 1 (
  echo Could not start CareSync.
  goto pausemenu
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5173"
echo CareSync is running at http://127.0.0.1:5173
goto pausemenu

:stop
if not exist ".caresync-dev.pid" (
  echo No CareSync process was started by this launcher.
  goto end
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='.caresync-dev.pid'; $idText=(Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Select-Object -First 1); $id=0; if(-not [int]::TryParse($idText,[ref]$id)){ Write-Output 'The saved process ID is invalid.'; exit 1 }; $p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction SilentlyContinue; if(-not $p){ Remove-Item -LiteralPath $f -Force; Write-Output 'CareSync is already stopped.'; exit 0 }; if($p.CommandLine -notmatch 'npm run dev -- --host 127\.0\.0\.1 --strictPort'){ Write-Output 'The saved process does not match the CareSync server. Nothing was stopped.'; exit 1 }; & taskkill.exe /PID $id /T /F; if($LASTEXITCODE -eq 0){ Remove-Item -LiteralPath $f -Force; Write-Output 'CareSync has been stopped.'; exit 0 }; exit 1"
goto end

:checkNode
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org/ and reopen this launcher.
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js 20 or newer from https://nodejs.org/.
  exit /b 1
)
for /f "tokens=1 delims=." %%a in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%a"
if not defined NODE_MAJOR (
  echo Could not read the Node.js version.
  exit /b 1
)
if %NODE_MAJOR% LSS 20 (
  echo Node.js 20 or newer is required. Current major version: %NODE_MAJOR%
  exit /b 1
)
exit /b 0

:checkExisting
powershell -NoProfile -ExecutionPolicy Bypass -Command "$idText=(Get-Content -LiteralPath '.caresync-dev.pid' -ErrorAction SilentlyContinue | Select-Object -First 1); $id=0; if(-not [int]::TryParse($idText,[ref]$id)){ exit 1 }; $p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction SilentlyContinue; if($p -and $p.CommandLine -match 'npm run dev -- --host 127\.0\.0\.1 --strictPort'){ exit 0 }; exit 1"
exit /b %errorlevel%

:pausemenu
echo.
pause
goto menu

:end
endlocal
