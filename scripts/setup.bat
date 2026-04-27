@echo off
REM Chorister TimeTable - Setup Script (Windows)
REM Developed by Benedict U.

echo === Chorister TimeTable Setup ===

if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
) else (
    echo Virtual environment already exists.
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Installing dependencies...
pip install --upgrade pip -q
pip install -r requirements.txt

echo.
echo Setup complete! Run the app with:
echo   scripts\start.bat
pause
