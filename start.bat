@echo off
REM Starts the AI service, Express API and React admin panel in three windows.
cd /d "%~dp0"

if not exist "ai-service\venv\Scripts\python.exe" (
  echo [!] Python venv missing. Run:  npm run setup
  pause
  exit /b 1
)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
if not exist "ai-service\.env" copy "ai-service\.env.example" "ai-service\.env" >nul
if not exist "client\.env" copy "client\.env.example" "client\.env" >nul

REM Local MongoDB check (skip the warning if you use MongoDB Atlas in MONGO_URI)
sc query MongoDB 2>nul | find "RUNNING" >nul || echo [!] Local MongoDB service is not running. Start it in services.msc, or use an Atlas MONGO_URI.

start "AI service :8000" cmd /k "cd /d %~dp0ai-service && venv\Scripts\python -m app.main"
start "API server :5000" cmd /k "cd /d %~dp0server && npm start"
start "Admin panel :5173" cmd /k "cd /d %~dp0client && npm run dev"

echo Waiting for the admin panel to come up...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173
