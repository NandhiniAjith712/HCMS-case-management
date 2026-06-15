@echo off
title ITSM Backend Server - Auto-Start
color 0A

echo ========================================
echo    ITSM Backend Server Auto-Start
echo ========================================
echo.
echo Starting backend server in background...
echo.

cd /d "%~dp0"

:start_server
echo [%date% %time%] Starting server...
start "ITSM Backend Server" /min cmd /c "node server.js"

echo.
echo Server started in background!
echo.
echo To view server logs:
echo 1. Press Ctrl+Alt+Del
echo 2. Open Task Manager
echo 3. Find "ITSM Backend Server" process
echo 4. Right-click and select "Switch To"
echo.
echo To stop server:
echo 1. Find "ITSM Backend Server" in Task Manager
echo 2. Right-click and select "End Task"
echo.
echo Server will auto-restart if it crashes.
echo.
echo Press any key to restart server manually...
pause >nul

echo.
echo Restarting server...
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
goto start_server
