@echo off
REM ============================================
REM AUTOMATIC MULTITENANCY TESTING SCRIPT (CMD)
REM ============================================
REM This batch file runs the PowerShell test script
REM ============================================

echo.
echo ============================================
echo MULTITENANCY AUTOMATIC TESTING
echo ============================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Check if PowerShell is available
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: PowerShell is not installed or not in PATH
    echo Please install PowerShell or use the curl-based test script
    pause
    exit /b 1
)

REM Check if the PowerShell script exists
if not exist "test-multitenancy-auto.ps1" (
    echo ERROR: test-multitenancy-auto.ps1 not found in current directory
    echo Current directory: %CD%
    echo.
    echo Please run this script from the project root directory (D:\UI_ITSM)
    pause
    exit /b 1
)

REM Run PowerShell script
echo Running multitenancy tests...
echo.

REM Check if credentials were provided
if "%1"=="" (
    REM No parameters - run with defaults
    powershell.exe -ExecutionPolicy Bypass -File "test-multitenancy-auto.ps1"
) else (
    REM Parameters provided - pass them through
    powershell.exe -ExecutionPolicy Bypass -File "test-multitenancy-auto.ps1" %*
)

echo.
echo ============================================
echo TEST COMPLETE
echo ============================================
pause

