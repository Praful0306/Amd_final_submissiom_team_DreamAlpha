@echo off
echo ==============================================
echo       Sahayak AI Platform - Automated Setup
echo ==============================================
echo.

if not exist ".venv" (
    echo [1/3] Creating virtual environment...
    python -m venv .venv
)

echo [2/3] Activating virtual environment and installing dependencies...
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

echo.
echo [3/3] Starting the Sahayak AI server...
echo Go to http://localhost:8000 in your browser!
echo.
python -m uvicorn main:app --host 0.0.0.0 --port 8000
pause
