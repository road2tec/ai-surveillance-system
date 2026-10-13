@echo off
REM One-time installer for a new Windows laptop.
REM Installs Node packages, the Python environment, creates .env files and downloads the AI models.
setlocal
cd /d "%~dp0"

echo.
echo === 1/5 Checking required tools ===
where node >nul 2>nul || (echo [X] Node.js not found. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
where git >nul 2>nul || (echo [X] Git not found. Install it from https://git-scm.com/download/win and run this again. & pause & exit /b 1)

REM Find Python 3.10 - 3.12 (PyTorch does not support every newer release yet)
set "PY="
for %%v in (3.12 3.11 3.10) do (
  if not defined PY (
    py -%%v -c "print(1)" >nul 2>nul && set "PY=py -%%v"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)" >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo [X] Python 3.10, 3.11 or 3.12 not found. Install Python 3.12 from https://www.python.org/downloads/
  echo     and tick "Add python.exe to PATH" in the installer.
  pause & exit /b 1
)
echo [OK] Node, Git and Python found ^(%PY%^)

echo.
echo === 2/5 Installing Node.js packages ===
call npm install --no-audit --no-fund || goto :fail
call npm --prefix server install --no-audit --no-fund || goto :fail
call npm --prefix client install --no-audit --no-fund || goto :fail

echo.
echo === 3/5 Creating Python environment and installing AI packages (5-15 minutes) ===
if not exist "ai-service\venv\Scripts\python.exe" (
  %PY% -m venv ai-service\venv || goto :fail
)
ai-service\venv\Scripts\python -m pip install --upgrade pip
ai-service\venv\Scripts\python -m pip install -r ai-service\requirements.txt || goto :fail

echo.
echo === 4/5 Creating configuration files ===
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\make-env.ps1" || goto :fail

echo.
echo === 5/5 Downloading pretrained AI models (about 2.5 GB, first time only) ===
pushd ai-service
venv\Scripts\python download_models.py || (popd & goto :fail)
popd

echo.
echo ============================================================
echo  Setup complete.
echo  1. Put your Gmail address and App Password in server\.env
echo     (SMTP_USER, SMTP_PASS, ALERT_TO). See SETUP.md step 5.
echo  2. Make sure MongoDB is running.
echo  3. Double-click start.bat
echo ============================================================
pause
exit /b 0

:fail
echo.
echo [X] Setup failed at the step above. Fix the error shown and run setup.bat again.
pause
exit /b 1
