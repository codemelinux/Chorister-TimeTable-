@echo off
REM Chorister TimeTable - Start Script (Windows)
REM Developed by Benedict U.

if not exist ".venv" (
    echo Virtual environment not found. Run setup first:
    echo   scripts\setup.bat
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat

set HOST=%HOST%
if "%HOST%"=="" set HOST=127.0.0.1

set PORT=%PORT%
if "%PORT%"=="" set PORT=8000

echo === Chorister TimeTable ===
echo Starting server at http://%HOST%:%PORT%
echo Press Ctrl+C to stop.
echo.

python -m uvicorn main:app --host %HOST% --port %PORT% --reload
