@echo off
echo ========================================
echo    ITSM Backend Server Auto-Start
echo ========================================
echo.
echo Starting backend server...
echo.

cd /d "%~dp0"
node server.js

echo.
echo Server stopped. Press any key to exit...
pause >nul
