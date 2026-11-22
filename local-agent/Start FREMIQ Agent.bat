@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto restart_agent
where py >nul 2>nul
if %errorlevel%==0 (
  set "FREMIQ_PYTHON=py -3"
) else (
  set "FREMIQ_PYTHON=python"
)
%FREMIQ_PYTHON% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
  echo Python 3.10 or newer is required. Install it with the Python launcher enabled, then run this file again.
  pause
  exit /b 1
)
%FREMIQ_PYTHON% -m venv .venv
if not exist ".venv\Scripts\python.exe" (
  echo Python 3 was not found. Install Python 3.10 or newer, then run this file again.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
  echo Could not install the Local Agent dependencies. Check your internet connection and try again.
  pause
  exit /b 1
)
:restart_agent
echo FREMIQ Local Agent is starting. Close this window to stop it.
".venv\Scripts\python.exe" agent.py
echo Agent stopped. Restarting in two seconds. Close this window to stop restarting.
timeout /t 2 /nobreak >nul
goto restart_agent
