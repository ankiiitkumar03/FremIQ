@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m venv .venv
) else (
  python -m venv .venv
)
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
".venv\Scripts\python.exe" agent.py
pause
